import {dateStock} from './execution';
import {purchaseFood,recipeMakesIngredients,type PurchaseOptions} from './purchase-food';
import {addDays} from './batches';
import {buildWeeklyPool,capOf,counts,fitsPool,ingredientPools,normalizeIds,poolGroup,poolGroups,recipeFoodIds,weekUsage,type PoolCandidate,type PoolSettings,type WeeklyIngredientPool} from './ingredient-pool';
import {purchaseEligibility,planLogistics,type Logistics,type SupplyState} from './logistics';
import {catalogVersion, food, foodMap, recipeList, recipeMap, serving, type Recipe, type Serving} from './catalog';
import {nutrition, sum, type Targets} from './nutrition';
import {dateKey, mealPreference, split, type MealName, type Profile, type Weight} from './profile';
import {purchasesFromLogistics, prepPlan, type Day, type Meal, type Pantry, type Purchase, type Prep} from './shopping';

import {breakfastMenus, labels, pairingOk, type Slot} from './meal-catalog';
import {fruitMeal, mealNames, mealShapeError, mealTemplates, mealShares, namedIngredients, recipeFitsMeal, repeatIsLimited} from './meal-rules';
import {calciumCeiling,nutrientPenalty} from './diet-check';

import {mealConflict,overlapPenalty,recipeMeaning,sameFood} from './food-semantics';
import {cookingFit,mealComplexity,type MealComplexity} from './cooking';
import {cookingRule,usesNamedBreakfast,type CookingSelection} from './cooking-profile';

export const algorithmVersion = '2.1.0';
const compatibleCatalog=(version:string)=>version===catalogVersion||version==='2026.11-sr3';
const compatibleVersion=(version:string)=>version===algorithmVersion||version==='2.0.0'||version==='1.2.0';
export type Plan = {id:string; name:string; created:string; start:string; seed:string; targets:Targets; days:Day[];
  profile:Profile; weight:number; purchases:Purchase[]; prep:Prep; algorithmVersion:string; catalogVersion:string; favorite:boolean;cookingOverride?:CookingSelection;logistics?:Logistics;pool?:WeeklyIngredientPool};
export type Lock = {day:number; meal:number; dish:number; serving:Serving};
export type Change = {day:number; meal?:number; dish?:number; intent?:'简单一点'|'丰富一点'|'减少一道菜'|'更换同类食材'|'改成一锅料理'};
function meetsIntent(intent:Change['intent'],next:MealComplexity,prior:MealComplexity) {
  if(intent==='简单一点') return next.level<=prior.level&&next.count<=prior.count&&(next.level<prior.level||next.count<prior.count);
  if(intent==='丰富一点') return next.count>prior.count||next.count>=prior.count&&next.level>prior.level;
  if(intent==='减少一道菜') return next.count===prior.count-1;
  if(intent==='改成一锅料理') return next.onePot;
  return true;
}
const allowedFruit = new Set(['strawberry','kiwi','orange','peach','pear']);
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

function allowed(r:Recipe,p:Profile,blocked:string[],products?:PurchaseOptions) {
  const exclusions = split(p.avoid).map(s=>s.toLowerCase());
  return !blocked.includes(r.id) && r.tools.every(t=>p.tools.includes(t)) && recipeMakesIngredients(r,p.tools,products) &&
    r.ingredients.every(({id})=>{
      const f = food(id);
      const names = [id,f.name,...f.aliases].map(n=>n.toLowerCase());
      return !f.allergens.some(a=>p.allergens.includes(a)) &&
        !exclusions.some(x=>names.some(n=>n===x || n.includes(x) || x.includes(n) && n.length>=2)) &&
        (p.frozen || f.state!=='frozen') &&
        !(f.category==='水果' && (fruitGoal(p)===0 || p.fruit==='优先低糖水果' && !allowedFruit.has(id))) &&
        !(f.category==='乳制品' && (['不吃乳制品','乳糖不耐受'].includes(p.dairy) || p.dairy==='减少牛奶' && id==='milk'));
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
  if (!distributionOK) messages.push('分餐热量');
  return {valid: valid&&distributionOK,messages};
}

function verifyInput(p:Profile) {
  if (!Number.isInteger(+p.people) || +p.people<1 || +p.people>12) throw Error('用餐人数请填写 1～12 的整数。');
  if (p.budget && (!Number.isFinite(+p.budget) || +p.budget<=0)) throw Error('请填写有效预算，或将预算留空。');
  if (!['2','3','4'].includes(p.meals)) throw Error('请检查餐次设置。');
  if (p.lunchPlace!=='在家' && !p.packed && p.meals!=='2') throw Error('食堂或外卖的营养和过敏信息无法验证。可启用自带便当，或将计划调整为在家用餐。');
  if (p.allergens.some(a=>!a.trim())) throw Error('请检查过敏选项。');
  const known = [...foodMap.values()].flatMap(f=>[f.name,...f.aliases]);
  const unsupported = split(p.avoid).filter(x=>!known.some(n=>n.includes(x) || x.includes(n)));
  if (unsupported.length) throw Error('食材库无法核对这些忌口：'+unsupported.join('、')+'。请先咨询专业人员或确认准确的食材名称。');
  fruitGoal(p);
}

function checkStructure(days:Day[], p:Profile, t:Targets, blocked:string[], pantry:Pantry,temporary?:CookingSelection,supply?:SupplyState, start=monday(),settings?:PoolSettings) {
  if (days.length!==7) throw Error('方案需要完整七天。');
  const used = new Set<string>();
  const seenByMeal = new Set<string>();
  const names=mealNames(p);
  const namedIds = fixedIds(p);
  const fixedMenu=breakfastMenus.some(menu=>menu.id===p.fixedBreakfast);
  const fixedPatterns=new Map<string,string>();
  const hasFruit=fruitGoal(p)>0;
  days.forEach((day,index)=>{
    if (day.meals.length!==names.length) throw Error('方案餐次数与当前设置不同。');
    for (const [i,meal] of day.meals.entries()) {
      const name=names[i], prefs=mealPreference(p,name);
      const rule=cookingRule(p,name,index,temporary);
      const fixedMeal=name==='早餐'?rule.fixedBreakfast:prefs.fixed;
      const conflict=mealShapeError(p,meal,name,hasFruit&&fruitMeal(p)===name);
      if (conflict) throw Error('第 '+(index+1)+' 天'+name+'需调整：'+conflict+'。');
      const pattern=meal.dishes.filter(s=>labels(s.recipe).slot!=='水果').map(s=>s.recipe.id).join(',');
      if (fixedMeal) {
        if (fixedPatterns.has(name) && fixedPatterns.get(name)!==pattern) throw Error(name+'已设置固定搭配。');
        fixedPatterns.set(name,pattern);
      }
      const fixed=name==='早餐'&&usesNamedBreakfast(p,index)?namedIds:[];
      if (fixed.length&&(fixed.some((id,position)=>meal.dishes[position]?.recipe.id!==id)||
        fixedMenu&&meal.dishes.filter(s=>labels(s.recipe).slot!=='水果').length!==fixed.length)) throw Error('固定早餐缺失。');
      for (const {recipe} of meal.dishes) {
        const key=name+':'+recipe.id;
        if (!fixedMeal && !(name==='早餐'&&fixed.includes(recipe.id)) && repeatIsLimited(p,name,recipe) && seenByMeal.has(key)) throw Error(name+'存在重复菜品。');
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
    if (rows.some(s=>!allowed(s.recipe,p,blocked,supply?.products))) throw Error('第 '+(index+1)+' 天存在受限食材、菜品或设备。');
    const flags = limits(p,t,day);
    if (!flags.valid) throw Error('第 '+(index+1)+' 天需要调整：'+flags.messages.join('、')+'。');
    for (const s of rows) used.add(s.recipe.id);
  });
  if (p.requiredDish && !used.has(p.requiredDish)) throw Error('方案未包含指定菜品。');
  if(settings) {
    const used=weekUsage(days,supply?.products);
    const total=counts(used.map(i=>i.id));
    for(const group of poolGroups) if(total[group]>capOf(settings,group)) throw Error(group+'现有 '+total[group]+' 种，超过 '+capOf(settings,group)+' 种上限。请更换食材或调整上限。');
    if(total.蔬菜<Math.min(3,capOf(settings,'蔬菜'))) throw Error('本周蔬菜组合过于集中，请加入可用的不同蔬菜。');
    const chosen=new Set(used.map(i=>i.id));
    if(normalizeIds(settings.locked,supply?.products).some(id=>!chosen.has(id)))throw Error('本周未能安排全部锁定食材，请检查所需厨具或餐次。');
  }
  if (!settings&&new Set(days.flatMap(d=>d.meals.flatMap(m=>m.dishes.flatMap(s=>s.ingredients.filter(i=>food(i.id).category==='蔬菜'||food(i.id).category==='水果').map(i=>i.id))))).size<10) throw Error('一周果蔬种类不足 10 种。');
  const quote=planLogistics(days,p,start,pantry,supply,temporary);
  if(quote.conflicts?.length)throw Error('采购冲突。'+quote.conflicts.slice(0,3).join('、')+'。请更换食材、确认可用库存或调整购物日期。');
  if(p.budget&&(quote.purchase.missing||quote.purchase.known>+p.budget)) {
    throw Error('按当前单价和采购规格无法满足全周预算。请核对缺失单价、包装、库存或预算。');
  }
  return {purchases:purchasesFromLogistics(quote),quote};
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

function generateCandidate(p:Profile, records:Weight[], pantry:Pantry, blocked:string[], seed:string, old?:Plan, locks:Lock[] = [], change?:Change, temporary?:CookingSelection,supply?:SupplyState, candidate?:PoolCandidate, settings?:PoolSettings, requestedStart?:string):Plan {
  const t=nutrition(p,records);
  verifyInput(p);
  const choice=change?old?.cookingOverride:temporary;
  const names=mealNames(p);
  const fixedOn=(name:MealName,d:number)=>name==='早餐'?cookingRule(p,name,d,choice).fixedBreakfast:mealPreference(p,name).fixed;
  if(change?.meal!==undefined) {
    const name=names[change.meal];
    const replaced=change.dish===undefined?undefined:old?.days[change.day]?.meals[change.meal]?.dishes[change.dish];
    if((fixedOn(name,change.day)&&(!replaced||labels(replaced.recipe).slot!=='水果'))||
      name==='早餐'&&usesNamedBreakfast(p,change.day)&&change.dish!==undefined&&change.dish<fixedIds(p).length) throw Error('这个餐次已固定。可先修改生成设置再调整。');
  }
  if(change && (!old || !compatibleVersion(old.algorithmVersion) || !compatibleCatalog(old.catalogVersion))) throw Error('这份旧版食谱需重新生成后再调整。');
  const random=seeded(seed), shares=mealShares(p), fruits=fruitGoal(p), namedIds=fixedIds(p);
  const start=old&&change?old.start:requestedStart??addDays(dateKey(),1);
  const products=supply?.products;
  const idsFor=(recipe:Recipe)=>recipeFoodIds(recipe,products);
  const pool=recipeList.filter(r=>allowed(r,p,blocked,products)&&(!candidate||fitsPool(idsFor(r),candidate.selected)));
  const canBuy=purchaseEligibility(p,start,pantry,supply,change?undefined:dateKey());
  const unpurchasable=new Map<number,string[]>();
  const available=Array.from({length:7},(_,day)=>new Set(pool.filter(r=>{
    const missing=r.ingredients.find(i=>!canBuy(i.id,day,i.grams*r.min*+p.people));
    if(!missing)return true;
    const id=purchaseFood(missing.id,products).purchaseIngredientId;
    const labels=unpurchasable.get(day)??[];
    if(!labels.includes(id))labels.push(id);
    unpurchasable.set(day,labels);
    return false;
  }).map(r=>r.id)));
  const byId=new Map(pool.map(r=>[r.id,r]));
  const rules=Array.from({length:7},(_,d)=>names.map(name=>cookingRule(p,name,d,choice)));
  const perDay=rules.map((day,d)=>day.map((_,i)=>{
    const name=names[i], pref=mealPreference(p,name);
    const likes=[...p.protein,...p.starch,...p.vegetables,...p.fruits,...p.nuts,...p.seasonings,...split(p.preferred),...split(pref.likes)];
    const candidates=(['主食','蛋白质','蔬菜','清汤','加餐','水果','一锅套餐'] as Slot[]).reduce((groups,slot)=>{
      groups[slot]=pool.filter(r=>available[d].has(r.id)&&recipeFitsMeal(r,p,name,slot)).map(r=>({
        r,weight:1+(pref.cuisines.includes(r.cuisine)?1.1:p.cuisines.includes(r.cuisine)?.35:0)
          +(namedIngredients(r,likes)?.66:0),
      }));
      return groups;
    },{} as Record<Slot,Candidate[]>);
    return candidates;
  }));
  const must=p.requiredDish?byId.get(p.requiredDish):undefined;
  const breakfastIndex=names.indexOf('早餐');
  const fixedMenu=breakfastMenus.some(menu=>menu.id===p.fixedBreakfast);
  const supplyConflict=(d:number)=>unpurchasable.get(d)?.length
    ?' '+addDays(start,d)+' 缺少购物日期或换算的食材包括 '+unpurchasable.get(d)!.slice(0,4).map(id=>food(id).name).join('、')+'。可调整采购次数、购物日期或食材。'
    :' 请核对厨具、食材池、过敏忌口或固定餐次。';
  const failedBreakfast=namedIds.length&&breakfastIndex>=0?perDay.findIndex((day,index)=>usesNamedBreakfast(p,index)&&
    namedIds.some(id=>!Object.values(day[breakfastIndex]).flat().some(c=>c.r.id===id))):-1;
  if(failedBreakfast>=0)throw Error('固定早餐与现有厨具、忌口或指定采购日冲突。'+supplyConflict(failedBreakfast));
  if(p.requiredDish&&(!must||!perDay.some(day=>day.some(group=>Object.values(group).flat().some(c=>c.r.id===must.id))))) throw Error('指定菜品与当前餐次或限制冲突。');
  const templateOptions=perDay.map((day,d)=>day.map((group,i)=>{
    const name=names[i];
    const fruit=fruits>0&&fruitMeal(p)===name;
    const options=mealTemplates(name,fruit).filter(shape=>shape.every(slot=>group[slot].length));
    if(!options.length)throw Error('第 '+(d+1)+' 天'+name+'候选不足。'+supplyConflict(d));
    return options;
  }));

  const days:Day[]=[];
  const seen=new Set<string>();
  const produceSeen=new Set<string>();
  const use=new Map<string,number>();
  const ingredientsUsed=new Map<string,number>();
  const lockedFood=new Set(normalizeIds(settings?.locked??[],products));
  const usedFood=new Set<string>();
  const mark=(d:Day)=>d.meals.forEach(m=>m.dishes.forEach(({recipe:r})=>{
    seen.add(m.name+':'+r.id);use.set(r.id,(use.get(r.id)??0)+1);
    for(const id of idsFor(r))usedFood.add(id);
    for(const id of recipeMeaning(r).core) ingredientsUsed.set(id,(ingredientsUsed.get(id)??0)+1);
    for(const i of r.ingredients) if(['水果','蔬菜'].includes(food(i.id).category)) produceSeen.add(i.id);
  }));
  const hasMust=(d:Day)=>d.meals.some(m=>m.dishes.some(s=>s.recipe.id===must?.id));
  if (change && old) old.days.forEach((d,i)=>{if(i!==change.day)mark(d);});
  const requiredElsewhere=Boolean(change&&old?.days.some((d,i)=>i!==change.day&&hasMust(d)));
  const pick=(candidates:Candidate[])=>{
    const weights=candidates.map(c=>{
      if(!candidate)return c.weight/(1+(use.get(c.r.id)??0)*(p.waste?.12:.27));
      const ids=idsFor(c.r);
      const favor=ids.some(id=>lockedFood.has(id)&&!usedFood.has(id))?3.8:1;
      const reuse=ids.filter(id=>poolGroup(id)!=='基础食材'&&usedFood.has(id)).length;
      return c.weight*favor*(1+reuse*.12)/(1+(use.get(c.r.id)??0)*.045);
    });
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
    const fixed=usesNamedBreakfast(p,d)?namedIds:[];
    const perMeal=perDay[d], dayRules=rules[d];
    const priorStats=previous&&change?.meal!==undefined?mealComplexity(previous.meals[change.meal].dishes.map(s=>s.recipe)):undefined;
    const reasons=new Map<string,number>();
    const requireNow=must&&!requiredElsewhere&&!days.some(hasMust)&&perMeal.some(group=>Object.values(group).flat().some(c=>c.r.id===must.id));
    let winner:Day|undefined, best=Infinity,qualified=0;
    for(let attempt=0;attempt<(candidate?850:2400)&&qualified<(candidate?8:12);attempt++) {
      const active:{name:MealName;rows:Selected[];cooking:MealComplexity}[]=[];
      const usedToday=new Set<string>();
      const mustSlot= requireNow ? names.map((name,i)=>({i,name})).filter(({i,name})=>
        (!change||change.meal===undefined||change.meal===i)&&(!fixedOn(name,d)||!change)&&
        perMeal[i][labels(must).slot].some(c=>c.r.id===must.id)) : [];
      const forcedMeal=mustSlot.length?mustSlot[Math.floor(random()*mustSlot.length)].i:-1;
      for(const [i,name] of names.entries()) {
        const rule=dayRules[i];
        const fixedHere=fixedOn(name,d);
        const former=previous?.meals[i];
        const targetChange=Boolean(change&&(change.meal===undefined||change.meal===i));
        const fixedMeal=fixedHere?(change?old?.days.find((_,k)=>k!==d&&fixedOn(name,k)):
          days.find((_,k)=>fixedOn(name,k)))?.meals[i]:undefined;
        const locksHere=locks.filter(l=>l.day===d&&l.meal===i);
        let shapes=fixedMeal?[fixedMeal.dishes.map(dish=>labels(dish.recipe).slot)]:templateOptions[d][i];
        if(name==='早餐'&&fixed.length) shapes=shapes.filter(slots=>slots[0]==='主食');
        if(targetChange&&change?.meal===i&&priorStats) {
          if(change.intent==='减少一道菜') shapes=shapes.filter(slots=>slots.length===priorStats.count-1);
          if(change.intent==='改成一锅料理') shapes=shapes.filter(slots=>slots[0]==='一锅套餐'&&slots.every(s=>s!=='清汤'));
        }
        if (name==='早餐'&&fixed.length&&fixedMenu) shapes=shapes.filter(slots=>slots.includes('加餐')===(fixed.length===3));
        if(former&&change&&(!targetChange||change.dish!==undefined)||former&&locksHere.length) {
          shapes=[former!.dishes.map(s=>labels(s.recipe).slot)];
        }
        if(locksHere.length&&!former) shapes=shapes.filter(slots=>locksHere.every(l=>slots[l.dish]===labels(l.serving.recipe).slot));
        if (i===forcedMeal) shapes=shapes.filter(slots=>slots.includes(labels(must!).slot));
        const integrated=shapes.filter(x=>x[0]==='一锅套餐');
        const preferredShapes=(rule.onePot&&integrated.length&&random()<.70)?integrated:shapes;
        const shape=preferredShapes[Math.floor(random()*preferredShapes.length)];
        if(!shape) break;
        let curated:string[]|undefined;
        if(name==='早餐'&&shape[0]==='主食'&&(!change||change.dish===undefined)&&!fixedMeal&&!locksHere.length) {
          const eligible=breakfastMenus.filter(menu=>menu.recipes.every((id,j)=>perMeal[i][shape[j]]?.some(c=>c.r.id===id))
            && shape.includes('加餐')===(menu.recipes.length===3) && fixed.every((id,j)=>menu.recipes[j]===id)
            && menu.recipes.every(id=>!seen.has(name+':'+id)||!repeatIsLimited(p,name,byId.get(id)!)||fixed.includes(id)||fixedHere)
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
            && (!repeatIsLimited(p,name,c.r)||c.r.id===force&&(fixedHere||fixed.includes(force))||!seen.has(name+':'+c.r.id))
            && !usedToday.has(c.r.id)
            && (change?.intent!=='更换同类食材'||!targetChange||change.dish!==j||!!prior&&sameFood(c.r,prior.recipe)));
          const c=retained?perMeal[i][slot].find(c=>c.r.id===retained.recipe.id):pick(valid);
          if(!c) break;
          rows.push(select(c,retained));
          usedToday.add(c.r.id);
        }
        if(rows.length!==shape.length) break;
        const recipes=rows.map(r=>r.candidate.r);
        const duplicate=mealConflict(recipes);
        if(duplicate) {reasons.set(name+duplicate,(reasons.get(name+duplicate)??0)+1);break;}
        if(!pairingOk(recipes))break;
        const cooking=mealComplexity(recipes);
        if(change?.meal===i&&priorStats&&!meetsIntent(change.intent,cooking,priorStats))break;
        active.push({name,rows,cooking});
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
            (['主食','一锅套餐'].includes(labels(row.candidate.r).slot)||meal.name==='加餐'||round>0&&['蛋白质','加餐'].includes(labels(row.candidate.r).slot)));
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

      let spread=0, convenience=0, clashes=0;
      for(const [i,meal] of active.entries()) {
        spread+=Math.abs(totalCalories(meal.rows)/n.kcal-shares[i]);
        convenience+=cookingFit(meal.cooking,dayRules[i]);
        const cuisines=new Set(meal.rows.filter(r=>labels(r.candidate.r).slot==='蛋白质'||labels(r.candidate.r).slot==='蔬菜').map(r=>r.candidate.r.cuisine));
        const strong=meal.rows.filter(r=>!['清淡',''].includes(r.candidate.r.flavor)).length;
        clashes+=(cuisines.size>1?.025:0)+(strong>1?.04:0);
        clashes+=overlapPenalty(meal.rows.map(r=>r.candidate.r));
      }
      const dayFoods=new Set(all.flatMap(s=>s.value.ingredients.map(i=>i.id)));
      const proteinIds=active.flatMap(m=>m.rows.filter(r=>labels(r.candidate.r).slot==='蛋白质').map(r=>r.value.ingredients[0].id));
      const duplicateMain=proteinIds.length-new Set(proteinIds).size;
      const freshChoices=[...dayFoods].filter(id=>!produceSeen.has(id)&&['水果','蔬菜'].includes(food(id).category)).length;
      const repeat=all.reduce((a,s)=>a+Math.min(use.get(s.candidate.r.id)??0,3)*.008,0);
      const reuse=p.waste?all.reduce((n,s)=>n+recipeMeaning(s.candidate.r).core.filter(id=>(ingredientsUsed.get(id)??0)>0&&(ingredientsUsed.get(id)??0)<4).length,0)*.007:0;
      const usesLocks=candidate?new Set(all.flatMap(s=>idsFor(s.candidate.r).filter(id=>lockedFood.has(id)&&!usedFood.has(id)))).size:0;
      const goals=Object.entries(settings?.goals??{});
      const quantities=goals.length?new Map(weekUsage([day],products).map(i=>[i.id,i.grams])):null;
      const quantityPenalty=goals.reduce((penalty,[id,grams])=>{
        const goal=grams/7/+p.people;
        return penalty+Math.min(.065,Math.abs((quantities?.get(id)??0)-goal)*.00025);
      },0);
      const score=quantityPenalty+Math.abs(n.kcal-t.kcal)/t.kcal+Math.abs(n.fat-t.fat)/t.fat*.08+nutrientPenalty(n)+
        spread*.55+convenience*.42+clashes+repeat+duplicateMain*.034-
        all.reduce((a,s)=>a+s.candidate.weight,0)*.008-Math.min(dayFoods.size,20)*.002-freshChoices*(produceSeen.size<10?.018:.004)-reuse-usesLocks*.18;
      qualified++;
      if(score<best) {best=score;winner=day;}
    }
    if(!winner) {
      const conflicts=[...reasons].sort((a,b)=>b[1]-a[1]).slice(0,3).map(([label])=>label);
      const detail=conflicts.length?'主要冲突：'+conflicts.join('、')+'。':'当前餐次没有可用搭配。';
      const suggestion=change?'可试试换整餐，或解除相应菜品锁定。':supplyConflict(d);
      throw Error('第 '+(d+1)+' 天已达搜索上限，未找到合格组合。'+(change?.intent?'「'+change.intent+'」无法应用，原方案已保留。':'')+detail+suggestion);
    }
    days.push(winner);mark(winner);
  }
  const {purchases,quote}=checkStructure(days,p,t,blocked,pantry,choice,supply,start,settings);
  return {id:old&&change?old.id:crypto.randomUUID(),name:old&&change?old.name:'本周食谱',created:new Date().toISOString(),start,seed,
    targets:t,days,profile:structuredClone(p),weight:[...records].sort((a,b)=>b.date.localeCompare(a.date))[0]?.kg??Number(p.weight),
    purchases,logistics:quote,prep:prepPlan(days,p,start,choice,quote),algorithmVersion,catalogVersion,favorite:old?.favorite??false,...(choice?{cookingOverride:choice}:{})};
}

export const startChoices=['今天','明天','下周一'] as const;
export type StartChoice=typeof startChoices[number];
export function newPlanStart(choice:StartChoice='明天',today=dateKey()) {
  if(choice==='下周一') {
    const weekday=new Date(today+'T12:00:00').getDay();
    return addDays(today,(8-weekday)%7||7);
  }
  return choice==='今天'?today:addDays(today,1);
}
export type GenerationOptions={settings?:PoolSettings;previous?:WeeklyIngredientPool;keep?:boolean;startChoice?:StartChoice;nextWeek?:boolean};
export function regenerate(p:Profile,records:Weight[],pantry:Pantry,blocked:string[],seed:string,old?:Plan,locks:Lock[]=[],
  change?:Change,temporary?:CookingSelection,supply?:SupplyState,options?:GenerationOptions):Plan {
  const settings=change?old?.pool?.settings:options?.settings;
  const start=change&&old?old.start:newPlanStart(options?.startChoice??(options?.nextWeek?'下周一':'明天'));
  if(!settings)return generateCandidate(p,records,pantry,blocked,seed,old,locks,change,temporary,supply,undefined,undefined,start);
  nutrition(p,records);verifyInput(p);
  const previous=change?old?.pool:options?.previous;
  const idsFor=(recipe:Recipe)=>recipeFoodIds(recipe,supply?.products);
  const canBuy=purchaseEligibility(p,start,pantry,supply,change?undefined:dateKey());
  const eligible=recipeList.filter(r=>allowed(r,p,blocked,supply?.products)&&Array.from({length:7},(_,d)=>d)
    .some(d=>r.ingredients.every(i=>canBuy(i.id,d,i.grams*r.min*+p.people))));
  const before=new Set(normalizeIds(previous?.selected??[],supply?.products));
  const supplements=new Set(previous?.supplements.map(item=>item.id));
  const chosen=[...before].filter(id=>!supplements.has(id));
  const required=normalizeIds([...fixedIds(p),p.requiredDish].flatMap(id=>{
    const recipe=recipeMap.get(id);
    return recipe?idsFor(recipe):[];
  }),supply?.products);
  const physical=supply?.execution?dateStock(start,start,p,pantry,supply.receipts??{},supply.execution):null;
  const ranked=physical?Object.fromEntries(Object.keys({...pantry,...physical}).map(id=>[id,{...pantry[id],stock:physical[id]?.stock??0}])):pantry;
  const usedBefore=new Set(normalizeIds(previous?.used.map(i=>i.id)??[],supply?.products));
  const candidates=change?[{selected:before,chosen}]:options?.keep?
    [{selected:usedBefore,chosen},{selected:before,chosen}]:
    ingredientPools(settings,eligible,ranked,supply,seeded(seed+'-食材'),previous,required);
  if(change&&previous&&!settings.strict) {
    const excluded=new Set(normalizeIds(settings.excluded,supply?.products));
    const union=new Set([...before,...eligible.flatMap(idsFor).filter(id=>!excluded.has(id))]);
    candidates.push({selected:union,chosen});
  }
  const issues:string[]=[];
  for(const [index,candidate] of candidates.entries()) {
    try {
      const plan=generateCandidate(p,records,pantry,blocked,index===0?seed:seed+'-'+index,old,locks,change,temporary,supply,candidate,settings,start);
      const used=weekUsage(plan.days,supply?.products);
      // 用到的额外食材才计入已选集合，不把候选库全部算成未来可用。
      const selected=change||options?.keep?new Set([...before,...used.map(i=>i.id)]):candidate.selected;
      const quote=plan.logistics!;
      return {...plan,seed,pool:buildWeeklyPool(plan.start,settings,candidate.chosen,selected,plan.days,quote,supply?.products)};
    } catch(e) {issues.push(e instanceof Error?e.message:'候选组合不可用。');}
  }
  const limited=issues.find(i=>i.includes('搜索上限'));
  throw Error((limited??issues[0]??'当前没有符合食材池的候选。')+
    (settings.strict?'严格食材池已保留。可检查主食、蔬菜与调味料是否齐全。':'可调整分类上限、换一种食材，或增加购物次数。'));
}

export function revise(plan:Plan, p:Profile, records:Weight[], pantry:Pantry, blocked:string[], day:number, meal:number,dish:number, grams:number[],supply?:SupplyState) {
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
  const {purchases,quote}=checkStructure(days,p,t,blocked,pantry,plan.cookingOverride,supply,plan.start,plan.pool?.settings);
  const updatedPool=plan.pool?buildWeeklyPool(plan.start,plan.pool.settings,
    plan.pool.selected.filter(id=>!plan.pool!.supplements.some(s=>s.id===id)),plan.pool.selected,days,quote,supply?.products):undefined;
  return {...plan,...(updatedPool?{pool:updatedPool}:{}),days,targets:t,weight:[...records].sort((a,b)=>b.date.localeCompare(a.date))[0]?.kg??Number(p.weight),
    profile:structuredClone(p),purchases,logistics:quote,prep:prepPlan(days,p,plan.start,plan.cookingOverride,quote)};
}

export function verifyAgainst(plan:Plan,p:Profile,records:Weight[],pantry:Pantry,blocked:string[],supply?:SupplyState,start=plan.start) {
  verifyInput(p);
  if (!compatibleCatalog(plan.catalogVersion) || !compatibleVersion(plan.algorithmVersion)) throw Error('历史方案采用其他版本，请重新生成。');
  if(plan.pool&&plan.algorithmVersion===algorithmVersion) {
    const selected=new Set(plan.pool.selected);
    const excluded=new Set(normalizeIds(plan.pool.settings.excluded,supply?.products));
    if(weekUsage(plan.days,supply?.products).some(i=>!selected.has(i.id)||excluded.has(i.id)))throw Error('历史食谱与保存的食材池不一致。');
  }
  checkStructure(plan.days,p,nutrition(p,records),blocked,pantry,plan.cookingOverride,supply,start,plan.pool?.settings);
}
