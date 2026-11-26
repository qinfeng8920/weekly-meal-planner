import {food,type Recipe} from './catalog';
import {canServe,labels,pairingOk,type Slot} from './meal-catalog';
import {mealPreference,split,type MealName,type Profile} from './profile';
import {mealMinutes,type Meal} from './shopping';

export const mealNames=(p:Profile):MealName[]=>p.meals==='2'?['早午餐','晚餐']:p.meals==='4'?['早餐','午餐','晚餐','加餐']:['早餐','午餐','晚餐'];
export const mealShares=(p:Profile)=>p.meals==='2'?[.48,.52]:p.meals==='4'?[.25,.35,.30,.10]:[.27,.38,.35];
export function namedIngredients(r:Recipe, terms:string[]) {
  return r.ingredients.some(({id})=>{
    const f=food(id);
    return [id,f.name,...f.aliases].some(n=>terms.some(word=>n.toLowerCase().includes(word.toLowerCase())));
  });
}
export function recipeFitsMeal(r:Recipe,p:Profile,name:MealName,slot:Slot) {
  const prefs=mealPreference(p,name);
  return canServe(r,name,slot) && r.prep+r.cook<=+prefs.minutes && !namedIngredients(r,split(prefs.dislikes));
}
export const repeatIsLimited=(p:Profile,name:MealName,r:Recipe) => {
  const local=p.mealPreferences?.[name==='早午餐'?'午餐':name==='加餐'?'午餐':name];
  return !mealPreference(p,name).repeats && (Boolean(local) || !['主食','水果','加餐'].includes(r.group));
};
export function mealShape(p:Profile,meal:Meal,name:MealName,fruit:boolean) {
  if (meal.name!==name || !meal.dishes.every(s=>recipeFitsMeal(s.recipe,p,name,labels(s.recipe).slot)) ||
      mealMinutes(meal)>+mealPreference(p,name).minutes || !pairingOk(meal.dishes.map(d=>d.recipe))) return false;
  const slots=meal.dishes.map(s=>labels(s.recipe).slot).join(',');
  const tail=fruit?',水果':'';
  if (name==='早餐') return slots==='主食,蛋白质'+tail || slots==='主食,蛋白质,加餐'+tail;
  if (name==='加餐') return slots===(fruit?'水果,加餐':'加餐') || fruit && slots==='水果';
  if (name==='晚餐') return slots==='主食,蛋白质,蔬菜' || slots==='主食,蛋白质,清汤';
  return slots==='主食,蛋白质,蔬菜'+tail || slots==='主食,蛋白质,蔬菜,清汤'+tail;
}
export const fruitMeal=(p:Profile)=>p.meals==='4'?'加餐':p.meals==='2'?'早午餐':'早餐';
