import {allocateIngredient,taskKey,type Execution} from './execution';
import {currentLedger,ledgerLots,balances,receiptIdentity,type Ledger} from './inventory';
import {purchaseCategory} from './purchase-category';
import {purchaseFood,rawNetGrams,roundGrams,type PurchaseOptions} from './purchase-food';
import {cookOnServingDay,requiresCooling,riceFoods,storageDays} from './food-storage';
import {food,foodState,type Serving} from './catalog';
import {addDays,shoppingOffsets,splitWeek,supplyDefaults,type Range,type SupplySettings} from './batches';
import {amountFor,edibleRate,gramsPerPriceUnit,priceDefaults,priceFor,type Price,type PriceBook,type PriceUnit} from './prices';
import type {CookingSelection} from './cooking-profile';
import {recipeCooking} from './cooking';
import type {MealName,Profile} from './profile';
import type {Day,Pantry} from './shopping';

export type Receipt={gross:number;net:number;paid?:number;paidGross?:number;date?:string;quantity?:number;unit?:PriceUnit;netOnly?:true;storage?:import('./execution').StockInfo};
export type SupplyState={settings?:SupplySettings;prices?:PriceBook;receipts?:Record<string,Receipt>;execution?:Execution;ledger?:Ledger;products?:PurchaseOptions;startChoice?:import('./planner').StartChoice};
export type Cost={known:number;missing:number;items:number};
export type Use={day:number;meal:string;dish:string; grams:number;recipeId?:string;recipeGrams?:number;conversionMissing?:boolean;blocked?:boolean;prepAt:number;method:string;jobKey?:string;sourcing?:{home:number;carry:number;forecast:number;taken:number}};
export type BuyLine={id:string;uses:Use[];need:number;stock:number;carry:number;buy:number;remaining:number;confirmed:number;netConfirmed:number;
  leftover:number;receiptDate?:string;receiptQuantity?:number;receiptUnit?:PriceUnit;receiptNetOnly?:true;receiptStorage?:import('./execution').StockInfo;price?:Price;consume:number|null;estimate:number|null;paid:number|null;paidActual?:number;paidGross?:number;paidEstimated:boolean;cost:Cost;bill:Cost;receiptKey:string};
export type BuyBatch={day:number;date:string;lines:BuyLine[];purchase:Cost;consumed:Cost;paid:Cost;remaining:Cost};
export type PrepJob={key?:string;day:number;at:number;name:string;meal:string;method:string;active:number;waiting:number;reheat?:number;tools:string[];steps:string[];ingredients:{id:string;grams:number}[]};
export type PrepBatch={range:Range;start:string;end:string;prepDate:string;purchaseDate:string;
  rows:{id:string;uses:Use[];grams:number}[];jobs:PrepJob[];active:number;waiting:number;boxes:number;tools:string[];sessions?:{date:string;active:number;waiting:number;total:number}[]};
export type Logistics={settings:SupplySettings;start:string;people:number;batches:BuyBatch[];prep:PrepBatch[];notice:string[];
  conflicts?:string[];storageWarnings?:string[];actualBatches?:BuyBatch[];consumed:Cost;purchase:Cost;paid:Cost;remaining:Cost;categories:Record<string,Cost>;lines:BuyLine[];budget:number|null;
  checked:number;toBuy:number;inventory:{id:string;home:number;confirmed:number;projected:number;usable?:number;taken?:number;demand?:number;shortage?:number}[]};

const round=roundGrams;
const blank=():Cost=>({known:0,missing:0,items:0});
function addCost(total:Cost,value:number|null) {
  total.items++;if(value===null)total.missing++;else total.known=round(total.known+value);
}
function mergeCost(total:Cost,other:Cost) {
  total.known=round(total.known+other.known);total.items+=other.items;total.missing+=other.missing;
}
export const receiptKey=(start:string,day:number,id:string)=>start+'|'+day+'|'+id;

const isRawAnimal=(id:string)=>food(id).state==='raw'&&['肉类','鱼虾'].includes(food(id).category);

export function purchaseDayFor(id:string,at:number,dates:number[],profile:Profile) {
  const keep=storageDays(id,profile);
  return dates.findLast(day=>day<=at&&at-day<=keep);
}

export function purchaseEligibility(p:Profile,start:string,pantry:Pantry,state:SupplyState={},earliest?:string) {
  const dates=shoppingOffsets(state.settings??supplyDefaults(p),p,start,earliest);
  const lots=[...ledgerLots(currentLedger(pantry,state)).values()];
  return (id:string,day:number,grams:number)=>{
    const product=purchaseFood(id,state.products);
    if(product.rate&&dates.some(d=>d<=day))return true;
    const candidates=lots.filter(l=>l.id===id||l.id===product.purchaseIngredientId).map(l=>({...l}));
    return !allocateIngredient(id,grams,candidates,state.products).missing;
  };
}

export function planLogistics(days:Day[],p:Profile,start:string,pantry:Pantry={},state:SupplyState={},cookingOverride?:CookingSelection, defaults:Readonly<PriceBook>=priceDefaults):Logistics {
  const settings=state.settings??supplyDefaults(p), ranges=splitWeek(settings,days.length);
  const dates=shoppingOffsets(settings,p,start), products=state.products;
  const eligible=purchaseEligibility(p,start,pantry,state);
  const fridge=p.tools.includes('冰箱'), freezer=fridge&&p.tools.includes('冷冻室')&&p.frozen, people=Number(p.people);
  const all=new Map<string,Use[]>();
  const jobsByDate:PrepJob[][]=Array.from({length:ranges.length},()=>[]);
  const batchFor=(day:number)=>ranges.findIndex(r=>r.from<=day&&day<r.to);
  const batchJobs=(day:number)=>jobsByDate[batchFor(day)];
  const notice=[
    '生熟分开。准备熟食后尽快分入浅盒冷却，2 小时内冷藏至 4°C 或冷冻至 −18°C，环境超过 32°C 时缩短到 1 小时。',
    '熟米饭尽量在 1 小时内冷却。冷藏后须在 24 小时内食用，否则当天冷冻或改为现煮。熟食一次性复热到中心 74°C。',
    '绿叶菜当天洗切。提前加工鱼虾时优先分装冷冻生料，食用前一晚移到冰箱冷藏室解冻，再现做。',
    '冷藏食品以包装保质期与开封说明为准。准备前请自行核对手头食材是否适合食用。解冻和冷却的自然等待不计入锅具用时。',
  ];
  if(!fridge)notice.unshift('没有冰箱。易腐食品只能用购物当天买到的食材或已确认的安全库存，用完即开封的常温商品按标签保存。');
  notice.push('常温采购只用于整颗完好蔬果和未开封的常温商品。豆浆选标注可常温保存的未开封小包装，鲑鱼和熟鹰嘴豆选无盐罐装；开封即用，无冰箱时勿留存剩余。');
  if(fridge&&!freezer)notice.unshift('没有可用冷冻条件。易腐食材须在冷藏期限内食用，购物日期保持所选安排。');

  function schedule(row:Serving,day:number,at:number,meal:string,allow:boolean) {
    const ingredients=row.ingredients.map(i=>({id:i.id,grams:round(i.grams*people)}));
    const nutritionIds=ingredients.map(i=>i.id);
    const withRice=nutritionIds.some(id=>riceFoods.has(id));
    const mustCookFresh=nutritionIds.some(cookOnServingDay);
    const animal=nutritionIds.some(id=>isRawAnimal(purchaseFood(id,products).purchaseIngredientId));
    const cooking=recipeCooking(row.recipe);
    let method='当天现做', prepAt=day;
    if(cooking.total===0||row.recipe.cook===0)method='当天开封或洗切';
    if(fridge&&allow&&at>=dates[0]&&at<day&&row.recipe.batch&&row.recipe.cook>0&&!mustCookFresh&&
      ingredients.every(i=>eligible(i.id,at,i.grams))) {
      const daysAhead=day-at;
      if(freezer&&(withRice||daysAhead>1)) {prepAt=at;method='熟后分盒冷冻';}
      else if(daysAhead===1&&!withRice) {prepAt=at;method='前一天制作冷藏';}
    }
    if(fridge&&freezer&&animal&&prepAt===day&&ingredients.some(i=>{
      const id=purchaseFood(i.id,products).purchaseIngredientId;
      const date=purchaseDayFor(id,day,dates,p);
      return isRawAnimal(id)&&date!==undefined&&day-date>1;
    }))method='采购日按份冷冻生料，提前冷藏解冻后现做';
    const conversions=ingredients.map(i=>purchaseFood(i.id,products).conversion).filter(r=>r!==undefined);
    const tools=[...new Set([...row.recipe.tools,...conversions.map(r=>r.tools.find(t=>p.tools.includes(t))).filter(t=>t!==undefined)])];
    const steps=[...conversions.map(r=>'库存中没有安全可用的同款熟料时，先自制。'+r.steps),...row.recipe.steps];
    if(method.includes('冷藏')&&prepAt<day) steps.push(withRice?'食用前 24 小时内制作，熟饭 1 小时内冷却并在 ≤4°C 冷藏。时间无法保证时改当天煮。':'熟食分浅盒，2 小时内冷藏。');
    if(method==='熟后分盒冷冻')steps.push(withRice?'熟饭尽量在 1 小时内分盒冷却后冷冻，标食用日。':'2 小时内分盒冷却并冷冻，标食用日。');
    if(prepAt<day)steps.push('食用当天只复热一次，中心达到 74°C。');
    if(method.includes('冷冻'))steps.push('已冷冻时，食用前一晚移至冰箱冷藏室解冻，生料和熟食分开。');
    if(method.includes('冷冻生料'))steps.unshift('生料单独密封，按该餐净重分装。腌制只在冷藏室进行，食谱无腌制步骤则直接烹调。');
    const factor=Math.max(1,1+(people-1)*.25);
    return {job:{key:taskKey(start,day,meal,row.recipe.id),day,at:prepAt,name:row.recipe.name,meal,method,active:Math.ceil(cooking.active*factor),
      waiting:cooking.wait+conversions.reduce((minutes,r)=>minutes+r.minutes,0),...(prepAt<day?{reheat:cooking.reheat??5}:{}),tools,steps,ingredients},needsAt:prepAt};
  }

  days.forEach((day,index)=>{
    const range=ranges[batchFor(index)];
    day.meals.forEach(meal=>{
      const name=meal.name as MealName;
      const perMeal=p.cooking?.days?.[index]?.[name as '午餐']?.prep??p.cooking?.meals?.[name as '午餐']?.prep
        ??p.mealPreferences?.[name as '午餐']?.prep??settings.prep!=='每天';
      meal.dishes.forEach(dish=>{
        const {job,needsAt}=schedule(dish,index,range.prepAt,meal.name,perMeal);
        batchJobs(index).push(job);
        for(const i of job.ingredients) {
          const product=purchaseFood(i.id,products);
          const uses=all.get(product.purchaseIngredientId)??[];
          uses.push({day:index,meal:meal.name,dish:dish.recipe.name,
            grams:product.rate?rawNetGrams(i.grams,product.rate):0,recipeId:i.id,recipeGrams:i.grams,...(!product.rate?{conversionMissing:true}:{}),
            prepAt:needsAt,method:job.method,jobKey:job.key});
          all.set(product.purchaseIngredientId,uses);
        }
      });
    });
  });

  const scopeEnd=addDays(start,days.length-1), scopeBegin=addDays(start,-1);
  const receipts=Object.entries(state.receipts??{}).filter(([source,r])=>{
    const date=r.date??receiptIdentity(source).date;
    return source.startsWith(start+'|')||Boolean(date&&date>=scopeBegin&&date<=scopeEnd);
  });
  const execution=state.execution??{};
  const ledger=currentLedger(pantry,state);
  const actual=[...ledgerLots(ledger).values()];
  const opening=balances(ledger);
  const priorUses=new Map<string,Map<string,number>>();
  for(const [key,entry] of Object.entries(execution.tasks??{})) if(entry.taken) {
    const tally=new Map<string,number>();
    for(const item of entry.taken.allocation)tally.set(item.id,round((tally.get(item.id)??0)+(item.recipeGrams??item.grams)));
    priorUses.set(key,tally);
  }
  const aggregate:BuyLine[]=[];
  const events=new Map<number,BuyLine[]>(dates.map(d=>[d,[]]));
  const extra=new Map<number,BuyLine[]>();
  const categoryCosts:Record<string,Cost>={};
  const inventory:Logistics['inventory']=[];
  const purchase=blank(),consumed=blank(),paid=blank(),remaining=blank();
  const conflicts:string[]=[], storageWarnings:string[]=[];
  let checked=0,toBuy=0;
  const emptyRow=(id:string):BuyLine=>({id,uses:[],need:0,stock:0,carry:0,buy:0,remaining:0,confirmed:0,netConfirmed:0,leftover:0,
    consume:0,estimate:0,paid:0,paidEstimated:false,cost:blank(),bill:blank(),receiptKey:''});
  const items=new Set([...all.keys(),...receipts.map(([key])=>receiptIdentity(key).item)]);
  for(const id of items) {
    const uses=all.get(id)??[];
    const price=priceFor(id,state.prices??{},pantry[id],defaults);
    const rate=edibleRate(price), unit=price&&gramsPerPriceUnit(price);
    const pack=price?.pack??(price&&['个','盒','袋','瓶'].includes(price.unit)?unit:undefined);
    const byDate=new Map<number,{row:BuyLine;needs:{use:Use;amount:number}[]}>();
    const rowFor=(day:number)=>{
      let group=byDate.get(day);
      if(!group){group={row:{...emptyRow(id),price,receiptKey:receiptKey(start,day,id)},needs:[]};byDate.set(day,group);}
      return group;
    };
    const actualDay=new Set<number>();
    for(const [key,old] of receipts) {
      const [week,day,item]=key.split('|');
      if(item!==id)continue;
      // 计划关联由采购项目决定。实际购买日期用于查账。
      const scheduled=week===start&&dates.includes(+day)?+day:undefined;
      const pricedPaid=old.paid!==undefined?(old.paidGross??old.gross):0;
      const withoutPaid=Math.max(0,round(old.gross-pricedPaid));
      const partialEstimate=withoutPaid&&old.netOnly?null:amountFor(withoutPaid,price);
      const bill=blank();
      if(old.paid!==undefined)addCost(bill,old.paid);
      if(withoutPaid)addCost(bill,partialEstimate);
      const receipt={confirmed:old.gross,netConfirmed:old.net,receiptDate:old.date??receiptIdentity(key).date,receiptQuantity:old.quantity,receiptUnit:old.unit,receiptNetOnly:old.netOnly,
        paid:partialEstimate===null?null:round((old.paid??0)+partialEstimate),paidEstimated:withoutPaid>0,
        ...(old.paid!==undefined?{paidActual:old.paid,paidGross:pricedPaid}:{}),bill};
      mergeCost(paid,bill);
      if(uses.length&&scheduled!==undefined&&scheduled===+day&&!actualDay.has(scheduled)) {
        Object.assign(rowFor(scheduled).row,receipt);actualDay.add(scheduled);
      } else {
        const actualDate=receipt.receiptDate??start;
        const dayIndex=Math.round((Date.parse(actualDate)-Date.parse(start))/86400000);
        const entries=extra.get(dayIndex)??[];
        const preservedCost={...bill};
        entries.push({...emptyRow(id),...receipt,price,buy:old.gross,receiptKey:key,cost:preservedCost});
        extra.set(dayIndex,entries);
      }
    }
    // 生熟库存分别消耗，按最早制备日期分配。凭证与取用记录不改写。
    for(const use of [...uses].sort((a,b)=>a.prepAt-b.prepAt||a.day-b.day)) {
      const recipeId=use.recipeId??id, grams=use.recipeGrams??use.grams;
      const product=purchaseFood(recipeId,products);
      const old=use.jobKey?priorUses.get(use.jobKey):undefined;
      const done=use.jobKey&&execution.tasks?.[use.jobKey]?.taken?.confirmed?grams:Math.min(grams,old?.get(recipeId)??0);
      if(old?.has(recipeId))old.set(recipeId,round(old.get(recipeId)!-done));
      const date=addDays(start,use.prepAt);
      const result=allocateIngredient(recipeId,round(grams-done),actual,products);
      const equivalent=(n:number)=>product.rate?round(n/product.rate):0;
      const home=equivalent(result.allocation.filter(a=>a.source.startsWith('家中|')).reduce((n,a)=>n+(a.recipeGrams??a.grams),0));
      const carry=equivalent(result.allocation.filter(a=>!a.source.startsWith('家中|')).reduce((n,a)=>n+(a.recipeGrams??a.grams),0));
      const orderDay=dates.findLast(d=>d<=use.prepAt);
      if(done<grams&&orderDay!==undefined&&purchaseDayFor(id,use.prepAt,dates,p)===undefined) {
        storageWarnings.push(food(id).name+'用于 '+date+'，请确认保存或实际供货。');
        use.method+='，此份须先确认食材保存';
      }
      const amount=product.rate?rawNetGrams(result.missing,product.rate):0;
      use.sourcing={home,carry,forecast:amount,taken:equivalent(done)};
      if(result.missing&&(!product.rate||orderDay===undefined)) {
        const reason=!product.rate?food(recipeId).name+'的生熟换算待补充':food(id).name+'在 '+date+' 制备前没有购物日或已确认库存';
        conflicts.push(reason);
        use.blocked=true;
      }
      const index=orderDay??dates.findLast(d=>d<=use.prepAt)??dates[0];
      const group=rowFor(index);
      group.row.uses.push(use);
      group.needs.push({use,amount:orderDay!==undefined?amount:0});
    }
    const lines:BuyLine[]=[];
    let forecast=0;
    for(const [day,{row,needs}] of [...byDate].sort((a,b)=>a[0]-b[0])) {
      let reload=0;
      for(const {use,amount} of needs) {
        let wanted=amount;
        const useAmount=Math.min(wanted,forecast);
        forecast=round(forecast-useAmount);wanted=round(wanted-useAmount);
        row.carry=round(row.carry+useAmount);
        reload=round(reload+wanted);
        row.stock+=use.sourcing!.home;row.carry+=use.sourcing!.carry;
      }
      row.need=round(row.uses.reduce((n,u)=>n+u.grams,0));
      row.stock=round(row.stock);row.carry=round(row.carry);
      const unknown=row.uses.some(u=>u.conversionMissing), incomplete=unknown||row.uses.some(u=>u.blocked);
      const gross=reload/(rate||1);
      const buy=gross<=0?0:round(pack?Math.ceil((gross-1e-8)/pack)*pack:Math.ceil(gross));
      row.remaining=buy;row.buy=round(buy+row.confirmed);
      row.leftover=Math.max(0,round(buy*rate-reload));
      forecast=round(forecast+row.leftover);
      row.consume=unknown||row.need&&!rate?null:amountFor(row.need/(rate||1),price);
      row.estimate=incomplete||buy&&!rate?null:amountFor(buy,price);
      if(buy||incomplete)addCost(row.cost,row.estimate);
      mergeCost(row.cost,row.bill);mergeCost(purchase,row.cost);
      if(buy||incomplete)addCost(remaining,row.estimate);
      if(row.uses.length)addCost(consumed,row.consume);
      if(row.cost.items)mergeCost(categoryCosts[purchaseCategory(id)]??=blank(),row.cost);
      if(row.buy>0){toBuy++;if(!buy)checked++;}
      events.get(day)!.push(row);lines.push(row);
    }
    if(lines.length) {
      const total=(key:'need'|'stock'|'carry'|'buy'|'remaining'|'confirmed'|'netConfirmed')=>round(lines.reduce((n,r)=>n+r[key],0));
      const sum=(key:'consume'|'estimate'|'paid')=>lines.some(l=>l[key]===null)?null:round(lines.reduce((n,l)=>n+(l[key]??0),0));
      const projected=round(actual.filter(l=>l.id===id).reduce((sum,lot)=>sum+lot.net,forecast));
      const cost=blank(),bill=blank();lines.forEach(l=>{mergeCost(cost,l.cost);mergeCost(bill,l.bill);});
      const home=opening.get(id)??0;
      inventory.push({id,home,confirmed:total('netConfirmed'),projected,usable:home,
        demand:total('need'),shortage:total('remaining'),taken:round(uses.reduce((n,use)=>n+(use.sourcing?.taken??0),0))});
      aggregate.push({...lines[0],uses,need:total('need'),stock:total('stock'),carry:total('carry'),buy:total('buy'),remaining:total('remaining'),
        confirmed:total('confirmed'),netConfirmed:total('netConfirmed'),leftover:projected,paidEstimated:lines.some(l=>l.paidEstimated),
        consume:sum('consume'),estimate:sum('estimate'),paid:sum('paid'),cost,bill,receiptKey:''});
    }
  }

  for(const [id,home] of opening)if(home>0&&!items.has(id))inventory.push({id,home,confirmed:0,projected:home,usable:home,demand:0,shortage:0});
  const sort=(a:BuyLine,b:BuyLine)=>food(a.id).category.localeCompare(food(b.id).category,'zh-CN')||
    food(a.id).name.localeCompare(food(b.id).name,'zh-CN');
  const buildBatches=(groups:Map<number,BuyLine[]>)=>[...groups].sort((a,b)=>a[0]-b[0]).map(([day,lines])=>{
    const purchase=blank(),consumed=blank(),paid=blank(),remaining=blank();
    for(const row of lines) {
      mergeCost(purchase,row.cost);mergeCost(paid,row.bill);
      if(row.uses.length)addCost(consumed,row.consume);
      if(row.remaining||row.estimate===null)addCost(remaining,row.estimate);
    }
    return {day,date:addDays(start,day),lines:lines.sort(sort),purchase,consumed,paid,remaining};
  });
  const batches=buildBatches(events), actualBatches=buildBatches(extra);
  const prep=ranges.map(range=>{
    const selected=jobsByDate[range.index];
    const rows=[...all].map(([id,uses])=>{
      const scoped=uses.filter(u=>u.day>=range.from&&u.day<range.to);
      return {id,uses:scoped,grams:round(scoped.reduce((n,u)=>n+u.grams,0))};
    }).filter(r=>r.uses.length>0);
    const sessions=parallelSessions(selected,start);
    return {range,start:addDays(start,range.from),end:addDays(start,range.to-1),prepDate:addDays(start,range.prepAt),
      purchaseDate:addDays(start,dates.findLast(d=>d<=range.prepAt)??dates[0]),rows,jobs:selected.sort((a,b)=>a.at-b.at||b.waiting-a.waiting),
      active:sessions.reduce((a,b)=>a+b.active,0),waiting:sessions.reduce((a,b)=>a+b.waiting,0),sessions,
      boxes:selected.filter(j=>(j.at<j.day||j.method.includes('冷冻生料'))&&j.ingredients.some(i=>purchaseCategory(i.id)==='主要食材')).length,
      tools:[...new Set(selected.flatMap(j=>j.tools))]};
  });
  return {settings,start,people,batches,prep,notice,actualBatches,conflicts:[...new Set(conflicts)],storageWarnings:[...new Set(storageWarnings)],consumed,purchase,paid,remaining,categories:categoryCosts,
    lines:aggregate.sort(sort),budget:p.budget?Number(p.budget):null,checked,toBuy,inventory};
}
export const ingredientLabel=(id:string)=>food(id).name+' · '+foodState[food(id).state];

export function parallelSessions(jobs:PrepJob[],start:string,reheatsIncluded=true) {
  const days=new Map<number,PrepJob[]>();
  for(const job of jobs) {
    const group=days.get(job.at)??[];group.push(job);days.set(job.at,group);
    if(reheatsIncluded&&job.reheat&&job.day>job.at) {
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

export function prepSchedule(batch:PrepBatch,start:string) {
  const advanced=batch.jobs.filter(job=>job.at<job.day);
  const later=batch.jobs.flatMap(job=>{
    if(job.at===job.day)return [job];
    if(job.reheat)return [{...job,at:job.day,active:Math.min(job.reheat,2),waiting:Math.max(0,job.reheat-2),reheat:undefined}];
    return [];
  });
  return {concentrated:parallelSessions(advanced,start,false),later:parallelSessions(later,start,false)};
}
