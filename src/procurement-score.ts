import {purchaseCategory} from './purchase-category';
import type {Logistics} from './logistics';

export function procurementSummary(quote:Logistics) {
  const used=quote.lines.filter(row=>row.uses.length);
  const needed=quote.lines.filter(row=>row.remaining>0||row.estimate===null);
  const home=used.reduce((sum,row)=>sum+row.uses.reduce((n,use)=>n+(use.sourcing?.home??0)+(use.sourcing?.carry??0),0),0);
  return {used:used.length,needed:needed.length,main:used.filter(row=>purchaseCategory(row.id)==='主要食材').length,
    seasonings:used.filter(row=>purchaseCategory(row.id)!=='主要食材').length,home,
    once:needed.filter(row=>new Set(row.uses.map(use=>use.jobKey??use.day)).size===1).length,
    cost:quote.remaining.known,missing:quote.remaining.missing};
}

export function procurementScore(quote:Logistics,preferred:ReadonlySet<string>,compact:boolean) {
  const result=procurementSummary(quote);
  const preference=quote.lines.filter(row=>row.uses.length&&preferred.has(row.id)).length;
  const surplus=quote.inventory.reduce((n,row)=>n+Math.max(0,row.projected-row.home),0);
  return result.needed*(compact?4:2.6)+result.once*.08+result.cost*.025+result.missing*3+
    surplus*.0007-Math.min(result.home,12000)*.00085-preference*1.8;
}
