import {cookOnServingDay} from './food-storage';
import type {Recipe} from './catalog';
import {cookingWorkflows,type Method} from './cooking-recipes';
import {cookingDuration,type CookingRule} from './cooking-profile';
import {labels} from './meal-catalog';

const coldTools=new Set(['冰箱','冷冻室','电子厨房秤']);
type RecipeCooking=ReturnType<typeof describe>;
const cache=new WeakMap<Recipe,RecipeCooking>();
function describe(r:Recipe) {
  const tools=r.tools.filter(t=>!coldTools.has(t));
  const parts=r.ingredients.filter(i=>i.grams>=15).length;
  const declared=cookingWorkflows.get(r.id);
  const method:Method=declared?.method??(r.cook===0?(parts===1?'即食':'凉拌'):
    tools.includes('微波炉')?'复热':tools.includes('炒锅')?'煎炒':tools.includes('蒸锅')?'蒸':
      r.cook>=26&&r.group==='汤类'?'炖煮':'煮');
  const activeHeat=Math.min(r.cook,declared?.activeHeat??(method==='煎炒'?r.cook:Math.min(3,r.cook)));
  const cutting=declared?.cutting??(parts<2&&r.prep<=2?0:r.prep>=9?2:1);
  const seasoning=declared?.seasoning??(r.ingredients.length<=2?0:r.ingredients.length>=6?2:1);
  const active=r.prep+activeHeat;
  const clean=tools.length+(cutting>0?1:0)+(method==='煎炒'?1:0);
  const effort=active*.36+cutting*1.35+seasoning*1.05+tools.length*.55+clean*.40+
    Math.max(0,r.steps.length-2)*.4;
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

export function mealCooking(recipes:Recipe[],rule:CookingRule,fridge:boolean) {
  const stats=recipes.map(recipeCooking);
  const fresh=recipes.map((r,i)=>({tools:stats[i].tools,prep:r.prep,cook:r.cook,active:stats[i].active,
    activeHeat:stats[i].active-r.prep}));
  const freshTotal=elapsed(fresh);
  const usePrep=rule.prep&&fridge&&(freshTotal>Math.min(rule.total,cookingDuration[rule.mode][1])||
    stats.reduce((n,s)=>n+s.active,0)>rule.active);
  const ahead=stats.flatMap((s,i)=>usePrep&&s.reheat?[{name:recipes[i].name,minutes:s.prepAhead,reheat:s.reheat}]:[]);
  const jobs=fresh.map((job,i)=>usePrep&&stats[i].reheat?
    {tools:job.tools,prep:1,cook:stats[i].reheat!,active:2,activeHeat:1}:job);
  const active=jobs.reduce((n,j)=>n+j.active,0);
  const total=elapsed(jobs);
  const tools=[...new Set(stats.flatMap(s=>s.tools))];
  const level=Math.max(1,...stats.map(s=>s.level));
  const mains=recipes.filter(r=>labels(r).slot!=='水果');
  const onePot=mains.length===1&&labels(mains[0]).slot==='一锅套餐'&&tools.length===1;
  return {active,total,waiting:Math.max(0,total-active),tools,level,ahead,onePot,count:recipes.length};
}

export type CookingStats=ReturnType<typeof mealCooking>;
export const complexityLabels=['','极简','简单','家常','精致'];
export function cookingConflict(stats:CookingStats,rule:CookingRule) {
  if(stats.count>rule.maxDishes)return '菜品数量';
  if(stats.total>rule.total)return '总用时';
  if(stats.active>rule.active)return '主动用时';
  if(rule.mode==='极简'&&stats.level>2)return '烹饪复杂度';
}
export function cookingFit(stats:CookingStats,rule:CookingRule) {
  const [low,high]=cookingDuration[rule.mode];
  const timing=rule.mode==='极简'||rule.mode==='简单'?Math.max(0,stats.total-high):
    Math.max(0,low-stats.total)*.45+Math.max(0,stats.total-high)*.45;
  const target=rule.mode==='极简'?1:rule.mode==='简单'?2:rule.mode==='家常'?3:4;
  return timing*.004+Math.abs(target-stats.level)*(rule.mode==='精致'?.065:.027)
    +(rule.onePot&&!stats.onePot?.055:0)+(rule.mode==='精致'?Math.max(0,4-stats.count)*.014:0);
}
