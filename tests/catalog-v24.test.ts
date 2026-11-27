import {deepEqual,equal,ok,throws} from 'node:assert/strict';
import {test} from 'node:test';
import {food,foods,foodMap,foodState,recipeList,recipeMap,serving,variantsOf} from '../src/catalog';
import {foodClass} from '../src/catalog-taxonomy';
import {searchMatches} from '../src/catalog-search';
import {allowed,regenerate,replacementMatches,verifyAgainst} from '../src/planner';
import type {Plan} from '../src/planner';
import {labels} from '../src/meal-catalog';
import {capsFor,defaultPool,type PoolSettings} from '../src/ingredient-pool';
import {equipment} from '../src/profile';
import {macroKeys} from '../src/nutrition';
import {priceDefaults} from '../src/prices';
import {purchaseIngredientId} from '../src/purchase-food';
import {executeJobs} from '../src/execution';
import {adjustStock,emptyLedger} from '../src/inventory';
import {fresh,parseBackup} from '../src/store';
import {demo} from './fixtures';

const recipes=(id:string)=>recipeMap.get(id)!;
const fruitAt=(plan:Plan,day:number)=>{
  const meal=plan.days[day].meals.findIndex(m=>m.dishes.some(d=>labels(d.recipe).slot==='水果'));
  const dish=plan.days[day].meals[meal].dishes.findIndex(d=>labels(d.recipe).slot==='水果');
  return {day,meal,dish};
};
const fruitIds=(plan:Plan)=>plan.days.map(d=>d.meals.flatMap(m=>m.dishes.filter(s=>s.recipe.group==='水果')).map(s=>s.ingredients[0].id)[0]);
const settings:PoolSettings={...defaultPool,mode:'丰富多样',fruitPolicy:'每周固定一种',fruitId:'orange'};
const profile={...demo,tools:['煮锅','蒸锅','冰箱'],fruit:'自定义摄入量',fruitGrams:'200'};
let fixed:Plan;
function fixedPlan(){
  return fixed??=regenerate(profile,[],{},[],'24-固定水果',undefined,[],undefined,undefined,undefined,{settings});
}
test('数据库增量具备分类、可追溯来源，缺失宏量的食材仅浏览',()=>{
  equal(foodMap.size,foods.length);
  const identities=new Set<string>();
  for(const f of foods){
    ok(Object.hasOwn(foodState,f.state));
    ok(foodClass(f).group&&foodClass(f).subgroup);
    ok(f.fdc||f.sourceUrl?.startsWith('https://'));
    const identity=String(f.fdc??f.sourceUrl);
    ok(!identities.has(identity),f.id);identities.add(identity);
    ok(priceDefaults[f.id],f.id);
    for(const n of Object.values(f.nutrients))ok(n===null||Number.isFinite(n)&&n>=0,f.id);
    if(macroKeys.some(k=>f.nutrients[k]===null))ok(!recipeList.some(r=>r.ingredients.some(i=>i.id===f.id)),f.id);
  }
  equal(recipeMap.size,[...recipeList].reduce((n,r)=>n+variantsOf(r).length,0));
  const configurations=new Set<string>();
  for(const r of recipeMap.values()){
    ok(r.tools.every(tool=>equipment.includes(tool)),r.id);
    ok(r.steps.length&&r.ingredients.length&&labels(r).tags.length,r.id);
    ok(r.ingredients.every(i=>foodMap.has(i.id)&&i.grams>0),r.id);
    ok(serving(r).nutrients.kcal>0,r.id);
    const key=JSON.stringify([r.ingredients,r.tools,r.steps]);ok(!configurations.has(key),r.id);configurations.add(key);
  }
  equal(capsFor.自由搭配.水果,foods.length);
});
test('拼音及别名检索与生熟商品关系',()=>{
  ok(searchMatches([food('guava').name,...food('guava').aliases],'fanshiliu'));
  ok(searchMatches(food('cherrytomato').aliases,'shengnvguo'));
  equal(foodClass(food('cherrytomato')).group,'蔬菜');
  equal(purchaseIngredientId('cookedchicken'),'chicken');
  equal(purchaseIngredientId('cookedchicken',{ready:['cookedchicken']}),'cookedchicken');
  equal(purchaseIngredientId('drychickpea'),'drychickpea');
  equal(purchaseIngredientId('chickpea'),'chickpea');
  ok(!allowed(recipes('v24-nut-macadamia'),{...profile,allergens:['树坚果']},[]));
});
test('换主食、蛋白、蔬菜与汤依核心食材判断',()=>{
  for(const [a,b,c] of [
    ['grain-oats','quick-oats','grain-rice'],['steam-chicken','pan-chicken','steam-pork'],
    ['boil-broccoli','steam-broccoli','boil-carrot'],
  ]){
    ok(!replacementMatches(recipes(a),recipes(b),'换食材'),a);
    ok(replacementMatches(recipes(a),recipes(b),'换做法'),a);
    ok(replacementMatches(recipes(a),recipes(c),'换食材'),a);
  }
  ok(replacementMatches(recipes('soup-bok-mushroom'),recipes('soup-tomato-bok'),'换食材'));
});
test('固定水果 200 克，橙子改名不会构成换食材，可指定苹果或猕猴桃',()=>{
  const plan=fixedPlan(),pos=fruitAt(plan,0);
  deepEqual(fruitIds(plan),Array(7).fill('orange'));
  const days=structuredClone(plan.days);
  days[pos.day].meals[pos.meal].dishes[pos.dish]=serving(recipes('fruit-quick-orange'));
  const old={...plan,days};
  throws(()=>regenerate(profile,[],{},[],'拒绝同水果',old,[],{...pos,replacement:'fruit-orange',swapMode:'换食材'}),/核心食材/);
  for(const id of ['kiwi','apple','bayberry','pitaya']){
    const changed=regenerate(profile,[],{},[],'更换水果',old,[],{...pos,replacement:'fruit-'+id,swapMode:'换食材'});
    equal(changed.days[0].meals[pos.meal].dishes[pos.dish].ingredients[0].grams,200);
    equal(fruitIds(changed)[0],id);
    deepEqual(fruitIds(changed).slice(1),Array(6).fill('orange'));
    const purchase=changed.logistics!.lines.find(row=>row.id===id);
    equal(purchase?.uses.reduce((n,row)=>n+row.grams,0),200);
    verifyAgainst(changed,profile,[],{},[]);
  }
});
test('严格食材池须显式确认扩展，排除和锁定仍受保护',()=>{
  const old=fixedPlan(), pos=fruitAt(old,0);
  const current={...old,pool:{...old.pool!,settings:{...settings,method:'手动指定' as const,strict:true,
    selected:old.pool!.used.map(row=>row.id)}}};
  const change={...pos,replacement:'fruit-kiwi',swapMode:'换食材' as const};
  throws(()=>regenerate(profile,[],{},[],'严格拒绝',current,[],change),/严格食材池/);
  const result=regenerate(profile,[],{},[],'同意补充',current,[],{...change,expandPool:true});
  ok(result.pool!.settings.selected.includes('kiwi'));
  const reject={...current,pool:{...current.pool,settings:{...current.pool.settings,excluded:['kiwi']}}};
  throws(()=>regenerate(profile,[],{},[],'排除拒绝',reject,[],{...change,expandPool:true}),/排除/);
});
test('整周水果只处理待执行铺排，旧备份及新设置可往返',()=>{
  const old=fixedPlan(), pos=fruitAt(old,0), next=fruitAt(old,1);
  const [job]=old.logistics!.prep.flatMap(b=>b.jobs).filter(j=>j.day===0&&j.meal===old.days[0].meals[pos.meal].name&&j.name===old.days[0].meals[pos.meal].dishes[pos.dish].recipe.name);
  ok(job);
  const result=executeJobs(adjustStock(emptyLedger(),'orange',500,'增加',old.start,'调整|测试库存|orange'),{},[job],'用餐',true,old.start);
  const supply={execution:result.execution,ledger:result.ledger};
  throws(()=>regenerate(profile,[],{},[],'不改已食用',old,[],{...pos,replacement:'fruit-pear',swapMode:'换食材'},undefined,supply),/已执行/);
  const changed=regenerate(profile,[],{},[],'批量换水果',old,[],{...next,replacement:'fruit-pear',swapMode:'换食材',weekFruit:true},undefined,supply);
  deepEqual(fruitIds(changed),['orange',...Array(6).fill('pear')]);
  equal(changed.pool?.settings.fruitId,'pear');
  const backup=parseBackup(JSON.stringify({...fresh(),poolSettings:changed.pool?.settings,profile,plan:changed,history:[old]}));
  equal(backup.poolSettings?.fruitId,'pear');
  deepEqual(fruitIds(backup.history[0]),Array(7).fill('orange'));
});
