import data from './nutrient-planning-values.json';
import {food} from './catalog';
import type {NutrientKey} from './nutrient-catalog';
import {nutrientReferences} from './nutrient-reference';
import {nutrientRetention} from './nutrient-retention';
import type {Profile} from './profile';
import type {Targets} from './nutrition';
import type {Day} from './shopping';

type Levels=Partial<Record<NutrientKey|'foodPotassium',number>>;
type Ref=ReturnType<typeof nutrientReferences>;
const keys=data.keys as NutrientKey[];
const values=data.foods as Record<string,ReadonlyArray<number|null>>;
const weight:Levels={calcium:.49,potassium:.10,vitaminC:.16,fiber:.11,iron:.13,zinc:.13,magnesium:.11,folateDfe:.14};
const coefficients=new Map<string,Partial<Record<NutrientKey,number>>|undefined>();
export function plannedLevels(day:Day):Levels {
  const levels:Levels={};
  for(const meal of day.meals)for(const row of meal.dishes)for(const item of row.ingredients){
    const source=values[item.id];
    const ingredient=food(item.id);
    const cache=row.recipe.id+'|'+item.id;
    if(!coefficients.has(cache))coefficients.set(cache,nutrientRetention(row.recipe.id,item.id,ingredient.state));
    const retention=coefficients.get(cache);
    const size=item.grams/100;
    for(let i=0;i<keys.length;i++){
      const value=source?.[i],key=keys[i];
      if(value==null)continue;
      const amount=value*size*(retention?.[key]??1);
      levels[key]=(levels[key]??0)+amount;
      if(key==='potassium'&&ingredient.category!=='调味品')levels.foodPotassium=(levels.foodPotassium??0)+amount;
    }
  }
  return levels;
}
export function referenceForPlan(p:Profile,t:Targets){return nutrientReferences(p,t);}

// 已知小计足以触发 UL。未知量仍在明细标出。保留原有的保守钠核验，PI-NCD 与 UL 分开。
export function upperIssues(levels:Levels,refs:Ref){
  return keys.filter(key=>refs[key]?.ul!==undefined&&(levels[key]??0)>refs[key]!.ul!);
}
export function nutritionLoss(levels:Levels,refs:Ref,prior?:{totals:Levels;days:number}) {
  let cost=0;
  for(const key of keys){
    const ref=refs[key];
    const goal=ref?.rni??(key==='sodium'?undefined:ref?.ai)??(key==='fiber'?ref?.range?.[0]:undefined);
    if(goal===undefined)continue;
    const scoreKey=key==='potassium'?'foodPotassium':key;
    const amount=levels[scoreKey]??0;
    const daily=Math.max(0,1-amount/goal);
    const week=prior?Math.max(0,1-((prior.totals[scoreKey]??0)+amount)/(prior.days+1)/goal):daily;
    cost+=(weight[key]??.035)*(.8*daily+.2*week);
  }
  for(const key of keys){
    const ul=refs[key]?.ul;
    if(ul!==undefined)cost+=Math.max(0,((levels[key]??0)-ul*.85)/ul)*.20;
  }
  const cap=refs.saturated?.ratioLimit;
  if(cap!==undefined)cost+=Math.max(0,((levels.saturated??0)-cap)/cap)*.07;
  return cost;
}
export function addLevels(target:Levels,part:Levels) {
  for(const key of keys)if(part[key]!==undefined)target[key]=(target[key]??0)+part[key]!;
  if(part.foodPotassium!==undefined)target.foodPotassium=(target.foodPotassium??0)+part.foodPotassium;
}
