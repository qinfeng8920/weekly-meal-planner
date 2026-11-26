import {mealPreference,type MainMeal,type MealName,type Profile} from './profile';
export const cookingModes=['极简','简单','家常','精致'] as const;
export type CookingMode=typeof cookingModes[number];
export type CookingSelection=CookingMode|'混合';
export type CookingOverride={mode?:CookingMode;total?:number;active?:number;maxDishes?:number;
  prep?:boolean;onePot?:boolean;fixedBreakfast?:boolean};
export type CookingProfile={
  mode:CookingSelection; weekday:CookingMode; weekend:CookingMode;
  meals?:Partial<Record<MainMeal,CookingOverride>>;
  days?:Record<string,Partial<Record<MainMeal,CookingOverride>>>;
};
export const cookingDefaults:CookingProfile={mode:'简单',weekday:'简单',weekend:'家常'};
export const cookingDuration:Record<CookingMode,[number,number]>={极简:[5,10],简单:[10,20],家常:[20,40],精致:[40,60]};
export const cookingNames=['周一','周二','周三','周四','周五','周六','周日'];
export type CookingRule=Required<CookingOverride>;

export function cookingRule(p:Profile,name:MealName,day=0,temporary?:CookingSelection):CookingRule {
  const setting=p.cooking??cookingDefaults;
  const meal=name==='早午餐'||name==='加餐'?'午餐':name;
  const preferences=mealPreference(p,name);
  const pick=temporary??setting.mode;
  const base=pick==='混合'?(day>=5?setting.weekend:setting.weekday):pick;
  const local=name==='加餐'?{}:{...setting.meals?.[meal],...setting.days?.[day]?.[meal]};
  const mode=local.mode??base;
  const breakfast=name==='早餐';
  const implicitTotal=breakfast||name==='加餐'?+preferences.minutes:
    p.mealPreferences?.[meal]?.minutes?+preferences.minutes:
    Math.min(+preferences.minutes,mode==='极简'?10:120);
  const total=local.total??implicitTotal;
  return {mode,total,active:local.active??Math.min(total,mode==='极简'?8:mode==='简单'?20:mode==='家常'?35:60),
    maxDishes:local.maxDishes??(mode==='极简'?3:mode==='精致'?5:4),prep:local.prep??preferences.prep,
    onePot:local.onePot??mode==='极简',fixedBreakfast:local.fixedBreakfast??preferences.fixed};
}

export function usesNamedBreakfast(p:Profile,day:number) {
  return Boolean(p.fixedBreakfast) &&
    (p.cooking?.days?.[day]?.早餐?.fixedBreakfast??p.cooking?.meals?.早餐?.fixedBreakfast)!==false;
}
