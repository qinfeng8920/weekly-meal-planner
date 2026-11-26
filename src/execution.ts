import {food} from './catalog';
import {addEvents,balances,ledgerLots,usageEntries,type Ledger,type Lot} from './inventory';
import {purchaseFood,type PurchaseOptions,rawNetGrams,roundGrams} from './purchase-food';
import type {PrepJob} from './logistics';
import type {Pantry} from './shopping';

export {consumedBySource,homeKey} from './inventory';
/** 旧备份的原始元数据，只用于兼容读取。 */
export type StockInfo={expires:string;storage:'干燥常温'|'冷藏'|'冷冻'};
export type Allocation={id:string;source:string;grams:number;recipeGrams?:number};
export type TaskRecord={packed?:true;made?:true;eaten?:true;taken?:{date:string;allocation:Allocation[];confirmed?:true}};
export type Execution={stock?:Record<string,StockInfo>;tasks?:Record<string,TaskRecord>};
export type TaskAction='分装'|'制作'|'取用'|'用餐';
export function taskKey(start:string,day:number,meal:string,recipe:string) {
  return [start,String(day),meal,recipe].join('|');
}

export function stockForPlanning(ledger:Ledger):Pantry {
  return Object.fromEntries([...balances(ledger)].filter(([,stock])=>stock>0).map(([id,stock])=>[id,{stock}]));
}

export function allocateIngredient(id:string,grams:number,lots:Lot[],options?:PurchaseOptions) {
  const product=purchaseFood(id,options);
  const allocation:Allocation[]=[];
  let missing=grams;
  // 只允许同款熟料满足熟料需求；熟库存不能替代生料菜。
  const sources=product.purchaseIngredientId===id?[id]:[id,product.purchaseIngredientId];
  for(const sourceId of sources) for(const lot of lots) {
    if(!missing||lot.id!==sourceId||lot.net<=0)continue;
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

export type TaskChange={ledger:Ledger;execution:Execution;withdrawals:{id:string;grams:number}[]};
export function executeJobs(ledger:Ledger,current:Execution,jobs:Pick<PrepJob,'key'|'ingredients'>[],action:TaskAction,checked:boolean,date:string,
  options?:PurchaseOptions):TaskChange {
  const tasks={...current.tasks}, lots=[...ledgerLots(ledger).values()];
  const entries:ReturnType<typeof usageEntries>=[];
  const summary=new Map<string,number>();
  const shortage=new Map<string,number>();
  for(const job of jobs) {
    if(!job.key)throw Error('此记录没有可关联的食谱任务。');
    const key=job.key, entry={...tasks[key]};
    if(action==='分装')entry.packed=checked?true:undefined;
    if(action==='制作')entry.made=checked?true:undefined;
    const undo=action==='取用'&&!checked;
    if(undo&&entry.taken) {
      const outstanding=new Map<string,number>();
      for(const event of ledger.events)if(event.reference===key&&(event.kind==='实际取用'||event.kind==='撤销')) {
        outstanding.set(event.source,roundGrams((outstanding.get(event.source)??0)-event.delta));
      }
      entries.push(...usageEntries([...outstanding].filter(([,grams])=>grams>0).map(([source,grams])=>({source,grams,id:source.split('|').at(-1)!})),key,date,true));
      entry.taken=undefined;entry.eaten=undefined;entry.made=undefined;
    }
    if((action==='取用'||action==='制作'||action==='用餐')&&checked&&!entry.taken) {
      const allocations:Allocation[]=[];
      for(const ingredient of job.ingredients) {
        const result=allocateIngredient(ingredient.id,ingredient.grams,lots,options);
        allocations.push(...result.allocation);
        if(result.missing)shortage.set(ingredient.id,roundGrams((shortage.get(ingredient.id)??0)+result.missing));
      }
      entries.push(...usageEntries(allocations,key,date));
      for(const part of allocations) {
        const id=part.source.split('|').at(-1)??part.id;
        summary.set(id,roundGrams((summary.get(id)??0)+part.grams));
      }
      entry.taken={date,allocation:allocations,confirmed:true};
    }
    if(action==='用餐')entry.eaten=checked?true:undefined;
    if(entry.packed||entry.made||entry.eaten||entry.taken)tasks[key]=entry;
    else delete tasks[key];
  }
  if(shortage.size)throw Error('账面库存不足：'+[...shortage].map(([id,grams])=>food(id).name+' '+grams+' 克').join('、')+'。请核对已购或实际用量。');
  return {ledger:addEvents(ledger,entries),execution:{...current,tasks},withdrawals:[...summary].map(([id,grams])=>({id,grams}))};
}
