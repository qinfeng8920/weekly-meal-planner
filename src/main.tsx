import {StrictMode,useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Dashboard} from './Dashboard';
import {ProfileForm} from './ProfileForm';
import {PlanPage} from './PlanPage';
import {Library} from './Library';
import {ShoppingPage,purchaseText} from './ShoppingPage';
import {dateKey,type Profile,type Weight} from './profile';
import {nutrition} from './nutrition';
import {monday,regenerate,revise,verifyAgainst,type Lock,type Plan} from './planner';
import {prepPlan,shopping} from './shopping';
import {downloadFile,fresh,loadData,parseBackup,writeData,type Data} from './store';
import {Empty,planText,SectionTitle,shareText,todayIndex} from './ui';
import './style.css';

const pages=['首页','食谱','采购','菜谱库','我的'];
const icons=['⌂','▤','▣','▥','◉'];
type InstallEvent=Event&{prompt:()=>Promise<void>;userChoice:Promise<{outcome:string}>};
const errorText=(e:unknown)=>e instanceof Error?e.message:'操作未完成，请重试。';

function App() {
  const [data,setData]=useState<Data|null>(null);
  const [fatal,setFatal]=useState('');
  const [page,setPage]=useState('首页'),[status,setStatus]=useState<{text:string;error?:boolean}|null>(null);
  const [day,setDay]=useState(todayIndex),[seed,setSeed]=useState(''),[archived,setArchived]=useState<Plan|null>(null);
  const [busy,setBusy]=useState(false),[offline,setOffline]=useState(!navigator.onLine),[cached,setCached]=useState(false);
  const [update,setUpdate]=useState<ServiceWorker|null>(null),[canInstall,setInstall]=useState<InstallEvent|null>(null);
  const [confirmDelete,setConfirmDelete]=useState(false);
  const saving=useRef(false),working=useRef(false);
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
      const controlled=Boolean(navigator.serviceWorker.controller);
      const refresh=()=>{if(controlled)location.reload();};
      navigator.serviceWorker.addEventListener('controllerchange',refresh);
      void navigator.serviceWorker.register(import.meta.env.BASE_URL+'sw.js').then(reg=>{
        const mark=()=>{if(reg.waiting&&navigator.serviceWorker.controller)setUpdate(reg.waiting);};
        mark();
        reg.addEventListener('updatefound',()=>reg.installing?.addEventListener('statechange',mark));
        void navigator.serviceWorker.ready.then(()=>setCached(true));
      }).catch(()=>setStatus({text:'离线资源缓存失败。联网重新打开后可重试。',error:true}));
      return ()=>{
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
    if (target==='食谱') setDay(todayIndex);
    setPage(target);setStatus(null);window.scrollTo(0,0);
  }
  const notify=(text:string,error=false)=>setStatus({text,error});
  if (fatal) return <main className="container"><Empty title="读取本机数据失败"><p>{fatal}</p><button onClick={()=>location.reload()}>重新读取</button></Empty></main>;
  if (!data) return <main className="container"><p role="status">正在读取本机数据…</p></main>;
  const {profile,weights,plan}=data;
  const pantry=Object.fromEntries(Object.entries(data.pantry).map(([id,entry])=>[id,{...entry,bought:plan?.start===monday()?entry.bought:0}]));
  let targets=null,reason='';
  if (profile) {
    try {targets=nutrition(profile,weights);}
    catch(e) {reason=errorText(e);}
  }
  const latestWeight=[...weights].sort((a,b)=>b.date.localeCompare(a.date))[0]?.kg??Number(profile?.weight);
  const stale=Boolean(plan && (!profile || !targets || latestWeight!==plan.weight ||
    Math.abs(targets.kcal-plan.targets.kcal)>.01 || JSON.stringify(profile)!==JSON.stringify(plan.profile) ||
    plan.days.some(d=>d.meals.some(m=>m.dishes.some(s=>data.blocked.includes(s.recipe.id))))));
  const purchases=plan?shopping(plan.days,plan.profile,data.pantry):[];
  const pct=purchases.length?Math.round(100*purchases.filter(s=>s.done).length/purchases.length):0;
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
  async function generate(change?:{day:number;meal?:number;dish?:number}) {
    if (!profile) {go('编辑档案');return;}
    if (working.current) return;
    working.current=true;setBusy(true);setStatus(null);
    try {
      await new Promise(r=>setTimeout(r,25));
      const key=seed.trim()&&!change?seed.trim():crypto.randomUUID().slice(0,12);
      const next=regenerate(profile,weights,pantry,data!.blocked,key,change?plan??undefined:undefined,stale?[]:data!.locks,change);
      if (!await mutate({plan:next,pantry,locks:stale?[]:data!.locks})) return;
      if (!change) {go('食谱');setDay(todayIndex);}
      notify(change?'调整完成，已同步采购和备餐。':'七天食谱已生成。');
    } catch(e) {notify(errorText(e),true);}
    finally {working.current=false;setBusy(false);}
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
      const next=revise(plan,profile,weights,pantry,data!.blocked,d,m,i,grams);
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
    void mutate({history:[{...structuredClone(plan),id:crypto.randomUUID(),name,purchases:structuredClone(purchases)},...data!.history]},'已保存到历史方案。');
  }
  function historyEdit(id:string,fn:(p:Plan)=>Plan) {
    void mutate({history:data!.history.map(p=>p.id===id?fn(p):p)},'历史方案已更新。');
  }
  async function reuse(row:Plan) {
    if (!profile) {notify('请先完成当前档案和健康筛查。',true);return;}
    try {verifyAgainst(row,profile,weights,pantry,data!.blocked);}
    catch(e) {notify('当前不可重新使用。'+errorText(e),true);return;}
    if (!confirm('此方案通过当前限制校验，重新使用会覆盖当前食谱并沿用原来的份量。继续？')) return;
    const renewed={...structuredClone(row),id:crypto.randomUUID(),start:monday(),profile:structuredClone(profile),targets:targets!,weight:latestWeight};
    renewed.purchases=shopping(renewed.days,profile,pantry);
    renewed.prep=prepPlan(renewed.days,profile,renewed.start);
    if(await mutate({plan:renewed,locks:[],pantry}))go('食谱');
  }
  function editHistory(p:Plan) {
    const title=prompt('方案名称',p.name)?.trim().slice(0,100);
    if(title)historyEdit(p.id,row=>({...row,name:title}));
  }
  async function saveProfile(p:Profile) {
    if (await mutate({profile:p})) {go('首页');notify('个人档案已保存到本机。');return true;}
    return false;
  }
  async function restore(file:File) {
    try {
      if (file.size>12_000_000) throw Error('备份文件过大。');
      const state=parseBackup(await file.text());
      if (confirm('用这份备份覆盖本机数据？如需保留现有资料，请先导出。')) await mutate(state,'备份已恢复。');
    } catch(e){notify(errorText(e),true);}
  }
  const planProps={
    profile,busy,stale,day,setDay,locks:data.locks,favorites:data.favorites,generate:()=>void generate(),
    editProfile:()=>go('编辑档案'),openHistory:()=>go('历史方案'),change:(p:{day:number;meal?:number;dish?:number})=>void generate(p),lock,
    favorite:(id:string)=>toggle('favorites',id),block:(id:string)=>toggle('blocked',id),revise:adjust,save:savePlan,seed,setSeed,rules:rule,
    share:(p:Plan,share:boolean)=>void send(planText(p),share),exportText:(p:Plan)=>downloadFile('天天减-七天食谱.txt',planText(p),'text/plain;charset=utf-8'),
  };

  return <>
    <header className="topbar"><div className="shell topbar-inner"><button className="brand" onClick={()=>go('首页')}>
      <img src={import.meta.env.BASE_URL+'icon-192.png'} alt=""/><span>天天减</span></button>
      <button className="top-profile" aria-label="我的档案与设置" onClick={()=>go('我的')}>{profile?.name?.slice(0,1)||'我'}</button>
    </div></header>
    <main className="shell container">
      {(offline||update)&&<div className="hint network">{offline?'当前离线，已缓存的功能仍可使用。':''}{update&&<button onClick={()=>update.postMessage('UPDATE')}>应用新版本</button>}</div>}
      {status&&<div className={'notice '+(status.error?'error':'')} role={status.error?'alert':'status'}><span>{status.text}</span><button aria-label="关闭提示" onClick={()=>setStatus(null)}>×</button></div>}
      {page==='首页'&&<Dashboard profile={profile} t={targets} reason={reason} weights={weights} plan={plan} stale={stale}
        shoppingPercent={pct} generate={()=>void generate()} busy={busy} go={go} edit={()=>go('编辑档案')}
        write={rows=>mutate({weights:rows},'称重记录已保存。')}/>}
      {page==='编辑档案'&&<><div className="page-title"><div><h1>{profile?'编辑个人档案':'建立个人档案'}</h1><p>身体数据只保存在当前浏览器。</p></div></div>
        <ProfileForm value={profile} onSave={saveProfile} onCancel={()=>go(profile?'我的':'首页')}/></>}
      {page==='食谱'&&<PlanPage plan={plan} {...planProps}/>}
      {page==='采购'&&<ShoppingPage plan={plan} purchases={purchases} pantry={data.pantry}
        update={(id,changes)=>mutate({pantry:{...data.pantry,[id]:{...data.pantry[id],...changes}}},'采购记录已更新。')}
        share={share=>void send(purchaseText(purchases),share)}
        download={()=>downloadFile('天天减-采购清单.txt',purchaseText(purchases),'text/plain;charset=utf-8')}/>}
      {page==='菜谱库'&&<Library favorites={data.favorites} blocked={data.blocked} toggleFavorite={planProps.favorite} toggleBlocked={planProps.block}/>}
      {page==='我的'&&<>
        <div className="page-title"><div><h1>我的</h1><p>管理档案、历史和本机设置。</p></div></div>
        <section className="card"><SectionTitle title="个人档案"/><p>{profile?(profile.name||'已保存档案')+' · '+profile.goal:'还没有个人档案'}</p>
          {profile?.conditions.includes('脂肪肝')&&<p className="hint">一般饮食建议是少喝含糖饮料与酒，少吃添加糖，完整水果仍可适量食用。</p>}
          {profile?.conditions.includes('痤疮')&&<p className="hint">饮食与痤疮的相关证据有限。按个人耐受选择乳制品，症状持续时可咨询医生。</p>}
          <div className="actions"><button className="primary" onClick={()=>go('编辑档案')}>{profile?'编辑档案':'填写档案'}</button>
            <button onClick={()=>go('历史方案')}>历史方案 · {data.history.length}</button></div>
        </section>
        <section className="card"><SectionTitle title="外观与安装"/><label className="field">外观<select value={data.theme} onChange={e=>void mutate({theme:e.target.value as Data['theme']})}><option>系统</option><option>浅色</option><option>深色</option></select></label>
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
            <button onClick={()=>setConfirmDelete(false)}>取消</button><button className="danger" onClick={()=>void mutate(fresh(),'本机个人数据已清除。').then(ok=>{if(ok)setConfirmDelete(false);})}>确认删除</button></div></div>}
        </section>
        <section className="card"><SectionTitle title="隐私与健康说明"/><p>应用无需账号。档案、体重及健康信息在设备上处理，分享食谱只包含餐次、菜名和食材重量。访问网站由静态托管服务处理普通网页请求。</p>
          <p>营养计算是面向一般成年人的估算。涉及疾病、药物和特殊饮食医嘱时，请向医生或注册营养师咨询。食物过敏者需核查包装标签和厨房交叉接触。</p></section>
      </>}
      {page==='历史方案'&&<>
        <div className="page-title"><div><h1>历史方案</h1><p>保留每次保存时的完整搭配和营养信息。</p></div><button onClick={()=>go('食谱')}>返回食谱</button></div>
        {data.history.length?data.history.map(p=><section className="card" key={p.id}><SectionTitle title={p.name}/>
          <p className="meta">从 {p.start} 起 · 七天 · 生成体重 {p.weight} 千克 · {p.favorite?'已收藏':'历史方案'}</p>
          <div className="actions">
            <button onClick={()=>{setArchived(p);setDay(0);go('查看历史');}}>查看</button><button onClick={()=>editHistory(p)}>改名</button>
            <button onClick={()=>historyEdit(p.id,row=>({...row,favorite:!row.favorite}))}>{p.favorite?'取消收藏':'收藏'}</button>
            <button onClick={()=>{if(data.history.length>=500){notify('历史方案已达存储上限。',true);return;}void mutate({history:[{...structuredClone(p),id:crypto.randomUUID(),name:p.name.slice(0,95)+'（副本）'},...data.history]},'已复制方案。');}}>复制方案</button>
            <button onClick={()=>void reuse(p)}>重新使用</button><button onClick={()=>planProps.exportText(p)}>导出食谱</button>
            <button onClick={()=>planProps.share(p,true)}>分享</button>
            <button className="danger" onClick={()=>{if(confirm('删除这份历史方案？'))void mutate({history:data.history.filter(row=>row.id!==p.id)},'已删除方案。');}}>删除</button>
          </div></section>):<Empty title="还没有历史方案"><p>在食谱页面点「保存到历史」，即可随时找回。</p></Empty>}
      </>}
      {page==='查看历史'&&archived&&<><button onClick={()=>go('历史方案')}>返回历史</button><PlanPage {...planProps} plan={archived} readonly stale={false}/>
        <ShoppingPage plan={archived} purchases={archived.purchases} pantry={{}} update={async()=>false} share={s=>void send(purchaseText(archived.purchases),s)}
          download={()=>downloadFile('天天减-历史采购.txt',purchaseText(archived.purchases),'text/plain;charset=utf-8')} readonly/></>}
    </main>
    <nav className="bottom-nav" aria-label="主导航"><div className="shell">{pages.map((p,i)=><button key={p} aria-current={page===p?'page':undefined} onClick={()=>go(p)}>
      <span aria-hidden="true">{icons[i]}</span>{p}</button>)}</div></nav>
  </>;
}

createRoot(document.getElementById('root')!).render(<StrictMode><App/></StrictMode>);
