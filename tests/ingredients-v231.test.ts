import {deepEqual,equal,notEqual,ok,throws} from 'node:assert/strict';
import {test} from 'node:test';
import {foods,recipeMap,serving,variantsOf,type Serving} from '../src/catalog';
import {adjustStock,balances,clearInventory,emptyLedger,recordPurchase,undoInventoryClear} from '../src/inventory';
import {executeJobs} from '../src/execution';
import {planLogistics,receiptKey,type SupplyState} from '../src/logistics';
import {regenerate,substitutionOptions,verifyAgainst} from '../src/planner';
import {conditionalPair,directRules,substitutionCoverage} from '../src/substitution';
import {purchaseIngredientId} from '../src/purchase-food';
import {procurementSummary} from '../src/procurement-score';
import {parseBackup,fresh} from '../src/store';
import {defaultPool} from '../src/ingredient-pool';
import type {Day} from '../src/shopping';
import {demo} from './fixtures';

const date='2026-11-27';
const settings:SupplyState['settings']={prep:'每2～3天',pattern:[2,2,3],shopping:{count:2}};
const boil=recipeMap.get('boil-broccoli')!;
const cold=recipeMap.get('cold-tomato')!;
const picked=(recipe:typeof boil,...ids:string[])=>variantsOf(recipe).find(v=>ids.every(id=>v.ingredients.some(i=>i.id===id)))!;
const week=(dishes:Serving[]=[])=>Array.from({length:7},(_,i)=>({meals:i?[]:[{name:'午餐',dishes}]})) as Day[];

test('许可油醋修改真实 ID、做法、营养、采购和实际扣减，包装和购备餐周期独立',()=>{
  const olive=picked(boil,'olive'), both=picked(cold,'olive','ricevinegar');
  ok(!olive.ingredients.some(i=>i.id==='canola'));ok(olive.steps.some(s=>s.includes('橄榄油')));
  ok(both.steps.some(s=>s.includes('无调味米醋')));
  const old=serving(cold),next=serving(both);
  notEqual(old.nutrients.sodium,next.nutrients.sodium);notEqual(old.nutrients.calcium,next.nutrients.calcium);
  notEqual(old.nutrients.kcal,next.nutrients.kcal);
  let ledger=emptyLedger();
  for(const id of ['olive','canola','ricevinegar','tomato','cucumber','broccoli','salt'])
    ledger=adjustStock(ledger,id,230,'增加',date,'测试|'+id);
  const quote=planLogistics(week([serving(olive),next]),demo,date,{}, {settings,ledger,prices:{ricevinegar:{amount:10,unit:'瓶',basis:'净重',unitGrams:250}}});
  equal(quote.batches.length,2);deepEqual(quote.prep.map(b=>b.range.to-b.range.from),[2,2,3]);
  equal(quote.lines.find(l=>l.id==='olive')!.remaining,0);
  ok(!quote.lines.some(l=>l.id==='canola'||l.id==='vinegar'));
  const jobs=quote.prep.flatMap(b=>b.jobs),result=executeJobs(ledger,{},jobs,'取用',true,date);
  equal(balances(result.ledger).get('olive'),214);
  equal(balances(result.ledger).get('canola'),230);
  equal(balances(result.ledger).get('ricevinegar'),225);
  equal(executeJobs(result.ledger,result.execution,jobs,'取用',true,date).ledger,result.ledger);
  const shortage=adjustStock(ledger,'ricevinegar',2,'设为',date,'测试调整|ricevinegar');
  equal(planLogistics(week([next]),demo,date,{}, {settings,ledger:shortage,prices:{ricevinegar:{amount:10,unit:'瓶',basis:'净重',unitGrams:250}}})
    .lines.find(r=>r.id==='ricevinegar')!.remaining,250);
});

test('全库审核覆盖和真实条件替代保留安全限制',()=>{
  for(const id of ['canola','vinegar','ricevinegar'])equal(substitutionCoverage(id),'直接变体');
  for(const [a,b] of [['chicken','thigh'],['bass','cod'],['egg','boiledegg'],['tofu','softtofu'],['greek','yogurt'],
    ['brown','millet'],['sweet','corn'],['broccoli','cauliflower'],['shiitake','enoki'],['orange','apple'],['walnut','almond']]){
    ok(conditionalPair(a,b));equal(substitutionCoverage(a),'有条件换完整菜谱');
  }
  for(const [a,b] of [['milk','soymilk'],['shrimp','tofu'],['eggwhite','egg'],['soy','vinegar'],['walnut','peanutoil'],['sesameoil','canola']]) {
    ok(!conditionalPair(a,b));ok(!directRules.some(r=>r.from===a&&r.to===b));
  }
  for(const f of foods)ok(substitutionCoverage(f.id));
  equal(substitutionCoverage('ginger'),'暂无直接审核规则');
  equal(variantsOf(recipeMap.get('pan-chicken')!).length,1);
  equal(purchaseIngredientId('cookedchicken'),'chicken');
  equal(purchaseIngredientId('cookedchicken',{ready:['cookedchicken']}),'cookedchicken');
  const kitchen={...demo,tools:['煮锅','蒸锅']};
  const options=substitutionOptions(boil,kitchen,'午餐',defaultPool,new Map([['olive',230],['cauliflower',900]]),[]);
  ok(options.some(r=>r.ingredients.some(i=>i.id==='olive')));
  ok(options.every(r=>r.tools.every(t=>kitchen.tools.includes(t))));
  const locked=substitutionOptions(boil,kitchen,'午餐',{...defaultPool,locked:['canola']},new Map([['olive',230]]),[]);
  ok(locked.every(r=>r.ingredients.some(i=>i.id==='canola')));
  const excluded=substitutionOptions(boil,{...kitchen,avoid:'橄榄油'},'午餐',defaultPool,new Map([['olive',230]]),[]);
  ok(excluded.every(r=>r.ingredients.every(i=>i.id!=='olive')));
  const strict=substitutionOptions(cold,kitchen,'午餐',{...defaultPool,strict:true,selected:['olive','ricevinegar','cucumber','tomato','salt']},new Map(),[]);
  ok(strict.length&&strict.every(r=>r.ingredients.every(i=>i.id!=='vinegar')));
});

test('实际库存优先参与整周规划，取用和备份不混同商品',()=>{
  const ledger=adjustStock(emptyLedger(),'olive',230,'增加',date,'测试|olive');
  const supply={settings,ledger};
  const p={...demo,tools:['煮锅','蒸锅']};
  const pool={...defaultPool,preferred:['olive','ricevinegar']};
  const plan=regenerate(p,[],{},[],'专项蒸煮与已有油',undefined,[],undefined,undefined,supply,{settings:pool});
  verifyAgainst(plan,p,[],{},[],supply);
  ok(plan.days.flatMap(d=>d.meals.flatMap(m=>m.dishes)).some(s=>s.recipe.replacements?.some(r=>r.to==='olive')));
  equal(plan.logistics!.lines.find(r=>r.id==='olive')!.remaining,0);
  equal(plan.logistics!.lines.find(r=>r.id==='canola')?.remaining??0,0);
  ok(procurementSummary(plan.logistics!).needed<procurementSummary(plan.logistics!).used);
  equal(balances(ledger).get('olive'),230);
  equal(parseBackup(JSON.stringify({...fresh(),profile:p,plan,supply,poolSettings:pool})).plan?.taskScope,plan.taskScope);
});

test('单项、全部清空和撤销可幂等，历史消费与实付保留，补购立即重算',()=>{
  const key=receiptKey(date,0,'broccoli');
  const bought={gross:500,net:500,date,paid:8.2};
  let ledger=recordPurchase(emptyLedger(),key,undefined,bought,date);
  ledger=adjustStock(ledger,'olive',230,'增加',date,'测试|olive');
  ledger=adjustStock(ledger,'salt',500,'增加',date,'测试|salt');
  const context={settings,receipts:{[key]:bought},ledger};
  const dish=serving(picked(boil,'olive'));
  const q=planLogistics(week([dish]),demo,date,{},context);
  const consumed=executeJobs(ledger,{},q.prep[0].jobs,'取用',true,date);
  ledger=consumed.ledger;
  const pending=week([dish]);
  const before=planLogistics(pending,demo,date,{}, {...context,ledger});
  const one=clearInventory(ledger,'清空|一',date,'olive');
  equal(balances(one).get('olive'),0);
  equal(balances(one).get('broccoli'),325);
  const all=clearInventory(one,'清空|二',date);
  ok([...balances(all).values()].every(amount=>amount===0));
  equal(clearInventory(all,'清空|二',date),all);
  throws(()=>executeJobs(all,{},q.prep[0].jobs,'取用',true,date),/库存不足/);
  const after=planLogistics(pending,demo,date,{}, {...context,ledger:all});
  ok(after.remaining.known>before.remaining.known);equal(after.actualPaid?.known,8.2);
  ok(after.prep[0].rows.some(row=>row.uses.some(u=>(u.sourcing?.forecast??0)>0)));
  const freshStock=adjustStock(all,'olive',5,'增加',date,'测试追加|olive');
  const back=undoInventoryClear(undoInventoryClear(freshStock,'清空|二',date),'清空|一',date);
  equal(balances(back).get('olive'),227);
  equal(balances(back).get('broccoli'),325);equal(undoInventoryClear(back,'清空|二',date),back);
  ok(back.events.some(e=>e.kind==='实际取用'));
  equal(parseBackup(JSON.stringify({...fresh(),supply:{...context,ledger:back}})).supply!.receipts![key].paid,8.2);
});

test('同配方手动选择经审核的变体，保留其他菜、重量和原周任务范围',()=>{
  const p={...demo,tools:['煮锅','蒸锅']};
  const settingsWithStock={settings,ledger:adjustStock(emptyLedger(),'olive',230,'增加',date,'测试|olive')};
  const old=regenerate(p,[],{},[],'手动食材验收',undefined,[],undefined,undefined,undefined,{settings:defaultPool});
  const options=old.days.flatMap((d,day)=>d.meals.flatMap((m,meal)=>m.dishes.map((s,dish)=>({
    day,meal,dish,s,variant:variantsOf(s.recipe).find(r=>r.id!==s.recipe.id&&r.ingredients.some(i=>i.id==='olive')),
  })))).filter(row=>row.variant&&row.s.ingredients.some(i=>i.id==='canola'));
  ok(options.length);
  const {day,meal,dish,s,variant}=options[0];
  const next=regenerate(p,[],{},[],'手动同配方',old,[],{day,meal,dish,replacement:variant!.id,intent:'更换同类食材'},undefined,settingsWithStock);
  equal(next.taskScope,old.taskScope);
  deepEqual(next.days[day].meals[meal].dishes[dish].ingredients.map(i=>i.grams),s.ingredients.map(i=>i.grams));
  equal(next.days[day].meals[meal].dishes[dish].recipe.id,variant!.id);
  for(let d=0;d<7;d++)if(d!==day)deepEqual(next.days[d],old.days[d]);
  equal(next.logistics!.lines.find(i=>i.id==='olive')?.remaining,0);
});
