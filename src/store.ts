import {foodMap,recipeMap} from './catalog';
import {ingredientPoolSchema,poolSettingsSchema,poolTemplateSchema} from './pool-storage';
import {defaultPool,migratePreferences,type PoolSettings,type PoolTemplate} from './ingredient-pool';
import {executionSchema,logisticsSchema,supplySchema,validLedger} from './logistics-storage';
import {legacyLedger} from './inventory';
import type {SupplyState} from './logistics';
import {z} from 'zod';
import {dateKey,deficitModes,gainRiskItems,initialProfile, type Profile, type Weight} from './profile';
import type {Lock, Plan} from './planner';
import type {Pantry} from './shopping';

export type Data = {version:1; profile:Profile|null; weights:Weight[]; plan:Plan|null; history:Plan[];
  pantry:Pantry; blocked:string[]; favorites:string[]; locks:Lock[]; theme:'系统'|'浅色'|'深色';weightPhase?:{kg:number;date?:string};supply?:SupplyState;poolSettings?:PoolSettings;poolTemplates?:PoolTemplate[]};
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
  deficit:z.strictObject({mode:z.enum(deficitModes),standard:z.number().min(0).max(400).optional(),normalOptIn:z.boolean().optional(),unit:z.enum(['百分比','千卡']).optional(),curve:z.literal('percent').optional()}).optional(),
  gainScreen:z.strictObject({risks:z.array(z.enum(gainRiskItems)),reviewed:z.boolean(),professionalClearance:z.boolean()}).optional(),
  cooking:cooking.optional(),
  mealPreferences:z.strictObject({早餐:meal.optional(),午餐:meal.optional(),晚餐:meal.optional()}).optional(),
});
const ingredient = z.strictObject({id:z.string().regex(/^[a-z][a-z0-9-]{0,49}$/),grams:num.positive().max(2000)});
const recipe = z.strictObject({id:string,name:string,group:z.enum(['蛋白质菜','蔬菜','主食','早餐','水果','加餐','汤类']),
  ingredients:z.array(ingredient).min(1).max(25),tools:names,prep:num,cook:num,steps:names,cuisine:string,flavor:string,skill:string,batch:z.boolean(),min:num,max:num,baseId:string.optional(),
  replacements:z.array(z.strictObject({from:string,to:string,rule:string})).max(3).optional()});
const macros = {kcal:num,protein:num,carbs:num,fat:num,fiber:num};
const energyBasis=z.strictObject({current:num,calculation:num,actualBmi:num,activity:num,requested:num,standard:num,bmiFactor:z.number().min(0).max(1).optional(),
  distanceCap:num,safetyCap:num,floor:num,effective:num,recentCount:z.int().nonnegative(),earlierCount:z.int().nonnegative(),
  weightReason:string,intent:string,mode:z.enum(['减脂','维持体重','健康增重']),candidateRate:num.optional(),actualAdjustment:z.number().min(-1e8).max(1e8).optional(),goal:string.optional(),pace:string.optional(),adjustment:string,calculatedOn:date,latestDate:date.optional()});
const nutrients = z.strictObject({...macros,sodium:num.nullable(),calcium:num.nullable(),potassium:num.nullable(),vitaminC:num.nullable()});
const serving = z.strictObject({recipe,ingredients:z.array(ingredient).min(1).max(25),nutrients});
const purchase = z.strictObject({id:string,name:string,category:string,state:string,need:num,stock:num,buy:num,bought:num,
  done:z.boolean(),cost:num.nullable(),extra:num,part:z.array(num).min(1).max(7),uncertain:z.boolean()});
const plan = z.strictObject({id:string,name:string,created:z.iso.datetime(),start:date,seed:string,profile,weight:num,
  days:z.array(z.strictObject({meals:z.array(z.strictObject({name:string,dishes:z.array(serving).min(1).max(6)})).min(2).max(4)})).length(7),
  targets:z.strictObject({...macros,bmi:num,bmr:num,tdee:num,water:num.nullable(),message:string,energy:energyBasis.optional()}),
  purchases:z.array(purchase).max(foodMap.size),prep:z.strictObject({mode:string,notice:names,days:z.array(z.strictObject({date,task:string,minutes:num,meals:names})).length(7)}),
  algorithmVersion:string,catalogVersion:string,favorite:z.boolean(),taskScope:z.uuid().optional(),cookingOverride:cookingMode.optional(),logistics:logisticsSchema.optional(),executionSnapshot:executionSchema.optional(),pool:ingredientPoolSchema.optional()});
const metrics = z.record(z.string().regex(/^[a-z][a-z0-9-]{0,49}$/),
  z.strictObject({stock:num.optional(),bought:num.optional(),price:num.optional(),pack:num.positive().optional(),yieldPercent:num.min(1).max(100).optional()}));
const schema = z.strictObject({version:z.literal(1),profile:profile.nullable(),
  weights:z.array(z.strictObject({date,kg:z.number().min(15).max(260),waist:z.number().min(35).max(250).optional()})).max(20000),
  plan:plan.nullable(),history:z.array(plan).max(500),pantry:metrics,blocked:z.array(string).max(recipeMap.size),favorites:z.array(string).max(recipeMap.size),
  locks:z.array(z.strictObject({day:z.int().min(0).max(6),meal:z.int().min(0).max(3),dish:z.int().min(0).max(5),serving})).max(168),
  weightPhase:z.strictObject({kg:z.number().min(15).max(260),date:date.optional()}).optional(),
  theme:z.enum(['系统','浅色','深色']),supply:supplySchema.optional(),poolSettings:poolSettingsSchema.optional(),poolTemplates:z.array(poolTemplateSchema).max(50).optional()});

export const backupLimit=64_000_000;
export function parseBackup(contents:string,importDay?:string):Data {
  if (contents.length>backupLimit) throw Error('备份文件过大。');
  let input:unknown;
  try {input=JSON.parse(contents);} catch {throw Error('此文件不是有效的 JSON 备份。');}
  const result=schema.safeParse(input);
  if (!result.success) throw Error('备份版本不受支持，或内容存在缺失及无效字段。');
  const data = result.data as unknown as Data;
  if (new Set(data.weights.map(w=>w.date)).size!==data.weights.length ||
      new Set(data.history.map(p=>p.id)).size!==data.history.length ||
      (data.locks.length && !data.plan)) throw Error('备份包含重复记录或无法关联的锁定信息。');
  if(importDay&&(data.weights.some(row=>row.date>importDay)||data.weightPhase?.date&&data.weightPhase.date>importDay))
    throw Error('备份包含未来日期的称重记录或体重阶段，请核对设备日期。');
  if(data.supply?.ledger) {
    if(!validLedger(data.supply.ledger))throw Error('库存流水存在重复或负余额，备份未应用。');
  } else {
    const ledger=legacyLedger(data.pantry,data.supply);
    if(ledger.events.length||ledger.review.length)data.supply=supplySchema.parse({...data.supply,ledger}) as SupplyState;
  }
  if(data.poolSettings)data.poolSettings=migratePreferences(data.poolSettings,data.supply?.products);
  if(data.poolTemplates)data.poolTemplates=data.poolTemplates.map(t=>({...t,settings:migratePreferences(t.settings)}));
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
export const storageChannel='tiantianjian-data';
export const directoryKey='profiles-v2';
type Theme=Data['theme'];
export type ProfileEntry={id:string;createdAt:string;updatedAt:string;revision:number;sourceId?:string;data:Data};
type Directory={schemaVersion:2;activeProfileId:string|null;theme:Theme;profiles:ProfileEntry[]};
export type ProfileDirectory=Omit<Directory,'profiles'>&{profiles:{id:string;name:string;createdAt:string;current:number|null;target:number|null;goal:string}[]};
const readVersions=new WeakMap<Data,{id:string;revision:number}>();

export class DataConflict extends Error {
  constructor() {super('本机数据已更新或档案已删除，本次操作未覆盖。请核对后重试。');}
}
function broadcast(id?:string) {
  try {
    const channel=new BroadcastChannel(storageChannel);
    channel.postMessage({id});channel.close();
  } catch { /* 下次打开会重新读取。 */ }
}
function newEntry(data:Data):ProfileEntry {
  const stamp=new Date().toISOString();
  return {id:crypto.randomUUID(),createdAt:stamp,updatedAt:stamp,revision:0,data};
}
function snapshot(d:Directory):ProfileDirectory {
  return {...d,profiles:d.profiles.map(({id,createdAt,data})=>{
    const p=data.profile,current=data.weights.filter(w=>w.date<=dateKey()).reduce<Weight|undefined>((latest,w)=>!latest||w.date>latest.date?w:latest,undefined)?.kg??Number(p?.weight);
    const target=Number(p?.target);
    return {id,createdAt,name:p?.name||'未命名档案',current:Number.isFinite(current)&&current>0?current:null,target:p?.goal!=='维持体重'&&Number.isFinite(target)&&target>0?target:null,goal:p?.goal??'待填写'};
  })};
}
async function transact<T>(run:(d:Directory)=>T,write=false):Promise<T> {
  const database=await db();
  try {
    return await new Promise<T>((resolve,reject)=>{
      const tx=database.transaction('app','readwrite'),store=tx.objectStore('app'),request=store.get(directoryKey);
      let result:T;
      tx.oncomplete=()=>resolve(result);
      tx.onerror=tx.onabort=()=>reject(storageError());
      function finish(d:Directory,migrated=false) {
        try {
          result=run(d);
          if(write||migrated)store.put(d,directoryKey);
          if(migrated)store.delete('data');
        } catch(e) {reject(e);tx.abort();}
      }
      request.onsuccess=()=>{
        if(request.result!==undefined) {
          const d=request.result as Directory;
          if(d.schemaVersion!==2||!Array.isArray(d.profiles)||d.activeProfileId!==null&&!d.profiles.some(p=>p.id===d.activeProfileId)){
            reject(Error('档案索引异常。请保留原数据，再从有效备份恢复。'));tx.abort();return;
          }
          finish(d);
        } else {
          const legacy=store.get('data');
          legacy.onsuccess=()=>{
            try {
              const data=legacy.result===undefined?undefined:parseBackup(JSON.stringify(legacy.result));
              const profiles=data?[newEntry(data)]:[];
              finish({schemaVersion:2,activeProfileId:profiles[0]?.id??null,theme:data?.theme??'系统',profiles},true);
            }catch(e){reject(e);tx.abort();}
          };
        }
      };
    });
  } finally {database.close();}
}
export const loadDirectory=()=>transact(snapshot);
export async function loadData(id:string|null) {
  return transact(d=>{
    if(id===null)return {...fresh(),theme:d.theme};
    const entry=d.profiles.find(p=>p.id===id);
    if(!entry)throw new DataConflict();
    const result={...entry.data,theme:d.theme};
    readVersions.set(result,{id,revision:entry.revision});
    return result;
  });
}
export async function writeData(id:string|null,data:Data,previous:Data) {
  const checked=parseBackup(JSON.stringify(data));
  const version=readVersions.get(previous);
  const themeChanged=data.theme!==previous.theme;
  const revision=await transact(d=>{
    if(themeChanged&&d.theme!==previous.theme)throw new DataConflict();
    if(id===null){
      if(!themeChanged)throw new DataConflict();
      d.theme=checked.theme;
      return -1;
    }
    const entry=d.profiles.find(p=>p.id===id);
    if(!entry||version?.id!==id||entry.revision!==version.revision)throw new DataConflict();
    entry.data=checked;entry.updatedAt=new Date().toISOString();
    if(themeChanged)d.theme=checked.theme;
    return ++entry.revision;
  },true);
  if(id!==null)readVersions.set(data,{id,revision});
  broadcast(themeChanged?undefined:id??undefined);
}
export async function addProfile() {
  const id=await transact(d=>{
    const entry=newEntry({...fresh(),theme:d.theme});
    d.profiles.push(entry);d.activeProfileId=entry.id;return entry.id;
  },true);
  broadcast();return id;
}
export async function selectProfile(id:string) {
  await transact(d=>{
    if(!d.profiles.some(p=>p.id===id))throw new DataConflict();
    d.activeProfileId=id;
  },true);broadcast();
}
export async function removeProfile(id:string|null) {
  await transact(d=>{
    if(id!==null&&!d.profiles.some(p=>p.id===id))throw new DataConflict();
    d.profiles=id===null?[]:d.profiles.filter(p=>p.id!==id);
    if(id===null||d.activeProfileId===id)d.activeProfileId=d.profiles[0]?.id??null;
  },true);broadcast();
}
const backupHeader=z.strictObject({kind:z.enum(['天天减单档案','天天减全部档案']),schemaVersion:z.literal(2),
  algorithmVersion:z.string().optional(),activeProfileId:z.uuid().nullable().optional(),theme:z.enum(['系统','浅色','深色']).optional(),
  profiles:z.array(z.strictObject({id:z.uuid(),createdAt:z.iso.datetime(),updatedAt:z.iso.datetime(),revision:z.int().nonnegative(),sourceId:z.uuid().optional(),data:z.unknown()}))});
export function exportProfiles(id:string|null) {
  return transact(d=>{
    const profiles=id===null?d.profiles:d.profiles.filter(p=>p.id===id);
    if(id!==null&&!profiles.length)throw new DataConflict();
    return JSON.stringify({kind:id===null?'天天减全部档案':'天天减单档案',schemaVersion:2,algorithmVersion:'3.2.0',
      activeProfileId:id??d.activeProfileId,theme:d.theme,profiles});
  });
}
export function readProfilesBackup(contents:string,today:string) {
  if(contents.length>backupLimit)throw Error('备份文件过大。');
  let raw:unknown;
  try {raw=JSON.parse(contents);}catch {throw Error('此文件不是有效的 JSON 备份。');}
  if(raw&&typeof raw==='object'&&'version' in raw&&raw.version===1)
    return {kind:'天天减单档案' as const,profiles:[newEntry(parseBackup(contents,today))]};
  const header=backupHeader.parse(raw);
  if(new Set(header.profiles.map(p=>p.id)).size!==header.profiles.length||
    header.activeProfileId&&!header.profiles.some(p=>p.id===header.activeProfileId)||
    header.kind==='天天减单档案'&&header.profiles.length!==1)throw Error('档案备份包含无效或重复的编号。');
  return {...header,profiles:header.profiles.map(p=>({...p,data:parseBackup(JSON.stringify(p.data),today)}))};
}
export async function restoreProfiles(backup:ReturnType<typeof readProfilesBackup>,mode:'新建'|'合并'|'全部替换'|'覆盖',target?:string) {
  await transact(d=>{
    if(mode==='覆盖'){
      const entry=d.profiles.find(p=>p.id===target);
      if(!entry||backup.profiles.length!==1)throw new DataConflict();
      entry.data=backup.profiles[0].data;entry.revision++;entry.updatedAt=new Date().toISOString();
    }else if(mode==='全部替换'){
      // 替换时分配新 ID，使旧页面与尚未完成的任务无法写入替换后的记录。
      d.profiles=backup.profiles.map(entry=>({...newEntry(entry.data),sourceId:entry.sourceId??entry.id}));
      const index='activeProfileId' in backup?backup.profiles.findIndex(p=>p.id===backup.activeProfileId):-1;
      d.activeProfileId=d.profiles[Math.max(0,index)]?.id??null;
      if('theme' in backup&&backup.theme)d.theme=backup.theme;
    }else if(mode==='合并'){
      const present=new Set(d.profiles.flatMap(p=>[p.id,p.sourceId]));
      for(const entry of backup.profiles) {
        const sourceId=entry.sourceId??entry.id;
        if(present.has(entry.id)||present.has(sourceId))continue;
        d.profiles.push({...newEntry(entry.data),sourceId});
        present.add(sourceId);
      }
      d.activeProfileId??=d.profiles[0]?.id??null;
    }else {
      const entry=newEntry(backup.profiles[0].data);
      d.profiles.push(entry);d.activeProfileId=entry.id;
    }
  },true);broadcast();
}
export async function exportRawLocalData() {
  const database=await db();
  try {
    return await new Promise<string>((resolve,reject)=>{
      const store=database.transaction('app').objectStore('app');
      const directory=store.get(directoryKey),legacy=store.get('data');
      legacy.onsuccess=()=>resolve(JSON.stringify({directory:directory.result,legacy:legacy.result}));
      directory.onerror=legacy.onerror=()=>reject(storageError());
    });
  } finally {database.close();}
}
export function downloadFile(name:string,contents:string,type='application/json') {
  const url=URL.createObjectURL(new Blob([contents],{type}));
  const link=document.createElement('a'); link.href=url; link.download=name; link.click();
  setTimeout(()=>URL.revokeObjectURL(url),2000);
}
