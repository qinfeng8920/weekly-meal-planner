import {deepEqual,equal,notDeepEqual,ok,throws} from 'node:assert/strict';
import {test} from 'node:test';
import {foods,recipeList,food,serving} from '../src/catalog';
import {nutrition,macroKeys} from '../src/nutrition';
import {dayNutrition,regenerate,revise,verifyAgainst} from '../src/planner';
import {shopping,prepPlan} from '../src/shopping';
import {parseBackup,fresh} from '../src/store';
import {demo} from './fixtures';

const make=(overrides={},seed='abc')=>regenerate({...demo,...overrides},[],{},[],seed);
const all=(p:ReturnType<typeof make>)=>p.days.flatMap(d=>d.meals.flatMap(m=>m.dishes));
const base=make();
test('不同档案、计算公式及正常体重维持',()=>{
  equal(nutrition(demo).bmr,1727.5);
  notDeepEqual(nutrition(demo),nutrition({...demo,sex:'女',height:'162',weight:'66',target:'61'}));
  const normal=nutrition({...demo,weight:'65',target:'60'});
  equal(normal.kcal,Math.round(normal.tdee));
});
test('安全筛查、低体重和异常输入',()=>{
  for(const overrides of [{age:'17'},{age:''},{height:'0'},{weight:'43'},{target:'45'},{target:'999'},{screened:false},
    {allergyChecked:false},{risks:['怀孕或哺乳期']},{risks:['进食障碍风险']},{conditions:['肾脏疾病']},{otherHealth:'医师建议评估'}]){
    throws(()=>nutrition({...demo,...overrides}));
  }
  equal(nutrition({...demo,fluidLimit:true}).water,null);
});
test('121 种可追溯食材与 117 道可计算菜谱',()=>{
  ok(foods.length>=100);ok(recipeList.length>=100);
  for(const f of foods){ok(f.fdc>0);ok(macroKeys.every(k=>typeof f.nutrients[k]==='number'));}
  for(const r of recipeList){
    ok(r.steps.length>0);
    const row=serving(r);
    for(const key of macroKeys) ok(Math.abs(row.nutrients[key]-r.ingredients.reduce((sum,i)=>sum+food(i.id).nutrients[key]!*i.grams/100,0))<1e-6);
  }
});
test('七天完整、热量合格、随机可复现且不同种子可变化',()=>{
  equal(base.days.length,7);
  deepEqual(base.days,make().days);
  notDeepEqual(base.days,make({},'另一种子').days);
  for(const day of base.days){
    equal(day.meals.length,3);
    const n=dayNutrition(day);ok(Math.abs(n.kcal-base.targets.kcal)<=base.targets.kcal*.05);
    ok(n.protein>=base.targets.protein&&n.fiber>=25&&n.sodium!<=2000);
  }
});
test('不同档案及两餐、加餐模式',()=>{
  for(const [p,n] of [[{sex:'女',height:'162',weight:'66',target:'61'},3],[{meals:'2'},2],[{meals:'4'},4]] as const){
    ok(make(p).days.every(d=>d.meals.length===n));
  }
});
test('仅煮蒸，过敏及调味品限制',()=>{
  const allergies=['奶','鱼','蛋','大豆','小麦','甲壳类'];
  const p=make({tools:['煮锅','蒸锅'],allergens:allergies,avoid:'芝麻油'});
  for(const row of all(p)){
    ok(row.recipe.tools.every(t=>['煮锅','蒸锅'].includes(t)));
    ok(row.ingredients.every(i=>i.id!=='soy'&&i.id!=='sesameoil'&&!food(i.id).allergens.some(a=>allergies.includes(a))));
  }
  throws(()=>make({requiredDish:'soy-chicken',allergens:['小麦']}),/限制冲突/);
});
test('固定早餐和指定菜，不能满足时明确失败',()=>{
  const p=make({fixedBreakfast:'grain-oats',requiredDish:'steam-chicken'});
  ok(p.days.every(d=>d.meals[0].dishes[0].recipe.id==='grain-oats'));
  ok(all(p).some(s=>s.recipe.id==='steam-chicken'));
  throws(()=>make({tools:[],minutes:'10'}),/不足/);
  throws(()=>make({avoid:'不存在的过敏食材'}),/无法核对/);
  throws(()=>make({budget:'1'}),/预算/);
});
test('锁定、换菜与派生采购备餐同步',()=>{
  const row=base.days[0].meals[0].dishes[0];
  const lock={day:0,meal:0,dish:0,serving:row};
  const changed=regenerate(demo,[],{},[],'replace',base,[lock],{day:0,meal:0,dish:1});
  deepEqual(changed.days[0].meals[0].dishes[0],row);
  notDeepEqual(changed.days[0].meals[0].dishes[1].recipe.id,base.days[0].meals[0].dishes[1].recipe.id);
  deepEqual(changed.days.slice(1),base.days.slice(1));
  deepEqual(changed.purchases,shopping(changed.days,demo,{}));
  deepEqual(changed.prep,prepPlan(changed.days,demo,base.start));
  throws(()=>revise(base,demo,[],{},[],0,0,0,[9999]),/范围/);
});
test('采购多人用量、包装、库存、补买与分批',()=>{
  const raw=shopping(base.days,{...demo,people:'2',trips:'2'},{}).find(p=>p.id==='canola')!;
  const need=all(base).flatMap(s=>s.ingredients).filter(i=>i.id==='canola').reduce((n,i)=>n+i.grams,0)*2;
  ok(Math.abs(raw.need-need)<.011);
  const rounded=shopping(base.days,{...demo,people:'2',trips:'2'},{canola:{stock:15,bought:2,price:50,pack:100}}).find(p=>p.id==='canola')!;
  equal(rounded.buy%100,0);equal(rounded.extra,rounded.buy-2);equal(rounded.cost,rounded.buy*.05);equal(rounded.part.length,2);
});
test('新体重更新目标，历史快照仍独立，备餐遇到无冰箱时每天现做',()=>{
  const newPlan=regenerate(demo,[{date:'2026-11-26',kg:80}],{},[],'abc');
  notDeepEqual(newPlan.targets,base.targets);equal(base.weight,83);equal(base.profile.weight,'83');
  const noFridge=make({tools:['煮锅','蒸锅'],prep:'周末一次备餐'});
  equal(noFridge.prep.mode,'每天现做');
  throws(()=>verifyAgainst(base,{...demo,risks:['医嘱特殊饮食']},[],{},[]));
});
test('损坏备份、未知版本与历史快照',()=>{
  const value={...fresh(),profile:demo,plan:base,history:[base]};
  const restored=parseBackup(JSON.stringify(value));
  equal(restored.profile!.name,demo.name);
  deepEqual(restored.history[0].days,base.days);
  throws(()=>parseBackup('{bad'),/JSON/);
  throws(()=>parseBackup(JSON.stringify({...value,version:99})),/版本/);
});
test('录入可食率按毛重换算，未知项保留净料提示',()=>{
  const initial=shopping(base.days,demo,{}).find(p=>p.id==='apple'||p.id==='pear'||p.id==='orange');
  ok(initial);
  ok(initial.uncertain);
  const updated=shopping(base.days,demo,{[initial.id]:{yieldPercent:50}}).find(p=>p.id===initial.id)!;
  equal(updated.buy,Math.ceil(initial.need*2));
  equal(updated.uncertain,false);
});
