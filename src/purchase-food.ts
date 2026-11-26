import {food,foodState,type Recipe} from './catalog';

export type PurchaseOptions={ready?:string[];yields?:Record<string,number|null>};
const usdaMeat='https://www.ars.usda.gov/ARSUserFiles/80400525/Data/retn/USDA_CookingYields_MeatPoultry.pdf';
const usdaGuide='https://foodbuyingguide.fns.usda.gov/';
export const conversionVersion='2026-11-v1';
const rules:Record<string,{purchaseIngredientId:string;rate:number;method:string;source:string;tools:string[];minutes:number;steps:string}>={
  cookedchicken:{purchaseIngredientId:'chicken',rate:.75,method:'水煮或蒸',source:usdaMeat,tools:['煮锅','蒸锅'],minutes:25,
    steps:'生鸡胸肉单独切分，不冲洗。用煮锅或蒸锅加热至中心 74°C，再按菜谱称取熟肉。'},
  cookedbrown:{purchaseIngredientId:'brown',rate:2.8,method:'加水煮熟',source:usdaGuide,tools:['煮锅','电饭煲'],minutes:45,
    steps:'糙米淘洗后用带盖煮锅或电饭煲按说明煮透，按菜谱称熟饭。当天使用，熟饭尽量在 1 小时内冷却，冷藏 24 小时内食用。'},
  cookedsweet:{purchaseIngredientId:'sweet',rate:.9,method:'去皮清煮或蒸',source:usdaGuide,tools:['煮锅','蒸锅'],minutes:25,
    steps:'红薯清洗去皮，按生的可食部称重，切块煮熟或蒸透，再称取菜谱所需熟重。'},
  cookedcorn:{purchaseIngredientId:'corn',rate:.95,method:'玉米粒水煮或蒸',source:usdaGuide,tools:['煮锅','蒸锅'],minutes:12,
    steps:'鲜玉米取粒，煮熟或蒸熟，沥水后按菜谱称取熟玉米粒。'},
  boiledegg:{purchaseIngredientId:'egg',rate:.98,method:'带壳水煮或蒸',source:usdaGuide,tools:['煮锅','蒸锅'],minutes:13,
    steps:'整颗鸡蛋水煮或蒸至蛋白和蛋黄均凝固，剥壳后按菜谱称重。'},
};
export const convertibleFoods=Object.keys(rules);
export const hasConversion=(id:string)=>Object.hasOwn(rules,id);
export function purchaseFood(id:string,options?:PurchaseOptions) {
  const rule=rules[id];
  if(!rule||options?.ready?.includes(id))return {purchaseIngredientId:id,rate:1,conversion:undefined};
  const rate=options?.yields&&Object.hasOwn(options.yields,id)?options.yields[id]:rule.rate;
  return {purchaseIngredientId:rule.purchaseIngredientId,rate,conversion:{...rule,version:conversionVersion,kind:'估算' as const}};
}
export const purchaseIngredientId=(id:string,options?:PurchaseOptions)=>purchaseFood(id,options).purchaseIngredientId;
export const weightState=(id:string)=>foodState[food(id).state];
export const recipeMakesIngredients=(recipe:Recipe,tools:string[],options?:PurchaseOptions)=>recipe.ingredients.every(i=>{
  const rule=purchaseFood(i.id,options).conversion;
  return !rule||rule.tools.some(t=>tools.includes(t));
});
export const roundGrams=(grams:number)=>Math.round(grams*100+1e-8)/100;
export const rawNetGrams=(grams:number,rate:number)=>Math.ceil(grams/rate*100-1e-8)/100;
