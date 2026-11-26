import {ingredientPoolSchema,poolSettingsSchema,poolTemplateSchema} from './pool-storage';
import {defaultPool,type PoolSettings,type PoolTemplate} from './ingredient-pool';
import {logisticsSchema,supplySchema,validLedger} from './logistics-storage';
import {legacyLedger} from './inventory';
import type {SupplyState} from './logistics';
import {z} from 'zod';
import {initialProfile, type Profile, type Weight} from './profile';
import type {Lock, Plan} from './planner';
import type {Pantry} from './shopping';

export type Data = {version:1; profile:Profile|null; weights:Weight[]; plan:Plan|null; history:Plan[];
  pantry:Pantry; blocked:string[]; favorites:string[]; locks:Lock[]; theme:'系统'|'浅色'|'深色';supply?:SupplyState;poolSettings?:PoolSettings;poolTemplates?:PoolTemplate[]};
export const fresh = ():Data => ({version:1,profile:null,weights:[],plan:null,history:[],pantry:{},blocked:[],favorites:[],locks:[],theme:'系统',poolSettings:structuredClone(defaultPool)});

const string = z.string().max(800);
const names = z.array(string).max(180);
const num = z.number().min(0).max(1e8);
const date = z.iso.date();
const meal = z.strictObject({minutes:string,cuisines:names,likes:string,dislikes:string,
  repeats:z.boolean(),fixed:z.boolean(),prep:z.boolean()});
const mode=z.enum(['极简','简单','家常','精致']);
const cookingMode=z.enum(['极简','简单','家常','精致','混合','不限制']);
const cookOverride=z.strictObject({mode:mode.optional(),total:z.number().optional(),
  active:z.number().optional(),maxDishes:z.number().optional(),
  prep:z.boolean().optional(),onePot:z.boolean().optional(),fixedBreakfast:z.boolean().optional()});
const mealCooking=z.strictObject({早餐:cookOverride.optional(),午餐:cookOverride.optional(),晚餐:cookOverride.optional()});
const cooking=z.strictObject({mode:cookingMode,weekday:mode,weekend:mode,meals:mealCooking.optional(),
  days:z.record(z.string().regex(/^[0-6]$/),mealCooking).optional()});
const profile = z.strictObject({
  ...Object.fromEntries(Object.entries(initialProfile).map(([key,value])=>
    [key,typeof value==='boolean'?z.boolean():Array.isArray(value)?names:string])),
  cooking:cooking.optional(),
  mealPreferences:z.strictObject({早餐:meal.optional(),午餐:meal.optional(),晚餐:meal.optional()}).optional(),
});
const ingredient = z.strictObject({id:z.string().regex(/^[a-z][a-z0-9-]{0,49}$/),grams:num.positive().max(2000)});
const recipe = z.strictObject({id:string,name:string,group:z.enum(['蛋白质菜','蔬菜','主食','早餐','水果','加餐','汤类']),
  ingredients:z.array(ingredient).min(1).max(25),tools:names,prep:num,cook:num,steps:names,cuisine:string,flavor:string,skill:string,batch:z.boolean(),min:num,max:num});
const macros = {kcal:num,protein:num,carbs:num,fat:num,fiber:num};
const nutrients = z.strictObject({...macros,sodium:num.nullable(),calcium:num.nullable(),potassium:num.nullable(),vitaminC:num.nullable()});
const serving = z.strictObject({recipe,ingredients:z.array(ingredient).min(1).max(25),nutrients});
const purchase = z.strictObject({id:string,name:string,category:string,state:string,need:num,stock:num,buy:num,bought:num,
  done:z.boolean(),cost:num.nullable(),extra:num,part:z.array(num).min(1).max(7),uncertain:z.boolean()});
const plan = z.strictObject({id:string,name:string,created:z.iso.datetime(),start:date,seed:string,profile,weight:num,
  days:z.array(z.strictObject({meals:z.array(z.strictObject({name:string,dishes:z.array(serving).min(1).max(6)})).min(2).max(4)})).length(7),
  targets:z.strictObject({...macros,bmi:num,bmr:num,tdee:num,water:num.nullable(),message:string}),
  purchases:z.array(purchase).max(180),prep:z.strictObject({mode:string,notice:names,days:z.array(z.strictObject({date,task:string,minutes:num,meals:names})).length(7)}),
  algorithmVersion:string,catalogVersion:string,favorite:z.boolean(),cookingOverride:cookingMode.optional(),logistics:logisticsSchema.optional(),pool:ingredientPoolSchema.optional()});
const metrics = z.record(z.string().regex(/^[a-z][a-z0-9-]{0,49}$/),
  z.strictObject({stock:num.optional(),bought:num.optional(),price:num.optional(),pack:num.positive().optional(),yieldPercent:num.min(1).max(100).optional()}));
const schema = z.strictObject({version:z.literal(1),profile:profile.nullable(),
  weights:z.array(z.strictObject({date,kg:z.number().min(35).max(260),waist:z.number().min(35).max(250).optional()})).max(20000),
  plan:plan.nullable(),history:z.array(plan).max(500),pantry:metrics,blocked:names,favorites:names,
  locks:z.array(z.strictObject({day:z.int().min(0).max(6),meal:z.int().min(0).max(3),dish:z.int().min(0).max(5),serving})).max(168),
  theme:z.enum(['系统','浅色','深色']),supply:supplySchema.optional(),poolSettings:poolSettingsSchema.optional(),poolTemplates:z.array(poolTemplateSchema).max(50).optional()});

export const backupLimit=64_000_000;
export function parseBackup(contents:string):Data {
  if (contents.length>backupLimit) throw Error('备份文件过大。');
  let input:unknown;
  try {input=JSON.parse(contents);} catch {throw Error('此文件不是有效的 JSON 备份。');}
  const result=schema.safeParse(input);
  if (!result.success) throw Error('备份版本不受支持，或内容存在缺失及无效字段。');
  const data = result.data as unknown as Data;
  if (new Set(data.weights.map(w=>w.date)).size!==data.weights.length ||
      new Set(data.history.map(p=>p.id)).size!==data.history.length ||
      (data.locks.length && !data.plan)) throw Error('备份包含重复记录或无法关联的锁定信息。');
  if(data.supply?.ledger) {
    if(!validLedger(data.supply.ledger))throw Error('库存流水存在重复或负余额，备份未应用。');
  } else {
    const ledger=legacyLedger(data.pantry,data.supply);
    if(ledger.events.length||ledger.review.length)data.supply=supplySchema.parse({...data.supply,ledger}) as SupplyState;
  }
  return data;
}

const storageError = () => Error('无法访问本机存储。请检查浏览器隐私设置和剩余空间。');
function db():Promise<IDBDatabase> {
  return new Promise((resolve,reject)=>{
    if (!('indexedDB' in globalThis)) return reject(storageError());
    const request=indexedDB.open('tiantianjian',1);
    request.onupgradeneeded=()=>{ if (!request.result.objectStoreNames.contains('app')) request.result.createObjectStore('app'); };
    request.onblocked=()=>reject(Error('请关闭其他打开天天减的页面后重试。'));
    request.onerror=()=>reject(storageError());
    request.onsuccess=()=>resolve(request.result);
  });
}
export async function loadData() {
  const database=await db();
  try {
    return await new Promise<Data>((resolve,reject)=>{
      const tx=database.transaction('app','readwrite'),store=tx.objectStore('app'), request=store.get('data');
      let result:Data;
      request.onsuccess=()=>{
        try {
          const raw=request.result as Data|undefined;
          result=raw===undefined?fresh():parseBackup(JSON.stringify(raw));
          if(raw&&!raw.supply?.ledger&&result.supply?.ledger)store.put(result,'data');
        }catch(e){reject(e);tx.abort();}
      };
      tx.oncomplete=()=>resolve(result!);
      tx.onerror=tx.onabort=()=>reject(storageError());
    });
  } finally {database.close();}
}
export async function writeData(data:Data,previous:Data) {
  const checked=parseBackup(JSON.stringify(data));
  const database=await db();
  try {
    await new Promise<void>((resolve,reject)=>{
      const tx=database.transaction('app','readwrite');
      const store=tx.objectStore('app');
      const read=store.get('data');
      read.onsuccess=()=>{
        try {
          const current=read.result===undefined?fresh():parseBackup(JSON.stringify(read.result));
          if (JSON.stringify(current)!==JSON.stringify(parseBackup(JSON.stringify(previous)))) {
            reject(Error('另一个页面已更新本机数据。请刷新后重试。'));tx.abort();return;
          }
          store.put(checked,'data');
        } catch(e) {reject(e);tx.abort();}
      };
      tx.oncomplete=()=>resolve();
      tx.onerror=tx.onabort=()=>reject(storageError());
    });
  } finally {database.close();}
}
export function downloadFile(name:string,contents:string,type='application/json') {
  const url=URL.createObjectURL(new Blob([contents],{type}));
  const link=document.createElement('a'); link.href=url; link.download=name; link.click();
  setTimeout(()=>URL.revokeObjectURL(url),2000);
}
