import {useMemo,useState} from 'react';
import {foods,foodState} from './catalog';
import {type Plan} from './planner';
import {type Pantry,type Purchase} from './shopping';
import {decimal,Empty,SectionTitle} from './ui';

export function purchaseText(purchases:Purchase[]) {
  return ['天天减 · 采购清单',...purchases.map(p=>
    `${p.done?'✓':'□'} ${p.category} · ${p.name} ${decimal(p.extra)} 克${p.uncertain?'（按净料）':''}`)].join('\n');
}
export function ShoppingPage({plan,purchases,pantry,update,share,download,readonly=false}:{plan:Plan|null;purchases:Purchase[];pantry:Pantry;
  update:(id:string,changes:Pantry[string])=>Promise<boolean>;share:(share:boolean)=>void;download:()=>void;readonly?:boolean}) {
  const [tab,setTab]=useState('清单');
  const [editing,setEditing]=useState('');
  const [query,setQuery]=useState('');
  const [inventoryId,setInventoryId]=useState('');
  const grouped=useMemo(()=>purchases.reduce<Record<string,Purchase[]>>((all,p)=>{(all[p.category]??=[]).push(p);return all;},{}),[purchases]);
  const done=purchases.filter(p=>p.done).length;
  const tally = purchases.reduce((n,p)=>n+(p.cost??0),0);
  const missing = purchases.filter(p=>p.cost===null).length;
  const batchCost = Array.from({length:Math.max(0,...purchases.map(p=>p.part.length))},(_,index)=> purchases.reduce((acc,p)=>{
    const quantity=p.part[index]??0;
    if (quantity>0 && p.cost===null) return {...acc,unknown:acc.unknown+1};
    return {...acc,cost:acc.cost+(p.buy?quantity/p.buy*(p.cost??0):0)};
  },{cost:0,unknown:0}));
  return <>
    <div className="page-title"><div><h1>采购与备餐</h1><p>{plan?`${plan.profile.people} 人用量 · ${plan.start} 起`:'从每周食谱自动汇总食材。'}</p></div></div>
    <div className="segmented">{(readonly?['清单','备餐']:['清单','备餐','库存与价格']).map(t=><button key={t} aria-pressed={tab===t} onClick={()=>setTab(t)}>{t}</button>)}</div>
    {tab==='清单'&&(plan?<><section className="card"><SectionTitle title="采购清单"><span className="meta">{done} / {purchases.length} 项</span></SectionTitle>
      <progress max={purchases.length||1} value={done} aria-label="已采购项目数"/>
      <p className="meta">已知费用 {decimal(tally)}{missing>0?` · ${missing} 项未知`:''}。价格使用你填写的每千克单价。录入可食率后按毛重换算采购量。</p>
      {batchCost.some((b,i)=>i>0&&(b.cost||b.unknown))&&<p className="meta">{batchCost.map((b,i)=>`第 ${i+1} 批 ${decimal(b.cost)}${b.unknown?' + '+b.unknown+' 项未知':''}`).join(' · ')}</p>}
      <p className="meta">部分生鲜按净料估算。买整件食材时，果皮、骨壳、菜梗等损耗需另计。无冷藏条件时易腐食材分日购入。</p>
      <div className="actions"><button onClick={()=>share(false)}>复制清单</button><button onClick={()=>share(true)}>分享清单</button><button onClick={download}>下载清单</button></div>
      </section>
      {Object.entries(grouped).map(([category,rows])=><section className="card" key={category}><SectionTitle title={category}/>
        <ul className="purchase-list">{rows?.map(r=><li key={r.id}>
          <div className="purchase-row"><label className="check"><input type="checkbox" checked={r.done} disabled={readonly||r.buy===0} onChange={e=>void update(r.id,{bought:e.target.checked?r.buy:0})}/>
            <strong>{r.name}</strong></label><span><b>{decimal(r.buy)} 克</b>{r.bought>0&&!r.done&&<small className="need-more">补买 {decimal(r.extra)} 克</small>}</span>
            <button className="small" onClick={()=>setEditing(editing===r.id?'':r.id)}>{editing===r.id?'收起':'详情'}</button></div>
          <p className="meta">需求 {decimal(r.need)} 克 · 库存 {decimal(r.stock)} 克 · {r.state}{r.uncertain?' · 净料下限':''} · {r.cost===null?'费用未知':('约 '+decimal(r.cost))}</p>
          {editing===r.id&&<><p>分批购买 {r.part.map((n,i)=>'第 '+(i+1)+' 批 '+decimal(n)+' 克').join('、')}</p>{!readonly&&<Inventory id={r.id} data={pantry[r.id]} update={update}/>}</>}
        </li>)}</ul>
      </section>)}</>:<Empty title="还没有采购清单"><p>生成一周食谱后，清单会随食材用量更新。</p></Empty>)}
    {tab==='备餐'&&(plan?<><section className="card"><SectionTitle title={plan.prep.mode}/><ul>{plan.prep.notice.map(n=><li key={n}>{n}</li>)}</ul></section>
      {plan.prep.days.map((d,i)=><section className="card" key={d.date}><SectionTitle title={d.date+' · '+['周一','周二','周三','周四','周五','周六','周日'][i]}/>
        <p>{d.task}</p><ul>{d.meals.map(m=><li key={m}>{m}</li>)}</ul><p className="meta">串行准备时间约 {d.minutes} 分钟，多人制作及分批加热需额外时间。</p></section>)}</>:<Empty title="还没有备餐计划"/>)}
    {tab==='库存与价格'&&<section className="card"><SectionTitle title="库存、可食率与单价"/>
      <p className="meta">库存按食谱净重计。可食率可按包装或实际称重录入。使用毛重采购时，已买、包装与单价也应以毛重计。</p>
      <label className="field">搜索食材<input type="search" value={query} placeholder="例如，鸡胸肉" onChange={e=>setQuery(e.target.value)}/></label>
      <label className="field">选择食材<select value={inventoryId} onChange={e=>setInventoryId(e.target.value)}><option value="">请选择</option>
        {foods.filter(f=>!query.trim()||[f.name,...f.aliases].some(n=>n.includes(query.trim()))).map(f=><option value={f.id} key={f.id}>{f.name} · {foodState[f.state]}</option>)}
      </select></label>
      {inventoryId&&<Inventory key={inventoryId} id={inventoryId} data={pantry[inventoryId]} update={update}/>}
    </section>}
  </>;
}

function Inventory({id,data,update}:{id:string;data:Pantry[string]|undefined;update:(id:string,changes:Pantry[string])=>Promise<boolean>}) {
  const [values,set]=useState(()=>({stock:String(data?.stock??''),bought:String(data?.bought??''),price:String(data?.price??''),pack:String(data?.pack??''),yieldPercent:String(data?.yieldPercent??'')}));
  const [error,setError]=useState('');
  async function submit() {
    const cleaned: Pantry[string]={};
    for (const [key,value] of Object.entries(values) as [keyof Pantry[string],string][]) {
      if (!value) {cleaned[key]=undefined;continue;}
      if (!Number.isFinite(+value)||+value<0||+value>1e7||key==='pack'&&+value<1||key==='yieldPercent'&&(+value<1||+value>100)) {setError('请输入有效的非负数量和单价。包装至少 1 克，可食率为 1～100%。');return;}
      cleaned[key]=+value;
    }
    if (await update(id,cleaned)) setError('');
  }
  return <><div className="fields">
    {([['stock','已有库存（克）'],['bought','本周已买（克）'],['price','参考单价（每千克）'],['pack','包装重量（克）'],['yieldPercent','可食率（%）']] as const).map(([key,label])=><label className="field" key={key}>{label}
      <input value={values[key]} type="number" step="any" onChange={e=>set({...values,[key]:e.target.value})}/></label>)}
  </div>{error&&<p className="error" role="alert">{error}</p>}<button className="small" onClick={()=>void submit()}>保存采购设置</button></>;
}
