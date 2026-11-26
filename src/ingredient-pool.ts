import {food,foods,type Recipe} from './catalog';
import {ingredientMeaning} from './food-semantics';
import {amountFor,edibleRate,priceFor} from './prices';
import type {SupplyState,Logistics} from './logistics';
import type {Day,Pantry} from './shopping';

export const poolModes=['极简采购','均衡采购','丰富采购','自由搭配'] as const;
export const poolMethods=['自动选择','手动指定','库存优先'] as const;
export const rotations=['保留上周','部分轮换','全部刷新'] as const;
export const poolGroups=['肉鱼虾','蔬菜','主食','水果'] as const;
export type PoolGroup=typeof poolGroups[number];
export type PoolSettings={
  mode:typeof poolModes[number];method:typeof poolMethods[number];strict:boolean;
  selected:string[];locked:string[];excluded:string[];
  caps?:Partial<Record<PoolGroup,number>>;goals?:Record<string,number>;rotation:typeof rotations[number];
};
export type WeeklyIngredientPool={
  version:1;week:string;settings:PoolSettings;selected:string[];
  used:{id:string;grams:number;uses:number}[];supplements:{id:string;grams:number;reason:string;cost:number|null}[];
};
export type PoolTemplate={id:string;name:string;settings:PoolSettings};
export const defaultPool:PoolSettings={mode:'均衡采购',method:'自动选择',strict:false,selected:[],locked:[],excluded:[],rotation:'部分轮换'};
export const capsFor:Record<typeof poolModes[number],Record<PoolGroup,number>>={
  极简采购:{肉鱼虾:3,蔬菜:4,主食:2,水果:2},
  均衡采购:{肉鱼虾:4,蔬菜:6,主食:3,水果:3},
  丰富采购:{肉鱼虾:7,蔬菜:10,主食:5,水果:4},
  自由搭配:{肉鱼虾:128,蔬菜:128,主食:128,水果:128},
};
export const standardId=(id:string)=>ingredientMeaning(id).standardId;
export const standardFoods=foods.filter(f=>standardId(f.id)===f.id);
export const poolGroup=(id:string):PoolGroup|'基础食材'=>{
  const category=food(id).category;
  return ['肉类','鱼虾'].includes(category)?'肉鱼虾':category==='蔬菜'||category==='主食'||category==='水果'?category:'基础食材';
};
export const normalizeIds=(ids:string[])=>[...new Set(ids.map(standardId))];
export const capOf=(setting:PoolSettings,group:PoolGroup)=>setting.caps?.[group]??capsFor[setting.mode][group];
export function counts(ids:Iterable<string>) {
  const out={肉鱼虾:0,蔬菜:0,主食:0,水果:0,基础食材:0};
  for(const id of new Set(ids))out[poolGroup(id)]++;
  return out;
}

export function weekUsage(days:Day[]) {
  const byId=new Map<string,{id:string;grams:number;uses:number}>();
  for(const d of days) for(const m of d.meals) for(const s of m.dishes) {
    const seen=new Set<string>();
    for(const i of s.ingredients) {
      const id=standardId(i.id), row=byId.get(id)??{id,grams:0,uses:0};
      row.grams+=i.grams;
      if(!seen.has(id))row.uses++;
      seen.add(id);byId.set(id,row);
    }
  }
  return [...byId.values()].sort((a,b)=>b.uses-a.uses||a.id.localeCompare(b.id)).map(i=>({...i,grams:Math.round(i.grams*100)/100}));
}
const recipeFoodCache=new WeakMap<Recipe,string[]>();
export function recipeFoodIds(recipe:Recipe) {
  const cached=recipeFoodCache.get(recipe);
  if(cached)return cached;
  const ids=normalizeIds(recipe.ingredients.map(i=>i.id));
  recipeFoodCache.set(recipe,ids);return ids;
}
export function fitsPool(ids:string[],selected:Set<string>) {
  return ids.every(id=>selected.has(id));
}

const palettes:Record<PoolGroup,string[][]>={
  肉鱼虾:[
    ['chicken','beef','shrimp','salmon','thigh','pork','bass'],
    ['chicken','salmon','pork','beef','tilapia','cod','shrimp'],
    ['chicken','bass','shrimp','beef','thigh','pork','salmon'],
  ],
  蔬菜:[
    ['broccoli','bok','tomato','carrot','cucumber','spinach','cauliflower','redpepper','whitefungi','zucchini'],
    ['broccoli','bok','carrot','tomato','romaine','pumpkin','redcabbage','whitefungi','okra','daikon'],
    ['broccoli','bok','tomato','redpepper','carrot','cucumber','spinach','whitefungi','pumpkin','zucchini'],
  ],
  主食:[['oats','brown','corn','bread','sweet'],['oats','corn','brown','rice','bread'],['oats','brown','bread','corn','quinoa']],
  水果:[['orange','apple','pear','blueberry'],['orange','pear','strawberry','banana'],['apple','kiwi','orange','peach']],
};

export type PoolCandidate={selected:Set<string>;chosen:string[]};
export function ingredientPools(settings:PoolSettings,recipes:Recipe[],pantry:Pantry,supply:SupplyState|undefined,random:()=>number,previous?:WeeklyIngredientPool,required:string[]=[]):PoolCandidate[] {
  const excluded=new Set(normalizeIds(settings.excluded));
  const available=new Set(recipes.flatMap(recipeFoodIds));
  const picked=normalizeIds([...settings.locked,...(settings.method==='手动指定'?settings.selected:[])]);
  const locked=normalizeIds(settings.locked);
  if(picked.some(id=>excluded.has(id)))throw Error('同一食材既选中又排除，请修改本周食材。');
  for(const id of locked) if(!available.has(id))throw Error(food(id).name+'与忌口、厨具或菜谱限制冲突，无法锁定。');
  if(required.some(id=>excluded.has(id)))throw Error('固定早餐或必选菜使用已排除食材，请修改食材或固定设置。');
  if(settings.strict&&required.some(id=>!picked.includes(id)))throw Error('固定早餐或必选菜使用严格食材池外的食材，请检查指定食材。');
  const base=normalizeIds([...picked,...required]).filter(id=>available.has(id));
  const manual=picked.filter(id=>available.has(id));
  const count=counts(base);
  for(const group of poolGroups) if(count[group]>capOf(settings,group))throw Error(group+'已选 '+count[group]+' 种，超过上限 '+capOf(settings,group)+' 种。');
  if(settings.method==='手动指定'&&settings.strict) {
    if(!base.length)throw Error('严格模式需要先指定可用食材，包括配方所需调味料。');
    return [{selected:new Set(base),chosen:manual}];
  }
  const old=new Set(previous?.used.map(i=>i.id));
  const all=[...available].filter(id=>!excluded.has(id)).sort();
  const coverage=new Map<string,number>();
  for(const r of recipes)for(const id of recipeFoodIds(r))coverage.set(id,(coverage.get(id)??0)+1);
  const stock=new Map<string,number>();
  for(const [id,value] of Object.entries(pantry)) if(value.stock) {
    const key=standardId(id);stock.set(key,(stock.get(key)??0)+value.stock);
  }
  const score=(id:string,list:string[],variant:number)=>{
    const preferred=list.indexOf(id);
    const price=priceFor(id,supply?.prices??{},pantry[id]);
    const rate=edibleRate(price);
    const per100=rate?amountFor(100/rate,price):null;
    const previous=old.has(id)?(settings.rotation==='保留上周'?24:settings.rotation==='部分轮换'?2:-4):0;
    const have=settings.method==='库存优先'?Math.min(14,(stock.get(id)??0)/55):Math.min(2,(stock.get(id)??0)/250);
    return (preferred<0?0:(list.length-preferred)*1.4) + Math.min(4,(coverage.get(id)??0)*.16)+have+
      Math.min(3,(settings.goals?.[id]??0)/150)+previous-(per100??8)*.15+random()*(variant===0?.35:3.8);
  };
  const result:PoolCandidate[]=[];
  // 先选食材，再搜索食谱。多个小型组合用于处理设备或供给差异。
  if(settings.method==='手动指定')result.push({selected:new Set(base),chosen:manual});
  if(settings.rotation==='保留上周'&&previous) {
    const keep=normalizeIds([...base,...previous.selected]).filter(id=>available.has(id)&&!excluded.has(id));
    if(poolGroups.every(group=>counts(keep)[group]<=capOf(settings,group)))result.push({selected:new Set(keep),chosen:settings.method==='手动指定'?manual:keep});
  }
  for(let i=0;i<6;i++) {
    const selected=new Set([...base,...all.filter(id=>poolGroup(id)==='基础食材')]);
    for(const group of poolGroups) {
      const ranked=all.filter(id=>poolGroup(id)===group&& !selected.has(id)).map(id=>({id,rank:score(id,palettes[group][i%3],i)}))
        .sort((a,b)=>b.rank-a.rank);
      if(settings.rotation==='部分轮换'&&old.size&&i%2===0&&capOf(settings,group)>1&&ranked.some(v=>!old.has(v.id))) {
        const next=ranked.findIndex(v=>!old.has(v.id));
        if(next>=0&&ranked.length>capOf(settings,group)) {
          const [choice]=ranked.splice(next,1);ranked.splice(capOf(settings,group)-1,0,choice);
        }
      }
      for(const r of ranked.slice(0,Math.max(0,capOf(settings,group)-count[group])))selected.add(r.id);
    }
    if(!result.some(v=>v.selected.size===selected.size&&[...selected].every(id=>v.selected.has(id)))) {
      result.push({selected,chosen:settings.method==='手动指定'?manual:[...selected]});
    }
  }
  return result;
}

export function buildWeeklyPool(week:string,settings:PoolSettings,chosen:string[],selected:Iterable<string>,days:Day[],quote:Logistics):WeeklyIngredientPool {
  const used=weekUsage(days), chosenSet=new Set(chosen);
  const supplements=used.filter(i=>!chosenSet.has(i.id)).map(i=>{
    const purchase=quote.lines.filter(r=>standardId(r.id)===i.id);
    const cost=purchase.some(r=>r.cost.missing)?null:purchase.reduce((n,r)=>n+r.cost.known,0);
    return {id:i.id,grams:Math.round(i.grams*quote.people*100)/100,reason:'用于补足餐次搭配和营养约束',
      cost:cost===null?null:Math.round(cost*100)/100};
  });
  return {version:1,week,settings,selected:[...selected].sort(),used,supplements};
}
