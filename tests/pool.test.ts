import {test} from 'node:test';
import {deepEqual,equal,ok,throws} from 'node:assert/strict';
import {cookingDefaults} from '../src/cooking-profile';
import {demo} from './fixtures';
import {food,recipeMap} from '../src/catalog';
import {newPlanStart,regenerate,verifyAgainst,type Plan} from '../src/planner';
import {counts,defaultPool,ingredientPools,poolGroups,poolModes,recipeFoodIds,visiblePoolModes,standardFoods,weekUsage,type PoolSettings} from '../src/ingredient-pool';
import {mealConflict} from '../src/food-semantics';
import {planLogistics,parallelSessions,receiptKey,type PrepJob,type Receipt} from '../src/logistics';
import {addDays,splitWeek} from '../src/batches';
import {balances,legacyLedger} from '../src/inventory';
import {executeJobs,type Execution} from '../src/execution';
import {fresh,parseBackup} from '../src/store';
import {logisticsSchema,supplySchema} from '../src/logistics-storage';

const restricted={...demo,age:'25',height:'173',weight:'72',target:'66',minutes:'20',tools:['煮锅','蒸锅']};
const general={...demo,sex:'女',age:'31',weight:'68',height:'164',target:'60',cooking:{...cookingDefaults,mode:'家常' as const},allergens:['花生']};
const profiles=[restricted,general,{...demo,meals:'4',tools:[...demo.tools,'冷冻室']}];
const emptyExecution={execution:{}};
let baseline:Plan|undefined;
const round=(n:number)=>Math.round(n*100)/100;
const avg=(values:number[])=>values.length?round(values.reduce((a,b)=>a+b,0)/values.length):null;

test('126 个 V2.1 种子按组记录生成、独立验收、集中度、复用和结余',()=>{
  const totals:Record<string,number>={};
  const results:{mode:string;profile:number;attempted:number;passed:number;qualified:number;failed:Record<string,number>;
    unique:number|null;core:number|null;counts:Record<string,number|null>;reusedPercent:number|null;projectedNetSurplusGrams:number|null;
    meanMsAll:number|null;meanMsSuccess:number|null;maxMs:number}[]=[];
  for(const mode of visiblePoolModes) for(const [index,p] of profiles.entries()) {
    const cases=Array.from({length:14},(_,i)=>`V2-${mode}-${index}-${i}`);
    const failed:Record<string,number>={};
    const times:number[]=[],unique:number[]=[], reused:number[]=[], surplus:number[]=[], core:number[]=[], starts:number[]=[];
    const byGroup:Record<string,number[]>=Object.fromEntries(poolGroups.map(g=>[g,[]]));
    let passed=0, unsafe=0;
    for(const seed of cases) {
      const start=performance.now();
      let plan:Plan;
      try {plan=regenerate(p,[],{},[],seed,undefined,[],undefined,undefined,emptyExecution,{settings:{...defaultPool,mode}});}
      catch(error) {
        const raw=(error as Error).message;
        const match=/主要冲突：([^。]+)/.exec(raw);
        const category=raw.includes('搜索上限')?'搜索上限'+(match?' '+match[1]:''):raw.replace(/第 \d+ 天/,'').split('。')[0];
        failed[category]=(failed[category]??0)+1;
        times.push(performance.now()-start);
        continue;
      }
      times.push(performance.now()-start);
      passed++;
      const quote=planLogistics(plan.days,p,plan.start,{},emptyExecution);
      try {
        verifyAgainst(plan,p,[],{},[],emptyExecution);
        equal(plan.days.length,7);
        for(const day of plan.days) for(const meal of day.meals) {
          equal(mealConflict(meal.dishes.map(r=>r.recipe)),undefined);
          ok(meal.dishes.every(d=>d.recipe.tools.every(t=>p.tools.includes(t))));
        }
        for(const row of quote.lines) {
          const prep=quote.prep.flatMap(b=>b.rows).filter(i=>i.id===row.id).reduce((sum,i)=>sum+i.grams,0);
          ok(Math.abs(prep-row.need)<.02);
        }
      }catch(error){unsafe++;console.error(seed,mode,error);}
      const used=weekUsage(plan.days), count=counts(used.map(r=>r.id));
      unique.push(used.length);reused.push(used.filter(r=>r.uses>1).length/used.length*100);
      surplus.push(quote.inventory.reduce((n,i)=>n+i.projected,0));
      core.push(poolGroups.reduce((n,g)=>n+count[g],0));
      starts.push(times.at(-1)!);
      for(const g of poolGroups)byGroup[g].push(count[g]);
      if(!baseline&&mode==='少量种类'&&index===0)baseline=plan;
    }
    totals[mode]=(totals[mode]??0)+passed;
    results.push({mode,profile:index+1,attempted:cases.length,passed,qualified:passed-unsafe,failed,
      unique:avg(unique),core:avg(core),counts:Object.fromEntries(poolGroups.map(g=>[g,avg(byGroup[g])])),
      reusedPercent:avg(reused),projectedNetSurplusGrams:avg(surplus),meanMsAll:avg(times),meanMsSuccess:avg(starts),maxMs:round(Math.max(...times))});
    equal(unsafe,0);
  }
  for(const row of results)console.log('V2.1 样本 '+JSON.stringify(row));
  ok(totals.少量种类>=30);
  ok(Object.values(totals).every(n=>n>=25));
  ok(results.filter(r=>r.mode==='少量种类').every((r,i)=>r.unique!<results.filter(r=>r.mode==='丰富多样')[i].unique!));
});

test('手动严格、锁定排除、可补充、保留和下一周轮换',()=>{
  baseline??=regenerate(restricted,[],{},[],'fixture',undefined,[],undefined,undefined,emptyExecution,{settings:{...defaultPool,mode:'极简采购'}});
  const prior=baseline.pool!;
  const selected=prior.used.map(i=>i.id);
  const proteins=selected.filter(id=>['肉类','鱼虾'].includes(food(id).category));
  ok(proteins.length>0);
  const strict:PoolSettings={...defaultPool,mode:'极简采购',method:'手动指定',strict:true,selected,locked:proteins.slice(0,1),excluded:['salmon']};
  const plan=regenerate(restricted,[],{},[],'strict',undefined,[],undefined,undefined,emptyExecution,{settings:{...strict,excluded:strict.selected.includes('salmon')?['lamb']:strict.excluded}});
  ok(plan.pool!.used.every(r=>selected.includes(r.id)));
  const namedMeats=['chicken','beef','shrimp'];
  const named=regenerate(restricted,[],{},[],'named-meats',undefined,[],undefined,undefined,emptyExecution,{settings:{
    ...defaultPool,mode:'自由搭配',method:'手动指定',strict:true,locked:namedMeats,
    selected:[...namedMeats,...standardFoods.filter(f=>!['肉类','鱼虾'].includes(f.category)).map(f=>f.id)],
  }});
  const meatIds=named.pool!.used.filter(i=>['肉类','鱼虾'].includes(food(i.id).category)).map(i=>i.id).sort();
  deepEqual(meatIds,[...namedMeats].sort());
  ok(plan.pool!.used.some(r=>r.id===strict.locked[0]));
  equal(plan.pool?.supplements.length,0);
  throws(()=>regenerate(restricted,[],{},[],'empty',undefined,[],undefined,undefined,emptyExecution,{settings:{...strict,locked:[],selected:['chicken','beef','shrimp']}}),/严格食材池/);
  throws(()=>regenerate(restricted,[],{},[],'conflict',undefined,[],undefined,undefined,emptyExecution,{settings:{...strict,excluded:strict.locked}}),/鸡胸肉同时被禁止/);
  const supplement=regenerate(restricted,[],{},[],'supp',undefined,[],undefined,undefined,emptyExecution,{settings:{...defaultPool,method:'手动指定',selected:[]}});
  ok(supplement.pool!.supplements.length>0);
  ok(supplement.pool!.supplements.every(r=>r.grams>0&&r.reason));
  const next=regenerate(restricted,[],{},[],'next',undefined,[],undefined,undefined,emptyExecution,{settings:prior.settings,previous:prior,nextWeek:true,keep:true});
  equal(next.start,newPlanStart('下周一'));
  deepEqual(next.pool!.selected,prior.used.map(row=>row.id).sort());
  const replaced=regenerate(restricted,[],{},[],'rotate',undefined,[],undefined,undefined,emptyExecution,{settings:{...prior.settings,rotation:'全部刷新'},previous:prior,nextWeek:true});
  ok(replaced.pool!.used.some(r=>!selected.includes(r.id)));
});

test('库存优先实际参与食材候选评分',()=>{
  const recipes=['steam-chicken','steam-bass','steam-pork','steam-shrimp','boil-broccoli'].flatMap(id=>recipeMap.get(id)??[]);
  ok(recipes.flatMap(r=>recipeFoodIds(r)).includes('bass'));
  const s:PoolSettings={...defaultPool,method:'库存优先',caps:{肉鱼虾:1}};
  const priorities=ingredientPools(s,recipes,{bass:{stock:9000}},emptyExecution,()=>.3);
  ok(priorities[0].selected.has('bass'));
});

test('分装、制作和撤销使用同一取用记录，旧日期保留账面库存',()=>{
  const start='2026-11-23', now='2026-12-28';
  const job:PrepJob={key:start+'|0|早餐|quick-oats',at:0,day:0,meal:'早餐',name:'燕麦',method:'当天制作',active:2,waiting:4,tools:['煮锅'],steps:[],ingredients:[{id:'oats',grams:120}]};
  const pantry={oats:{stock:50},chicken:{stock:90}};
  const execution:Execution={stock:{oats:{expires:'2026-12-20',storage:'干燥常温'},chicken:{expires:'2026-11-22',storage:'冷藏'}}};
  const key=receiptKey(start,0,'oats');
  const receipts:Record<string,Receipt>={[key]:{gross:500,net:500,paid:20}};
  const initial=legacyLedger(pantry,{receipts,execution});
  const packed=executeJobs(initial,execution,[job],'分装',true,now);
  equal(packed.ledger,initial);
  const prepared=executeJobs(packed.ledger,packed.execution,[job],'制作',true,now);
  equal(balances(prepared.ledger).get('oats'),380);
  equal(balances(prepared.ledger).get('chicken'),90);
  const completed=executeJobs(prepared.ledger,prepared.execution,[job],'取用',true,now);
  equal(completed.ledger,prepared.ledger);
  const bigger={...job,ingredients:[{id:'oats',grams:160}]};
  equal(executeJobs(completed.ledger,completed.execution,[bigger],'取用',true,now).ledger,completed.ledger);
  equal(balances(executeJobs(completed.ledger,completed.execution,[job],'取用',false,now).ledger).get('oats'),500);
  throws(()=>executeJobs(completed.ledger,completed.execution,[{...job,key:start+'|1|午餐|quick-oats',ingredients:[{id:'chicken',grams:95}]}],'取用',true,now),/账面库存不足/);
  ok(supplySchema.safeParse({execution:completed.execution,receipts,ledger:completed.ledger}).success);
  const state={...fresh(),supply:{execution:completed.execution,receipts,ledger:completed.ledger}};
  deepEqual(parseBackup(JSON.stringify(state)),JSON.parse(JSON.stringify(state)));
});
test('分装克数核对、周期覆盖、实际购入跨批结转以及并行厨具计算',()=>{
  const plan=baseline!;
  const settings={prep:'每2～3天' as const,purchase:'一次采购' as const,pattern:[3,2,2]};
  const quote=planLogistics(plan.days,plan.profile,plan.start,{}, {execution:{},settings});
  deepEqual(splitWeek(settings).flatMap(r=>Array.from({length:r.to-r.from},(_,i)=>i+r.from)),[0,1,2,3,4,5,6]);
  equal(round(quote.batches.reduce((n,b)=>n+b.purchase.known,0)),quote.purchase.known);
  for(const batch of quote.prep)for(const job of batch.jobs) {
    for(const i of job.ingredients)equal(batch.rows.flatMap(r=>r.uses).find(u=>u.jobKey===job.key&&u.recipeId===i.id)?.recipeGrams,i.grams);
    ok(!/冷冻|制作冷藏/.test(job.method));
  }
  ok(logisticsSchema.safeParse(quote).success);
  const jobs:PrepJob[]=['煮锅','蒸锅'].map((tool,i)=>({day:0,at:0,name:'菜'+i,meal:'晚餐',method:'当天',active:4,waiting:20,tools:[tool],steps:[],ingredients:[]}));
  const separate=parallelSessions(jobs,plan.start)[0];
  const same=parallelSessions(jobs.map(j=>({...j,tools:['煮锅']})),plan.start)[0];
  equal(separate.active,8);
  ok(separate.total<same.total);
});
