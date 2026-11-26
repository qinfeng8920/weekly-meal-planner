import type {Recipe} from './catalog';

export type Method='即食'|'凉拌'|'煮'|'蒸'|'煎炒'|'炖煮'|'烤'|'复热';
export type Workflow={method:Method; activeHeat:number; cutting:0|1|2; seasoning:0|1|2; reheat?:number};
type Entry={recipe:Recipe; workflow:Workflow; placement:'早餐套餐'|'正餐套餐'|'主菜'|'蔬菜'};
const entries:Entry[]=[];
function add(id:string,name:string,placement:Entry['placement'], amounts:Record<string,number>,tools:string[],prep:number,cook:number,
    workflow:Workflow,steps:string[],cuisine='中式家常') {
  entries.push({placement,workflow,recipe:{id,name,group:placement==='蔬菜'?'蔬菜':placement==='早餐套餐'?'早餐':'蛋白质菜',
    ingredients:Object.entries(amounts).map(([id,grams])=>({id,grams})),tools,prep,cook,steps,cuisine,flavor:'清淡',
    skill:'完全不会',batch:Boolean(workflow.reheat),min:.65,max:1.65}});
}
const pot=['煮锅'],steam=['蒸锅'],pan=['炒锅'];
const boil:Workflow={method:'煮',activeHeat:2,cutting:1,seasoning:1};
const easy:Workflow={method:'凉拌',activeHeat:0,cutting:1,seasoning:1};
const stew:Workflow={method:'炖煮',activeHeat:3,cutting:1,seasoning:1,reheat:7};
const fancy:Workflow={method:'煎炒',activeHeat:12,cutting:2,seasoning:2,reheat:6};
const blank:Workflow={method:'即食',activeHeat:0,cutting:0,seasoning:0};
add('bowl-yogurt-oats','酸奶燕麦坚果碗','早餐套餐',{greek:220,oats:60,almond:16,blueberry:45},['冰箱'],4,0,blank,[
  '选包装注明可直接食用的原味燕麦片和冷藏无糖希腊酸奶。蓝莓流水冲洗，沥干。','燕麦倒入酸奶搅匀，用原味杏仁和蓝莓铺面，当餐食用。',
],'西式轻食');
add('bowl-egg-corn','鸡蛋玉米早餐碗','早餐套餐',{boiledegg:110,cookedcorn:235,walnut:17},[],4,0,blank,[
  '采用当天煮熟或正规渠道全熟即食的鸡蛋，以及无盐、包装标明可即食的熟玉米粒。','鸡蛋剥壳对半分切，与玉米、无盐核桃仁盛在一个碗中，开封后当餐吃完。',
]);
add('bowl-soy-oats','豆浆奇亚籽燕麦碗','早餐套餐',{soymilk:300,oats:75,chia:12,pumpkinseed:15},pot,1,6,
  {method:'煮',activeHeat:2,cutting:0,seasoning:0},[
  '用无糖强化钙豆浆和快熟燕麦，小火搅拌煮至燕麦软熟。','奇亚籽加入湿润热粥并充分搅匀，撒原味即食南瓜籽。',
]);
add('bowl-chicken-bread','鸡胸生菜全麦三明治','早餐套餐',{bread:108,cookedchicken:110,romaine:35,greek:28,olive:8},['冰箱'],5,0,easy,[
  '取全程冷藏的全熟原味鸡胸，拆成细丝。生菜逐叶洗净沥干。','用酸奶和橄榄油拌鸡丝，和生菜夹在全麦面包中，当餐食用。',
],'西式轻食');
add('bowl-tofu-grain','豆腐燕麦咸粥','早餐套餐',{oats:75,tofu:125,carrot:45,scallion:5,canola:6,salt:.5},pot,3,7,boil,[
  '北豆腐切小丁，胡萝卜洗净擦粗丝。','快熟燕麦与豆腐胡萝卜一起加水熬煮，豆腐热透后淋油，加盐和葱花。',
]);
add('bowl-chicken-rice','鸡胸西兰花糙米碗','正餐套餐',{cookedbrown:260,cookedchicken:130,broccoli:185,canola:10,salt:.7},pot,3,7,boil,[
  '用无盐熟糙米和安全冷藏的全熟鸡胸。西兰花洗净掰小朵，鸡胸切薄片。','锅中放少量水，先焖熟西兰花，再加米饭与鸡片盖盖充分复热至 74°C，加油盐拌匀即食。',
]);
add('bowl-tofu-corn','豆腐小白菜玉米煲','正餐套餐',{cookedcorn:280,tofu:155,bok:205,canola:12,ginger:4,salt:.6},pot,3,7,boil,[
  '小白菜洗净切短段，北豆腐切小块。锅中放姜和清水。','加无盐熟玉米和豆腐加热至 74°C，再加小白菜煮熟，加油盐调味。',
]);
add('bowl-salmon-sweet','鲑鱼红薯蒸碗','正餐套餐',{cookedsweet:310,cannedsalmon:115,broccoli:185,olive:9,lemon:8,salt:.3},steam,3,7,
  {method:'蒸',activeHeat:1,cutting:1,seasoning:1},[
  '取无盐罐装鲑鱼并挑去硬骨，红薯用无盐全熟红薯，西兰花洗净分小朵。','用浅耐热碗分区盛放，水开后上锅蒸到西兰花熟、中心达 74°C，拌入柠檬和橄榄油。',
]);
add('bowl-chickpea-salad','鹰嘴豆全麦面包沙拉碗','正餐套餐',{chickpea:150,bread:82,romaine:130,tomato:95,olive:12,vinegar:7},[],6,0,easy,[
  '开封无盐熟鹰嘴豆并沥水，生菜逐叶冲洗，番茄洗净切块。','面包撕成小块，与豆和蔬菜拌匀，现吃前加入橄榄油和醋。',
],'西式轻食');
add('bowl-salmon-corn','鲑鱼玉米脆蔬碗','正餐套餐',{cannedsalmon:110,cookedcorn:275,cucumber:110,redpepper:100,olive:13,vinegar:5},[],6,0,easy,[
  '开封可即食的无盐熟玉米和无盐罐装鲑鱼，沥去汁液并检查有无硬骨。','黄瓜和彩椒洗净切丁，当餐与鱼和玉米拌匀，再加橄榄油和醋。',
],'西式轻食');
add('bowl-lentil-rice','番茄扁豆糙米炖锅','正餐套餐',{lentil:65,cookedbrown:165,tomato:155,carrot:100,olive:12,onion:35,salt:.7},pot,6,32,stew,[
  '冲洗干扁豆，番茄、胡萝卜和洋葱切小块。','锅中用少量橄榄油炒软洋葱，加入扁豆番茄胡萝卜与足量清水，小火煮软。','最后拌进无盐熟糙米，确认整体再次充分加热至 74°C，加盐。',
]);
add('bowl-quinoa-chicken','鸡胸藜麦南瓜炖锅','正餐套餐',{quinoa:95,chicken:140,pumpkin:170,bok:80,canola:12,ginger:5,salt:.7},pot,7,26,stew,[
  '藜麦淘洗，南瓜切小块。用生肉专用刀板把鸡胸切成均匀薄片。','锅中加姜、藜麦、南瓜和清水，煮至藜麦将熟，再加入鸡片和洗净的小白菜。','确认鸡片中心 74°C 且菜熟后加油盐，当餐吃或安全冷却备餐。',
]);
add('bowl-beef-millet','牛肉蘑菇小米烩锅','正餐套餐',{millet:90,beef:120,whitefungi:135,carrot:100,canola:13,pepper:.5,salt:.7},pot,7,27,stew,[
  '小米淘洗，蘑菇和胡萝卜洗净切片，整切牛肉逆纹切薄片。','小米和胡萝卜加水煮软，加入蘑菇煮透后下牛肉薄片。','用温度计确认牛肉至少 63°C，静置 3 分钟后调味食用。',
]);
add('braised-ginger-chicken','姜菇焖鸡腿','主菜',{thigh:145,shiitake:90,onion:45,ginger:8,canola:8,salt:.7},pot,6,38,stew,[
  '鸡腿肉用生肉刀板切成均匀小块，鲜香菇去蒂，洋葱切片。','锅中加油炒香姜与洋葱，放鸡腿与香菇，少量水焖煮到鸡肉中心 74°C。','关火再加盐。提前做时分浅盒快速冷却，食用时充分复热。',
]);
add('braised-carrot-chickpea','胡萝卜香料炖鹰嘴豆','主菜',{chickpea:190,carrot:120,tomato:110,cumin:1,turmeric:.7,olive:9,salt:.6},pot,8,27,stew,[
  '胡萝卜与番茄切成小块，无盐熟鹰嘴豆沥水。','锅中温油轻炒孜然与姜黄，加胡萝卜、番茄和水小火炖软。','放鹰嘴豆煮至中心热透，调入盐。',
]);
add('seared-herb-salmon','香草煎鲑鱼配芦笋','主菜',{salmon:140,asparagus:100,lemon:15,olive:8,pepper:.6,salt:.6},pan,10,13,fancy,[
  '鱼排去刺，用柠檬与黑胡椒短时间调味。芦笋去除老茎，切等长段。','中火煎鱼两面，按鱼排厚度调整至中心 63°C。','用另一侧余温煎芦笋至熟，摆盘，加柠檬和少量盐。',
],'西式轻食');
add('seared-beef-mushroom','香煎牛肉配口蘑洋葱','主菜',{beef:135,whitefungi:110,onion:45,olive:9,pepper:.6,salt:.6},pan,12,14,fancy,[
  '整切牛肉逆纹切条，口蘑切片，洋葱切丝。','先炒香口蘑洋葱盛出，锅中另煎牛肉至中心 63°C 后静置 3 分钟。','合盘加盐、黑胡椒，立即食用。',
],'西式轻食');
add('seared-tofu-sesame','芝麻香煎豆腐与彩椒','主菜',{tofu:170,redpepper:110,sesameseed:6,canola:8,soy:4},pan,10,14,fancy,[
  '北豆腐切片吸去水分，彩椒洗净去籽切宽条。芝麻轻干炒后倒出。','用油把豆腐煎至两面金黄且内里热透，放入彩椒煎至断生。','加入生抽与少量水短时收汁，最后撒芝麻。',
]);
add('roasted-root-vegetables','烤胡萝卜南瓜花菜','蔬菜',{carrot:90,pumpkin:100,cauliflower:65,olive:8,cumin:1,salt:.5},['烤箱'],9,30,
  {method:'烤',activeHeat:3,cutting:2,seasoning:2},[
  '将南瓜、花菜、胡萝卜清洗处理，分别切成便于同熟的小块。与油、孜然和盐抓匀。','烤箱按设备预热，置烤盘摊开，约 200°C 烤至柔软，中途翻动一次。',
],'西式轻食');

add('bowl-tofu-brown','小白菜豆腐糙米煲','正餐套餐',{cookedbrown:245,tofu:155,bok:210,canola:12,ginger:4,salt:.6},pot,3,7,boil,[
  '采用当天煮熟或按安全要求冷却的无盐熟糙米。小白菜逐叶洗净，豆腐切薄块。',
  '姜片随少量水煮开，下豆腐和米饭，再下小白菜煮熟。确认中心达到 74°C，调油盐后立即食用。',
]);
add('bowl-shrimp-brown','西兰花虾仁糙米碗','正餐套餐',{cookedbrown:260,shrimp:135,broccoli:195,canola:12,ginger:5,salt:.6},steam,4,9,boil,[
  '用无盐熟糙米。西兰花洗净掰小朵，虾仁用专用砧板挑虾线，处理完洗手并清洁器具。',
  '浅盘分区铺熟糙米、西兰花和虾仁，放姜丝。水开后蒸至虾仁不透明、米饭中心达到 74°C。',
  '加入菜籽油和盐，立即食用。',
]);
add('bowl-beef-brown','番茄牛肉糙米锅','正餐套餐',{cookedbrown:245,beef:105,tomato:130,carrot:95,canola:10,ginger:5,salt:.65},pot,5,13,boil,[
  '胡萝卜和番茄洗净切薄，生牛肉放在独立刀板上逆纹切薄片。',
  '煮锅内少量油炒番茄，加胡萝卜和清水煮软。加入无盐熟糙米，煮到米饭中心达到 74°C。',
  '牛肉滑入锅中，确认中心达到 63°C，关火静置 3 分钟，加盐后食用。',
]);
add('bowl-chicken-corn','鸡胸胡萝卜玉米碗','正餐套餐',{cookedcorn:290,cookedchicken:125,carrot:95,bok:125,canola:12,ginger:3,salt:.6},pot,3,8,boil,[
  '小白菜洗净切段，胡萝卜擦粗丝，使用全程冷藏的原味熟鸡胸和无盐熟玉米。',
  '锅内加少量水与姜，先焖熟胡萝卜和小白菜，再放入玉米和鸡胸加热至中心 74°C。',
  '油盐拌匀，立即食用。',
]);

export const cookingRecipes=entries.map(e=>e.recipe);
export const cookingWorkflows=new Map(entries.map(e=>[e.recipe.id,e.workflow]));
export const cookingPlacements=new Map(entries.map(e=>[e.recipe.id,e.placement]));
