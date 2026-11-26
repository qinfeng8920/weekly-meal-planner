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
import {costText} from './ShoppingPage';

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
  return <>
    <section className="page-title home-heading">
      <div><p className="meta">{new Intl.DateTimeFormat('zh-CN',{month:'long',day:'numeric',weekday:'long'}).format(new Date())}</p>
        <h1>{profile?.name?`你好，${profile.name}`:'吃好每一天'}</h1></div>
      <div className="actions">
        <button className="primary" disabled={busy} onClick={profile?generate:edit}>{busy?'正在搭配食谱…':profile?'生成七天食谱':'开始填写档案'}</button>
        {profile&&<button className="flat" onClick={()=>go('生成设置')}>生成设置</button>}
      </div>
    </section>
    {profile&&<section className="card">
      <SectionTitle title="身体与目标"><button className="flat" onClick={()=>setShow(true)}>记录体重</button></SectionTitle>
      <div className="home-metrics"><div><span>当前体重</span><b className="unit">{current===null?'—':decimal(current)} <small>千克</small></b></div>
        <div><span>目标体重</span><b className="unit">{target===null?'—':decimal(target)} <small>千克</small></b></div>
        <div><span>每日热量</span><b className="unit">{t?integer(t.kcal):'—'} <small>千卡</small></b></div></div>
      {progress!==null&&<progress max={100} value={progress} aria-label="体重目标进度"/>}
      {reason&&<p className="hint">{reason}</p>}
      <details><summary>查看体重趋势</summary><Trend weights={ordered}/></details>
    </section>}
    {profile&&<section className="card"><SectionTitle title="采购与备餐">{plan&&<button className="flat" onClick={()=>go('采购')}>查看清单</button>}</SectionTitle>
      <p className="home-plan-meta">{displayPoolMode(poolMode)} · {schedule==='自定义'?'自定义采购':'每周采购 '+schedule+' 次'} · {prep}备餐</p>
      {quote&&<p className="meta">{poolCount} 种食材 · 参考 {costText(quote.purchase)}</p>}
      {next&&<p className="meta">下一批待完成 {todo} 项 · {next.prepDate}<button className="flat" onClick={()=>go('备餐')}>继续备餐</button></p>}
      {quote?.conflicts?.length? <p className="hint">当前食谱有采购冲突，查看清单处理。</p>:null}
    </section>}
    {plan&&<section className="card home-today">
      <SectionTitle title={day?'今日食谱':'食谱首日'}><button className="flat" onClick={()=>go('食谱')}>查看食谱</button></SectionTitle>
      {stale&&<p className="hint">档案或体重已更新，当前展示原方案。</p>}
      {(day??plan.days[0]).meals.map(m=><div className="today-row" key={m.name}><b>{m.name}</b><span>{m.dishes.map(d=>d.recipe.name).join(' · ')}</span></div>)}
    </section>}
    {showWeight&&<div className="overlay" onClick={()=>setShow(false)}><section className="modal card" role="dialog" aria-modal="true" aria-label="体重记录" onClick={e=>e.stopPropagation()}>
      <SectionTitle title="体重记录"><button onClick={()=>setShow(false)}>关闭</button></SectionTitle><WeightLog weights={ordered} write={write}/>
    </section></div>}
  </>;
}

function Trend({weights}:{weights:Weight[]}) {
  const end=Date.parse(dateKey());
  const recent=weights.filter(w=>end-Date.parse(w.date)<7*86400000);
  const month=weights.filter(w=>end-Date.parse(w.date)<30*86400000);
  if (!weights.length) return <p className="meta">还没有称重记录。</p>;
  return <>
    <p className="meta">近 7 天均值 {recent.length?decimal(recent.reduce((s,w)=>s+w.kg,0)/recent.length)+' 千克':'记录不足'} · 近 30 天 {month.length>1?((month.at(-1)!.kg-month[0].kg)>0?'+':'')+decimal(month.at(-1)!.kg-month[0].kg)+' 千克':'记录不足'}</p>
    {weights.length>1?<WeightChart weights={weights.slice(-45)}/>:<p className="hint">至少两次测量才能展示趋势。一天的波动很常见。</p>}
  </>;
}
function WeightChart({weights}:{weights:Weight[]}) {
  const max=Math.max(...weights.map(w=>w.kg))+.3, min=Math.min(...weights.map(w=>w.kg))-.3;
  const from=Date.parse(weights[0].date), to=Date.parse(weights.at(-1)!.date);
  const points=weights.map(w=>({x:((Date.parse(w.date)-from)/(to-from))*96+2,y:88-(w.kg-min)/(max-min)*74}));
  return <figure className="weight-chart" aria-label="体重历史曲线">
    <div className="plot" aria-hidden="true">
      {points.slice(1).map((point,i)=>{
        const before=points[i], a=(point.x-before.x)*4,b=point.y-before.y;
        return <span className="plot-line" key={i} style={{left:before.x+'%',top:before.y+'%',width:`hypot(calc(${point.x-before.x} * 1cqw), ${b}px)`,transform:`rotate(atan2(${b}px, calc(${a/4} * 1cqw)))`}}/>;
      })}
      {points.map((p,i)=><i key={i} style={{left:p.x+'%',top:p.y+'%'}}/>)}
    </div><figcaption>{weights[0].date} 至 {weights.at(-1)!.date}</figcaption>
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
