import {foodMap,type Ingredient} from './catalog';
import {nutrientDatum,nutrientKeys,nutrientsList} from './nutrient-catalog';
import {nutrientReferences,type NutrientReference} from './nutrient-reference';

export function ingredientNutrition(ingredients:Ingredient[],days:number,...context:Parameters<typeof nutrientReferences>) {
  const portions=new Map<string,number>();
  for(const {id,grams} of ingredients)if(grams>0)portions.set(id,(portions.get(id)??0)+grams);
  const weight=[...portions.values()].reduce((a,b)=>a+b,0);
  const references=nutrientReferences(...context);
  return nutrientKeys.map(key=>{
    let sum=0,knownWeight=0,bounded=0,estimates=0;
    const missing:string[]=[];
    for(const [id,grams] of portions){
      const datum=nutrientDatum(id,key);
      if(datum?.[0]!=null){
        sum+=datum[0]*grams/100;
        knownWeight+=grams;
        if(['estimated','reference','label'].includes(datum[3]))estimates++;
      }else{
        const food=foodMap.get(id);
        missing.push(food?food.name+'（'+({raw:'生',cooked:'熟',dry:'干',ready:'成品',frozen:'冷冻'}[food.state]??food.state)+'）':id);
        if(datum?.[3]==='trace'&&datum[4]!=null)bounded+=datum[4]*grams/100;
      }
    }
    const complete=weight>0&&missing.length===0;
    const known=knownWeight&&days?sum/days:null;
    const ref=references[key];
    return {key,label:nutrientsList[key][0],unit:nutrientsList[key][1],known,complete,missing,estimates,
      coverage:weight?knownWeight/weight:0,bounded:days?bounded/days:0,ref,status:evaluateNutrient(known,complete,ref)};
  });
}

function evaluateNutrient(value:number|null,complete:boolean,ref?:NutrientReference) {
  if(value===null)return '暂无定量数据';
  if(ref?.upper!==undefined&&value>ref.upper){
    if(ref.kind==='适宜范围')return complete?'高于适宜范围':'已知量高于适宜范围';
    return complete?'高于参考限值':'已知量高于参考限值';
  }
  if(!complete)return ref?.goal!==undefined&&ref.kind!=='原方案目标'&&value>=ref.goal?'已知量达到参考，仍有缺值':'资料不全，待核对';
  if(!ref||ref.goal===undefined&&ref.lower===undefined&&ref.upper===undefined)return '仅展示摄入量';
  if(ref.lower!==undefined){
    if(value<ref.lower)return '低于适宜范围';
    return '在适宜范围';
  }
  if(ref.goal!==undefined){
    if(ref.kind==='原方案目标')return '按方案目标对照';
    if(value<ref.goal)return '低于参考值';
    return '达到参考值';
  }
  return '在参考限值内';
}
