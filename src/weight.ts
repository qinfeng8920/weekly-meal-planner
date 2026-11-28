import {dateKey,type Profile,type Weight} from './profile';

const dayMs=86400000;
export function weightInRange(value:number) {return Number.isFinite(value)&&value>=35&&value<=260;}
export function isCalendarDate(value:string) {
  const timestamp=Date.parse(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(timestamp)&&new Date(timestamp).toISOString().slice(0,10)===value;
}
export const calendarAge=(date:string,today:string)=>(Date.parse(today)-Date.parse(date))/dayMs;
export function validWeights(rows:Weight[],today=dateKey()) {
  return [...new Map(rows.filter(row=>isCalendarDate(row.date)&&row.date<=today&&weightInRange(row.kg))
    .map(row=>[row.date,row])).values()].sort((a,b)=>a.date.localeCompare(b.date));
}
export function updateWeight(rows:Weight[],row:Weight,editing='',today=dateKey()) {
  if(!isCalendarDate(row.date)||row.date>today||!weightInRange(row.kg)||
    row.waist!==undefined&&(!Number.isFinite(row.waist)||row.waist<35||row.waist>250))
    throw Error('请填写有效日期、35～260 千克的体重及有效腰围。');
  if(rows.some(r=>r.date===row.date&&r.date!==editing))throw Error('这天已经有称重记录。请编辑对应记录或选择其他日期。');
  return [...rows.filter(r=>r.date!==editing),row];
}
export const meanWeight=(rows:Weight[])=>rows.reduce((total,row)=>total+row.kg,0)/rows.length;
export function weightTrend(profile:Profile,records:Weight[],today=dateKey()) {
  const rows=validWeights(records,today),latest=rows.at(-1),previous=rows.at(-2);
  const recent=rows.filter(row=>calendarAge(row.date,today)<7);
  const earlier=rows.filter(row=>{const days=calendarAge(row.date,today);return days>=14&&days<=28;});
  const enough=recent.length>=3&&calendarAge(recent[0].date,recent.at(-1)!.date)>=3;
  const current=latest?.kg??Number(profile.weight);
  const calculation=enough?meanWeight(recent):current;
  const rapid=earlier.length>=2&&recent.length>=2&&meanWeight(earlier)-meanWeight(recent)>current*.015;
  const abrupt=Boolean(latest&&previous&&calendarAge(previous.date,latest.date)<=7&&Math.abs(latest.kg-previous.kg)>previous.kg*.05);
  const reason=enough?'近 7 个日历日的有效称重均值':latest?'样本不足，采用最近一次有效称重':'暂无实际称重，使用档案体重';
  return {rows,latest,current,calculation,recentCount:recent.length,earlierCount:earlier.length,rapid,abrupt,reason};
}

export function weightProgress(profile:Profile,records:Weight[],phase?:{kg:number;date?:string}) {
  const {current,latest}=weightTrend(profile,records);
  const initial=phase?.kg??Number(profile.weight);
  const target=profile.goal==='减脂'&&weightInRange(Number(profile.target))?Number(profile.target):null;
  const lost=weightInRange(initial)?initial-current:null;
  const distance=target===null?null:current-target;
  const percent=target!==null&&lost!==null&&initial>target?lost*100/(initial-target):null;
  return {current,latest,initial,target,lost,distance,percent};
}
