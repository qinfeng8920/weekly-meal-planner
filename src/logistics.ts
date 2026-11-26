import {actualLots,consumedBySource,taskKey,type Execution} from './execution';
import {cookOnServingDay,requiresCooling,riceFoods,storageDays} from './food-storage';
import {food,foodState,type Serving} from './catalog';
import {addDays,splitWeek,supplyDefaults,type Range,type SupplySettings} from './batches';
import {amountFor,edibleRate,gramsPerPriceUnit,priceDefaults,priceFor,type Price,type PriceBook} from './prices';
import {cookingRule,type CookingSelection} from './cooking-profile';
import {mealCooking,recipeCooking} from './cooking';
import type {MealName,Profile} from './profile';
import type {Day,Pantry} from './shopping';

export type Receipt={gross:number;net:number;paid?:number;paidGross?:number;date?:string;storage?:import('./execution').StockInfo};
export type SupplyState={settings?:SupplySettings;prices?:PriceBook;receipts?:Record<string,Receipt>;execution?:Execution};
export type Cost={known:number;missing:number;items:number};
export type Use={day:number;meal:string;dish:string; grams:number;prepAt:number;method:string;jobKey?:string;sourcing?:{home:number;carry:number;forecast:number;taken:number}};
export type BuyLine={id:string;uses:Use[];need:number;stock:number;carry:number;buy:number;remaining:number;confirmed:number;netConfirmed:number;
  leftover:number;receiptDate?:string;receiptStorage?:import('./execution').StockInfo;price?:Price;consume:number|null;estimate:number|null;paid:number|null;paidActual?:number;paidGross?:number;paidEstimated:boolean;cost:Cost;bill:Cost;receiptKey:string};
export type BuyBatch={day:number;date:string;lines:BuyLine[];purchase:Cost;consumed:Cost;paid:Cost;remaining:Cost};
export type PrepJob={key?:string;day:number;at:number;name:string;meal:string;method:string;active:number;waiting:number;reheat?:number;tools:string[];steps:string[];ingredients:{id:string;grams:number}[]};
export type PrepBatch={range:Range;start:string;end:string;prepDate:string;purchaseDate:string;
  rows:{id:string;uses:Use[];grams:number}[];jobs:PrepJob[];active:number;waiting:number;boxes:number;tools:string[];sessions?:{date:string;active:number;waiting:number;total:number}[]};
export type Logistics={settings:SupplySettings;start:string;people:number;batches:BuyBatch[];prep:PrepBatch[];notice:string[];
  consumed:Cost;purchase:Cost;paid:Cost;remaining:Cost;categories:Record<string,Cost>;lines:BuyLine[];budget:number|null;
  checked:number;toBuy:number;inventory:{id:string;home:number;confirmed:number;projected:number;usable?:number;taken?:number}[]};

const round=(n:number)=>Math.round(n*100+1e-8)/100;
const blank=():Cost=>({known:0,missing:0,items:0});
function addCost(total:Cost,value:number|null) {
  total.items++;if(value===null)total.missing++;else total.known=round(total.known+value);
}
function mergeCost(total:Cost,other:Cost) {
  total.known=round(total.known+other.known);total.items+=other.items;total.missing+=other.missing;
}
export const receiptKey=(start:string,day:number,id:string)=>start+'|'+day+'|'+id;

const isRawAnimal=(id:string)=>food(id).state==='raw'&&['肉类','鱼虾'].includes(food(id).category);

export function planLogistics(days:Day[],p:Profile,start:string,pantry:Pantry={},state:SupplyState={},cookingOverride?:CookingSelection, defaults:Readonly<PriceBook>=priceDefaults):Logistics {
  const settings=state.settings??supplyDefaults(p), ranges=splitWeek(settings,days.length);
  const fridge=p.tools.includes('冰箱'), freezer=fridge&&p.tools.includes('冷冻室')&&p.frozen, people=Number(p.people);
  const all=new Map<string,Use[]>();
  const jobsByDate:PrepJob[][]=Array.from({length:ranges.length},()=>[]);
  const batchFor=(day:number)=>ranges.findIndex(r=>r.from<=day&&day<r.to);
  const batchJobs=(day:number)=>jobsByDate[batchFor(day)];
  const notice=[
    '生熟分开。准备熟食后尽快分入浅盒冷却，2 小时内冷藏至 4°C 或冷冻至 −18°C，环境超过 32°C 时缩短到 1 小时。',
    '熟米饭尽量在 1 小时内冷却。冷藏后须在 24 小时内食用，否则当天冷冻或改为现煮。熟食一次性复热到中心 74°C。',
    '绿叶菜当天洗切。提前加工鱼虾时优先分装冷冻生料，食用前一晚移到冰箱冷藏室解冻，再现做。',
    '冷藏食品以包装保质期与开封说明为准。已开封或储存日期不明的库存请先核对。解冻和冷却的自然等待不计入锅具用时。',
  ];
  if(!fridge)notice.unshift('没有冰箱。保留所选批次用于规划，易腐食品改为当天采购和现做。');
  else if(!freezer)notice.unshift('没有可用冷冻条件。较晚用到的易腐食品会另列采购和现做日期，备餐批次仍保持所选周期。');

  function schedule(row:Serving,day:number,at:number,meal:string,requested:boolean,allow:boolean) {
    const ingredients=row.ingredients.map(i=>({id:i.id,grams:round(i.grams*people)}));
    const nutritionIds=ingredients.map(i=>i.id);
    const withRice=nutritionIds.some(id=>riceFoods.has(id));
    const mustCookFresh=nutritionIds.some(cookOnServingDay);
    const animal=nutritionIds.some(isRawAnimal);
    const cooking=recipeCooking(row.recipe);
    let method='当天现做', prepAt=day;
    if(cooking.total===0||row.recipe.cook===0)method='当天开封或洗切';
    if(fridge&&requested&&!mustCookFresh) {
      prepAt=day-1;
      method=withRice?'前一天制作，24 小时内冷藏食用':'前一天制作冷藏';
    } else if(fridge&&allow&&at<day&&row.recipe.batch&&row.recipe.cook>0&&!mustCookFresh) {
      const daysAhead=day-at;
      if(freezer&&(withRice||daysAhead>1)) {prepAt=at;method='熟后分盒冷冻';}
      else if(daysAhead===1&&!withRice) {prepAt=at;method='前一天制作冷藏';}
    }
    if(fridge&&freezer&&animal&&prepAt===day&&at<day)method='按份冷冻生料或当日采购，现做';
    const steps=[...row.recipe.steps];
    if(method.includes('冷藏')&&prepAt<day) steps.push(withRice?'食用前 24 小时内制作，熟饭 1 小时内冷却并在 ≤4°C 冷藏。时间无法保证时改当天煮。':'熟食分浅盒，2 小时内冷藏。');
    if(method==='熟后分盒冷冻')steps.push(withRice?'熟饭尽量在 1 小时内分盒冷却后冷冻，标食用日。':'2 小时内分盒冷却并冷冻，标食用日。');
    if(prepAt<day)steps.push('食用当天只复热一次，中心达到 74°C。');
    if(method.includes('冷冻'))steps.push('已冷冻时，食用前一晚移至冰箱冷藏室解冻，生料和熟食分开。');
    if(method.includes('冷冻生料'))steps.unshift('生料单独密封，按该餐净重分装。腌制只在冷藏室进行，食谱无腌制步骤则直接烹调。');
    const factor=Math.max(1,1+(people-1)*.25);
    return {job:{key:taskKey(start,day,meal,row.recipe.id),day,at:prepAt,name:row.recipe.name,meal,method,active:Math.ceil(cooking.active*factor),
      waiting:cooking.wait,...(prepAt<day?{reheat:cooking.reheat??5}:{}),tools:row.recipe.tools,steps,ingredients},needsAt:prepAt};
  }

  days.forEach((day,index)=>{
    const range=ranges[batchFor(index)];
    day.meals.forEach(meal=>{
      const name=meal.name as MealName;
      const rule=cookingRule(p,name,index,cookingOverride);
      const perMeal=p.cooking?.days?.[index]?.[name as '午餐']?.prep??p.cooking?.meals?.[name as '午餐']?.prep
        ??p.mealPreferences?.[name as '午餐']?.prep??settings.prep!=='每天';
      const ahead=mealCooking(meal.dishes.map(s=>s.recipe),rule,fridge).ahead;
      meal.dishes.forEach(dish=>{
        const {job,needsAt}=schedule(dish,index,range.prepAt,meal.name,ahead.some(a=>a.name===dish.recipe.name),perMeal);
        batchJobs(index).push(job);
        for(const i of job.ingredients) {
          const uses=all.get(i.id)??[];
          uses.push({day:index,meal:meal.name,dish:dish.recipe.name,grams:i.grams,prepAt:needsAt,method:job.method,jobKey:job.key});
          all.set(i.id,uses);
        }
      });
    });
  });

  const receipts=state.receipts??{};
  const execution=state.execution;
  const spent=consumedBySource(execution);
  const available=execution?actualLots(start,p,pantry,receipts,execution):[];
  const priorUses=new Map<string,Map<string,number>>();
  for(const [key,entry] of Object.entries(execution?.tasks??{})) if(entry.taken) {
    const tally=new Map<string,number>();
    for(const item of entry.taken.allocation)tally.set(item.id,round((tally.get(item.id)??0)+item.grams));
    priorUses.set(key,tally);
  }
  for(const key of Object.keys(receipts)) {
    const [week,,id]=key.split('|');
    if(week===start&&!all.has(id))all.set(id,[]);
  }
  const aggregate:BuyLine[]=[];
  const events=new Map<number,BuyLine[]>();
  const categoryCosts:Record<string,Cost>={};
  const inventory:Logistics['inventory']=[];
  const purchase=blank(),consumed=blank(),paid=blank(),remaining=blank();
  let checked=0,toBuy=0;
  const purchaseDay=(id:string,use:Use)=>{
    const batch=ranges[batchFor(use.day)];
    const once=settings.purchase==='一次采购'||settings.purchase==='干货一次、生鲜分批'&&!requiresCooling(id);
    const preferred=Math.min(use.prepAt,once?(ranges[0]?.purchaseAt??0):batch.purchaseAt);
    const needsAt=use.prepAt;
    // 缺少冷链或超过保守保存窗口时，将该食材安排到实际需要当天购入。
    return needsAt-preferred>storageDays(id,p)?needsAt:preferred;
  };

  for(const [id,uses] of all) {
    const f=food(id);
    const home=pantry[id]?.stock??0;
    const price=priceFor(id,state.prices??{},pantry[id],defaults);
    const rate=edibleRate(price);
    const unit=price&&gramsPerPriceUnit(price);
    const pack=price?.pack??(price&&['个','盒','袋'].includes(price.unit)?unit:undefined);
    const groups=new Map<number,Use[]>();
    for(const use of uses) {
      const date=purchaseDay(id,use);
      const current=groups.get(date)??[];current.push(use);groups.set(date,current);
    }
    for(const key of Object.keys(receipts)) {
      const [week,day,item]=key.split('|');
      if(week===start&&item===id&&!groups.has(Number(day)))groups.set(Number(day),[]);
    }
    type Lot={left:number;expiry:string;from?:string;kind:'home'|'receipt'|'forecast'};
    const house=available.find(l=>l.id===id&&l.source.startsWith('家中|'));
    const usable=execution?house?.net??0:home;
    const lots:Lot[]=[{left:usable,expiry:execution?house?.expires??'0001-01-01':addDays(start,storageDays(id,p)),kind:'home'}];
    if(execution) for(const lot of available) if(lot.id===id&&!lot.source.startsWith('家中|')&&!lot.source.startsWith(start+'|')) {
      lots.push({left:lot.net,expiry:lot.expires,from:lot.from,kind:'receipt'});
    }
    const lines:BuyLine[]=[];
    const legacyGross=pantry[id]?.bought??0;
    const hasReceipt=Object.keys(receipts).some(key=>key.startsWith(start+'|')&&key.endsWith('|'+id));
    for(const [day,byDate] of [...groups].sort((a,b)=>a[0]-b[0])) {
      const key=receiptKey(start,day,id);
      const old:Receipt|undefined=receipts[key]??(!hasReceipt&&lines.length===0&&legacyGross>0
        ?{gross:legacyGross,net:round(legacyGross*rate)}:undefined);
      const actual=available.find(l=>l.source===key);
      if(old)lots.push({left:Math.max(0,round(old.net-(spent.get(key)??0))),expiry:execution?actual?.expires??'0001-01-01':addDays(start,day+storageDays(id,p)),from:actual?.from,kind:'receipt'});
      let stock=0,carry=0,unmet=0;
      for(const use of [...byDate].sort((a,b)=>a.prepAt-b.prepAt)) {
        let homeUse=0,carryUse=0,projectedUse=0;
        const previous=use.jobKey?priorUses.get(use.jobKey):undefined;
        const done=Math.min(use.grams,previous?.get(id)??0);
        if(previous?.has(id))previous.set(id,round(previous.get(id)!-done));
        let need=round(use.grams-done);
        for(const lot of lots) {
          const needDate=addDays(start,use.prepAt);
          if(lot.expiry<needDate||lot.from&&lot.from>needDate||lot.left<=0)continue;
          const allocated=Math.min(need,lot.left);
          if(lot.kind==='home') {stock+=allocated;homeUse+=allocated;}
          else {carry+=allocated;if(lot.kind==='receipt')carryUse+=allocated;else projectedUse+=allocated;}
          lot.left=round(lot.left-allocated);need=round(need-allocated);
          if(!need)break;
        }
        use.sourcing={home:round(homeUse),carry:round(carryUse),forecast:round(need+projectedUse),taken:done};
        unmet+=need;
      }
      // 可食率未知的毛重商品仅给出净料下限，费用保持未知。
      const gross=unmet/(rate||1);
      const buy=gross<=0?0:round(pack?Math.ceil((gross-1e-8)/pack)*pack:Math.ceil(gross));
      const leftover=Math.max(0,round(buy*rate-unmet));
      if(leftover)lots.push({left:leftover,expiry:addDays(start,day+storageDays(id,p)),kind:'forecast'});
      const need=round(byDate.reduce((n,use)=>n+use.grams,0));
      const consumption=rate?amountFor(need/rate,price):need?null:0;
      const estimate=!rate&&buy?null:amountFor(buy,price);
      const pricedPaid=old?.paid!==undefined?(old.paidGross??old.gross):0;
      const withoutPaid=old?Math.max(0,round(old.gross-pricedPaid)):0;
      const partialEstimate=amountFor(withoutPaid,price);
      const paidValue=partialEstimate===null?null:round((old?.paid??0)+partialEstimate);
      const cost=blank(),bill=blank();
      if(buy)addCost(cost,estimate);
      if(old?.paid!==undefined)addCost(bill,old.paid);
      if(withoutPaid)addCost(bill,partialEstimate);
      mergeCost(cost,bill);
      const row:BuyLine={id,uses:byDate,need,stock:round(stock),carry:round(carry),buy:round(buy+(old?.gross??0)),remaining:buy,
        confirmed:old?.gross??0,netConfirmed:old?.net??0,leftover, ...(price?{price}:{}),consume:consumption,estimate,paid:paidValue,
        paidEstimated:withoutPaid>0,...(old?.date?{receiptDate:old.date}:{}),...(old?.storage?{receiptStorage:old.storage}:{}),...(old?.paid!==undefined?{paidActual:old.paid,paidGross:pricedPaid}:{}),cost,bill,receiptKey:key};
      const event=events.get(day)??[];event.push(row);events.set(day,event);
      lines.push(row);
      if(row.buy>0) {toBuy++;if(!buy)checked++;}
      mergeCost(purchase,cost);mergeCost(paid,bill);
      if(need)addCost(consumed,consumption);
      if(buy)addCost(remaining,estimate);
      if(cost.items)mergeCost(categoryCosts[f.category]??=blank(),cost);
    }
    if(lines.length) {
      const tot=(key:'need'|'stock'|'carry'|'buy'|'remaining'|'confirmed'|'netConfirmed')=>round(lines.reduce((n,r)=>n+r[key],0));
      const sum=(key:'consume'|'estimate'|'paid')=>lines.some(l=>l[key]===null)?null:round(lines.reduce((n,l)=>n+(l[key]??0),0));
      const projected=round(lots.filter(l=>l.expiry>=addDays(start,days.length-1)).reduce((n,l)=>n+l.left,0));
      const cost=blank(),bill=blank();lines.forEach(l=>{mergeCost(cost,l.cost);mergeCost(bill,l.bill);});
      inventory.push({id,home,confirmed:tot('netConfirmed'),projected,...(execution?{usable,taken:round((spent.get('家中|'+id)??0)+lines.reduce((n,l)=>n+(spent.get(l.receiptKey)??0),0))}:{})});
      aggregate.push({...lines[0],uses,need:tot('need'),stock:tot('stock'),carry:tot('carry'),buy:tot('buy'),remaining:tot('remaining'),
        confirmed:tot('confirmed'),netConfirmed:tot('netConfirmed'),leftover:projected,paidEstimated:lines.some(l=>l.paidEstimated),
        consume:sum('consume'),estimate:sum('estimate'),paid:sum('paid'),cost,bill,receiptKey:''});
    }
  }

  const sort=(a:BuyLine,b:BuyLine)=>food(a.id).category.localeCompare(food(b.id).category,'zh-CN')||
    food(a.id).name.localeCompare(food(b.id).name,'zh-CN');
  const batches=[...events].sort((a,b)=>a[0]-b[0]).map(([day,lines])=>{
    const purchase=blank(),consumed=blank(),paid=blank(),remaining=blank();
    for(const row of lines) {
      mergeCost(purchase,row.cost);mergeCost(paid,row.bill);
      if(row.need)addCost(consumed,row.consume);
      if(row.remaining)addCost(remaining,row.estimate);
    }
    return {day,date:addDays(start,day),lines:lines.sort(sort),purchase,consumed,paid,remaining};
  });
  const prep=ranges.map(range=>{
    const selected=jobsByDate[range.index];
    const rows=[...all].map(([id,uses])=>{
      const scoped=uses.filter(u=>u.day>=range.from&&u.day<range.to);
      return {id,uses:scoped,grams:round(scoped.reduce((n,u)=>n+u.grams,0))};
    }).filter(r=>r.grams>0);
    const sessions=parallelSessions(selected,start);
    return {range,start:addDays(start,range.from),end:addDays(start,range.to-1),prepDate:addDays(start,range.prepAt),
      purchaseDate:addDays(start,range.purchaseAt),rows,jobs:selected.sort((a,b)=>a.at-b.at||b.waiting-a.waiting),
      active:sessions.reduce((a,b)=>a+b.active,0),waiting:sessions.reduce((a,b)=>a+b.waiting,0),sessions,
      boxes:selected.filter(j=>j.at<j.day||j.method.includes('冷冻生料')).length,
      tools:[...new Set(selected.flatMap(j=>j.tools))]};
  });
  return {settings,start,people,batches,prep,notice,consumed,purchase,paid,remaining,categories:categoryCosts,
    lines:aggregate.sort(sort),budget:p.budget?Number(p.budget):null,checked,toBuy,inventory};
}
export const ingredientLabel=(id:string)=>food(id).name+' · '+foodState[food(id).state];

export function parallelSessions(jobs:PrepJob[],start:string) {
  const days=new Map<number,PrepJob[]>();
  for(const job of jobs) {
    const group=days.get(job.at)??[];group.push(job);days.set(job.at,group);
    if(job.reheat&&job.day>job.at) {
      const reheats=days.get(job.day)??[];
      reheats.push({...job,active:Math.min(job.reheat,2),waiting:Math.max(0,job.reheat-2)});
      days.set(job.day,reheats);
    }
  }
  return [...days].sort((a,b)=>a[0]-b[0]).map(([at,group])=>{
    const devices=new Map<string,number>();
    let hands=0,end=0;
    for(const job of [...group].sort((a,b)=>b.waiting-a.waiting)) {
      const heating=job.tools.filter(t=>!['冰箱','冷冻室','电子厨房秤'].includes(t));
      const begins=Math.max(hands,...heating.map(t=>devices.get(t)??0));
      hands=begins+job.active;
      const finish=hands+job.waiting;
      for(const t of heating)devices.set(t,finish);
      end=Math.max(end,finish);
    }
    const active=group.reduce((n,j)=>n+j.active,0);
    return {date:addDays(start,at),active,waiting:Math.max(0,end-active),total:end};
  });
}
