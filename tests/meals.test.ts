import {deepEqual,equal,ok} from 'node:assert/strict';
import {test} from 'node:test';
import {food,recipeList,recipeMap,serving} from '../src/catalog';
import {breakfastMenus,canServe,labels} from '../src/meal-catalog';
import {fruitMeal,mealNames,mealShape,mealShares} from '../src/meal-rules';
import {dayNutrition,fruitGoal,regenerate} from '../src/planner';
import {defaultMealPreference,mealPreference} from '../src/profile';
import {mealMinutes} from '../src/shopping';
import {nutritionReview} from '../src/diet-check';
import {parseBackup,fresh} from '../src/store';
import {demo} from './fixtures';

test('所有配方已分餐，早餐菜单包含实际不同的配方组合',()=>{
  ok(breakfastMenus.length>=30);
  equal(new Set(breakfastMenus.map(m=>m.recipes.join('/'))).size,breakfastMenus.length);
  for(const recipe of recipeList) ok(labels(recipe).tags.length);
  for(const menu of breakfastMenus) {
    const recipes=menu.recipes.map(id=>recipeMap.get(id)!);
    equal(labels(recipes[0]).slot,'主食');
    equal(labels(recipes[1]).slot,'蛋白质');
    ok(recipes.every(r=>canServe(r,'早餐',labels(r).slot)));
  }
  ok(!canServe(recipeMap.get('steam-pork')!,'早餐','蛋白质'));
});

test('120 个独立种子验收餐次、时间、营养、厨具和采购用量',()=>{
  for(let i=0;i<120;i++) {
    const meals=i<80?'3':'4';
    const profile={...demo,meals,people:'2',...(i%4===0?{tools:['煮锅','蒸锅','冰箱']}:{}),
      ...(i%5===0?{sex:'女',weight:'66',height:'162',target:'61'}:{})};
    const plan=regenerate(profile,[],{},[],'餐次验收-'+i);
    const names=mealNames(profile), shares=mealShares(profile), amounts=new Map<string,number>();
    equal(plan.days.length,7);
    for(const day of plan.days) {
      const daily=dayNutrition(day);
      ok(Math.abs(daily.kcal-plan.targets.kcal)<=plan.targets.kcal*.05,'热量，种子 '+i);
      ok(daily.fiber>=25 && daily.sodium!==null&&daily.sodium<=2000);
      ok(daily.calcium!==null&&daily.calcium<=2000);
      for(const [index,meal] of day.meals.entries()) {
        const name=names[index];
        ok(mealShape(profile,meal,name,fruitGoal(profile)>0&&fruitMeal(profile)===name));
        ok(mealMinutes(meal)<=+mealPreference(profile,name).minutes);
        const energy=meal.dishes.reduce((sum,s)=>sum+s.nutrients.kcal,0);
        ok(Math.abs(energy/daily.kcal-shares[index])<=(name==='加餐'?.045:.085));
        for(const s of meal.dishes) {
          ok(s.recipe.tools.every(tool=>profile.tools.includes(tool)));
          if(name==='早餐') ok(labels(s.recipe).tags.includes('早餐'));
          for(const ingredient of s.ingredients) amounts.set(ingredient.id,(amounts.get(ingredient.id)??0)+ingredient.grams*2);
        }
      }
    }
    equal(plan.purchases.length,amounts.size);
    for(const row of plan.purchases) ok(Math.abs(row.need-amounts.get(row.id)!)<.011);
  }
});
test('固定早餐搭配、禁忌、午晚餐各自用时与早餐备餐',()=>{
  const menu=breakfastMenus.find(m=>m.recipes[0]==='grain-bread'&&m.recipes[1]==='egg-ready')!;
  const profile={...demo,fixedBreakfast:menu.id,mealPreferences:{
    早餐:{...defaultMealPreference(demo,'早餐'),prep:true,minutes:'10'},
    午餐:{...defaultMealPreference(demo,'午餐'),minutes:'30',dislikes:'牛肉'},
    晚餐:{...defaultMealPreference(demo,'晚餐'),minutes:'40',dislikes:'虾'},
  }};
  const p=regenerate(profile,[],{},[],'偏好');
  for(const d of p.days) {
    deepEqual(d.meals[0].dishes.slice(0,menu.recipes.length).map(s=>s.recipe.id),menu.recipes);
    ok(mealMinutes(d.meals[1])<=30);
    ok(d.meals[1].dishes.every(s=>s.ingredients.every(k=>k.id!=='beef')));
    ok(d.meals[2].dishes.every(s=>s.ingredients.every(k=>k.id!=='shrimp')));
  }
  ok(p.prep.days.some(d=>d.task.includes('早餐')));
});
test('钙低值和缺值分别展示，周均按真实天数检查',()=>{
  const fruit=serving(recipeMap.get('fruit-apple')!);
  const known={meals:[{name:'加餐',dishes:[{...fruit,nutrients:{...fruit.nutrients,calcium:354.4}}]}]};
  const unknown={meals:[{name:'加餐',dishes:[{...fruit,nutrients:{...fruit.nutrients,calcium:null}}]}]};
  equal(nutritionReview([known])[0].status,'低于参考');
  equal(nutritionReview([known,known])[0].value,354.4);
  equal(nutritionReview([known,unknown])[0].status,'数据不全');
  equal(nutritionReview([known,unknown])[0].missing,1);
});
test('保留旧版早餐、历史快照与备份结构',()=>{
  const p=regenerate(demo,[],{},[],'历史');
  const old=structuredClone({...p,algorithmVersion:'1.0.0',catalogVersion:'2026.11-sr1'});
  old.days[0].meals[0].dishes[1]=serving(recipeMap.get('steam-pork')!);
  const previous={...fresh(),profile:demo,plan:old,history:[old],weights:[{date:'2026-11-23',kg:83}]};
  const backup=parseBackup(JSON.stringify(previous));
  equal(backup.profile?.mealPreferences,undefined);
  deepEqual(backup.history[0].days,previous.history[0].days);
  equal(food(backup.history[0].days[0].meals[0].dishes[1].ingredients[0].id).name,'猪里脊');
});

test('紧凑的 10 分钟三餐仍可生成，固定午餐可与其他餐次随机搭配',()=>{
  const quick=regenerate({...demo,minutes:'10'},[],{},[],'click');
  ok(quick.days.every(d=>d.meals.every(m=>mealMinutes(m)<=10)));
  const fixed=regenerate({...demo,mealPreferences:{午餐:{...defaultMealPreference(demo,'午餐'),fixed:true}}},[],{},[],'click');
  const lunches=fixed.days.map(d=>d.meals[1].dishes.map(s=>s.recipe.id).join());
  equal(new Set(lunches).size,1);
  ok(new Set(fixed.days.map(d=>d.meals[2].dishes.map(s=>s.recipe.id).join())).size>1);
});
