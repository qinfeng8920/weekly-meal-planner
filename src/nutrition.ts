import {dateKey,type Profile,type Weight} from './profile';
import {weightTrend} from './weight';

export type Nutrients = {
  kcal: number; protein: number; carbs: number; fat: number; fiber: number;
  sodium: number | null; calcium: number | null; potassium: number | null; vitaminC: number | null;
};
export const macroKeys = ['kcal','protein','carbs','fat','fiber'] as const;
export const microKeys = ['sodium','calcium','potassium','vitaminC'] as const;
export const zero = (): Nutrients => ({kcal:0,protein:0,carbs:0,fat:0,fiber:0,sodium:0,calcium:0,potassium:0,vitaminC:0});
export function sum(items: Nutrients[]): Nutrients {
  const total = zero();
  for (const item of items) {
    for (const key of macroKeys) total[key] += item[key];
    for (const key of microKeys) {
      const current = total[key];
      const quantity = item[key];
      total[key] = current === null || quantity === null ? null : current + quantity;
    }
  }
  return total;
}
export function scale(n: Nutrients, factor: number) {
  const total = zero();
  for (const key of macroKeys) total[key] = n[key] * factor;
  for (const key of microKeys) total[key] = n[key] === null ? null : n[key] * factor;
  return total;
}

export type EnergyMode='减脂'|'维持体重'|'健康增重';
export type EnergyBasis = {current:number;calculation:number;actualBmi:number;activity:number;requested:number;standard:number;
  bmiFactor?:number;distanceCap:number;safetyCap:number;floor:number;effective:number;recentCount:number;earlierCount:number;
  weightReason:string;intent:string;mode:EnergyMode;adjustment:string;calculatedOn:string;latestDate?:string;
  candidateRate?:number;actualAdjustment?:number;goal?:string;pace?:string};
export type Targets = { bmi:number; bmr:number; tdee:number; kcal:number; protein:number; carbs:number; fat:number; fiber:number; water:number|null; message:string; energy?:EnergyBasis };
const activity: Record<string, number> = {长期久坐:1.2,正常通勤:1.375,经常站立走动:1.55,体力劳动:1.725};
export const between = (n:number,min:number,max:number)=>Number.isFinite(n)&&n>=min&&n<=max;
export const customDeficitLimit=400;
const professional='目前的情况需要个体化评估。请咨询医生或注册营养师后安排饮食。';
const riskConditions=['肾脏疾病','其他特殊情况','高血糖','高血压','胃肠道问题'];
export const needsEnergyReviewForConditions=(p:Profile)=>p.conditions.some(c=>riskConditions.includes(c));
export function bmiDeficitRate(bmi:number,pace:'缓慢'|'适中') {
  if(!Number.isFinite(bmi)||bmi<=0)throw Error('无效 BMI。');
  const normal=pace==='缓慢'?.10:.12,upper=pace==='缓慢'?.125:.15;
  return bmi<=18.5?0:bmi<24?normal*(bmi-18.5)/5.5:bmi<28?normal+(upper-normal)*(bmi-24)/4:upper;
}
export const bmiCategory=(bmi:number)=>bmi<18.5?'低体重':bmi<24?'正常体重':bmi<28?'超重':'肥胖范围';
export function bodyMetrics(p:Profile,records:Weight[]=[],today=dateKey()) {
  const trend=weightTrend(p,records,today),{current,calculation:kg}=trend;
  const age=Number(p.age),height=Number(p.height),factor=activity[p.activity];
  const square=between(height,120,220)?(height/100)**2:null;
  const bmi=square&&between(kg,15,260)?kg/square:null;
  const actualBmi=square&&between(current,15,260)?current/square:null;
  const bmr=bmi!==null&&['男','女'].includes(p.sex)&&Number.isInteger(age)&&between(age,18,79)
    ?10*kg+6.25*height-5*age+(p.sex==='男'?5:-161):null;
  return {...trend,age,square,bmi,actualBmi,bmr,activity:factor??null,tdee:bmr!==null&&factor?bmr*factor:null};
}

export function assessEnergy(p:Profile,records:Weight[]=[],today=dateKey()):
  {status:'可生成';targets:Targets;metrics:ReturnType<typeof bodyMetrics>}|
  {status:'需核对'|'需专业评估';reason:string;metrics:ReturnType<typeof bodyMetrics>} {
  const metrics=bodyMetrics(p,records,today);
  const {age,square,bmi,actualBmi,bmr,activity:factor,tdee,current,calculation:kg,latest,recentCount,earlierCount,rapid,abrupt,reason:weightReason}=metrics;
  const block=(reason:string,status:'需核对'|'需专业评估'='需核对')=>({status,reason,metrics});
  if(!p.screened||!p.allergyChecked)return block('请先完成健康与过敏筛查。');
  if((p.age.trim()&&Number.isFinite(age)&&(age<18||age>79))||p.risks.length||
      p.conditions.some(c=>['肾脏疾病','其他特殊情况'].includes(c))||p.otherHealth.trim())return block(professional,'需专业评估');
  if(square===null||bmi===null||actualBmi===null||bmr===null||tdee===null||factor===null)
    return block('请检查性别、年龄、身高、当前体重和活动量。');
  const low=Math.min(bmi,actualBmi),high=Math.max(bmi,actualBmi);
  if(low<16-1e-9||high>=40-1e-9)return block('当前或趋势 BMI 超出通用计划的适用范围，请先咨询专业人员。','需专业评估');
  if(!['减脂','维持体重','健康增重'].includes(p.goal))return block('请填写有效的体重管理目标。');
  const gain=p.goal==='健康增重',loss=p.goal==='减脂', target=gain||loss?Number(p.target):current;
  if(!between(target,15,260)||loss&&target/square<18.5-1e-9||gain&&target/square>=24-1e-9)
    return block('目标体重超出通用计划的适用范围，请核对。');
  if(loss&&low<18.5-1e-9)return block('低体重不适用减脂，请先进行营养评估。','需专业评估');
  if(!gain&&low<18.5-1e-9)return block('低体重请先完成营养评估，再选择适用的目标。','需专业评估');
  const intent=p.goal==='维持体重'?'维持体重':p.deficit?.mode??'系统推荐';
  if(gain) {
    if(age>=65||high>=24-1e-9||needsEnergyReviewForConditions(p)||p.gainScreen?.risks.length||rapid||abrupt)
      return block('健康增重需要先进行个体营养评估。','需专业评估');
    if(!p.gainScreen?.reviewed)return block('请到个人档案完成健康增重筛查。');
    if(low<18.5-1e-9&&!p.gainScreen.professionalClearance)
      return block('低体重需先由医生或注册营养师评估。评估确认适合一般膳食增重后，在档案中记录结果。','需专业评估');
  }
  const floor=p.sex==='男'?1500:1200;
  if(tdee<floor||(bmr+10*(current-kg))*factor<floor)return block('估算能量低于应用的通用适用下限，请咨询专业人员。','需专业评估');
  const preference=p.deficit;
  if(intent==='自定义'&&(preference?.standard===undefined||!between(preference.standard,0,preference.unit==='百分比'?15:customDeficitLimit)))
    return block('自定义调整应为 0～15% 或 0～400 千卡。');
  const pace=intent.startsWith('适中')||intent==='系统推荐'&&p.pace==='适中'?'适中':'缓慢';
  const upper=gain?.15:bmiDeficitRate(bmi,'适中');
  const legacy=loss&&!preference?.curve&&(intent==='缓慢减脂'||intent==='适中减脂');
  const curve=gain?(pace==='缓慢'?.10:.15):bmiDeficitRate(bmi,pace);
  const directionMismatch=gain&&intent.endsWith('减脂')||loss&&intent.endsWith('增重');
  const requested=intent==='维持体重'||directionMismatch?0:intent==='自定义'
    ?preference!.unit==='百分比'?tdee*preference!.standard!/100:preference!.standard!
    :legacy?(pace==='缓慢'?300:400):tdee*curve;
  const standard=Math.min(requested,tdee*upper,gain?400:Infinity);
  const remaining=Math.max(0,gain?target-Math.max(current,kg):Math.min(current,kg)-target);
  const distanceCap=remaining*(gain?250:300);
  const normal=low<24-1e-9;
  const stopped=intent==='维持体重'?'已选择维持':
    directionMismatch?'当前模式与档案目标方向不一致，请重新选择':
    remaining<=1e-9||loss&&low<=18.5+1e-9?'已达到目标或低体重保护边界':
    age>=65?'65 岁起采用保守维持':
    abrupt?'近期称重变化异常，请复测并核对，先按维持估算':
    loss&&normal&&needsEnergyReviewForConditions(p)?'档案有健康注意事项，减脂前请先核对专业评估':
    loss&&normal&&!preference?.normalOptIn?'正常 BMI 默认维持，减脂需主动确认适用':'';
  const energyCap=gain?400:tdee-floor;
  const safetyCap=stopped?0:Math.max(0,Math.min(energyCap,standard-(rapid?150:0)));
  const effective=Math.min(standard,distanceCap,safetyCap);
  const actualAdjustment=gain?effective:loss?-effective:0;
  const kcal=Math.round(tdee+actualAdjustment);
  const mode:EnergyMode=effective>0?(gain?'健康增重':'减脂'):'维持体重';
  const adjustment=stopped||[rapid?'近期均值下降较快，收窄缺口':'',distanceCap<standard?'接近目标，缩小热量调整':'',
    standard<requested?'按当前适用比例限制调整':'',energyCap<standard?'保留安全能量范围':'',
    legacy?'保留旧版固定选择，并应用新版安全上限':''].filter(Boolean).join('，')||(effective?'按当前体重及适用范围估算':'无热量调整');
  const protein=Math.round(Math.min(kcal*.23/4,Math.min(kg,28*square)*(effective>0?1.2:1)));
  const fat=Math.round(kcal*.28/9);
  const targets:Targets={bmi,bmr,tdee,kcal,protein,carbs:Math.round((kcal-protein*4-fat*9)/4),fat,fiber:25,
    water:p.fluidLimit?null:p.sex==='男'?1700:1500,message:adjustment,
    energy:{current,calculation:kg,actualBmi,activity:factor,requested,standard,distanceCap,safetyCap,floor,effective,
      weightReason,recentCount,earlierCount,intent,mode,adjustment,calculatedOn:today,latestDate:latest?.date,
      candidateRate:requested/tdee,actualAdjustment,goal:p.goal,pace}};
  return {status:'可生成',metrics,targets};
}

export function nutrition(p:Profile,records:Weight[]=[],today=dateKey()):Targets {
  const result=assessEnergy(p,records,today);
  if(result.status!=='可生成')throw Error(result.reason);
  return result.targets;
}
export function energyNeedsReview(saved:Targets,current:Targets) {
  const energy=current.energy;
  if(!energy)return false;
  const previous=saved.energy?.actualAdjustment??Math.min(0,saved.kcal-saved.tdee);
  return previous>0&&energy.mode!=='健康增重'||Boolean(previous<0&&saved.kcal<current.kcal&&
    (energy.mode==='维持体重'||energy.adjustment.startsWith('近期均值下降较快')));
}
