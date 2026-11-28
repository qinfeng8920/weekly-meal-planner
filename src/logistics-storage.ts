import {z} from 'zod';
import {inventoryOperations,type Ledger} from './inventory';
import {convertibleFoods} from './purchase-food';
import {foodMap} from './catalog';
import {prepPeriods,purchasePeriods,splitWeek} from './batches';
import {priceUnits,type PriceBook} from './prices';

const number=z.number().min(0).max(1e10);
const text=z.string().max(1200);
const date=z.iso.date();
const id=z.string().refine(s=>foodMap.has(s),'食材不存在');
const day=z.int().min(-1).max(7);
const safeRecordKey=z.string().regex(/^(?:\d{4}-\d\d-\d\d\|(?:-1|[0-6])|手动\|[a-z0-9-]{1,80})\|[a-z][a-z0-9-]+$/)
  .refine(s=>foodMap.has(s.split('|')[2]));
const priceFields={amount:number,unit:z.enum(priceUnits),basis:z.enum(['净重','毛重']),pack:number.positive().optional(),
  unitGrams:number.positive().optional(),yieldPercent:number.min(1).max(100).optional(),note:text.optional(),date:date.optional()};
const priceInput=z.strictObject(priceFields);
export const priceBook=z.record(id,priceInput);
const price=z.strictObject({...priceFields,id,region:text,kind:z.enum(['监测','类别参考','估算','用户自定义']),source:text,url:z.url({protocol:/^https$/}).optional()});
const settings=z.strictObject({prep:z.enum(prepPeriods),purchase:z.enum(purchasePeriods).optional(),shopping:z.strictObject({count:z.union([z.literal(1),z.literal(2),z.literal(3),z.literal('自定义')]),offsets:z.array(z.int().min(-1).max(6)).min(1).max(7).optional()}).optional(),pattern:z.array(z.int().min(1).max(7)).min(1).max(7).optional(),
  prepDates:z.array(day).max(7).optional(),purchaseDates:z.array(day).max(7).optional()}).superRefine((value,ctx)=>{
  try {
    splitWeek(value);
    const chosen=value.shopping?.offsets;
    if(value.shopping?.count==='自定义'&&(!chosen?.length||chosen.some((d,i)=>i>0&&d<=chosen[i-1])))throw Error();
  } catch {ctx.addIssue({code:'custom',message:'非法的备餐覆盖范围'});}
});
const storage=z.strictObject({expires:date,storage:z.enum(['干燥常温','冷藏','冷冻'])});
const taskKey=z.string().regex(/^\d{4}-\d\d-\d\d\|[0-6]\|[^|]{1,8}\|[a-z0-9-]{1,80}(?:\|[a-z0-9-]{1,80}\|[0-5]\|[a-z0-9]{1,12})?$/);
const disposal=z.strictObject({id,source:z.string().max(300).refine(s=>foodMap.has(s.split('|').at(-1)??'')),grams:number.positive(),recipeGrams:number.positive().optional()});
export const executionSchema=z.strictObject({shared:z.record(z.string().max(12000),z.literal(true)).optional(),stock:z.record(id,storage).optional(),tasks:z.record(taskKey,z.strictObject({
  packed:z.literal(true).optional(),made:z.literal(true).optional(),eaten:z.literal(true).optional(),
  ingredients:z.array(z.strictObject({id,grams:number})).optional(),
  taken:z.strictObject({date,allocation:z.array(disposal),confirmed:z.literal(true).optional()}).optional(),
})).optional()});
const convertible=z.string().refine(id=>convertibleFoods.includes(id));
const ledgerEvent=z.strictObject({id:z.string().max(300),item:id,source:z.string().max(300),kind:z.enum(inventoryOperations),date:date.optional(),
  quantity:number,unit:z.enum(priceUnits),delta:z.number().min(-1e10).max(1e10),reference:z.string().max(300).optional(),
  paid:number.optional(),reverses:z.string().max(300).optional()});
const ledgerReview=z.strictObject({id:z.string().max(300),item:id,grams:number,kind:z.enum(['可能重复的手工库存','旧采购重量','旧取用差额'])});
const ledgerSchema=z.strictObject({version:z.literal(1),events:z.array(ledgerEvent),review:z.array(ledgerReview)});
export function validLedger(ledger:Ledger) {
  const sources=new Map<string,{item:string;net:number}>();
  const ids=new Set<string>();
  for(const event of ledger.events) {
    if(ids.has(event.id)||event.source.split('|').at(-1)!==event.item)return false;
    ids.add(event.id);
    const prior=sources.get(event.source)??{item:event.item,net:0};
    prior.net=Math.round((prior.net+event.delta)*100+1e-6)/100;
    if(prior.item!==event.item||prior.net<0)return false;
    sources.set(event.source,prior);
  }
  return new Set(ledger.review.map(r=>r.id)).size===ledger.review.length;
}
export const supplySchema=z.strictObject({settings:settings.optional(),prices:priceBook.optional(),
  receipts:z.record(safeRecordKey,z.strictObject({gross:number.positive(),net:number,paid:number.optional(),paidGross:number.optional(),referenceCost:number.nullable().optional(),date:date.optional(),quantity:number.optional(),unit:z.enum(priceUnits).optional(),netOnly:z.literal(true).optional(),storage:storage.optional()})).optional(),execution:executionSchema.optional(),ledger:ledgerSchema.optional(),startChoice:z.union([z.enum(['今天','明天','下周一']),date]).optional(),products:z.strictObject({ready:z.array(convertible).max(5).optional(),yields:z.record(convertible,z.number().min(.1).max(10).nullable()).optional()}).optional()});
const use=z.strictObject({day,meal:text,dish:text,grams:number,recipeId:id.optional(),recipeGrams:number.optional(),conversionMissing:z.boolean().optional(),blocked:z.boolean().optional(),prepAt:day,method:text,jobKey:taskKey.optional(),sourcing:z.strictObject({home:number,carry:number,forecast:number,taken:number}).optional()});
const cost=z.strictObject({known:number,missing:z.int().nonnegative(),items:z.int().nonnegative()});
const buyLine=z.strictObject({id,quantityPending:z.boolean().optional(),uses:z.array(use),need:number,stock:number,carry:number,buy:number,remaining:number,confirmed:number,
  netConfirmed:number,leftover:number,receiptDate:date.optional(),receiptQuantity:number.optional(),receiptUnit:z.enum(priceUnits).optional(),receiptNetOnly:z.literal(true).optional(),receiptStorage:storage.optional(),price:price.optional(),consume:number.nullable(),estimate:number.nullable(),paid:number.nullable(),
  paidEstimated:z.boolean(),paidActual:number.optional(),paidGross:number.optional(),cost,bill:cost,receiptKey:text});
const range=z.strictObject({index:z.int().min(0).max(6),from:day,to:day,prepAt:day,purchaseAt:day});
const prepJob=z.strictObject({key:taskKey.optional(),day,at:day,name:text,meal:text,method:text,active:number,waiting:number,reheat:number.optional(),tools:z.array(text),steps:z.array(text),
  ingredients:z.array(z.strictObject({id,grams:number}))});
const buyBatch=z.strictObject({day:z.int().min(-10000).max(10000),date,lines:z.array(buyLine),purchase:cost,consumed:cost,paid:cost,remaining:cost});
const prepBatch=z.strictObject({range,start:date,end:date,prepDate:date,purchaseDate:date,rows:z.array(z.strictObject({id,uses:z.array(use),grams:number})),
  jobs:z.array(prepJob),active:number,waiting:number,boxes:number,tools:z.array(text),sessions:z.array(z.strictObject({date,active:number,waiting:number,total:number})).optional()});
export const logisticsSchema=z.strictObject({
  settings,start:date,people:z.int().min(1).max(12),
  batches:z.array(buyBatch),actualBatches:z.array(buyBatch).optional(),conflicts:z.array(text).optional(),storageWarnings:z.array(text).optional(),
  prep:z.array(prepBatch),notice:z.array(text),consumed:cost,purchase:cost,paid:cost,actualPaid:cost.optional(),unpricedPaid:cost.optional(),remaining:cost,categories:z.record(text,cost),
  lines:z.array(buyLine),budget:number.nullable(),checked:number,toBuy:number,
  inventory:z.array(z.strictObject({id,home:number,confirmed:number,projected:number,usable:number.optional(),taken:number.optional(),demand:number.optional(),shortage:number.optional()})),
});

export function parsePriceBackup(contents:string):PriceBook {
  if(contents.length>1_000_000)throw Error('价格备份文件过大。');
  let value:unknown;
  try {value=JSON.parse(contents);}catch{throw Error('价格备份不是有效 JSON。');}
  const result=z.strictObject({type:z.literal('tiantianjian-prices'),version:z.literal(1),prices:priceBook}).safeParse(value);
  if(!result.success)throw Error('价格备份格式或食材编号有误。');
  return result.data.prices;
}
