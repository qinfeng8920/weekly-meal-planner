import {Action,Icon,IconButton,knownLayer,ListRow,PageHeader,resetRememberedViews,Sheet,Skeleton,type IconName} from './design';
import {createPortal} from 'react-dom';
import {PoolPage,type GenerationDraft,type PreferenceUpdate} from './PoolPage';
import {executeJobs,type TaskAction} from './execution';
import {adjustStock,balances,clearInventory,currentLedger,recordPurchase,resolveReview,reverseAdjustment,undoInventoryClear,type InventoryEvent} from './inventory';
import type {PrepJob,Receipt} from './logistics';
import {food,recipeList,type Recipe} from './catalog';
import {buildWeeklyPool,counts,defaultPool,poolGroups,setFoodPreference,migratePreferences,weekUsage,type FoodState,type GenerationAction} from './ingredient-pool';
import {InventoryManager,PriceManager} from './SupplyEditors';
import {MealSettings} from './MealSettings';
import {breakfastMenus,fixedBreakfasts,menuName} from './meal-catalog';
import {version} from '../package.json';
import type {CookingProfile} from './cooking-profile';
import {StrictMode,Suspense,lazy,useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Dashboard} from './Dashboard';
import {BackupImport,ProfileManager} from './ProfileManager';
import {ProfileForm} from './ProfileForm';
import {PlanPage} from './PlanPage';
import {coreSignature} from './food-semantics';
import {labels} from './meal-catalog';
import {recipeFitsMeal} from './meal-rules';
import {ShoppingPage,type SupplyActions} from './ShoppingPage';
import {dateKey,initialProfile,type MealName,type Profile,type Weight} from './profile';
import {addDays,shoppingOffsets,shoppingSchedule,supplyDefaults} from './batches';
import {planLogistics,repriceSnapshot,type Logistics} from './logistics';
import {parsePriceBackup} from './logistics-storage';
import {amountFor,priceFor,type PriceBook} from './prices';
import {energyNeedsReview,nutrition} from './nutrition';
import {validWeights,weightInRange,weightTrend} from './weight';
import {algorithmVersion,compatibleVersion,executionLocked,replacementRestrictions,newPlanStart,regenerate,revise,verifyAgainst,type Change,type Lock,type Plan,type StartChoice} from './planner';
import {prepPlan,purchasesFromLogistics,type Pantry} from './shopping';
import {DataConflict,addProfile,downloadFile,exportProfiles,exportRawLocalData,loadData,loadDirectory,removeProfile,restoreProfiles,selectProfile,storageChannel,writeData,type Data,type ProfileDirectory} from './store';
import {decimal,Empty,planText,SectionTitle,shareText,planDay} from './ui';
import './style.css';

const Library=lazy(()=>import('./Library').then(file=>({default:file.Library})));
const IngredientsLibrary=lazy(()=>import('./IngredientsLibrary').then(file=>({default:file.IngredientsLibrary})));
const pages=['首页','食谱','采购','我的'];
const icons:IconName[]=['home','book','basket','user'];
const routes:Record<string,{title:string;parent:string}>={
  编辑档案:{title:'个人档案',parent:'我的'},生成设置:{title:'生成设置',parent:'食谱'},备餐:{title:'备餐清单',parent:'采购'},
  库存:{title:'家中库存',parent:'我的'},食材价格:{title:'食材价格',parent:'我的'},菜谱库:{title:'食谱大全',parent:'我的'},
  原材料大全:{title:'原材料大全',parent:'我的'},历史方案:{title:'历史方案',parent:'我的'},查看历史:{title:'方案详情',parent:'历史方案'},
};
type InstallEvent=Event&{prompt:()=>Promise<void>;userChoice:Promise<{outcome:string}>};
const safetyProfile=(p:Profile)=>JSON.stringify({
  screened:p.screened,allergyChecked:p.allergyChecked,risks:p.risks,conditions:p.conditions,otherHealth:p.otherHealth,
  allergens:p.allergens,avoid:p.avoid,tools:p.tools,meals:p.meals,fruit:p.fruit,fruitGrams:p.fruitGrams,dairy:p.dairy,
  sex:p.sex,age:p.age,height:p.height,
});
const planNeedsReview=(plan:Plan,profile:Profile,blocked:string[])=>!compatibleVersion(plan.algorithmVersion)
  ||safetyProfile(profile)!==safetyProfile(plan.profile)||plan.days.some(day=>day.meals.some(meal=>meal.dishes.some(dish=>blocked.includes(dish.recipe.id))));
function clearLegacyPrices(pantry:Pantry,id?:string) {
  return Object.fromEntries(Object.entries(pantry).map(([key,item])=>[key,
    !id||key===id?{...item,price:undefined,pack:undefined,yieldPercent:undefined}:item]));
}
const errorText=(e:unknown)=>e instanceof Error?e.message:'操作未完成，请重试。';

type ProfileView={directory:ProfileDirectory;editing?:string;message?:string};
type DirectoryAction=()=>Promise<{editing?:string;message?:string;followPointer?:boolean}|void>;

function AppRoot() {
  const [view,setView]=useState<ProfileView>();
  const [fatal,setFatal]=useState('');
  const active=useRef<string|null|undefined>(undefined),changing=useRef(false),reading=useRef(0);
  useEffect(()=>{
    let mounted=true;
    const reload=async()=>{
      const request=++reading.current;
      try{
        const directory=await loadDirectory();
        if(!mounted||request!==reading.current||changing.current)return;
        // 已打开的标签页继续编辑自己的档案。被删除时才跟随有效指针。
        if(active.current&&directory.profiles.some(entry=>entry.id===active.current))directory.activeProfileId=active.current;
        if(active.current!==directory.activeProfileId)resetRememberedViews();
        active.current=directory.activeProfileId;
        setView(previous=>previous?.directory.activeProfileId===directory.activeProfileId?{...previous,directory}:{directory});
      }catch(e){if(mounted)setFatal(errorText(e));}
    };
    void reload();
    const channel=typeof BroadcastChannel==='undefined'?undefined:new BroadcastChannel(storageChannel);
    channel?.addEventListener('message',reload);
    return ()=>{mounted=false;channel?.close();};
  },[]);
  const change=async(action:DirectoryAction)=>{
    if(changing.current)throw Error('正在更新档案，请稍候。');
    changing.current=true;
    try{
      const result=await action(),directory=await loadDirectory();
      if(!result?.editing&&!result?.followPointer&&active.current&&directory.profiles.some(entry=>entry.id===active.current))
        directory.activeProfileId=active.current;
      if(directory.activeProfileId!==active.current)resetRememberedViews();
      active.current=directory.activeProfileId;
      setView({directory,...result});
    }finally{changing.current=false;}
  };
  if(fatal)return <main className="shell container"><Empty title="读取本机数据失败"><p>{fatal}</p><button onClick={()=>location.reload()}>重新读取</button>
    <button onClick={()=>void exportRawLocalData().then(json=>downloadFile('天天减-原始数据.json',json)).catch(e=>setFatal(errorText(e)))}>导出本机原始数据</button></Empty></main>;
  if(!view)return <main className="shell container"><Skeleton label="正在读取本机档案…"/></main>;
  return <App key={view.directory.activeProfileId??'empty'} {...view} changeDirectory={change}/>;
}
function App({directory,editing,message,changeDirectory}:ProfileView&{changeDirectory:(action:DirectoryAction)=>Promise<void>}) {
  const profileId=directory.activeProfileId;
  const firstPage=editing&&editing===profileId?'编辑档案':'首页';
  const [data,setData]=useState<Data|null>(null);
  const [fatal,setFatal]=useState('');
  const [page,setPage]=useState(firstPage),[status,setStatus]=useState<{text:string;error?:boolean}|null>(message?{text:message}:null);
  const pageRef=useRef(firstPage),position=useRef(0);
  const scrollPositions=useRef(new Map<number,number>()),skipPop=useRef(false);
  const [day,setDay]=useState(0),[seed,setSeed]=useState(''),[archived,setArchived]=useState<Plan|null>(null);
  const [historyQuote,setHistoryQuote]=useState<Logistics|undefined>();
  const [busy,setBusy]=useState(false),[offline,setOffline]=useState(!navigator.onLine),[cached,setCached]=useState(false);
  const [libraryQuery,setLibraryQuery]=useState('');
  const [update,setUpdate]=useState<ServiceWorker|null>(null),[canInstall,setInstall]=useState<InstallEvent|null>(null);
  const [confirmDelete,setConfirmDelete]=useState(false);
  const [manage,setManage]=useState(false),[importing,setImporting]=useState(false);
  const [overlayBody,setOverlayBody]=useState<Element|null>(null);
  useEffect(()=>{
    const changed=()=>setOverlayBody([...document.querySelectorAll('dialog[open] .sheet-body')].at(-1)??null);
    window.addEventListener('ttj-layer-change',changed);
    return ()=>window.removeEventListener('ttj-layer-change',changed);
  },[]);
  const pendingWrites=useRef(0),writeFailed=useRef(false),preferenceQueue=useRef<Promise<unknown>>(Promise.resolve());
  const unsaved=useRef(false);
  const markSettingsDirty=useCallback((value:boolean)=>{unsaved.current=value;},[]);
  useEffect(()=>{
    const beforeUnload=(event:BeforeUnloadEvent)=>{
      if(unsaved.current||pendingWrites.current){event.preventDefault();event.returnValue='';}
    };
    window.addEventListener('beforeunload',beforeUnload);
    return ()=>window.removeEventListener('beforeunload',beforeUnload);
  },[]);
  useEffect(()=>{
    window.history.scrollRestoration='manual';
    window.history.replaceState({ttjPage:firstPage,ttjPosition:0,ttjProfile:profileId},'');
    const onPop=(event:PopStateEvent)=>{
      if(event.state?.ttjLayer&&!knownLayer(event.state.ttjLayer)){window.history.back();return;}
      const target=event.state?.ttjProfile===profileId?event.state?.ttjPage??'首页':'首页';
      const next=Number(event.state?.ttjPosition??0);
      if(skipPop.current){skipPop.current=false;return;}
      if(target===pageRef.current)return;
      if(['生成设置','编辑档案'].includes(pageRef.current)&&unsaved.current&&!confirm('有改动尚未保存。离开并放弃改动？')) {
        skipPop.current=true;window.history.go(position.current-next);return;
      }
      unsaved.current=false;
      scrollPositions.current.set(position.current,window.scrollY);
      pageRef.current=target;position.current=next;setPage(target);setStatus(null);
      requestAnimationFrame(()=>requestAnimationFrame(()=>window.scrollTo(0,scrollPositions.current.get(next)??0)));
    };
    window.addEventListener('popstate',onPop);
    return ()=>window.removeEventListener('popstate',onPop);
  },[]);
  const saving=useRef(false),working=useRef(false);
  const generation=useRef(0);
  const stopWorker=useRef<(()=>void)|undefined>(undefined);
  useEffect(()=>()=>stopWorker.current?.(),[]);

  useEffect(()=>{
    let active=true;
    const reload=()=>void loadData(profileId).then(d=>{if(active)setData(d);}).catch(e=>{if(active)setFatal(errorText(e));});
    reload();
    const channel=typeof BroadcastChannel==='undefined'?undefined:new BroadcastChannel(storageChannel);
    channel?.addEventListener('message',event=>{
      if(event.data?.id===profileId||!event.data?.id)void loadData(profileId).then(d=>{if(active)setData(d);}).catch(()=>{});
    });
    return ()=>{active=false;channel?.close();};
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
    if(target==='编辑档案'&&profileId===null){void profileAction('新建');return;}
    if(['生成设置','编辑档案'].includes(page)&&target!==page&&unsaved.current) {
      if(!confirm('基本或采购设置尚未保存。离开并放弃这些改动？食材偏好会继续自动保存。'))return;
      unsaved.current=false;
    }
    if(target===pageRef.current){window.scrollTo(0,0);return;}
    scrollPositions.current.set(position.current,window.scrollY);
    position.current++;
    pageRef.current=target;
    window.history.pushState({ttjPage:target,ttjPosition:position.current,ttjProfile:profileId},'');
    if(target==='食谱')setDay(planDay(data?.plan?.start,dateKey()));
    setPage(target);setStatus(null);window.scrollTo(0,0);
  }
  const goBack=()=>position.current>0?window.history.back():go(routes[page]?.parent??'首页');
  const [today,setToday]=useState(dateKey);
  useEffect(()=>{
    const refresh=()=>setToday(dateKey());
    const interval=window.setInterval(refresh,30000);
    document.addEventListener('visibilitychange',refresh);
    window.addEventListener('focus',refresh);
    return ()=>{window.clearInterval(interval);document.removeEventListener('visibilitychange',refresh);window.removeEventListener('focus',refresh);};
  },[]);
  const quote=useMemo(()=>{
    if(!data?.plan)return;
    const {plan,profile}=data;
    const active=profile?{...plan.profile,tools:profile.tools,frozen:profile.frozen,people:profile.people,prep:profile.prep,trips:profile.trips,budget:profile.budget}:plan.profile;
    return planLogistics(plan.days,active,plan.start,data.pantry,{...data.supply,execution:data.supply?.execution??{}},plan.cookingOverride,undefined,plan.taskScope??null);
  },[data?.plan,data?.profile,data?.pantry,data?.supply]);
  const notify=(text:string,error=false)=>setStatus({text,error});
  if (fatal) return <main className="container"><Empty title="读取本机数据失败"><p>{fatal}</p><button onClick={()=>location.reload()}>重新读取</button></Empty></main>;
  if (!data) return <main className="shell container"><Skeleton label="正在读取本机数据…"/></main>;
  const {profile,weights,plan}=data;
  const pantry=data.pantry;
  let targets=null,reason='';
  if (profile) {
    try {targets=nutrition(profile,weights,today);}
    catch(e) {reason=errorText(e);}
  }
  const latestWeight=profile?weightTrend(profile,weights,today).current:0;
  const stale=Boolean(plan&&(!profile||!targets||planNeedsReview(plan,profile,data.blocked)||energyNeedsReview(plan.targets,targets)));
  const targetChanged=Boolean(plan&&targets&&(targets.kcal!==plan.targets.kcal||
    targets.protein!==plan.targets.protein||targets.carbs!==plan.targets.carbs||targets.fat!==plan.targets.fat));
  const supply={...data.supply,execution:data.supply?.execution??{}};
  const ledger=currentLedger(pantry,supply);
  const storedSettings=supply.settings??supplyDefaults(profile??plan?.profile??initialProfile);
  const activeSettings=profile?{prep:storedSettings.prep,pattern:storedSettings.pattern,prepDates:storedSettings.prepDates,
    shopping:shoppingSchedule(storedSettings,profile)}:storedSettings;
  const startChoice=supply.startChoice??'明天';
  const profileWithDraft=(current:Profile,values:GenerationDraft):Profile=>({
    ...current,people:values.people,budget:values.budget,cooking:{weekday:'简单',weekend:'家常',...current.cooking,mode:values.cooking},
  });
  function queuePreferenceWrite(update:(current:Data)=>Data,message?:string) {
    pendingWrites.current++;
    const result=preferenceQueue.current.then(async()=>{
      for(let attempt=0;attempt<5;attempt++) {
        try {
          const current=await loadData(profileId);
          const next=update(current);
          await writeData(profileId,next,current);
          setData(await loadData(profileId));
          if(message)notify(message);
          return true;
        }catch(error) {
          if(error instanceof DataConflict&&attempt<4)continue;
          notify(errorText(error),true);
          try {setData(await loadData(profileId));} catch { /* 已显示保存错误。 */ }
          return false;
        }
      }
      return false;
    }).finally(()=>{pendingWrites.current--;});
    preferenceQueue.current=result;
    return result;
  }
  const changePreferences=(update:PreferenceUpdate)=>queuePreferenceWrite(current=>({...current,
    poolSettings:migratePreferences(update(current.poolSettings??defaultPool),current.supply?.products)})).then(ok=>{
      if(!ok)writeFailed.current=true;
      return ok;
    });
  const saveGeneration=(values:GenerationDraft)=>queuePreferenceWrite(current=>{
    if(!current.profile)throw Error('请先保存个人档案。');
    return {...current,profile:profileWithDraft(current.profile,values),supply:{...current.supply,settings:values.settings,startChoice:values.startChoice}};
  },'生成设置已保存。').then(ok=>{if(ok)writeFailed.current=false;return ok;});
  async function mutate(changes:Partial<Data>,message?:string) {
    if (saving.current) {notify('上一项修改正在保存，请稍后重试。',true);return false;}
    saving.current=true;
    try {
      const next={...data!,...changes};
      await writeData(profileId,next,data!);setData(next);
      if(message)notify(message);
      return true;
    } catch(e) {
      if(e instanceof DataConflict) {
        try {setData(await loadData(profileId));} catch(reloadError) {notify(errorText(reloadError),true);return false;}
      }
      notify(errorText(e),true);return false;
    } finally {saving.current=false;}
  }
  function cancelGeneration() {
    generation.current++;
    stopWorker.current?.();
    stopWorker.current=undefined;
    working.current=false;setBusy(false);
    notify('已取消，现有食谱保持原样。');
  }
  async function generate(change?:Change,action:GenerationAction='重新搭配',updateCurrent=false) {
    if (!profile) {go('编辑档案');return;}
    if (working.current) return;
    working.current=true;setBusy(true);setStatus(null);
    const call=++generation.current;
    try {
      if(await preferenceQueue.current===false||writeFailed.current)throw Error('最近一次设置未能保存，请核对后再次保存设置。');
      if(call!==generation.current)return;
      const current=await loadData(profileId);
      const currentProfile=current.profile;
      if(!currentProfile)throw Error('请先保存个人档案。');
      const currentPlan=current.plan;
      const currentTargets=nutrition(currentProfile,current.weights);
      if(change&&currentPlan&&(planNeedsReview(currentPlan,currentProfile,current.blocked)||energyNeedsReview(currentPlan.targets,currentTargets)))
        throw Error('档案或强制限制已变化，请先更新未执行食谱。');
      const nextSupply={...current.supply,execution:current.supply?.execution??{}};
      const activeSettings=current.poolSettings??defaultPool;
      const settings=change?{...activeSettings,planCaps:currentPlan?.pool?.settings.planCaps}:activeSettings;
      const keep=action==='沿用食材';
      const key=seed.trim()&&!change?seed.trim():crypto.randomUUID().slice(0,12);
      const options={settings,previous:currentPlan?.pool,action,updateCurrent,startChoice:nextSupply.startChoice??'明天' as const};
      const resume=currentPlan&&(change||keep||updateCurrent||currentPlan.start<dateKey()||current.locks.length>0||currentPlan.days.some((_,i)=>executionLocked(currentPlan,nextSupply.execution,i)))?currentPlan:undefined;
      const args:Parameters<typeof regenerate>=[currentProfile,current.weights,current.pantry,current.blocked,key,
        resume??undefined,current.locks,change,undefined,nextSupply,options];
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
      const invalidLock=current.locks.find(lock=>{
        const row=next.days[lock.day]?.meals[lock.meal]?.dishes[lock.dish];
        return row?.recipe.id!==lock.serving.recipe.id||JSON.stringify(row.ingredients)!==JSON.stringify(lock.serving.ingredients);
      });
      if(invalidLock)throw Error('锁定菜「'+invalidLock.serving.recipe.name+'」与本次餐次或份量冲突。请核对锁定后重试。');
      const newQuote=next.logistics!;
      const priorQuote=currentPlan?planLogistics(currentPlan.days,currentProfile,currentPlan.start,current.pantry,nextSupply,currentPlan.cookingOverride,undefined,currentPlan.taskScope??null):undefined;
      const prior=new Set(priorQuote?.lines.filter(l=>l.need>0).map(l=>l.id)??[]);
      const added=change||keep?newQuote.lines.filter(l=>l.remaining>0&&!prior.has(l.id)):[];
      const alreadyAllowed=new Set(currentPlan?.pool?.supplements.map(s=>s.id));
      const supplements=change?[]:next.pool?.supplements.filter(s=>!keep||!alreadyAllowed.has(s.id))??[];
      const stockedAdditions=change&&!change.expandPool&&currentPlan?.pool?next.pool?.used.filter(row=>
        !prior.has(row.id)&&!added.some(line=>line.id===row.id))??[]:[];
      if(added.length||supplements.length||stockedAdditions.length) {
        const lines=[
          ...added.map(l=>food(l.id).name+' 净需求 '+l.need+' 克，'+(l.remaining?'还需采购 '+l.remaining+' 克':'可用库存已覆盖')+
            '，'+(l.estimate===null?'价格待补充':'约 ¥'+l.estimate.toFixed(2))),
          ...stockedAdditions.map(row=>food(row.id).name+' 将加入本周食材，现有库存已覆盖。'),
          ...supplements.map(s=>food(s.id).name+' '+s.grams+' 克，'+s.reason+'，'+(s.cost===null?'价格待补充':'约 ¥'+s.cost.toFixed(2))),
        ];
        if(!confirm('需要补充采购或调整食材口径。确认后才保存方案。\n'+lines.join('\n'))) {
          notify('已保留原方案，可继续调整食材池。');return;
        }
      }
      const nextSettings=change&&next.pool&&(change.expandPool||change.weekFruit||change.swapMode&&next.pool.settings.fruitPolicy==='每周固定一种')
        ?{...next.pool.settings,planCaps:undefined}:current.poolSettings;
      const updated={...current,plan:next,locks:current.locks,poolSettings:nextSettings};
      await writeData(profileId,updated,current);
      setData(await loadData(profileId));
      if (!change) {go('食谱');setDay(planDay(next.start,dateKey()));}
      else if(page==='菜谱库') {go('食谱');setDay(change.day);}
      const previousBuy=new Map(priorQuote?.lines.map(l=>[l.id,l.remaining]));
      const increased=change?newQuote.lines.filter(l=>l.remaining>(previousBuy.get(l.id)??0)+.01):[];
      const rest=increased.length?(' 预计新增补购 '+increased.slice(0,4).map(l=>food(l.id).name+' '+(l.remaining-(previousBuy.get(l.id)??0)).toFixed(1)+' 克').join('、')+(increased.length>4?'等':'')+'。'):'';
      notify(change?'调整完成，已同步采购和备餐。'+rest:'七天食谱已生成。');
    } catch(e) {
      if(call===generation.current){
        if(e instanceof DataConflict)try {setData(await loadData(profileId));}catch { /* 保留现有页面数据。 */ }
        notify(errorText(e),true);
      }
    }
    finally {if(call===generation.current){stopWorker.current=undefined;working.current=false;setBusy(false);}}
  }
  function rule(fixed:string,required:string) {
    if(profile)void queuePreferenceWrite(current=>current.profile?{...current,profile:{...current.profile,fixedBreakfast:fixed,requiredDish:required}}:current,
      '生成设置已保存。');
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
    const keys=new Set(quote?.prep.flatMap(batch=>batch.jobs.map(job=>job.key))??[]);
    const historicExecution={
      tasks:Object.fromEntries(Object.entries(supply.execution.tasks??{}).filter(([key])=>keys.has(key))),
      shared:Object.fromEntries(Object.entries(supply.execution.shared??{}).filter(([key])=>key.split('~').slice(1).length>0
        &&key.split('~').slice(1).every(task=>keys.has(task)))),
    };
    void mutate({history:[{...structuredClone(plan),executionSnapshot:structuredClone(historicExecution),id:crypto.randomUUID(),name,profile:{...plan.profile,people:String(quote?.people??plan.profile.people),budget:quote?.budget?.toString()??''},...(quote?{logistics:structuredClone(quote)}:{})},...data!.history]},'已保存到历史方案。');
  }
  function historyEdit(id:string,fn:(p:Plan)=>Plan) {
    void mutate({history:data!.history.map(p=>p.id===id?fn(p):p)},'历史方案已更新。');
  }
  async function reuse(row:Plan) {
    if (!profile) {notify('请先完成当前档案和健康筛查。',true);return;}
    let start:string;
    try {start=newPlanStart(startChoice);}catch(e){notify(errorText(e),true);return;}
    if(plan&&start<=addDays(plan.start,6)&&plan.days.some((_,i)=>executionLocked(plan,supply.execution,i))) {
      notify('当前方案有已执行餐次。请选择本周结束后的起始日再使用历史方案。',true);return;
    }
    const previousCount=counts(weekUsage(row.days,supply.products).map(item=>item.id));
    const settings=data!.poolSettings?{...data!.poolSettings,planCaps:Object.fromEntries(poolGroups.map(g=>[g,previousCount[g]]))}:undefined;
    try {
      shoppingOffsets(activeSettings,profile,start,dateKey());
      verifyAgainst(row,profile,weights,pantry,data!.blocked,supply,start,settings);
    }
    catch(e) {notify('当前不可重新使用。'+errorText(e),true);return;}
    if (!confirm('此方案通过当前限制校验，重新使用会覆盖当前食谱并沿用原来的份量。继续？')) return;
    const renewed={...structuredClone(row),logistics:undefined,executionSnapshot:undefined,algorithmVersion,id:crypto.randomUUID(),taskScope:crypto.randomUUID(),start,profile:structuredClone(profile),targets:targets!,weight:latestWeight};

    const renewedQuote=planLogistics(renewed.days,profile,start,pantry,supply,renewed.cookingOverride,undefined,renewed.taskScope);
    if(settings) {
      const ids=renewedQuote.lines.filter(line=>line.uses.length).map(line=>line.id);
      renewed.pool=buildWeeklyPool(start,settings,ids,ids,renewed.days,renewedQuote,supply.products);
    }else if(renewed.pool)renewed.pool.week=renewed.start;
    renewed.purchases=purchasesFromLogistics(renewedQuote);
    renewed.prep=prepPlan(renewed.days,profile,renewed.start,renewed.cookingOverride,renewedQuote);
    if(await mutate({plan:renewed,locks:[],pantry}))go('食谱');
  }
  function editHistory(p:Plan) {
    const title=prompt('方案名称',p.name)?.trim().slice(0,100);
    if(title)historyEdit(p.id,row=>({...row,name:title}));
  }
  async function saveProfile(p:Profile) {
    const phase=data!.weightPhase??(weightInRange(Number(profile?.weight??p.weight))?{kg:Number(profile?.weight??p.weight)}:undefined);
    if(await mutate({profile:p,weightPhase:phase})) {unsaved.current=false;go('首页');notify('个人档案已保存到本机。');return true;}
    return false;
  }
  async function changeProfiles(action:DirectoryAction) {
    if(saving.current||pendingWrites.current){notify('正在保存，请稍候重试。',true);return false;}
    if(unsaved.current&&!confirm('有未保存的改动。放弃并继续？'))return false;
    unsaved.current=false;
    if(working.current)cancelGeneration();
    try{await changeDirectory(action);return true;}
    catch(e){notify(errorText(e),true);return false;}
  }
  async function profileAction(action:'新建'|'切换'|'编辑'|'删除',id?:string) {
    if(action==='编辑'&&id===profileId){setManage(false);go('编辑档案');return;}
    if(await changeProfiles(async()=>{
      if(action==='新建')return {editing:await addProfile()};
      if(action==='删除'){await removeProfile(id!);return {message:'已删除指定档案。'};}
      await selectProfile(id!);
      return action==='编辑'?{editing:id}:{followPointer:true};
    })){setManage(false);if(action==='删除'&&id!==profileId)notify('已删除指定档案。');}
  }
  async function exportArchive(id:string|null) {
    try {downloadFile('天天减-'+(id?'个人':'全部')+'备份-'+dateKey()+'.json',await exportProfiles(id));}
    catch(e){notify(errorText(e),true);}
  }
  async function receipt(source:string,value?:Receipt) {
    try {
      const receipts={...supply.receipts};
      const previous=receipts[source];
      if(!value&&previous&&!confirm('撤销这笔购买并扣回 '+decimal(previous.net)+' 克库存？流水会保留撤销记录。'))return false;
      const next=recordPurchase(ledger,source,previous,value,dateKey());
      if(value) {
        const id=source.split('|').at(-1)!;
        const unpaid=value.paid===undefined?value.gross:Math.max(0,value.gross-(value.paidGross??value.gross));
        const priorRate=previous?.paid===undefined&&previous?.gross===value.gross?previous.referenceCost:undefined;
        receipts[source]={...value,...(unpaid?{referenceCost:priorRate!==undefined?priorRate:
          value.netOnly?null:amountFor(unpaid,priceFor(id,supply.prices??{},pantry[id]))}:{})};
      }
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
  async function clearStock(item?:string) {
    const quantities=balances(ledger);
    const count=[...quantities.values()].filter(grams=>grams>0).length;
    if(item?!(quantities.get(item)??0):!count)return false;
    const next=clearInventory(ledger,'清空|'+crypto.randomUUID(),dateKey(),item);
    return mutate({supply:{...supply,ledger:next}},'库存已清空，采购和备餐已更新。');
  }
  async function undoClear(reference:string) {
    if(!confirm('撤销本次清空，并把当时清空的数量加回当前库存？'))return false;
    return mutate({supply:{...supply,ledger:undoInventoryClear(ledger,reference,dateKey())}},'已撤销清空，采购和备餐已更新。');
  }
  const supplyActions:SupplyActions={
    task,receipt,
    shared:(key,checked)=>{
      const shared={...supply.execution.shared};
      if(checked)shared[key]=true;
      else delete shared[key];
      return mutate({supply:{...supply,execution:{...supply.execution,shared}}},'备餐步骤进度已保存。');
    },
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
    if(!archived.logistics){notify('此旧方案未保存完整采购快照，无法按最新价格重估。',true);return;}
    const quoted=repriceSnapshot(archived.logistics,supply.prices??{},data!.pantry);
    setHistoryQuote(quoted);
    notify('已使用当前价格重新估算，历史快照保持原值。');
  }
  const livePool=plan?.pool&&quote?buildWeeklyPool(plan.start,{...(data.poolSettings??plan.pool.settings),planCaps:plan.pool.settings.planCaps},
    plan.pool.selected.filter(id=>!plan.pool!.supplements.some(s=>s.id===id)),plan.pool.selected,plan.days,quote,supply.products):plan?.pool;
  function librarySlots(recipe:Recipe) {
    if(!plan||!profile||stale)return [];
    return plan.days.flatMap((entry,d)=>entry.meals.flatMap((meal,m)=>meal.dishes.flatMap((row,j)=>{
      if(addDays(plan.start,d)<dateKey()||executionLocked(plan,supply.execution,d,m,j)||
        data!.locks.some(lock=>lock.day===d&&lock.meal===m&&lock.dish===j)||recipe.id===row.recipe.id||
        !recipeFitsMeal(recipe,profile,meal.name as MealName,labels(row.recipe).slot))return [];
      return [{key:[d,m,j].join(':'),label:addDays(plan.start,d)+' '+meal.name+' · '+row.recipe.name}];
    })));
  }
  function addLibraryRecipe(recipe:Recipe,key:string) {
    if(!plan||!profile)return;
    const [d,m,j]=key.split(':').map(Number);
    const meal=plan.days[d].meals[m],original=meal.dishes[j].recipe;
    const swapMode=coreSignature(original)===coreSignature(recipe)?'换做法':'换食材';
    const restriction=replacementRestrictions(original,recipe,profile,meal.name as MealName,data!.poolSettings??plan.pool?.settings,supply.products);
    if(restriction.strict&&!confirm('确认把此菜所需的食材加入严格食材池？校验通过后保存。'))return;
    void generate({day:d,meal:m,dish:j,replacement:recipe.id,swapMode,expandPool:restriction.strict});
  }
  function ingredientPreference(id:string,state:FoodState) {
    void changePreferences(settings=>setFoodPreference(settings,id,state));
  }
  const planProps={
    profile,busy,stale,currentTargets:targets,targetChanged,today,day,setDay,locks:data.locks,favorites:data.favorites,generate:()=>void generate(),updatePlan:()=>void generate(undefined,'重新搭配',true),
    editProfile:()=>go('编辑档案'),openHistory:()=>go('历史方案'),change:(p:Change)=>void generate(p),lock,
    favorite:(id:string)=>toggle('favorites',id),block:(id:string)=>toggle('blocked',id),revise:adjust,save:savePlan,
    products:supply.products,prices:supply.prices,livePool,stock:balances(ledger),blocked:data.blocked,openPool:()=>go('生成设置'),keepPool:()=>void generate(undefined,'沿用食材'),
    execution:supply.execution,mealJobs:quote?.prep.flatMap(b=>b.jobs)??[],completeMeal:(jobs:PrepJob[])=>task(jobs,'用餐',true),undoMeal:(jobs:PrepJob[])=>task(jobs,'用餐',false),
    share:(p:Plan,share:boolean)=>void send(planText(p),share),exportText:(p:Plan)=>downloadFile('天天减-七天食谱.txt',planText(p),'text/plain;charset=utf-8'),
  };

  const feedback=status?<div className={'notice '+(status.error?'error':'')} role={status.error?'alert':'status'}>
    <Icon name={status.error?'shield':'check'} size={18}/><span>{status.text}</span><IconButton label="关闭提示" icon="close" onClick={()=>setStatus(null)}/>
  </div>:null;
  const activeSheet=status&&overlayBody?.isConnected?overlayBody:null;
  return <>
    <header className="topbar"><div className="shell topbar-inner">
      {routes[page]?<><IconButton icon="back" label="返回" onClick={goBack}/><span className="app-bar-name">{routes[page].title}</span></>:
        <button className="brand" onClick={()=>go('首页')}><img src={import.meta.env.BASE_URL+'icon-192.png'} alt=""/><span>天天减</span></button>}
      <button className="top-profile" aria-label="我的档案与设置" onClick={()=>setManage(true)}>{profile?.name?.slice(0,1)||<Icon name="user" size={20}/>}</button>
    </div></header>
    <main className="shell container">
      {busy&&<div className="hint generation-progress" role="status"><span>正在搭配未来七天的食谱…</span><button onClick={cancelGeneration}>取消生成</button></div>}
      {(offline||update)&&<div className="hint network">{offline?'当前离线，已缓存的功能仍可使用。':''}{update&&<button onClick={()=>update.postMessage('UPDATE')}>应用新版本</button>}</div>}
      {activeSheet?createPortal(feedback,activeSheet):feedback}
      {page==='首页'&&<Dashboard quote={quote} poolCount={quote?.lines.filter(r=>r.uses.length>0).length??0} profile={profile} t={targets} reason={reason} weights={weights} phase={data.weightPhase} plan={plan} stale={stale} targetChanged={targetChanged} today={today}
        poolMode={(data.poolSettings??defaultPool).mode} schedule={profile?shoppingSchedule(activeSettings,profile).count:undefined}
        prep={activeSettings.prep} execution={supply.execution} generate={()=>void generate()} updatePlan={()=>void generate(undefined,'重新搭配',true)} busy={busy} go={go} edit={()=>go('编辑档案')}
        saveDeficit={value=>profile?mutate({profile:{...profile,deficit:value}},'热量设置已保存。'):Promise.resolve(false)}
        write={rows=>mutate({weights:rows},'称重记录已保存。')} resetPhase={kg=>mutate({weightPhase:{kg,date:today}},'已开启新的体重阶段。')}/>}
      {page==='编辑档案'&&<><PageHeader title={profile?'编辑个人档案':'建立个人档案'} subtitle="身体数据只保存在这台设备。"/>
        <ProfileForm value={profile} recordedWeight={validWeights(weights,today).length>0?latestWeight:undefined} onSave={saveProfile} onDirty={markSettingsDirty} onCancel={()=>go(profile?'我的':'首页')}/></>}
      {page==='食谱'&&<PlanPage plan={plan} {...planProps}/>}
      {page==='生成设置'&&profile&&<PoolPage initial={data.poolSettings??defaultPool} previous={plan?.pool}
        templates={data.poolTemplates??[]} stock={balances(ledger)} quote={quote} busy={busy} supply={activeSettings} profile={profile}
        products={supply.products} startChoice={startChoice} onGenerate={action=>void generate(undefined,action)}
        onSave={saveGeneration} onPreferences={changePreferences} onDirty={markSettingsDirty}
        onTemplate={name=>queuePreferenceWrite(current=>{
          const templates=current.poolTemplates??[];
          if(templates.length>=50)throw Error('已达到 50 个模板。');
          return {...current,poolTemplates:[...templates,{id:crypto.randomUUID(),name,settings:current.poolSettings??defaultPool}]};
        },'已收藏食材池模板。')}>
        <details className="settings item-fold"><summary>固定搭配与随机种子</summary>
          <div className="fields"><label className="field">固定早餐<select value={profile.fixedBreakfast} onChange={e=>rule(e.target.value,profile.requiredDish)}>
            <option value="">随机搭配</option>{profile.fixedBreakfast&&![...breakfastMenus,...fixedBreakfasts].some(r=>r.id===profile.fixedBreakfast)&&
              <option value={profile.fixedBreakfast}>已保存的旧版早餐设置</option>}
            <optgroup label="固定完整搭配">{breakfastMenus.map(m=><option key={m.id} value={m.id}>{menuName(m.recipes)}</option>)}</optgroup>
            <optgroup label="只固定主食">{fixedBreakfasts.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</optgroup></select></label>
            <div className="field">本周必选菜 <span>{recipeList.find(r=>r.id===profile.requiredDish)?.name??'未指定'}</span>
              <button onClick={()=>{setLibraryQuery('');go('菜谱库');}}>从食谱大全选择</button>
              {profile.requiredDish&&<button onClick={()=>rule(profile.fixedBreakfast,'')}>取消必选</button>}
            </div>
            <label className="field">随机种子（选填）<input value={seed} onChange={e=>setSeed(e.target.value)} maxLength={100}/></label></div>
        </details>
        <MealSettings key={JSON.stringify(profile.mealPreferences)} profile={profile} onSave={mealPreferences=>
          queuePreferenceWrite(current=>current.profile?{...current,profile:{...current.profile,mealPreferences}}:current,'分餐偏好已保存。重新生成后生效。')}/>
      </PoolPage>}
      {(['采购','备餐'].includes(page))&&<ShoppingPage key={page} plan={plan} quote={quote}
        state={supply} actions={supplyActions} initialTab={page==='备餐'?'备餐清单':'采购清单'} onSettings={()=>go('生成设置')} {...shoppingOutput}/>}
      {page==='食材价格'&&<><PageHeader title="食材价格" subtitle="管理参考价和你常用的购买规格。"/>
        <PriceManager book={supply.prices??{}} pantry={pantry} products={supply.products} save={supplyActions.savePrice}
          saveProducts={products=>mutate({supply:{...supply,products}},'换算与采购费用已更新。')}
          resetAll={supplyActions.resetPrices} exportPrices={supplyActions.exportPrices} importPrices={supplyActions.importPrices}/></>}
      {page==='库存'&&<><PageHeader title="库存"/>
        <InventoryManager pantry={pantry} prices={supply.prices??{}} ledger={ledger} receipts={supply.receipts??{}} execution={supply.execution}
          inventory={Object.fromEntries(quote?.inventory.map(row=>[row.id,row])??[])}
          save={stock} savePurchase={receipt} reverse={removeInventory} clear={clearStock} undoClear={undoClear}
          review={async(id,grams)=>{
            try {
              return await mutate({supply:{...supply,ledger:resolveReview(ledger,id,grams,dateKey())}},'旧库存已核对。');
            }catch(e){notify(errorText(e),true);return false;}
          }}/>
      </>}
      {page==='菜谱库'&&<Suspense fallback={<Skeleton label="正在载入食谱大全…"/>}><Library favorites={data.favorites} blocked={data.blocked} toggleFavorite={planProps.favorite} toggleBlocked={planProps.block}
        profile={profile??undefined} stock={balances(ledger)} prices={supply.prices??{}} pantry={pantry} products={supply.products} initialQuery={libraryQuery}
        back={goBack} slots={librarySlots} add={addLibraryRecipe} required={r=>rule(profile?.fixedBreakfast??'',profile?.requiredDish===r.id?'':r.id)} busy={busy}/></Suspense>}
      {page==='原材料大全'&&<Suspense fallback={<Skeleton label="正在载入原材料大全…"/>}><IngredientsLibrary stock={balances(ledger)} pantry={pantry} prices={supply.prices??{}} products={supply.products}
        settings={data.poolSettings??defaultPool} savePrice={supplyActions.savePrice} savePurchase={receipt} change={ingredientPreference}
        related={query=>{setLibraryQuery(query);go('菜谱库');}} back={goBack}/></Suspense>}
      {page==='我的'&&<>
        <PageHeader title="我的"/>
        <section className="card profile-hero"><div className="profile-avatar" aria-hidden="true">{profile?.name?.slice(0,1)||<Icon name="user"/>}</div>
          <div><h2>{profile?.name||'个人档案'}</h2><p className="meta">{profile?profile.goal+' · '+profile.meals+' 餐计划':'填写档案后开始配餐'}</p></div>
          <Action icon="edit" onClick={()=>go('编辑档案')}>{profile?'编辑档案':'填写档案'}</Action>
        </section>
        <div className="actions"><button onClick={()=>setManage(true)}>档案管理</button>
          <button onClick={()=>void profileAction('新建')}>新建档案</button></div>
        <h2 className="settings-caption">食谱与食材</h2>
        <div className="row-stack">
          <ListRow icon={<Icon name="book"/>} title="食谱大全" detail="按餐次、厨具与做法浏览" label="食谱大全" onClick={()=>{setLibraryQuery('');go('菜谱库');}}/>
          <ListRow icon={<Icon name="tag"/>} title="原材料大全" detail="查找食材、营养与替代选项" label="原材料大全" onClick={()=>go('原材料大全')}/>
          <ListRow icon={<Icon name="box"/>} title="家中库存" detail="实际结余、购买与流水" label="家中库存" onClick={()=>go('库存')}/>
          <ListRow icon={<Icon name="basket"/>} title="食材价格" detail="参考价格与自定义单价" label="食材价格" onClick={()=>go('食材价格')}/>
          <ListRow icon={<Icon name="calendar"/>} title="历史方案" detail={data.history.length+' 份已保存'} label={'历史方案 · '+data.history.length} onClick={()=>go('历史方案')}/>
        </div>
        <h2 className="settings-caption">设置与数据</h2>
        {profile&&<details className="card group-fold"><summary><Icon name="slider" size={18}/>饮食、厨具与采购偏好</summary>
          <p>{profile.meals==='4'?'三餐和加餐':profile.meals==='2'?'两餐':'三餐'} · {profile.cooking?.mode??'简单'}烹饪 · {supply.settings?.prep??supplyDefaults(profile).prep}备餐</p>
          <p className="meta">{profile.tools.join('、')||'未选择厨具'}</p>
          <div className="actions"><button onClick={()=>go('生成设置')}>本周生成偏好</button></div>
        </details>}
        <details className="card settings-group"><summary><Icon name="palette" size={18}/><span>外观与安装</span><small className="settings-version">V{version}</small></summary><label className="field">外观<select value={data.theme} onChange={e=>void mutate({theme:e.target.value as Data['theme']})}><option>系统</option><option>浅色</option><option>深色</option></select></label>
          <p className="meta">{cached?'离线资源已缓存。':'首次成功缓存后可离线查看和生成食谱。'}</p>
          {canInstall&&<button onClick={()=>void canInstall.prompt().then(()=>canInstall.userChoice).then(()=>setInstall(null)).catch(e=>notify(errorText(e),true))}>安装天天减</button>}
          <details><summary>添加到主屏幕</summary><p>安卓 Chrome 打开浏览器右上角菜单，选「安装应用」或「添加到主屏幕」。iPhone 用 Safari 打开，点分享，再选「添加到主屏幕」。</p></details>
        </details>
        <details className="card settings-group"><summary><Icon name="box" size={18}/>本机数据与备份</summary><p>同一设备和浏览器共享本机存储。换手机、使用隐私浏览或清除站点数据可能丢失档案和记录。建议定期导出备份，备份含健康信息，请妥善保存。</p>
          <div className="actions">{profileId&&<button onClick={()=>void exportArchive(profileId)}>导出个人备份</button>}
            <button onClick={()=>void exportArchive(null)}>导出全部档案</button>
            <button onClick={()=>setImporting(true)}>导入并恢复</button>
            <button className="danger" onClick={()=>setConfirmDelete(true)}>删除全部数据</button>
          </div>
          {confirmDelete&&<Sheet title="删除本机数据" kind="dialog" close={()=>setConfirmDelete(false)}>
            <p>此操作将删除这台设备的档案、食谱、库存和体重记录。请确认已导出需要的备份。</p>
            <div className="actions"><button onClick={()=>setConfirmDelete(false)}>取消</button><Action icon="trash" className="danger"
              onClick={()=>{if(confirm('再次确认删除所有档案及其记录？'))void changeProfiles(async()=>{await removeProfile(null);return {message:'本机个人数据已清除。'};});}}>确认删除</Action></div>
          </Sheet>}
        </details>
        <details className="card settings-group"><summary><Icon name="shield" size={18}/>隐私与健康说明</summary><p>应用无需账号。档案、体重及健康信息在设备上处理，分享食谱只包含餐次、菜名和食材重量。访问网站由静态托管服务处理普通网页请求。</p>
          <p>营养计算是面向一般成年人的估算。涉及疾病、药物和特殊饮食医嘱时，请向医生或注册营养师咨询。食物过敏者需核查包装标签和厨房交叉接触。</p></details>
      </>}
      {page==='历史方案'&&<>
        <PageHeader title="历史方案" subtitle={data.history.length+' 份已保存食谱'}/>
        {data.history.length?data.history.map(p=><section className="card history-item" key={p.id}><div className="history-head"><div><SectionTitle title={p.name}/>
          <p className="meta">{p.start} 至 {addDays(p.start,6)} · 生成体重 {p.weight} 千克</p>{p.favorite&&<small>已收藏</small>}</div><Icon name="calendar"/></div>
          <div className="actions"><Action icon="book" onClick={()=>{setArchived(p);setHistoryQuote(undefined);setDay(0);go('查看历史');}}>查看</Action></div>
          <details className="history-more"><summary><Icon name="dots" size={17}/>方案操作</summary><div className="actions"><button onClick={()=>editHistory(p)}>改名</button>
            <button onClick={()=>historyEdit(p.id,row=>({...row,favorite:!row.favorite}))}>{p.favorite?'取消收藏':'收藏'}</button>
            <button onClick={()=>{if(data.history.length>=500){notify('历史方案已达存储上限。',true);return;}void mutate({history:[{...structuredClone(p),id:crypto.randomUUID(),name:p.name.slice(0,95)+'（副本）'},...data.history]},'已复制方案。');}}>复制方案</button>
            <button onClick={()=>void reuse(p)}>重新使用</button><button onClick={()=>planProps.exportText(p)}>导出食谱</button>
            <button onClick={()=>planProps.share(p,true)}>分享</button>
            <button className="danger" onClick={()=>{if(confirm('删除这份历史方案？'))void mutate({history:data.history.filter(row=>row.id!==p.id)},'已删除方案。');}}>删除</button>
          </div></details></section>):<Empty title="还没有历史方案"><p>在食谱页面点「保存到历史」，即可随时找回。</p></Empty>}
      </>}
      {page==='查看历史'&&archived&&<><PlanPage {...planProps} plan={archived} readonly stale={false} targetChanged={false} locks={[]}
        execution={archived.executionSnapshot} mealJobs={archived.logistics?.prep.flatMap(batch=>batch.jobs)??[]}/>
        <ShoppingPage plan={archived} quote={historyQuote??archived.logistics} historyExecution={archived.executionSnapshot}
          reprice={repriceHistory} repriced={Boolean(historyQuote)} {...shoppingOutput}/></>}
    </main>
    {manage&&<ProfileManager directory={directory} close={()=>setManage(false)} act={profileAction} exportOne={id=>void exportArchive(id)}/>}
    {importing&&<BackupImport directory={directory} close={()=>setImporting(false)} restore={async(backup,mode,id)=>{
      if(await changeProfiles(async()=>{await restoreProfiles(backup,mode,id);return {message:'备份已恢复。',followPointer:mode==='新建'||mode==='全部替换'};})){
        setImporting(false);notify('备份已恢复。');
      }
    }}/>}
    <nav className="bottom-nav" aria-label="主导航"><div className="shell">{pages.map((p,i)=><button key={p} aria-current={page===p||p==='采购'&&page==='备餐'||p==='我的'&&['食材价格','库存','菜谱库','原材料大全','历史方案'].includes(page)?'page':undefined} onClick={()=>go(p)}>
      <Icon name={icons[i]}/>{p}</button>)}</div></nav>
  </>;
}

createRoot(document.getElementById('root')!).render(<StrictMode><AppRoot/></StrictMode>);
