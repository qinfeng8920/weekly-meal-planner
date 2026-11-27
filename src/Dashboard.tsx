import {Action,CategoryGlyph,Icon,PageHeader,Progress,Sheet,StatusLabel} from './design';
import {procurementSummary} from './procurement-score';
import {useState} from 'react';
import {dateKey,type Profile,type Weight} from './profile';
import {between,type Targets} from './nutrition';
import {type Plan} from './planner';
import {decimal,Empty,integer,SectionTitle} from './ui';
import {addDays} from './batches';
import {displayPoolMode,type PoolSettings} from './ingredient-pool';
import type {SupplySettings,ShoppingSchedule} from './batches';
import type {Execution} from './execution';
import type {Logistics} from './logistics';

type DashboardProps={profile:Profile|null;t:Targets|null;reason:string;weights:Weight[];plan:Plan|null;stale:boolean;
  quote?:Logistics;poolCount:number;poolMode:PoolSettings['mode'];schedule?:ShoppingSchedule['count'];prep:SupplySettings['prep'];execution?:Execution;generate:()=>void;busy:boolean;go:(page:string)=>void;edit:()=>void;write:(weights:Weight[])=>Promise<boolean>};
export function Dashboard({profile,t,reason,weights,plan,stale,quote,poolCount,poolMode,schedule,prep,execution,generate,busy,go,edit,write}:DashboardProps) {
  const [showWeight,setShow]=useState(false);
  const ordered=[...weights].sort((a,b)=>a.date.localeCompare(b.date));
  const latest=ordered.at(-1);
  const current=latest?.kg??(profile?+profile.weight:null);
  const initial=profile?+profile.weight:null;
  const target=profile&&profile.goal==='减脂'?+profile.target:null;
  const progress=initial&&current&&target&&initial>target?Math.max(0,Math.min(100,(initial-current)*100/(initial-target))):null;
  const today=dateKey();
  const index=plan?.days.findIndex((_,i)=>addDays(plan.start,i)===today)??-1;
  const day=plan?.days[index];
  const next=quote?.prep.find(b=>b.end>=today&&b.jobs.some(j=>!j.key||!execution?.tasks?.[j.key]?.made));
  const todo=next?.jobs.filter(j=>!j.key||!execution?.tasks?.[j.key]?.made).length;
  const purchases=quote?procurementSummary(quote):null;
  const lines=quote?.batches.flatMap(b=>b.lines).filter(r=>r.buy>0||r.remaining>0)??[];
  const bought=lines.filter(r=>r.confirmed>0&&r.remaining===0).length;
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
        <div className="weight-values"><div><span>当前体重</span><strong>{current===null?'—':decimal(current)} <small>千克</small></strong></div>
          <div><span>目标体重</span><b>{target===null?'—':decimal(target)} <small>千克</small></b></div></div>
        {progress!==null&&<><Progress value={progress} max={100} label="体重目标进度"/>
          <p className="weight-note">{current!==null&&initial!==null&&current<initial?'累计减重 '+decimal(initial-current)+' 千克':'从起始体重追踪'} <strong>{Math.round(progress)}%</strong></p></>}
      </section>
      <section className="card trend-card"><SectionTitle title="体重趋势"/>
        {ordered.length>1?<WeightChart weights={ordered.slice(-45)}/>:<p className="meta">{ordered.length?'再记录一次体重后显示趋势。':'还没有称重记录。'}</p>}
        {ordered.length>1&&<details><summary>查看体重趋势</summary><Trend weights={ordered}/></details>}
      </section>
      <div className="home-task-grid">
        <section className="card home-task"><Icon name="bars"/><h2>每日热量目标</h2><strong>{t?integer(t.kcal):'—'} <small>千卡</small></strong>{reason&&<p className="meta">{reason}</p>}</section>
        <section className="card home-task"><Icon name="basket"/><h2>采购进度</h2><strong>{lines.length?bought+' / '+lines.length:'—'} <small>项</small></strong>
          {lines.length>0&&<Progress value={bought} max={lines.length} label="首页采购进度"/>}{quote&&<p className="meta">{purchases?.needed??0} 种待买</p>}
          {plan&&<button className="flat small" onClick={()=>go('采购')}>查看清单</button>}</section>
      </div>
      <section className="card home-today">
        <SectionTitle title={day?'今日食谱':future?'即将开始':'每周食谱'}>{plan&&<Action className="flat small" icon="arrow" onClick={()=>go('食谱')}>查看食谱</Action>}</SectionTitle>
        {stale&&<p className="hint">档案或体重已更新，当前展示保存时的方案。</p>}
        {day?day.meals.map(m=><div className="today-row" key={m.name}><b>{m.name}</b><span>{m.dishes.map(d=>d.recipe.name).join(' · ')}</span></div>):
          plan?<><StatusLabel>{future?plan.start+' 起':'当前方案已结束'}</StatusLabel>{future&&<p className="meta home-plan-meta">以下为首日安排</p>}
            {future&&plan.days[0].meals.map(m=><div className="today-row" key={m.name}><b>{m.name}</b><span>{m.dishes.map(d=>d.recipe.name).join(' · ')}</span></div>)}</>:
            <Empty title="还没有食谱"><p>生成七天搭配后，这里会显示当天的餐次。</p></Empty>}
        {!plan&&<Action icon="plus" className="primary" onClick={generate} disabled={busy}>{busy?'正在搭配食谱…':'生成七天食谱'}</Action>}
      </section>
      <section className="card home-prep">
        <SectionTitle title="下一次备餐"/>
        {next?<><p className="prep-date"><Icon name="calendar" size={20}/><strong>{next.prepDate}</strong><StatusLabel>{todo} 项待制作</StatusLabel></p>
          <Action icon="pot" className="primary" onClick={()=>go('备餐')}>继续备餐</Action></>:<p className="meta">{quote?'本周没有待制作的备餐任务。':'生成食谱后安排备餐。'}</p>}
        {quote?.conflicts?.length?<p className="hint">有采购日期或换算需要核对，请查看采购清单。</p>:null}
        {quote&&<p className="meta">{displayPoolMode(poolMode)} · {schedule==='自定义'?'自定义采购':'每周采购 '+schedule+' 次'} · {prep}备餐 · {poolCount} 种食材</p>}
      </section>
      {plan&&<div className="home-secondary"><button className="flat small" aria-label="生成七天食谱" disabled={busy} onClick={generate}>{busy?'正在搭配食谱…':'重新生成食谱'}</button></div>}
    </div>}
    {showWeight&&<Sheet title="体重记录" close={()=>setShow(false)}><WeightLog weights={ordered} write={write}/></Sheet>}
  </>;
}

function Trend({weights}:{weights:Weight[]}) {
  const end=Date.parse(dateKey());
  const recent=weights.filter(w=>end-Date.parse(w.date)<7*86400000);
  const month=weights.filter(w=>end-Date.parse(w.date)<30*86400000);
  if (!weights.length) return <p className="meta">还没有称重记录。</p>;
  return <>
    <p className="meta">近 7 天均值 {recent.length?decimal(recent.reduce((s,w)=>s+w.kg,0)/recent.length)+' 千克':'记录不足'} · 近 30 天 {month.length>1?((month.at(-1)!.kg-month[0].kg)>0?'+':'')+decimal(month.at(-1)!.kg-month[0].kg)+' 千克':'记录不足'}</p>
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
    if (!date || date>dateKey() || !between(+kg,35,260) || waist&&!between(+waist,35,250)) {setError('请填写有效日期、35～260 千克的体重及有效腰围。');return;}
    const row:Weight={date,kg:+kg,...(waist?{waist:+waist}:{})};
    if (await write([...weights.filter(w=>w.date!==date&&w.date!==editing),row])) {
      setKg('');setWaist('');setEditing('');setError('');
    }
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
