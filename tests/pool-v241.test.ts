import {deepEqual,equal,ok,throws} from 'node:assert/strict';
import {test} from 'node:test';
import {performance} from 'node:perf_hooks';
import {applyPoolTemplate,defaultPool,foodPreference,migratePreferences,setFoodPreference,type GenerationAction,type PoolSettings} from '../src/ingredient-pool';
import {regenerate,verifyAgainst,type Plan} from '../src/planner';
import {food} from '../src/catalog';
import {meaningfulIds} from '../src/locked-meals';
import {adjustStock,balances,clearInventory,currentLedger,emptyLedger} from '../src/inventory';
import {executeJobs} from '../src/execution';
import {procurementSummary} from '../src/procurement-score';
import {fresh,parseBackup} from '../src/store';
import type {Profile} from '../src/profile';
import type {SupplyState} from '../src/logistics';
import {demo} from './fixtures';

const ten=['chicken','beef','egg','tofu','broccoli','oats','guava','brown','bok','canola'];
const four=['chicken','beef','pork','bass'];
const toolsOnly={...demo,tools:['煮锅','蒸锅','冰箱']};
function make(locked:string[],seed:string,options:{settings?:Partial<PoolSettings>;profile?:Profile;previous?:Plan;keep?:boolean;
  action?:GenerationAction;supply?:SupplyState;resume?:boolean}={}) {
  const {profile=toolsOnly,previous,settings,supply,action,keep,resume}=options;
  return regenerate(profile,[],{},[],seed,resume?previous:undefined,[],undefined,undefined,supply,
    {settings:{...defaultPool,...settings,locked},previous:previous?.pool,action,keep});
}
function verifyLocks(plan:Plan,locked:string[]) {
  const used=new Set(plan.days.flatMap(d=>d.meals.flatMap(m=>m.dishes.flatMap(s=>meaningfulIds(s.ingredients)))));
  for(const id of locked)ok(used.has(id),food(id).name);
}

test('四种状态互斥，旧版冲突及严格白名单可核对且备份可往返',()=>{
  const raw={...defaultPool,strict:true,selected:['chicken','beef'],locked:['chicken'],preferred:['chicken','oats'],excluded:['beef']};
  const parsed=parseBackup(JSON.stringify({...fresh(),poolSettings:raw})).poolSettings!;
  deepEqual(parsed.reviews?.map(row=>row.id).sort(),['beef','chicken']);
  ok(parsed.reviews?.find(row=>row.id==='beef')?.states.includes('严格池允许'));
  equal(foodPreference(parsed,'chicken'),'锁定必用');
  const changed=setFoodPreference(setFoodPreference(parsed,'chicken','禁止使用'),'beef','优先使用');
  deepEqual(migratePreferences(changed).reviews,[]);
  equal(foodPreference(changed,'chicken'),'禁止使用');
  equal(foodPreference(changed,'beef'),'优先使用');
  deepEqual(changed.locked,[]);
  deepEqual(changed.selected,['beef']);
  const manual=migratePreferences({...defaultPool,method:'手动指定',selected:['brown','oats']});
  deepEqual(manual.preferred,['brown','oats']);
  deepEqual(manual.selected,[]);
  const fromTemplate=applyPoolTemplate({...defaultPool,locked:['chicken','beef']},{...defaultPool,excluded:['chicken'],locked:['egg']});
  deepEqual(fromTemplate.locked,['egg','chicken','beef']);
  ok(fromTemplate.reviews?.some(row=>row.id==='chicken'));

});

test('连续锁定和跨分类十项锁定均以真实配方量安排',()=>{
  let state=setFoodPreference(defaultPool,'chicken','锁定必用');
  state=setFoodPreference(state,'beef','锁定必用');
  deepEqual(state.locked,['chicken','beef']);
  verifyLocks(make(state.locked,'241连续'),state.locked);
  verifyLocks(make(ten,'241全部'),ten);
  const ignored=setFoodPreference(state,'beef','自动');
  deepEqual(ignored.locked,['chicken']);
});

test('四种肉鱼跨过软目标，用户硬上限和排除冲突有具体诊断',()=>{
  const plan=make(four,'241软目标');
  verifyLocks(plan,four);
  equal(plan.pool?.settings.caps,undefined);
  throws(()=>make(four,'241硬目标',{settings:{caps:{肉鱼虾:3}}}),/肉鱼虾有 4 种锁定食材.*上限 3/);
  throws(()=>make(['bass'],'241过敏',{profile:{...toolsOnly,allergens:['鱼']}}),/鲈鱼受限.*鱼/);
  throws(()=>make(['guava'],'241水果冲突',{settings:{fruitPolicy:'每周固定一种',fruitId:'orange'}}),/固定水果橙子与锁定的番石榴冲突/);
  throws(()=>make(['guava'],'241禁水果',{profile:{...toolsOnly,fruit:'不吃水果'}}),/番石榴受限/);
  throws(()=>make(['chicken'],'241固定菜',{settings:{excluded:['rice']},profile:{...toolsOnly,requiredDish:'grain-rice'}}),/必选菜.*禁止食材.*白米/);
  verifyLocks(make(['orange','guava'],'241改为轮换',{settings:{fruitPolicy:'少量轮换'}}),['orange','guava']);
});

test('沿用合并最新锁定，轮换保留锁定和禁止状态，冲突时有明确原因',()=>{
  const old=make(['chicken','beef'],'241沿用基线');
  const priorIds=new Set(old.pool!.used.map(row=>row.id));
  const newIds=['chicken','beef','guava'];
  const retained=make(newIds,'241沿用后',{previous:old,action:'沿用食材'});
  deepEqual(retained.pool!.settings.locked,newIds);
  verifyLocks(retained,newIds);
  ok(retained.pool!.used.every(row=>priorIds.has(row.id)||row.id==='guava'));
  throws(()=>make(newIds,'241不能沿用',{previous:old,action:'沿用食材',settings:{excluded:['chicken']}}),/鸡胸肉同时被禁止|无法沿用 鸡胸肉/);
  const rotated=make(newIds,'241轮换后',{previous:old,action:'轮换食材',settings:{excluded:['orange']}});
  verifyLocks(rotated,newIds);
  ok(rotated.pool!.used.every(row=>row.id!=='orange'));
  deepEqual(rotated.pool!.settings.excluded,['orange']);
  verifyLocks(make(newIds,'241严格',{previous:retained,action:'沿用食材',
    settings:{strict:true,selected:retained.pool!.used.map(row=>row.id)}}),newIds);
});

test('保留已执行餐次、真实流水，清空后以新版库存及缺口计数',()=>{
  const old=make(['chicken'],'241已执行');
  const jobs=old.logistics!.prep.flatMap(row=>row.jobs).filter(row=>row.day===0&&row.meal==='早餐');
  ok(jobs.length);
  const ingredients=[...new Set(jobs.flatMap(job=>job.ingredients.map(i=>i.id)))];
  const ledger=ingredients.reduce((book,id)=>adjustStock(book,id,1000,'增加',old.start,'调整|241|'+id),emptyLedger());
  const executed=executeJobs(ledger,{},jobs,'用餐',true,old.start);
  const supply={ledger:executed.ledger,execution:executed.execution};
  const next=make(['chicken','beef'],'241保留执行',{previous:old,action:'重新搭配',supply,resume:true});
  deepEqual(next.days[0].meals[0],old.days[0].meals[0]);
  deepEqual(currentLedger({},supply),executed.ledger);
  const cleared=clearInventory(executed.ledger,'清空|241',old.start);
  ok(![...balances(currentLedger({chicken:{stock:999}},{...supply,ledger:cleared})).values()].some(n=>n>0));
  const stats=procurementSummary(next.logistics!);
  equal(stats.needed,stats.neededMain+stats.neededSeasonings);
});

test('108 个随机种子用 2、4、10 项锁定独立复核',()=>{
  const counts=new Map<number,{passed:number;ms:number}>();
  const failures:string[]=[];
  for(const items of [['chicken','beef'],four,ten]) {
    const stats={passed:0,ms:0};
    for(let index=0;index<36;index++){
      const profile:Profile={...toolsOnly,...(index%3===1?{sex:'女',height:'164',weight:'68',target:'60'}:{}),
        ...(index%3===2?{meals:'4',budget:'600'}:{})};
      const time=performance.now();
      try {
        const plan=make(items,'多锁定-'+items.length+'-'+index,{profile});
        verifyLocks(plan,items);
        verifyAgainst(plan,profile,[],{},[]);
        stats.passed++;stats.ms+=performance.now()-time;
      } catch(error){failures.push(items.length+'项的种子 '+index+' '+(error as Error).message);}
    }
    counts.set(items.length,stats);
  }
  for(const [items,stats] of counts)console.log('多食材锁定 '+items+' 项 '+stats.passed+'/36，成功方案平均 '+Math.round(stats.ms/Math.max(1,stats.passed))+' 毫秒');
  if(failures.length)console.log(failures.join('\n'));
  deepEqual(failures,[]);
});
