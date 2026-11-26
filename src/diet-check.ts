import {sum,type Nutrients} from './nutrition';
import type {Day} from './shopping';

export const calciumCeiling=2000;

export const reference = {
  calcium:{label:'钙',amount:800,unit:'毫克',max:false},
  potassium:{label:'钾',amount:2000,unit:'毫克',max:false},
  vitaminC:{label:'维生素 C',amount:100,unit:'毫克',max:false},
  fiber:{label:'膳食纤维',amount:25,unit:'克',max:false},
  sodium:{label:'钠',amount:2000,unit:'毫克',max:true},
};
export function dailyIntake(day:Day) {
  return sum(day.meals.flatMap(meal=>meal.dishes.map(s=>s.nutrients)));
}
export function nutritionReview(days:Day[]) {
  const values=days.map(dailyIntake);
  const keys=Object.keys(reference) as (keyof typeof reference)[];
  return keys.map(key=>{
    const ref=reference[key];
    const complete=values.map(n=>n[key]).filter((n):n is number=>n!==null);
    const amount=complete.length===days.length && complete.length ? complete.reduce((a,b)=>a+b,0)/days.length : null;
    return {...ref,key,value:amount,goal:ref.amount,missing:days.length-complete.length,
      status:amount===null?'数据不全':key==='calcium'&&amount>calciumCeiling?'高于参考上限':(ref.max?amount>ref.amount:amount<ref.amount)?(ref.max?'高于参考':'低于参考'):'达到参考'};
  });
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
