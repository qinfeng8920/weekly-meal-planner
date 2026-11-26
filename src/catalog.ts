import {quickRecipes} from './quick-recipes';
import data from './foods.json';
import {macroKeys, scale, sum, type Nutrients} from './nutrition';

export type Food = typeof data[number];
export const foods = data;
export const foodMap = new Map(foods.map(f=>[f.id,f]));
export const food = (id: string) => {
  const value = foodMap.get(id);
  if (!value) throw Error('食材不存在。');
  return value;
};
export const foodState: Record<string,string> = {raw:'生鲜可食部',dry:'干重',cooked:'熟重',ready:'成品净重',frozen:'冷冻净重'};
export const catalogVersion = '2026.11-sr2';
export type Ingredient = {id:string; grams:number};
export type Group = '蛋白质菜'|'蔬菜'|'主食'|'早餐'|'水果'|'加餐'|'汤类';
export type Recipe = {
  id:string; name:string; group:Group; ingredients:Ingredient[]; tools:string[]; prep:number; cook:number;
  steps:string[]; cuisine:string; flavor:string; skill:string; batch:boolean; min:number; max:number;
};
export type Serving = {recipe:Recipe; ingredients:Ingredient[]; nutrients:Nutrients};
const items = (...pairs: [string,number][]): Ingredient[] => pairs.map(([id,grams])=>({id,grams}));
const recipes: Recipe[] = [];
function add(id:string, name:string, group:Group, ingredients:Ingredient[], tools:string[], prep:number, cook:number,
    steps:string[], options: Partial<Pick<Recipe,'cuisine'|'flavor'|'batch'|'min'|'max'|'skill'>> = {}) {
  recipes.push({id,name,group,ingredients,tools,prep,cook,steps,cuisine:'中式家常',flavor:'清淡',
    skill:tools.includes('炒锅') ? '简单做饭' : '完全不会', batch:tools.length>0,min:.65,max:1.65,...options});
}

const proteins = [
  ['chicken','鸡胸肉',125,'切成厚约 1 厘米的片','中心达到 74°C',12,7],
  ['thigh','去皮鸡腿肉',125,'去除多余脂肪后切成均匀小块','中心达到 74°C',15,9],
  ['beef','瘦牛肉',105,'逆纹切薄片','达到 63°C 后静置 3 分钟',10,6],
  ['pork','猪里脊',115,'切成薄片','达到 63°C 后静置 3 分钟',12,7],
  ['salmon','三文鱼',115,'鱼排去刺，切成均匀厚块','中心达到 63°C',10,8],
  ['bass','鲈鱼',145,'选去刺鱼柳，吸干表面水分','中心达到 63°C',10,8],
  ['tilapia','罗非鱼柳',145,'鱼柳去刺，切开特别厚的位置','中心达到 63°C',10,8],
  ['cod','鳕鱼柳',145,'鱼柳去刺，吸干表面水分','中心达到 63°C',10,8],
  ['shrimp','虾仁',135,'去虾线并吸干表面水分','虾肉全部不透明',6,5],
  ['tofu','北豆腐',170,'切成约 2 厘米的片','豆腐中心热透',10,8],
  ['softtofu','普通豆腐',175,'沥水后切成约 2 厘米的块','豆腐中心热透',10,8],
  ['trout','虹鳟',125,'鱼柳去刺，切成均匀厚块','中心达到 63°C',10,8],
  ['scallop','鲜贝柱',140,'去裙边、吸干表面水分','贝肉变为乳白且不透明',6,5],
] as const;

for (const [id,name,grams,cut,done,steam,pan] of proteins) {
  add('steam-'+id,'葱姜蒸'+name,'蛋白质菜',items([id,grams],['ginger',5],['scallion',7],['canola',8],['salt',.65]),
    ['蒸锅'],6,steam,[cut+'。另备葱段和姜丝，生熟刀板分开。','将食材平铺在耐热浅盘，撒姜丝和盐，水开后上锅。',`约 ${steam} 分钟后检查，确认${done}。撒葱，淋油后即可食用。`],
    {cuisine:'粤菜'});
  add('pan-'+id,'黑椒煎'+name,'蛋白质菜',items([id,grams],['canola',9],['pepper',.6],['salt',.65]),['炒锅'],5,pan,
    [cut+'。吸去表面水分，撒黑胡椒和盐。','锅热后倒入菜籽油，铺平食材，中火煎至一面定型再翻面。',`约 ${pan} 分钟后，确认${done}。厚块需延长时间并复查。`],
    {cuisine:'西式轻食',flavor:'黑椒'});
  add('soup-'+id,'番茄'+name+'汤','汤类',items([id,grams],['tomato',100],['ginger',4],['canola',8],['salt',.65]),['煮锅'],7,pan+5,
    [cut+'，番茄切小块，另备姜片。','用少量油翻炒番茄至出汁，加约一碗水与姜片煮沸。',`下入${name}，小火煮至${done}再加盐。汤与固体食材一起食用。`]);
}

add('boiled-egg','水煮蛋','蛋白质菜',items(['egg',110]),['煮锅'],2,11,
  ['鸡蛋带壳冷水下锅，水量需盖过鸡蛋。','沸腾后保持小沸约 10 分钟，蛋黄和蛋清均凝固。','捞出用洁净冷水降温后剥壳，营养重量按去壳计。'],{min:.46,max:1.4});
add('steam-eggs','葱花蒸蛋羹','蛋白质菜',items(['egg',100],['scallion',6],['canola',5],['salt',.5]),['蒸锅'],5,12,
  ['蛋液与约 1.3 倍温水混匀，加盐后撇去浮沫。','倒入浅碗，沸水上锅，中火蒸至中心凝固并达到 71°C。','撒葱花，淋油后趁热食用。']);
add('tofu-spinach','菠菜豆腐汤','汤类',items(['tofu',165],['spinach',90],['ginger',3],['canola',8],['salt',.65]),['煮锅'],5,10,
  ['菠菜洗净切段，单独焯水后捞出。豆腐切小块。','另起一锅水煮开，先放姜与豆腐，待豆腐热透后下菠菜。','煮至再次沸腾，加油和盐即可。']);
add('chickpea-tomato','番茄鹰嘴豆浓汤','汤类',items(['chickpea',195],['tomato',110],['olive',9],['salt',.6]),['煮锅'],5,11,
  ['使用无盐、已完全煮熟的鹰嘴豆。番茄切丁。','番茄放锅中与油一起翻炒，出汁后加鹰嘴豆和少量水煮沸。','煮到豆热透，压碎少部分豆增稠，加盐。'],{cuisine:'西式轻食'});
add('lentil-soup','胡萝卜扁豆汤','汤类',items(['lentil',75],['carrot',85],['olive',9],['salt',.6],['onion',25]),['煮锅'],7,28,
  ['干扁豆挑掉杂质后冲洗，胡萝卜和洋葱切丁。','用油炒软洋葱，加扁豆、胡萝卜和足量清水。','煮沸后小火煮至扁豆全部软烂，水少时加热水，加盐。'],{cuisine:'西式轻食'});
add('soy-chicken','生抽鸡胸肉','蛋白质菜',items(['chicken',130],['canola',9],['soy',6],['garlic',3]),['炒锅'],5,9,
  ['鸡胸切均匀薄片，用生抽和蒜末拌匀。','中火下油煎鸡肉，两面翻动至中心达到 74°C。'],{flavor:'咸鲜'});

const vegetables = [
  ['broccoli',5,'掰成小朵，粗梗削去硬皮后切片'],
  ['cauliflower',6,'掰成小朵，冲洗后沥干'],
  ['carrot',8,'刷洗后切斜片'],
  ['bok',4,'掰开叶片，用流动水清洗根部泥沙'],
  ['napa',6,'菜帮和菜叶分开切，先下菜帮'],
  ['cabbage',6,'去老叶后切成宽条'],
  ['spinach',3,'洗净后切短段'],
  ['zucchini',5,'带皮刷洗后切厚片'],
  ['asparagus',5,'折去老茎后切段'],
  ['pumpkin',10,'去皮去籽切薄块'],
  ['daikon',10,'去皮后切薄片'],
  ['okra',5,'洗净，保留完整荚体防止汁液流失'],
  ['shiitake',8,'去硬蒂后切片'],
  ['whitefungi',8,'刷去泥土后切厚片'],
  ['redpepper',5,'去蒂去籽后切条'],
  ['eggplant',12,'切成粗条，随切随蒸以减少褐变'],
  ['celery',5,'抽去粗丝后斜切成段'],
  ['oystermushroom',8,'去硬蒂，撕成大小相近的条'],
] as const;

for (const [id,minutes,prep] of vegetables) {
  const name = food(id).name;
  add('boil-'+id,'清煮'+name,'蔬菜',items([id,175],['canola',8],['salt',.5]),['煮锅'],4,minutes,
    [prep+'。','水沸后下菜，保持沸腾至断生，捞出沥水。',`约 ${minutes} 分钟后检查熟度，拌入菜籽油和盐。`]);
  if (id === 'spinach') continue;
  add('steam-'+id,'蒜香蒸'+name,'蔬菜',items([id,175],['canola',8],['garlic',3],['salt',.5]),['蒸锅'],5,minutes+1,
    [prep+'。薄薄铺在耐热盘上。','撒蒜末，水沸后蒸至食材中心软熟。','出锅后将菜籽油、盐与盘内少量菜汁拌匀。'],{cuisine:'粤菜'});
}
add('cold-tomato','番茄黄瓜拌菜','蔬菜',items(['tomato',90],['cucumber',110],['olive',8],['vinegar',5],['salt',.4]),[],8,0,
  ['流动水充分清洗番茄和黄瓜，以清洁刀板切块。','临上桌前加入苹果醋、橄榄油和盐拌匀。'],{cuisine:'西式轻食',flavor:'酸香',batch:false});
add('pan-beans','蒜香四季豆','蔬菜',items(['greenbean',175],['canola',8],['garlic',4],['salt',.5]),['煮锅','炒锅'],6,14,
  ['摘去老筋，切段。沸水充分煮熟至内外软透。','热油爆香蒜，将熟豆角沥干后入锅翻炒，加盐。']);

const grainDishes = [
  ['rice','白米饭',70,22,'淘洗，按包装标注的米水比加水；煮沸后盖盖小火煮至米粒熟透'],
  ['brown','糙米饭',70,38,'淘洗，按包装操作，需浸泡时提前冷藏浸泡；煮沸后转小火焖煮至米粒软'],
  ['millet','小米饭',70,20,'淘洗后加水，煮沸转小火焖煮；水量以包装说明为准'],
  ['quinoa','煮藜麦',70,18,'流水冲洗以减少皂苷；加水煮到粒中可见白色环状胚芽'],
  ['buckwheat','荞麦米饭',70,18,'冲洗后按包装加水；小火煮至软熟并焖数分钟'],
  ['barley','煮珍珠大麦',70,35,'冲洗后加足量水煮熟，剩水沥出；需浸泡时提前冷藏浸泡'],
  ['pasta','水煮全麦意面',78,12,'水沸后下意面，轻搅防黏，按包装时间煮至软熟，沥水'],
  ['oats','燕麦粥',70,10,'加水煮沸，转小火搅拌至稠软，按燕麦包装建议调整'],
] as const;
for (const [id,name,grams,time,step] of grainDishes) {
  add('grain-'+id,name,'主食',items([id,grams]),['煮锅'],2,time,
    [`称取${food(id).name}干重。`,step+'。','整份作为一人的主食，出锅重量受用水量影响。'],{max:2.2});
}
for(const [id,name,grams,time,step] of [
  ['sweet','蒸红薯',220,18,'红薯洗净后切相同大小的块，用筷子扎透确认已熟。'],
  ['potato','蒸带皮土豆',250,18,'刷洗土豆，弃掉发芽或发绿的土豆，切厚块蒸至内心柔软。'],
  ['corn','蒸鲜玉米粒',220,12,'玉米粒洗净放浅碗中，蒸至饱满熟透。']
] as const) {
  add('grain-'+id,name,'主食',items([id,grams]),['蒸锅'],4,time,
    ['沸水上锅，盘中原料铺平以便均匀加热。',step],{max:1.65});
}
add('grain-bread','全麦面包','主食',items(['bread',95]),[],1,0,['检查包装配料及过敏提示，称取净重后分片。'],{cuisine:'西式轻食',max:1.85,batch:false});
add('grain-mix','小米糙米饭','主食',items(['brown',45],['millet',30]),['电饭煲'],4,38,
  ['糙米和小米分别淘洗，按电饭煲杂粮饭指引加水。','启动杂粮饭程序，完成后充分翻松。'],{max:2});
for (const [id,name] of [['apple','苹果'],['pear','梨'],['banana','香蕉'],['blueberry','蓝莓'],['strawberry','草莓'],['peach','黄桃'],['kiwi','猕猴桃'],['orange','橙子']] as const) {
  add('oat-'+id,name+'燕麦粥','早餐',items(['oats',70],[id,110]),['煮锅'],4,10,
    ['燕麦按包装用水，小火煮软并搅拌。',`洗净${name}，去除不可食部分，切成小块后放在熟燕麦上。`],{max:1.65,batch:false});
  add('fruit-'+id,'鲜切'+name,'水果',items([id,200]),[],4,0,
    [`用流动水清洗${name}，按需去皮或去核，称取可食部分，现切现吃。`],{min:.1,max:1.75,batch:false});
}
for (const [id,name,fruit] of [['banana','香蕉杏仁','banana'],['blueberry','蓝莓杏仁','blueberry'],['strawberry','草莓杏仁','strawberry'],['kiwi','猕猴桃杏仁','kiwi']] as const) {
  add('yogurt-'+id,name+'酸奶碗','早餐',items(['greek',195],['almond',18],[fruit,125]),[],6,0,
    ['准备原味无添加糖的酸奶和不加盐的杏仁。','水果清洗后去不可食部分，切块与酸奶、杏仁组合，现做现吃。'],{cuisine:'西式轻食',batch:false});
}
add('snack-almond','原味杏仁','加餐',items(['almond',20]),[],1,0,['检查过敏提示，称好单人份。'],{max:1.2,batch:false});
add('snack-milk','纯牛奶','加餐',items(['milk',225]),[],1,0,['选巴氏杀菌或灭菌纯牛奶，开封后按包装储存。'],{max:1.33,batch:false});

recipes.push(...quickRecipes);
export const recipeList = recipes;
export const recipeMap = new Map(recipes.map(r=>[r.id,r]));
export function serving(recipe:Recipe, factor = 1, grams?: Ingredient[]): Serving {
  const ingredients = grams ?? recipe.ingredients.map(i=>({...i,grams:Math.round(i.grams*factor*100)/100}));
  const nutrients = sum(ingredients.map(i => {
    const n = food(i.id).nutrients;
    if (macroKeys.some(key=>n[key] === null)) throw Error('食材缺少必要营养数据。');
    return scale(n as Nutrients,i.grams/100);
  }));
  return {recipe,ingredients,nutrients};
}
export function categoriesOf(recipe: Recipe) {
  return [...new Set(recipe.ingredients.flatMap(i=>food(i.id).allergens))];
}
export function alternativeRecipes(recipe: Recipe) {
  return recipes.filter(r=>r.id!==recipe.id && r.group===recipe.group).slice(0,5);
}
