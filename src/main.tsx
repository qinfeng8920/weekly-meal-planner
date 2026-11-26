import {PoolPage,type GenerationDraft} from './PoolPage';
import {executeJobs,type TaskAction} from './execution';
import {adjustStock,currentLedger,recordPurchase,resolveReview,reverseAdjustment,type InventoryEvent} from './inventory';
import type {PrepJob,Receipt} from './logistics';
import {food,recipeList} from './catalog';
import {buildWeeklyPool,defaultPool,type PoolSettings} from './ingredient-pool';
import {InventoryManager,PriceManager} from './SupplyEditors';
import {MealSettings} from './MealSettings';
import {breakfastMenus,fixedBreakfasts,menuName} from './meal-catalog';
import {version} from '../package.json';
import type {CookingProfile} from './cooking-profile';
import {StrictMode,useEffect,useMemo,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Dashboard} from './Dashboard';
import {ProfileForm} from './ProfileForm';
import {PlanPage} from './PlanPage';
import {Library} from './Library';
import {ShoppingPage,type SupplyActions} from './ShoppingPage';
import {dateKey,initialProfile,type Profile,type Weight} from './profile';
import {shoppingOffsets,shoppingSchedule,supplyDefaults} from './batches';
import {planLogistics,type Logistics} from './logistics';
import {parsePriceBackup} from './logistics-storage';
import {type PriceBook} from './prices';
import {nutrition} from './nutrition';
import {algorithmVersion,newPlanStart,regenerate,revise,verifyAgainst,type Change,type Lock,type Plan,type StartChoice} from './planner';
import {prepPlan,purchasesFromLogistics,type Pantry} from './shopping';
import {backupLimit,downloadFile,fresh,loadData,parseBackup,writeData,type Data} from './store';
import {decimal,Empty,planText,SectionTitle,shareText,planDay} from './ui';
import './style.css';

const pages=['首页','食谱','采购','我的'];
const icons=['⌂','▤','▣','◉'];
type InstallEvent=Event&{prompt:()=>Promise<void>;userChoice:Promise<{outcome:string}>};
const planningProfile=(p:Profile)=>({...p,people:'',prep:'',trips:'',budget:'',minutes:'',skill:'',
  cooking:undefined,mealPreferences:p.mealPreferences?Object.fromEntries(Object.entries(p.mealPreferences).map(([key,value])=>[key,{...value,minutes:''}])):undefined});
function clearLegacyPrices(pantry:Pantry,id?:string) {
  return Object.fromEntries(Object.entries(pantry).map(([key,item])=>[key,
    !id||key===id?{...item,price:undefined,pack:undefined,yieldPercent:undefined}:item]));
}
const clearLegacyPurchases=(pantry:Pantry):Pantry=>Object.fromEntries(Object.entries(pantry).map(([id,item])=>[id,{...item,bought:undefined,stock:undefined}]));
const errorText=(e:unknown)=>e instanceof Error?e.message:'操作未完成，请重试。';

function App() {
  const [data,setData]=useState<Data|null>(null);
  const [fatal,setFatal]=useState('');
  const [page,setPage]=useState('首页'),[status,setStatus]=useState<{text:string;error?:boolean}|null>(null);
  const [day,setDay]=useState(0),[seed,setSeed]=useState(''),[archived,setArchived]=useState<Plan|null>(null);
  const [historyQuote,setHistoryQuote]=useState<Logistics|undefined>();
  const [busy,setBusy]=useState(false),[offline,setOffline]=useState(!navigator.onLine),[cached,setCached]=useState(false);
  const [update,setUpdate]=useState<ServiceWorker|null>(null),[canInstall,setInstall]=useState<InstallEvent|null>(null);
  const [confirmDelete,setConfirmDelete]=useState(false);
  const saving=useRef(false),working=useRef(false);
  const generation=useRef(0);
  const stopWorker=useRef<(()=>void)|undefined>(undefined);
  useEffect(()=>()=>stopWorker.current?.(),[]);

  useEffect(()=>{
    let active=true;
    void loadData().then(d=>{if(active)setData(d);}).catch(e=>{if(active)setFatal(errorText(e));});
    return ()=>{active=false;};
  },[]);
  useEffect(()=>{
    const signal=()=>setOffline(!navigator.onLine);
    const install=(e:Event)=>{e.preventDefault();setInstall(e as InstallEvent);};
    window.addEventListener('online',signal);window.addEventListener('offline',signal);
    window.addEventListener('beforeinstallprompt',install);
    if (import.meta.env.PROD && 'serviceWorker' in navigator) {
      let controlled=Boolean(navigator.serviceWorker.controller), active=true;
      let registration:ServiceWorkerRegistration|undefined;
      const refresh=()=>{
        if(controlled) location.reload();
        controlled=Boolean(navigator.serviceWorker.controller);
      };
      const checkUpdate=()=>{if(navigator.onLine) void registration?.update().catch(()=>{});};
      const mark=()=>{
        if(active&&registration?.waiting&&navigator.serviceWorker.controller) setUpdate(registration.waiting);
      };
      const watchInstall=()=>registration?.installing?.addEventListener('statechange',mark);
      navigator.serviceWorker.addEventListener('controllerchange',refresh);
      window.addEventListener('focus',checkUpdate);
      window.addEventListener('online',checkUpdate);
      void navigator.serviceWorker.register(import.meta.env.BASE_URL+'sw.js',{updateViaCache:'none'}).then(reg=>{
        if(!active)return;
        registration=reg;
        mark();
        watchInstall();
        reg.addEventListener('updatefound',watchInstall);
        void navigator.serviceWorker.ready.then(()=>{if(active)setCached(true);});
      }).catch(()=>{if(active)setStatus({text:'离线资源缓存失败。联网重新打开后可重试。',error:true});});
      return ()=>{
        active=false;
        registration?.removeEventListener('updatefound',watchInstall);
        window.removeEventListener('focus',checkUpdate);
        window.removeEventListener('online',checkUpdate);
        window.removeEventListener('online',signal);window.removeEventListener('offline',signal);
        window.removeEventListener('beforeinstallprompt',install);navigator.serviceWorker.removeEventListener('controllerchange',refresh);
      };
    }
    return ()=>{window.removeEventListener('online',signal);window.removeEventListener('offline',signal);window.removeEventListener('beforeinstallprompt',install);};
  },[]);
  useEffect(()=>{
    document.documentElement.dataset.theme=data?.theme==='深色'?'dark':data?.theme==='浅色'?'light':'system';
  },[data?.theme]);
  function go(target:string) {
    if (target==='食谱') setDay(planDay(data?.plan?.start,dateKey()));
    setPage(target);setStatus(null);window.scrollTo(0,0);
  }
  const quote=useMemo(()=>{
    if(!data?.plan)return;
    const {plan,profile}=data;
    const active=profile?{...plan.profile,tools:profile.tools,frozen:profile.frozen,people:profile.people,prep:profile.prep,trips:profile.trips,budget:profile.budget}:plan.profile;
    return planLogistics(plan.days,active,plan.start,data.pantry,{...data.supply,execution:data.supply?.execution??{}},plan.cookingOverride);
  },[data?.plan,data?.profile,data?.pantry,data?.supply]);
  const notify=(text:string,error=false)=>setStatus({text,error});
  if (fatal) return <main className="container"><Empty title="读取本机数据失败"><p>{fatal}</p><button onClick={()=>location.reload()}>重新读取</button></Empty></main>;
  if (!data) return <main className="container"><p role="status">正在读取本机数据…</p></main>;
  const {profile,weights,plan}=data;
  const pantry=data.pantry;
  let targets=null,reason='';
  if (profile) {
    try {targets=nutrition(profile,weights);}
    catch(e) {reason=errorText(e);}
  }
  const latestWeight=[...weights].sort((a,b)=>b.date.localeCompare(a.date))[0]?.kg??Number(profile?.weight);
  const stale=Boolean(plan && (!['1.2.0','2.0.0','2.1.0',algorithmVersion].includes(plan.algorithmVersion) || !profile || !targets || latestWeight!==plan.weight ||
    Math.abs(targets.kcal-plan.targets.kcal)>.01 || JSON.stringify(planningProfile(profile))!==JSON.stringify(planningProfile(plan.profile)) ||
    plan.days.some(d=>d.meals.some(m=>m.dishes.some(s=>data.blocked.includes(s.recipe.id))))));
  const supply={...data.supply,execution:data.supply?.execution??{}};
  const ledger=currentLedger(pantry,supply);
  const storedSettings=supply.settings??supplyDefaults(profile??plan?.profile??initialProfile);
  const activeSettings=profile?{prep:storedSettings.prep,pattern:storedSettings.pattern,prepDates:storedSettings.prepDates,
    shopping:shoppingSchedule(storedSettings,profile)}:storedSettings;
  const startChoice=supply.startChoice??'明天';
  const profileWithDraft=(current:Profile,values:GenerationDraft):Profile=>({
    ...current,people:values.people,budget:values.budget,cooking:{weekday:'简单',weekend:'家常',...current.cooking,mode:values.cooking},
  });
  const saveGeneration=(settings:PoolSettings,values:GenerationDraft)=>profile?
    mutate({poolSettings:settings,profile:profileWithDraft(profile,values),supply:{...supply,settings:values.settings,startChoice:values.startChoice}},
      '生成设置已保存。'):Promise.resolve(false);
  async function mutate(changes:Partial<Data>,message?:string) {
    if (saving.current) {notify('上一项修改正在保存，请稍后重试。',true);return false;}
    saving.current=true;
    try {
      const next={...data!,...changes};
      await writeData(next,data!);setData(next);
      if(message)notify(message);
      return true;
    } catch(e) {notify(errorText(e),true);return false;}
    finally {saving.current=false;}
  }
  function cancelGeneration() {
    generation.current++;
    stopWorker.current?.();
    stopWorker.current=undefined;
    working.current=false;setBusy(false);
    notify('已取消，现有食谱保持原样。');
  }
  async function generate(change?:Change,settings?:PoolSettings,keep=false,config?:GenerationDraft) {
    if (!profile) {go('编辑档案');return;}
    if (working.current) return;
    working.current=true;setBusy(true);setStatus(null);
    const call=++generation.current;
    try {
      const key=seed.trim()&&!change?seed.trim():crypto.randomUUID().slice(0,12);
      const options={settings:settings??data!.poolSettings??defaultPool,previous:plan?.pool,keep,startChoice:config?.startChoice??startChoice};
      const currentProfile=config?profileWithDraft(profile,config):profile;
      const nextSupply=config?{...supply,settings:config.settings,startChoice:config.startChoice}:supply;
      const args:Parameters<typeof regenerate>=[currentProfile,weights,pantry,data!.blocked,key,
        change?plan??undefined:undefined,stale?[]:data!.locks,change,undefined,nextSupply,options];
      const next=await new Promise<Plan>((resolve,reject)=>{
        const worker=new Worker(new URL('./planner.worker.ts',import.meta.url),{type:'module'});
        stopWorker.current=()=>{worker.terminate();reject(Error('已取消生成。'));};
        worker.onmessage=(event:MessageEvent<{plan?:Plan;error?:string}>)=>{
          worker.terminate();
          if(event.data.plan)resolve(event.data.plan);
          else reject(Error(event.data.error??'生成失败，请重试。'));
        };
        worker.onerror=()=>{worker.terminate();reject(Error('无法开始配餐，请重新打开后重试。'));};
        worker.postMessage(args);
      });
      if(call!==generation.current)return;
      const newQuote=next.logistics!;
      const prior=new Set(quote?.lines.filter(l=>l.need>0).map(l=>l.id)??[]);
      const added=change||keep?newQuote.lines.filter(l=>l.need>0&&!prior.has(l.id)):[];
      const alreadyAllowed=new Set(plan?.pool?.supplements.map(s=>s.id));
      const supplements=change?[]:next.pool?.supplements.filter(s=>!keep||!alreadyAllowed.has(s.id))??[];
      if(added.length||supplements.length) {
        const lines=[
          ...added.map(l=>food(l.id).name+' 净需求 '+l.need+' 克，'+(l.remaining?'还需采购 '+l.remaining+' 克':'可用库存已覆盖')+
            '，'+(l.estimate===null?'价格待补充':'约 ¥'+l.estimate.toFixed(2))),
          ...supplements.map(s=>food(s.id).name+' '+s.grams+' 克，'+s.reason+'，'+(s.cost===null?'价格待补充':'约 ¥'+s.cost.toFixed(2))),
        ];
        if(!confirm('需要补充采购或调整食材口径。确认后才保存方案。\n'+lines.join('\n'))) {
          notify('已保留原方案，可继续调整食材池。');return;
        }
      }
      if (!await mutate({plan:next,locks:stale?[]:data!.locks,...(settings?{poolSettings:settings}:{}),
        ...(config?{profile:currentProfile,supply:nextSupply}:{})})) return;
      if (!change) {go('食谱');setDay(planDay(next.start,dateKey()));}
      const previousBuy=new Map(quote?.lines.map(l=>[l.id,l.remaining]));
      const increased=change?newQuote.lines.filter(l=>l.remaining>(previousBuy.get(l.id)??0)+.01):[];
      const rest=increased.length?(' 预计新增补购 '+increased.slice(0,4).map(l=>food(l.id).name+' '+(l.remaining-(previousBuy.get(l.id)??0)).toFixed(1)+' 克').join('、')+(increased.length>4?'等':'')+'。'):'';
      notify(change?'调整完成，已同步采购和备餐。'+rest:'七天食谱已生成。');
    } catch(e) {if(call===generation.current)notify(errorText(e),true);}
    finally {if(call===generation.current){stopWorker.current=undefined;working.current=false;setBusy(false);}}
  }
  function rule(fixed:string,required:string) {
    if(profile)void mutate({profile:{...profile,fixedBreakfast:fixed,requiredDish:required}},'生成设置已保存。');
  }
  function lock(row:Lock) {
    const matches=(l:Lock)=>l.day===row.day&&l.meal===row.meal&&l.dish===row.dish;
    void mutate({locks:data!.locks.some(matches)?data!.locks.filter(l=>!matches(l)):[...data!.locks,row]});
  }
  function toggle(key:'favorites'|'blocked',id:string) {
    const has=data![key].includes(id);
    if (key==='blocked'&&!has&&!confirm('屏蔽这道菜？下次生成将排除它。')) return;
    void mutate({[key]:has?data![key].filter(s=>s!==id):[...data![key],id]},key==='blocked'?(has?'已解除屏蔽。':'已屏蔽菜品。'):(has?'已移除收藏。':'已收藏。'));
  }
  async function adjust(d:number,m:number,i:number,grams:number[]) {
    if (!plan||!profile||stale) return false;
    try {
      const next=revise(plan,profile,weights,pantry,data!.blocked,d,m,i,grams,supply);
      return await mutate({plan:next},'用量、营养、采购和备餐已更新。');
    } catch(e) {notify(errorText(e),true);return false;}
  }
  async function send(text:string,share:boolean) {
    try {notify(await shareText(text,share));}
    catch(e) {if(!(e instanceof DOMException&&e.name==='AbortError'))notify(errorText(e),true);}
  }
  function savePlan() {
    if(!plan)return;
    const name=prompt('给这份食谱起名',plan.name)?.trim().slice(0,100);
    if(!name)return;
    if(data!.history.length>=500) {notify('历史方案已达存储上限。请备份并移除部分方案。',true);return;}
    void mutate({history:[{...structuredClone(plan),id:crypto.randomUUID(),name,profile:{...plan.profile,people:String(quote?.people??plan.profile.people),budget:quote?.budget?.toString()??''},...(quote?{logistics:structuredClone(quote)}:{})},...data!.history]},'已保存到历史方案。');
  }
  function historyEdit(id:string,fn:(p:Plan)=>Plan) {
    void mutate({history:data!.history.map(p=>p.id===id?fn(p):p)},'历史方案已更新。');
  }
  async function reuse(row:Plan) {
    if (!profile) {notify('请先完成当前档案和健康筛查。',true);return;}
    const start=newPlanStart(startChoice);
    try {
      shoppingOffsets(activeSettings,profile,start,dateKey());
      verifyAgainst(row,profile,weights,pantry,data!.blocked,supply,start);
    }
    catch(e) {notify('当前不可重新使用。'+errorText(e),true);return;}
    if (!confirm('此方案通过当前限制校验，重新使用会覆盖当前食谱并沿用原来的份量。继续？')) return;
    const renewed={...structuredClone(row),logistics:undefined,id:crypto.randomUUID(),start,profile:structuredClone(profile),targets:targets!,weight:latestWeight};
    if(renewed.pool)renewed.pool.week=renewed.start;
    const renewedQuote=planLogistics(renewed.days,profile,start,pantry,supply,renewed.cookingOverride);
    renewed.purchases=purchasesFromLogistics(renewedQuote);
    renewed.prep=prepPlan(renewed.days,profile,renewed.start,renewed.cookingOverride,renewedQuote);
    if(await mutate({plan:renewed,locks:[],pantry}))go('食谱');
  }
  function editHistory(p:Plan) {
    const title=prompt('方案名称',p.name)?.trim().slice(0,100);
    if(title)historyEdit(p.id,row=>({...row,name:title}));
  }
  async function saveProfile(p:Profile) {
    if(await mutate({profile:p})) {go('首页');notify('个人档案已保存到本机。');return true;}
    return false;
  }
  async function restore(file:File) {
    try {
      if (file.size>backupLimit) throw Error('备份文件过大。');
      const state=parseBackup(await file.text());
      if (confirm('用这份备份覆盖本机数据？如需保留现有资料，请先导出。')) await mutate({...state,supply:state.supply,poolSettings:state.poolSettings,poolTemplates:state.poolTemplates},'备份已恢复。');
    } catch(e){notify(errorText(e),true);}
  }
  async function receipt(source:string,value?:Receipt) {
    try {
      const receipts={...supply.receipts};
      const previous=receipts[source];
      if(!value&&previous&&!confirm('撤销这笔购买并扣回 '+decimal(previous.net)+' 克库存？流水会保留撤销记录。'))return false;
      const next=recordPurchase(ledger,source,previous,value,dateKey());
      if(value)receipts[source]=value;
      else delete receipts[source];
      return await mutate({supply:{...supply,receipts,ledger:next}},value?'采购记录已更新。实际库存已入账。':'购买记录已撤销。');
    }catch(e){notify(errorText(e),true);return false;}
  }
  async function task(jobs:Pick<PrepJob,'key'|'ingredients'>[],action:TaskAction,checked:boolean) {
    try {
      const result=executeJobs(ledger,supply.execution,jobs,action,checked,dateKey(),supply.products);
      if(result.withdrawals.length&&!confirm('确认从账面库存取用？\n'+result.withdrawals.map(r=>food(r.id).name+' '+decimal(r.grams)+' 克').join('、')))return false;
      if(action==='取用'&&!checked&&!confirm('撤销这次取用并将已记账净量加回库存？'))return false;
      return await mutate({supply:{...supply,execution:result.execution,ledger:result.ledger}},'备餐进度已更新。');
    }catch(e){notify(errorText(e),true);return false;}
  }
  async function stock(id:string,quantity:number,mode:'增加'|'扣除'|'报损'|'设为') {
    try {
      const next=adjustStock(ledger,id,quantity,mode,dateKey(),'调整|'+crypto.randomUUID()+'|'+id);
      return await mutate({supply:{...supply,ledger:next}},'实际库存已更新。');
    }catch(e){notify(errorText(e),true);return false;}
  }
  async function removeInventory(event:InventoryEvent) {
    if(event.kind==='实际取用'&&event.reference)return task([{key:event.reference,ingredients:[]}],'取用',false);
    if(!confirm('撤销这笔库存调整并按原数量修正余额？流水会保留撤销记录。'))return false;
    try {
      return await mutate({supply:{...supply,ledger:reverseAdjustment(ledger,event.id,dateKey())}},'库存已按撤销修正。');
    }catch(e){notify(errorText(e),true);return false;}
  }
  const supplyActions:SupplyActions={
    task,receipt,
    savePrice:(id,value)=>{
      const book={...supply.prices};
      if(value)book[id]={...value,date:value.date??dateKey()};
      else delete book[id];
      return mutate({supply:{...supply,prices:book},...(value?{}:{pantry:clearLegacyPrices(data.pantry,id)})},value?'食材价格已保存。':'已恢复默认价格。');
    },
    resetPrices:()=>{
      if(confirm('恢复全部广东默认价格及包装口径？已确认购买和家中库存会保留。'))void mutate({supply:{...supply,prices:{}},pantry:clearLegacyPrices(data.pantry)},'已恢复全部默认价格。');
    },
    exportPrices:()=>{
      const legacy:PriceBook=Object.fromEntries(Object.entries(data.pantry).flatMap(([id,old])=>old.price===undefined?[]:[[id,{
        amount:old.price,unit:'公斤',basis:old.yieldPercent?'毛重':'净重',pack:old.pack,yieldPercent:old.yieldPercent,
      }]]));
      downloadFile('天天减-食材价格.json',JSON.stringify({type:'tiantianjian-prices',version:1,prices:{...legacy,...supply.prices}}));
    },
    importPrices:async file=>{
      try {
        if(file.size>1_000_000)throw Error('价格备份文件过大。');
        const prices=parsePriceBackup(await file.text());
        if(confirm('用这份价格备份覆盖自定义价格？'))await mutate({supply:{...supply,prices},pantry:clearLegacyPrices(data.pantry)},'价格备份已恢复。');
      } catch(e){notify(errorText(e),true);}
    },
  };
  const shoppingOutput={
    copy:(text:string,share?:boolean)=>void send(text,!!share),
    download:(text:string)=>downloadFile('天天减-采购清单.txt',text,'text/plain;charset=utf-8'),
  };
  function repriceHistory() {
    if(!archived)return;
    if(historyQuote){setHistoryQuote(undefined);return;}
    const profile={...archived.profile,people:String(archived.logistics?.people??archived.profile.people)};
    const pricing=clearLegacyPurchases(data!.pantry);
    for(const item of archived.logistics?.inventory??[]) pricing[item.id]={...pricing[item.id],stock:item.home};
    const quoted=planLogistics(archived.days,profile,archived.start,pricing,
      {prices:supply.prices,settings:archived.logistics?.settings,products:supply.products},archived.cookingOverride);
    setHistoryQuote(quoted);
    notify('已使用当前价格重新估算，历史快照保持原值。');
  }
  const livePool=plan?.pool&&quote?buildWeeklyPool(plan.start,plan.pool.settings,
    plan.pool.selected.filter(id=>!plan.pool!.supplements.some(s=>s.id===id)),plan.pool.selected,plan.days,quote,supply.products):plan?.pool;
  const planProps={
    profile,busy,stale,day,setDay,locks:data.locks,favorites:data.favorites,generate:()=>void generate(),
    editProfile:()=>go('编辑档案'),openHistory:()=>go('历史方案'),change:(p:Change)=>void generate(p),lock,
    favorite:(id:string)=>toggle('favorites',id),block:(id:string)=>toggle('blocked',id),revise:adjust,save:savePlan,
    products:supply.products,livePool,openPool:()=>go('生成设置'),keepPool:()=>void generate(undefined,plan?.pool?.settings,true),
    execution:supply.execution,mealJobs:quote?.prep.flatMap(b=>b.jobs)??[],completeMeal:(jobs:PrepJob[])=>task(jobs,'用餐',true),
    share:(p:Plan,share:boolean)=>void send(planText(p),share),exportText:(p:Plan)=>downloadFile('天天减-七天食谱.txt',planText(p),'text/plain;charset=utf-8'),
  };

  return <>
    <header className="topbar"><div className="shell topbar-inner"><button className="brand" onClick={()=>go('首页')}>
      <img src={import.meta.env.BASE_URL+'icon-192.png'} alt=""/><span>天天减</span></button>
      <button className="top-profile" aria-label="我的档案与设置" onClick={()=>go('我的')}>{profile?.name?.slice(0,1)||'我'}</button>
    </div></header>
    <main className="shell container">
      {busy&&<div className="hint generation-progress" role="status"><span>正在搭配未来七天的食谱…</span><button onClick={cancelGeneration}>取消生成</button></div>}
      {(offline||update)&&<div className="hint network">{offline?'当前离线，已缓存的功能仍可使用。':''}{update&&<button onClick={()=>update.postMessage('UPDATE')}>应用新版本</button>}</div>}
      {status&&<div className={'notice '+(status.error?'error':'')} role={status.error?'alert':'status'}><span>{status.text}</span><button aria-label="关闭提示" onClick={()=>setStatus(null)}>×</button></div>}
      {page==='首页'&&<Dashboard quote={quote} poolCount={quote?.lines.filter(r=>r.uses.length>0).length??0} profile={profile} t={targets} reason={reason} weights={weights} plan={plan} stale={stale}
        poolMode={(data.poolSettings??defaultPool).mode} schedule={profile?shoppingSchedule(activeSettings,profile).count:undefined}
        prep={activeSettings.prep} execution={supply.execution} generate={()=>void generate()} busy={busy} go={go} edit={()=>go('编辑档案')}
        write={rows=>mutate({weights:rows},'称重记录已保存。')}/>}
      {page==='编辑档案'&&<><div className="page-title"><div><h1>{profile?'编辑个人档案':'建立个人档案'}</h1><p>身体数据只保存在当前浏览器。</p></div></div>
        <ProfileForm value={profile} onSave={saveProfile} onCancel={()=>go(profile?'我的':'首页')}/></>}
      {page==='食谱'&&<PlanPage plan={plan} {...planProps}/>}
      {page==='生成设置'&&profile&&<PoolPage initial={data.poolSettings??defaultPool} previous={plan?.pool}
        templates={data.poolTemplates??[]} pantry={data.pantry} busy={busy} supply={activeSettings} profile={profile}
        products={supply.products} startChoice={startChoice} onGenerate={(settings,keep,config)=>void generate(undefined,settings,keep,config)}
        onSave={saveGeneration}
        onTemplate={(name,settings)=>data.poolTemplates?.length===50?Promise.resolve(false):
          mutate({poolTemplates:[...(data.poolTemplates??[]),{id:crypto.randomUUID(),name,settings}]},'已收藏食材池模板。')}>
        <details className="card settings"><summary>固定搭配与随机种子</summary>
          <div className="fields"><label className="field">固定早餐<select value={profile.fixedBreakfast} onChange={e=>rule(e.target.value,profile.requiredDish)}>
            <option value="">随机搭配</option>{profile.fixedBreakfast&&![...breakfastMenus,...fixedBreakfasts].some(r=>r.id===profile.fixedBreakfast)&&
              <option value={profile.fixedBreakfast}>已保存的旧版早餐设置</option>}
            <optgroup label="固定完整搭配">{breakfastMenus.map(m=><option key={m.id} value={m.id}>{menuName(m.recipes)}</option>)}</optgroup>
            <optgroup label="只固定主食">{fixedBreakfasts.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</optgroup></select></label>
            <label className="field">本周必须包含<select value={profile.requiredDish} onChange={e=>rule(profile.fixedBreakfast,e.target.value)}>
              <option value="">不指定</option>{recipeList.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
            <label className="field">随机种子（选填）<input value={seed} onChange={e=>setSeed(e.target.value)} maxLength={100}/></label></div>
        </details>
        <MealSettings key={JSON.stringify(profile.mealPreferences)} profile={profile} onSave={mealPreferences=>
          mutate({profile:{...profile,mealPreferences}},'分餐偏好已保存。重新生成后生效。')}/>
      </PoolPage>}
      {(['采购','备餐'].includes(page))&&<ShoppingPage key={page} plan={plan} quote={quote}
        state={supply} actions={supplyActions} initialTab={page==='备餐'?'备餐清单':'采购清单'} onSettings={()=>go('生成设置')} {...shoppingOutput}/>}
      {page==='食材价格'&&<><div className="page-title"><h1>食材价格</h1><button onClick={()=>go('我的')}>返回我的</button></div>
        <PriceManager book={supply.prices??{}} pantry={pantry} products={supply.products} save={supplyActions.savePrice}
          saveProducts={products=>mutate({supply:{...supply,products}},'换算与采购费用已更新。')}
          resetAll={supplyActions.resetPrices} exportPrices={supplyActions.exportPrices} importPrices={supplyActions.importPrices}/></>}
      {page==='库存'&&<><div className="page-title"><h1>库存</h1><button onClick={()=>go('我的')}>返回我的</button></div>
        <InventoryManager pantry={pantry} prices={supply.prices??{}} ledger={ledger} receipts={supply.receipts??{}} execution={supply.execution}
          inventory={Object.fromEntries(quote?.inventory.map(row=>[row.id,row])??[])}
          save={stock} savePurchase={receipt} reverse={removeInventory}
          review={async(id,grams)=>{
            try {
              return await mutate({supply:{...supply,ledger:resolveReview(ledger,id,grams,dateKey())}},'旧库存已核对。');
            }catch(e){notify(errorText(e),true);return false;}
          }}/>
      </>}
      {page==='菜谱库'&&<Library favorites={data.favorites} blocked={data.blocked} toggleFavorite={planProps.favorite} toggleBlocked={planProps.block}/>}
      {page==='我的'&&<>
        <div className="page-title"><div><h1>我的</h1><p>管理档案、历史和本机设置。</p></div></div>
        <section className="card"><SectionTitle title="个人档案"/><p>{profile?(profile.name||'已保存档案')+' · '+profile.goal:'还没有个人档案'}</p>
          {profile?.conditions.includes('脂肪肝')&&<p className="hint">一般饮食建议是少喝含糖饮料与酒，少吃添加糖，完整水果仍可适量食用。</p>}
          {profile?.conditions.includes('痤疮')&&<p className="hint">饮食与痤疮的相关证据有限。按个人耐受选择乳制品，症状持续时可咨询医生。</p>}
          <div className="actions"><button className="primary" onClick={()=>go('编辑档案')}>{profile?'编辑档案':'填写档案'}</button>
            <button onClick={()=>go('历史方案')}>历史方案 · {data.history.length}</button><button onClick={()=>go('食材价格')}>食材价格</button><button onClick={()=>go('库存')}>家中库存</button><button onClick={()=>go('菜谱库')}>菜谱库与收藏</button></div>
        </section>
        {profile&&<details className="card group-fold"><summary>饮食、厨具与采购偏好</summary>
          <p>{profile.meals==='4'?'三餐和加餐':profile.meals==='2'?'两餐':'三餐'} · {profile.cooking?.mode??'简单'}烹饪 · {supply.settings?.prep??supplyDefaults(profile).prep}备餐</p>
          <p className="meta">{profile.tools.join('、')||'未选择厨具'}</p>
          <div className="actions"><button onClick={()=>go('生成设置')}>本周生成偏好</button></div>
        </details>}
        <section className="card"><SectionTitle title="外观与安装"><span className="meta">V{version}</span></SectionTitle><label className="field">外观<select value={data.theme} onChange={e=>void mutate({theme:e.target.value as Data['theme']})}><option>系统</option><option>浅色</option><option>深色</option></select></label>
          <p className="meta">{cached?'离线资源已缓存。':'首次成功缓存后可离线查看和生成食谱。'}</p>
          {canInstall&&<button onClick={()=>void canInstall.prompt().then(()=>canInstall.userChoice).then(()=>setInstall(null)).catch(e=>notify(errorText(e),true))}>安装天天减</button>}
          <details><summary>添加到主屏幕</summary><p>安卓 Chrome 打开浏览器右上角菜单，选「安装应用」或「添加到主屏幕」。iPhone 用 Safari 打开，点分享，再选「添加到主屏幕」。</p></details>
        </section>
        <section className="card"><SectionTitle title="本机数据与备份"/><p>同一设备和浏览器共享本机存储。换手机、使用隐私浏览或清除站点数据可能丢失档案和记录。建议定期导出备份，备份含健康信息，请妥善保存。</p>
          <div className="actions"><button onClick={()=>downloadFile('天天减-个人备份-'+dateKey()+'.json',JSON.stringify(data))}>导出个人备份</button>
            <label className="file-button">导入并恢复<input type="file" aria-label="导入并恢复" accept=".json,application/json" onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(f)void restore(f);}}/></label>
            <button className="danger" onClick={()=>setConfirmDelete(true)}>删除全部数据</button>
          </div>
          {confirmDelete&&<div className="hint"><p>删除本机的档案、食谱、库存和体重记录。请确认已取得需要的备份。</p><div className="actions">
            <button onClick={()=>setConfirmDelete(false)}>取消</button><button className="danger" onClick={()=>void mutate({...fresh(),supply:undefined,poolTemplates:undefined},'本机个人数据已清除。').then(ok=>{if(ok)setConfirmDelete(false);})}>确认删除</button></div></div>}
        </section>
        <details className="card group-fold"><summary>隐私与健康说明</summary><p>应用无需账号。档案、体重及健康信息在设备上处理，分享食谱只包含餐次、菜名和食材重量。访问网站由静态托管服务处理普通网页请求。</p>
          <p>营养计算是面向一般成年人的估算。涉及疾病、药物和特殊饮食医嘱时，请向医生或注册营养师咨询。食物过敏者需核查包装标签和厨房交叉接触。</p></details>
      </>}
      {page==='历史方案'&&<>
        <div className="page-title"><div><h1>历史方案</h1><p>保留每次保存时的完整搭配和营养信息。</p></div><button onClick={()=>go('食谱')}>返回食谱</button></div>
        {data.history.length?data.history.map(p=><section className="card history-item" key={p.id}><SectionTitle title={p.name}/>
          <p className="meta">从 {p.start} 起 · 七天 · 生成体重 {p.weight} 千克 · {p.favorite?'已收藏':'历史方案'}</p>
          <div className="actions">
            <button onClick={()=>{setArchived(p);setHistoryQuote(undefined);setDay(0);go('查看历史');}}>查看</button><button onClick={()=>editHistory(p)}>改名</button>
            <button onClick={()=>historyEdit(p.id,row=>({...row,favorite:!row.favorite}))}>{p.favorite?'取消收藏':'收藏'}</button>
            <button onClick={()=>{if(data.history.length>=500){notify('历史方案已达存储上限。',true);return;}void mutate({history:[{...structuredClone(p),id:crypto.randomUUID(),name:p.name.slice(0,95)+'（副本）'},...data.history]},'已复制方案。');}}>复制方案</button>
            <button onClick={()=>void reuse(p)}>重新使用</button><button onClick={()=>planProps.exportText(p)}>导出食谱</button>
            <button onClick={()=>planProps.share(p,true)}>分享</button>
            <button className="danger" onClick={()=>{if(confirm('删除这份历史方案？'))void mutate({history:data.history.filter(row=>row.id!==p.id)},'已删除方案。');}}>删除</button>
          </div></section>):<Empty title="还没有历史方案"><p>在食谱页面点「保存到历史」，即可随时找回。</p></Empty>}
      </>}
      {page==='查看历史'&&archived&&<><button onClick={()=>go('历史方案')}>返回历史</button><PlanPage {...planProps} plan={archived} readonly stale={false}/>
        <ShoppingPage plan={archived} quote={historyQuote??archived.logistics}
          reprice={repriceHistory} repriced={Boolean(historyQuote)} {...shoppingOutput}/></>}
    </main>
    <nav className="bottom-nav" aria-label="主导航"><div className="shell">{pages.map((p,i)=><button key={p} aria-current={page===p||p==='采购'&&page==='备餐'||p==='我的'&&['食材价格','库存','菜谱库','历史方案'].includes(page)?'page':undefined} onClick={()=>go(p)}>
      <span aria-hidden="true">{icons[i]}</span>{p}</button>)}</div></nav>
  </>;
}

createRoot(document.getElementById('root')!).render(<StrictMode><App/></StrictMode>);
