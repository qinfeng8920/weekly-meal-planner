import {meaningfulIds,reserveLockedMeals} from './locked-meals';
import {executedTask,stockForPlanning,taskKey,type Execution} from './execution';
import {currentLedger} from './inventory';
import {purchaseFood,recipeMakesIngredients,type PurchaseOptions} from './purchase-food';
import {addDays} from './batches';
import {conditionalPair,directRules,recipeBaseId} from './substitution';
import {procurementScore} from './procurement-score';
import {purchaseCategory} from './purchase-category';
import {buildWeeklyPool,capOf,counts,effectiveCap,fitsPool,preferenceConflicts,ingredientPools,normalizeIds,poolGroup,poolGroups,recipeFoodIds,weekUsage,type GenerationAction,type PoolCandidate,type PoolSettings,type WeeklyIngredientPool} from './ingredient-pool';
import {purchaseEligibility,planLogistics,type Logistics,type SupplyState} from './logistics';
import {catalogVersion, food, foodMap, recipeList, recipeMap, serving, variantsOf, type Recipe, type Serving} from './catalog';
import {energyNeedsReview,nutrition, sum, type Targets} from './nutrition';
import {isCalendarDate} from './weight';
import {dateKey, mealPreference, split, type MealName, type Profile, type Weight} from './profile';
import {purchasesFromLogistics, prepPlan, type Day, type Meal, type Pantry, type Purchase, type Prep} from './shopping';

import {breakfastMenus, labels, pairingOk, type Slot} from './meal-catalog';
import {fruitMeal, mealNames, mealShapeError, mealTemplates, mealShares, namedIngredients, recipeFitsMeal, repeatIsLimited} from './meal-rules';
import {calciumCeiling,nutrientPenalty,sodiumUpperBound} from './diet-check';

import {coreSignature,mealConflict,overlapPenalty,recipeMeaning,sameFood} from './food-semantics';
import {cookingFit,mealComplexity,type MealComplexity} from './cooking';
import {cookingRule,usesNamedBreakfast,type CookingSelection} from './cooking-profile';

export const algorithmVersion = '3.2.0';
const compatibleCatalog=(version:string)=>version===catalogVersion||['2026.11-sr3','2026.11-sr4'].includes(version);
export const compatibleVersion=(version:string)=>version===algorithmVersion||version==='3.1.0'||version==='2.4.1'||version==='2.4.0'||version==='2.3.1'||version==='2.3.0'||version==='2.2.0'||version==='2.1.0'||version==='2.0.0'||version==='1.2.0';
export type Plan = {id:string; name:string; created:string; start:string; seed:string; targets:Targets; days:Day[];
  profile:Profile; weight:number; purchases:Purchase[]; prep:Prep; algorithmVersion:string; catalogVersion:string; favorite:boolean;taskScope?:string;cookingOverride?:CookingSelection;logistics?:Logistics;executionSnapshot?:import('./execution').Execution;pool?:WeeklyIngredientPool};
export type Lock = {day:number; meal:number; dish:number; serving:Serving};
export type Change = {day:number; meal?:number; dish?:number;replacement?:string;swapMode?:'换食材'|'换做法';expandPool?:boolean;weekFruit?:boolean; intent?:'简单一点'|'丰富一点'|'减少一道菜'|'更换同类食材'|'改成一锅料理'};
export function executionLocked(plan:Plan,execution:Execution|undefined,day:number,meal?:number,dish?:number) {
  return plan.days[day]?.meals.some((row,i)=>(meal===undefined||meal===i)&&row.dishes.some((serving,j)=>
    (dish===undefined||dish===j)&&executedTask(execution,taskKey(plan.start,day,row.name,serving.recipe.id),plan.taskScope,j)))??false;
}

function assertUnexecuted(plan:Plan|undefined,supply:SupplyState|undefined,position:Change) {
  if(plan&&executionLocked(plan,supply?.execution,position.day,position.meal,position.dish))
    throw Error('此范围包含已执行的菜品。请先在备餐或库存流水中核对并撤销实际记录。');
}

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

export function allowed(r:Recipe,p:Profile,blocked:string[],products?:PurchaseOptions) {
  const exclusions = split(p.avoid).map(s=>s.toLowerCase());
  return !blocked.includes(r.id) && !blocked.includes(recipeBaseId(r)) && r.tools.every(t=>p.tools.includes(t)) && recipeMakesIngredients(r,p.tools,products) &&
    r.ingredients.every(({id})=>{
      const f = food(id);
      const names = [id,f.name,...f.aliases].map(n=>n.toLowerCase());
      return (f.nutrients.sodium!==null||f.sodiumUpperBound!==undefined)&&!f.allergens.some(a=>p.allergens.includes(a)) &&
        !exclusions.some(x=>names.some(n=>n===x || n.includes(x) || x.includes(n) && n.length>=2)) &&
        (p.frozen || f.state!=='frozen') &&
        !(f.category==='水果' && (fruitGoal(p)===0 || p.fruit==='优先低糖水果' && !allowedFruit.has(id))) &&
        !(f.category==='乳制品' && (['不吃乳制品','乳糖不耐受'].includes(p.dairy) || p.dairy==='减少牛奶' && id==='milk'));
    });
}

function relatedRecipe(original:Recipe,other:Recipe) {
  if(original.id===other.id)return false;
  if(recipeBaseId(original)===recipeBaseId(other)||sameFood(original,other))return true;
  const former=recipeMeaning(original),next=recipeMeaning(other);
  return former.role===next.role&&former.core.some(id=>next.core.some(target=>conditionalPair(id,target)));
}

export function replacementMatches(original:Recipe,next:Recipe,mode:'换食材'|'换做法') {
  if(original.id===next.id||labels(original).slot!==labels(next).slot)return false;
  const same=coreSignature(original)===coreSignature(next);
  return mode==='换食材'?!same:same&&(original.steps.join('')!==next.steps.join(''));
}

export function recipeRestrictions(recipe:Recipe,p:Profile|undefined,blocked:string[],products?:PurchaseOptions) {
  if(!p)return [];
  const reasons:string[]=[];
  if(blocked.includes(recipe.id)||blocked.includes(recipeBaseId(recipe)))reasons.push('已屏蔽');
  const tools=recipe.tools.filter(tool=>!p.tools.includes(tool));
  if(tools.length)reasons.push('缺少 '+tools.join('、'));
  if(!recipeMakesIngredients(recipe,p.tools,products))reasons.push('缺少原料加工厨具');
  const allergy=recipe.ingredients.flatMap(item=>food(item.id).allergens).filter(tag=>p.allergens.includes(tag));
  if(allergy.length)reasons.push('含过敏原 '+[...new Set(allergy)].join('、'));
  if(!reasons.length&&!allowed(recipe,p,blocked,products))reasons.push('与档案中的忌口或饮食设置冲突');
  return reasons;
}

export function replacementRestrictions(original:Recipe,next:Recipe,p:Profile,meal:MealName,settings?:PoolSettings,products?:PurchaseOptions) {
  const ids=recipeFoodIds(next,products);
  const reasons:string[]=[];
  if(!recipeFitsMeal(next,p,meal,labels(original).slot))reasons.push('与本餐结构或偏好不符');
  if(normalizeIds(settings?.excluded??[],products).some(id=>ids.includes(id)))reasons.push('包含本周排除食材');
  if(normalizeIds(settings?.locked??[],products).some(id=>recipeFoodIds(original,products).includes(id)&&!ids.includes(id)))
    reasons.push('原菜包含锁定食材');
  if(!fitsFixedFruit(next,settings))reasons.push('与本周固定水果不同');
  const selected=normalizeIds([...(settings?.selected??[]),...(settings?.locked??[])],products);
  return {reasons,strict:Boolean(settings?.strict&&ids.some(id=>!selected.includes(id)))};
}

function fitsFixedFruit(recipe:Recipe,settings?:PoolSettings,date?:string) {
  if(settings?.fruitPolicy!=='每周固定一种'||!settings.fruitId)return true;
  const selections=date?[settings.fruitOverrides?.[date]??settings.fruitId]:
    [settings.fruitId,...Object.values(settings.fruitOverrides??{})];
  return recipe.ingredients.every(i=>food(i.id).category!=='水果'||selections.includes(i.id));
}

export function substitutionOptions(original:Recipe,p:Profile,meal:MealName,settings:PoolSettings|undefined,
  stock:ReadonlyMap<string,number>,blocked:string[],products?:PurchaseOptions) {
  const ids=(recipe:Recipe)=>recipeFoodIds(recipe,products);
  const locked=normalizeIds(settings?.locked??[],products).filter(id=>ids(original).includes(id));
  const selected=new Set(normalizeIds([...settings?.selected??[],...settings?.locked??[]],products));
  const excluded=new Set(normalizeIds(settings?.excluded??[],products));
  const score=(recipe:Recipe)=>ids(recipe).reduce((n,id)=>n+(stock.get(id)?1:0),0)*3+
    (recipeBaseId(recipe)===recipeBaseId(original)?2:0);
  return [...new Map([...variantsOf(original),...recipeList].map(recipe=>[recipe.id,recipe])).values()]
    .filter(recipe=>relatedRecipe(original,recipe)&&allowed(recipe,p,blocked,products)&&recipeFitsMeal(recipe,p,meal,labels(original).slot)&&
      ids(recipe).every(id=>!excluded.has(id)&&(!settings?.strict||selected.has(id)))&&locked.every(id=>ids(recipe).includes(id)))
    .sort((a,b)=>score(b)-score(a));
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
  const sodium = total.sodium??sodiumUpperBound(day);
  const caloriesOK = total.kcal >= (p.sex==='男' ? 1500 : 1200) && Math.abs(total.kcal-t.kcal)<=t.kcal*.05;
  const knownCalcium=total.calcium??dishes.reduce((sum,row)=>sum+row.ingredients.reduce((small,item)=>{
    const value=food(item.id).nutrients.calcium;
    return value===null?small:small+value*item.grams/100;
  },0),0);
  const calciumOK=knownCalcium<=calciumCeiling;
  const valid = caloriesOK && calciumOK && total.protein>=t.protein && total.protein<=proteinMax &&
    total.fat*9>=total.kcal*.2 && total.fat*9<=total.kcal*.35 && total.carbs*4>=total.kcal*.45 &&
    total.fiber>=t.fiber && sodium<=2000 && veg>=300 &&
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
  if (sodium>2000) messages.push('钠');
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

export function mandatoryIds(p:Profile,settings:PoolSettings,products?:PurchaseOptions) {
  return normalizeIds([...settings.locked,...[...fixedIds(p),p.requiredDish].flatMap(id=>{
    const recipe=recipeMap.get(id);
    return recipe?recipeFoodIds(recipe,products):[];
  }),...(settings.fruitPolicy==='每周固定一种'&&settings.fruitId&&fruitGoal(p)>0?[settings.fruitId,...Object.values(settings.fruitOverrides??{})]:[])],products);
}
function checkStructure(days:Day[], p:Profile, t:Targets, blocked:string[], pantry:Pantry,temporary?:CookingSelection,supply?:SupplyState, start=monday(),settings?:PoolSettings,scope?:string|null,kept?:(day:number,meal:number)=>boolean,deferBudget=false) {
  if (days.length!==7) throw Error('方案需要完整七天。');
  const used = new Set<string>();
  const seenByMeal = new Set<string>();
  const names=mealNames(p);
  const namedIds = fixedIds(p);
  const fixedMenu=breakfastMenus.some(menu=>menu.id===p.fixedBreakfast);
  const fixedPatterns=new Map<string,string>();
  const hasFruit=fruitGoal(p)>0;
  const products=supply?.products;
  const excluded=new Set(normalizeIds(settings?.excluded??[],products));
  const selected=new Set(normalizeIds([...(settings?.selected??[]),...(settings?.locked??[])],products));
  days.forEach((day,index)=>{
    if (day.meals.length!==names.length) throw Error('方案餐次数与当前设置不同。');
    for (const [i,meal] of day.meals.entries()) {
      const name=names[i], prefs=mealPreference(p,name);
      if(kept?.(index,i)) {
        for(const {recipe} of meal.dishes)seenByMeal.add(name+':'+recipeBaseId(recipe));
        continue;
      }
      const rule=cookingRule(p,name,index,temporary);
      const fixedMeal=name==='早餐'?rule.fixedBreakfast:prefs.fixed;
      const conflict=mealShapeError(p,meal,name,hasFruit&&fruitMeal(p)===name);
      if (conflict) throw Error('第 '+(index+1)+' 天'+name+'需调整：'+conflict+'。');
      const pattern=meal.dishes.filter(s=>labels(s.recipe).slot!=='水果').map(s=>recipeBaseId(s.recipe)).join(',');
      if (fixedMeal) {
        if (fixedPatterns.has(name) && fixedPatterns.get(name)!==pattern) throw Error(name+'已设置固定搭配。');
        fixedPatterns.set(name,pattern);
      }
      const fixed=name==='早餐'&&usesNamedBreakfast(p,index)?namedIds:[];
      if (fixed.length&&(fixed.some((id,position)=>meal.dishes[position]?.recipe.id!==id)||
        fixedMenu&&meal.dishes.filter(s=>labels(s.recipe).slot!=='水果').length!==fixed.length)) throw Error('固定早餐缺失。');
      for (const {recipe} of meal.dishes) {
        const key=name+':'+recipeBaseId(recipe);
        if (!fixedMeal && !(name==='早餐'&&fixed.includes(recipeBaseId(recipe))) && repeatIsLimited(p,name,recipe) && seenByMeal.has(key)) throw Error(name+'存在重复菜品。');
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
    const pending=day.meals.filter((_,i)=>!kept?.(index,i));
    if (pending.some(m=>m.dishes.some(s=>!allowed(s.recipe,p,blocked,supply?.products)))) throw Error('第 '+(index+1)+' 天存在受限食材、菜品或设备。');
    if(pending.length) {
      const date=addDays(start,index);
      if(pending.some(meal=>meal.dishes.some(row=>!fitsFixedFruit(row.recipe,settings,date))))
        throw Error('第 '+(index+1)+' 天采用了与固定水果不同的食材。请调整固定水果或重新搭配。');
      const foodIds=pending.flatMap(m=>m.dishes.flatMap(row=>recipeFoodIds(row.recipe,products)));
      const rejected=[...new Set(foodIds.filter(id=>excluded.has(id)||settings?.strict&&!selected.has(id)))];
      if(rejected.length)throw Error('第 '+(index+1)+' 天有禁止或超出严格食材池的食材：'+rejected.map(id=>food(id).name).join('、')+'。');
      const flags=limits(p,t,day);
      if(!flags.valid)throw Error('第 '+(index+1)+' 天需要调整：'+flags.messages.join('、')+'。');
    }
    for (const s of rows) used.add(s.recipe.id);
  });
  if (p.requiredDish && !used.has(p.requiredDish)) throw Error('方案未包含指定菜品。');
  if(settings) {
    const used=weekUsage(days,products);
    const pendingDays=days.map((day,d)=>({meals:day.meals.filter((_,m)=>!kept?.(d,m))}));
    const total=counts(weekUsage(pendingDays,products).map(i=>i.id));
    const required=counts(mandatoryIds(p,settings,products));
    for(const group of poolGroups) {
      const limit=effectiveCap(settings,group,required[group]);
      if(total[group]>limit)throw Error(group+'待执行餐次用了 '+total[group]+' 种，超过 '+limit+' 种上限。请核对锁定、沿用食材和高级上限。');
    }
    if(counts(used.map(i=>i.id)).蔬菜<Math.min(3,capOf(settings,'蔬菜'))) throw Error('本周蔬菜组合过于集中，请加入可用的不同蔬菜。');
    const meaningful=new Set(days.flatMap(day=>day.meals.flatMap(meal=>meal.dishes.flatMap(row=>meaningfulIds(row.ingredients,products)))));
    const missing=normalizeIds(settings.locked,products).filter(id=>!meaningful.has(id));
    if(missing.length)throw Error('锁定食材 '+missing.map(id=>food(id).name).join('、')+' 尚未在可用餐次达到配方用量。请调整固定搭配或重新搭配。');
  }
  if (!settings&&new Set(days.flatMap(d=>d.meals.flatMap(m=>m.dishes.flatMap(s=>s.ingredients.filter(i=>food(i.id).category==='蔬菜'||food(i.id).category==='水果').map(i=>i.id))))).size<10) throw Error('一周果蔬种类不足 10 种。');
  const quote=planLogistics(days,p,start,pantry,supply,temporary,undefined,scope);
  if(quote.conflicts?.length)throw Error('采购冲突。'+quote.conflicts.slice(0,3).join('、')+'。请更换食材、确认可用库存或调整购物日期。');
  if(!deferBudget)validateBudget(p,quote);
  return {purchases:purchasesFromLogistics(quote),quote};
}

function validateBudget(p:Profile,quote:Logistics) {
  if(p.budget&&(quote.purchase.missing||quote.purchase.known>+p.budget))
    throw Error('按当前单价和采购规格无法满足全周预算。请核对缺失单价、包装、库存或预算。');
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

function practicalServing(value:Serving) {
  const {recipe}=value;
  return serving(recipe,1,value.ingredients.map((ingredient,index)=>{
    const {id,grams}=ingredient;
    const original=recipe.ingredients[index].grams;
    const min=original*recipe.min,max=original*recipe.max;
    const category=food(id).category;
    const step=(id==='egg'||id==='boiledegg')&&Math.ceil(min/50)<=Math.floor(max/50)?50:
      ['肉类','鱼虾','主食','蔬菜','水果','豆制品','蛋'].includes(category)&&min>=4?5:0;
    if(!step||Math.ceil(min/step)>Math.floor(max/step))return ingredient;
    return {id,grams:Math.max(Math.ceil(min/step),Math.min(Math.floor(max/step),Math.round(grams/step)))*step};
  }));
}

function generateCandidate(p:Profile, records:Weight[], pantry:Pantry, blocked:string[], seed:string, old?:Plan, locks:Lock[] = [], change?:Change, temporary?:CookingSelection,supply?:SupplyState, candidate?:PoolCandidate, settings?:PoolSettings, requestedStart?:string, scope?:string|null):Plan {
  const current=nutrition(p,records);
  if(change&&old&&energyNeedsReview(old.targets,current))throw Error('安全保护已更新，请先更新未执行食谱。');
  const t=change&&old?old.targets:current;
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
  const start=old?.start??requestedStart??addDays(dateKey(),1);
  const preserved=(d:number,i:number)=>Boolean(old&&!change&&(addDays(start,d)<dateKey()||executionLocked(old,supply?.execution,d,i)));
  const products=supply?.products;
  const idsFor=(recipe:Recipe)=>recipeFoodIds(recipe,products);
  const actual=stockForPlanning(currentLedger(pantry,supply));
  const preferred=new Set(normalizeIds(settings?.preferred??[],products));
  const lockedIds=new Set(normalizeIds(settings?.locked??[],products));
  const existing=new Set(old?.days.flatMap(d=>d.meals.flatMap(m=>m.dishes.map(s=>s.recipe.id))));
  const pool=recipeList.flatMap(r=>settings||change?variantsOf(r).filter(variant=>!variant.replacements||
    existing.has(variant.id)||variant.id===change?.replacement||settings?.strict||settings?.excluded.length||
    variant.replacements.every(note=>!lockedIds.has(note.from)&&(actual[note.to]?.stock||preferred.has(note.to)||lockedIds.has(note.to)))):[r])
    .filter(r=>allowed(r,p,blocked,products)&&fitsFixedFruit(r,settings)&&(!candidate||fitsPool(idsFor(r),candidate.selected)));
  const canBuy=purchaseEligibility(p,start,pantry,supply,old?undefined:dateKey());
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
  const slots:Slot[]=['主食','蛋白质','蔬菜','清汤','加餐','水果','一锅套餐'];
  const weighted=names.map(name=>{
    const pref=mealPreference(p,name);
    const likes=[...p.protein,...p.starch,...p.vegetables,...p.fruits,...p.nuts,...p.seasonings,...split(p.preferred),...split(pref.likes)];
    const groups={} as Record<Slot,Candidate[]>;
    for(const slot of slots)groups[slot]=[];
    for(const r of pool) {
      const {slot}=labels(r);
      if(recipeFitsMeal(r,p,name,slot))groups[slot].push({
        r,weight:1+(pref.cuisines.includes(r.cuisine)?1.1:p.cuisines.includes(r.cuisine)?.35:0)
          +(namedIngredients(r,likes)?.66:0),
      });
    }
    return groups;
  });
  const perDay=available.map((eligible,d)=>{
    const date=addDays(start,d);
    return weighted.map(groups=>Object.fromEntries(slots.map(slot=>[slot,
      groups[slot].filter(({r})=>eligible.has(r.id)&&fitsFixedFruit(r,settings,date))])) as Record<Slot,Candidate[]>);
  });
  const must=p.requiredDish?byId.get(p.requiredDish):undefined;
  const breakfastIndex=names.indexOf('早餐');
  const fixedMenu=breakfastMenus.some(menu=>menu.id===p.fixedBreakfast);
  const supplyConflict=(d:number)=>unpurchasable.get(d)?.length
    ?' '+addDays(start,d)+' 缺少购物日期或换算的食材包括 '+unpurchasable.get(d)!.slice(0,4).map(id=>food(id).name).join('、')+'。可调整采购次数、购物日期或食材。'
    :' 请核对厨具、食材池、过敏忌口或固定餐次。';
  const failedBreakfast=namedIds.length&&breakfastIndex>=0?perDay.findIndex((day,index)=>usesNamedBreakfast(p,index)&&
    !preserved(index,breakfastIndex)&&namedIds.some(id=>!Object.values(day[breakfastIndex]).flat().some(c=>c.r.id===id))):-1;
  if(failedBreakfast>=0)throw Error('固定早餐与现有厨具、忌口或指定采购日冲突。'+supplyConflict(failedBreakfast));
  if(p.requiredDish&&(!must||!perDay.some(day=>day.some(group=>Object.values(group).flat().some(c=>c.r.id===must.id))))) throw Error('指定菜品与当前餐次或限制冲突。');
  const templateOptions=perDay.map((day,d)=>day.map((group,i)=>{
    const name=names[i];
    if(preserved(d,i))return [];
    const fruit=fruits>0&&fruitMeal(p)===name;
    const options=mealTemplates(name,fruit).filter(shape=>shape.every(slot=>group[slot].length));
    if(!options.length)throw Error('第 '+(d+1)+' 天'+name+'候选不足。'+supplyConflict(d));
    return options;
  }));

  const lockedIdsInKept=new Set(old?.days.flatMap((day,d)=>day.meals.flatMap((meal,m)=>meal.dishes.flatMap((row,j)=>
    preserved(d,m)||locks.some(l=>l.day===d&&l.meal===m&&l.dish===j)?meaningfulIds(row.ingredients,products):[])))??[]);
  const needsReservation=change?[]:normalizeIds(settings?.locked??[],products).filter(id=>!lockedIdsInKept.has(id));
  const cells=needsReservation.length?perDay.flatMap((day,d)=>day.flatMap((meal,m)=>slots.flatMap(slot=>{
    if(preserved(d,m)||!templateOptions[d][m].some(shape=>shape.includes(slot)))return [];
    // 固定搭配会沿用首个同名餐次的非水果菜品，锁定需求也在该餐次集中核对。
    if(slot!=='水果'&&fixedOn(names[m],d)&&perDay.slice(0,d).some((_,earlier)=>fixedOn(names[m],earlier)))return [];
    const named=names[m]==='早餐'&&usesNamedBreakfast(p,d)?namedIds:[];
    const fixed=named.find(id=>labels(recipeMap.get(id)!).slot===slot);
    if(named.length&&fixedMenu&&!fixed&&slot!=='水果')return [];
    const sameMeal=locks.filter(lock=>lock.meal===m&&lock.day===d);
    const prior=old?.days[d].meals[m];
    if(sameMeal.length&&prior&&!prior.dishes.some(row=>labels(row.recipe).slot===slot))return [];
    const retained=sameMeal.find(l=>labels(l.serving.recipe).slot===slot)?.serving.recipe.id;
    return [{day:d,meal:m,slot,recipes:meal[slot].map(c=>c.r).filter(r=>(!fixed||r.id===fixed)&&(!retained||r.id===retained))}];
  }))):[];
  const mustInKept=old?.days.some((day,d)=>day.meals.some((meal,m)=>preserved(d,m)&&meal.dishes.some(row=>row.recipe.id===must?.id)));
  const reservations=reserveLockedMeals(needsReservation,cells,seeded(seed+'-锁定餐位'),products,needsReservation.length&&!mustInKept?must:undefined);
  const days:Day[]=[];
  const seen=new Set<string>();
  const produceSeen=new Set<string>();
  const use=new Map<string,number>();
  const ingredientsUsed=new Map<string,number>();
  const lockedFood=new Set(normalizeIds(settings?.locked??[],products));
  const usedFood=new Set<string>();
  const compact=settings&&['少量种类','极简采购'].includes(settings.mode);
  const stock=actual;
  const mark=(d:Day)=>d.meals.forEach(m=>m.dishes.forEach(({recipe:r})=>{
    const base=recipeBaseId(r);seen.add(m.name+':'+base);use.set(base,(use.get(base)??0)+1);
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
      const reuse=ids.filter(id=>usedFood.has(id)).length;
      const onHand=ids.filter(id=>stock[id]?.stock).length;
      return c.weight*(1+reuse*(compact?.45:.12)+onHand*.25+ids.filter(id=>preferred.has(id)).length*.24)/(1+(use.get(recipeBaseId(c.r))??0)*.045);
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
    if(previous&&names.every((_,i)=>preserved(d,i))) {days.push(previous);mark(previous);continue;}
    const fixed=usesNamedBreakfast(p,d)?namedIds:[];
    const perMeal=perDay[d], dayRules=rules[d];
    const priorStats=previous&&change?.meal!==undefined?mealComplexity(previous.meals[change.meal].dishes.map(s=>s.recipe)):undefined;
    const reasons=new Map<string,number>();
    const requireNow=!needsReservation.length&&must&&!requiredElsewhere&&!days.some(hasMust)&&perMeal.some(group=>Object.values(group).flat().some(c=>c.r.id===must.id));
    let winner:Day|undefined, best=Infinity,qualified=0;
    for(let attempt=0;attempt<(candidate?850:2400)&&qualified<(candidate?8:12);attempt++) {
      const active:{name:MealName;rows:Selected[];cooking:MealComplexity}[]=[];
      const usedToday=new Set<string>();
      const mustSlot= requireNow ? names.map((name,i)=>({i,name})).filter(({i,name})=>
        !preserved(d,i)&&(!change||change.meal===undefined||change.meal===i)&&(!fixedOn(name,d)||!change)&&
        perMeal[i][labels(must).slot].some(c=>c.r.id===must.id)) : [];
      const forcedMeal=mustSlot.length?mustSlot[Math.floor(random()*mustSlot.length)].i:-1;
      for(const [i,name] of names.entries()) {
        const saved=previous?.meals[i];
        if(saved&&preserved(d,i)) {
          const rows=saved.dishes.map(s=>select({r:s.recipe,weight:1},s));
          rows.forEach(row=>usedToday.add(recipeBaseId(row.candidate.r)));
          active.push({name,rows,cooking:mealComplexity(saved.dishes.map(s=>s.recipe))});
          continue;
        }
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
        const reserved=reservations.get(d+':'+i)??[];
        if(reserved.length)shapes=shapes.filter(shape=>reserved.every(row=>shape.includes(row.slot)));
        if (i===forcedMeal) shapes=shapes.filter(slots=>slots.includes(labels(must!).slot));
        const integrated=shapes.filter(x=>x[0]==='一锅套餐');
        const preferredShapes=(rule.onePot&&integrated.length&&random()<.70)?integrated:shapes;
        const shape=preferredShapes[Math.floor(random()*preferredShapes.length)];
        if(!shape) break;
        let curated:string[]|undefined;
        if(name==='早餐'&&shape[0]==='主食'&&(!change||change.dish===undefined)&&!fixedMeal&&!locksHere.length&&!reserved.length) {
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
          const assigned=reserved.find(row=>row.slot===slot);
          const valid=perMeal[i][slot].filter(c=>(!force||force===c.r.id)&&(!assigned||assigned.recipes.has(c.r.id))
            && (!c.r.replacements||c.r.replacements.every(note=>!lockedIds.has(note.from)))
            && (!change?.replacement||!targetChange||change.dish!==j||change.replacement===c.r.id)
            && (!targetChange||!prior||!idsFor(prior.recipe).some(id=>lockedIds.has(id)&&!idsFor(c.r).includes(id)))
            && (!targetChange||change?.dish!==j||c.r.id!==prior?.recipe.id)
            && (!targetChange||change?.dish!==j||!prior||(!change?.swapMode&&change?.intent==='更换同类食材'&&labels(prior.recipe).slot!=='水果')||
              replacementMatches(prior.recipe,c.r,change?.swapMode??'换食材'))
            && (!change||change.dish!==undefined||prior?.recipe.id!==c.r.id||random()<.75)
            && (!repeatIsLimited(p,name,c.r)||c.r.id===force&&(fixedHere||fixed.includes(force))||!seen.has(name+':'+recipeBaseId(c.r)))
            && !usedToday.has(recipeBaseId(c.r))
            && (change?.swapMode||change?.intent!=='更换同类食材'||!targetChange||change.dish!==j||!!prior&&relatedRecipe(prior.recipe,c.r)));
          const c=retained?perMeal[i][slot].find(c=>c.r.id===retained.recipe.id):pick(valid);
          if(!c) break;
          rows.push(select(c,retained));
          usedToday.add(recipeBaseId(c.r));
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
      if(active.length!==names.length || forcedMeal>=0&&!usedToday.has(must!.id)) continue;
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
      const day:Day={meals:active.map(m=>({name:m.name,dishes:m.rows.map(r=>r.retained?r.value:practicalServing(r.value))}))};
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
      const repeat=all.reduce((a,s)=>a+Math.min(use.get(recipeBaseId(s.candidate.r))??0,3)*.008,0);
      const reuse=p.waste?all.reduce((n,s)=>n+recipeMeaning(s.candidate.r).core.filter(id=>(ingredientsUsed.get(id)??0)>0&&(ingredientsUsed.get(id)??0)<4).length,0)*.007:0;
      const usesLocks=candidate?new Set(all.flatMap(s=>idsFor(s.candidate.r).filter(id=>lockedFood.has(id)&&!usedFood.has(id)))).size:0;
      const goals=Object.entries(settings?.goals??{});
      const quantities=goals.length?new Map(weekUsage([day],products).map(i=>[i.id,i.grams])):null;
      const quantityPenalty=goals.reduce((penalty,[id,grams])=>{
        const goal=grams/7/+p.people;
        return penalty+Math.min(.065,Math.abs((quantities?.get(id)??0)-goal)*.00025);
      },0);
      const productsToday=settings?new Set(all.flatMap(row=>idsFor(row.candidate.r))):new Set<string>();
      const additions=[...productsToday].filter(id=>!usedFood.has(id));
      const usedCount=compact?[...usedFood].filter(id=>purchaseCategory(id)==='主要食材').length:0;
      const newMain=additions.filter(id=>purchaseCategory(id)==='主要食材').length;
      const diversityCredit=compact&&d>=3?Math.min(newMain,Math.max(0,13-usedCount))*.16:0;
      const expansion=additions.reduce((n,id)=>n+(stock[id]?.stock ? .012 : compact?.105:.045),0)-diversityCredit;
      const aboveTarget=compact?Math.max(0,usedCount+newMain-17)*.09:0;
      const score=expansion+aboveTarget+quantityPenalty+Math.abs(n.kcal-t.kcal)/t.kcal+Math.abs(n.fat-t.fat)/t.fat*.08+nutrientPenalty(n)+
        spread*.55+convenience*.42+clashes+repeat+duplicateMain*.034-
        all.reduce((a,s)=>a+s.candidate.weight,0)*.008-Math.min(dayFoods.size,20)*.002-freshChoices*(produceSeen.size<10?.018:.004)-reuse-usesLocks*.18;
      qualified++;
      if(score<best) {best=score;winner=day;}
    }
    if(!winner) {
      const conflicts=[...reasons].sort((a,b)=>b[1]-a[1]).slice(0,3).map(([label])=>label);
      const detail=conflicts.length?'主要冲突：'+conflicts.join('、')+'。':'当前餐次没有可用搭配。';
      const reservedNames=[...new Set(names.flatMap((_,i)=>(reservations.get(d+':'+i)??[]).flatMap(row=>row.requires)))];
      const reservationNote=reservedNames.length?'本日预留 '+reservedNames.map(id=>foodMap.get(id)?.name??recipeMap.get(id)?.name??id).join('、')+'。':'';
      const suggestion=change?'可试试换整餐，或解除相应菜品锁定。':supplyConflict(d);
      throw Error('第 '+(d+1)+' 天已达搜索上限，未找到合格组合。'+(change?.intent?'「'+change.intent+'」无法应用，原方案已保留。':'')+reservationNote+detail+suggestion);
    }
    days.push(winner);mark(winner);
  }
  const kept=(d:number,i:number)=>preserved(d,i)||Boolean(old&&!(change?.day===d&&change.meal===i)&&executionLocked(old,supply?.execution,d,i));
  const evaluate=(values:Day[])=>checkStructure(values,p,t,blocked,pantry,choice,supply,start,settings,scope,kept,true);
  let finalDays=days;
  let output=evaluate(finalDays);
  if(settings&&!change?.replacement) {
    const excluded=new Set(normalizeIds(settings.excluded,products));
    for(const rule of directRules) {
      if(lockedIds.has(rule.from)||excluded.has(rule.to)||candidate&&!candidate.selected.has(rule.to))continue;
      let changed=false;
      const attempt=finalDays.map((day,d)=>({meals:day.meals.map((meal,i)=>({...meal,dishes:meal.dishes.map((row,j)=>{
        if(kept(d,i)||old&&executionLocked(old,supply?.execution,d,i,j)||locks.some(lock=>lock.day===d&&lock.meal===i&&lock.dish===j)||
          change&&(d!==change.day||change.meal!==undefined&&i!==change.meal||change.dish!==undefined&&j!==change.dish)||
          row.recipe.id===p.requiredDish||meal.name==='早餐'&&usesNamedBreakfast(p,d)&&namedIds.includes(row.recipe.id)||
          !row.ingredients.some(item=>item.id===rule.from))return row;
        const ingredients=row.ingredients.map(item=>item.id===rule.from?{id:rule.to,grams:item.grams*rule.ratio}:item);
        const next=variantsOf(row.recipe).find(recipe=>recipe.id!==row.recipe.id&&recipe.ingredients.every((item,k)=>item.id===ingredients[k].id)&&
          allowed(recipe,p,blocked,products)&&recipeFitsMeal(recipe,p,meal.name as MealName,labels(row.recipe).slot));
        if(!next||candidate&&!fitsPool(idsFor(next),candidate.selected))return row;
        changed=true;
        return serving(next,1,ingredients);
      })}))}));
      if(!changed)continue;
      try {
        const alternative=evaluate(attempt);
        const fits=(q:Logistics)=>!p.budget||!q.purchase.missing&&q.purchase.known<=+p.budget;
        if((fits(alternative.quote)&&!fits(output.quote))||
          fits(alternative.quote)===fits(output.quote)&&procurementScore(alternative.quote,preferred,!!compact)<procurementScore(output.quote,preferred,!!compact)) {
          finalDays=attempt;output=alternative;
        }
      } catch { /* 保留通过校验的原方案。 */ }
    }
  }
  const {purchases,quote}=output;
  validateBudget(p,quote);
  return {id:old?.id??crypto.randomUUID(),name:old?.name??'本周食谱',...(scope?{taskScope:scope}:{}),created:new Date().toISOString(),start,seed,
    targets:t,days:finalDays,profile:structuredClone(change&&old?old.profile:p),weight:change&&old?old.weight:current.energy!.current,
    purchases,logistics:quote,prep:prepPlan(finalDays,p,start,choice,quote),algorithmVersion:change&&old?old.algorithmVersion:algorithmVersion,catalogVersion,favorite:old?.favorite??false,...(choice?{cookingOverride:choice}:{})};
}

export const startChoices=['今天','明天','下周一'] as const;
export type StartChoice=typeof startChoices[number]|`${number}-${number}-${number}`;
export function newPlanStart(choice:StartChoice='明天',today=dateKey()) {
  if(choice==='下周一') {
    const weekday=new Date(today+'T12:00:00').getDay();
    return addDays(today,(8-weekday)%7||7);
  }
  if(choice==='今天')return today;
  if(choice==='明天')return addDays(today,1);
  if(!isCalendarDate(choice)||choice<today)throw Error('自定义起始日必须是今天或未来的有效日期。');
  return choice;
}
export type GenerationOptions={settings?:PoolSettings;previous?:WeeklyIngredientPool;keep?:boolean;action?:GenerationAction;startChoice?:StartChoice;nextWeek?:boolean;updateCurrent?:boolean};
export function regenerate(p:Profile,records:Weight[],pantry:Pantry,blocked:string[],seed:string,old?:Plan,locks:Lock[]=[],
  change?:Change,temporary?:CookingSelection,supply?:SupplyState,options?:GenerationOptions):Plan {
  if(change){
    assertUnexecuted(old,supply,change);
    if(old&&addDays(old.start,change.day)<dateKey())throw Error('已过的日期保留为原食谱，请选择待执行日期。');
  }
  if(options?.updateCurrent&&old&&addDays(old.start,6)<dateKey())throw Error('当前方案已经结束，请重新生成新的一周。');
  const proposed=(change||options?.updateCurrent)&&old?old.start:newPlanStart(options?.startChoice??(options?.nextWeek?'下周一':'明天'));
  if(old&&!change&&(proposed>addDays(old.start,6)||addDays(proposed,6)<old.start||addDays(old.start,6)<dateKey()))old=undefined;
  if(old&&!change&&mealNames(old.profile).join()!==mealNames(p).join())
    throw Error('本周仍有原方案需保留。若要从新的餐次数开始，请选择本周结束后的起始日。');
  let settings=options?.settings??(change?old?.pool?.settings:undefined);
  const keep=options?.action==='沿用食材'||options?.keep===true;
  const rotate=options?.action==='轮换食材';
  if(settings) {
    const conflicts=preferenceConflicts(settings,supply?.products);
    if(conflicts.length)throw Error(conflicts.join(' '));
    if(!change)settings={...settings,planCaps:undefined};
  }
  if(change?.expandPool&&settings?.strict&&change.replacement) {
    const selected=recipeMap.get(change.replacement);
    if(selected)settings={...settings,selected:[...new Set([...settings.selected,...recipeFoodIds(selected,supply?.products)])]};
  }
  if(!change&&settings?.fruitPolicy==='每周固定一种'&&fruitGoal(p)>0&&
    (!settings.fruitId||!recipeList.some(recipe=>recipe.group==='水果'&&recipe.ingredients[0].id===settings!.fruitId&&allowed(recipe,p,blocked,supply?.products))))
    throw Error('请选择符合当前档案和过敏忌口设置的固定水果。');
  const start=old?.start??proposed;
  if(settings?.fruitOverrides&&(!change||change.weekFruit)) {
    const entries=Object.entries(settings.fruitOverrides).filter(([date])=>date>=start&&date<=addDays(start,6)&&!change?.weekFruit);
    settings={...settings,fruitOverrides:entries.length?Object.fromEntries(entries):undefined};
  }
  const scope=old?old.taskScope??null:crypto.randomUUID();
  if(old&&change?.replacement&&change.meal!==undefined&&change.dish!==undefined) {
    const {day,meal,dish}=change;
    const previous=old.days[day]?.meals[meal]?.dishes[dish];
    const replacement=recipeMap.get(change.replacement);
    if(!previous||!replacement||locks.some(lock=>lock.day===day&&lock.meal===meal&&lock.dish===dish))
      throw Error('此菜品已锁定，或替代做法已不可用。');
    if((change.swapMode||labels(previous.recipe).slot==='水果')&&
      !replacementMatches(previous.recipe,replacement,change.swapMode??'换食材'))
      throw Error('没有更换到不同核心食材或符合要求的做法，已保留原菜谱。');
    if(change.weekFruit&&(previous.recipe.group!=='水果'||replacement.group!=='水果'))throw Error('请选择一种独立水果。');
    if(settings?.fruitPolicy==='每周固定一种'&&previous.recipe.group==='水果'&&change.swapMode==='换食材') {
      settings=change.weekFruit?{...settings,fruitId:replacement.ingredients[0].id,fruitOverrides:undefined}:
        {...settings,fruitOverrides:{...settings.fruitOverrides,[addDays(start,day)]:replacement.ingredients[0].id}};
    }
    if(settings) {const conflicts=preferenceConflicts(settings,supply?.products);if(conflicts.length)throw Error(conflicts.join(' '));}
    const restriction=replacementRestrictions(previous.recipe,replacement,p,old.days[day].meals[meal].name as MealName,settings,supply?.products);
    if(change.swapMode&&(restriction.reasons.length||restriction.strict))
      throw Error(restriction.reasons.join('、')||'此食材不在严格食材池内，需要先确认调整指定食材。');
    if(!compatibleVersion(old.algorithmVersion)||!compatibleCatalog(old.catalogVersion))throw Error('请先从当前档案生成一份兼容食谱。');
    if(settings&&!settings.strict) {
      const ids=old.days.flatMap((entry,d)=>entry.meals.flatMap((group,m)=>group.dishes.flatMap((row,j)=>{
        const targeted=d===day&&m===meal&&j===dish||change.weekFruit&&row.recipe.group==='水果'&&addDays(start,d)>=dateKey()&&
          !executionLocked(old,supply?.execution,d,m,j)&&!locks.some(l=>l.day===d&&l.meal===m&&l.dish===j);
        return recipeFoodIds(targeted?replacement:row.recipe,supply?.products);
      })));
      const total=counts(ids);
      const raised=poolGroups.filter(group=>settings!.caps?.[group]===undefined&&total[group]>effectiveCap(settings!,group,0));
      if(raised.length)settings={...settings,planCaps:{...settings.planCaps,...Object.fromEntries(raised.map(group=>[group,total[group]]))}};
    }
    if(recipeBaseId(replacement)===recipeBaseId(previous.recipe)||labels(previous.recipe).slot==='水果') {
      const name=old.days[day].meals[meal].name as MealName;
      if(name==='早餐'&&usesNamedBreakfast(p,day)&&fixedIds(p).includes(previous.recipe.id))
        throw Error('此菜品属于已指定的固定早餐。');
      const candidates=substitutionOptions(previous.recipe,p,name,settings, new Map(Object.entries(stockForPlanning(currentLedger(pantry,supply)))
        .map(([id,item])=>[id,item.stock??0])),blocked,supply?.products);
      const selected=new Set(normalizeIds([...settings?.selected??[],...settings?.locked??[]],supply?.products));
      const explicitSafe=change.swapMode&&replacementMatches(previous.recipe,replacement,change.swapMode)&&
        recipeFitsMeal(replacement,p,name,labels(previous.recipe).slot)&&allowed(replacement,p,blocked,supply?.products)&&
        recipeFoodIds(replacement,supply?.products).every(id=>!settings?.excluded.includes(id)&&(!settings?.strict||selected.has(id)))&&
        (settings?.locked??[]).every(id=>!recipeFoodIds(previous.recipe,supply?.products).includes(id)||recipeFoodIds(replacement,supply?.products).includes(id));
      if(!explicitSafe&&!candidates.some(recipe=>recipe.id===replacement.id))throw Error('所选替代做法与当前厨具、偏好或锁定食材冲突。');
      verifyInput(p);
      if(energyNeedsReview(old.targets,nutrition(p,records)))throw Error('安全保护已更新，请先更新未执行食谱。');
      const t=old.targets,days=structuredClone(old.days);
      const exact=previous.ingredients.map((ingredient,i)=>({id:replacement.ingredients[i].id,
        grams:labels(previous.recipe).slot==='水果'?ingredient.grams:
          Math.round(ingredient.grams*replacement.ingredients[i].grams/previous.recipe.ingredients[i].grams*100)/100}));
      if(change.weekFruit) {
        for(const [d,entry] of days.entries()) for(const [m,group] of entry.meals.entries()) for(const [j,row] of group.dishes.entries()) {
          if(labels(row.recipe).slot!=='水果'||addDays(start,d)<dateKey()||executionLocked(old,supply?.execution,d,m,j)||
            locks.some(l=>l.day===d&&l.meal===m&&l.dish===j))continue;
          if(!recipeFitsMeal(replacement,p,group.name as MealName,'水果'))throw Error('新水果与部分待执行餐次的偏好冲突。');
          group.dishes[j]=serving(replacement,1,[{id:replacement.ingredients[0].id,grams:row.ingredients[0].grams}]);
        }
      } else {
        days[day].meals[meal].dishes[dish]=serving(replacement,1,exact);
      }
      if(previous.recipe.group==='水果'&&settings?.fruitPolicy==='每周固定一种') {
        for(const [d,entry] of days.entries()) {
          const date=addDays(start,d);
          if(date<dateKey()||d!==day&&!change.weekFruit)continue;
          if(entry.meals.some((m,i)=>m.dishes.some((row,j)=>!executionLocked(old,supply?.execution,d,i,j)&&
            !locks.some(lock=>lock.day===d&&lock.meal===i&&lock.dish===j)&&!fitsFixedFruit(row.recipe,settings,date))))
            throw Error(date+' 还有待执行的菜品使用其他水果，请先调整含水果的复合菜谱。');
        }
      }
      const {purchases,quote}=checkStructure(days,p,t,blocked,pantry,old.cookingOverride,supply,start,settings,scope,
        (d,i)=>(d!==day||i!==meal)&&executionLocked(old,supply?.execution,d,i));
      const poolSelected=new Set([...(old.pool?.selected??[]),...weekUsage(days,supply?.products).map(item=>item.id)]);
      const chosen=old.pool?.selected.filter(id=>!old.pool!.supplements.some(item=>item.id===id))??[];
      const pool=settings?buildWeeklyPool(start,settings,chosen,poolSelected,days,quote,supply?.products):undefined;
      return {...old,days,targets:t,purchases,logistics:quote,prep:prepPlan(days,p,start,old.cookingOverride,quote),...(pool?{pool}:{})};
    }
  }
  if(!settings)return generateCandidate(p,records,pantry,blocked,seed,old,locks,change,temporary,supply,undefined,undefined,start,scope);
  nutrition(p,records);verifyInput(p);
  const previous=change?old?.pool:options?.previous;
  const idsFor=(recipe:Recipe)=>recipeFoodIds(recipe,supply?.products);
  const canBuy=purchaseEligibility(p,start,pantry,supply,old?undefined:dateKey());
  const excluded=new Set(normalizeIds(settings.excluded,supply?.products));
  const eligible=recipeList.flatMap(variantsOf).filter(r=>idsFor(r).every(id=>!excluded.has(id))).filter(r=>allowed(r,p,blocked,supply?.products)&&fitsFixedFruit(r,settings)&&Array.from({length:7},(_,d)=>d)
    .some(d=>r.ingredients.every(i=>canBuy(i.id,d,i.grams*r.min*+p.people))));
  const before=new Set(normalizeIds(previous?.selected??[],supply?.products));
  const supplements=new Set(previous?.supplements.map(item=>item.id));
  const chosen=[...before].filter(id=>!supplements.has(id));
  const mandatory=mandatoryIds(p,settings,supply?.products);
  const lockedSet=new Set(normalizeIds(settings.locked,supply?.products));
  const required=mandatory.filter(id=>!lockedSet.has(id));
  const fixedBlocked=required.filter(id=>excluded.has(id));
  if(fixedBlocked.length)throw Error('固定早餐、固定水果或必选菜包含禁止食材 '+fixedBlocked.map(id=>food(id).name).join('、')+'。请调整固定搭配或食材状态。');
  const fixedRecipe=[...fixedIds(p),p.requiredDish].map(id=>recipeMap.get(id)).find(r=>r&&!fitsFixedFruit(r,settings));
  if(fixedRecipe)throw Error('固定水果与固定菜谱「'+fixedRecipe.name+'」冲突。请调整水果或固定搭配。');
  const physical=stockForPlanning(currentLedger(pantry,supply));
  const ranked=Object.fromEntries(Object.keys({...pantry,...physical}).map(id=>[id,{...pantry[id],stock:physical[id]?.stock??0}]));
  const usedBefore=new Set(normalizeIds(previous?.used.map(i=>i.id)??[],supply?.products));
  if(change&&settings.strict)for(const id of [...settings.selected,...settings.locked])before.add(id);
  const fulfilled=normalizeIds(old?.days.flatMap((day,d)=>day.meals.flatMap((meal,m)=>
    addDays(start,d)<dateKey()||executionLocked(old!,supply?.execution,d,m)?meal.dishes.flatMap(row=>meaningfulIds(row.ingredients,supply?.products)):[]))??[],supply?.products);
  const allowedIds=new Set([...eligible.flatMap(idsFor),...fulfilled]);
  const unavailable=[...lockedSet].filter(id=>!allowedIds.has(id));
  if(!change&&unavailable.length){
    const description=unavailable.map(id=>{
      const matching=[...recipeMap.values()].filter(r=>meaningfulIds(r.ingredients,supply?.products,r.min).includes(id));
      if(excluded.has(id))return food(id).name+'同时被禁止';
      if(!matching.length)return food(id).name+'暂无份量合适的审核菜谱';
      const profileAllowed=matching.filter(r=>allowed(r,p,blocked,supply?.products));
      if(!profileAllowed.length)return food(id).name+'受限（'+[...new Set(matching.flatMap(r=>recipeRestrictions(r,p,blocked,supply?.products)))].slice(0,5).join('、')+'）';
      return food(id).name+'与固定水果、组合中其他禁止食材或采购日期冲突';
    });
    throw Error('锁定食材无法安排。'+description.join('；')+'。');
  }
  const keptIds=[...new Set([...usedBefore,...mandatory])].filter(id=>allowedIds.has(id)&&!excluded.has(id)&&
    (!settings!.strict||settings!.selected.includes(id)||lockedSet.has(id)||fulfilled.includes(id)));
  if(!change&&keep) {
    if(!previous)throw Error('当前没有可沿用的本周食材，请先重新搭配。');
    const conflicts=[...usedBefore].filter(id=>!keptIds.includes(id));
    if(conflicts.length)throw Error('无法沿用 '+conflicts.map(id=>food(id).name).join('、')+'，它们受到最新禁止、固定搭配、厨具或采购设置限制。可选择重新搭配。');
    const count=counts(keptIds);
    for(const group of poolGroups) if(settings.caps?.[group]!==undefined&&count[group]>settings.caps[group]!)
      throw Error('沿用食材和新增锁定共需 '+group+' '+count[group]+' 种，超过你设置的上限 '+settings.caps[group]+' 种。请确认调整上限或选择重新搭配。');
    settings={...settings,planCaps:Object.fromEntries(poolGroups.map(group=>[group,count[group]]))};
  }
  const selectionSettings=rotate?{...settings,rotation:'全部刷新' as const}:settings;
  const candidates=change?[{selected:before,chosen}]:keep?
    [{selected:new Set(settings.strict?keptIds.filter(id=>settings!.selected.includes(id)||lockedSet.has(id)):keptIds),chosen:keptIds}]:
    ingredientPools(selectionSettings,eligible,ranked,supply,seeded(seed+'-食材'),options?.action==='重新搭配'?undefined:previous,required,fulfilled);
  if(!change&&!keep&&p.budget&&!settings.strict&&settings.method==='自动选择'&&!['少量种类','极简采购'].includes(settings.mode)) {
    const economical={...settings,mode:'少量种类' as const};
    const foodsToKeep=normalizeIds([...economical.locked,...required],supply?.products);
    const minimum=counts(foodsToKeep);
    if(poolGroups.every(group=>minimum[group]<=capOf(economical,group)))
      candidates.push(...ingredientPools(economical,eligible,ranked,supply,seeded(seed+'-预算'),previous,required,fulfilled));
  }
  if(change&&previous&&!settings.strict) {
    const excluded=new Set(normalizeIds(settings.excluded,supply?.products));
    const union=new Set([...before,...eligible.flatMap(idsFor).filter(id=>!excluded.has(id))]);
    candidates.push({selected:union,chosen});
  }
  if(!change&&settings.locked.length) candidates.push(...candidates,...candidates);
  const issues:string[]=[];
  let best:Plan|undefined, bestScore=Infinity, accepted=0;
  const compare=!change&&!keep&&!settings.strict&&settings.method!=='手动指定';
  const preferred=new Set(normalizeIds(settings.preferred??[],supply?.products));
  const compact=['少量种类','极简采购'].includes(settings.mode);
  for(const [index,candidate] of candidates.entries()) {
    try {
      const plan=generateCandidate(p,records,pantry,blocked,index===0?seed:seed+'-'+index,old,locks,change,temporary,supply,candidate,settings,start,scope);
      const used=weekUsage(plan.days,supply?.products);
      // 用到的额外食材才计入已选集合，不把候选库全部算成未来可用。
      const selected=new Set([...(change?before:candidate.selected),...used.map(i=>i.id)]);
      const quote=plan.logistics!;
      const result={...plan,seed,pool:buildWeeklyPool(plan.start,settings,candidate.chosen,selected,plan.days,quote,supply?.products)};
      if(!compare)return result;
      const rotationPenalty=rotate?used.filter(row=>usedBefore.has(row.id)&&!mandatory.includes(row.id)&&purchaseCategory(row.id)==='主要食材').length*3:0;
      const score=procurementScore(quote,preferred,compact)+rotationPenalty;
      if(score<bestScore){best=result;bestScore=score;}
      if(++accepted===(rotate?4:2))break;
    } catch(e) {issues.push(e instanceof Error?e.message:'候选组合不可用。');}
  }
  if(best)return best;
  if(change?.swapMode&&!change.replacement)issues.unshift('没有其他符合本餐、库存规则和营养条件的候选。');
  const limited=issues.find(i=>i.includes('搜索上限'));
  throw Error((limited??issues[0]??'当前没有符合食材池的候选。')+
    (settings.strict?'严格食材池已保留。可检查主食、蔬菜与调味料是否齐全。':'可核对提示中的缺失类别，补充相应食材或调整已选采购日期。'));
}

export function revise(plan:Plan, p:Profile, records:Weight[], pantry:Pantry, blocked:string[], day:number, meal:number,dish:number, grams:number[],supply?:SupplyState) {
  nutrition(p,records);
      const t=plan.targets;
  verifyInput(p);
  assertUnexecuted(plan,supply,{day,meal,dish});
  if(addDays(plan.start,day)<dateKey())throw Error('已过的日期保留为原食谱。');
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
  const {purchases,quote}=checkStructure(days,p,t,blocked,pantry,plan.cookingOverride,supply,plan.start,plan.pool?.settings,plan.taskScope??null,(d,i)=>(d!==day||i!==meal)&&executionLocked(plan,supply?.execution,d,i));
  const updatedPool=plan.pool?buildWeeklyPool(plan.start,plan.pool.settings,
    plan.pool.selected.filter(id=>!plan.pool!.supplements.some(s=>s.id===id)),plan.pool.selected,days,quote,supply?.products):undefined;
  return {...plan,...(updatedPool?{pool:updatedPool}:{}),days,purchases,logistics:quote,prep:prepPlan(days,p,plan.start,plan.cookingOverride,quote)};
}

export function verifyAgainst(plan:Plan,p:Profile,records:Weight[],pantry:Pantry,blocked:string[],supply?:SupplyState,start=plan.start,settings=plan.pool?.settings) {
  verifyInput(p);
  if (!compatibleCatalog(plan.catalogVersion) || !compatibleVersion(plan.algorithmVersion)) throw Error('历史方案采用其他版本，请重新生成。');
  if(plan.pool&&plan.algorithmVersion===algorithmVersion) {
    const selected=new Set(plan.pool.selected);
    const excluded=new Set(normalizeIds(plan.pool.settings.excluded,supply?.products));
    if(weekUsage(plan.days.map((day,d)=>({meals:day.meals.filter((_,m)=>!supply||!executionLocked(plan,supply.execution,d,m))})),supply?.products).some(i=>!selected.has(i.id)||excluded.has(i.id)))throw Error('历史食谱与保存的食材池不一致。');
  }
  if(settings){
    const conflicts=preferenceConflicts(settings,supply?.products);
    if(conflicts.length)throw Error(conflicts.join(' '));
  }
  checkStructure(plan.days,p,nutrition(p,records),blocked,pantry,plan.cookingOverride,supply,start,settings,'00000000-0000-4000-8000-000000000000',
    (d,m)=>start===plan.start&&executionLocked(plan,supply?.execution,d,m));
}
