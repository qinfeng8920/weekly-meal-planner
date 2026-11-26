import type {Profile, Weight} from './profile';

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

export type Targets = { bmi:number; bmr:number; tdee:number; kcal:number; protein:number; carbs:number; fat:number; fiber:number; water:number|null; message:string };
const activity: Record<string, number> = {长期久坐:1.2,正常通勤:1.375,经常站立走动:1.55,体力劳动:1.725};
export const between = (n: number, min: number, max: number) => Number.isFinite(n) && n >= min && n <= max;

export function nutrition(p: Profile, records: Weight[] = []): Targets {
  if (!p.screened || !p.allergyChecked) throw Error('请先完成健康与过敏筛查。');
  const age = Number(p.age), height = Number(p.height), initial = Number(p.weight);
  const latest = [...records].sort((a,b)=>b.date.localeCompare(a.date))[0];
  const kg = latest?.kg ?? initial;
  if ((age > 0 && age < 18) || p.risks.length || p.conditions.some(c=>['肾脏疾病','其他特殊情况'].includes(c)) || p.otherHealth.trim()) {
    throw Error('目前的情况需要个体化评估。请咨询医生或注册营养师后安排饮食。');
  }
  const target = p.goal === '维持体重' ? kg : Number(p.target);
  if (!['男','女'].includes(p.sex) || !Number.isInteger(age) || !between(age,18,79) || !between(height,120,220) ||
      !between(initial,35,260) || !between(kg,35,260) || !between(target,35,260) || !activity[p.activity]) {
    throw Error('请检查性别、年龄、身高、当前及目标体重。适用范围为 18～79 岁、120～220 厘米和 35～260 千克。');
  }
  const square = (height / 100) ** 2;
  const bmi = kg / square;
  if (bmi < 18.5 || target / square < 18.5 || bmi >= 40) throw Error('当前或目标体重超出通用计划的适用范围，请先咨询专业人员。');
  const bmr = 10*kg + 6.25*height - 5*age + (p.sex === '男' ? 5 : -161);
  const tdee = bmr * activity[p.activity];
  const loss = p.goal === '减脂' && age < 65 && bmi >= 24 && target < kg;
  let deficit = loss ? Math.min(p.pace === '适中' ? 400 : 300, tdee * .15, (kg-target)*300) : 0;
  if (loss && latest) {
    const now = Date.parse(latest.date);
    const middle = records.filter(r=>between((now-Date.parse(r.date))/86400000,14,28));
    const recent = records.filter(r=>between((now-Date.parse(r.date))/86400000,0,7));
    if (middle.length >= 2 && recent.length >= 2) {
      const avg = (rows: Weight[])=>rows.reduce((n,r)=>n+r.kg,0)/rows.length;
      if (avg(middle)-avg(recent) > kg*.015) deficit = Math.max(0, deficit-150);
    }
  }
  const floor = p.sex === '男' ? 1500 : 1200;
  if (tdee < floor) throw Error('估算能量低于应用的通用适用下限，请咨询专业人员。');
  const kcal = Math.max(floor, Math.round(tdee-deficit));
  const protein = Math.round(Math.min(kcal*.23/4, Math.min(kg, 28*square) * (loss ? 1.2 : 1)));
  const fat = Math.round(kcal*.28/9);
  return {bmi,bmr,tdee,kcal,protein,carbs:Math.round((kcal-protein*4-fat*9)/4),fat,fiber:25,
    water:p.fluidLimit ? null : p.sex === '男' ? 1700 : 1500,
    message:loss ? '按成人一般饮食估算，逐步调整。' : '当前按维持体重估算。'};
}
