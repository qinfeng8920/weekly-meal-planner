import {food} from './catalog';
import {addDays} from './batches';
import {storageDays,requiresCooling} from './food-storage';
import {purchaseFood,type PurchaseOptions,rawNetGrams,roundGrams} from './purchase-food';
import type {Receipt,PrepJob} from './logistics';
import type {Profile} from './profile';
import type {Pantry} from './shopping';

export type StockInfo={expires:string;storage:'干燥常温'|'冷藏'|'冷冻'};
export type Allocation={id:string;source:string;grams:number;recipeGrams?:number};
export type TaskRecord={packed?:true;made?:true;taken?:{date:string;allocation:Allocation[]}};
export type Execution={stock?:Record<string,StockInfo>;tasks?:Record<string,TaskRecord>};
export type TaskAction='分装'|'制作'|'取用';
type Lot={id:string;source:string;net:number;from:string;expires:string};
const round=(n:number)=>Math.round(n*100+1e-8)/100;
export function taskKey(start:string,day:number,meal:string,recipe:string) {
  return [start,String(day),meal,recipe].join('|');
}
export const homeKey=(id:string)=>'家中|'+id;
export function consumedBySource(execution:Execution|undefined) {
  const amounts=new Map<string,number>();
  for(const record of Object.values(execution?.tasks??{})) for(const portion of record.taken?.allocation??[]) {
    amounts.set(portion.source,round((amounts.get(portion.source)??0)+portion.grams));
  }
  return amounts;
}

export function actualLots(start:string,profile:Profile,pantry:Pantry,receipts:Record<string,Receipt>,execution:Execution) {
  const used=consumedBySource(execution);
  const lots:Lot[]=[];
  for(const [id,entry] of Object.entries(pantry)) {
    const info=execution.stock?.[id], source=homeKey(id);
    if(!info||!entry.stock||info.storage==='冷冻'&&!(profile.frozen&&profile.tools.includes('冰箱')&&profile.tools.includes('冷冻室'))||
      info.storage==='冷藏'&&!profile.tools.includes('冰箱')||info.storage==='干燥常温'&&requiresCooling(id))continue;
    const net=round(Math.max(0,entry.stock-(used.get(source)??0)));
    if(net)lots.push({id,source,net,from:'0001-01-01',expires:info.expires});
  }
  for(const [source,r] of Object.entries(receipts)) {
    const [week,date,id]=source.split('|');
    if(week>start||week!==start&&!r.storage)continue;
    const net=round(Math.max(0,r.net-(used.get(source)??0)));
    const from=r.date??addDays(week,Number(date));
    const storage=r.storage;
    const noFreezer={...profile,tools:profile.tools.filter(t=>t!=='冷冻室')};
    const defaultExpiry=addDays(from,storageDays(id,noFreezer));
    let expires=defaultExpiry;
    if(storage) {
      const verified=storage.storage==='冷冻'?profile.frozen&&profile.tools.includes('冰箱')&&profile.tools.includes('冷冻室'):
        storage.storage==='冷藏'?profile.tools.includes('冰箱'):!requiresCooling(id);
      if(!verified)continue;
      expires=storage.storage==='冷冻'||!requiresCooling(id)?storage.expires:
        storage.expires<defaultExpiry?storage.expires:defaultExpiry;
    }
    if(net&&expires>=from)lots.push({id,source,net,from,expires});
  }
  return lots.sort((a,b)=>a.expires.localeCompare(b.expires)||a.from.localeCompare(b.from));
}
export function dateStock(start:string,date:string,profile:Profile,pantry:Pantry,receipts:Record<string,Receipt>,execution:Execution) {
  const available:Pantry={};
  for(const lot of actualLots(start,profile,pantry,receipts,execution)) {
    if(lot.from<=date&&lot.expires>=date)available[lot.id]={stock:round((available[lot.id]?.stock??0)+lot.net)};
  }
  return available;
}

type ActualLot=ReturnType<typeof actualLots>[number];

export function allocateIngredient(id:string,grams:number,date:string,lots:ActualLot[],options?:PurchaseOptions) {
  const product=purchaseFood(id,options);
  const allocation:Allocation[]=[];
  let missing=grams;
  // 已制作的熟料只能用于原配方明确要求的同种熟料。
  const sources=product.purchaseIngredientId===id?[id]:[id,product.purchaseIngredientId];
  for(const sourceId of sources) for(const lot of lots) {
    if(!missing||lot.id!==sourceId||lot.from>date||lot.expires<date||lot.net<=0)continue;
    const rate=sourceId===id?1:product.rate;
    if(!rate)continue;
    const take=Math.min(lot.net,rawNetGrams(missing,rate));
    const recipeGrams=Math.min(missing,roundGrams(take*rate));
    if(take<=0||recipeGrams<=0)continue;
    lot.net=roundGrams(lot.net-take);missing=roundGrams(missing-recipeGrams);
    allocation.push({id,source:lot.source,grams:take,...(sourceId===id?{}:{recipeGrams})});
  }
  return {allocation,missing};
}

export function updateTask(current:Execution,job:PrepJob,action:TaskAction,checked:boolean,start:string,date:string,
  profile:Profile,pantry:Pantry,receipts:Record<string,Receipt>,options?:PurchaseOptions):Execution {
  if(!job.key)throw Error('旧版方案的执行进度请在当前方案中重新安排。');
  const tasks={...current.tasks}, entry={...tasks[job.key]};
  if(action==='分装')entry.packed=checked?true:undefined;
  if(action==='制作')entry.made=checked?true:undefined;
  if(action==='取用') {
    if(!checked)entry.taken=undefined;
    else {
      const lots=actualLots(start,profile,pantry,receipts,current);
      const allocation:Allocation[]=[...entry.taken?.allocation??[]];
      const shortages:string[]=[];
      for(const ingredient of job.ingredients) {
        const need=round(Math.max(0,ingredient.grams-allocation.filter(a=>a.id===ingredient.id).reduce((n,a)=>n+(a.recipeGrams??a.grams),0)));
        if(!need)continue;
        const result=allocateIngredient(ingredient.id,need,date,lots,options);
        allocation.push(...result.allocation);
        if(result.missing)shortages.push(food(ingredient.id).name+' '+result.missing+' 克');
      }
      if(shortages.length)throw Error('可用实际库存还缺 '+shortages.join('、')+'。请先确认已购或补录保质期内库存。');
      entry.taken={date:entry.taken?.date??date,allocation};
    }
  }
  if(entry.packed||entry.made||entry.taken)tasks[job.key]=entry;
  else delete tasks[job.key];
  return {...current,tasks};
}
