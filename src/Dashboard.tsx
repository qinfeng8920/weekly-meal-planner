import {useState} from 'react';
import {dateKey,type Profile,type Weight} from './profile';
import {between,type Targets} from './nutrition';
import {type Plan} from './planner';
import {decimal,Empty,integer,SectionTitle} from './ui';
import {addDays} from './batches';
import type {Logistics} from './logistics';
import {costText} from './ShoppingPage';

type DashboardProps={profile:Profile|null;t:Targets|null;reason:string;weights:Weight[];plan:Plan|null;stale:boolean;
  quote?:Logistics;poolCount:number;shoppingPercent:number;generate:()=>void;busy:boolean;go:(page:string)=>void;edit:()=>void;write:(weights:Weight[])=>Promise<boolean>};
export function Dashboard({profile,t,reason,weights,plan,stale,quote,poolCount,shoppingPercent,generate,busy,go,edit,write}:DashboardProps) {
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
  const next=quote?.prep.find(b=>b.end>=today);
  return <>
    <section className="page-title home-heading">
      <div><p className="meta">{new Intl.DateTimeFormat('zh-CN',{month:'long',day:'numeric',weekday:'long'}).format(new Date())}</p>
        <h1>{profile?.name?`你好，${profile.name}`:'吃好每一天'}</h1></div>
      <div className="actions">
        {plan&&<button className="primary" onClick={()=>go('备餐')}>继续备餐</button>}
        <button className={plan?'':'primary'} disabled={busy} onClick={profile?generate:edit}>{busy?'正在搭配食谱…':profile?'生成本周食谱':'开始填写档案'}</button>
        {profile&&<button className="flat" onClick={()=>go('生成设置')}>设置并生成</button>}
      </div>
    </section>
    {plan&&<section className="card home-today">
      <SectionTitle title={day?'今日食谱':'本周食谱'}><button className="flat" onClick={()=>go('食谱')}>查看食谱</button></SectionTitle>
      {stale&&<p className="hint">档案或体重已更新，当前展示原方案。</p>}
      {(day??plan.days[0]).meals.map(m=><div className="today-row" key={m.name}><b>{m.name}</b><span>{m.dishes.map(d=>d.recipe.name).join(' · ')}</span></div>)}
    </section>}
    {plan&&<section className="card"><SectionTitle title="采购与备餐"><button className="flat" onClick={()=>go('采购')}>查看清单</button></SectionTitle>
      <div className="stat-strip"><span>{poolCount} 种食材</span>{quote&&<span>预计采购 <b>{costText(quote.purchase)}</b></span>}
        {quote&&<span>备餐周期 <b>{quote.prep.map(b=>b.range.to-b.range.from).join('＋')}</b></span>}</div>
      <progress max={100} value={shoppingPercent} aria-label="采购进度"/>
      {next&&<p className="meta">当前或下一批 {next.start} 至 {next.end} · {next.jobs.length} 项操作</p>}
    </section>}

    <div className="dashboard-grid">
      <section className="card goal-card">
        <SectionTitle title="体重进展"><button className="small" onClick={()=>profile?setShow(true):edit()}>记录体重</button></SectionTitle>
        <div className="weight-summary"><div><span>当前体重</span><strong>{current===null?'—':decimal(current)} <small>千克</small></strong></div>
          <div><span>初始</span><strong>{initial===null?'—':decimal(initial)}</strong></div><div><span>目标</span><strong>{target===null?'—':decimal(target)}</strong></div></div>
        <progress max={100} value={progress??0} aria-label="体重目标进度"/>
        <p className="meta">{initial===null||current===null?'完成档案后开始记录。':`较初始${initial>=current?'减少':'增加'} ${decimal(Math.abs(initial-current))} 千克${progress===null?'':' · 已完成 '+integer(progress)+'%'}`}</p>
      </section>
      <section className="card goal-card">
        <SectionTitle title="每日营养目标"/>
        {t?<><p className="large">{integer(t.kcal)} <small>千卡 / 日</small></p>
          <div className="stat-strip"><span>蛋白质 <b>{t.protein} 克</b></span><span>碳水 <b>{t.carbs} 克</b></span><span>脂肪 <b>{t.fat} 克</b></span><span>纤维 <b>{t.fiber} 克</b></span></div>
          <p className="meta">估算 BMI {decimal(t.bmi)} · BMR {integer(t.bmr)} · TDEE {integer(t.tdee)} 千卡</p>
          <p className="meta">{t.water===null?'饮水遵循医嘱':`建议饮水约 ${t.water} 毫升`}。{t.message}</p></>:<p className="hint">{reason||'保存个人档案后查看能量和营养估算。'}</p>}
      </section>
    </div>
    {!plan&&<Empty title="今天的菜单还空着"><p>完成档案后可以为一周搭配食谱。</p></Empty>}
    <section className="card">
      <SectionTitle title="体重趋势"><button className="small" onClick={()=>profile?setShow(true):edit()}>查看记录</button></SectionTitle>
      <Trend weights={ordered}/>
    </section>
    <button className="text-link" onClick={()=>go('历史方案')}>历史方案</button>
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
