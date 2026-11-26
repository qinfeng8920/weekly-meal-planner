import {recipeMap} from './catalog';
import type {Execution} from './execution';
import type {PrepBatch,PrepJob,Use} from './logistics';
import {purchaseFood,rawNetGrams,roundGrams,type PurchaseOptions} from './purchase-food';

type Portion={job:PrepJob;raw:number;grams:number;ingredients?:PrepJob['ingredients']};
type Work={key:string;kind:'煮熟'|'称量分装';id:string;at:number;method:string;portions:Portion[];raw:number;
  cooked?:number;blend?:PrepJob['ingredients'];conversionId?:string;steps:string[]};
type Group=Pick<Work,'kind'|'id'|'conversionId'>&{portions:Portion[];blend?:true};

export function prepWork(batch:PrepBatch,products?:PurchaseOptions,readyStock:ReadonlyMap<string,number>=new Map(),execution?:Execution):Work[] {
  const groups=new Map<string,Group>();
  function add(identity:string,work:Omit<Group,'portions'>,portion:Portion) {
    const key=[identity,portion.job.at,portion.job.method].join('|');
    const group=groups.get(key)??{...work,portions:[]};
    group.portions.push(portion);
    groups.set(key,group);
  }
  for(const job of batch.jobs) {
    if(!job.key)continue;
    const recipe=job.key.split('|')[3];
    if(recipe==='grain-mix') {
      const ingredients=job.ingredients.filter(i=>i.id==='brown'||i.id==='millet');
      const raw=roundGrams(ingredients.reduce((n,i)=>n+i.grams,0));
      if(ingredients.length===2&&raw>0) {
        // 原有干料比例一致才同锅。混合米没有已验证出成率，煮后实称。
        const ratio=ingredients.map(i=>(i.grams/raw).toFixed(8)).join(':');
        add(recipe+ratio,{kind:'煮熟',id:'brown',blend:true},{job,raw,grams:raw,ingredients});
      }
    }
    for(const {id,grams} of job.ingredients) {
      const product=purchaseFood(id,products);
      if((id==='cookedbrown'||id==='cookedchicken')&&product.conversion&&product.rate&&!readyStock.get(id)) {
        add(id,{kind:'煮熟',id:product.purchaseIngredientId,conversionId:id},{job,raw:rawNetGrams(grams,product.rate),grams});
      }
      if(id==='chicken') add(id,{kind:'称量分装',id},{job,raw:grams,grams});
      if(id==='brown'&&recipe==='grain-brown') {
        const rate=purchaseFood('cookedbrown',products).rate;
        // 默认和用户出成率均沿用采购换算。同款熟食已改为即食时仍以实称为准。
        const useYield=rate&&!products?.ready?.includes('cookedbrown');
        add(recipe,{kind:'煮熟',id,...(!useYield?{blend:true}:{})},
          {job,raw:grams,grams:useYield?roundGrams(grams*rate):grams,ingredients:[{id,grams}]});
      }
    }
  }
  return [...groups].filter(([,group])=>group.portions.length>1).map(([identity,{kind,id,portions,blend,conversionId}]):Work=>{
    const key=[identity,...portions.map(p=>p.job.key).sort()].join('~');
    const first=portions[0].job;
    const active=portions.filter(({job})=>!job.key||!execution?.tasks?.[job.key]?.made&&!execution?.tasks?.[job.key]?.eaten);
    const remaining=execution?.shared?.[key]?portions:active;
    const dry=new Map<string,number>();
    if(blend)for(const portion of remaining)for(const item of portion.ingredients??[])dry.set(item.id,roundGrams((dry.get(item.id)??0)+item.grams));
    const conversion=conversionId?purchaseFood(conversionId,products).conversion:undefined;
    const steps=kind==='称量分装'?[]:conversion?[conversion.steps]:recipeMap.get(first.key!.split('|')[3])?.steps??[];
    return {key,kind,id,at:first.at,method:first.method,portions:remaining,conversionId,steps,
      raw:roundGrams(remaining.reduce((n,p)=>n+p.raw,0)),
      ...(blend?{blend:[...dry].map(([id,grams])=>({id,grams}))}:kind==='煮熟'?{cooked:roundGrams(remaining.reduce((n,p)=>n+p.grams,0))}:{})};
  }).filter(group=>group.portions.length>1);
}

export function needsPortion(use:Use) {
  return use.prepAt<use.day||use.method.includes('冷冻生料');
}

export function recipePrepSteps(job:PrepJob,work:Work[]) {
  const common=work.filter(row=>row.kind==='煮熟'&&row.portions.some(part=>part.job.key===job.key));
  let shared=false;
  const steps=job.steps.filter(step=>{
    const duplicate=common.some(row=>row.steps.some(original=>step===original||step==='库存中没有安全可用的同款熟料时，先自制。'+original));
    if(duplicate)shared=true;
    return !duplicate;
  });
  return shared?['共用原料按本批集中制作。按分装份量进行本菜其余步骤。',...steps]:steps;
}
