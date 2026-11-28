import {deepEqual,equal,ok,throws} from 'node:assert/strict';
import {test} from 'node:test';
import {food,recipeMap,serving} from '../src/catalog';
import {executeJobs,type Execution} from '../src/execution';
import {adjustStock,balances,emptyLedger,legacyLedger,recordPurchase,resolveReview,reverseAdjustment,type Ledger} from '../src/inventory';
import {planLogistics,prepSchedule,receiptKey,type PrepJob,type Receipt,type SupplyState} from '../src/logistics';
import {purchaseCategory} from '../src/purchase-category';
import {amountFor,priceDefaults,purchaseGrams} from '../src/prices';
import {fresh,parseBackup} from '../src/store';
import {regenerate} from '../src/planner';
import type {Day} from '../src/shopping';
import {demo} from './fixtures';

const week='2026-11-23', month='2027-01-04';
const foodPurchase=(n:number,date=week):Receipt=>({gross:n,net:n,quantity:n,unit:'克',date});
const settings:SupplyState['settings']={prep:'每2～3天',pattern:[2,2,3],shopping:{count:2}};
const job=(key:string,id:string,grams:number):PrepJob=>({key,day:0,at:0,name:food(id).name,meal:'午餐',method:'当天做',active:0,waiting:0,tools:[],steps:[],ingredients:[{id,grams}]});
const key=week+'|0|午餐|test';
const recipe=recipeMap.get('steam-chicken')!;
function days(id:string,grams:number,days:number[]=[0]):Day[] {
  return Array.from({length:7},(_,i)=>({meals:days.includes(i)?[{name:'午餐',dishes:[serving(recipe,1,[{id,grams}])]}]:[]}));
}

test('购买按实入库，600 克取用后跨周跨月结转 400 克',()=>{
  const source=receiptKey(week,0,'chicken');
  const q=planLogistics(days('chicken',750),demo,week,{}, {settings});
  equal(q.lines[0].remaining,750);
  const buy=foodPurchase(1000), ledger=recordPurchase(emptyLedger(),source,undefined,buy,week);
  equal(balances(ledger).get('chicken'),1000);
  equal(recordPurchase(ledger,source,undefined,buy,week),ledger);
  equal(recordPurchase(ledger,source,buy,buy,week),ledger);
  const taken=executeJobs(ledger,{},[job(key,'chicken',600)],'取用',true,week);
  equal(balances(taken.ledger).get('chicken'),400);
  for(const date of ['2026-11-30',month]) {
    const planned=planLogistics(days('chicken',200),demo,date,{}, {settings,ledger:taken.ledger,receipts:{[source]:buy}});
    equal(planned.lines[0].remaining,0);
    equal(planned.inventory[0].usable,400);
    equal(planned.inventory[0].projected,200);
    equal(planned.purchase.known,0);
  }
  throws(()=>recordPurchase(taken.ledger,source,buy,foodPurchase(500),week),/余额不足/);
  const revised=recordPurchase(taken.ledger,source,buy,foodPurchase(900),week);
  equal(balances(revised).get('chicken'),300);
  throws(()=>recordPurchase(revised,source,foodPurchase(900),undefined,week),/余额不足/);
  const undone=executeJobs(revised,taken.execution,[job(key,'chicken',600)],'取用',false,month);
  const cancelled=recordPurchase(undone.ledger,source,foodPurchase(900),undefined,month);
  equal(balances(cancelled).get('chicken'),0);
  equal(cancelled.events.at(-1)?.kind,'撤销');
});

test('盐取用 25 克后保留 475 克，油瓶累加且单位可靠换算',()=>{
  const a='手动|salt-a|salt', b='手动|salt-b|salt';
  let ledger=recordPurchase(emptyLedger(),a,undefined,{...foodPurchase(500),quantity:1,unit:'袋'},week);
  const picked=executeJobs(ledger,{},[job(key,'salt',25)],'用餐',true,week);
  equal(balances(picked.ledger).get('salt'),475);
  const prices={salt:{amount:4,unit:'袋',basis:'净重',unitGrams:500}} as const;
  const q=planLogistics(days('salt',25),demo,month,{}, {settings,prices,ledger:picked.ledger});
  equal(q.batches.length,2);
  equal(q.prep.length,3);
  equal(q.purchase.known,0);
  equal(q.lines[0].remaining,0);
  equal(q.inventory[0].projected,450);
  ledger=recordPurchase(picked.ledger,b,undefined,foodPurchase(500,month),month);
  equal(balances(ledger).get('salt'),975);
  const bottle={...priceDefaults.canola,unit:'瓶' as const,unitGrams:920};
  equal(purchaseGrams(2,'瓶',bottle),1840);
  equal(purchaseGrams(250,'毫升',priceDefaults.canola),230);
  equal(purchaseGrams(2,'袋',undefined,500),1000);
  equal(purchaseGrams(1,'盒',priceDefaults.canola),undefined);
  equal(purchaseGrams(3,'斤'),1500);
  equal(purchaseGrams(1,'公斤'),1000);
  equal(amountFor(920,bottle),18.12);
  for(const id of ['a','b'])ledger=recordPurchase(ledger,'手动|oil-'+id+'|canola',undefined,{...foodPurchase(920),quantity:1,unit:'瓶'},week);
  equal(balances(ledger).get('canola'),1840);
  const lost=adjustStock(ledger,'canola',240,'报损',month,'调整|a|canola');
  equal(balances(lost).get('canola'),1600);
  equal(balances(reverseAdjustment(lost,lost.events.at(-1)!.id,month)).get('canola'),1840);
});

test('整批提交原子完成，重复取用、制作和用餐只扣一次',()=>{
  const opening=adjustStock(emptyLedger(),'chicken',1000,'增加',week,'调整|x|chicken');
  const jobs=[job(key,'chicken',600),job(week+'|1|午餐|test','chicken',300)];
  throws(()=>executeJobs(opening,{},[...jobs,job(week+'|2|午餐|test','chicken',101)],'取用',true,week),/库存不足/);
  equal(balances(opening).get('chicken'),1000);
  const taken=executeJobs(opening,{},jobs,'取用',true,week);
  equal(balances(taken.ledger).get('chicken'),100);
  const repeat=executeJobs(taken.ledger,taken.execution,jobs,'取用',true,week);
  equal(repeat.ledger,taken.ledger);
  const made=executeJobs(repeat.ledger,repeat.execution,jobs,'制作',true,week);
  const eaten=executeJobs(made.ledger,made.execution,jobs,'用餐',true,week);
  equal(eaten.ledger,taken.ledger);
  ok(jobs.every(j=>eaten.execution.tasks?.[j.key!]?.eaten));
  throws(()=>executeJobs(eaten.ledger,eaten.execution,jobs,'取用',false,week),/撤销制作或用餐/);
  const undoMeal=executeJobs(eaten.ledger,eaten.execution,jobs,'用餐',false,week);
  ok(jobs.every(j=>undoMeal.execution.tasks?.[j.key!]?.made));
  const undoCook=executeJobs(undoMeal.ledger,undoMeal.execution,jobs,'制作',false,week);
  const restored=executeJobs(undoCook.ledger,undoCook.execution,jobs,'取用',false,week);
  equal(balances(restored.ledger).get('chicken'),1000);
  throws(()=>adjustStock(restored.ledger,'chicken',1001,'扣除',week,'调整|x|chicken'),/不足/);
});

test('旧周收据和取用能幂等迁移，疑似重叠库存等待确认',()=>{
  const source=receiptKey(week,0,'chicken');
  const execution:Execution={stock:{chicken:{expires:'2026-11-24',storage:'冷藏'}},tasks:{
    [key]:{taken:{date:week,allocation:[{id:'chicken',source,grams:600}]}}
  }};
  const sourceState={...fresh(),pantry:{chicken:{stock:1000},salt:{stock:500}},
    supply:{receipts:{[source]:{gross:1000,net:1000,paid:30}},execution}};
  const migrated=parseBackup(JSON.stringify(sourceState));
  const ledger=migrated.supply!.ledger!;
  equal(balances(ledger).get('chicken'),400);
  equal(balances(ledger).get('salt'),500);
  equal(ledger.review[0].grams,1000);
  equal(ledger.events.find(e=>e.kind==='采购入库')?.paid,30);
  deepEqual(parseBackup(JSON.stringify(migrated)),migrated);
  deepEqual(migrated.supply?.execution,sourceState.supply.execution);
  deepEqual(migrated.pantry,sourceState.pantry);
  equal(balances(resolveReview(ledger,ledger.review[0].id,50,month)).get('chicken'),450);
  const q=planLogistics(days('chicken',800,[0,4]),demo,month,migrated.pantry,migrated.supply);
  equal(q.lines[0].stock+q.lines[0].carry,400);
  equal(q.lines[0].remaining,1200);
  equal(q.batches.reduce((n,b)=>n+b.purchase.known,0),q.purchase.known);
  throws(()=>parseBackup(JSON.stringify({...migrated,supply:{...migrated.supply,
    ledger:{...ledger,events:[...ledger.events,ledger.events[0]]}}})),/库存流水/);
});

test('调味料按组补货，取用计入钠和脂肪，集中与各日耗时分列',()=>{
  equal(purchaseCategory('salt'),'常备调味料');
  equal(purchaseCategory('canola'),'常备调味料');
  equal(purchaseCategory('scallion'),'新鲜调味食材');
  equal(purchaseCategory('chicken'),'主要食材');
  const selected=Array.from({length:7},():Day=>({meals:[{name:'午餐',dishes:[serving(recipe)]}]}));
  const q=planLogistics(selected,{...demo,tools:[...demo.tools,'冷冻室']},week,{}, {settings});
  equal(q.batches.length,2);
  equal(q.prep.length,3);
  ok(q.categories.主要食材.known>0);
  ok(q.categories.常备调味料.known>0);
  ok(q.categories.新鲜调味食材.known>0);
  ok(selected[0].meals[0].dishes[0].nutrients.sodium!>0);
  const a=serving(recipe,1,[{id:'salt',grams:1},{id:'canola',grams:10}]).nutrients;
  ok(a.sodium!>0&&a.fat>0);
  const plan=prepSchedule({...q.prep[0],jobs:[{...job(key,'chicken',100),active:5,waiting:20,day:1,reheat:6},
    {...job(key,'salt',5),active:2,waiting:3,at:1,day:1}]},week);
  equal(plan.concentrated[0].total,25);
  ok(plan.later[0].total>0&&plan.later[0].total<25);
});

test('生成和保存新旧方案不改变真实库存',()=>{
  const initial=legacyLedger({salt:{stock:500}});
  const plan=regenerate(demo,[],{},[],'真实库存独立',undefined,[],undefined,undefined,{settings,ledger:initial});
  const state={...fresh(),profile:demo,plan,history:[plan],supply:{ledger:initial}};
  const first=parseBackup(JSON.stringify(state));
  const cleared=parseBackup(JSON.stringify({...first,plan:null,history:[]}));
  equal(balances(cleared.supply!.ledger!).get('salt'),500);
  deepEqual(cleared.supply!.ledger,first.supply!.ledger);
});
