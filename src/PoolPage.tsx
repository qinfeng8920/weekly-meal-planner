import {conditionalPair,directRules} from './substitution';
import {useState,type ReactNode} from 'react';
import {food,foods} from './catalog';
import {capOf,counts,defaultPool,displayPoolMode,normalizeIds,poolGroup,poolGroups,poolMethods,visiblePoolModes,rotations,standardFoods,type PoolSettings,type PoolTemplate,type WeeklyIngredientPool} from './ingredient-pool';
import {Empty,decimal,SectionTitle} from './ui';
import type {Pantry} from './shopping';
import {SupplyFields} from './SupplyEditors';
import {shoppingOffsets,splitWeek,type SupplySettings} from './batches';
import {dateKey,type Profile} from './profile';
import {newPlanStart,startChoices,type StartChoice} from './planner';
import {purchaseIngredientId,type PurchaseOptions} from './purchase-food';
import type {CookingSelection} from './cooking-profile';

export function PoolOverview({pool,children}:{pool:WeeklyIngredientPool;children?:ReactNode}) {
  const [show,setShow]=useState(false);
  const group=counts(pool.used.map(i=>i.id));
  return <section className="card">
    <SectionTitle title="本周核心食材"><span className="meta">{pool.used.length} 种</span></SectionTitle>
    <p className="stat-strip">{poolGroups.map(key=><span key={key}>{key} <b>{group[key]} 种</b></span>)}<span>基础 <b>{group.基础食材} 种</b></span></p>
    <p className="meta">{displayPoolMode(pool.settings.mode)} · {pool.settings.method}{pool.settings.strict?' · 严格限定':''}。按采购商品计数，基础食材和调味品也计入总数。</p>
    <button onClick={()=>setShow(!show)} aria-expanded={show}>{show?'收起食材':'查看食材与使用次数'}</button>
    {show&&<ul className="ingredients">{pool.used.map(i=><li key={i.id}>{food(i.id).name}<strong>{i.uses} 次 · {decimal(i.grams)} 克采购净料/人</strong></li>)}</ul>}
    {pool.supplements.length>0&&<details><summary>已同意补充 {pool.supplements.length} 种</summary><ul>
      {pool.supplements.map(s=><li key={s.id}>{food(s.id).name} {decimal(s.grams)} 克 · {s.reason} · {s.cost===null?'价格待补充':'约 ¥'+s.cost.toFixed(2)}</li>)}
    </ul></details>}
    {children}
  </section>;
}
export type GenerationDraft={settings:SupplySettings;people:string;budget:string;startChoice:StartChoice;cooking:CookingSelection};
export function PoolPage({initial,previous,templates,pantry,busy,onSave,onGenerate,onTemplate,profile,supply,startChoice,products,children}:{
  initial?:PoolSettings;previous?:WeeklyIngredientPool;templates:PoolTemplate[];pantry:Pantry;busy:boolean;profile:Profile;
  supply:SupplySettings;startChoice:StartChoice;products?:PurchaseOptions;
  onSave:(pool:PoolSettings,values:GenerationDraft)=>Promise<boolean>;onGenerate:(pool:PoolSettings,keep:boolean,values:GenerationDraft)=>void;
  onTemplate:(name:string,value:PoolSettings)=>Promise<boolean>;children?:ReactNode;
}) {
  const [draft,setDraft]=useState(()=>structuredClone(initial??defaultPool));
  const [settings,setSettings]=useState(supply);
  const [people,setPeople]=useState(profile.people),[budget,setBudget]=useState(profile.budget),[start,setStart]=useState(startChoice);
  const legacyCooking=profile.cooking?.mode;
  const [cooking,setCooking]=useState<CookingSelection>(legacyCooking==='极简'?'简单':legacyCooking==='简单'||legacyCooking==='家常'?legacyCooking:'不限制');
  const [error,setError]=useState('');
  const foodList=products?.ready?.length?foods.filter(f=>purchaseIngredientId(f.id,products)===f.id):standardFoods;
  const date=newPlanStart(start);
  const run=(action:'保存'|'生成'|'沿用')=>{
    try {
      splitWeek(settings);shoppingOffsets(settings,profile,date,dateKey());
      if(!Number.isInteger(+people)||+people<1||+people>12||budget&&(!Number.isFinite(+budget)||+budget<=0||+budget>1e7))
        throw Error('请检查人数及预算。');
      const values={settings,people,budget,startChoice:start,cooking};
      setError('');
      if(action==='保存')void onSave(draft,values);
      else onGenerate(action==='沿用'&&previous?previous.settings:draft,action==='沿用',values);
    }catch(e){setError(e instanceof Error?e.message:'设置无效。');}
  };
  const [query,setQuery]=useState(''),[group,setGroup]=useState('全部'),[view,setView]=useState('候选食材'),[limit,setLimit]=useState(18);
  const [template,setTemplate]=useState(''),[message,setMessage]=useState('');
  const [replacement,setReplacement]=useState('');
  const chosen=normalizeIds([...draft.selected,...draft.locked],products);
  const visible=foodList.filter(f=>(group==='全部'||poolGroup(f.id)===group)&&
    (view!=='已选／锁定'||chosen.includes(f.id))&&(view!=='排除'||draft.excluded.includes(f.id))&&
    (!query.trim()||[f.name,...f.aliases].some(n=>n.toLowerCase().includes(query.trim().toLowerCase()))));
  const set=(options:Partial<PoolSettings>)=>{setDraft(s=>({...s,...options}));setMessage('');};
  const toggle=(field:'selected'|'locked'|'excluded',id:string)=>{
    const exists=draft[field].includes(id);
    const updating={...draft,[field]:exists?draft[field].filter(i=>i!==id):[...draft[field],id]};
    if(!exists&&field==='excluded') {
      updating.selected=updating.selected.filter(i=>i!==id);updating.locked=updating.locked.filter(i=>i!==id);
    } else if(!exists)updating.excluded=updating.excluded.filter(i=>i!==id);
    set(updating);
  };
  const substitutes=(id:string)=>foodList.filter(f=>!chosen.includes(f.id)&&!draft.excluded.includes(f.id)&&
    (conditionalPair(id,f.id)||directRules.some(rule=>rule.from===id&&rule.to===f.id)));
  function refresh(id:string,replacementId?:string) {
    if(draft.locked.includes(id)){setMessage('请先解锁该食材。');return;}
    const choices=substitutes(id);
    const next=replacementId?choices.find(f=>f.id===replacementId):choices[Math.floor(crypto.getRandomValues(new Uint32Array(1))[0]/4294967296*choices.length)];
    if(!next){setMessage('当前分类没有更多候选食材。');return;}
    set({selected:[...draft.selected.filter(i=>i!==id),next.id],method:'手动指定'});setReplacement('');
    setMessage('已将 '+food(id).name+' 改为 '+next.name+'，生成前仍会校验厨具和忌口。');
  }
  return <>
    <div className="page-title"><div><h1>生成设置</h1><p>选择七天食谱的起始日、采购和备餐安排。</p></div></div>
    <section className="card">

      <div className="fields">
        <label className="field">采购模式<select value={displayPoolMode(draft.mode)} onChange={e=>set({mode:e.target.value as PoolSettings['mode']})}>{visiblePoolModes.map(x=><option key={x}>{x}</option>)}</select></label>
        <label className="field">选择方式<select value={draft.method} onChange={e=>set({method:e.target.value as PoolSettings['method'],...(e.target.value==='手动指定'?{}:{strict:false})})}>{poolMethods.map(x=><option key={x}>{x}</option>)}</select></label>
        <label className="field">食谱从哪天开始<select value={start} onChange={e=>setStart(e.target.value as StartChoice)}>{startChoices.map(x=><option key={x}>{x}</option>)}</select></label>
        <label className="field">烹饪偏好<select value={cooking} onChange={e=>setCooking(e.target.value as CookingSelection)}><option>不限制</option><option>简单</option><option>家常</option></select></label>
      </div>
      <SupplyFields settings={settings} start={date} profile={profile} change={setSettings}/>
      {error&&<p className="error" role="alert">{error}</p>}
      <div className="actions"><button className="primary" disabled={busy} onClick={()=>run('生成')}>按设置生成</button>
        <button disabled={busy} onClick={()=>run('保存')}>保存设置</button></div>
    </section>
    <details className="card" open={draft.method==='手动指定'?true:undefined}><summary>高级食材设置 · 已选 {chosen.length} 种</summary>
      <div className="fields">
        <label className="field">轮换方式<select value={draft.rotation} onChange={e=>set({rotation:e.target.value as PoolSettings['rotation']})}>{rotations.map(x=><option key={x}>{x}</option>)}</select></label>
        <label className="field">用餐人数<input type="number" min={1} max={12} value={people} onChange={e=>setPeople(e.target.value)}/></label>
        <label className="field">全周预算（元，可选）<input type="number" min={0.01} step="0.01" value={budget} onChange={e=>setBudget(e.target.value)}/></label>
      </div>
      <label className="check"><input type="checkbox" checked={draft.strict} onChange={e=>set({strict:e.target.checked,...(e.target.checked?{method:'手动指定'}:{})})}/>只用已指定的食材</label>
      {previous&&<button type="button" disabled={busy} onClick={()=>run('沿用')}>保留食材重新生成</button>}
    {previous&&<PoolOverview pool={previous}><div className="actions"><button onClick={()=>set({selected:previous.used.map(i=>i.id),method:'手动指定',rotation:'保留上周'})}>载入上次实际食材</button></div></PoolOverview>}
    <div>
      <div className="segmented">{['候选食材','已选／锁定','排除'].map(v=><button key={v} aria-pressed={view===v} onClick={()=>{setView(v);setLimit(18);}}>{v}</button>)}</div>
      <div className="fields"><label className="field">搜索核心食材<input type="search" value={query} placeholder="例如鸡胸肉、燕麦" onChange={e=>{setQuery(e.target.value);setLimit(18);}}/></label>
        <label className="field">核心食材分类<select value={group} onChange={e=>{setGroup(e.target.value);setLimit(18);}}>{['全部',...poolGroups,'基础食材'].map(x=><option key={x}>{x}</option>)}</select></label></div>
      {visible.length?<ul className="pool-items">{visible.slice(0,limit).map(f=><li key={f.id}>
        <div className="section-title"><strong>{f.name}</strong>{pantry[f.id]?.stock?<span className="meta">登记库存 {decimal(pantry[f.id].stock!)} 克</span>:null}</div>
        <div className="actions">
          <button aria-pressed={draft.selected.includes(f.id)} onClick={()=>{toggle('selected',f.id);setDraft(s=>({...s,method:'手动指定'}));}}>指定</button>
          <button aria-pressed={draft.locked.includes(f.id)} onClick={()=>toggle('locked',f.id)}>锁定</button>
          <button aria-pressed={draft.excluded.includes(f.id)} onClick={()=>toggle('excluded',f.id)}>排除</button>
          {chosen.includes(f.id)&&<><button onClick={()=>setReplacement(replacement===f.id?'':f.id)}>替换</button><button onClick={()=>refresh(f.id)}>随机刷新</button></>}
        </div>
        {replacement===f.id&&<label className="field">选择替代食材<select value="" onChange={e=>refresh(f.id,e.target.value)}>
          <option value="">请选择</option>{substitutes(f.id).map(x=><option value={x.id} key={x.id}>{x.name}</option>)}</select></label>}
        {chosen.includes(f.id)&&<label className="field">偏好周用量（克，可选）<input type="number" min={0} max={100000} value={draft.goals?.[f.id]??''} onChange={e=>{
          const goals={...draft.goals};if(e.target.value)goals[f.id]=Math.min(100000,Math.max(0,+e.target.value));else delete goals[f.id];set({goals});
        }}/></label>}
      </li>)}</ul>:<Empty title="没有符合筛选的食材"/>}
      {visible.length>limit&&<button onClick={()=>setLimit(limit+18)}>显示更多食材</button>}
      {message&&<p className="hint" role="status">{message}</p>}
    </div>
    <details><summary>常用食材与调味料</summary>
      <p className="meta">按库存、偏好和实际用法优先选择，可选主油、食醋及常用食材。</p>
      <label className="field">添加常用商品<select value="" onChange={e=>{
        if(e.target.value)set({preferred:[...draft.preferred??[],e.target.value]});
      }}><option value="">请选择</option>{foodList.filter(f=>!draft.preferred?.includes(f.id)&&!draft.excluded.includes(f.id)).map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
      <div className="actions">{draft.preferred?.map(id=><button className="small" key={id} onClick={()=>set({preferred:draft.preferred?.filter(f=>f!==id)})}>{food(id).name} · 移除</button>)}</div>
    </details>
    <details><summary>分类上限和收藏模板</summary>
      <div className="fields">{poolGroups.map(g=><label className="field" key={g}>{g}上限（种）<input type="number" min={0} max={128} placeholder={String(capOf(draft,g))} value={draft.caps?.[g]??''} onChange={e=>{
        const caps={...draft.caps};if(e.target.value)caps[g]=Math.min(128,Math.max(0,Math.trunc(+e.target.value)));else delete caps[g];set({caps});
      }}/></label>)}</div>
      <label className="field">已收藏模板<select value={template} onChange={e=>{
        const found=templates.find(x=>x.id===e.target.value);if(found)setDraft(structuredClone(found.settings));setTemplate(e.target.value);
      }}><option value="">请选择</option>{templates.map(x=><option value={x.id} key={x.id}>{x.name}</option>)}</select></label>
      <button onClick={()=>{const name=prompt('给食材池模板起个名字')?.trim().slice(0,80);if(name)void onTemplate(name,draft);}}>收藏为模板</button>
    </details>
    </details>
    {children}
  </>;
}
