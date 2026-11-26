import {sum,type Nutrients} from './nutrition';
import {food} from './catalog';
import type {Day} from './shopping';

export const calciumCeiling=2000;
const oils=new Set(['canola','olive','peanutoil','sesameoil']);

export const reference = {
  calcium:{label:'钙',amount:800,unit:'毫克',max:false},
  potassium:{label:'钾',amount:2000,unit:'毫克',max:false},
  vitaminC:{label:'维生素 C',amount:100,unit:'毫克',max:false},
  fiber:{label:'膳食纤维',amount:25,unit:'克',max:false},
  sodium:{label:'钠',amount:2000,unit:'毫克',max:true},
  vegetables:{label:'蔬菜',amount:300,unit:'克',max:false},
};
export function dailyIntake(day:Day) {
  return sum(day.meals.flatMap(meal=>meal.dishes.map(s=>s.nutrients)));
}
export function nutritionReview(days:Day[]) {
  const values=days.map(day=>{
    const ingredients=day.meals.flatMap(meal=>meal.dishes.flatMap(s=>s.ingredients));
    const vegetables=ingredients.filter(i=>food(i.id).category==='蔬菜').reduce((n,i)=>n+i.grams,0);
    return {...dailyIntake(day),vegetables};
  });
  const keys=Object.keys(reference) as (keyof typeof reference)[];
  const rows=keys.map(key=>{
    const ref=reference[key];
    const complete=values.map(n=>n[key]).filter((n):n is number=>n!==null);
    const amount=complete.length===days.length && complete.length ? complete.reduce((a,b)=>a+b,0)/days.length : null;
    return {...ref,key,value:amount,goal:ref.amount,missing:days.length-complete.length,
      status:amount===null?'数据不全':key==='calcium'&&amount>calciumCeiling?'高于参考上限':(ref.max?amount>ref.amount:amount<ref.amount)?(ref.max?'高于参考':'低于参考'):'达到参考'};
  });  const oil=days.length?days.flatMap(d=>d.meals.flatMap(m=>m.dishes.flatMap(s=>s.ingredients)))
    .filter(i=>oils.has(i.id)).reduce((n,i)=>n+i.grams,0)/days.length:null;
  return [...rows,{key:'oil' as const,label:'食用油',amount:30,goal:30,unit:'克',max:true,value:oil,missing:0,
    status:oil===null?'数据不全':oil>30?'高于参考':'未超参考上限'}];
}
export function nutrientPenalty(n:Nutrients) {
  // 优先补齐不足。界面分别标注缺值与真实低值。
  const shortfall=(value:number|null,goal:number)=>value===null?1:Math.max(0,1-value/goal);
  return shortfall(n.calcium,reference.calcium.amount)*.63+
    Math.max(0,((n.calcium??0)-1250)/750)*.08+
    shortfall(n.potassium,reference.potassium.amount)*.16+
    shortfall(n.vitaminC,reference.vitaminC.amount)*.23+
    shortfall(n.fiber,reference.fiber.amount)*.15;
}
