import {food,foodMap} from './catalog';
import {addDays} from './batches';
import {edibleRate,priceFor,type PriceUnit} from './prices';
import {roundGrams} from './purchase-food';
import type {Allocation,Execution} from './execution';
import type {Receipt,SupplyState} from './logistics';
import type {Pantry} from './shopping';

export const inventoryOperations=['采购入库','购买修正','手动补充','手动扣除','报损丢弃','实际取用','撤销','旧手工库存','库存清空'] as const;
export type InventoryEvent={
  id:string;item:string;source:string;kind:typeof inventoryOperations[number];date?:string;
  quantity:number;unit:PriceUnit;delta:number;reference?:string;paid?:number;reverses?:string;
};
export type Review={id:string;item:string;grams:number;kind:'可能重复的手工库存'|'旧采购重量'|'旧取用差额'};
export type Ledger={version:1;events:InventoryEvent[];review:Review[]};
export type Lot={id:string;source:string;net:number};
export const homeKey=(id:string)=>'家中|'+id;
export const emptyLedger=():Ledger=>({version:1,events:[],review:[]});

export function ledgerLots(ledger:Ledger):Map<string,Lot> {
  const lots=new Map<string,Lot>();
  for(const event of ledger.events) {
    const lot=lots.get(event.source)??{id:event.item,source:event.source,net:0};
    lot.net=roundGrams(lot.net+event.delta);lots.set(event.source,lot);
  }
  return lots;
}

export function balances(ledger:Ledger) {
  const byId=new Map<string,number>();
  for(const lot of ledgerLots(ledger).values())byId.set(lot.id,roundGrams((byId.get(lot.id)??0)+lot.net));
  return byId;
}

export function consumedBySource(execution?:Execution) {
  const totals=new Map<string,number>();
  for(const task of Object.values(execution?.tasks??{}))for(const item of task.taken?.allocation??[]) {
    totals.set(item.source,roundGrams((totals.get(item.source)??0)+item.grams));
  }
  return totals;
}

export function receiptIdentity(source:string) {
  const [week,day,item]=source.split('|');
  return {item,date:week==='手动'||!Number.isFinite(Date.parse(week))?undefined:addDays(week,+day)};
}

export function legacyLedger(pantry:Pantry,state?:SupplyState):Ledger {
  const ledger=emptyLedger(), receipts=state?.receipts??{}, tasks=state?.execution?.tasks??{};
  const spent=consumedBySource(state?.execution);
  const boughtItems=new Set<string>();
  const originals=new Map<string,number>();
  for(const [source,receipt] of Object.entries(receipts).sort(([a],[b])=>a.localeCompare(b))) {
    const {item,date}=receiptIdentity(source);
    if(receipt.gross>0)boughtItems.add(item);
    if(!receipt.net)ledger.review.push({id:'旧采购|'+source,item,grams:receipt.gross,kind:'旧采购重量'});
    ledger.events.push({id:'旧购买|'+source,item,source,date:receipt.date??date,kind:'采购入库',
      quantity:receipt.quantity??receipt.gross,unit:receipt.unit??'克',delta:receipt.net,paid:receipt.paid,reference:source});
    originals.set(source,receipt.net);
  }
  for(const [item,entry] of Object.entries(pantry).sort(([a],[b])=>a.localeCompare(b))) {
    if(!foodMap.has(item))continue;
    const source=homeKey(item), alreadyUsed=spent.get(source)??0;
    if(entry.stock) {
      const overlap=boughtItems.has(item)&&entry.stock>alreadyUsed;
      const initial=overlap?alreadyUsed:entry.stock;
      if(overlap)ledger.review.push({id:'旧库存|'+item,item,grams:roundGrams(entry.stock-alreadyUsed),kind:'可能重复的手工库存'});
      if(initial)ledger.events.push({id:'旧登记|'+item,item,source,kind:'旧手工库存',quantity:initial,unit:'克',delta:initial});
      originals.set(source,initial);
    }
    if(entry.bought) {
      const price=priceFor(item,state?.prices??{},entry);
      const rate=price&&edibleRate(price);
      if(!entry.stock&&!boughtItems.has(item)&&price?.basis==='净重'&&rate) {
        const key='旧确认|'+item;
        ledger.events.push({id:key,item,source:key,kind:'采购入库',quantity:entry.bought,unit:'克',delta:entry.bought});
      }else ledger.review.push({id:'旧采购|'+item,item,grams:entry.bought,kind:'旧采购重量'});
    }
  }
  for(const [ref,task] of Object.entries(tasks).sort(([a],[b])=>a.localeCompare(b))) {
    task.taken?.allocation.forEach((part,i)=>{
      const source=part.source,item=source.split('|').at(-1)??part.id;
      if(!foodMap.has(item))return;
      const taken=Math.min(part.grams,originals.get(source)??0);
      if(taken) {
        ledger.events.push({id:'旧取用|'+ref+'|'+i,item,source,date:task.taken!.date,kind:'实际取用',
          quantity:taken,unit:'克',delta:-taken,reference:ref});
        originals.set(source,roundGrams(originals.get(source)!-taken));
      }
      if(taken<part.grams)ledger.review.push({id:'旧差额|'+ref+'|'+i,item,grams:roundGrams(part.grams-taken),kind:'旧取用差额'});
    });
  }
  // 归一化可选字段，保证旧备份反复读取和写入时结果一致。
  return JSON.parse(JSON.stringify(ledger)) as Ledger;
}

export function currentLedger(pantry:Pantry,state?:SupplyState):Ledger {
  return state?.ledger??legacyLedger(pantry,state);
}

type Entry=Omit<InventoryEvent,'id'>;
export function addEvents(ledger:Ledger,entries:Entry[]):Ledger {
  if(!entries.length)return ledger;
  const lots=ledgerLots(ledger);
  const existing=new Set(ledger.events.map(e=>e.id));
  const added=entries.map((entry,i)=>{
    const lot=lots.get(entry.source)??{id:entry.item,source:entry.source,net:0};
    const next=roundGrams(lot.net+entry.delta);
    if(lot.id!==entry.item||next<0)throw Error(food(entry.item).name+'余额不足。已有数量可能已取用，请先核对该笔记录。');
    lot.net=next;lots.set(entry.source,lot);
    let sequence=ledger.events.length+i;
    while(existing.has('流水|'+sequence))sequence++;
    const id='流水|'+sequence;
    existing.add(id);
    return {...entry,id};
  });
  return {...ledger,events:[...ledger.events,...added]};
}

export function recordPurchase(ledger:Ledger,source:string,previous:Receipt|undefined,next:Receipt|undefined,date:string) {
  if(!previous&&!next)return ledger;
  const equalQuantity=previous?.net===next?.net&&previous?.gross===next?.gross&&previous?.quantity===next?.quantity&&previous?.unit===next?.unit;
  if(previous&&next&&equalQuantity&&previous.paid===next.paid&&previous.paidGross===next.paidGross&&previous.date===next.date)return ledger;
  const receipt=next??previous!;
  const {item}=receiptIdentity(source);
  if(!foodMap.has(item)||next&&(!Number.isFinite(next.net)||next.net<=0||next.net>next.gross))throw Error('请核对实际购买数量及折算净重。');
  const documents=ledger.events.filter(event=>event.source===source&&event.reference===source&&
    (event.kind==='采购入库'||event.kind==='购买修正'||event.kind==='撤销'));
  const entered=roundGrams(documents.reduce((sum,event)=>sum+event.delta,0));
  const delta=roundGrams((next?.net??0)-entered);
  const last=documents.at(-1);
  if(!delta&&(!next||last&&last.kind!=='撤销'&&last.quantity===(next.quantity??next.gross)&&last.unit===(next.unit??'克')&&last.date===(next.date??date)&&last.paid===next.paid))
    return ledger;
  return addEvents(ledger,[{item,source,reference:source,date:next?.date??date,
    kind:next?(entered||previous?'购买修正':'采购入库'):'撤销',quantity:receipt.quantity??receipt.gross,unit:receipt.unit??'克',
    delta,paid:next?.paid}]);
}

export function adjustStock(ledger:Ledger,item:string,value:number,mode:'增加'|'扣除'|'报损'|'设为',date:string,source:string) {
  if(!Number.isFinite(value)||value<0||value>1e8)throw Error('请填写有效的净重。');
  const current=balances(ledger).get(item)??0;
  const delta=roundGrams(mode==='设为'?value-current:mode==='增加'?value:-value);
  if(delta>=0)return delta?addEvents(ledger,[{item,source,kind:'手动补充',date,quantity:delta,unit:'克',delta}]):ledger;
  let needed=-delta;
  const entries:Entry[]=[];
  for(const lot of ledgerLots(ledger).values()) {
    if(lot.id!==item||lot.net<=0||!needed)continue;
    const take=Math.min(lot.net,needed);
    needed=roundGrams(needed-take);
    entries.push({item,source:lot.source,reference:source,kind:mode==='报损'?'报损丢弃':'手动扣除',date,quantity:take,unit:'克',delta:-take});
  }
  if(needed)throw Error(food(item).name+'账面库存不足，扣除未保存。');
  return addEvents(ledger,entries);
}

export function resolveReview(ledger:Ledger,id:string,grams:number,date:string) {
  const review=ledger.review.find(r=>r.id===id);
  if(!review)return ledger;
  return adjustStock({...ledger,review:ledger.review.filter(r=>r.id!==id)},review.item,grams,'增加',date,'核对|'+id+'|'+review.item);
}

export function clearInventory(ledger:Ledger,reference:string,date:string,item?:string) {
  if(ledger.events.some(event=>event.reference===reference&&event.kind==='库存清空'))return ledger;
  const entries:Entry[]=[];
  for(const lot of ledgerLots(ledger).values())if(lot.net>0&&(!item||lot.id===item)) {
    entries.push({item:lot.id,source:lot.source,reference,date,kind:'库存清空',quantity:lot.net,unit:'克',delta:-lot.net});
  }
  return addEvents(ledger,entries);
}

export function undoInventoryClear(ledger:Ledger,reference:string,date:string) {
  const reversed=new Set(ledger.events.flatMap(event=>event.reverses??[]));
  return addEvents(ledger,ledger.events.filter(event=>event.reference===reference&&event.kind==='库存清空'&&!reversed.has(event.id))
    .map(event=>({item:event.item,source:event.source,reference,date,kind:'撤销',quantity:event.quantity,unit:'克',delta:-event.delta,reverses:event.id})));
}

export function reverseAdjustment(ledger:Ledger,id:string,date:string) {
  const target=ledger.events.find(e=>e.id===id);
  if(!target||!['手动补充','手动扣除','报损丢弃','旧手工库存'].includes(target.kind)||ledger.events.some(e=>e.reverses===id))return ledger;
  const group=target.reference?ledger.events.filter(e=>e.kind===target.kind&&e.reference===target.reference):[target];
  return addEvents(ledger,group.map(e=>({item:e.item,source:e.source,reference:e.reference,reverses:e.id,kind:'撤销',
    date,quantity:e.quantity,unit:e.unit,delta:-e.delta})));
}

export function usageEntries(allocation:Allocation[],ref:string,date:string,undo=false):Entry[] {
  return allocation.map(a=>({item:a.source.split('|').at(-1)??a.id,source:a.source,reference:ref,date,quantity:a.grams,
    unit:'克',kind:undo?'撤销':'实际取用',delta:undo?a.grams:-a.grams}));
}
