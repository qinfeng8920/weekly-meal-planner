import {deepEqual,equal,notEqual,ok,throws} from 'node:assert/strict';
import {test} from 'node:test';
import {recipeMap,serving} from '../src/catalog';
import {mealConflict,ingredientMeaning,recipeMeaning,sameFood} from '../src/food-semantics';
import {cookingDefaults,cookingRule} from '../src/cooking-profile';
import {cookingFit,mealCooking,recipeCooking} from '../src/cooking';
import {regenerate,verifyAgainst,revise,dayNutrition,type Change} from '../src/planner';
import {purchasesFromLogistics} from '../src/shopping';
import {parseBackup,fresh} from '../src/store';
import {demo} from './fixtures';

const recipes=(...ids:string[])=>ids.map(id=>recipeMap.get(id)!);
test('用语义识别酸奶、鸡蛋、生熟鸡胸和重复主食，允许复合菜和调味',()=>{
  equal(ingredientMeaning('yogurt').standardId,ingredientMeaning('greek').standardId);
  equal(ingredientMeaning('egg').standardId,ingredientMeaning('boiledegg').standardId);
  equal(ingredientMeaning('cookedchicken').standardId,ingredientMeaning('chicken').standardId);
  equal(mealConflict(recipes('breakfast-berry-yogurt','snack-greek')),'同餐重复酸奶');
  equal(mealConflict(recipes('breakfast-yogurt','breakfast-pear-yogurt')),'同餐重复酸奶');
  equal(mealConflict(recipes('egg-ready','egg-scramble')),'同餐重复鸡蛋');
  equal(mealConflict(recipes('steam-chicken','pan-chicken')),'同餐重复鸡胸肉');
  equal(mealConflict(recipes('quick-chicken-salad','quick-chicken')),'同餐重复鸡胸肉');
  equal(mealConflict(recipes('steam-chicken','pan-thigh')),'同餐重复鸡肉');
  ok(mealConflict(recipes('quick-rice','grain-bread')));
  ok(mealConflict(recipes('bowl-yogurt-oats','snack-greek')));
  for(const combination of [
    ['egg-ready','breakfast-soymilk'],['quick-milk-oats','egg-quick'],
    ['bowl-chicken-bread','snack-greek'],['steam-chicken','steam-broccoli'],['bowl-yogurt-oats'],
  ]) equal(mealConflict(recipes(...combination)),undefined);
  const [a,b]=recipes('steam-chicken','pan-chicken');
  equal(mealConflict([a,{...b,name:'换名称',id:'another-id'}]),'同餐重复鸡胸肉');
  ok(recipeMeaning(a).functions.includes('蛋白质'));
});
test('慢炖用时只用于展示，短旧限时不会触发提前制作',()=>{
  const [soup]=recipes('braised-ginger-chicken');
  const recipe=recipeCooking(soup);
  equal(recipe.active,9);equal(recipe.wait,35);equal(recipe.total,44);equal(recipe.reheat,7);
  const rule={...cookingRule(demo,'午餐'),total:1,active:1,prep:true};
  const freshStats=mealCooking([soup]);
  equal(freshStats.total,44);
  const slower={...freshStats,active:100,waiting:500,total:600};
  equal(cookingFit(slower,rule),cookingFit(freshStats,rule));
});
test('旧限时无效且固定长菜、换菜和换餐仍执行结构校验',()=>{
  const p={...demo,tools:['煮锅','蒸锅'],requiredDish:'grain-brown'};
  const tight={...p,minutes:'旧值',cooking:{...cookingDefaults,meals:{早餐:{total:-42,active:0,maxDishes:1},午餐:{total:1}}}};
  const original=regenerate(p,[],{},[],'无时限');
  const same=regenerate(tight,[],{},[],'无时限');
  deepEqual(original.days,same.days);
  ok(same.days.flatMap(d=>d.meals.flatMap(m=>m.dishes)).some(d=>d.recipe.id==='grain-brown'&&d.recipe.prep+d.recipe.cook>=40));
  const old=JSON.stringify(same);
  for(const change of [{day:1,meal:1},{day:2},{day:1,meal:1,dish:0}] satisfies Change[]) {
    try {
      const revised=regenerate(tight,[],{},[],'改过',same,[],change);
      equal(revised.start,same.start);
      verifyAgainst(revised,tight,[],{},[]);
      deepEqual(revised.purchases,purchasesFromLogistics(revised.logistics!));
    }catch(e){ok(/搜索上限|未找到|未包含/.test((e as Error).message));}
  }
  const lunch=regenerate(tight,[],{},[],'换餐验收',same,[],{day:2,meal:1});
  notEqual(lunch.days[2].meals[1].dishes.map(s=>s.recipe.id).join(),same.days[2].meals[1].dishes.map(s=>s.recipe.id).join());
  equal(JSON.stringify(same),old);
});
test('手动克数校验能够阻止快照中的语义重复，同时保留旧备份与临时模式',()=>{
  const initial=regenerate(demo,[],{},[],'迁移',undefined,[],undefined,'极简');
  equal(initial.cookingOverride,'极简');
  equal(initial.profile.cooking,undefined);
  const bad=structuredClone(initial);
  const egg=serving(recipeMap.get('egg-ready')!);
  bad.days[0].meals[0].dishes.push(egg,serving(recipeMap.get('egg-scramble')!));
  const qty=bad.days[0].meals[0].dishes[0].ingredients.map(i=>i.grams);
  throws(()=>revise(bad,demo,[],{},[],0,0,0,qty),/同餐重复/);
  const weights=[{date:'2026-11-26',kg:83}];
  const old={...fresh(),profile:demo,plan:{...initial,algorithmVersion:'1.1.0',cookingOverride:undefined},history:[initial],weights};
  const restored=parseBackup(JSON.stringify(old));
  deepEqual(restored.weights,weights);
  deepEqual(restored.history[0].days,initial.days);
  ok(dayNutrition(restored.history[0].days[0]).kcal>0);
});
