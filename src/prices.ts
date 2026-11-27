import {foods} from './catalog';

export const priceUnits=['斤','公斤','克','升','毫升','个','盒','袋','瓶'] as const;
export type PriceUnit=typeof priceUnits[number];
export type PriceInput={amount:number;unit:PriceUnit;basis:'净重'|'毛重';pack?:number;unitGrams?:number;yieldPercent?:number;note?:string;date?:string};
export type PriceBook=Record<string,PriceInput>;
export type Price=PriceInput&{id:string;region:string;kind:'监测'|'类别参考'|'估算'|'用户自定义';source:string;url?:string};
export const references={
  gd:'https://cif.mofcom.gov.cn/newsite/html/guangdong/html/22402610/2026/11/18/1794964304225.html',
  sz:'https://cif.mofcom.gov.cn/newsite/html/shenzhen/html/24454065/2026/11/18/1794964937237.html',
  jm:'https://cif.mofcom.gov.cn/newsite/html/guangdong/html/687017/2026/11/23/1795395923089.html',
};
const prices:Record<string,Price>={};
function add(id:string,amount:number,unit:PriceUnit,kind:Price['kind'],source:string,options:Partial<PriceInput>={},local?:keyof typeof references) {
  prices[id]={id,amount,unit,kind,source,region:local==='sz'?'广东深圳':local==='jm'?'广东江门':'广东',
    date:local==='jm'?'2026-11-23':local?'2026-11-18':'2026-11-26',basis:'净重',...options,...(local?{url:references[local]}:{})};
}
const monitor=(id:string,value:number,unit:PriceUnit,local:'sz'|'jm',name:string,options:Partial<PriceInput>={})=>
  add(id,value,unit,'监测',name,options,local);
const assumed=(id:string,amount:number,unit:PriceUnit='斤',options:Partial<PriceInput>={})=>
  add(id,amount,unit,'估算','用户提供的初始化参考或本项目编制估算',options);

monitor('broccoli',5.41,'斤','sz','深圳市商务局 · 西兰花',{basis:'毛重',yieldPercent:85});
monitor('daikon',1.81,'斤','sz','深圳市商务局 · 白萝卜',{basis:'毛重',yieldPercent:90});
monitor('mandarin',4.65,'斤','sz','深圳市商务局 · 柑橘监测值换算并四舍五入',{basis:'毛重',yieldPercent:72});
monitor('pear',5.65,'斤','sz','深圳市商务局 · 梨',{basis:'毛重',yieldPercent:88});
monitor('rice',3.10,'斤','sz','深圳市商务局 · 大米监测值换算并四舍五入');
monitor('canola',18.12,'升','sz','深圳市商务局 · 菜籽油',{unitGrams:920});
monitor('shrimp',40.49,'斤','sz','深圳市商务局 · 对虾监测参考（按带壳商品估算）',{basis:'毛重',yieldPercent:55});
monitor('peanutoil',25.39,'升','sz','深圳市商务局 · 花生油',{unitGrams:920});
for(const [id,price,name,yieldPercent] of [
  ['apple',8.03,'苹果',88],['banana',2.82,'香蕉',65],['orange',5.83,'橙子',72],
  ['grape',11.36,'葡萄',92],['watermelon',3.23,'西瓜',62],
] as const) monitor(id,price,'斤','jm','江门市商务局 · '+name,{basis:'毛重',yieldPercent});
add('egg',6.4,'斤','类别参考','广东省商务厅 · 蛋类零售均价',{basis:'毛重',yieldPercent:88},'gd');
add('beef',49,'斤','类别参考','江门市商务局 · 牛肉项目 48.90 元/斤，瘦牛肉使用用户设定的近似值',{},'jm');

const base:Record<string,number>={chicken:15,thigh:16,pork:20,bass:20,tofu:4,softtofu:4,spinach:6,tomato:5,
  redpepper:7,yellowpepper:7,potato:3,sweet:3.5,brown:8,oats:12,tilapia:15,salmon:65,cod:68,trout:40,
  tuna:55,mackerel:22,scallop:55,squid:27,turkey:28,chickpea:19,quinoa:25,buckwheat:10,barley:8,millet:8,pasta:18,
  bread:16,cookedbrown:15,cookedsweet:10,cookedcorn:9,boiledegg:12,cookedchicken:28,cannedsalmon:60,
  enoki:7,whitefungi:12,shiitake:15,oystermushroom:10,strawberry:25,blueberry:45,kiwi:12,avocado:20,pomegranate:10,
  pumpkinseed:48,chia:68,flax:32,peanut:14,sesameseed:26,milk:9,cheese:48,olive:45,sesameoil:55,
  soy:10,salt:4,pepper:85,vinegar:5,ricevinegar:5,ginger:8,garlic:7,scallion:5,cilantro:10,lemon:12,cinnamon:45,cumin:36,turmeric:25};
for(const [id,price] of Object.entries(base)) assumed(id,price,'斤',id==='bass'?{basis:'毛重',yieldPercent:50}:id==='oats'?{pack:500}:{});
assumed('soymilk',8,'升',{unitGrams:1000});
assumed('yogurt',20,'公斤');
assumed('greek',20,'公斤');
for(const id of ['almond','walnut','cashew','pistachio','hazelnut']) assumed(id,60);
for(const f of foods) {
  if(prices[f.id]) continue;
  if(f.subcategory&&(f.category==='蔬菜'||f.category==='水果')) {
    assumed(f.id,f.category==='蔬菜'?5:12,'斤');
  } else if(f.category==='蔬菜'||f.category==='水果') {
    const vegetable=f.category==='蔬菜';
    add(f.id,vegetable?8.4:11.4,'公斤','类别参考',
      '广东省商务厅 · '+(vegetable?'蔬菜':'水果')+'零售均价折作预算参考',{basis:'毛重',yieldPercent:vegetable?88:78},'gd');
  } else {
    const estimate:Record<string,number>={肉类:48,鱼虾:46,蛋:20,豆制品:16,主食:15,乳制品:25,坚果种子:100,调味品:30};
    assumed(f.id,(estimate[f.category]??16)/2);
  }
}
export const priceDefaults:Readonly<Record<string,Price>>=prices;

export function priceFor(id:string,book:PriceBook,legacy?:{price?:number;pack?:number;yieldPercent?:number},defaults:Readonly<PriceBook>=priceDefaults):Price|undefined {
  const edit=book[id];
  if(edit) return {id,region:edit.note?.trim()||'本地',kind:'用户自定义',source:'本机录入',...edit};
  if(legacy?.price!==undefined) return {id,region:'本地',kind:'用户自定义',source:'旧版单价',
    amount:legacy.price,unit:'公斤',basis:legacy.yieldPercent?'毛重':'净重',pack:legacy.pack,yieldPercent:legacy.yieldPercent};
  const base=defaults[id] as Price|undefined;
  if(!base)return;
  // 旧版保存的正数可食率或包装优先保留，计价方式仍以参考商品的口径为准。
  return {...base,pack:legacy?.pack??base.pack,
    ...(base.basis==='毛重'&&legacy?.yieldPercent?{yieldPercent:legacy.yieldPercent}:{})};
}
export const gramsPerPriceUnit=(p:PriceInput)=>({斤:500,公斤:1000,克:1,升:p.unitGrams,毫升:p.unitGrams,个:p.unitGrams,盒:p.unitGrams,袋:p.unitGrams,瓶:p.unitGrams})[p.unit];
export const edibleRate=(p?:PriceInput)=>p?.basis==='毛重'?(p.yieldPercent??0)/100:1;
export function amountFor(grams:number,p?:PriceInput):number|null {
  if(grams===0)return 0;
  const unit=p&&gramsPerPriceUnit(p);
  return p&&unit&&Number.isFinite(p.amount)?Math.round(grams/unit*p.amount*100)/100:null;
}

export function purchaseGrams(quantity:number,unit:PriceUnit,price?:PriceInput,gramsPerUnit?:number) {
  const weight={克:1,公斤:1000,斤:500} as Record<string,number>;
  let factor:number|undefined=weight[unit]??gramsPerUnit;
  if(factor===undefined&&price) {
    if(price.unit===unit)factor=gramsPerPriceUnit(price);
    if(unit==='升'&&price.unit==='毫升')factor=price.unitGrams===undefined?undefined:price.unitGrams*1000;
    if(unit==='毫升'&&price.unit==='升')factor=price.unitGrams===undefined?undefined:price.unitGrams/1000;
  }
  return factor&&factor>0&&Number.isFinite(factor)&&Number.isFinite(quantity)?quantity*factor:undefined;
}
