import {deepEqual,equal,notEqual,ok,throws} from 'node:assert/strict';
import {test} from 'node:test';
import {recipeMap,serving} from '../src/catalog';
import {mealConflict,ingredientMeaning,recipeMeaning,sameFood} from '../src/food-semantics';
import {cookingDefaults,cookingRule,type CookingProfile} from '../src/cooking-profile';
import {cookingConflict,mealCooking,recipeCooking} from '../src/cooking';
import {regenerate,verifyAgainst,revise,dayNutrition,type Change} from '../src/planner';
import {shopping,prepPlan} from '../src/shopping';
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
test('慢炖主要是等待，允许备餐时计入提前制作和复热时间',()=>{
  const [soup]=recipes('braised-ginger-chicken');
  const recipe=recipeCooking(soup);
  equal(recipe.active,9);
  equal(recipe.wait,35);
  equal(recipe.total,44);
  equal(recipe.prepAhead,44);
  equal(recipe.reheat,7);
  ok(recipe.level<=2);
  const rule={...cookingRule(demo,'午餐'),total:10,active:5,prep:true};
  const freshStats=mealCooking([soup],{...rule,prep:false},true);
  equal(freshStats.total,44);
  ok(cookingConflict(freshStats,rule));
  const prepared=mealCooking([soup],rule,true);
  equal(prepared.total,8);
  equal(prepared.active,2);
  equal(prepared.waiting,6);
  deepEqual(prepared.ahead,[{name:soup.name,minutes:44,reheat:7}]);
  equal(cookingConflict(prepared,rule),undefined);
  equal(mealCooking([soup],rule,false).total,44);
  const assumed={...demo,cooking:{...cookingDefaults,meals:{午餐:{total:10,active:5,prep:true}}}};
  const prep=prepPlan([{meals:[{name:'午餐',dishes:[serving(soup)]}]}],assumed,'2026-11-23');
  ok(prep.days[0].meals.some(text=>text.includes('复热 7 分钟')));
});
test('极简、精致和分日分餐规则约束实际菜品',()=>{
  const minimal={...demo,cooking:{...cookingDefaults,mode:'极简' as const}};
  const quick=regenerate(minimal,[],{},[],'各模式');
  for(const [d,day] of quick.days.entries()) for(const meal of day.meals) {
    const stats=mealCooking(meal.dishes.map(s=>s.recipe),cookingRule(minimal,meal.name as '午餐',d),true);
    ok(stats.level<=2&&stats.total<=10&&stats.active<=8);
  }
  const refined={...demo,minutes:'120',cooking:{...cookingDefaults,mode:'精致' as const,meals:{午餐:{total:70},晚餐:{total:70}}}};
  const long=regenerate(refined,[],{},[],'精致');
  const stats=long.days.flatMap((day,d)=>day.meals.slice(1).map(m=>mealCooking(m.dishes.map(s=>s.recipe),cookingRule(refined,m.name as '午餐',d),true)));
  ok(stats.some(s=>s.level===4)&&stats.some(s=>s.count>=4)&&stats.some(s=>s.total>=40));
  const mixed:CookingProfile={mode:'混合',weekday:'简单',weekend:'精致',meals:{早餐:{mode:'极简'}},
    days:{'5':{午餐:{mode:'家常',total:25,active:15,maxDishes:3}},'6':{晚餐:{onePot:true}}}};
  const profile={...demo,cooking:mixed};
  equal(cookingRule(profile,'午餐',4).mode,'简单');
  equal(cookingRule(profile,'晚餐',5).mode,'精致');
  equal(cookingRule(profile,'早餐',6).mode,'极简');
  equal(cookingRule(profile,'午餐',5).mode,'家常');
  const week=regenerate(profile,[],{},[],'分日');
  const saturday=week.days[5].meals[1];
  const saturdayRule=cookingRule(profile,'午餐',5);
  equal(cookingConflict(mealCooking(saturday.dishes.map(s=>s.recipe),saturdayRule,true),saturdayRule),undefined);
});
test('五种快捷调整重验搭配、采购与分餐结构，失败保留原数据',()=>{
  const initial=regenerate(demo,[],{},[],'快捷验收');
  const before=JSON.stringify(initial);
  const changes:Change[]=[
    {day:0,meal:0,intent:'简单一点'},{day:0,meal:0,intent:'丰富一点'},
    {day:0,meal:1,intent:'减少一道菜'},{day:0,meal:1,dish:1,intent:'更换同类食材'},
    {day:0,meal:0,intent:'改成一锅料理'},
  ];
  for(const change of changes) {
    const next=regenerate(demo,[],{},[],'改过',initial,[],change);
    const current=next.days[0].meals[change.meal!], former=initial.days[0].meals[change.meal!];
    const selected=current.dishes.map(s=>s.recipe);
    equal(mealConflict(selected),undefined);
    deepEqual(next.days.slice(1),initial.days.slice(1));
    deepEqual(next.purchases,shopping(next.days,demo,{}));
    verifyAgainst(next,demo,[],{},[]);
    const rule=cookingRule(demo,current.name as '午餐');
    const stat=mealCooking(selected,rule,true), base=mealCooking(former.dishes.map(s=>s.recipe),rule,true);
    if(change.intent==='简单一点') ok(stat.active<=base.active&&stat.level<=base.level);
    if(change.intent==='丰富一点') ok(stat.count>base.count||stat.level>base.level);
    if(change.intent==='减少一道菜') equal(stat.count,base.count-1);
    if(change.intent==='改成一锅料理') ok(stat.onePot);
    if(change.intent==='更换同类食材') {
      notEqual(selected[1].id,former.dishes[1].recipe.id);
      ok(sameFood(selected[1],former.dishes[1].recipe));
      deepEqual(current.dishes[0],former.dishes[0]);
    }
  }
  throws(()=>regenerate(demo,[],{},[],'失败',initial,[],{day:0,meal:0,intent:'减少一道菜',dish:0}));
  equal(JSON.stringify(initial),before);
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
