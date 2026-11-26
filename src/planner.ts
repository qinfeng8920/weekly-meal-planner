import {catalogVersion, food, foodMap, recipeList, recipeMap, serving, type Recipe, type Serving} from './catalog';
import {nutrition, sum, type Targets} from './nutrition';
import {dateKey, split, type Profile, type Weight} from './profile';
import {shopping, prepPlan, mealMinutes, type Day, type Pantry, type Purchase, type Prep} from './shopping';

export const algorithmVersion = '1.0.0';
export type Plan = {id:string; name:string; created:string; start:string; seed:string; targets:Targets; days:Day[];
  profile:Profile; weight:number; purchases:Purchase[]; prep:Prep; algorithmVersion:string; catalogVersion:string; favorite:boolean};
export type Lock = {day:number; meal:number; dish:number; serving:Serving};
type Change = {day:number; meal?:number; dish?:number};
const allowedFruit = new Set(['strawberry','kiwi','orange','peach','pear']);
const repeatable = (r:Recipe) => ['主食','水果','加餐'].includes(r.group);
const skillLevel = ['完全不会','简单做饭','熟练'];
export const monday = () => {
  const d = new Date(); d.setDate(d.getDate()-(d.getDay()+6)%7); return dateKey(d);
};
export const dayNutrition = (d:Day) => sum(d.meals.flatMap(m=>m.dishes.map(s=>s.nutrients)));
const dose = (rows:Serving[], condition:(id:string)=>boolean) => rows.reduce((a,r)=>a+r.ingredients.reduce((g,i)=>g+(condition(i.id)?i.grams:0),0),0);
export function fruitGoal(p:Profile) {
  if (p.fruit==='不吃水果') return 0;
  if (p.fruit==='自定义摄入量') {
    const amount = Number(p.fruitGrams);
    if (!Number.isFinite(amount) || amount<0 || amount>350 || !p.fruitGrams.trim()) throw Error('请填写 0～350 克的每日水果量。');
    return amount;
  }
  return 200;
}

function allowed(r:Recipe,p:Profile,blocked:string[],pantry:Pantry) {
  const exclusions = split(p.avoid).map(s=>s.toLowerCase());
  return !blocked.includes(r.id) && r.tools.every(t=>p.tools.includes(t)) &&
    r.prep+r.cook<=Number(p.minutes) && skillLevel.indexOf(r.skill)<=skillLevel.indexOf(p.skill) &&
    r.ingredients.every(({id})=>{
      const f = food(id);
      const names = [id,f.name,...f.aliases].map(n=>n.toLowerCase());
      return !f.allergens.some(a=>p.allergens.includes(a)) &&
        !exclusions.some(x=>names.some(n=>n===x || n.includes(x) || x.includes(n) && n.length>=2)) &&
        (p.frozen || f.state!=='frozen') &&
        !(f.category==='水果' && (fruitGoal(p)===0 || p.fruit==='优先低糖水果' && !allowedFruit.has(id))) &&
        !(f.category==='乳制品' && (['不吃乳制品','乳糖不耐受'].includes(p.dairy) || p.dairy==='减少牛奶' && id==='milk')) &&
        (!p.budget || pantry[id]?.price!==undefined);
    });
}

function seeded(seed: string) {
  let value = 2166136261;
  for (const c of seed) value = Math.imul(value ^ c.charCodeAt(0),16777619);
  return () => {
    value = (value+0x6D2B79F5)|0;
    let x = Math.imul(value ^ value>>>15,1|value);
    x ^= x + Math.imul(x ^ x>>>7,61|x);
    return ((x ^ x>>>14)>>>0)/4294967296;
  };
}

function limits(p:Profile,t:Targets,day:Day) {
  const total = dayNutrition(day);
  const dishes = day.meals.flatMap(m=>m.dishes);
  const fruit = dose(dishes,id=>food(id).category==='水果');
  const veg = dose(dishes,id=>food(id).category==='蔬菜');
  const grams = fruitGoal(p);
  const proteinMax = t.kcal*.35/4;
  const sodium = total.sodium;
  const caloriesOK = total.kcal >= (p.sex==='男' ? 1500 : 1200) && Math.abs(total.kcal-t.kcal)<=t.kcal*.05;
  const valid = caloriesOK && total.protein>=t.protein && total.protein<=proteinMax &&
    total.fat*9>=total.kcal*.2 && total.fat*9<=total.kcal*.35 && total.carbs*4>=total.kcal*.45 &&
    total.fiber>=t.fiber && sodium!==null && sodium<=2000 && veg>=300 &&
    (grams === 0 ? fruit === 0 : Math.abs(fruit-grams)<=Math.min(25,grams*.18));
  const timeOK = day.meals.every(m=>mealMinutes(m)<=Number(p.minutes));
  const messages = [];
  if (!caloriesOK) messages.push('热量');
  if (total.protein<t.protein || total.protein>proteinMax) messages.push('蛋白质');
  if (total.fat*9<total.kcal*.2 || total.fat*9>total.kcal*.35) messages.push('脂肪');
  if (total.carbs*4<total.kcal*.45) messages.push('碳水');
  if (total.fiber<t.fiber) messages.push('纤维');
  if (sodium===null || sodium>2000) messages.push('钠');
  if (veg<300) messages.push('蔬菜');
  if (grams===0 ? fruit!==0 : Math.abs(fruit-grams)>Math.min(25,grams*.18)) messages.push('水果份量');
  if (!timeOK) messages.push('每餐用时');
  return {valid: valid&&timeOK,messages};
}

function verifyInput(p:Profile) {
  if (!Number.isInteger(+p.people) || +p.people<1 || +p.people>12) throw Error('用餐人数请填写 1～12 的整数。');
  if (p.budget && (!Number.isFinite(+p.budget) || +p.budget<=0)) throw Error('请填写有效预算，或将预算留空。');
  if (!['2','3','4'].includes(p.meals) || !['1','2'].includes(p.trips) || ![10,20,40,120].includes(+p.minutes)) throw Error('请检查餐次、采购频率与制作时间设置。');
  if (p.lunchPlace!=='在家' && !p.packed && p.meals!=='2') throw Error('食堂或外卖的营养和过敏信息无法验证。可启用自带便当，或将计划调整为在家用餐。');
  if (p.allergens.some(a=>!a.trim())) throw Error('请检查过敏选项。');
  const known = [...foodMap.values()].flatMap(f=>[f.name,...f.aliases]);
  const unsupported = split(p.avoid).filter(x=>!known.some(n=>n.includes(x) || x.includes(n)));
  if (unsupported.length) throw Error('食材库无法核对这些忌口：'+unsupported.join('、')+'。请先咨询专业人员或确认准确的食材名称。');
  fruitGoal(p);
}

function checkStructure(days:Day[], p:Profile, t:Targets, blocked:string[], pantry:Pantry) {
  if (days.length!==7) throw Error('方案需要完整七天。');
  const used = new Set<string>();
  const expectedMeals = Number(p.meals);
  days.forEach((day,index)=>{
    if (day.meals.length!==expectedMeals) throw Error('方案餐次数与当前设置不同。');
    const rows = day.meals.flatMap(m=>m.dishes);
    for (const row of rows) {
      const current = recipeMap.get(row.recipe.id);
      if (!current || JSON.stringify(current)!==JSON.stringify(row.recipe) ||
          row.ingredients.length!==current.ingredients.length ||
          row.ingredients.some((i,index)=>{
            const base = current.ingredients[index];
            return i.id!==base.id || i.grams<base.grams*current.min-.011 || i.grams>base.grams*current.max+.011;
          }) || JSON.stringify(serving(current,1,row.ingredients).nutrients)!==JSON.stringify(row.nutrients)) {
        throw Error('方案包含无法核验的食材、份量或营养数据。');
      }
    }
    if (rows.some(s=>!allowed(s.recipe,p,blocked,pantry))) throw Error('第 '+(index+1)+' 天存在受限食材、菜品或设备。');
    const flags = limits(p,t,day);
    if (!flags.valid) throw Error('第 '+(index+1)+' 天需要调整：'+flags.messages.join('、')+'。');
    for (const s of rows) {
      const id = s.recipe.id;
      if (!p.repeats && !repeatable(s.recipe) && p.fixedBreakfast!==id && used.has(id)) throw Error('方案存在重复菜品。');
      if (s.recipe.group!=='水果') used.add(id);
    }
    if (p.fixedBreakfast && !day.meals[0].dishes.some(s=>s.recipe.id===p.fixedBreakfast)) throw Error('固定早餐缺失。');
  });
  if (p.requiredDish && !used.has(p.requiredDish) && !days.some(d=>d.meals.some(m=>m.dishes.some(s=>s.recipe.id===p.requiredDish)))) throw Error('方案未包含指定菜品。');
  if (new Set(days.flatMap(d=>d.meals.flatMap(m=>m.dishes.flatMap(s=>s.ingredients.filter(i=>food(i.id).category==='蔬菜'||food(i.id).category==='水果').map(i=>i.id))))).size<10) throw Error('一周果蔬种类不足 10 种。');
  const purchases = shopping(days,p,pantry);
  if (p.budget && (purchases.some(s=>s.cost===null) || purchases.reduce((n,s)=>n+(s.cost??0),0)>+p.budget)) throw Error('采购费用无法核验，或超过预算。请提供对应称量状态的价格、核对包装及库存，或主动调整预算。');
  return purchases;
}

export function regenerate(p:Profile, records:Weight[], pantry:Pantry, blocked:string[], seed:string, old?:Plan, locks:Lock[] = [], change?:Change):Plan {
  const t = nutrition(p,records);
  verifyInput(p);
  const random = seeded(seed);
  const pool = recipeList.filter(r=>allowed(r,p,blocked,pantry));
  const ids = (groups:string[])=>pool.filter(r=>groups.includes(r.group));
  const proteins = ids(['蛋白质菜','汤类']), grains=ids(['主食']), vegetables=ids(['蔬菜']), fruits=ids(['水果']), snack=ids(['加餐']);
  const breakfast = ids(['主食','早餐']);
  const fixed = pool.find(r=>r.id===p.fixedBreakfast);
  const must = pool.find(r=>r.id===p.requiredDish);
  if (p.fixedBreakfast && !fixed || p.requiredDish && !must) throw Error('固定早餐或指定菜品与当前限制冲突。');
  if (!proteins.length || !grains.length || !vegetables.length || fruitGoal(p)>0 && !fruits.length) {
    throw Error('筛选后蛋白质、蔬菜、主食或水果菜谱不足。请检查厨具、用时、预算价格或筛选项。');
  }

  const favors = [...p.protein,...p.starch,...p.vegetables,...p.fruits,...p.nuts,...p.seasonings,...split(p.preferred)];
  const preferred = new Map(pool.map(r=>{
    const score = .8 + (p.cuisines.includes(r.cuisine) ? .6 : 0) +
      (r.ingredients.some(i=>{ const f=food(i.id); return [f.name,...f.aliases].some(n=>favors.includes(n)); }) ? .75 : 0);
    return [r.id,score];
  }));
  const used = new Map<string,number>();
  const days:Day[] = [];
  if (change && old) old.days.forEach((d,i)=>{
    if (i!==change.day) for (const s of d.meals.flatMap(m=>m.dishes)) used.set(s.recipe.id,(used.get(s.recipe.id)??0)+1);
  });
  const addUse = (d:Day) => d.meals.flatMap(m=>m.dishes).forEach(s=>used.set(s.recipe.id,(used.get(s.recipe.id)??0)+1));
  const lastRequired = old && change && old.days.some((d,i)=>i!==change.day && d.meals.some(m=>m.dishes.some(s=>s.recipe.id===p.requiredDish)));
  for (let d=0;d<7;d++) {
    const reasons = new Map<string,number>();
    if (change && old && d!==change.day) {days.push(old.days[d]); continue;}
    let winner:Day|undefined;
    let best = Infinity;
    const attempts = p.repeats ? 2200 : 3000;
    let qualified = 0;
    for (let attempt=0;attempt<attempts && qualified<12;attempt++) {
      const chosen = new Set<string>();
      const choose = (list:Recipe[], previous?:Serving, force?:Recipe) => {
        if (force) {
          if (!p.repeats && !repeatable(force) && force.id!==p.fixedBreakfast && (used.has(force.id)||chosen.has(force.id))) return;
          chosen.add(force.id);
          return force;
        }
        const candidates = list.filter(r=>r.id!==previous?.recipe.id && (p.repeats || r.id===p.fixedBreakfast || repeatable(r) || (!used.has(r.id) && !chosen.has(r.id))));
        if (!candidates.length) return;
        let points = -1;
        let result = candidates[0];
        for (const r of candidates) {
          const count = (used.get(r.id)??0)+(chosen.has(r.id)?2:0);
          const score = random()*(preferred.get(r.id)??1)/(1+count*(p.waste?.12:.34));
          if (score>points) {points=score; result=r;}
        }
        chosen.add(result.id);
        return result;
      };
      const names = p.meals==='2' ? ['早午餐','晚餐'] : p.meals==='4' ? ['早餐','午餐','晚餐','加餐'] : ['早餐','午餐','晚餐'];
      const template:Recipe[][][] = names.map((name,i)=>{
        if (name==='加餐') return [[...snack,...grains.filter(r=>!r.tools.length)]];
        if (name==='早餐') return [[...breakfast],proteins];
        if (i===names.length-1 || i===2) return fruitGoal(p)>0 ? [proteins,grains,vegetables,fruits] : [proteins,grains,vegetables];
        return [i===0?breakfast:proteins,i===0?proteins:grains,vegetables];
      });
      if (must && !lastRequired && !used.has(must.id) && d===(change?.day??0)) {
        const slots=template.flatMap((l,mi)=>l.flatMap((recipes,di)=>recipes.some(r=>r.id===must.id) && !(fixed && mi===0 && di===0)?[{mi,di}]:[]));
        const slot = slots[Math.floor(random()*slots.length)];
        if (!slot) throw Error('特定餐次无法放入指定菜品。');
        template[slot.mi][slot.di] = [must];
      }
      const frozen = new Set<Serving>();
      const day:Day = {meals:template.map((list,mi)=>({name:names[mi],dishes:list.flatMap((recipes,di)=>{
        const previous = old?.days[d]?.meals[mi]?.dishes[di];
        const lock = locks.find(l=>l.day===d&&l.meal===mi&&l.dish===di);
        const retained = lock?.serving ?? (change && (change.meal!==undefined && (mi!==change.meal || change.dish!==undefined && di!==change.dish)) ? previous : undefined);
        if (retained) {chosen.add(retained.recipe.id); frozen.add(retained); return [retained];}
        const recipe = choose(recipes,change?previous:undefined,mi===0&&di===0?fixed:recipes.length===1?recipes[0]:undefined);
        if (!recipe) return [];
        if (recipe.group==='水果') return [serving(recipe)];
        const energyRatio = Math.max(.72, t.kcal/1750);
        const factor = recipe.group==='主食' || recipe.group==='早餐'
          ? energyRatio*(.84+random()*.62)
          : recipe.group==='蔬菜' ? .9+random()*.42 : Math.min(1.12,energyRatio)*(.84+random()*.52);
        return [serving(recipe,Math.min(recipe.max,Math.max(recipe.min,factor)))];
      })}))};
      if (day.meals.some((m,i)=>m.dishes.length!==template[i].length)) continue;
      if (must && !lastRequired && !used.has(must.id) && d===(change?.day??0) && !chosen.has(must.id)) continue;
      if (change && old && JSON.stringify(day.meals.map(m=>m.dishes.map(s=>s.recipe.id)))===JSON.stringify(old.days[d].meals.map(m=>m.dishes.map(s=>s.recipe.id)))) continue;

      const items = day.meals.flatMap(m=>m.dishes);
      const fruitDish = items.find(s=>s.recipe.group==='水果' && !frozen.has(s));
      function placeFruit() {
        if (!fruitDish) return;
        const remainder = fruitGoal(p)-dose(items.filter(s=>s!==fruitDish),id=>food(id).category==='水果');
        Object.assign(fruitDish,serving(fruitDish.recipe,Math.max(fruitDish.recipe.min,Math.min(fruitDish.recipe.max,remainder/200))));
      }
      placeFruit();
      const adjustable = items.filter(s=>!frozen.has(s) && s.recipe.group!=='水果');
      for (let round=0;round<3;round++) {
        const total = dayNutrition(day);
        const residual = Math.max(t.kcal,(p.sex==='男'?1500:1200)+8)-total.kcal;
        const starches = adjustable.filter(s=>['主食','早餐'].includes(s.recipe.group));
        const group = starches.length?starches:adjustable;
        const groupEnergy = sum(group.map(s=>s.nutrients)).kcal;
        if (!groupEnergy || Math.abs(residual)<8) break;
        for (const s of group) {
          const oldFactor=s.ingredients[0].grams/s.recipe.ingredients[0].grams;
          Object.assign(s,serving(s.recipe,Math.max(s.recipe.min,Math.min(s.recipe.max,oldFactor*(1+residual/groupEnergy)))));
        }
        placeFruit();
      }

      const metrics=limits(p,t,day);
      if (!metrics.valid) {
        for (const label of metrics.messages) reasons.set(label,(reasons.get(label)??0)+1);
        continue;
      }
      const dailyCost = p.budget ? shopping([day],p,pantry).reduce((n,r)=>n+(r.cost??Infinity),0) : 0;
      if (!Number.isFinite(dailyCost)) continue;
      qualified++;
      const n = dayNutrition(day);
      const previous = days[d-1]?.meals.flatMap(m=>m.dishes.map(s=>s.recipe.id)) ?? [];
      const repeat = items.reduce((a,s)=>a+(previous.includes(s.recipe.id)&&s.recipe.id!==p.fixedBreakfast?1:0),0);
      const score = Math.abs(n.kcal-t.kcal)/t.kcal + Math.abs(n.fat-t.fat)/t.fat*.06 +
        repeat*.035 + (p.budget?dailyCost/(+p.budget)*.35:0) - items.reduce((a,s)=>a+(preferred.get(s.recipe.id)??1),0)*.002;
      if (score<best) {best=score; winner=day;}
    }
    if (!winner) {
      const frequent=[...reasons].sort((a,b)=>b[1]-a[1]).slice(0,3).map(([label])=>label).join('、');
      throw Error(`第 ${d+1} 天在限定次数内找不到合格组合。${frequent?'主要冲突：'+frequent+'。':''}可增加可用厨具或制作时间，检查预算，或主动允许重复组合。`);
    }
    days.push(winner);
    addUse(winner);
  }
  const start=old&&change?old.start:monday();
  return {id:old&&change?old.id:crypto.randomUUID(),name:old&&change?old.name:'本周食谱',created:new Date().toISOString(),start,seed,
    targets:t,days,profile:structuredClone(p),weight:[...records].sort((a,b)=>b.date.localeCompare(a.date))[0]?.kg??Number(p.weight),
    purchases:checkStructure(days,p,t,blocked,pantry),prep:prepPlan(days,p,start),algorithmVersion,catalogVersion,favorite:old?.favorite??false};
}

export function revise(plan:Plan, p:Profile, records:Weight[], pantry:Pantry, blocked:string[], day:number, meal:number,dish:number, grams:number[]) {
  const t=nutrition(p,records);
  verifyInput(p);
  const days=structuredClone(plan.days);
  const original = days[day].meals[meal].dishes[dish];
  const current = recipeMap.get(original.recipe.id);
  if (!current || current.ingredients.length!==grams.length || original.ingredients.some((i,index)=>i.id!==current.ingredients[index].id)) throw Error('此旧版菜谱目前无法调整。');
  const quantities=current.ingredients.map((i,index)=>{
    const quantity=grams[index];
    if (!Number.isFinite(quantity) || quantity<i.grams*current.min-.01 || quantity>i.grams*current.max+.01) throw Error('输入克数超出该食材的份量范围。');
    return {...i,grams:quantity};
  });
  days[day].meals[meal].dishes[dish]=serving(current,1,quantities);
  return {...plan,days,targets:t,weight:[...records].sort((a,b)=>b.date.localeCompare(a.date))[0]?.kg??Number(p.weight),profile:structuredClone(p),purchases:checkStructure(days,p,t,blocked,pantry),prep:prepPlan(days,p,plan.start)};
}

export function verifyAgainst(plan:Plan,p:Profile,records:Weight[],pantry:Pantry,blocked:string[]) {
  verifyInput(p);
  if (plan.catalogVersion!==catalogVersion || plan.algorithmVersion!==algorithmVersion) throw Error('历史方案采用其他版本，请重新生成。');
  checkStructure(plan.days,p,nutrition(p,records),blocked,pantry);
}
