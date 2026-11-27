import {food, type Recipe} from './catalog';
import {labels} from './meal-catalog';

const equivalent:Record<string,string>={
  yogurt:'yogurt',greek:'yogurt',greek0:'yogurt',eggwhite:'egg',boiledegg:'egg',cookedchicken:'chicken',
  softtofu:'tofu',cookedsweet:'sweet',cookedcorn:'corn',cookedbrown:'brown',asianpear:'pear',
  yellowpepper:'redpepper',
};
const kinds:Record<string,string>={
  yogurt:'酸奶',milk:'牛奶',cheese:'奶酪',egg:'鸡蛋',chicken:'鸡胸肉',thigh:'鸡腿肉',beef:'牛肉',pork:'猪肉',
  tofu:'豆腐',soymilk:'豆浆',chickpea:'鹰嘴豆',cannedsalmon:'鲑鱼',salmon:'鲑鱼',
  rice:'稻米',brown:'稻米',oats:'燕麦',bread:'面包',pasta:'意面',sweet:'红薯',corn:'玉米',
};
const foodFunctions:Record<string,string[]>={
  肉类:['蛋白质'],鱼虾:['蛋白质'],蛋:['蛋白质'],豆制品:['蛋白质','植物性食材'],
  主食:['能量','碳水化合物'],蔬菜:['膳食纤维','维生素'],水果:['维生素','膳食纤维'],
  乳制品:['蛋白质','钙来源'],坚果种子:['脂肪','膳食纤维'],调味品:['调味'],
};
type IngredientMeaning = {standardId:string;aliases:string[];category:string;subtype:string;functions:string[];exclusion:string};
const foodCache=new Map<string,IngredientMeaning>();
export function ingredientMeaning(id:string) {
  const existing=foodCache.get(id);
  if(existing) return existing;
  const f=food(id);
  const standardId=equivalent[id]??id;
  const subtype=kinds[standardId]??food(standardId).name;
  const exclusion=f.category==='调味品'?'':f.category==='主食'?'主食:'+subtype:'食材:'+subtype;
  const result={standardId,aliases:[f.name,...f.aliases],category:f.category,subtype,
    functions:foodFunctions[f.category]??[],exclusion};
  foodCache.set(id,result);
  return result;
}

type RecipeMeaning = ReturnType<typeof describeRecipe>;
const recipeCache=new WeakMap<Recipe,RecipeMeaning>();
function describeRecipe(recipe:Recipe) {
  const {slot,tags}=labels(recipe);
  const ingredients=recipe.ingredients.map(i=>({meaning:ingredientMeaning(i.id),grams:i.grams}))
    .filter(i=>i.meaning.category!=='调味品');
  const total=ingredients.reduce((n,i)=>n+i.grams,0);
  const protein=(i:IngredientMeaning)=>['肉类','鱼虾','蛋','豆制品','乳制品'].includes(i.category);
  const primary=ingredients.filter(({meaning:m,grams},index)=>{
    if (slot==='一锅套餐') return m.category==='主食'||protein(m)&&grams>=30;
    if (slot==='蛋白质') return protein(m)&&grams>=Math.max(30,total*.24);
    if (slot==='主食') return m.category==='主食';
    if (slot==='水果') return m.category==='水果';
    if (slot==='蔬菜'||slot==='清汤') return m.category==='蔬菜'&&(index===0||grams>=total*.28);
    return index===0||grams>=total*.32;
  }).map(i=>i.meaning);
  const core=primary.length?primary:ingredients.slice(0,1).map(i=>i.meaning);
  // 酸奶作主体时互斥，三明治里的少量酸奶酱、粥里的牛奶及豆浆仍可作为配料。
  if(slot==='主食') for(const {meaning:m,grams} of ingredients) {
    if(m.subtype==='酸奶'&&grams>=Math.max(55,total*.30)) core.push(m);
  }
  const exclusion=core.flatMap(i=>{
    if(['chicken','thigh','drumstick','gizzard','chickenheart'].includes(i.standardId)) return [i.exclusion,'肉类:鸡肉'];
    return i.exclusion?[i.exclusion]:[];
  });
  return {core:[...new Set(core.map(i=>i.standardId))],types:[...new Set(core.map(i=>i.subtype))],
    exclusion:[...new Set(exclusion)],role:slot,tags,
    type:recipe.group,functions:[...new Set(core.flatMap(i=>i.functions))],ingredients};
}
export function recipeMeaning(r:Recipe) {
  const cached=recipeCache.get(r);
  if(cached)return cached;
  const value=describeRecipe(r);recipeCache.set(r,value);return value;
}
export function mealConflict(recipes:Recipe[]):string|undefined {
  const used=new Set<string>();
  let starch=false;
  for(const r of recipes) {
    const meaning=recipeMeaning(r);
    const duplicate=meaning.exclusion.find(x=>used.has(x));
    if(duplicate)return '同餐重复'+duplicate.split(':')[1];
    if(meaning.role==='主食'||meaning.role==='一锅套餐') {
      if(starch)return '同餐有两份独立主食';
      starch=true;
    }
    meaning.exclusion.forEach(x=>used.add(x));
  }
}
export function overlapPenalty(recipes:Recipe[]) {
  const use=new Map<string,number>();
  for(const r of recipes) {
    const ids=new Set(recipeMeaning(r).ingredients.filter(i=>i.grams>=35).map(i=>i.meaning.standardId));
    for(const id of ids) use.set(id,(use.get(id)??0)+1);
  }
  return [...use.values()].reduce((n,count)=>n+Math.max(0,count-1)*.018,0);
}
export function sameFood(a:Recipe,b:Recipe) {
  const x=recipeMeaning(a),y=recipeMeaning(b);
  return x.role===y.role && x.exclusion.some(group=>y.exclusion.includes(group));
}

export function coreSignature(recipe:Recipe) {
  return [...recipeMeaning(recipe).core].sort().join('|');
}
