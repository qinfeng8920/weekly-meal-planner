import type {Food,Recipe} from './catalog';

export const substitutionVersion='2026.11-1';
type Rule={
  from:string;to:string;role:string;grade:'A'|'B';method:'温和加热或凉拌'|'即食调酸'|'先水煮后加油';
  matchingRecipes?:string[];ratio:number;steps:boolean;confirm:false;basis:string;
  check:'用目标食材重算营养与过敏原';
};
const oilBasis='人工复核现有煮、蒸与凉拌配方。保留用量与原有熟化条件。';
const vinegarBasis='龟甲万无调味米醋用于即食调味；苹果醋与米醋风味和酸度有差异，配方按原重量起调并试味。';
export const directRules:Rule[]=[
  {from:'canola',to:'olive',role:'烹调油',grade:'A',method:'温和加热或凉拌',ratio:1,steps:true,confirm:false,basis:oilBasis,check:'用目标食材重算营养与过敏原'},
  {from:'olive',to:'canola',role:'烹调油',grade:'A',method:'温和加热或凉拌',ratio:1,steps:true,confirm:false,basis:oilBasis,check:'用目标食材重算营养与过敏原'},
  {from:'vinegar',to:'ricevinegar',role:'食醋',grade:'A',method:'即食调酸',ratio:1,steps:true,confirm:false,basis:vinegarBasis,check:'用目标食材重算营养与过敏原'},
  {from:'canola',to:'olive',role:'烹调油',grade:'B',method:'先水煮后加油',matchingRecipes:['bowl-beef-brown'],
    ratio:1,steps:true,confirm:false,basis:'复核番茄牛肉糙米碗。以水煮番茄并在出锅时拌油，继续执行熟饭复热和牛肉熟化条件。',
    check:'用目标食材重算营养与过敏原'},
];

export type Replacement={from:string;to:string;rule:string};

const conditionalGroups=[
  ['禽肉',['chicken','thigh','turkey','cookedchicken']],
  ['去骨白肉鱼',['tilapia','bass','cod']],
  ['脂肪较高的鱼',['salmon','trout','mackerel']],
  ['全蛋做法',['egg','boiledegg']],
  ['鲜豆腐',['tofu','softtofu']],
  ['原味无糖酸奶',['greek','yogurt']],
  ['干谷物独立主食',['rice','brown','millet','quinoa','buckwheat','barley']],
  ['薯类及玉米主食',['sweet','potato','corn','cookedsweet','cookedcorn']],
  ['叶菜',['bok','napa','romaine','spinach','kale','mustard','arugula','watercress']],
  ['花球蔬菜',['broccoli','cauliflower']],
  ['同用途彩椒',['redpepper','yellowpepper']],
  ['鲜菌菇',['shiitake','whitefungi','oystermushroom','enoki']],
  ['整果',['apple','pear','asianpear','orange','mandarin','kiwi','peach','banana','strawberry','blueberry','grape','plum','watermelon','melon','pineapple','mango','papaya','pomegranate','apricot','fig']],
  ['原味树坚果',['almond','walnut','cashew','pistachio','hazelnut']],
] as const;
const roles=new Map<string,string>(conditionalGroups.flatMap(([group,ids])=>ids.map(id=>[id,group])));
export function conditionalPair(from:string,to:string) {
  const role=roles.get(from);
  return from!==to&&Boolean(role&&role===roles.get(to));
}
const replan=new Set(['milk','soymilk','eggwhite','shrimp','scallop','squid','peanut','peanutoil','sesameoil','soy','salt','cannedsalmon','cheese']);
export function substitutionCoverage(id:string) {
  if(directRules.some(rule=>rule.from===id||rule.to===id))return '直接变体';
  if(roles.has(id))return '有条件换完整菜谱';
  return replan.has(id)?'重新配餐或禁止等量替换':'暂无直接审核规则';
}

export const recipeBaseId=(recipe:Recipe)=>recipe.baseId??recipe.id;

function applicable(recipe:Recipe,rule:Rule) {
  if(!recipe.ingredients.some(item=>item.id===rule.from)||recipe.ingredients.some(item=>item.id===rule.to))return false;
  if(rule.matchingRecipes&&!rule.matchingRecipes.includes(recipe.id))return false;
  if(rule.method==='先水煮后加油')return recipe.tools.every(tool=>tool==='煮锅');
  if(rule.method==='即食调酸')return recipe.cook===0&&recipe.steps.some(step=>step.includes('苹果醋'));
  return recipe.tools.every(tool=>['煮锅','蒸锅','电饭煲','微波炉','冰箱','冷冻室'].includes(tool))&&
    recipe.steps.every(step=>!/爆香|炒|煎|高温|油炸|烤/.test(step));
}

export function buildSubstitutionVariants(base:Recipe,food:(id:string)=>Food):Recipe[] {
  const rules=directRules.filter(rule=>applicable(base,rule));
  const variants:Recipe[]=[];
  for(const rule of rules) {
    for(const prior of [base,...variants]) {
      const from=food(rule.from),to=food(rule.to);
      const notes=[...(prior.replacements??[]),{from:rule.from,to:rule.to,rule:substitutionVersion}];
      const name=prior.name.replaceAll(from.name,to.name);
      const steps=rule.method==='先水煮后加油'?[
        '胡萝卜和番茄洗净切薄，牛肉在独立的生肉刀板上逆纹切薄片。',
        '先在煮锅里加少量水煮软番茄和胡萝卜。加入无盐熟糙米并复热至中心 74°C。',
        '加入牛肉，确认中心达到 63°C，关火静置 3 分钟，再拌入盐和橄榄油，当餐吃。',
      ]:prior.steps.map(step=>step.replaceAll(from.name,to.name));
      if(rule.method!=='先水煮后加油')steps.push(rule.method==='即食调酸'?'用无添加糖盐的米醋作即食调味，按配方少量加入后试味。':`本配方使用${to.name}，沿用原有蒸、煮或拌的方法。`);
      variants.push({...prior,id:base.id+'--'+notes.map(note=>note.to).join('-'),name,
        ingredients:prior.ingredients.map(item=>item.id===rule.from?{id:rule.to,grams:item.grams*rule.ratio}:item),
        steps,baseId:base.id,replacements:notes});
    }
  }
  return variants;
}
