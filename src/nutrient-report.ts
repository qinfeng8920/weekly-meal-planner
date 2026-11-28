import {foodMap,foodState} from './catalog';
import {nutrientDatum,nutrientKeys,nutrientsList} from './nutrient-catalog';
import {nutrientReferences,type NutrientReference} from './nutrient-reference';
import {nutrientRetention} from './nutrient-retention';

import type {NutritionIngredient} from './nutrient-report-input';

export function ingredientNutrition(ingredients:NutritionIngredient[],days:number,...context:Parameters<typeof nutrientReferences>) {
  const portions=new Map<string,NutritionIngredient>();
  for(const {id,grams,recipeId} of ingredients){
    if(grams<=0)continue;
    const key=id+'|'+(recipeId??'');
    portions.set(key,{id,recipeId,grams:(portions.get(key)?.grams??0)+grams});
  }
  const inputs=[...portions.values()].map(({id,grams,recipeId})=>{
    const food=foodMap.get(id);
    return {id,grams,name:food?food.name+'（'+foodState[food.state]+'）':id,
      retention:food?nutrientRetention(recipeId,id,food.state):undefined};
  });
  const weight=inputs.reduce((n,portion)=>n+portion.grams,0);
  const references=nutrientReferences(...context);
  return nutrientKeys.map(key=>{
    let sum=0,knownWeight=0,bounded=0,estimates=0,retained=false;
    const missing=new Set<string>();
    for(const {id,grams,name,retention} of inputs){
      const datum=nutrientDatum(id,key),factor=retention?.[key]??1;
      if(datum?.[0]!=null){
        sum+=datum[0]*grams/100*factor;
        knownWeight+=grams;
        if(factor!==1)retained=true;
        if(['estimated','reference','label'].includes(datum[3]))estimates++;
      }else{
        missing.add(name);
        if(datum?.[3]==='trace'&&datum[4]!=null)bounded+=datum[4]*grams/100*factor;
      }
    }
    const complete=weight>0&&missing.size===0;
    const known=knownWeight&&days?sum/days:null;
    const ref=references[key];
    const status=evaluateNutrient(known,complete,ref);
    return {key,label:nutrientsList[key][0],unit:nutrientsList[key][1],known,complete,missing:[...missing],estimates,retained,
      coverage:weight?knownWeight/weight:0,bounded:days?bounded/days:0,ref,status};
  });
}

export function evaluateNutrient(value:number|null,complete:boolean,ref?:NutrientReference) {
  if(value===null)return '数据不完整 · 暂无定量数据';
  const prefix=complete?'':'已知量';
  if(ref?.ul!==undefined){
    if(value>ref.ul)return prefix+'超过上限（UL）';
    if(value>=ref.ul*.85)return prefix+'接近上限（UL）';
  }
  if(ref?.pi?.direction==='至多'&&value>ref.pi.amount)return prefix+'超过 PI-NCD 建议量';
  if(ref?.ratioLimit!==undefined&&value>ref.ratioLimit)return prefix+'高于膳食比例建议';
  if(!complete){
    if(ref?.rni!==undefined&&value>=ref.rni)return '已知量达到推荐，数据不完整';
    return '数据不完整';
  }
  if(ref?.target!==undefined)return '按方案目标对照';
  if(ref?.ear!==undefined&&value<ref.ear)return '摄入不足（低于 EAR）';
  if(ref?.rni!==undefined){
    if(value<ref.rni)return '未达推荐（RNI）';
    return value>ref.rni?'高于推荐（RNI）':'达到推荐（RNI）';
  }
  if(ref?.ai!==undefined){
    if(value<ref.ai)return '低于 AI，无法仅据此判定不足';
    return '达到适宜摄入量（AI）';
  }
  if(ref?.range){
    const [min,max]=ref.range;
    return value<min?'低于适宜范围':value>max?'高于适宜范围':'在适宜范围';
  }
  return ref?.ul!==undefined?'低于上限（UL）':'仅展示摄入量';
}

export function dailyNutritionAlerts(days:{label:string;ingredients:NutritionIngredient[]}[],...context:Parameters<typeof nutrientReferences>){
  return days.flatMap(({label,ingredients})=>{
    const issues=ingredientNutrition(ingredients,1,...context)
      .filter(row=>/超过上限|接近上限|超过 PI-NCD|低于 EAR|高于膳食比例建议/.test(row.status));
    return issues.length?[{label,issues}]:[];
  });
}
