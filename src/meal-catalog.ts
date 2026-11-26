import {cookingPlacements} from './cooking-recipes';
import {recipeList,recipeMap,type Recipe} from './catalog';
import type {MealName} from './profile';

export type MealTag = '早餐'|'午餐'|'晚餐'|'加餐'|'通用主食'|'通用配菜';
export type Slot = '主食'|'蛋白质'|'蔬菜'|'清汤'|'加餐'|'水果'|'一锅套餐';
type BreakfastSet = {id:string;style:string;recipes:string[]};
const menus:Record<string, [string,string,string?][]> = {
  中式: [
    ['quick-soy-oats','egg-ready'],['quick-oats','breakfast-tofu','breakfast-soymilk'],
    ['quick-corn','egg-ready','breakfast-soymilk'],['quick-sweet','egg-ready','breakfast-soymilk'],
    ['quick-oat-millet','egg-ready'],['quick-oat-millet','breakfast-lemon-chickpea'],
    ['oat-pumpkin-quick','egg-ready','breakfast-soymilk'],['quick-corn','breakfast-tofu'],
  ],
  西式: [
    ['grain-bread','breakfast-chicken-toast'],['grain-bread','breakfast-chickpea'],
    ['grain-bread','breakfast-tofu-toast'],['grain-bread','breakfast-berry-yogurt'],
    ['grain-bread','breakfast-pear-yogurt'],['quick-cinnamon-bread','breakfast-yogurt'],
    ['quick-milk-oats','breakfast-berry-yogurt'],['oat-apple-quick','breakfast-yogurt'],
  ],
  快捷: [
    ['grain-bread','egg-ready','snack-milk'],['grain-bread','egg-quick','breakfast-soymilk'],
    ['grain-bread','egg-scramble','snack-milk'],['quick-cinnamon-bread','egg-ready'],
    ['quick-corn','breakfast-chicken-corn'],['quick-sweet','breakfast-lemon-chickpea'],
    ['quick-milk-oats','egg-ready'],['quick-oats','breakfast-lemon-chickpea'],
  ],
  粗粮: [
    ['quick-oats','egg-ready','snack-milk'],['quick-corn','breakfast-lemon-chickpea'],
    ['quick-oat-millet','breakfast-yogurt'],['quick-sweet','breakfast-yogurt'],
    ['oat-pumpkin-quick','breakfast-lemon-chickpea'],['oat-apple-quick','breakfast-lemon-chickpea'],
    ['quick-soy-oats','breakfast-lemon-chickpea'],['quick-corn','breakfast-berry-yogurt'],
    ['quick-sweet','egg-quick','breakfast-soymilk'],['quick-sweet','breakfast-carrot-chickpea'],
    ['quick-corn','breakfast-herb-chickpea'],
  ],
  高蛋白: [
    ['quick-oats','breakfast-chicken-oats'],['quick-oats','egg-scramble','breakfast-soymilk'],
    ['quick-soy-oats','egg-scramble'],['quick-corn','egg-scramble','breakfast-soymilk'],
    ['quick-milk-oats','egg-scramble'],['quick-oats','breakfast-yogurt','snack-walnut'],
    ['grain-bread','breakfast-tofu','breakfast-soymilk'],['quick-corn','breakfast-yogurt','snack-pumpkinseed'],
  ],
};
export const breakfastMenus:BreakfastSet[]=Object.entries(menus).flatMap(([style,entries],index)=>
  entries.map((recipes,i)=>({id:'breakfast-set-'+index+'-'+i,style,recipes:recipes.filter((id):id is string=>Boolean(id))})));
const breakfastStarch = new Set(breakfastMenus.map(m=>m.recipes[0]));
const breakfastProtein = new Set(breakfastMenus.map(m=>m.recipes[1]));
const lightSoups = new Set(['soup-bok-mushroom','soup-tomato-bok']);
const lunchOnly = new Set(['lentil-soup','soy-chicken']);
export function labels(recipe:Recipe):{tags:MealTag[];slot:Slot} {
  const placement=cookingPlacements.get(recipe.id);
  if(placement==='早餐套餐') return {tags:['早餐'],slot:'一锅套餐'};
  if(placement==='正餐套餐') return {tags:['午餐','晚餐'],slot:'一锅套餐'};
  if (breakfastProtein.has(recipe.id) || recipe.id==='boiled-egg') return {tags:['早餐'],slot:'蛋白质'};
  if (lightSoups.has(recipe.id)) return {tags:['午餐','晚餐','通用配菜'],slot:'清汤'};
  switch(recipe.group) {
    case '主食': return {tags:breakfastStarch.has(recipe.id)?['早餐','通用主食']:['通用主食'],slot:'主食'};
    case '早餐': return {tags:['早餐'],slot:'主食'};
    case '蔬菜': return {tags:['通用配菜'],slot:'蔬菜'};
    case '水果': return {tags:['早餐','加餐'],slot:'水果'};
    case '加餐': return {tags:['早餐','加餐'],slot:'加餐'};
    default:return {tags:lunchOnly.has(recipe.id)?['午餐']:['午餐','晚餐'],slot:'蛋白质'};
  }
}
export function canServe(recipe:Recipe,meal:MealName,slot:Slot) {
  const {tags,slot:role}=labels(recipe);
  if(slot!==role) return false;
  if(meal==='早午餐' && slot==='水果') return tags.includes('加餐');
  const primary=meal==='早午餐'?'午餐':meal;
  return tags.includes(primary) || (primary==='午餐'||primary==='晚餐') &&
    (tags.includes('通用主食')||tags.includes('通用配菜'));
}
export function pairingOk(recipes:Recipe[]) {
  const ids=new Set(recipes.map(r=>r.id));
  if (['breakfast-chicken-toast','breakfast-tofu-toast','breakfast-chickpea'].some(id=>ids.has(id)) && !ids.has('grain-bread')) return false;
  if(ids.has('breakfast-chicken-oats')&&!ids.has('quick-oats')) return false;
  return recipes.filter(r=>r.group==='汤类').length<=1;
}
export const menuName=(recipes:string[])=>recipes.map(id=>recipeMap.get(id)?.name??id).join('＋');
export const fixedBreakfasts=recipeList.filter(r=>canServe(r,'早餐','主食'));
