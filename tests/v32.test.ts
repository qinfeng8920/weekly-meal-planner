import {strict as assert} from 'node:assert';
import {test} from 'node:test';
import {assessEnergy,bmiDeficitRate,bodyMetrics,nutrition} from '../src/nutrition';
import {regenerate,verifyAgainst} from '../src/planner';
import {weightProgress} from '../src/weight';
import type {Profile} from '../src/profile';
import {demo} from './fixtures';

const activities={长期久坐:1.2,正常通勤:1.375,经常站立走动:1.55,体力劳动:1.725};
const bmis=[14,15,15.99,16,17,18,18.49,18.5,18.51,19,20,21,22,23,23.99,24,24.01,25,26,27,27.99,28,28.01,30,35,39.99,40,42];
const checked={reviewed:true,professionalClearance:true,risks:[]};
const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-8,[a,b].join(' / '));
test('全身高、性别、年龄、活动量、BMI 的热量矩阵',()=>{
  let samples=0;
  for(const sex of ['男','女'])for(const height of [120,145,150,160,173,180,190,200,220])
    for(const age of [18,25,35,45,60,65,79])for(const [activity,factor] of Object.entries(activities))for(const bmi of bmis){
      const square=(height/100)**2, weight=bmi*square;
      const p={...demo,sex,height:String(height),age:String(age),weight:String(weight),activity,target:String(19*square)};
      const metrics=bodyMetrics(p);
      near(metrics.bmi!,bmi);
      const bmr=10*weight+6.25*height-5*age+(sex==='男'?5:-161);
      near(metrics.bmr!,bmr);near(metrics.tdee!,factor*bmr);
      for(const goal of ['减脂','维持体重','健康增重']){
        const result=assessEnergy({...p,goal,gainScreen:checked,deficit:{mode:'系统推荐',normalOptIn:true}});
        if(bmi<16||bmi>=40||bmi<18.5&&goal!=='健康增重'||goal==='健康增重'&&(age>=65||bmi>=24))assert.notEqual(result.status,'可生成');
        if(result.status==='可生成'){
          const change=result.targets.energy!.actualAdjustment!;
          assert.ok(Number.isFinite(result.targets.kcal));
          assert.ok(goal==='健康增重'?change>=0:goal==='减脂'?change<=0:change===0);
          assert.ok(result.targets.kcal>=result.targets.energy!.floor);
        }
        samples++;
      }
    }
  assert.equal(samples,42336);
  for(const pace of ['缓慢','适中'] as const) {
    const rates=bmis.map(bmi=>bmiDeficitRate(bmi,pace));
    assert.ok(rates.every((rate,index)=>index===0||rate>=rates[index-1]));
    near(bmiDeficitRate(24,pace),pace==='缓慢'?.10:.12);
    near(bmiDeficitRate(28,pace),pace==='缓慢'?.125:.15);
  }
});
test('增重跨 18.5、候选比例、方向限制、筛查及目标进度',()=>{
  const p:Profile={...demo,goal:'健康增重',height:'173',weight:'53',target:'60',activity:'正常通勤',gainScreen:checked};
  const below=nutrition(p),above=nutrition({...p,weight:'56'}),nearGoal=nutrition({...p,weight:'59.9'});
  near(below.energy!.candidateRate!,.10);near(above.energy!.candidateRate!,.10);
  assert.ok(below.kcal>below.tdee&&above.kcal>above.tdee);
  near(nearGoal.energy!.effective,25);
  assert.equal(nutrition({...p,weight:'61'}).energy!.effective,0);
  assert.equal(assessEnergy({...p,gainScreen:{...checked,professionalClearance:false}}).status,'需专业评估');
  assert.equal(assessEnergy({...p,gainScreen:{...checked,risks:['近期非自主减重']}}).status,'需专业评估');
  assert.equal(assessEnergy({...p,weight:'45'}).status,'需专业评估');
  assert.equal(assessEnergy({...p,age:'16'}).status,'需专业评估');
  assert.equal(assessEnergy({...p,age:''}).status,'需核对');
  assert.equal(weightProgress({...p,weight:'56'},[],{kg:53}).lost,3);
  near(weightProgress({...p,weight:'56'},[],{kg:53}).percent!,300/7);
  for(const mode of ['系统推荐','缓慢增重','适中增重','维持体重','自定义'] as const){
    const t=nutrition({...p,deficit:{mode,standard:8,unit:'百分比'}});
    assert.equal(t.energy!.actualAdjustment===0,mode==='维持体重');
  }
  assert.throws(()=>nutrition({...p,deficit:{mode:'自定义',standard:16,unit:'百分比'}}));
  const plan=regenerate(p,[],{},[],'v32 低体重健康增重');
  assert.equal(plan.targets.energy?.mode,'健康增重');
  verifyAgainst(plan,p,[],{},[]);
});
