import {dateKey,type Profile} from './profile';

export const prepPeriods=['每天','每2天','每2～3天','每3～4天','每周','自定义'] as const;
export const purchasePeriods=['一次采购','随备餐采购','干货一次、生鲜分批'] as const;
export type SupplySettings={prep:typeof prepPeriods[number];purchase?:typeof purchasePeriods[number];shopping?:ShoppingSchedule;pattern?:number[];prepDates?:number[];purchaseDates?:number[]};
export type Range={index:number;from:number;to:number;prepAt:number;purchaseAt:number};
export function addDays(start:string,offset:number) {
  const day=new Date(start+'T12:00:00');day.setDate(day.getDate()+offset);
  return dateKey(day);
}
export const patternOptions:Record<Exclude<SupplySettings['prep'],'自定义'>,number[][]>={
  每天:[[1,1,1,1,1,1,1]],每2天:[[2,2,2,1]],'每2～3天':[[2,2,3],[2,3,2],[3,2,2]],
  '每3～4天':[[3,4],[4,3]],每周:[[7]],
};
export function supplyDefaults(p:Profile):SupplySettings {
  return {prep:p.prep==='每天现做'?'每天':p.prep==='周末一次备餐'?'每周':'每2～3天',
    shopping:{count:p.trips==='2'?2:1}};
}
export function splitWeek(settings:SupplySettings,length=7):Range[] {
  const options=settings.prep==='自定义'?undefined:patternOptions[settings.prep];
  const defaultPattern=options?.[0]??[2,2,3];
  let pattern=settings.pattern??defaultPattern;
  if(length!==7) return Array.from({length},(_,i)=>({index:i,from:i,to:i+1,prepAt:i,purchaseAt:i}));
  if(!pattern.length||pattern.some(v=>!Number.isInteger(v)||v<1||v>7)||pattern.reduce((a,b)=>a+b,0)!==7||
    options&&!options.some(o=>o.join()===pattern.join())) throw Error('批次必须完整覆盖 7 天，并符合所选周期。');
  let from=0;
  return pattern.map((count,index)=>{
    const prepAt=settings.prepDates?.[index]??from;
    const purchaseAt=settings.shopping?prepAt:settings.purchaseDates?.[index]??prepAt;
    if(!Number.isInteger(prepAt)||!Number.isInteger(purchaseAt)||prepAt< -1||prepAt>from||purchaseAt< -1||purchaseAt>prepAt) {
      throw Error('采购日不得晚于备餐日，备餐日不得晚于本批首次食用日。');
    }
    const result={index,from,to:from+count,prepAt,purchaseAt};from+=count;return result;
  });
}

export type ShoppingSchedule={count:1|2|3|'自定义';offsets?:number[]};
export function shoppingSchedule(settings:SupplySettings,p:Profile):ShoppingSchedule {
  return settings.shopping??{count:settings.purchase==='一次采购'?1:settings.purchase==='随备餐采购'||p.trips==='2'?2:1};
}
export function shoppingOffsets(settings:SupplySettings,p:Profile,start:string,earliest?:string) {
  const {count,offsets}=shoppingSchedule(settings,p);
  const days=count==='自定义'?offsets??[]:count===1?[0]:count===2?[0,3]:[0,2,4];
  if(!days.length||days.length>7||days.some((value,i)=>!Number.isInteger(value)||value< -1||value>6||i>0&&value<=days[i-1])) {
    throw Error('请选择 1～7 个不重复的采购日期，按日期从早到晚排列。');
  }
  if(earliest&&days.some(day=>addDays(start,day)<earliest))throw Error('自定义采购日已经过去，请更换采购日期或将食谱延后。');
  return days;
}
