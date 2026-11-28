import {DeficitChoice,NormalDeficitConsent,usesExplicitDeficit} from './DeficitFields';
import {Action,CategoryGlyph,Icon,PageHeader,Progress,Sheet,StatusLabel} from './design';
import {nextPrep,weeklyPurchases} from './plan-progress';
import {useState} from 'react';
import {dateKey,type DeficitPreference,type Profile,type Weight} from './profile';
import {nutrition,type Targets} from './nutrition';
import {type Plan} from './planner';
import {decimal,Empty,integer,SectionTitle} from './ui';
import {calendarAge,meanWeight,updateWeight,validWeights,weightInRange,weightProgress} from './weight';
import {addDays} from './batches';
import {displayPoolMode,type PoolSettings} from './ingredient-pool';
import type {SupplySettings,ShoppingSchedule} from './batches';
import type {Execution} from './execution';
import type {Logistics} from './logistics';

const slowLoss:DeficitPreference={mode:'缓慢减脂',normalOptIn:true};

type DashboardProps={profile:Profile|null;t:Targets|null;reason:string;weights:Weight[];plan:Plan|null;stale:boolean;targetChanged:boolean;today:string;phase?:{kg:number;date?:string};resetPhase:(kg:number)=>Promise<boolean>;saveDeficit:(value:DeficitPreference)=>Promise<boolean>;
  quote?:Logistics;poolCount:number;poolMode:PoolSettings['mode'];schedule?:ShoppingSchedule['count'];prep:SupplySettings['prep'];execution?:Execution;generate:()=>void;updatePlan:()=>void;busy:boolean;go:(page:string)=>void;edit:()=>void;write:(weights:Weight[])=>Promise<boolean>};
export function Dashboard({profile,t,reason,weights,phase,plan,stale,targetChanged,today,resetPhase,saveDeficit,quote,poolCount,poolMode,schedule,prep,execution,generate,updatePlan,busy,go,edit,write}:DashboardProps) {
  const [showWeight,setShow]=useState(false);
  const [deficitSheet,setDeficitSheet]=useState<'settings'|'slow'|null>(null);
  const ordered=validWeights(weights,today);
  let slowPreview:Targets|undefined;
  if(profile?.goal==='减脂'&&t?.energy?.mode==='维持体重'&&t.energy.intent!=='维持体重'&&
    (t.energy.intent==='系统推荐'||profile.deficit&&usesExplicitDeficit(profile.deficit))) {
    const candidate=nutrition({...profile,deficit:slowLoss},ordered,today);
    if(candidate.energy?.mode==='减脂')slowPreview=candidate;
  }
  const progress=profile?weightProgress(profile,ordered,phase):null;
  const next=quote?nextPrep(quote,execution):undefined;
  const purchases=quote?weeklyPurchases(quote):undefined;
  const index=plan?.days.findIndex((_,i)=>addDays(plan.start,i)===today)??-1;
  const day=plan?.days[index];
  const future=plan&&index<0&&plan.start>today;
  return <>
    <PageHeader title={profile?.name?`你好，${profile.name}`:'吃好每一天'}
      subtitle={new Intl.DateTimeFormat('zh-CN',{month:'long',day:'numeric',weekday:'long'}).format(new Date())}>
      {profile&&<Action icon="slider" className="small flat" onClick={()=>go('生成设置')}>生成设置</Action>}
    </PageHeader>
    {!profile&&<section className="card welcome-card"><CategoryGlyph category="蔬菜"/><h2>从今天的一餐开始</h2><p>记录体重、搭配七天饮食，按家里的库存安排采购。</p>
      <Action icon="plus" className="primary" onClick={edit}>开始填写档案</Action>
    </section>}
    {profile&&<div className="home-layout">
      <section className="card weight-card">
        <div className="weight-header"><span><Icon name="scale" size={17}/> 体重与目标</span>
          <Action icon="plus" className="weight-record" onClick={()=>setShow(true)}>记录体重</Action></div>
        <div className="weight-values"><div><span>当前体重</span><strong>{progress&&weightInRange(progress.current)?decimal(progress.current):'—'} <small>千克</small></strong></div>
          <div><span>目标体重</span><b>{progress?.target==null?'—':decimal(progress.target)} <small>千克</small></b></div></div>
        {progress?.percent!=null&&<Progress value={progress.percent} max={100} label="体重目标进度"/>}
        {progress&&weightInRange(progress.initial)&&<p className="weight-note"><span className="weight-note-parts">
          <span>起点 {decimal(progress.initial)} 千克{phase?.date?' · '+phase.date:''}</span>
          {progress.lost!==null&&<span>{progress.lost<0?'较起点增加 '+decimal(-progress.lost):'累计减重 '+decimal(progress.lost)} 千克</span>}
          {progress.distance!==null&&<span>{progress.distance>0?'距目标 '+decimal(progress.distance)+' 千克':'已达到目标'}</span>}
          </span>{progress.percent!==null&&<strong>{Math.round(progress.percent)}%</strong>}</p>}
      </section>
      <section className="card trend-card"><SectionTitle title="体重趋势"/>
        {ordered.length>1?<WeightChart weights={ordered.slice(-45)}/>:<p className="meta">{ordered.length?'再记录一次体重后显示趋势。':'还没有称重记录，当前体重来自个人档案。'}</p>}
        {ordered.length>1&&<details><summary>查看体重趋势</summary><Trend weights={ordered} today={today}/></details>}
      </section>
      <div className="home-task-grid">
        <section className="card home-task"><Icon name="bars"/><h2>每日热量目标</h2><strong>{t?integer(t.kcal):'—'} <small>千卡</small></strong>
          {reason&&<p className="meta">{reason}</p>}{t?.energy&&<><p className="meta">实际模式 · {t.energy.mode}</p>
            {t.energy.mode==='维持体重'&&profile.goal==='减脂'&&<p className="meta">{t.energy.adjustment}</p>}
            {slowPreview&&<button className="primary small" onClick={()=>setDeficitSheet('slow')}>选择缓慢减脂</button>}
            {profile.goal==='减脂'&&<button className="flat small" onClick={()=>setDeficitSheet('settings')}>设置热量缺口</button>}
            <EnergyDetails targets={t} plan={plan}/></>}</section>
        <section className="card home-task"><Icon name="basket"/><h2>采购进度</h2><strong>{purchases?.total?purchases.done+' / '+purchases.total:quote?'无需采购':'—'}
          {purchases?.total?<small> 项</small>:null}</strong>
          {purchases&&purchases.total>0&&<Progress value={purchases.done} max={purchases.total} label="首页采购进度"/>}
          {purchases&&<p className="meta">{purchases.needed} 种待买{purchases.review?' · '+purchases.review+' 项数量待核对':''}</p>}
          {plan&&<button className="flat small" onClick={()=>go('采购')}>查看清单</button>}</section>
      </div>
      <section className="card home-today">
        <SectionTitle title={day?'今日食谱':future?'即将开始':'每周食谱'}>{plan&&<Action className="flat small" icon="arrow" onClick={()=>go('食谱')}>查看食谱</Action>}</SectionTitle>
        {stale&&<p className="hint">档案或健康限制需要重新核对。</p>}
        {targetChanged&&t&&plan&&<div className="hint">当前建议 {t.kcal} 千卡 · 方案生成时 {plan.targets.kcal} 千卡
          <div><button className="small" disabled={busy} onClick={updatePlan}>更新未执行食谱</button></div></div>}
        {day?day.meals.map(m=><div className="today-row" key={m.name}><b>{m.name}</b><span>{m.dishes.map(d=>d.recipe.name).join(' · ')}</span></div>):
          plan?<><StatusLabel>{future?plan.start+' 起':'当前方案已结束'}</StatusLabel>{future&&<p className="meta home-plan-meta">以下为首日安排</p>}
            {future&&plan.days[0].meals.map(m=><div className="today-row" key={m.name}><b>{m.name}</b><span>{m.dishes.map(d=>d.recipe.name).join(' · ')}</span></div>)}</>:
            <Empty title="还没有食谱"><p>生成七天搭配后，这里会显示当天的餐次。</p></Empty>}
        {!plan&&<Action icon="plus" className="primary" onClick={generate} disabled={busy}>{busy?'正在搭配食谱…':'生成七天食谱'}</Action>}
      </section>
      <section className="card home-prep">
        <SectionTitle title="下一次备餐"/>
        {next?<><p className="prep-date"><Icon name="calendar" size={20}/><strong>{next.date}</strong><StatusLabel>{next.date<today?'逾期待处理':'待处理'} {next.count} 项</StatusLabel></p>
          <Action icon="pot" className="primary" onClick={()=>go('备餐')}>继续备餐</Action></>:<p className="meta">{quote?'本周没有待制作的备餐任务。':'生成食谱后安排备餐。'}</p>}
        {quote?.conflicts?.length?<p className="hint">有采购日期或换算需要核对，请查看采购清单。</p>:null}
        {quote&&<p className="meta">{displayPoolMode(poolMode)} · {schedule==='自定义'?'自定义采购':'每周采购 '+schedule+' 次'} · {prep}备餐 · {poolCount} 种食材</p>}
      </section>
      {plan&&<div className="home-secondary"><button className="flat small" aria-label="生成七天食谱" disabled={busy} onClick={generate}>{busy?'正在搭配食谱…':'重新生成食谱'}</button></div>}
    </div>}
    {deficitSheet==='settings'&&profile&&t&&<Sheet title="设置热量缺口" close={()=>setDeficitSheet(null)}>
      <QuickDeficit profile={profile} weights={ordered} today={today}
        save={async value=>{if(await saveDeficit(value))setDeficitSheet(null);}}/>
    </Sheet>}
    {deficitSheet==='slow'&&slowPreview&&<Sheet title="选择缓慢减脂" close={()=>setDeficitSheet(null)}>
      <ConfirmSlowDeficit preview={slowPreview} cancel={()=>setDeficitSheet(null)}
        save={async()=>{if(await saveDeficit(slowLoss))setDeficitSheet(null);}}/>
    </Sheet>}
    {showWeight&&<Sheet title="体重记录" close={()=>setShow(false)}><WeightLog weights={ordered} write={write}/>{progress?.latest&&<details><summary>体重阶段</summary>
      <button onClick={()=>{if(confirm('以最近一次称重开启新阶段？原称重历史会保留。'))void resetPhase(progress.latest!.kg);}}>以最新体重开启新阶段</button></details>}</Sheet>}
  </>;
}

function ConfirmSlowDeficit({preview,cancel,save}:{preview:Targets;cancel:()=>void;save:()=>Promise<void>}) {
  const [saving,setSaving]=useState(false);
  return <>
    <div className="hint">
      <p>启用后预计每日目标 <strong>{integer(preview.kcal)} 千卡</strong></p>
      <p className="meta">标准缺口 300 千卡，按档案计算后约 {integer(preview.energy!.effective)} 千卡。</p>
    </div>
    <p>请先核对健康情况和用药。仅在你主动选择减脂，且没有需要先由专业人员评估的情况时确认。</p>
    <button className="primary" disabled={saving} onClick={async()=>{
      setSaving(true);
      try {await save();} finally {setSaving(false);}
    }}>{saving?'正在保存…':'确认适用并启用'}</button>
    <button className="flat" disabled={saving} onClick={cancel}>继续维持体重</button>
  </>;
}

function QuickDeficit({profile,weights,today,save}:{profile:Profile;weights:Weight[];today:string;save:(value:DeficitPreference)=>Promise<void>}) {
  const [value,setValue]=useState<DeficitPreference>(profile.deficit??{mode:'系统推荐'});
  const [saving,setSaving]=useState(false);
  let preview:Targets|undefined,error='';
  try {preview=nutrition({...profile,deficit:value},weights,today);}
  catch(e){error=e instanceof Error?e.message:'请核对热量设置。';}
  const needsConsent=preview?.energy&&Math.min(preview.bmi,preview.energy.actualBmi)<24&&profile.conditions.length===0
    &&usesExplicitDeficit(value)&&!value.normalOptIn;
  return <form onSubmit={async e=>{
    e.preventDefault();
    if(!preview||needsConsent||saving)return;
    setSaving(true);
    try {await save(value);} finally {setSaving(false);}
  }}>
    <p className="meta">这里会按你现有的档案和称重预览。正常 BMI 默认维持，主动确认适用后可以选择温和缺口。</p>
    <DeficitChoice value={value} onChange={setValue}/>
    {usesExplicitDeficit(value)&&profile.conditions.length===0&&
      <NormalDeficitConsent checked={Boolean(value.normalOptIn)} onChange={normalOptIn=>setValue({...value,normalOptIn})}/>}
    {preview&&<div className="hint" aria-live="polite">
      <p>预计每日目标 <strong>{integer(preview.kcal)} 千卡</strong></p>
      <p className="meta">{preview.message}</p>
    </div>}
    {error&&<p className="error" role="alert">{error}</p>}
    <button className="primary" type="submit" disabled={!preview||Boolean(needsConsent)||saving}>{saving?'正在保存…':'保存热量设置'}</button>
  </form>;
}

function EnergyDetails({targets,plan}:{targets:Targets;plan:Plan|null}) {
  const e=targets.energy!;
  const fields=[
    ['最新体重',decimal(e.current)+' 千克'],['最近称重日',e.latestDate??'暂无称重记录'],['计算体重',decimal(e.calculation)+' 千克'],['体重依据',e.weightReason],
    ['有效样本',e.recentCount+' 条（近 7 天，含今天） · '+e.earlierCount+' 条（距今 14～28 天）'],
    ['计算 BMI / 最新 BMI',targets.bmi.toFixed(2)+' / '+e.actualBmi.toFixed(2)],
    ['静息能耗（BMR）',decimal(targets.bmr)+' 千卡'],['日常活动系数',String(e.activity)],['总消耗（TDEE）',decimal(targets.tdee)+' 千卡'],
    ['选择的模式',e.intent],['标准缺口',decimal(e.requested)+' 千卡'],['限制后的标准缺口',decimal(e.standard)+' 千卡'],
    ['BMI 缺口保留比例',decimal(e.bmiFactor*100)+'%'],['距目标限制',decimal(e.distanceCap)+' 千卡'],
    ['安全允许上限',decimal(e.safetyCap)+' 千卡'],['最低能量',integer(e.floor)+' 千卡'],['实际计算缺口',decimal(e.effective)+' 千卡'],
    ['每日建议',integer(targets.kcal)+' 千卡'],['本次计算日期',e.calculatedOn],['计算与安全修正',e.adjustment],
    ...(plan?[['方案最近计算时间',new Date(plan.created).toLocaleString('zh-CN')]]:[]),
  ];
  return <details><summary>查看热量计算依据</summary><dl className="energy-basis">{fields.map(([key,value])=><div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl></details>;
}
function Trend({weights,today}:{weights:Weight[];today:string}) {
  const recent=weights.filter(w=>calendarAge(w.date,today)<7);
  const month=weights.filter(w=>calendarAge(w.date,today)<30);
  if (!weights.length) return <p className="meta">还没有称重记录。</p>;
  return <>
    <p className="meta">近 7 天均值 {recent.length?decimal(meanWeight(recent))+' 千克':'记录不足'} · 近 30 天 {month.length>1?((month.at(-1)!.kg-month[0].kg)>0?'+':'')+decimal(month.at(-1)!.kg-month[0].kg)+' 千克':'记录不足'}</p>
    {weights.length===1&&<p className="meta">再记录一次体重即可查看趋势。</p>}
  </>;
}
function WeightChart({weights}:{weights:Weight[]}) {
  const max=Math.max(...weights.map(w=>w.kg))+.3, min=Math.min(...weights.map(w=>w.kg))-.3;
  const from=Date.parse(weights[0].date), to=Date.parse(weights.at(-1)!.date);
  const width=320, baseline=106, left=40, right=306;
  const points=weights.map(w=>({
    x:left+(Date.parse(w.date)-from)/Math.max(1,to-from)*(right-left),
    y:baseline-(w.kg-min)/(max-min)*94,
  }));
  const range=[max,(max+min)/2,min];
  const line=points.map(p=>p.x+','+p.y).join(' ');
  return <figure className="weight-chart">
    <svg viewBox={`0 0 ${width} 132`} role="img" aria-label={`体重从 ${weights[0].date} 的 ${weights[0].kg} 千克至 ${weights.at(-1)!.date} 的 ${weights.at(-1)!.kg} 千克`}>
      {range.map((kg,i)=><g key={kg}><line x1={left} x2={right} y1={12+i*47} y2={12+i*47}/>
        <text x={36} y={16+i*47} textAnchor="end">{decimal(kg)}</text></g>)}
      <polyline fill="none" points={line}/>
      {points.map((p,i)=><circle r={i===points.length-1?4:2.6} key={weights[i].date} cx={p.x} cy={p.y}><title>{weights[i].date} · {weights[i].kg} 千克</title></circle>)}
      <text x={left} y={126}>{weights[0].date.slice(5).replace('-','/')}</text>
      <text x={right} y={126} textAnchor="end">{weights.at(-1)!.date.slice(5).replace('-','/')}</text>
    </svg><figcaption>体重（千克） · 实际记录</figcaption>
  </figure>;
}

function WeightLog({weights,write}:{weights:Weight[];write:(weights:Weight[])=>Promise<boolean>}) {
  const [date,setDate]=useState(dateKey),[kg,setKg]=useState(''),[waist,setWaist]=useState(''),[error,setError]=useState(''),[editing,setEditing]=useState('');
  async function save() {
    try {
      const row:Weight={date,kg:kg.trim()?Number(kg):NaN,...(waist.trim()?{waist:Number(waist)}:{})};
      if(await write(updateWeight(weights,row,editing))) {setKg('');setWaist('');setEditing('');setError('');}
    }catch(e){setError(e instanceof Error?e.message:'无法保存称重记录。');}
  }
  return <><div className="fields">
    <label className="field">日期<input type="date" value={date} max={dateKey()} onChange={e=>setDate(e.target.value)}/></label>
    <label className="field">体重（千克）<input type="number" step=".1" value={kg} onChange={e=>setKg(e.target.value)}/></label>
    <label className="field">腰围（厘米，选填）<input type="number" step=".1" value={waist} onChange={e=>setWaist(e.target.value)}/></label>
  </div><button className="primary" onClick={()=>void save()}>{editing?'更新记录':'保存体重'}</button>
  {error&&<p role="alert" className="error">{error}</p>}
  <ul className="history-log">{[...weights].reverse().map(w=><li key={w.date}><span>{w.date} · {decimal(w.kg)} 千克{w.waist?(' · 腰围 '+decimal(w.waist)+' 厘米'):''}</span>
    <button className="small" onClick={()=>{setEditing(w.date);setDate(w.date);setKg(String(w.kg));setWaist(w.waist?String(w.waist):'');}}>编辑</button>
    <button className="small" onClick={()=>{if(confirm('删除这条称重记录？'))void write(weights.filter(r=>r.date!==w.date));}}>删除</button></li>)}</ul></>;
}
