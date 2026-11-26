import { food, foodState, type Serving } from './catalog';
import {cookingRule,type CookingSelection} from './cooking-profile';
import {mealCooking} from './cooking';
import { dateKey, type MealName, type Profile } from './profile';

export type Pantry = Record<string,{stock?:number; bought?:number; price?:number; pack?:number; yieldPercent?:number}>;
export type Day = {meals: Meal[]};
export type Meal = {name:string; dishes:Serving[]};
export function mealMinutes(meal:Meal) {
  const devices = new Map<string,number>();
  const recipes = meal.dishes.map(s=>s.recipe).sort((a,b)=>b.cook-a.cook);
  let prepDone = 0;
  for (const recipe of recipes) {
    prepDone += recipe.prep;
    const finish = Math.max(prepDone,...recipe.tools.map(tool=>devices.get(tool)??0))+recipe.cook;
    for (const tool of recipe.tools) devices.set(tool,finish);
  }
  return Math.max(prepDone,...devices.values());
}
export type Purchase = {id:string; name:string; category:string; state:string; need:number; stock:number; buy:number; bought:number; done:boolean; cost:number|null; extra:number; part:number[]; uncertain:boolean};
export const portionRound = (n: number) => Math.round(n*100)/100;

export function shopping(days: Day[], p:Profile, pantry:Pantry): Purchase[] {
  const needs = new Map<string,number[]>();
  days.forEach((day,index)=>day.meals.flatMap(m=>m.dishes).forEach(s=>s.ingredients.forEach(i=>{
    const qs = needs.get(i.id) ?? Array<number>(7).fill(0);
    qs[index]+=i.grams*Number(p.people);
    needs.set(i.id,qs);
  })));
  return [...needs].map(([id,quantities])=>{
    const f = food(id), entry = pantry[id] ?? {}, stock = entry.stock ?? 0;
    const need = portionRound(quantities.reduce((a,b)=>a+b,0));
    // Recipes use edible or prepared weight throughout. Unknown trim losses remain unknown.
    const uncertain = entry.yieldPercent===undefined && f.state === 'raw' && ['蔬菜','水果','蛋','调味品','主食'].includes(f.category);
    const perishable = needsChill(id);
    const splitAt = p.trips === '2' || (perishable && p.tools.includes('冰箱') && !p.tools.includes('冷冻室')) ? 3 : 7;
    let sizes = perishable && !p.tools.includes('冰箱') ? quantities : [quantities.slice(0,splitAt).reduce((a,b)=>a+b,0),quantities.slice(splitAt).reduce((a,b)=>a+b,0)];
    let remainingStock = stock;
    sizes = sizes.map(q=>{
      const remainder = Math.max(0,portionRound(q-remainingStock));
      remainingStock = Math.max(0,remainingStock-q);
      const gross = remainder / ((entry.yieldPercent??100)/100);
      return gross > 0 && entry.pack ? Math.ceil(gross/entry.pack)*entry.pack : Math.ceil(gross);
    });
    const buy = sizes.reduce((a,b)=>a+b,0);
    const bought = entry.bought ?? 0;
    return {id,name:f.name,category:f.category,state:foodState[f.state],need,stock,buy,bought,done:bought>=buy,
      cost:entry.price === undefined ? (buy===0 ? 0 : null) : buy*entry.price/1000,
      extra:Math.max(0,buy-bought),part:sizes,uncertain};
  }).sort((a,b)=>a.category.localeCompare(b.category,'zh-CN') || a.name.localeCompare(b.name,'zh-CN'));
}

export function needsChill(id: string) {
  const f = food(id);
  return ['肉类','鱼虾','蛋','豆制品','乳制品'].includes(f.category) && f.state !== 'dry';
}
export type Prep = {mode:string; notice:string[]; days:{date:string; task:string; minutes:number; meals:string[]}[]};

export function prepPlan(days:Day[], p:Profile, start:string,modeOverride?:CookingSelection): Prep {
  const fridge = p.tools.includes('冰箱'), freezer = fridge && p.tools.includes('冷冻室');
  const fresh = ['蔬菜','水果'];
  const selected=(meal:Meal,index:number)=>cookingRule(p,meal.name as MealName,index,modeOverride);
  const byMeal=days.some((d,index)=>d.meals.some(meal=>selected(meal,index).prep));
  const selectedBatch=(meal:Meal,index:number)=>byMeal?selected(meal,index).prep:
    (p.cooking?.days?.[index]?.[meal.name as '早餐'|'午餐'|'晚餐']?.prep ??
      p.cooking?.meals?.[meal.name as '早餐'|'午餐'|'晚餐']?.prep ??
      p.mealPreferences?.[meal.name as '早餐'|'午餐'|'晚餐']?.prep??true);
  const mode = !fridge ? '每天现做' : byMeal&&p.prep==='每天现做'?'混合模式':p.prep==='周末一次备餐' && !freezer ? '每隔2～3天' : p.prep;
  const batchDays = mode==='周末一次备餐' ? [0] : mode==='每隔2～3天' || mode==='混合模式' ? [0,3,6] : [];
  const notice = [
    '处理生肉、水产和鸡蛋后清洁双手、台面和器具。生熟分开，生肉密封放下层。',
    '熟食分小份放浅盒，两小时内冷藏至 4°C 或冷冻至 −18°C。环境超过 32°C 时缩短至一小时。',
    '在冷藏室解冻。需要复热的熟食，中心至少达到 74°C。现切果蔬和冷食尽量当天准备。',
  ];
  if (!fridge) notice.unshift('未配置冰箱。易腐食材当天购买、当天制作；避免将剩菜留到下一餐。便当需有可靠的保冷或热保温条件。');
  if (fridge) notice.push('生禽、虾、鲜鱼和开封豆腐等易腐食材应尽快加工。当天不使用的肉类和水产按需及时冷冻，无法冷冻时临用前再购。');
  if (fridge && !freezer) notice.unshift('冷藏备餐按两至三天安排。肉类和水产按需分批购买，采购后尽快使用。');
  if (byMeal && !fridge) notice.push('已选择提前备餐，但没有冰箱，本周仍按当天现做安排。');
  if(byMeal&&fridge) notice.push('明确标为需提前制作的菜，建议前一日制作并冷藏。熟食和熟谷物要快速分装冷却，食用前一次性复热到 74°C。');
  if (p.packed) notice.push('冷便当使用冰袋保冷至 4°C 或以下；没有可靠冷藏或热保温条件时，改为现做现吃。');
  return {mode,notice,days:days.map((day,index)=>{
    const cooked = day.meals.flatMap(m=>m.dishes).filter(d=>d.recipe.batch);
    const isBatch = batchDays.includes(index);
    const windowSize = mode === '周末一次备餐' ? 7 : 3;
    const batch = days.slice(index,index+windowSize).flatMap((d,k)=>d.meals.filter(m=>selectedBatch(m,index+k)).flatMap(m=>m.dishes))
      .filter(d=>d.recipe.batch && d.ingredients.some(i=>!fresh.includes(food(i.id).category)));
    const chill = [...new Set(cooked.flatMap(s=>s.ingredients.filter(i=>needsChill(i.id)).map(i=>food(i.id).name)))];
    const selectedNames = day.meals.filter(m=>selectedBatch(m,index)&&m.dishes.some(d=>d.recipe.batch)).map(m=>m.name);
    const ahead=day.meals.flatMap(m=>mealCooking(m.dishes.map(s=>s.recipe),selected(m,index),fridge).ahead);
    const optional=fridge && byMeal && selectedNames.length ? ' 本日适合提前处理：'+selectedNames.join('、')+'。' : '';
    const note = !fridge && chill.length ? ' 当天采购：'+chill.join('、')+'。' :
      optional;
    const task = isBatch
      ? `采购本批所需食材。主食先煮、蛋白质分装后再处理蔬菜。分成 ${p.people} 人的单餐份并标日期。${freezer ? '超过两天才吃的熟食在冷却后当天冷冻。' : '本批熟食两天内食用，第三天按需现做。'}`
      : batchDays.length && (freezer || index%3!==2) ? '取当天单餐份安全复热，果蔬优先现洗现切。检查其余新鲜食材的保质状态。'
      : '当天购买易腐食材，先做耗时最长的主食，蛋白质彻底加热，最后准备蔬菜和水果。';
    const date = new Date(start+'T12:00:00'); date.setDate(date.getDate()+index);
    return {date:dateKey(date),task:task+note,minutes:(isBatch ? batch : cooked).reduce((n,d)=>n+d.recipe.prep+d.recipe.cook,0),
      meals:[...day.meals.map(m=>m.name+' · '+m.dishes.map(s=>s.recipe.name).join('、')),...ahead.map(a=>'需提前制作：'+a.name+' '+a.minutes+' 分钟，届时复热 '+a.reheat+' 分钟。')]};
  })};
}
