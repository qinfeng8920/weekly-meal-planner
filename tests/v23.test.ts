import {deepEqual,equal,notEqual,ok,throws} from 'node:assert/strict';
import {test} from 'node:test';
import {food,recipeMap,serving} from '../src/catalog';
import {executeJobs,scopedTaskKey,taskKey} from '../src/execution';
import {adjustStock,balances,emptyLedger,recordPurchase} from '../src/inventory';
import {planLogistics,receiptKey,type PrepJob,type Receipt,type SupplyState} from '../src/logistics';
import {executionLocked,regenerate,revise} from '../src/planner';
import {prepWork} from '../src/prep-work';
import {purchaseCategory} from '../src/purchase-category';
import {fresh,parseBackup} from '../src/store';
import {nutritionReview} from '../src/diet-check';
import {defaultPool} from '../src/ingredient-pool';
import type {Day} from '../src/shopping';
import {demo} from './fixtures';

const start='2026-11-30';
const scope='a1234567-1111-4111-8111-123456789010';
const other='b1234567-1111-4111-8111-123456789010';
const settings:SupplyState['settings']={prep:'每天',shopping:{count:1}};
const chicken=recipeMap.get('steam-chicken')!;
const single=(id:string,grams:number)=>Array.from({length:7},(_,i)=>({meals:i?[]:[{name:'午餐',dishes:[serving(chicken,1,[{id,grams}])]}]}));
const receipt=(gross:number,date:string,paid?:number):Receipt=>({gross,net:gross,date,paid});

test('方案范围、实际份量和换算共同区分任务，历史取用冻结实际口径',()=>{
  const base=taskKey(start,0,'午餐','steam-chicken');
  const quantities=[{id:'cookedchicken',grams:75}];
  const one=scopedTaskKey(base,scope,0,quantities);
  notEqual(one,scopedTaskKey(base,other,0,quantities));
  notEqual(one,scopedTaskKey(base,scope,0,[{...quantities[0],grams:95}]));
  notEqual(one,scopedTaskKey(base,scope,0,quantities,{yields:{cookedchicken:.9}}));
  const source='手动|first|chicken';
  const buy=receipt(300,start,12);
  const ledger=recordPurchase(emptyLedger(),source,undefined,buy,start);
  const state={settings,ledger,receipts:{[source]:buy}};
  const quote=planLogistics(single('cookedchicken',75),demo,start,{},state,undefined,undefined,scope);
  const job=quote.prep[0].jobs[0];
  equal(job.key,one);
  const taken=executeJobs(ledger,{},[job],'用餐',true,start);
  const updated={...state,...taken,products:{yields:{cookedchicken:.9}}};
  const frozen=planLogistics(single('cookedchicken',75),{...demo,people:'2'},start,{},updated,undefined,undefined,scope);
  equal(frozen.prep[0].jobs[0].key,one);
  equal(frozen.prep[0].jobs[0].ingredients[0].grams,75);
  equal(frozen.lines[0].uses[0].sourcing?.taken,100);
  equal(frozen.lines[0].remaining,0);
  equal(balances(taken.ledger).get('chicken'),200);
  const freshPlan=planLogistics(single('cookedchicken',95),demo,start,{},updated,undefined,undefined,other);
  equal(freshPlan.lines[0].uses[0].sourcing?.taken,0);
});

test('已执行自动锁定，重生成保留原份量、原任务和真实扣减',()=>{
  const plan=regenerate(demo,[],{},[],'V23 执行',undefined,[],undefined,undefined,{settings},{settings:defaultPool});
  const job=plan.logistics!.prep.flatMap(b=>b.jobs).find(j=>j.day===0&&j.meal==='午餐')!;
  let stock=emptyLedger();
  for(const id of new Set(job.ingredients.map(i=>i.id)))stock=adjustStock(stock,id,2000,'增加',plan.start,'调整|test|'+id);
  const result=executeJobs(stock,{},[job],'用餐',true,plan.start);
  const supply={settings,execution:result.execution,ledger:result.ledger};
  const mi=plan.days[0].meals.findIndex(m=>m.name==='午餐');
  const di=Number(job.key!.split('|')[5]);
  ok(executionLocked(plan,result.execution,0,mi,di));
  throws(()=>revise(plan,demo,[],{},[],0,mi,di,[175],supply),/已执行/);
  throws(()=>regenerate(demo,[],{},[],'换菜',plan,[],{day:0,meal:mi},undefined,supply),/已执行/);
  const next=regenerate(demo,[],{},[],'V23 保留',plan,[],undefined,undefined,supply,{settings:defaultPool});
  equal(next.taskScope,plan.taskScope);
  deepEqual(next.days[0].meals[mi],plan.days[0].meals[mi]);
  ok(next.logistics!.prep.flatMap(b=>b.jobs).some(j=>j.key===job.key));
  equal(executeJobs(result.ledger,result.execution,[job],'用餐',true,plan.start).ledger,result.ledger);
  const data={...fresh(),profile:demo,plan:next,supply};
  equal(parseBackup(JSON.stringify(data)).plan?.taskScope,next.taskScope);
});

test('按购买日期归属费用，同日两笔累计且待填实付单列',()=>{
  const inside=receiptKey(start,0,'chicken');
  const receipts={
    [inside]:receipt(100,'2026-11-29',22),
    '手动|one|chicken':receipt(250,start,18),
    '手动|two|chicken':receipt(250,start,19),
    '手动|soy|soymilk':receipt(100,start),
  };
  let ledger=emptyLedger();
  for(const [id,value] of Object.entries(receipts))ledger=recordPurchase(ledger,id,undefined,value,value.date!);
  equal(balances(ledger).get('chicken'),600);
  const quote=planLogistics(single('chicken',800),demo,start,{}, {settings,receipts,ledger});
  equal(quote.actualPaid?.known,37);
  equal(quote.actualBatches![0].lines.length,3);
  equal(quote.unpricedPaid?.items,1);
  equal(quote.purchase.known,+(quote.actualPaid!.known+quote.remaining.known+quote.unpricedPaid!.known).toFixed(2));
  equal(quote.purchase.known,quote.categories.主要食材.known);
  equal(planLogistics(single('chicken',50),demo,'2026-11-23',{}, {settings,receipts,ledger}).actualPaid?.known,22);
});

test('同日同工序集中，独立储存批次分开，共享进度不产生库存扣减',()=>{
  const make=(date:number,n:number,method:string,slot:number):PrepJob=>({
    key:scopedTaskKey(taskKey(start,slot,'午餐','steam-chicken'),scope,0,[{id:'cookedbrown',grams:n}]),day:slot,at:date,
    name:'糙米饭',meal:'午餐',method,waiting:45,active:3,tools:['煮锅'],steps:[],ingredients:[{id:'cookedbrown',grams:n}],
  });
  const rows=[make(0,140,'当天现做',0),make(0,210,'当天现做',1),make(0,100,'熟后分盒冷冻',2),make(1,100,'当天现做',3)];
  const batch={...planLogistics(single('chicken',100),demo,start,{}, {settings}).prep[0],jobs:rows};
  const groups=prepWork(batch);
  equal(groups.length,1);
  equal(groups[0].raw,125);
  equal(groups[0].cooked,350);
  equal(prepWork(batch,{},new Map([['cookedbrown',350]])).length,0);
  const readyTaken={tasks:{[rows[0].key!]:{taken:{date:start,allocation:[{id:'cookedbrown',source:'家中|cookedbrown',grams:140}]}}}};
  equal(prepWork(batch,{},new Map(),readyTaken).length,0);
  equal(prepWork(batch,{},new Map(),{shared:{[groups[0].key]:true}})[0].key,groups[0].key);
});

test('实际份量已取整，营养和分装使用同份数据，记录主要采购种类',()=>{
  const result:number[]=[];
  for(let i=0;i<14;i++){
    const plan=regenerate(demo,[],{},[],String(i)+' V23 克数',undefined,[],undefined,undefined,{settings},{settings:defaultPool});
    result.push(plan.pool!.used.filter(row=>purchaseCategory(row.id)==='主要食材').length);
    for(const day of plan.days)for(const meal of day.meals)for(const dish of meal.dishes){
      for(const i of dish.ingredients)if(['肉类','鱼虾','主食','蔬菜'].includes(food(i.id).category)&&i.grams>=10)equal(i.grams%5,0);
      deepEqual(dish.nutrients,serving(dish.recipe,1,dish.ingredients).nutrients);
    }
    const rows=plan.logistics!.prep.flatMap(b=>b.rows);
    for(const item of plan.logistics!.lines){
      const total=rows.filter(r=>r.id===item.id).reduce((n,r)=>n+r.grams,0);
      ok(Math.abs(total-item.need)<.02);
    }
    ok(nutritionReview(plan.days).some(row=>row.key==='vegetables'&&row.value!>=300));
    ok(nutritionReview(plan.days).some(row=>row.key==='oil'&&row.value!>0));
  }
  console.log('V2.3 单人主要食材种类 '+JSON.stringify(result));
  ok(result.reduce((n,x)=>n+x,0)/result.length<=17.5);
});

test('累计保存 2500 笔独立库存事件与旧字段可往返',()=>{
  const ledger={...emptyLedger(),events:Array.from({length:2500},(_,i)=>({
    id:'测试流水|'+i,item:'salt',source:'测试来源|'+i+'|salt',kind:'手动补充' as const,quantity:1,unit:'克' as const,
    date:'2023-01-02',delta:1,
  }))};
  const data={...fresh(),profile:demo,pantry:{oats:{stock:60}},supply:{ledger}};
  const restored=parseBackup(JSON.stringify(data));
  equal(balances(restored.supply!.ledger!).get('salt'),2500);
  equal(restored.pantry.oats.stock,60);
  deepEqual(restored.supply!.ledger!.events,ledger.events);
});
