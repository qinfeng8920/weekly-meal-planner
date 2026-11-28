import assert from 'node:assert/strict';
import {test} from 'node:test';
import {food,foods,hasPlanningNutrition,recipeMap} from '../src/catalog';
import {nutrientDatum,nutrientKeys,nutrientSource} from '../src/nutrient-catalog';
import {ingredientNutrition} from '../src/nutrient-report';
import {nutrientReferences} from '../src/nutrient-reference';
import {allowed,regenerate,verifyAgainst} from '../src/planner';
import {validateNutrientCatalog} from '../scripts/nutrition-audit';
import {demo} from './fixtures';

test('全库38项营养的来源、单位、状态、可接受值与配餐准入',()=>{
  validateNutrientCatalog();
  assert.equal(nutrientKeys.length,38);
  assert.ok(foods.length>=225);
  assert.equal(nutrientDatum('ricevinegar','zinc')?.[0],.2);
  assert.equal(nutrientDatum('ricevinegar','vitaminB12')?.[0],.1);
  assert.equal(nutrientDatum('egg','iodine')?.[0],49.2);
  assert.equal(nutrientDatum('oats','vitaminB7')?.[0],22);
  assert.equal(nutrientDatum('pitaya','sodium')?.[4],.5);
  assert.ok(nutrientSource(nutrientDatum('oats','vitaminB7')![1]).link.startsWith('https://www.mext.go.jp/'));
  assert.notEqual(nutrientDatum('rice','folateDfe')?.[0],undefined);
  assert.notEqual(nutrientDatum('rice','folateDfe')?.[1],nutrientDatum('cookedsweet','folateDfe')?.[1]);
  assert.equal(nutrientDatum('soymilk','zinc')?.[0],.3118);
  assert.equal(nutrientDatum('soymilk','folate')?.[0],19.69);
  assert.equal(nutrientDatum('canola','sodium')?.[0],null);
  assert.match(nutrientDatum('canola','sodium')?.[3]??'',/trace/);
  assert.equal(hasPlanningNutrition(food('canola')),true);
  assert.equal(hasPlanningNutrition(food('balsamic')),false);
  assert.equal(hasPlanningNutrition(food('amaranthleaf')),true);
  assert.equal(hasPlanningNutrition({...food('apple'),id:'未审核的自定义食材'}),false);
  assert.equal(allowed(recipeMap.get('fruit-longan')!,demo,[]),true);
});

test('报告保留缺项下的已知合计、重量覆盖、阈值和称量状态',()=>{
  const a=ingredientNutrition([{id:'ricevinegar',grams:50},{id:'canola',grams:150},{id:'ricevinegar',grams:50}],2,demo);
  const zinc=a.find(row=>row.key==='zinc')!;
  assert.equal(zinc.known,.1);
  assert.equal(zinc.coverage,.4);
  assert.deepEqual(zinc.missing,['菜籽油（成品净重）']);
  assert.equal(zinc.complete,false);
  const trace=ingredientNutrition([{id:'pitaya',grams:200}],1).find(row=>row.key==='sodium')!;
  assert.equal(trace.known,null);
  assert.equal(trace.bounded,1);
  assert.equal(trace.coverage,0);
  const complete=ingredientNutrition([{id:'ricevinegar',grams:100}],1,demo).find(row=>row.key==='zinc')!;
  assert.equal(complete.status,'摄入不足（低于 EAR）');
  assert.equal(complete.coverage,1);
});

test('中国成人 DRI 根据年龄及性别，未知合成量时不做总叶酸上限比较',()=>{
  const male=nutrientReferences({...demo,age:'25'});
  const female=nutrientReferences({...demo,age:'25',sex:'女'});
  const older=nutrientReferences({...demo,age:'76',sex:'女'});
  assert.equal(male.zinc?.rni,12.5);
  assert.equal(female.zinc?.rni,8.5);
  assert.equal(female.iron?.rni,18);
  assert.equal(older.sodium?.pi?.amount,1800);
  assert.equal(older.vitaminD?.rni,15);
  assert.equal(nutrientReferences({...demo,age:'56',sex:'女'}).iron?.rni,undefined);
  assert.equal(male.folateDfe?.ul,undefined);
  assert.equal(male.sugar?.ul,undefined);
  assert.deepEqual(nutrientReferences({...demo,risks:['怀孕或哺乳期']}),{});
});

test('更新营养资料库后旧菜谱记录仍可验证，不改已执行用料和价格库存关联',()=>{
  const plan=regenerate(demo,[],{},[],'营养审核回归');
  verifyAgainst({...plan,catalogVersion:'2026.11-sr5'},demo,[],{},[]);
  const rows=ingredientNutrition(plan.days.flatMap(day=>day.meals.flatMap(meal=>meal.dishes.flatMap(x=>x.ingredients))),7,demo,plan.targets);
  assert.equal(rows.find(row=>row.key==='kcal')?.coverage,1);
  assert.ok(rows.find(row=>row.key==='zinc')!.known!>0);
});
