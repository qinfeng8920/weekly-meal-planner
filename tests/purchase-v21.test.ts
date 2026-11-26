import {deepEqual,equal,ok,throws} from 'node:assert/strict';
import {test} from 'node:test';
import {recipeMap,serving} from '../src/catalog';
import {addDays,shoppingOffsets,shoppingSchedule} from '../src/batches';
import {consumedBySource,homeKey,legacyLedger,recordPurchase} from '../src/inventory';
import {executeJobs,type Execution} from '../src/execution';
import {weekUsage} from '../src/ingredient-pool';
import {planLogistics,receiptKey} from '../src/logistics';
import {logisticsSchema} from '../src/logistics-storage';
import {newPlanStart} from '../src/planner';
import {dateLabel} from '../src/ui';
import {purchaseFood,purchaseIngredientId} from '../src/purchase-food';
import type {Day} from '../src/shopping';
import {demo} from './fixtures';

const start='2026-11-23';
const profile={...demo,tools:['煮锅','蒸锅','冰箱','冷冻室']};
const single={prep:'每天' as const,shopping:{count:1 as const}};
const chickenPrice={amount:15,unit:'斤',basis:'净重'} as const;
const cookedRecipe=recipeMap.get('quick-chicken-salad')!;
const rawRecipe=recipeMap.get('steam-chicken')!;
const raw=serving(rawRecipe,1,[{id:'chicken',grams:300}]);
const cooked=serving(cookedRecipe,1,[{id:'cookedchicken',grams:450}]);
const week=(dishes:Day['meals'][number]['dishes'],day=0)=>Array.from({length:7},(_,i):Day=>({meals:i===day?[{name:'午餐',dishes}]:[]}));

test('生鸡胸 300 克和熟鸡胸 450 克合计净料 900 克和 27 元，营养保持原状态',()=>{
  const days=week([raw,cooked]);
  const before=structuredClone(days);
  const q=planLogistics(days,profile,start,{}, {settings:single,prices:{chicken:chickenPrice,cookedchicken:{...chickenPrice,amount:99}}});
  equal(q.lines.length,1);equal(q.lines[0].id,'chicken');equal(q.lines[0].need,900);equal(q.lines[0].buy,900);
  equal(q.lines[0].price?.amount,15);equal(q.purchase.known,27);
  deepEqual(q.prep[0].rows[0].uses.map(u=>[u.recipeId,u.recipeGrams,u.grams]),[['chicken',300,300],['cookedchicken',450,600]]);
  deepEqual(q.prep[0].jobs.flatMap(j=>j.ingredients).sort((a,b)=>a.id.localeCompare(b.id)),[{id:'chicken',grams:300},{id:'cookedchicken',grams:450}]);
  equal(weekUsage(days)[0].grams,900);
  const custom=planLogistics(days,profile,start,{}, {settings:single,prices:{chicken:chickenPrice},products:{yields:{cookedchicken:.9}}});
  equal(custom.lines[0].need,800);equal(custom.purchase.known,24);
  deepEqual(days,before);
  ok(logisticsSchema.safeParse(q).success);
});
test('按方法换算米、红薯、玉米和鸡蛋，保持商品差异与未知率',()=>{
  for(const [source,product,rawWeight,cookedWeight] of [
    ['cookedbrown','brown',100,280],['cookedsweet','sweet',100,90],['cookedcorn','corn',100,95],['boiledegg','egg',100,98],
  ] as const) {
    const a=serving(rawRecipe,1,[{id:product,grams:rawWeight}]);
    const b=serving(cookedRecipe,1,[{id:source,grams:cookedWeight}]);
    const q=planLogistics(week([a,b]),profile,start,{}, {settings:single});
    equal(q.lines.length,1);equal(q.lines[0].id,product);equal(q.lines[0].need,200);
    ok(purchaseFood(source).conversion?.source.startsWith('https://'));
  }
  for(const [a,b] of [['thigh','chicken'],['yogurt','greek'],['salmon','cannedsalmon'],['tofu','softtofu'],['egg','eggwhite'],['shrimp','scallop']]) {
    ok(purchaseIngredientId(a)!==purchaseIngredientId(b));
  }
  const unknown=planLogistics(week([raw,cooked]),profile,start,{}, {settings:single,products:{yields:{cookedchicken:null}}});
  ok(unknown.conflicts?.some(c=>c.includes('换算待补充')));equal(unknown.purchase.missing,1);
  equal(unknown.lines[0].consume,null);
  const ready=planLogistics(week([raw,cooked]),profile,start,{}, {settings:single,products:{ready:['cookedchicken']}});
  deepEqual(ready.lines.map(l=>l.id).sort(),['chicken','cookedchicken']);
  equal(ready.lines.find(l=>l.id==='cookedchicken')?.need,450);
});
test('出成率、可食率、包装和库存只换算一次，熟库存不能抵生料菜',()=>{
  const execution:Execution={stock:{
    chicken:{storage:'冷藏',expires:'2026-11-23'},
    cookedchicken:{storage:'冷藏',expires:'2026-11-23'},
  }};
  const days=week([raw,cooked]);
  const prices={chicken:{...chickenPrice,basis:'毛重' as const,yieldPercent:80,pack:500}};
  const pantry={chicken:{stock:100},cookedchicken:{stock:150}};
  const q=planLogistics(days,profile,start,pantry,{settings:single,execution,prices});
  // 150 克熟料相当于 200 克原料，另已确认 100 克生料。剩余 600 克净料买两份 500 克。
  equal(q.lines[0].stock,300);equal(q.lines[0].buy,1000);equal(q.purchase.known,30);
  const jobs=q.prep[0].jobs;
  const rawJob=jobs.find(job=>job.ingredients[0].id==='chicken')!;
  const initial=legacyLedger(pantry,{execution});
  throws(()=>executeJobs(initial,execution,[rawJob],'取用',true,start),/鸡胸肉 200 克/);
  const key=receiptKey(start,0,'chicken');
  const receipts={[key]:{gross:1000,net:800,paid:30}};
  const complete=executeJobs(recordPurchase(initial,key,undefined,receipts[key],start),execution,jobs,'取用',true,start);
  equal(consumedBySource(complete.execution).get(key),600);
  equal(consumedBySource(complete.execution).get(homeKey('cookedchicken')),150);
  equal(consumedBySource(complete.execution).get(homeKey('chicken')),100);
  equal(executeJobs(complete.ledger,complete.execution,[jobs[1]],'取用',true,start).ledger,complete.ledger);
  const after=planLogistics(days,profile,start,pantry,{settings:single,execution:complete.execution,ledger:complete.ledger,prices,receipts});
  equal(after.lines[0].remaining,0);equal(after.paid.known,30);equal(after.lines[0].need,900);
});
test('2 次采购与 2＋2＋3 分批独立，额外实际付款单列',()=>{
  const days=week([raw,cooked],5);
  const settings={prep:'每2～3天' as const,shopping:{count:2 as const},pattern:[2,2,3]};
  const old=receiptKey(start,1,'cookedchicken');
  const sameDay=receiptKey(start,0,'cookedchicken');
  const q=planLogistics(days,profile,start,{}, {settings,prices:{chicken:chickenPrice},
    receipts:{[old]:{gross:200,net:200,paid:13},[sameDay]:{gross:100,net:100,paid:8}}});
  deepEqual(q.batches.map(b=>b.day),[0,3]);
  deepEqual(q.prep.map(b=>b.range.to-b.range.from),[2,2,3]);
  deepEqual(q.actualBatches?.map(b=>b.lines[0].receiptKey),[sameDay,old]);
  ok(q.batches.every(b=>!b.lines.some(line=>line.id==='cookedchicken')));
  equal(q.paid.known,21);
  equal(q.batches.reduce((n,b)=>n+b.purchase.known,0),q.purchase.known);
  const noCold=planLogistics(days,{...profile,tools:['煮锅','蒸锅']},start,{}, {settings:single});
  equal(noCold.batches.length,1);
  ok(noCold.storageWarnings?.some(w=>w.includes('鸡胸肉')));
  ok(noCold.prep.flatMap(b=>b.jobs).every(j=>j.at===j.day));
  const three={...settings,shopping:{count:3 as const}};
  deepEqual(shoppingOffsets(three,profile,start),[0,2,4]);
  const custom={...settings,shopping:{count:'自定义' as const,offsets:[-1,2]}};
  deepEqual(shoppingOffsets(custom,profile,start),[-1,2]);
  throws(()=>shoppingOffsets(custom,profile,start,start),/已经过去/);
  deepEqual(shoppingSchedule({prep:'每周',purchase:'一次采购'},profile),{count:1});
});
test('新计划从明天起，日期按实际星期和本地日历计算',()=>{
  equal(newPlanStart(undefined,'2026-11-26'),'2026-11-27');
  equal(newPlanStart('今天','2026-11-26'),'2026-11-26');
  equal(newPlanStart('下周一','2026-11-26'),'2026-11-30');
  equal(newPlanStart('下周一','2026-11-30'),'2026-12-07');
  equal(dateLabel(addDays('2026-11-27',0)),'周五 11/27');
});
