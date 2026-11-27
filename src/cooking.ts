import {recipeBaseId} from './substitution';
import {cookOnServingDay} from './food-storage';
import type {Recipe} from './catalog';
import {cookingWorkflows,type Method} from './cooking-recipes';
import {type CookingRule} from './cooking-profile';
import {labels} from './meal-catalog';

const coldTools=new Set(['冰箱','冷冻室','电子厨房秤']);
type RecipeCooking=ReturnType<typeof describe>;
const cache=new WeakMap<Recipe,RecipeCooking>();
function describe(r:Recipe) {
  const tools=r.tools.filter(t=>!coldTools.has(t));
  const parts=r.ingredients.filter(i=>i.grams>=15).length;
  const declared=cookingWorkflows.get(recipeBaseId(r));
  const method:Method=declared?.method??(r.cook===0?(parts===1?'即食':'凉拌'):
    tools.includes('微波炉')?'复热':tools.includes('炒锅')?'煎炒':tools.includes('蒸锅')?'蒸':
      r.cook>=26&&r.group==='汤类'?'炖煮':'煮');
  const activeHeat=Math.min(r.cook,declared?.activeHeat??(method==='煎炒'?r.cook:Math.min(3,r.cook)));
  const cutting=declared?.cutting??(parts<2&&r.prep<=2?0:r.prep>=9?2:1);
  const seasoning=declared?.seasoning??(r.ingredients.length<=2?0:r.ingredients.length>=6?2:1);
  const active=r.prep+activeHeat;
  const clean=tools.length+(cutting>0?1:0)+(method==='煎炒'?1:0);
  const effort=cutting*2.4+seasoning*1.8+tools.length*.8+clean*.7+
    Math.max(0,r.steps.length-1)*.85;
  const level=effort<=4?1:effort<=8?2:effort<=13?3:4;
  const reheat=r.ingredients.some(i=>cookOnServingDay(i.id))?undefined:declared?.reheat;
  const total=r.prep+r.cook;
  return {method,active,wait:total-active,total,cutting,seasoning,steps:r.steps.length,tools,toolCount:tools.length,
    clean,level,onePot:tools.length===1,canPrep:r.batch,prepAhead:r.batch?total:0,reheat};
}

export function recipeCooking(r:Recipe) {
  const cached=cache.get(r);
  if(cached)return cached;
  const value=describe(r);cache.set(r,value);return value;
}

type Job={tools:string[]; prep:number; cook:number; active:number; activeHeat:number};
function elapsed(jobs:Job[]) {
  const devices=new Map<string,number>();
  let hands=0, end=0;
  for(const job of [...jobs].sort((a,b)=>b.cook-a.cook)) {
    hands+=job.prep;
    const start=Math.max(hands,...job.tools.map(tool=>devices.get(tool)??0));
    end=Math.max(end,start+job.cook);
    for(const tool of job.tools) devices.set(tool,start+job.cook);
    if(job.activeHeat) hands=start+job.activeHeat;
  }
  return Math.max(hands,end);
}

export function mealComplexity(recipes:Recipe[]) {
  const stats=recipes.map(recipeCooking);
  const tools=[...new Set(stats.flatMap(s=>s.tools))];
  const level=Math.max(1,...stats.map(s=>s.level));
  const mains=recipes.filter(r=>labels(r).slot!=='水果');
  const onePot=mains.length===1&&labels(mains[0]).slot==='一锅套餐'&&tools.length===1;
  return {tools,level,onePot,count:recipes.length};
}
export type MealComplexity=ReturnType<typeof mealComplexity>;
export function mealCooking(recipes:Recipe[]) {
  const jobs=recipes.map(r=>{
    const stats=recipeCooking(r);
    return {tools:stats.tools,prep:r.prep,cook:r.cook,active:stats.active,activeHeat:stats.active-r.prep};
  });
  const active=jobs.reduce((n,j)=>n+j.active,0);
  const total=elapsed(jobs);
  return {...mealComplexity(recipes),active,total,waiting:Math.max(0,total-active)};
}

export function cookingFit(stats:MealComplexity,rule:CookingRule) {
  const target=rule.mode==='简单'||rule.mode==='极简'?1:rule.mode==='家常'?3:null;
  return (target===null?0:Math.abs(target-stats.level)*.025)+(rule.onePot&&!stats.onePot?.04:0);
}
