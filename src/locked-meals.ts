import {food,type Recipe,type Ingredient} from './catalog';
import type {Slot} from './meal-catalog';
import {purchaseFood,rawNetGrams,type PurchaseOptions} from './purchase-food';
import {purchaseCategory} from './purchase-category';

export function meaningfulIds(ingredients:Ingredient[],products?:PurchaseOptions,scale=1) {
  return [...new Set(ingredients.flatMap(item=>{
    const product=purchaseFood(item.id,products);
    if(!product.rate)return [];
    const id=product.purchaseIngredientId, basis=purchaseCategory(id);
    const minimum=basis==='主要食材'?food(id).category==='坚果种子'?4:10:basis==='新鲜调味食材'?1:.1;
    return rawNetGrams(item.grams*scale,product.rate)>=minimum?[id]:[];
  }))];
}
type Cell={day:number;meal:number;slot:Slot;recipes:Recipe[]};
type Reserved={slot:Slot;recipes:Set<string>;requires:string[]};
export function reserveLockedMeals(locked:string[],cells:Cell[],random:()=>number,products?:PurchaseOptions,must?:Recipe) {
  const needed=must?[...locked,must.id]:locked;
  if(!needed.length)return new Map<string,Reserved[]>();
  const coverage=new Map<Recipe,Set<string>>();
  const choices=cells.map(cell=>({cell,key:[cell.day,cell.meal,cell.slot].join(':'),order:random(),recipes:cell.recipes.map(r=>{
    let ids=coverage.get(r);
    if(!ids){ids=new Set(meaningfulIds(r.ingredients,products,r.min));if(r.id===must?.id)ids.add(r.id);coverage.set(r,ids);}
    return {id:r.id,ids};
  })}));
  const options=new Map(needed.map(id=>[id,choices.filter(cell=>cell.recipes.some(r=>r.ids.has(id)))]));
  const missing=locked.filter(id=>!options.get(id)?.length);
  if(missing.length)throw Error('锁定食材 '+missing.map(id=>food(id).name).join('、')+' 无可排餐位。请核对固定早餐或其他固定搭配、可用餐次、食材池及购物日。');
  if(must&&!options.get(must.id)?.length)throw Error('必选菜「'+must.name+'」和锁定要求无法安排到当前固定搭配与待执行餐位。');
  const ordered=needed.slice().sort((a,b)=>options.get(a)!.length-options.get(b)!.length);
  const occupied=new Map<string,Reserved>();
  const load=new Map<number,number>();
  let checked=0;
  function place(index:number):boolean {
    if(index===ordered.length)return true;
    if(++checked>3500)return false;
    const id=ordered[index];
    const ranked=[...options.get(id)!].sort((a,b)=>{
      const score=(row:typeof a)=>((load.get(row.cell.day)??0)*4)+(occupied.has(row.key)?-1:0)+row.order+
        (row.cell.slot==='一锅套餐'?1.3:0);
      return score(a)-score(b);
    });
    for(const entry of ranked) {
      const before=occupied.get(entry.key),{day,slot}=entry.cell;
      const fits=entry.recipes.filter(r=>r.ids.has(id)&&(!before||before.recipes.has(r.id)));
      if(!fits.length)continue;
      if(!before&&[...occupied.keys()].some(key=>key.startsWith(day+':'+entry.cell.meal+':')&&
        (slot==='一锅套餐'?['主食','蛋白质','蔬菜'].some(s=>key.endsWith(':'+s)):['主食','蛋白质','蔬菜'].includes(slot)&&key.endsWith(':一锅套餐'))))continue;
      occupied.set(entry.key,{slot,recipes:new Set(fits.map(r=>r.id)),requires:[...(before?.requires??[]),id]});
      if(!before)load.set(day,(load.get(day)??0)+1);
      if(place(index+1))return true;
      if(before)occupied.set(entry.key,before);
      else {occupied.delete(entry.key);load.set(day,(load.get(day)??1)-1);}
    }
    return false;
  }
  if(!place(0))throw Error('这些锁定食材无法同时安排到剩余餐位：'+locked.map(id=>food(id).name).join('、')+
    (must?'。同时需要保留必选菜「'+must.name+'」。':'。')+'请检查固定搭配或调整锁定。');
  const result=new Map<string,Reserved[]>();
  for(const [key,row] of occupied) {
    const place=key.split(':').slice(0,2).join(':');
    result.set(place,[...(result.get(place)??[]),row]);
  }
  return result;
}
