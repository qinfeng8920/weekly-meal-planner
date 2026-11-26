import {test} from 'node:test';
import {deepEqual,equal,ok,throws} from 'node:assert/strict';
import {foods,recipeMap,serving} from '../src/catalog';
import {planLogistics,receiptKey} from '../src/logistics';
import {splitWeek,supplyDefaults,type SupplySettings} from '../src/batches';
import {amountFor, priceDefaults, priceFor} from '../src/prices';
import {regenerate} from '../src/planner';
import {parseBackup,fresh} from '../src/store';
import {parsePriceBackup} from '../src/logistics-storage';
import type {Day} from '../src/shopping';
import {demo} from './fixtures';

const start='2026-11-23';
const profile={...demo,prep:'每隔2～3天'};
const setting={prep:'每2～3天',purchase:'随备餐采购'} as const;
const weekdays=Array.from({length:7},(_,i)=>i);
function meal(recipeId:string,grams?:number) {
  const recipe=recipeMap.get(recipeId)!;
  return {name:'午餐',dishes:[serving(recipe,1,grams?[{...recipe.ingredients[0],grams},...recipe.ingredients.slice(1)]:undefined)]};
}
const oats:Day[]=weekdays.map(()=>({meals:[meal('grain-oats',60)]}));
const emptyDay=():Day=>({meals:[]});
const testPlan=regenerate(profile,[],{},[],'采购验收');

test('全部可追溯食材有标签明确的广东参考价，净料和毛料不能直接等价',()=>{
  equal(Object.keys(priceDefaults).length,foods.length);
  for(const f of foods) {
    const p=priceDefaults[f.id];ok(p.amount>0&&p.date&&p.source&&p.region.includes('广东'));
    ok(['监测','类别参考','估算'].includes(p.kind));
  }
  equal(priceDefaults.broccoli.kind,'监测');
  equal(priceDefaults.egg.kind,'类别参考');
  equal(priceDefaults.chicken.kind,'估算');
  equal(amountFor(500,priceDefaults.rice),3.1);
  equal(amountFor(920,priceDefaults.canola),18.12);
  equal(amountFor(1000,priceDefaults.soymilk),8);
  equal(amountFor(4,{amount:2,unit:'克',basis:'净重'}),8);
  equal(amountFor(20,{amount:3,unit:'毫升',unitGrams:1,basis:'净重'}),60);
  equal(amountFor(125,{amount:3,unit:'个',unitGrams:125,basis:'净重'}),3);
  equal(amountFor(500,{amount:20,unit:'袋',unitGrams:250,basis:'净重'}),40);
  equal(priceFor('oats',{}, {price:7})?.amount,7);
  const fishWeek=[{meals:[meal('steam-bass',100),meal('steam-shrimp',110)]},...weekdays.slice(1).map(emptyDay)];
  const q=planLogistics(fishWeek,profile,start);
  equal(q.lines.find(l=>l.id==='bass')?.buy,200);
  equal(q.lines.find(l=>l.id==='bass')?.estimate,8);
  equal(q.lines.find(l=>l.id==='shrimp')?.buy,200);
  equal(q.lines.find(l=>l.id==='shrimp')?.estimate,16.2);
});
test('批次按档案和手动方案完整覆盖，整周采购不合并三个备餐批次',()=>{
  deepEqual(supplyDefaults(profile).prep,'每2～3天');
  for(const [prep,patterns] of [
    ['每天',[[1,1,1,1,1,1,1]]],['每2天',[[2,2,2,1]]],['每2～3天',[[2,2,3],[2,3,2],[3,2,2]]],
    ['每3～4天',[[3,4],[4,3]]],['每周',[[7]]],['自定义',[[1,3,3]]],
  ] as [SupplySettings['prep'],number[][]][]) for(const pattern of patterns) {
    const ranges=splitWeek({prep,purchase:'一次采购',pattern});
    deepEqual(ranges.map(r=>r.to-r.from),pattern);
    deepEqual(ranges.flatMap(r=>weekdays.slice(r.from,r.to)),weekdays);
  }
  const q=planLogistics(oats,profile,start,{}, {settings:{...setting,purchase:'一次采购'}});
  equal(q.prep.length,3);equal(q.batches.length,1);
  deepEqual(q.prep.map(b=>[b.start,b.end]),[['2026-11-23','2026-11-24'],['2026-11-25','2026-11-26'],['2026-11-27','2026-11-29']]);
  const custom=splitWeek({prep:'自定义',purchase:'随备餐采购',pattern:[3,4],prepDates:[-1,2],purchaseDates:[-1,1]});
  equal(custom[0].prepAt,-1);equal(custom[1].purchaseAt,1);
  throws(()=>splitWeek({...setting,pattern:[2,2,2]}),/覆盖/);
  throws(()=>splitWeek({prep:'自定义',purchase:'一次采购',pattern:[7],prepDates:[1]}),/不得/);
});
test('500 克包装结转、实际库存与预计库存分离，费用对账',()=>{
  const q=planLogistics(oats,profile,start,{}, {settings:setting});
  equal(q.lines[0].need,420);
  equal(q.lines[0].buy,500);
  equal(q.purchase.known,12);
  equal(q.consumed.known,10.08);
  deepEqual(q.inventory[0],{id:'oats',home:0,confirmed:0,projected:80});
  equal(q.batches.reduce((n,b)=>n+b.purchase.known,0),q.purchase.known);
  const first=q.batches[0].lines[0];
  const l=planLogistics(oats,profile,start,{}, {settings:setting,receipts:{[first.receiptKey]:{gross:500,net:500,paid:22}}});
  equal(l.purchase.known,22);equal(l.remaining.known,0);equal(l.paid.known,22);
  deepEqual(l.inventory[0],{id:'oats',home:0,confirmed:500,projected:80});
  const inventory=planLogistics(oats,profile,start,{oats:{stock:50}},{settings:setting});
  equal(inventory.lines[0].stock,50);equal(inventory.inventory[0].projected,130);
  const partial=planLogistics(oats,profile,start,{}, {settings:setting,receipts:{[first.receiptKey]:{gross:500,net:500,paid:8,paidGross:200}}});
  equal(partial.lines[0].paidActual,8);
  equal(partial.paid.known,15.2);
});
test('份量和价格实时重算，锁定历史快照，旧版存档和价格备份可读',()=>{
  const q=planLogistics(testPlan.days,profile,start,{}, {settings:setting});
  const changes={oats:{amount:45,unit:'盒',unitGrams:500,pack:500,basis:'净重'}} as const;
  const altered=planLogistics(testPlan.days,{...profile,people:'2',budget:'300'},start,{}, {settings:setting,prices:changes});
  const oatsOld=q.lines.find(l=>l.id==='oats')!;
  const oatsNew=altered.lines.find(l=>l.id==='oats')!;
  equal(oatsNew.need,Math.round(oatsOld.need*200)/100);
  equal(oatsNew.price?.kind,'用户自定义');
  equal(oatsNew.price?.unit,'盒');
  ok(altered.purchase.known>q.purchase.known);
  equal(altered.budget,300);
  const persisted=parseBackup(JSON.stringify({...fresh(),profile,plan:testPlan,history:[{...testPlan,logistics:q}],supply:{prices:changes}}));
  equal(persisted.history[0].logistics?.lines.find(l=>l.id==='oats')?.price?.amount,12);
  equal(persisted.supply?.prices?.oats.amount,45);
  equal(parseBackup(JSON.stringify({...fresh(),plan:testPlan})).supply,undefined);
  deepEqual(parsePriceBackup(JSON.stringify({type:'tiantianjian-prices',version:1,prices:changes})),changes);
  throws(()=>parsePriceBackup('{"prices":{"invalid":{"amount":0}}}'),/格式/);
});
test('每个批次逐份由菜谱汇总，换菜不清空已购记录',()=>{
  const p={...profile,people:'2'};
  const q=planLogistics(testPlan.days,p,start,{}, {settings:setting});
  for(const row of q.lines) {
    const net=testPlan.days.flatMap(d=>d.meals).flatMap(m=>m.dishes).flatMap(d=>d.ingredients)
      .filter(i=>i.id===row.id).reduce((n,i)=>n+i.grams*2,0);
    ok(Math.abs(net-row.need)<.011);
    ok(Math.abs(q.prep.flatMap(b=>b.rows).filter(i=>i.id===row.id).reduce((n,i)=>n+i.grams,0)-row.need)<.011);
    ok(Math.abs(q.batches.flatMap(b=>b.lines).filter(i=>i.id===row.id).reduce((n,i)=>n+i.need,0)-row.need)<.011);
  }
  const first=q.batches[0].lines.find(l=>l.remaining>0&&l.price?.basis==='净重')!;
  const newDays=structuredClone(testPlan.days);
  newDays[4].meals[0].dishes[0]=serving(recipeMap.get('quick-oats')!);
  const used=planLogistics(newDays,p,start,{}, {settings:setting,receipts:{[first.receiptKey]:{gross:first.buy,net:first.buy,paid:9}}});
  equal(used.batches[0].lines.find(l=>l.id===first.id)?.confirmed,first.buy);
  equal(used.batches[0].lines.find(l=>l.id===first.id)?.paid,9);
  const portions=(quote:typeof q)=>quote.prep.slice(0,2).map(b=>({
    jobs:b.jobs,rows:b.rows.map(r=>({...r,uses:r.uses.map(({sourcing,...use})=>use)})),
  }));
  deepEqual(portions(used),portions(q));
  ok(JSON.stringify(used.prep[2].rows)!==JSON.stringify(q.prep[2].rows));
});
test('缺冰箱或冷冻室安全拆分，熟饭和鲜鱼等不做七天冷藏',()=>{
  const days=weekdays.map(()=>({meals:[meal('steam-chicken'),meal('steam-bass'),meal('grain-rice'),meal('boil-spinach')]}));
  const weekly={prep:'每周',purchase:'一次采购'} as const;
  const noFridge=planLogistics(days,{...profile,tools:['煮锅','蒸锅']},start,{}, {settings:weekly});
  equal(noFridge.prep.length,1);
  ok(noFridge.prep[0].jobs.every(j=>j.at===j.day));
  equal(noFridge.batches.filter(b=>b.lines.some(l=>l.id==='chicken')).length,7);
  const cold=planLogistics(days,{...profile,tools:['煮锅','蒸锅','冰箱']},start,{}, {settings:weekly});
  ok(cold.prep[0].jobs.every(j=>!j.method.includes('冷冻')&&j.day-j.at<=1));
  ok(cold.prep[0].jobs.filter(j=>j.name==='白米饭').every(j=>j.at===j.day));
  ok(cold.prep[0].jobs.filter(j=>j.name.includes('鲈鱼')||j.name.includes('菠菜')).every(j=>j.at===j.day));
  const freezer=planLogistics(days,{...profile,tools:['煮锅','蒸锅','冰箱','冷冻室']},start,{}, {settings:weekly});
  ok(freezer.prep[0].jobs.some(j=>j.name==='白米饭'&&j.day>=3&&j.method.includes('冻')));
});
test('缺少价格或计量换算时显示未知，真实支付金额仍计入已知成本',()=>{
  const q=planLogistics(oats,profile,start,{}, {settings:setting},undefined,{});
  equal(q.lines[0].consume,null);equal(q.batches[0].lines[0].estimate,null);
  ok(q.purchase.missing>0&&q.purchase.missing===q.purchase.items);
  const one=planLogistics(oats,profile,start,{}, {settings:setting,
    receipts:{[receiptKey(start,0,'oats')]:{gross:120,net:120,paid:12}}},undefined,{});
  equal(one.paid.known,12);
  equal(one.paid.missing,0);
  ok(one.purchase.missing>0);
});
