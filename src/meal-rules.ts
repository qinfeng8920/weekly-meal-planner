import {food,type Recipe} from './catalog';
import {canServe,labels,pairingOk,type Slot} from './meal-catalog';
import {mealConflict} from './food-semantics';
import {mealPreference,split,type MealName,type Profile} from './profile';
import {cookingRule,type CookingRule} from './cooking-profile';
import {cookingConflict,mealCooking,recipeCooking} from './cooking';
import type {Meal} from './shopping';

export const mealNames=(p:Profile):MealName[]=>p.meals==='2'?['早午餐','晚餐']:p.meals==='4'?['早餐','午餐','晚餐','加餐']:['早餐','午餐','晚餐'];
export const mealShares=(p:Profile)=>p.meals==='2'?[.48,.52]:p.meals==='4'?[.25,.35,.30,.10]:[.27,.38,.35];
export function namedIngredients(r:Recipe, terms:string[]) {
  return r.ingredients.some(({id})=>{
    const f=food(id);
    return [id,f.name,...f.aliases].some(n=>terms.some(word=>n.toLowerCase().includes(word.toLowerCase())));
  });
}
export function recipeFitsMeal(r:Recipe,p:Profile,name:MealName,slot:Slot,rule=cookingRule(p,name)) {
  const prefs=mealPreference(p,name), stats=recipeCooking(r);
  const canReheat=rule.prep&&p.tools.includes('冰箱')&&stats.reheat!==undefined;
  return canServe(r,name,slot) && (stats.total<=rule.total || canReheat&&stats.reheat!+1<=rule.total) &&
    (rule.mode!=='极简'||stats.level<=2) && !namedIngredients(r,split(prefs.dislikes));
}
export const repeatIsLimited=(p:Profile,name:MealName,r:Recipe) => {
  const local=p.mealPreferences?.[name==='早午餐'?'午餐':name==='加餐'?'午餐':name];
  return !mealPreference(p,name).repeats && (Boolean(local) || !['主食','水果','加餐'].includes(r.group));
};

export function mealTemplates(name:MealName,fruit:boolean):Slot[][] {
  const tail:Slot[]=fruit?['水果']:[];
  if(name==='早餐') return [['主食','蛋白质',...tail],['主食','蛋白质','加餐',...tail],['一锅套餐',...tail]];
  if(name==='加餐') return fruit?[['水果','加餐'],['水果']]:[['加餐']];
  const base:Slot[]=['主食','蛋白质','蔬菜'];
  if(name==='晚餐') return [base,['主食','蛋白质','清汤'],[...base,'清汤'],['一锅套餐'],['一锅套餐','清汤']];
  return [[...base,...tail],[...base,'清汤',...tail],['一锅套餐',...tail],['一锅套餐','清汤',...tail]];
}

export function mealShapeError(p:Profile,meal:Meal,name:MealName,fruit:boolean,rule:CookingRule) {
  const recipes=meal.dishes.map(s=>s.recipe);
  if (meal.name!==name || !recipes.every(r=>recipeFitsMeal(r,p,name,labels(r).slot,rule))) return '餐次或偏好';
  const conflict=mealConflict(recipes);
  if(conflict)return conflict;
  if(!pairingOk(recipes))return '搭配不适合';
  const slots=recipes.map(r=>labels(r).slot).join(',');
  if (!mealTemplates(name,fruit).some(shape=>shape.join(',')===slots)) return '搭配结构';
  return cookingConflict(mealCooking(recipes,rule,p.tools.includes('冰箱')),rule);
}
export function mealShape(p:Profile,meal:Meal,name:MealName,fruit:boolean,rule=cookingRule(p,name)) {
  return !mealShapeError(p,meal,name,fruit,rule);
}
export const fruitMeal=(p:Profile)=>p.meals==='4'?'加餐':p.meals==='2'?'早午餐':'早餐';
