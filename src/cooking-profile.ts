import {mealPreference,type MainMeal,type MealName,type Profile} from './profile';
export const cookingModes=['极简','简单','家常','精致'] as const;
export type CookingMode=typeof cookingModes[number];
export type CookingSelection=CookingMode|'混合'|'不限制';
export type CookingOverride={mode?:CookingMode;total?:number;active?:number;maxDishes?:number;
  prep?:boolean;onePot?:boolean;fixedBreakfast?:boolean};
export type CookingProfile={
  mode:CookingSelection; weekday:CookingMode; weekend:CookingMode;
  meals?:Partial<Record<MainMeal,CookingOverride>>;
  days?:Record<string,Partial<Record<MainMeal,CookingOverride>>>;
};
export const cookingDefaults:CookingProfile={mode:'不限制',weekday:'简单',weekend:'家常'};
export type CookingRule={mode:CookingMode|'不限制';onePot:boolean;fixedBreakfast:boolean};

export function cookingRule(p:Profile,name:MealName,day=0,temporary?:CookingSelection):CookingRule {
  const setting=p.cooking??cookingDefaults;
  const meal=name==='早午餐'||name==='加餐'?'午餐':name;
  const preferences=mealPreference(p,name);
  const pick=temporary??setting.mode;
  const base=pick==='混合'?(day>=5?setting.weekend:setting.weekday):pick;
  const local=name==='加餐'?{}:{...setting.meals?.[meal],...setting.days?.[day]?.[meal]};
  const mode=local.mode??base;
  return {mode,onePot:local.onePot??false,fixedBreakfast:local.fixedBreakfast??preferences.fixed};
}

export function usesNamedBreakfast(p:Profile,day:number) {
  return Boolean(p.fixedBreakfast) &&
    (p.cooking?.days?.[day]?.早餐?.fixedBreakfast??p.cooking?.meals?.早餐?.fixedBreakfast)!==false;
}
