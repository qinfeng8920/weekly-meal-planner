import {buildSubstitutionVariants,recipeBaseId,type Replacement} from './substitution';
import {cookingRecipes} from './cooking-recipes';
import {quickRecipes} from './quick-recipes';
import data from './foods.json';
import expansion from './foods-v24.json';
import mext from './foods-mext-v24.json';
import lowSodiumSalt from './low-sodium-salt.json';
import {macroKeys, scale, sum, type Nutrients} from './nutrition';
import planningData from './food-planning-nutrients.json';

export type Food = {id:string;name:string;category:string;fdc?:number;description:string;state:string;
  allergens:string[];aliases:string[];nutrients:Record<keyof Nutrients,number|null>;sourceUrl?:string;subcategory?:string;sodiumUpperBound?:number};
export const planningNutrition=planningData as Record<string,{verified:boolean;sodium:number|null;additions:Partial<Nutrients>}>;
export const foods:Food[] = [...data,...expansion,...mext,lowSodiumSalt].map(f=>{
  return {...f,nutrients:{...f.nutrients,...planningNutrition[f.id]?.additions}};
});
export const hasPlanningNutrition=(f:Food)=>Boolean(planningNutrition[f.id]?.verified&&planningNutrition[f.id]?.sodium!=null&&
  macroKeys.every(key=>typeof f.nutrients[key]==='number'&&Number.isFinite(f.nutrients[key])&&f.nutrients[key]>=0));
export const foodMap = new Map(foods.map(f=>[f.id,f]));
export const food = (id: string) => {
  const value = foodMap.get(id);
  if (!value) throw Error('食材不存在。');
  return value;
};
export const foodState: Record<string,string> = {raw:'生鲜可食部',dry:'干重',cooked:'熟重',ready:'成品净重',frozen:'冷冻净重'};
export const catalogVersion = '2026.11-nutrients2';
export type Ingredient = {id:string; grams:number};
export type Group = '蛋白质菜'|'蔬菜'|'主食'|'早餐'|'水果'|'加餐'|'汤类';
export type Recipe = {
  id:string; name:string; group:Group; ingredients:Ingredient[]; tools:string[]; prep:number; cook:number;
  steps:string[]; cuisine:string; flavor:string; skill:string; batch:boolean; min:number; max:number;baseId?:string;replacements?:Replacement[];
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

recipes.push(...quickRecipes,...cookingRecipes);
const fruitPrep:Record<string,string>={
  pomelo:'剥去厚皮、内膜和籽，称果肉。',sapodilla:'选已成熟变软的果实，去皮并剔除硬籽。',
  lychee:'剥壳去核，只称果肉。',longan:'剥壳去核，只称果肉。',passionfruit:'剖开取果浆和籽，果壳丢弃。',
  pitaya:'对半切开，挖取果肉，外皮弃掉。',bayberry:'去掉果梗，慢慢吃并吐出果核。',
  loquat:'去皮、去核与内膜，只称果肉。',persimmon:'选成熟无涩味的甜柿，去蒂和种子。',
  jackfruit:'掰出成熟果苞，剔除核与纤维。',sweetcherry:'摘梗并去核。',guava:'用清洁刀具切片，弃去不食用的硬籽及边角。',
};
for(const f of foods.filter(f=>f.category==='水果'&&f.state==='raw'&&f.id!=='quince'&&
  macroKeys.every(k=>f.nutrients[k]!==null)&&!recipes.some(r=>r.group==='水果'&&r.ingredients.some(i=>i.id===f.id)))) {
  add('fruit-'+f.id,'鲜食'+f.name,'水果',items([f.id,200]),[],4,0,
    ['在流动水下洗净果实，使用干净的刀和砧板。',fruitPrep[f.id]??'摘除果梗及不可食部分，按可食净重称量，现做现吃。'],
    {min:.1,max:1.75,batch:false});
}
for(const [id,minutes,prep] of [
  ['loofah',7,'用不苦的嫩丝瓜去皮并切滚刀块'],['kohlrabi',8,'剥去硬皮，切成薄片'],
  ['butterlettuce',3,'剥开并洗净菜心，沥干'],['redlettuce',3,'掰开叶片冲洗并切段'],
  ['crimini',8,'刷净蘑菇，切成厚片'],['lotusroot',12,'莲藕削皮，切成半厘米片'],
  ['butternut',14,'去皮去籽，切成宽两厘米的薄块'],
  ['maitake',9,'切除带泥的根部，撕开菌簇'],['mungsprout',6,'冲洗并弃去腐烂豆芽'],
  ['brussels',9,'剥去老叶，从根部纵切成两半'],['chayote',8,'削皮去籽，切薄片'],
  ['collards',10,'洗净后抽掉粗梗，把叶片切成短条'],['chard',6,'菜梗与叶片分开洗净切段'],
] as const) {
  add('v24-boil-'+id,'清煮'+food(id).name,'蔬菜',items([id,175],['canola',8],['salt',.45]),['煮锅'],6,minutes,
    [prep+'。','待水沸后下菜，小火保持沸腾。',`约 ${minutes} 分钟检查，煮至全部熟透再捞出，拌油和盐。`]);
}
for(const id of ['carp','haddock','halibut','catfish','drumstick','ducklean','porkleg','porkshoulder']) {
  const f=food(id);
  const poultry=['drumstick','ducklean'].includes(id);
  const fish=f.category==='鱼虾';
  const minutes=fish?10:poultry?15:13;
  add('v24-steam-'+id,'姜丝蒸'+f.name,'蛋白质菜',items([id,145],['ginger',5],['scallion',6],['canola',8],['salt',.5]),
    ['蒸锅'],7,minutes,[fish?'用去骨鱼柳，逐片检查残刺，整齐铺盘。':'去骨后切成厚度一致的薄块，生熟案板分开。',
      '把姜切细丝，与盐一起撒在食材上，沸水上锅。',
      `约 ${minutes} 分钟后先确认最厚处${poultry?'达到 74°C':fish?'达到 63°C':'达到 63°C 后静置 3 分钟'}。撒葱淋油后食用。`],{cuisine:'粤菜'});
}
for(const id of ['quailegg','duckegg','gooseegg']) {
  const minutes=id==='quailegg'?5:id==='duckegg'?13:18;
  add('v24-egg-'+id,'水煮'+food(id).name,'蛋白质菜',items([id,100]),['煮锅'],2,minutes,
    ['新鲜全蛋带壳冷水下锅，水盖过蛋。',`水沸后保持小沸约 ${minutes} 分钟。剥开检查蛋黄与蛋白都凝固，未全熟则继续加热。`]);
}
add('v24-cornmeal','玉米面粥','主食',items(['cornmeal',65]),['煮锅'],3,18,
  ['取约六倍重量的水，留一部分冷水把玉米粉调匀。','其余水煮沸后缓缓倒入粉浆，边倒边搅拌。','小火约 15～18 分钟，经常搅底，煮至均匀稠滑且无生粉味。'],{max:2});
add('v24-taro','蒸去皮芋头','主食',items(['taro',225]),['蒸锅'],6,22,
  ['用水刷洗芋头，戴手套削皮，切成大小相近的小块，按生净重称量。','水开后把芋头薄铺于蒸盘，约 22 分钟后用筷子检查。','持续加热至每块中心都软透，再与主菜一起食用。'],{batch:false,max:1.6});
add('v24-sticky','清蒸糯米饭','主食',items(['sticky',65]),['蒸锅'],4,40,
  ['糯米洗净，按包装说明提前冷藏浸泡，沥掉泡米水。','沸水上锅蒸，按实际软硬检查米粒中心是否熟透。','用清洁筷子翻松并趁热食用。'],{max:2,batch:false});
add('v24-soup-lotus','莲藕豆腐汤','汤类',items(['lotusroot',135],['tofu',165],['ginger',5],['salt',.6],['canola',7]),['煮锅'],7,20,
  ['莲藕削皮切薄片，豆腐切成小块，姜切片。','清水煮沸，放莲藕和姜片，煮至藕片柔软后放豆腐。','继续小火加热至豆腐中心热透，加入油盐，连汤和食材一起食用。'],{cuisine:'粤菜'});
add('v24-pumpkin-chicken','鸡腿南瓜煲','蛋白质菜',items(['butternut',130],['drumstick',145],['ginger',4],['salt',.55],['canola',8]),['煮锅'],9,20,
  ['鸡小腿去皮去骨切小块，分开用洁净刀板给南瓜去皮去籽切块。','锅里加油和姜，放鸡肉翻动至表面变色，再加南瓜和少量水盖锅焖煮。','中心达到 74°C 且南瓜软熟后加盐，汤汁随菜食用。'],{cuisine:'粤菜'});
add('v24-greek0','原味无脂希腊酸奶','加餐',items(['greek0',170]),[],1,0,
  ['选包装标注无添加糖的原味产品。用干净勺称重，按包装要求冷藏。'],{batch:false});
for(const id of ['macadamia','pecan','sunflowerseed','pinenut'])
  add('v24-nut-'+id,food(id).name,'加餐',items([id,20]),[],1,0,
    ['选无加盐、无糖且包装标注可直接食用的产品，核对过敏提示，按净重称量。'],{batch:false,max:1.2});
add('v24-tomato-cucumber','小番茄凉拌黄瓜','蔬菜',items(['cherrytomato',100],['cucumber',100],['vinegar',6],['olive',8],['salt',.4]),[],6,0,
  ['流水清洗小番茄和黄瓜。用清洁砧板把小番茄切四瓣，黄瓜纵切再切块。','临吃时加苹果醋、橄榄油和盐拌匀。'],{batch:false});
add('v24-mushroom-egg','蘑菇蒸蛋羹','蛋白质菜',items(['crimini',70],['egg',110],['salt',.45],['canola',5]),['蒸锅'],7,18,
  ['用湿布擦净鲜蘑菇，切薄片，先用浅盘蒸至软熟。','全蛋打散，加入约等重的温水和盐，把蘑菇放入蛋液。','浅碗中继续蒸至中心凝固并达到 71°C，最后淋上菜籽油。'],{cuisine:'粤菜'});
add('v24-guava-cottage','番石榴茅屋奶酪碗','加餐',items(['guava',75],['cottage2',100]),[],5,0,
  ['挑成熟番石榴，流水洗净，切去不食用的蒂、硬籽和边角，按净重切丁。','选巴氏杀菌牛奶制作的即食奶酪，按重量加入碗中，现拌现吃。'],{batch:false,cuisine:'西式轻食'});
add('v24-chayote-tofu','佛手瓜豆腐汤','汤类',items(['chayote',140],['tofu',165],['ginger',4],['canola',7],['salt',.5]),['煮锅'],8,16,
  ['佛手瓜洗净，削掉外皮，剖开去籽切薄片。豆腐切小块，姜切细片。','把瓜片和姜下入沸水，小火煮到瓜片半透明，加入豆腐煮透。','加油和盐，连汤食用。'],{cuisine:'粤菜'});
add('v24-white-bean-tomato','小番茄白芸豆煮菜','蛋白质菜',items(['navyready',195],['cherrytomato',120],['olive',8],['salt',.45]),['煮锅'],5,12,
  ['选无盐且已彻底煮熟的白芸豆，沥去保存液。小番茄流水洗净并切四瓣。','小番茄和油放入锅中，加少量水炖出汁后倒入熟白芸豆。','煮沸后轻压一部分豆子使汤汁浓稠，小火煮透，加盐。'],{cuisine:'西式轻食'});
export const recipeList = recipes;
const fruitByIngredient=new Map<string,Recipe[]>();
for(const recipe of recipes) if(recipe.group==='水果') {
  const id=recipe.ingredients[0].id;
  const group=fruitByIngredient.get(id);
  if(group)group.push(recipe);
  else fruitByIngredient.set(id,[recipe]);
}
export const baseRecipeList=recipes.filter(r=>r.group!=='水果'||fruitByIngredient.get(r.ingredients[0].id)?.[0]===r);
export function fruitPreparations(recipe:Recipe) {
  return recipe.group==='水果'?(fruitByIngredient.get(recipe.ingredients[0].id)??[]).filter(r=>r.id!==recipe.id):[];
}
export const recipeVariants=new Map(recipes.map(r=>[r.id,[r,...buildSubstitutionVariants(r,food)]]));
export const recipeMap = new Map([...recipeVariants.values()].flat().map(r=>[r.id,r]));
export const variantsOf=(recipe:Recipe)=>recipeVariants.get(recipeBaseId(recipe))??[recipe];
export function serving(recipe:Recipe, factor = 1, grams?: Ingredient[]): Serving {
  const ingredients = grams ?? recipe.ingredients.map(i=>({...i,grams:Math.round(i.grams*factor*100)/100}));
  const nutrients = sum(ingredients.map(i => {
    const n = food(i.id).nutrients;
    if (macroKeys.some(key=>n[key] == null)) throw Error('食材缺少必要营养数据。');
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
