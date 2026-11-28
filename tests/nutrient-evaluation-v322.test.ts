import assert from 'node:assert/strict';
import {test} from 'node:test';
import {food,recipeMap,serving,type Serving} from '../src/catalog';
import {sodiumUpperBound} from '../src/diet-check';
import {allowed,regenerate,verifyAgainst} from '../src/planner';
import {nutrientDatum} from '../src/nutrient-catalog';
import {nutrientReferences} from '../src/nutrient-reference';
import {dailyNutritionAlerts,evaluateNutrient,ingredientNutrition} from '../src/nutrient-report';
import {recipeIngredients} from '../src/nutrient-report-input';
import {nutritionLoss,plannedLevels,upperIssues} from '../src/nutrient-planning';
import type {Day} from '../src/shopping';
import {demo} from './fixtures';

const near=(actual:number|null|undefined,expected:number)=>assert.ok(Math.abs((actual??Infinity)-expected)<.0001,[actual,expected].join('/'));
const result=(key:string,rows:ReturnType<typeof ingredientNutrition>)=>rows.find(row=>row.key===key)!;

test('EAR、RNI、AI、PI-NCD 与真实 UL 分开，状态不以推荐量判超限',()=>{
  const vs=nutrientReferences({...demo,age:'75',sex:'女'});
  assert.deepEqual(vs.sodium,{ai:1400,pi:{amount:1800,direction:'至多'}});
  assert.deepEqual(vs.potassium,{ai:2000,pi:{amount:3600,direction:'至少'}});
  assert.equal(vs.magnesium?.ul,undefined);
  assert.equal(vs.folateDfe?.ul,undefined);
  assert.equal(vs.folicAcid?.ul,1000);
  assert.equal(vs.vitaminA?.ul,undefined);
  assert.equal(vs.retinol?.ul,3000);
  assert.equal(evaluateNutrient(500,true,vs.calcium),'摄入不足（低于 EAR）');
  assert.equal(evaluateNutrient(700,true,vs.calcium),'未达推荐（RNI）');
  assert.equal(evaluateNutrient(800,true,vs.calcium),'达到推荐（RNI）');
  assert.equal(evaluateNutrient(1000,true,vs.calcium),'高于推荐（RNI）');
  assert.equal(evaluateNutrient(1800,true,vs.calcium),'接近上限（UL）');
  assert.equal(evaluateNutrient(2200,false,vs.calcium),'已知量超过上限（UL）');
  assert.equal(evaluateNutrient(1900,true,vs.sodium),'超过 PI-NCD 建议量');
  assert.doesNotMatch(evaluateNutrient(5800,true,vs.potassium),/上限/);
  assert.doesNotMatch(evaluateNutrient(1200,true,vs.potassium),/摄入不足/);
  assert.equal(evaluateNutrient(500,false,vs.calcium),'数据不完整');
});

test('配餐评分达标后停止加分，真正的 UL 仍校验',()=>{
  const refs=nutrientReferences(demo),base={vitaminC:100,calcium:800,foodPotassium:2000,iron:12,zinc:12,magnesium:320,folateDfe:400};
  assert.equal(nutritionLoss(base,refs),nutritionLoss({...base,calcium:1000,vitaminC:200,foodPotassium:3800,magnesium:540,folateDfe:600},refs));
  assert.ok(nutritionLoss({...base,magnesium:210,folateDfe:200},refs)>nutritionLoss(base,refs));
  assert.deepEqual(upperIssues({...base,iron:44,retinol:3060,vitaminA:4050,sodium:3210,potassium:6800},refs),['iron','retinol']);
});

test('烹调保留率按生料用量计算，熟料和后加调味品只计一次',()=>{
  const source=nutrientDatum('spinach','vitaminC')![0]!;
  const cooked=recipeIngredients('boil-spinach',[{id:'spinach',grams:100},{id:'salt',grams:1}]);
  const cold=recipeIngredients('cold-example',[{id:'spinach',grams:100}]);
  const rows=ingredientNutrition([...cooked,...cold],1,demo);
  near(result('vitaminC',rows).known,source*1.55);
  assert.equal(result('vitaminC',rows).retained,true);
  const prepared=ingredientNutrition([{id:'cookedsweet',grams:100,recipeId:'boil-cookedsweet'}],1,demo);
  near(result('vitaminC',prepared).known,nutrientDatum('cookedsweet','vitaminC')![0]!);
  assert.equal(result('vitaminC',prepared).retained,false);
  const knownSalt=food('salt').nutrients.sodium!/100;
  near(result('sodium',rows).known,knownSalt+food('spinach').nutrients.sodium!*1.95);
});

test('低钠盐和复合酱油按各自克数核算；受限档案禁用含钾盐',()=>{
  const salt=food('lowsalt75');
  near(salt.nutrients.sodium,29504.620123);
  near(salt.nutrients.potassium,13111.68643);
  const p={...demo,lowSodiumSalt:true};
  const variant=recipeMap.get('boil-broccoli--lowsalt75')!;
  assert.equal(allowed(variant,demo,[]),false);
  assert.equal(allowed(variant,{...p,conditions:['肾脏疾病']},[]),false);
  assert.equal(allowed(variant,{...p,otherHealth:'补钾药物'},[]),false);
  assert.equal(allowed(variant,p,[]),true);
  const grams=[{id:'lowsalt75',grams:2},{id:'soy',grams:5}];
  const mixed=ingredientNutrition(grams,1,p);
  near(result('sodium',mixed).known,salt.nutrients.sodium!*.02+food('soy').nutrients.sodium!*.05);
  near(result('potassium',mixed).known,salt.nutrients.potassium!*.02+food('soy').nutrients.potassium!*.05);
  const saltServing=serving(variant,1,grams);
  const day:Day={meals:[{name:'午餐',dishes:[saltServing]}]};
  near(sodiumUpperBound(day),result('sodium',mixed).known!);
  near(plannedLevels(day).potassium,result('potassium',mixed).known!);
  assert.equal(plannedLevels(day).foodPotassium,undefined); // 调味料的钾不作为配餐奖励。
  const plan=regenerate(p,[],{},[],'配餐低钠salt-测试');
  assert.ok(plan.days.some(d=>d.meals.some(m=>m.dishes.some(r=>r.ingredients.some(x=>x.id==='lowsalt75')))));
  verifyAgainst(plan,p,[],{},[]);
});

test('周平均达标仍列出单日钠异常；缺值不能伪造达标',()=>{
  const first={label:'第 1 天',ingredients:[{id:'salt',grams:7}]};
  const others=Array.from({length:6},(_,i)=>({label:'第 '+(i+2)+' 天',ingredients:[{id:'salt',grams:1}]}));
  const week=[first,...others];
  const average=ingredientNutrition(week.flatMap(day=>day.ingredients),7,demo);
  assert.ok(result('sodium',average).known!<2000);
  const alerts=dailyNutritionAlerts(week,demo);
  assert.deepEqual(alerts.filter(day=>day.issues.some(row=>row.key==='sodium')).map(day=>day.label),['第 1 天']);
  assert.match(result('vitaminD',average).status,/数据不完整/);
});
