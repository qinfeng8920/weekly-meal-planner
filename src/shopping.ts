import {food,foodState,type Serving} from './catalog';
import {planLogistics,type Logistics,type SupplyState} from './logistics';
import type {CookingSelection} from './cooking-profile';
import {addDays} from './batches';
import {dateKey,type Profile} from './profile';

export type Pantry = Record<string,{stock?:number; bought?:number; price?:number; pack?:number; yieldPercent?:number}>;
export type Day = {meals: Meal[]};
export type Meal = {name:string; dishes:Serving[]};
export function mealMinutes(meal:Meal) {
  const devices = new Map<string,number>();
  const recipes = meal.dishes.map(s=>s.recipe).sort((a,b)=>b.cook-a.cook);
  let prepDone = 0;
  for (const recipe of recipes) {
    prepDone += recipe.prep;
    const finish = Math.max(prepDone,...recipe.tools.map(tool=>devices.get(tool)??0))+recipe.cook;
    for (const tool of recipe.tools) devices.set(tool,finish);
  }
  return Math.max(prepDone,...devices.values());
}
export type Purchase = {id:string; name:string; category:string; state:string; need:number; stock:number; buy:number; bought:number; done:boolean; cost:number|null; extra:number; part:number[]; uncertain:boolean};
export function shopping(days:Day[],p:Profile,pantry:Pantry,state?:SupplyState,start=dateKey()):Purchase[] {
  return purchasesFromLogistics(planLogistics(days,p,start,pantry,state));
}

export function purchasesFromLogistics(quote:Logistics):Purchase[] {
  return quote.lines.map(row=>{
    const f=food(row.id);
    return {id:row.id,name:f.name,category:f.category,state:foodState[f.state],need:row.need,stock:row.stock,buy:row.buy,
      bought:row.confirmed,done:!row.remaining,cost:row.cost.missing?null:row.cost.known,extra:row.remaining,
      part:quote.batches.map(b=>b.lines.find(l=>l.id===row.id)?.buy??0),uncertain:row.estimate===null};
  });
}

export type Prep = {mode:string;notice:string[];days:{date:string;task:string;minutes:number;meals:string[]}[]};

export function prepPlan(days:Day[],p:Profile,start:string,cooking?:CookingSelection,derived?:Logistics):Prep {
  const quote=derived??planLogistics(days,p,start,{},undefined,cooking);
  const sessions=quote.prep.flatMap(batch=>batch.sessions??[]);
  const jobs=quote.prep.flatMap(batch=>batch.jobs);
  return {mode:p.tools.includes('冰箱')?quote.settings.prep:'每天现做',notice:quote.notice,days:days.map((d,index)=>{
    const date=addDays(start,index);
    const planned=jobs.filter(job=>job.at===index);
    return {date,task:planned.length?'准备 '+[...new Set(planned.map(j=>j.meal))].join('、')+'。':'按食用日期安排。',
      minutes:sessions.filter(s=>s.date===date).reduce((n,s)=>n+s.total,0),
      meals:d.meals.map(meal=>meal.name+' · '+meal.dishes.map(s=>s.recipe.name).join('、'))};
  })};
}
