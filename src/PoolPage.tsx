import {Action,Icon,PageHeader,SearchField,Segment,StatusLabel} from './design';
import {useEffect,useState,type ReactNode} from 'react';
import {searchMatches} from './catalog-search';
import {food,foods,recipeList} from './catalog';
import {applyPoolTemplate,capOf,counts,defaultPool,displayPoolMode,effectiveCap,foodStates,foodPreference,normalizeIds,poolGroup,poolGroups,fruitPolicies,visiblePoolModes,preferenceConflicts,setFoodPreference,type FoodState,type GenerationAction,type PoolSettings,type PoolTemplate,type WeeklyIngredientPool} from './ingredient-pool';
import {CatalogPaging,Empty,decimal,SectionTitle} from './ui';
import {foodClass,foodGroups} from './catalog-taxonomy';
import {procurementSummary} from './procurement-score';
import type {Logistics} from './logistics';
import {SupplyFields} from './SupplyEditors';
import {shoppingOffsets,splitWeek,type SupplySettings} from './batches';
import {dateKey,type Profile} from './profile';
import {mandatoryIds,newPlanStart,startChoices,type StartChoice} from './planner';
import {purchaseIngredientId,type PurchaseOptions} from './purchase-food';
import type {CookingSelection} from './cooking-profile';

export function PoolOverview({pool,children}:{pool:WeeklyIngredientPool;children?:ReactNode}) {
  const [show,setShow]=useState(false);
  const group=counts(pool.used.map(i=>i.id));
  return <section className="card">
    <SectionTitle title="本周实际使用食材"><span className="meta">{pool.used.length} 种</span></SectionTitle>
    <p className="stat-strip">{poolGroups.map(key=><span key={key}>{key} <b>{group[key]} 种</b></span>)}<span>基础 <b>{group.基础食材} 种</b></span></p>
    <p className="meta">{displayPoolMode(pool.settings.mode)}{pool.settings.strict?' · 严格限定':''}。按采购商品计数，基础食材和调味品也计入总数。</p>
    <button onClick={()=>setShow(!show)} aria-expanded={show}>{show?'收起食材':'查看食材与使用次数'}</button>
    {show&&<ul className="ingredients">{pool.used.map(i=><li key={i.id}>{food(i.id).name}<strong>{i.uses} 次 · {decimal(i.grams)} 克采购净料/人</strong></li>)}</ul>}
    {pool.supplements.length>0&&<details><summary>已同意补充 {pool.supplements.length} 种</summary><ul>
      {pool.supplements.map(s=><li key={s.id}>{food(s.id).name} {decimal(s.grams)} 克 · {s.reason} · {s.cost===null?'价格待补充':'约 ¥'+s.cost.toFixed(2)}</li>)}
    </ul></details>}
    {children}
  </section>;
}
export type GenerationDraft={settings:SupplySettings;people:string;budget:string;startChoice:StartChoice;cooking:CookingSelection;
};
export type PreferenceUpdate=(settings:PoolSettings)=>PoolSettings;
export function PoolPage({initial,previous,templates,stock,quote,busy,onSave,onGenerate,onPreferences,onTemplate,onDirty,profile,supply,startChoice,products,children}:{
  initial?:PoolSettings;previous?:WeeklyIngredientPool;templates:PoolTemplate[];stock:ReadonlyMap<string,number>;quote?:Logistics;busy:boolean;profile:Profile;
  supply:SupplySettings;startChoice:StartChoice;products?:PurchaseOptions;
  onSave:(values:GenerationDraft)=>Promise<boolean>;onGenerate:(action:GenerationAction)=>void;
  onPreferences:(update:PreferenceUpdate)=>Promise<boolean>;onTemplate:(name:string)=>Promise<boolean>;onDirty:(dirty:boolean)=>void;children?:ReactNode;
}) {
  const [draft,setDraft]=useState(()=>structuredClone(initial??defaultPool));
  const [pending,setPending]=useState(0),[saveStatus,setSaveStatus]=useState('');
  const [settings,setSettings]=useState(supply);
  const [people,setPeople]=useState(profile.people),[budget,setBudget]=useState(profile.budget),[start,setStart]=useState<string>(startChoice);
  const isCustom=!startChoices.some(choice=>choice===start);
  const legacyCooking=profile.cooking?.mode;
  const [cooking,setCooking]=useState<CookingSelection>(legacyCooking==='极简'?'简单':legacyCooking==='简单'||legacyCooking==='家常'?legacyCooking:'不限制');
  const [dirty,setDirty]=useState(false),[running,setRunning]=useState(false),[error,setError]=useState('');
  const [fruitQuery,setFruitQuery]=useState('');
  const [query,setQuery]=useState(''),[group,setGroup]=useState(''),[subgroup,setSubgroup]=useState(''),[page,setPage]=useState(0);
  const [template,setTemplate]=useState('');
  const [selectedOnly,setSelectedOnly]=useState(false),[batch,setBatch]=useState(false);
  const [checked,setChecked]=useState<string[]>([]),[batchState,setBatchState]=useState<FoodState>('锁定必用');
  useEffect(()=>{if(!pending)setDraft(structuredClone(initial??defaultPool));},[initial,pending]);
  useEffect(()=>{onDirty(dirty);return ()=>onDirty(false);},[dirty,onDirty]);
  function update(operation:PreferenceUpdate) {
    setDraft(operation);
    setPending(count=>count+1);
    setSaveStatus('正在保存食材偏好…');
    void onPreferences(operation).then(ok=>setSaveStatus(previous=>ok&&previous.startsWith('保存失败')?previous:
      ok?'食材偏好已保存。':'保存失败，页面已显示最近保存的偏好。请重试该项设置。'))
      .finally(()=>setPending(count=>count-1));
  }
  const patch=(values:Partial<PoolSettings>)=>update(current=>({...current,...values}));
  const change=(id:string,state:FoodState)=>update(current=>setFoodPreference(current,id,state));
  const fruitList=foods.filter(f=>f.category==='水果'&&recipeList.some(r=>r.group==='水果'&&r.ingredients[0].id===f.id));
  const foodList=foods.filter(f=>purchaseIngredientId(f.id,products)===f.id).map(f=>({f,...foodClass(f)}));
  const inGroup=foodList.filter(row=>!group||row.group===group);
  const visible=inGroup.filter(({f,subgroup:sub})=>(!subgroup||sub===subgroup)&&(!selectedOnly||foodPreference(draft,f.id)!=='自动')&&searchMatches([f.name,...f.aliases],query));
  const locked=normalizeIds(draft.locked,products), priorities=normalizeIds(draft.preferred??[],products);
  const excluded=normalizeIds(draft.excluded,products), lockCount=counts(locked);
  const conflicts=preferenceConflicts(draft,products);
  const requiredCount=counts(mandatoryIds(profile,draft,products));
  const conflictingFruit=locked.filter(id=>poolGroup(id)==='水果'&&id!==draft.fruitId);
  const summary=quote?procurementSummary(quote):undefined;
  let date='';
  try {date=newPlanStart(start as StartChoice);} catch { /* 下方表单提示有效日期。 */ }
  const pageSize=15;
  const mark=()=>{setDirty(true);onDirty(true);};
  async function run(action:'保存'|GenerationAction) {
    if(running||busy)return;
    try {
      if(!date)throw Error('自定义起始日必须是今天或未来的有效日期。');
      splitWeek(settings);shoppingOffsets(settings,profile,date||dateKey(),dateKey());
      if(!Number.isInteger(+people)||+people<1||+people>12||budget&&(!Number.isFinite(+budget)||+budget<=0||+budget>1e7))
        throw Error('请检查人数及预算。');
      setRunning(true);setError('');
      if(dirty||action==='保存') {
        if(!await onSave({settings,people,budget,startChoice:start as StartChoice,cooking}))return;
        setDirty(false);onDirty(false);
      }
      if(action!=='保存'&&conflicts.length)throw Error(conflicts[0]);
      if(action!=='保存'&&draft.fruitPolicy==='每周固定一种'&&profile.fruit!=='不吃水果'&&!draft.fruitId)throw Error('请选择固定水果。');
      if(action!=='保存')onGenerate(action);
    }catch(e){setError(e instanceof Error?e.message:'设置无效。');}
    finally {setRunning(false);}
  }
  function chooseFixedFruit(id:string) {
    const others=locked.filter(item=>poolGroup(item)==='水果'&&item!==id);
    if(others.length&&!confirm('将固定水果换成'+food(id).name+'，并解除 '+others.map(item=>food(item).name).join('、')+' 的必用锁定？'))return;
    update(current=>{
      let next={...current,fruitId:id,fruitOverrides:undefined} as PoolSettings;
      for(const other of others)next=setFoodPreference(next,other,'自动');
      return next;
    });
  }
  return <>
    <PageHeader title="生成设置" subtitle="安排开始日期、采购和每餐偏好。">
      <StatusLabel tone={dirty?'warning':'positive'}>{dirty?'有待保存的改动':'食材偏好自动保存'}</StatusLabel>
    </PageHeader>
    <section className="card settings-section"><SectionTitle title="基本设置"><Icon name="calendar"/></SectionTitle>
      <div className="fields">
        <label className="field">食谱从哪天开始<select value={isCustom?'自定义':start} onChange={e=>{setStart(e.target.value==='自定义'?dateKey():e.target.value);mark();}}>
          {startChoices.map(x=><option key={x}>{x}</option>)}<option>自定义</option></select></label>
        {isCustom&&<label className="field">起始日期<input type="date" min={dateKey()} value={start} onChange={e=>{setStart(e.target.value);mark();}}/></label>}
        <label className="field">烹饪偏好<select value={cooking} onChange={e=>{setCooking(e.target.value as CookingSelection);mark();}}><option>不限制</option><option>简单</option><option>家常</option></select></label>
        <label className="field">用餐人数<input type="number" min={1} max={12} value={people} onChange={e=>{setPeople(e.target.value);mark();}}/></label>
        <label className="field">全周预算（元，可选）<input type="number" min={.01} step=".01" value={budget} onChange={e=>{setBudget(e.target.value);mark();}}/></label>
      </div>
    </section>
    <section className="card settings-section"><SectionTitle title="采购备餐"><Icon name="basket"/></SectionTitle>
      <p className="field">采购模式</p><Segment label="采购模式" items={visiblePoolModes} value={displayPoolMode(draft.mode)} change={mode=>patch({mode})}/>
      <SupplyFields settings={settings} start={date} profile={profile} change={value=>{setSettings(value);mark();}}/>
    </section>
    <section className="card settings-section"><SectionTitle title="食材设置"><Icon name="box"/></SectionTitle>
      <p className="stat-strip"><span>已锁定 <b>{locked.length} 种</b></span><span>优先使用 <b>{priorities.length} 种</b></span><span>禁止使用 <b>{excluded.length} 种</b></span></p>
      <p className="meta">家中有库存 {[...stock.values()].filter(grams=>grams>0).length} 种
        {summary&&' · 本周实际使用 '+summary.used+' 种（主要食材 '+summary.main+'、调味料 '+summary.seasonings+'）'}
        {summary&&' · 待采购 '+summary.needed+' 种（主要食材 '+summary.neededMain+'、调味料 '+summary.neededSeasonings+'）'}</p>
      {saveStatus&&<p className="meta" role="status">{pending?'正在保存食材偏好…':saveStatus}</p>}
      {locked.length>0&&<div className="actions" aria-label="已锁定食材">{locked.map(id=><button className="small" key={id}
        aria-label={'解除'+food(id).name+'锁定'} onClick={()=>change(id,'自动')}>{food(id).name} ×</button>)}</div>}
      {(locked.length>0||priorities.length>0||excluded.length>0||Boolean(draft.reviews?.length))&&<div className="actions">
        {locked.length>0&&<button onClick={()=>{if(confirm('解除全部必用锁定？其他偏好会保留。'))update(current=>({...current,locked:[]}));}}>全部解除锁定</button>}
        <button onClick={()=>{if(confirm('将所有食材偏好重置为自动？严格食材池和固定搭配保留。'))
          update(current=>({...current,locked:[],excluded:[],preferred:[],reviews:[],goals:undefined}));}}>重置食材偏好</button>
      </div>}
      {conflicts.length>0&&<ul className="hint">{conflicts.map(issue=><li key={issue}>{issue}</li>)}</ul>}
      {draft.reviews?.map(row=><label className="field" key={row.id}>核对{food(row.id).name}的旧偏好<select value="" onChange={e=>change(row.id,e.target.value as FoodState)}>
        <option value="">请选择确认后的状态</option>{foodStates.map(state=><option key={state}>{state}</option>)}</select></label>)}
      <div className="actions preference-tools"><button aria-pressed={selectedOnly} onClick={()=>{setSelectedOnly(!selectedOnly);setPage(0);}}>查看已选食材</button>
        <button aria-pressed={batch} onClick={()=>{setBatch(!batch);setChecked([]);}}>{batch?'结束多选':'批量选择'}</button></div>
      <SearchField label="搜索核心食材" placeholder="名称、别名或拼音" value={query} change={value=>{setQuery(value);setPage(0);}}/>
      <div className="fields">
        <label className="field">食材一级分类<select value={group} onChange={e=>{setGroup(e.target.value);setSubgroup('');setPage(0);}}>
          <option value="">全部</option>{foodGroups.map(g=><option key={g}>{g}</option>)}</select></label>
        {group&&<label className="field">食材二级分类<select value={subgroup} onChange={e=>{setSubgroup(e.target.value);setPage(0);}}>
          <option value="">全部</option>{[...new Set(inGroup.map(row=>row.subgroup))].map(g=><option key={g}>{g}</option>)}</select></label>}
      </div>
      {visible.length?<ul className="pool-items">{visible.slice(page*pageSize,(page+1)*pageSize).map(({f})=><li key={f.id}>
        <div className="pool-food"><div className="pool-food-name">
          {batch&&<input type="checkbox" aria-label={'选择'+f.name} checked={checked.includes(f.id)} onChange={e=>{
            const selected=e.target.checked;setChecked(previous=>selected?[...previous,f.id]:previous.filter(id=>id!==f.id));
          }}/>}<div><strong>{f.name}</strong><p className="meta">账面库存 {decimal(stock.get(f.id)??0)} 克</p></div></div>
          <select aria-label={f.name+'偏好'} value={foodPreference(draft,f.id)} onChange={e=>change(f.id,e.target.value as FoodState)}>
            {foodStates.map(state=><option key={state}>{state}</option>)}</select></div>
        {draft.strict&&<label className="check"><input type="checkbox" disabled={draft.locked.includes(f.id)||draft.excluded.includes(f.id)}
          checked={!draft.excluded.includes(f.id)&&(draft.selected.includes(f.id)||draft.locked.includes(f.id))}
          onChange={e=>{const allowed=e.target.checked;update(current=>({...current,selected:allowed?[...new Set([...current.selected,f.id])]:current.selected.filter(id=>id!==f.id)}));}}/>允许用于严格食材池</label>}
      </li>)}</ul>:<Empty title="没有符合筛选的食材"/>}
      {batch&&<div className="actions batch-preferences"><label className="field">批量状态<select value={batchState} onChange={e=>setBatchState(e.target.value as FoodState)}>
        {foodStates.map(state=><option key={state}>{state}</option>)}</select></label>
        <Action className="primary" icon="check" disabled={!checked.length} onClick={()=>{
          update(current=>checked.reduce((next,id)=>setFoodPreference(next,id,batchState),current));setChecked([]);setBatch(false);
        }}>应用到 {checked.length} 种</Action></div>}
      <CatalogPaging page={page} size={pageSize} total={visible.length} change={setPage}/>
    </section>
    <section className="card settings-section"><SectionTitle title="固定搭配"><Icon name="lock"/></SectionTitle>
      {profile.fruit!=='不吃水果'&&<div className="fields">
        <label className="field">每周水果<select value={draft.fruitPolicy??'少量轮换'}
          onChange={e=>patch({fruitPolicy:e.target.value as PoolSettings['fruitPolicy']})}>{fruitPolicies.map(x=><option key={x}>{x}</option>)}</select></label>
        {draft.fruitPolicy==='每周固定一种'&&<>
          <label className="field">搜索固定水果<input type="search" value={fruitQuery} onChange={e=>setFruitQuery(e.target.value)}/></label>
          <label className="field">固定水果<select aria-label="固定水果" value={draft.fruitId??''} onChange={e=>{if(e.target.value)chooseFixedFruit(e.target.value);}}>
            <option value="">请选择</option>{fruitList.filter(f=>f.id===draft.fruitId||searchMatches([f.name,...f.aliases],fruitQuery)).map(f=><option key={f.id} value={f.id}>{f.name}</option>)}
          </select></label>
        </>}
      </div>}
      {draft.fruitPolicy==='每周固定一种'&&draft.fruitId&&conflictingFruit.length>0&&<div className="actions">
        <button onClick={()=>{if(confirm('保留'+food(draft.fruitId!).name+'并解除冲突水果的必用锁定？'))
          update(current=>conflictingFruit.reduce((next,id)=>setFoodPreference(next,id,'自动'),current));}}>保留当前固定水果</button>
        <button onClick={()=>patch({fruitPolicy:'少量轮换',fruitOverrides:undefined})}>改为多种水果轮换</button>
      </div>}
      {children}
    </section>
    <details className="card"><summary>高级设置</summary>
      <label className="check"><input type="checkbox" checked={draft.strict} onChange={e=>{
        const strict=e.target.checked;
        update(current=>({...current,strict,selected:strict?[...new Set([...current.selected,...(previous?.used.map(row=>row.id)??[])])].filter(id=>!current.excluded.includes(id)):[]}));
      }}/>启用严格食材池</label>
      {draft.strict&&<p className="meta">可在食材列表勾选允许使用的原料和调味料，锁定食材自动纳入。</p>}
      <div className="fields">{poolGroups.map(g=>{
        const cap=effectiveCap(draft,g,requiredCount[g]);
        return <div className="field" key={g}><label className="field">{g}上限（种）<input type="number" min={0} max={foods.length}
          placeholder={String(cap)} value={draft.caps?.[g]??''} onChange={e=>{
            const value=e.target.value;update(current=>{
              const caps={...current.caps};if(value)caps[g]=Math.min(foods.length,Math.max(0,Math.trunc(+value)));else delete caps[g];
              return {...current,caps};
            });
          }}/></label><span className="meta">已锁定 {lockCount[g]} 种 · 可自动补充 {Math.max(0,cap-requiredCount[g])} 种
          {draft.caps?.[g]===undefined&&requiredCount[g]>capOf(draft,g)?' · 系统目标已随锁定调整为 '+cap+' 种':''}</span>
          {draft.caps?.[g]!==undefined&&requiredCount[g]>cap&&<button onClick={()=>{if(confirm('把你设置的'+g+'上限提高到 '+requiredCount[g]+' 种？'))
            update(current=>({...current,caps:{...current.caps,[g]:requiredCount[g]}}));}}>确认提高上限</button>}</div>;
      })}</div>
      <label className="field">已收藏模板<select value={template} onChange={e=>{setTemplate(e.target.value);}}>
        <option value="">请选择</option>{templates.map(x=><option value={x.id} key={x.id}>{x.name}</option>)}</select></label>
      <div className="actions"><button disabled={!template} onClick={()=>{
        const found=templates.find(t=>t.id===template);
        if(!found)return;
        update(current=>applyPoolTemplate(current,found.settings));
      }}>载入模板</button>
      <button onClick={()=>{const name=prompt('给食材设置模板起个名字')?.trim().slice(0,80);if(name)void onTemplate(name);}}>收藏为模板</button></div>
    </details>
    <div className="card pool-toolbar" aria-label="生成与保存"><div className="actions">
      <Action className="primary" icon="check" disabled={busy||running} onClick={()=>void run('重新搭配')}>重新搭配</Action>
      {previous&&<><button disabled={busy||running} onClick={()=>void run('沿用食材')}>沿用食材</button>
        <button disabled={busy||running} onClick={()=>void run('轮换食材')}>轮换食材</button></>}
      <button disabled={busy||running} onClick={()=>void run('保存')}>保存设置</button>
    </div>{dirty&&<p className="meta">基本或采购设置待保存。</p>}
    {error&&<p className="error" role="alert">{error}</p>}</div>
  </>;
}
