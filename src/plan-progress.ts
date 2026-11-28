import {addDays} from './batches';
import type {Execution} from './execution';
import type {BuyLine,Logistics,PrepBatch,PrepJob} from './logistics';

export function quantityIssue(row:BuyLine) {
  return row.quantityPending??row.uses.some(use=>use.conversionMissing||use.blocked);
}
export function purchaseStatus(row:BuyLine) {
  if(quantityIssue(row))return '待核对';
  if(row.remaining>0)return row.confirmed>0?'已买部分':'待买';
  return row.confirmed>0?'已购':'无需补购';
}
export function purchaseProgress(rows:BuyLine[]) {
  const statuses=[...new Map(rows.map(row=>[row.receiptKey||row.id,row])).values()].map(purchaseStatus);
  return {done:statuses.filter(status=>status==='已购').length,total:statuses.filter(status=>status!=='无需补购').length,
    review:statuses.filter(status=>status==='待核对').length};
}
export function weeklyPurchases(quote:Logistics) {
  const rows=quote.batches.flatMap(batch=>batch.lines);
  return {...purchaseProgress(rows),needed:new Set(rows.filter(row=>row.remaining>0).map(row=>row.id)).size,
    covered:new Set(rows.filter(row=>purchaseStatus(row)==='无需补购'&&row.stock+row.carry>0).map(row=>row.id)).size};
}

function prepStage(job:PrepJob,execution?:Execution) {
  const task=job.key?execution?.tasks?.[job.key]:undefined;
  const cook=!job.method.startsWith('当天开封或洗切');
  const pack=job.day>job.at||/分装|按份冷冻/.test(job.method);
  const pending=!task?.eaten&&(!task?.taken||cook&&!task.made||pack&&!task.packed);
  return {taken:Boolean(task?.taken),made:Boolean(task?.made),packed:Boolean(task?.packed),eaten:Boolean(task?.eaten),pending};
}
export function prepProgress(batch:PrepBatch,execution?:Execution) {
  const stages=batch.jobs.map(job=>prepStage(job,execution));
  const count=(key:keyof (typeof stages)[number])=>stages.filter(stage=>stage[key]).length;
  return {taken:count('taken'),made:count('made'),packed:count('packed'),eaten:count('eaten'),pending:count('pending'),total:stages.length};
}
export function nextPrep(quote:Logistics,execution?:Execution) {
  const batches=quote.prep.flatMap((batch,index)=>{
    const pending=batch.jobs.filter(job=>prepStage(job,execution).pending);
    if(!pending.length)return [];
    return [{index,date:addDays(quote.start,Math.min(...pending.map(job=>job.at))),count:pending.length}];
  });
  return batches.sort((a,b)=>a.date.localeCompare(b.date))[0];
}
