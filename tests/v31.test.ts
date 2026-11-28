import {strict as assert} from 'node:assert';
import {performance} from 'node:perf_hooks';
import {test} from 'node:test';
import {addDays} from '../src/batches';
import {recipeMap,serving} from '../src/catalog';
import {supplementalReview} from '../src/diet-check';
import {planLogistics,receiptKey,repriceSnapshot,type BuyLine} from '../src/logistics';
import {bmiDeficitRate,energyNeedsReview,nutrition} from '../src/nutrition';
import {nextPrep,prepProgress,purchaseStatus,weeklyPurchases} from '../src/plan-progress';
import {newPlanStart,regenerate,verifyAgainst} from '../src/planner';
import {dateKey,type Profile} from '../src/profile';
import {fresh,parseBackup} from '../src/store';
import type {Pantry} from '../src/shopping';
import {updateWeight,weightProgress,weightTrend} from '../src/weight';
import {demo} from './fixtures';

const subject:Profile={...demo,height:'173',age:'25',weight:'72',target:'60',deficit:{mode:'缓慢减脂',normalOptIn:true}};
const today='2026-11-28';
const at=(days:number,kg:number)=>({date:addDays(today,-days),kg});
const near=(actual:number,expected:number)=>assert.ok(Math.abs(actual-expected)<1e-8,[actual,expected].join(' / '));

test('BMI 临界例，未舍入的目标计算和连续系数',()=>{
  const before=nutrition({...subject,deficit:undefined});
  const after=nutrition({...subject,weight:'71',deficit:{mode:'系统推荐',normalOptIn:true}});
  assert.equal(before.kcal,1815);
  assert.equal(after.kcal,1815);
  near(before.tdee,2017.5);
  near(after.tdee,2005.5);
  near(after.energy!.effective,2005.5*.1*(71/1.73**2-18.5)/5.5);
  const steady=nutrition({...subject,weight:'71'});
  assert.equal(steady.energy!.requested,300);
  near(steady.energy!.effective,2005.5*.12*(71/1.73**2-18.5)/5.5);
  for (const [bmi,rate] of [[18.49,0],[18.5,0],[20,.02727272727272727],[23,.08181818181818182],[24,.1],[25,.10625],[26,.1125],[28,.125],[40,.125]])
    near(bmiDeficitRate(bmi,'缓慢'),rate);
  const automatic={...subject,deficit:undefined};
  const below=nutrition({...automatic,weight:String(23.99*1.73**2)});
  const above=nutrition({...automatic,weight:String(24.01*1.73**2)});
  assert.equal(below.energy!.effective,0);
  assert.ok(above.energy!.effective>200);
  near(below.energy!.candidateRate!,.1*(23.99-18.5)/5.5);
  assert.equal(nutrition({...subject,weight:'71',deficit:undefined}).energy!.effective,0);
  assert.equal(nutrition({...subject,weight:'71',deficit:{mode:'缓慢减脂'}}).energy!.effective,0);
  assert.equal(nutrition({...subject,weight:'71',conditions:['高血压']}).energy!.effective,0);
  assert.equal(nutrition({...subject,weight:'71',deficit:{mode:'维持体重'}}).energy!.effective,0);
  assert.equal(nutrition({...subject,weight:'71',target:'71'}).energy!.effective,0);
  assert.throws(()=>nutrition({...subject,target:'55'}),/适用范围/);
  assert.throws(()=>nutrition({...subject,weight:'120'}),/适用范围/);
  assert.throws(()=>nutrition({...subject,risks:['孕哺期']}),/个体化评估/);
  assert.throws(()=>nutrition({...subject,otherHealth:'正在使用会影响食欲和体重的处方药'}),/个体化评估/);
  const lower=nutrition({...subject,height:'180',weight:String(18.5*1.8**2),target:String(18.5*1.8**2)});
  assert.equal(lower.energy!.effective,0);
});

test('自定义标准缺口、15%、距目标、安全能量和趋势保护',()=>{
  for(const standard of [0,100,150,200,300,400]) {
    const result=nutrition({...subject,deficit:{mode:'自定义',standard,normalOptIn:true}});
    near(result.energy!.standard,Math.min(standard,result.tdee*(.12+.03*(result.bmi-24)/4)));
    assert.ok(result.kcal>=result.energy!.floor);
  }
  for(const standard of [undefined,NaN,Infinity,-1,401])assert.throws(()=>nutrition({...subject,deficit:{mode:'自定义',standard}}),/自定义调整/);
  const close=nutrition({...subject,target:'71.9'});
  near(close.energy!.distanceCap,30);
  near(close.energy!.effective,30);
  const trend=[at(25,75),at(17,74),at(6,72.5),at(3,72),at(0,71.5)];
  const result=nutrition(subject,trend,today);
  near(result.energy!.calculation,72);
  near(result.energy!.current,71.5);
  near(result.energy!.effective,2017.5*(.12+.03*(result.bmi-24)/4)-150);
  assert.ok(energyNeedsReview(nutrition(subject),result));
  assert.match(nutrition(subject,[at(2,75),at(0,70)],today).message,/称重变化异常/);
  assert.equal(nutrition({...subject,age:'65'}).energy!.effective,0);
  assert.throws(()=>nutrition({...subject,age:'64',height:'149',weight:'49',target:'42'}),/下限/);
});

test('称重编辑、当地日历与体重阶段的边界',()=>{
  const records=[at(30,78),at(7,72),at(6,71),at(2,72),at(-1,80)];
  const trend=weightTrend(subject,records,today);
  assert.equal(trend.recentCount,2);
  assert.equal(trend.current,72);
  assert.equal(trend.calculation,72);
  assert.equal(weightTrend(subject,trend.rows.slice(0,-1),today).current,71);
  assert.throws(()=>updateWeight(records,at(2,69),'',today),/已经有/);
  assert.throws(()=>updateWeight(records,at(6,70),at(2,72).date,today),/已经有/);
  assert.throws(()=>updateWeight(records,at(-2,70),'',today),/有效日期/);
  assert.throws(()=>updateWeight(records,{date:'2026-02-29',kg:70},'',today),/有效日期/);
  assert.equal(updateWeight(trend.rows,at(2,70),at(2,72).date,today).length,trend.rows.length);
  assert.equal(weightProgress({...subject,weight:'69'},[at(0,70)],{kg:72}).lost,2);
  assert.ok(weightProgress(subject,[at(0,73)],{kg:72}).percent!<0);
  assert.ok(weightProgress(subject,[at(0,59)],{kg:72}).percent!>100);
  assert.equal(weightProgress(subject,[],{kg:60}).percent,null);
  assert.equal(weightProgress({...subject,weight:'超出范围'},[],{kg:60}).distance,null);
  assert.equal(weightProgress({...subject,weight:'超出范围'},[],{kg:72}).percent,null);
  assert.throws(()=>nutrition({...subject,height:'180',weight:'61',target:'60'},[at(6,61),at(3,61),at(0,59.8)],today),/低体重/);
  assert.equal(weightProgress({...subject,goal:'维持体重'},[],{kg:72}).percent,null);
  assert.equal(newPlanStart('下周一','2026-12-31'),'2027-01-04');
  assert.equal(newPlanStart('2027-01-01','2026-12-31'),'2027-01-01');
  assert.throws(()=>newPlanStart('2026-12-30','2026-12-31'),/自定义起始日/);
  assert.throws(()=>parseBackup(JSON.stringify({...fresh(),weights:[at(-1,75)]}),today),/未来日期/);
  const original={...fresh(),profile:demo};
  assert.equal(parseBackup(JSON.stringify(original)).profile?.deficit,undefined);
});

test('采购状态按数量、周项目按批次且历史重估只更新预估',()=>{
  const r=recipeMap.get('quick-oats')!;
  const day={meals:[{name:'早餐',dishes:[serving(r,1)]}]};
  const source=receiptKey(today,0,'oats');
  const current=planLogistics([day],demo,today,{},{
    settings:{prep:'每天',purchase:'一次采购'},receipts:{[source]:{gross:500,net:500,paid:0,date:today},
      ['手动|独立凭证|chicken']:{gross:500,net:500,date:today,referenceCost:16},
      ['手动|旧周|salt']:{gross:500,net:500,paid:3,date:'2026-11-27'}},
  });
  const oats=current.lines.find(row=>row.id==='oats')!;
  const row:BuyLine={...oats,confirmed:500,remaining:0,quantityPending:false,estimate:null};
  assert.equal(purchaseStatus(row),'已购');
  assert.equal(purchaseStatus({...row,remaining:10}),'已买部分');
  assert.equal(purchaseStatus({...row,quantityPending:true}),'待核对');
  assert.equal(purchaseStatus({...row,confirmed:0}),'无需补购');
  const mock={...current,batches:[{...current.batches[0],lines:[{...row,remaining:100,receiptKey:'a'},{...row,remaining:120,receiptKey:'b'}]}]};
  assert.deepEqual(weeklyPurchases(mock),{done:0,total:2,review:0,needed:1,covered:0});
  assert.equal(current.actualPaid?.known,0);
  assert.equal(current.actualPaid?.items,1);
  assert.equal(current.unpricedPaid?.known,16);
  assert.ok(Math.abs(current.purchase.known-(current.paid.known+current.remaining.known))<.01);
  const updated=repriceSnapshot(current,{oats:{amount:80,unit:'斤',basis:'净重'},chicken:{amount:80,unit:'斤',basis:'净重'}},{});
  assert.deepEqual(updated.actualPaid,current.actualPaid);
  assert.deepEqual(updated.unpricedPaid,current.unpricedPaid);
  assert.deepEqual(updated.prep,current.prep);
  assert.deepEqual(updated.inventory,current.inventory);
});

test('备餐推进独立于用餐及营养缺值',()=>{
  const r=recipeMap.get('quick-oats')!;
  const day={meals:[{name:'早餐',dishes:[serving(r,1)]}]};
  const quote=planLogistics([day],demo,today);
  const job=quote.prep[0].jobs[0];
  const records={tasks:{[job.key!]:{taken:{date:today,allocation:[]}}}};
  assert.equal(prepProgress(quote.prep[0],records).taken,1);
  assert.equal(prepProgress(quote.prep[0],records).made,0);
  assert.equal(prepProgress(quote.prep[0],records).pending,1);
  assert.equal(nextPrep(quote,records)?.date,today);
  assert.equal(nextPrep(quote,{tasks:{[job.key!]:{eaten:true}}}),undefined);
  const different={meals:[{name:'早餐',dishes:[serving(r,1,[{id:'ricevinegar',grams:50}])]}]};
  assert.ok(supplementalReview([different]).every(row=>row.value===null&&row.known===0));
});

test('V3.2 100 个种子覆盖双向目标、厨具、库存和餐次',()=>{
  const samples:Profile[]=[
    demo,
    {...subject,tools:['煮锅','蒸锅','冰箱','冷冻室'],meals:'4'},
    {...demo,sex:'女',weight:'70',target:'61',height:'162',tools:['煮锅','蒸锅','电饭煲','冰箱','冷冻室'],meals:'3'},
    {...subject,weight:'70',target:'63',goal:'维持体重',meals:'2'},
    {...demo,goal:'健康增重',weight:'53',height:'173',target:'60',activity:'正常通勤',
      gainScreen:{risks:[],reviewed:true,professionalClearance:true}},

  ];
  const before=performance.now();
  const reasons:Record<string,number>={};let success=0;
  for(let i=0;i<100;i++) {
    const p=samples[i%samples.length], pantry:Pantry=i%3?{}:{chicken:{stock:650},oats:{stock:600}};
    let plan:ReturnType<typeof regenerate>;
    try {plan=regenerate(p,[],pantry,[],'v32-acceptance-'+i,undefined,[],undefined,undefined,undefined,{startChoice:'明天'});}
    catch(e){const reason=(e as Error).message;reasons[reason]=(reasons[reason]??0)+1;continue;}
    success++;
    verifyAgainst(plan,p,[],pantry,[]);
    assert.equal(plan.targets.energy?.calculatedOn,dateKey());
    assert.equal(plan.days.length,7);
    assert.equal(plan.targets.kcal,nutrition(p).kcal);
  }
  console.info('V3.2 样本 '+success+'/100，耗时 '+Math.round(performance.now()-before)+' 毫秒，失败 '+JSON.stringify(reasons));
  assert.ok(success>=90,'成功率低于专项验收预期');
});
