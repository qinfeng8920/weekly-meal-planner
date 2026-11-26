import {catalogVersion, food, foodMap, recipeList, recipeMap, serving, type Recipe, type Serving} from './catalog';
import {nutrition, sum, type Targets} from './nutrition';
import {dateKey, mealPreference, split, type MealName, type Profile, type Weight} from './profile';
import {shopping, prepPlan, mealMinutes, type Day, type Meal, type Pantry, type Purchase, type Prep} from './shopping';

import {breakfastMenus, labels, pairingOk, type Slot} from './meal-catalog';
import {fruitMeal, mealNames, mealShape, mealShares, namedIngredients, recipeFitsMeal, repeatIsLimited} from './meal-rules';
import {calciumCeiling,nutrientPenalty} from './diet-check';

export const algorithmVersion = '1.1.0';
export type Plan = {id:string; name:string; created:string; start:string; seed:string; targets:Targets; days:Day[];
  profile:Profile; weight:number; purchases:Purchase[]; prep:Prep; algorithmVersion:string; catalogVersion:string; favorite:boolean};
export type Lock = {day:number; meal:number; dish:number; serving:Serving};
type Change = {day:number; meal?:number; dish?:number};
const allowedFruit = new Set(['strawberry','kiwi','orange','peach','pear']);
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
    skillLevel.indexOf(r.skill)<=skillLevel.indexOf(p.skill) &&
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
  const calciumOK=total.calcium===null||total.calcium<=calciumCeiling;
  const valid = caloriesOK && calciumOK && total.protein>=t.protein && total.protein<=proteinMax &&
    total.fat*9>=total.kcal*.2 && total.fat*9<=total.kcal*.35 && total.carbs*4>=total.kcal*.45 &&
    total.fiber>=t.fiber && sodium!==null && sodium<=2000 && veg>=300 &&
    (grams === 0 ? fruit === 0 : Math.abs(fruit-grams)<=Math.min(25,grams*.18));
  const names=mealNames(p);
  const shares=mealShares(p);
  const timeOK = day.meals.every((m,i)=>mealMinutes(m)<=+mealPreference(p,names[i]).minutes);
  const distributionOK = day.meals.every((m,i)=>{
    const share=sum(m.dishes.map(s=>s.nutrients)).kcal/total.kcal;
    return Math.abs(share-shares[i])<=(names[i]==='加餐'?.045:.085);
  });
  const messages = [];
  if (!caloriesOK) messages.push('热量');
  if (total.protein<t.protein || total.protein>proteinMax) messages.push('蛋白质');
  if (total.fat*9<total.kcal*.2 || total.fat*9>total.kcal*.35) messages.push('脂肪');
  if (total.carbs*4<total.kcal*.45) messages.push('碳水');
  if (total.fiber<t.fiber) messages.push('纤维');
  if (sodium===null || sodium>2000) messages.push('钠');
  if (!calciumOK) messages.push('钙超过参考上限');
  if (veg<300) messages.push('蔬菜');
  if (grams===0 ? fruit!==0 : Math.abs(fruit-grams)>Math.min(25,grams*.18)) messages.push('水果份量');
  if (!timeOK) messages.push('每餐用时');
  if (!distributionOK) messages.push('分餐热量');
  return {valid: valid&&timeOK&&distributionOK,messages};
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
  if (mealNames(p).some(name=>![5,10,15,20,30,40,60,120].includes(+mealPreference(p,name).minutes))) throw Error('请检查各餐制作时间。');
}

function checkStructure(days:Day[], p:Profile, t:Targets, blocked:string[], pantry:Pantry) {
  if (days.length!==7) throw Error('方案需要完整七天。');
  const used = new Set<string>();
  const seenByMeal = new Set<string>();
  const names=mealNames(p);
  const fixed = fixedIds(p);
  const fixedMenu=breakfastMenus.some(menu=>menu.id===p.fixedBreakfast);
  const fixedPatterns=new Map<string,string>();
  const hasFruit=fruitGoal(p)>0;
  days.forEach((day,index)=>{
    if (day.meals.length!==names.length) throw Error('方案餐次数与当前设置不同。');
    for (const [i,meal] of day.meals.entries()) {
      const name=names[i], prefs=mealPreference(p,name);
      if (!mealShape(p,meal,name,hasFruit&&fruitMeal(p)===name)) throw Error(name+'菜谱、份量结构或用时不符合当前设置。');
      const pattern=meal.dishes.filter(s=>labels(s.recipe).slot!=='水果').map(s=>s.recipe.id).join(',');
      if (prefs.fixed) {
        if (fixedPatterns.has(name) && fixedPatterns.get(name)!==pattern) throw Error(name+'已设置固定搭配。');
        fixedPatterns.set(name,pattern);
      }
      if (name==='早餐' && (fixed.some((id,position)=>meal.dishes[position]?.recipe.id!==id)||
        fixedMenu&&meal.dishes.filter(s=>labels(s.recipe).slot!=='水果').length!==fixed.length)) throw Error('固定早餐缺失。');
      for (const {recipe} of meal.dishes) {
        const key=name+':'+recipe.id;
        if (!prefs.fixed && !(name==='早餐'&&fixed.includes(recipe.id)) && repeatIsLimited(p,name,recipe) && seenByMeal.has(key)) throw Error(name+'存在重复菜品。');
        seenByMeal.add(key);
      }
    }
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
    for (const s of rows) used.add(s.recipe.id);
  });
  if (p.requiredDish && !used.has(p.requiredDish)) throw Error('方案未包含指定菜品。');
  if (new Set(days.flatMap(d=>d.meals.flatMap(m=>m.dishes.flatMap(s=>s.ingredients.filter(i=>food(i.id).category==='蔬菜'||food(i.id).category==='水果').map(i=>i.id))))).size<10) throw Error('一周果蔬种类不足 10 种。');
  const purchases = shopping(days,p,pantry);
  if (p.budget && (purchases.some(s=>s.cost===null) || purchases.reduce((n,s)=>n+(s.cost??0),0)>+p.budget)) throw Error('采购费用无法核验，或超过预算。请提供对应称量状态的价格、核对包装及库存，或主动调整预算。');
  return purchases;
}

function fixedIds(p:Profile) {
  if (!p.fixedBreakfast) return [];
  const menu=breakfastMenus.find(m=>m.id===p.fixedBreakfast);
  const legacy:Record<string,string>={'grain-oats':'quick-oats','grain-sweet':'quick-sweet','grain-corn':'quick-corn','grain-brown':'quick-oat-millet'};
  return menu?.recipes??[legacy[p.fixedBreakfast]??p.fixedBreakfast];
}

type Candidate = {r:Recipe; weight:number};
type Selected = {candidate:Candidate; value:Serving; retained:boolean};
const totalCalories=(meal:Selected[])=>meal.reduce((n,s)=>n+s.value.nutrients.kcal,0);

export function regenerate(p:Profile, records:Weight[], pantry:Pantry, blocked:string[], seed:string, old?:Plan, locks:Lock[] = [], change?:Change):Plan {
  const t=nutrition(p,records);
  verifyInput(p);
  if(change?.meal!==undefined) {
    const name=mealNames(p)[change.meal];
    const replaced=change.dish===undefined?undefined:old?.days[change.day]?.meals[change.meal]?.dishes[change.dish];
    if((mealPreference(p,name).fixed&&(!replaced||labels(replaced.recipe).slot!=='水果'))||
      name==='早餐'&&change.dish!==undefined&&change.dish<fixedIds(p).length) throw Error('这个餐次已固定。可先修改生成设置再调整。');
  }
  if(change && (!old || old.algorithmVersion!==algorithmVersion || old.catalogVersion!==catalogVersion)) throw Error('这份旧版食谱需重新生成后再调整。');
  const random=seeded(seed), names=mealNames(p), shares=mealShares(p), fruits=fruitGoal(p), fixed=fixedIds(p);
  const pool=recipeList.filter(r=>allowed(r,p,blocked,pantry));
  const byId=new Map(pool.map(r=>[r.id,r]));
  const perMeal=names.map(name=>{
    const pref=mealPreference(p,name);
    const likes=[...p.protein,...p.starch,...p.vegetables,...p.fruits,...p.nuts,...p.seasonings,...split(p.preferred),...split(pref.likes)];
    return (['主食','蛋白质','蔬菜','清汤','加餐','水果'] as Slot[]).reduce((groups,slot)=>{
      groups[slot]=pool.filter(r=>recipeFitsMeal(r,p,name,slot)).map(r=>({
        r,weight:1+(pref.cuisines.includes(r.cuisine)?1.1:p.cuisines.includes(r.cuisine)?.35:0)
          +(namedIngredients(r,likes)?.66:0)+(pref.prep&&p.tools.includes('冰箱')&&r.batch?.24:0)
          + (r.prep+r.cook<=8?.3:0),
      }));
      return groups;
    },{} as Record<Slot,Candidate[]>);
  });
  const must=p.requiredDish?byId.get(p.requiredDish):undefined;
  const breakfastIndex=names.indexOf('早餐');
  const fixedMenu=breakfastMenus.some(menu=>menu.id===p.fixedBreakfast);
  if (fixed.length&&breakfastIndex>=0&&fixed.some(id=>!Object.values(perMeal[breakfastIndex]).flat().some(c=>c.r.id===id))) {
    throw Error('固定早餐与当前用时、厨具或忌口冲突。请在食谱设置更换固定早餐。');
  }
  if (p.requiredDish&&(!must||!perMeal.some(group=>Object.values(group).flat().some(c=>c.r.id===must.id)))) throw Error('指定菜品与当前餐次或限制冲突。');
  for (const [i,name] of names.entries()) {
    const group=perMeal[i];
    const required:Slot[]=name==='早餐'?['主食','蛋白质']:name==='加餐'?(fruits?['水果']:['加餐']):['主食','蛋白质','蔬菜'];
    const missing=required.filter(role=>!group[role].length);
    if (missing.length) throw Error(name+'候选不足：'+missing.join('、')+'。请检查该餐的用时、厨具、忌口或预算单价。');
  }

  const days:Day[]=[];
  const seen=new Set<string>();
  const produceSeen=new Set<string>();
  const use=new Map<string,number>();
  const mark=(d:Day)=>d.meals.forEach(m=>m.dishes.forEach(({recipe:r})=>{
    seen.add(m.name+':'+r.id);use.set(r.id,(use.get(r.id)??0)+1);
    for(const i of r.ingredients) if(['水果','蔬菜'].includes(food(i.id).category)) produceSeen.add(i.id);
  }));
  const hasMust=(d:Day)=>d.meals.some(m=>m.dishes.some(s=>s.recipe.id===must?.id));
  if (change && old) old.days.forEach((d,i)=>{if(i!==change.day)mark(d);});
  const fixedSource=change&&old?old.days.find((_,i)=>i!==change.day):undefined;
  const requiredElsewhere=Boolean(change&&old?.days.some((d,i)=>i!==change.day&&hasMust(d)));
  const templates=(name:MealName,i:number,fixedMeal?:Meal):Slot[][]=>{
    if(fixedMeal) return [fixedMeal.dishes.map(d=>labels(d.recipe).slot)];
    const tail:Slot[]=fruits&&fruitMeal(p)===name?['水果']:[];
    if(name==='早餐') return [['主食','蛋白质',...tail],['主食','蛋白质','加餐',...tail]];
    if(name==='加餐') return perMeal[i]['加餐'].length&&fruits?[['水果','加餐'],['水果']]:[[...tail,...(fruits?[]:['加餐'] as Slot[])]];
    if(name==='晚餐') return [['主食','蛋白质','蔬菜'],['主食','蛋白质','清汤']];
    return [['主食','蛋白质','蔬菜',...tail],['主食','蛋白质','蔬菜','清汤',...tail]];
  };
  const pick=(candidates:Candidate[])=>{
    const weights=candidates.map(c=>c.weight/(1+(use.get(c.r.id)??0)*(p.waste?.12:.27)));
    let value=random()*weights.reduce((a,b)=>a+b,0);
    return candidates.find((_,i)=>(value-=weights[i])<=0)??candidates.at(-1);
  };
  function resize(row:Selected,factor:number) {
    if (row.retained) return;
    const {r}=row.candidate;
    row.value=serving(r,Math.min(r.max,Math.max(r.min,factor)));
  }
  const select=(c:Candidate,retained?:Serving):Selected=>({candidate:c,retained:Boolean(retained),value:retained??serving(c.r)});
  function factor(row:Selected) {return row.value.ingredients[0].grams/row.candidate.r.ingredients[0].grams;}

  for (let d=0;d<7;d++) {
    if(change&&old&&d!==change.day) {days.push(old.days[d]);continue;}
    const previous=old?.days[d];
    const reasons=new Map<string,number>();
    const requireNow=must&&!requiredElsewhere&&!days.some(hasMust)&&(change||d===0);
    let winner:Day|undefined, best=Infinity,qualified=0;
    for(let attempt=0;attempt<2400&&qualified<12;attempt++) {
      const active:{name:MealName;rows:Selected[]}[]=[];
      const usedToday=new Set<string>();
      const mustSlot= requireNow ? names.map((name,i)=>({i,name})).filter(({i,name})=>
        (!change||change.meal===undefined||change.meal===i)&&(!mealPreference(p,name).fixed||!fixedSource)&&
        perMeal[i][labels(must).slot].some(c=>c.r.id===must.id)) : [];
      const forcedMeal=mustSlot.length?mustSlot[Math.floor(random()*mustSlot.length)].i:-1;
      for(const [i,name] of names.entries()) {
        const prefs=mealPreference(p,name);
        const former=previous?.meals[i];
        const targetChange=Boolean(change&&(change.meal===undefined||change.meal===i));
        const fixedMeal=prefs.fixed?(fixedSource??days[0])?.meals[i]:undefined;
        const locksHere=locks.filter(l=>l.day===d&&l.meal===i);
        const slotsByTemplate=templates(name,i,fixedMeal);
        let shapes=slotsByTemplate.filter(slots=>slots.every(role=>perMeal[i][role].length));
        if (name==='早餐'&&fixedMenu) shapes=shapes.filter(slots=>slots.includes('加餐')===(fixed.length===3));
        if(former&&change&&(!targetChange||change.dish!==undefined)||former&&locksHere.length) {
          shapes=[former!.dishes.map(s=>labels(s.recipe).slot)];
        }
        if(locksHere.length&&!former) shapes=shapes.filter(slots=>locksHere.every(l=>slots[l.dish]===labels(l.serving.recipe).slot));
        if (i===forcedMeal) shapes=shapes.filter(slots=>slots.includes(labels(must!).slot));
        const shape=shapes[Math.floor(random()*shapes.length)];
        if(!shape) break;
        let curated:string[]|undefined;
        if(name==='早餐'&&(!change||change.dish===undefined)&&!fixedMeal&&!locksHere.length) {
          const eligible=breakfastMenus.filter(menu=>menu.recipes.every((id,j)=>perMeal[i][shape[j]]?.some(c=>c.r.id===id))
            && shape.includes('加餐')===(menu.recipes.length===3) && fixed.every((id,j)=>menu.recipes[j]===id)
            && menu.recipes.every(id=>!seen.has(name+':'+id)||!repeatIsLimited(p,name,byId.get(id)!)||fixed.includes(id)||prefs.fixed)
            && (i!==forcedMeal||!must||labels(must).slot==='水果'||menu.recipes.includes(must.id)));
          if (eligible.length&&random()<.65) curated=eligible[Math.floor(random()*eligible.length)].recipes;
        }
        const rows:Selected[]=[];
        for(const [j,slot] of shape.entries()) {
          const prior=former?.dishes[j];
          const lock=locksHere.find(l=>l.dish===j);
          const retained=lock?.serving??(change&&(!targetChange||change.dish!==undefined&&change.dish!==j)?prior:undefined);
          const force=fixedMeal&&slot!=='水果'?fixedMeal.dishes[j]?.recipe.id:
            name==='早餐'&&fixed[j]&&slot!=='水果'?fixed[j]:
            i===forcedMeal&&must&&slot===labels(must).slot?must.id:curated?.[j];
          const valid=perMeal[i][slot].filter(c=>(!force||force===c.r.id)
            && (!targetChange||change?.dish!==j||c.r.id!==prior?.recipe.id)
            && (!change||change.dish!==undefined||prior?.recipe.id!==c.r.id||random()<.75)
            && (!repeatIsLimited(p,name,c.r)||c.r.id===force&&(prefs.fixed||fixed.includes(force))||!seen.has(name+':'+c.r.id))
            && !usedToday.has(c.r.id)
            && (rows.reduce((a,b)=>a+b.candidate.r.prep,0)+c.r.prep<=+prefs.minutes));
          const c=retained?perMeal[i][slot].find(c=>c.r.id===retained.recipe.id):pick(valid);
          if(!c) break;
          rows.push(select(c,retained));
          usedToday.add(c.r.id);
        }
        if(rows.length!==shape.length || !pairingOk(rows.map(r=>r.candidate.r))) break;
        if(mealMinutes({name,dishes:rows.map(r=>r.value)})>+prefs.minutes) {
          reasons.set(name+'用时',(reasons.get(name+'用时')??0)+1);break;
        }
        active.push({name,rows});
      }
      if(active.length!==names.length || requireNow&&!usedToday.has(must.id)) continue;
      const all=active.flatMap(m=>m.rows);
      const firstFruit=all.find(r=>labels(r.candidate.r).slot==='水果');
      const scaleFruit=()=>{
        if(!firstFruit||firstFruit.retained) return;
        const remaining=fruits-dose(all.filter(r=>r!==firstFruit).map(r=>r.value),id=>food(id).category==='水果');
        resize(firstFruit,remaining/firstFruit.candidate.r.ingredients[0].grams);
      };
      for(const row of all) {
        const slot=labels(row.candidate.r).slot;
        if(slot==='水果') continue;
        const energyScale=Math.max(.72,Math.min(1.35,t.kcal/1750));
        const r=row.candidate.r;
        resize(row,change?.dish!==undefined?r.min+random()*(r.max-r.min):slot==='蔬菜'||slot==='清汤'?1.0+random()*.45:energyScale*(.84+random()*.55));
      }
      scaleFruit();
      const target=Math.max(t.kcal,(p.sex==='男'?1500:1200)+8);
      // 优先调主食份量，再调蛋白或加餐；加餐水果克数独立规划。
      for(let round=0;round<(change?.dish===undefined?3:0);round++) {
        for(const [i,meal] of active.entries()) {
          const desired=target*shares[i];
          const adjust=meal.rows.filter(row=>!row.retained&&labels(row.candidate.r).slot!=='水果'&&
            (labels(row.candidate.r).slot==='主食'||meal.name==='加餐'||round>0&&['蛋白质','加餐'].includes(labels(row.candidate.r).slot)));
          const energy=adjust.reduce((n,row)=>n+row.value.nutrients.kcal,0);
          const delta=desired-totalCalories(meal.rows);
          if(energy&&Math.abs(delta)>4) for(const row of adjust) resize(row,factor(row)*(1+delta/energy));
        }
        scaleFruit();
      }
      const day:Day={meals:active.map(m=>({name:m.name,dishes:m.rows.map(r=>r.value)}))};
      if(change&&previous&&day.meals.every((m,i)=>m.dishes.map(s=>s.recipe.id).join()===previous.meals[i].dishes.map(s=>s.recipe.id).join())) continue;
      const metrics=limits(p,t,day);
      if(!metrics.valid) {
        for(const key of metrics.messages) reasons.set(key,(reasons.get(key)??0)+1);
        continue;
      }
      const n=dayNutrition(day);
      const cost=p.budget?shopping([day],p,pantry).reduce((a,b)=>a+(b.cost??Infinity),0):0;
      if (!Number.isFinite(cost)) continue;
      let spread=0, convenience=0, clashes=0;
      for(const [i,meal] of active.entries()) {
        spread+=Math.abs(totalCalories(meal.rows)/n.kcal-shares[i]);
        convenience+=mealMinutes(day.meals[i])/(i===0?55:210);
        const cuisines=new Set(meal.rows.filter(r=>labels(r.candidate.r).slot==='蛋白质'||labels(r.candidate.r).slot==='蔬菜').map(r=>r.candidate.r.cuisine));
        const strong=meal.rows.filter(r=>!['清淡',''].includes(r.candidate.r.flavor)).length;
        clashes+=(cuisines.size>1?.025:0)+(strong>1?.04:0);
        const mains=meal.rows.flatMap(r=>r.candidate.r.ingredients.filter(i=>food(i.id).category==='蔬菜').map(i=>i.id));
        clashes+=(mains.length-new Set(mains).size)*.018;
      }
      const dayFoods=new Set(all.flatMap(s=>s.value.ingredients.map(i=>i.id)));
      const proteinIds=active.flatMap(m=>m.rows.filter(r=>labels(r.candidate.r).slot==='蛋白质').map(r=>r.value.ingredients[0].id));
      const duplicateMain=proteinIds.length-new Set(proteinIds).size;
      const freshChoices=[...dayFoods].filter(id=>!produceSeen.has(id)&&['水果','蔬菜'].includes(food(id).category)).length;
      const repeat=all.reduce((a,s)=>a+Math.min(use.get(s.candidate.r.id)??0,3)*.008,0);
      const score=Math.abs(n.kcal-t.kcal)/t.kcal+Math.abs(n.fat-t.fat)/t.fat*.08+nutrientPenalty(n)+
        spread*.55+convenience*.15+clashes+repeat+duplicateMain*.034+(p.budget?cost/(+p.budget)*.35:0)-
        all.reduce((a,s)=>a+s.candidate.weight,0)*.008-Math.min(dayFoods.size,20)*.002-freshChoices*(produceSeen.size<10?.018:.004);
      qualified++;
      if(score<best) {best=score;winner=day;}
    }
    if(!winner) {
      const conflicts=[...reasons].sort((a,b)=>b[1]-a[1]).slice(0,3).map(([label])=>label);
      const time=conflicts.find(label=>label.endsWith('用时'));
      const detail=conflicts.length?'主要冲突：'+conflicts.join('、')+'。':'当前餐次没有可用搭配。';
      const suggestion=time?'可单独调高'+time.slice(0,-2)+'制作时间，或选更快的固定搭配。':
        change?'可试试换整餐，或解除相应菜品锁定。':'可检查各餐的固定搭配、用时和重复选项。';
      throw Error('第 '+(d+1)+' 天未找到符合条件的组合。'+detail+suggestion);
    }
    days.push(winner);mark(winner);
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
