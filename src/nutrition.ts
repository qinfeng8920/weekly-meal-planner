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

export type EnergyBasis = {current:number;calculation:number;actualBmi:number;activity:number;requested:number;standard:number;
  bmiFactor:number;distanceCap:number;safetyCap:number;floor:number;effective:number;recentCount:number;earlierCount:number;
  weightReason:string;intent:string;mode:'减脂'|'维持体重';adjustment:string;calculatedOn:string;latestDate?:string};
export type Targets = { bmi:number; bmr:number; tdee:number; kcal:number; protein:number; carbs:number; fat:number; fiber:number; water:number|null; message:string; energy?:EnergyBasis };
const activity: Record<string, number> = {长期久坐:1.2,正常通勤:1.375,经常站立走动:1.55,体力劳动:1.725};
export const between = (n: number, min: number, max: number) => Number.isFinite(n) && n >= min && n <= max;

export const bmiDeficitFactor=(bmi:number)=>Math.max(0,Math.min(1,(bmi-18.5)/5.5));
export const customDeficitLimit=400;
const professional='目前的情况需要个体化评估。请咨询医生或注册营养师后安排饮食。';

export function nutrition(p:Profile,records:Weight[]=[],today=dateKey()):Targets {
  if(!p.screened||!p.allergyChecked)throw Error('请先完成健康与过敏筛查。');
  const age=Number(p.age),height=Number(p.height),initial=Number(p.weight);
  if((age>0&&age<18)||p.risks.length||p.conditions.some(c=>['肾脏疾病','其他特殊情况'].includes(c))||p.otherHealth.trim())
    throw Error(professional);
  const {current,calculation:kg,latest,recentCount,earlierCount,rapid,abrupt,reason:weightReason}=weightTrend(p,records,today);
  const target=p.goal==='维持体重'?current:Number(p.target);
  const activityFactor=activity[p.activity];
  if(!['男','女'].includes(p.sex)||!Number.isInteger(age)||!between(age,18,79)||!between(height,120,220)||
    !between(initial,35,260)||!between(current,35,260)||!between(target,35,260)||!activityFactor)
    throw Error('请检查性别、年龄、身高、当前及目标体重。适用范围为 18～79 岁、120～220 厘米和 35～260 千克。');
  const square=(height/100)**2,bmi=kg/square,actualBmi=current/square;
  if([bmi,actualBmi,target/square].some(value=>value<18.5-1e-9)||Math.max(bmi,actualBmi)>=40)
    throw Error('当前、趋势或目标体重超出通用计划的适用范围，请先咨询专业人员。');
  const bmr=10*kg+6.25*height-5*age+(p.sex==='男'?5:-161);
  const tdee=bmr*activityFactor;
  const floor=p.sex==='男'?1500:1200;
  if(tdee<floor||(bmr+10*(current-kg))*activityFactor<floor)
    throw Error('估算能量低于应用的通用适用下限，请咨询专业人员。');
  const intent=p.goal==='维持体重'?'维持体重':p.deficit?.mode??'系统推荐';
  if(intent==='自定义'&&(p.deficit?.standard===undefined||!between(p.deficit.standard,0,customDeficitLimit)))
    throw Error('自定义标准缺口应为 0～400 千卡。');
  const normal=Math.min(bmi,actualBmi)<24-1e-9;
  const autoRamp=Math.max(0,Math.min(1,Math.min(bmi,actualBmi)-24));
  const requested=intent==='维持体重'?0:intent==='自定义'?p.deficit!.standard!:
    intent==='适中减脂'?400:intent==='缓慢减脂'?300:(p.pace==='适中'&&!p.deficit?400:300)*autoRamp;
  const bmiFactor=bmiDeficitFactor(bmi),distanceCap=Math.max(0,(Math.min(kg,current)-target)*300);
  const standard=Math.min(requested,tdee*.15), scaled=Math.min(standard,distanceCap)*bmiFactor;
  const stopped=p.goal!=='减脂'||intent==='维持体重'?'已选择维持':
    Math.min(kg,current)<=target||Math.min(bmi,actualBmi)<=18.5+1e-9?'已达到目标或低体重保护边界':
    age>=65?'65 岁起采用保守维持':
    abrupt?'近期称重变化异常，请复测并核对，先按维持估算':
    normal&&intent==='系统推荐'?'正常 BMI 的默认推荐为维持':
    normal&&(!p.deficit?.normalOptIn||p.conditions.length>0)?'正常 BMI 下未确认适用，或健康标签需先核对，当前按维持估算':'';
  const safetyCap=stopped?0:Math.max(0,Math.min(tdee-floor,scaled-(rapid?150:0)));
  const effective=Math.min(scaled,safetyCap);
  const kcal=Math.max(floor,Math.round(tdee-effective));
  const mode=effective>0?'减脂':'维持体重';
  const adjustment=stopped||[rapid?'近期均值下降较快，收窄缺口':'',distanceCap<standard?'接近目标，缩小缺口':'',
    bmiFactor<1?'按 BMI 连续缩减缺口':'',intent==='系统推荐'&&autoRamp>0&&autoRamp<1?'系统建议在 BMI 24～25 之间逐渐启用缺口':'',tdee*.15<requested?'限制在估算总消耗的 15% 内':'',
    tdee-floor<scaled?'保留最低能量':''].filter(Boolean).join('，')||(requested===0?'标准缺口为 0':'按标准缺口估算');
  const protein=Math.round(Math.min(kcal*.23/4,Math.min(kg,28*square)*(effective>0?1.2:1)));
  const fat=Math.round(kcal*.28/9);
  return {bmi,bmr,tdee,kcal,protein,carbs:Math.round((kcal-protein*4-fat*9)/4),fat,fiber:25,
    water:p.fluidLimit?null:p.sex==='男'?1700:1500,message:adjustment,
    energy:{current,calculation:kg,actualBmi,activity:activityFactor,requested,standard,bmiFactor,distanceCap,safetyCap,floor,effective,
      weightReason,recentCount,earlierCount,intent,mode,adjustment,calculatedOn:today,latestDate:latest?.date}};
}

export function energyNeedsReview(saved:Targets,current:Targets) {
  const energy=current.energy;
  return Boolean(energy&&saved.kcal<current.kcal&&
    (Math.min(current.bmi,energy.actualBmi)<=18.5+1e-9||
    energy.adjustment.startsWith('已达到目标')||energy.adjustment.startsWith('近期称重变化异常')||
    energy.adjustment.startsWith('近期均值下降较快')||
    energy.mode==='维持体重'&&(saved.energy?.effective??Math.max(0,saved.tdee-saved.kcal))>0));
}
