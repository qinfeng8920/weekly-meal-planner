import {useState} from 'react';
import {food} from './catalog';
import {addDays,supplyDefaults,type SupplySettings} from './batches';
import {edibleRate,gramsPerPriceUnit,type PriceInput} from './prices';
import {ingredientLabel,type BuyLine,type Cost,type Logistics,type PrepBatch,type Receipt,type SupplyState} from './logistics';
import type {Plan} from './planner';
import type {Profile} from './profile';
import type {Pantry,Purchase} from './shopping';
import {decimal,Empty,SectionTitle} from './ui';
import {InventoryManager,PriceManager,SupplyEditor,yuan} from './SupplyEditors';

const tabs=['全周汇总','分批采购','分批备餐','食材价格','家中库存'] as const;
export type SupplyTab=typeof tabs[number];
export type SupplyActions={
  saveSettings:(settings:SupplySettings,people:string,budget:string)=>Promise<boolean>;
  savePrice:(id:string,value?:PriceInput)=>Promise<boolean>;resetPrices:()=>void;
  exportPrices:()=>void;importPrices:(file:File)=>void;stock:(id:string,n:number)=>Promise<boolean>;
  receipt:(row:BuyLine,value?:Receipt)=>Promise<boolean>;
};
export const costText=(cost:Cost)=>cost.missing?(cost.items===cost.missing?'价格待补充':yuan(cost.known)+' + 待补充')+
  '（'+(cost.items-cost.missing)+'/'+cost.items+' 项已知）':yuan(cost.known);
const pendingPrice=(r:BuyLine)=>r.price?`${yuan(r.price.amount)}/${r.price.unit} · ${r.price.basis} · ${r.price.kind}`:'待补充单价';
const sizeText=(r:BuyLine)=>{
  const unit=r.price&&gramsPerPriceUnit(r.price);
  const counted=r.price&&['个','盒','袋'].includes(r.price.unit);
  const pack=r.price?.pack??(counted?unit:undefined);
  const count=pack?`（${decimal(r.buy/pack)} ${counted&&unit===pack?r.price!.unit:'包'}）`:
    r.price&&unit&&['升','毫升'].includes(r.price.unit)&&r.buy>0?`（约 ${decimal(r.buy/unit)} ${r.price.unit}）`:'';
  return decimal(r.buy)+' 克'+count;
};
const useText=(start:string,u:BuyLine['uses'][number])=>`${addDays(start,u.day)} ${u.meal} · ${u.dish} · ${decimal(u.grams)} 克`;

export function purchaseText(purchases:Purchase[]) {
  return ['天天减 · 旧版采购清单',...purchases.map(p=>`${p.name} ${decimal(p.buy)} 克`)].join('\n');
}
export function batchPurchaseText(rows:BuyLine[],title:string) {
  return ['天天减 · '+title,...rows.filter(r=>r.need||r.buy).map(r=>
    `${r.buy&&!r.remaining?'✓':'□'} ${food(r.id).name} · 采购 ${sizeText(r)} · ${pendingPrice(r)} · 小计 ${costText(r.cost)}`)].join('\n');
}
function prepText(batch:PrepBatch,start:string) {
  return ['天天减 · 分批备餐 '+batch.start+' 至 '+batch.end,'备餐日期 '+batch.prepDate,...batch.rows.flatMap(row=>[
    ingredientLabel(row.id)+' '+decimal(row.grams)+' 克，分 '+row.uses.length+' 份',
    ...row.uses.map(u=>useText(start,u)+' · '+u.method),
  ]),...batch.jobs.map(j=>addDays(start,j.at)+' '+j.name+' · '+j.method+' · '+j.steps.join(' '))].join('\n');
}
export function ShoppingPage({plan,profile,quote,state,pantry,actions,copy,download,initialTab='全周汇总',reprice,repriced=false}:{
  plan:Plan|null;profile:Profile|null;quote?:Logistics;state?:SupplyState;pantry?:Pantry;actions?:SupplyActions;
  copy:(text:string,share?:boolean)=>void;download:(text:string)=>void;initialTab?:SupplyTab;reprice?:()=>void;repriced?:boolean;
}) {
  const [tab,setTab]=useState<SupplyTab>(initialTab),[detail,setDetail]=useState('');
  const readonly=!actions;
  const inventory=Object.fromEntries(quote?.inventory.map(row=>[row.id,row])??[]);
  const supply=state??{};
  return <>
    <div className="page-title"><div><h1>采购与备餐</h1><p>{quote?`${quote.people} 人 · ${quote.start} 起 · 人民币`:'按食谱实际用量管理采购和备餐。'}</p></div>
      {reprice&&<button onClick={reprice}>{repriced?'返回历史价格快照':'按最新价格重新估算'}</button>}</div>
    {quote&&<Overview quote={quote}/>}
    {profile&&actions&&<SupplyEditor key={JSON.stringify([profile.people,profile.budget,supply.settings])}
      settings={supply.settings??supplyDefaults(profile)} start={plan?.start} people={profile.people} budget={profile.budget} save={actions.saveSettings}/>}
    <div className="segmented" aria-label="采购与备餐视图">{(readonly?tabs.slice(0,3):tabs).map(t=><button key={t}
      aria-pressed={tab===t} onClick={()=>{setTab(t);setDetail('');}}>{t}</button>)}</div>
    {tab==='食材价格'&&actions&&<PriceManager book={supply.prices??{}} pantry={pantry??{}} save={actions.savePrice}
      resetAll={actions.resetPrices} exportPrices={actions.exportPrices} importPrices={actions.importPrices}/>}
    {tab==='家中库存'&&actions&&<InventoryManager pantry={pantry??{}} inventory={inventory} save={actions.stock}/>}
    {tabs.slice(0,3).includes(tab)&&!quote&&(!plan?<Empty title="尚无食谱"><p>生成食谱后可查看每批采购和备餐。</p></Empty>:
      <section className="card"><SectionTitle title="旧版采购与备餐快照"/>
        <p className="hint">这份历史方案按保存时的记录显示。可主动使用最新价格与批次设置重新估算。</p>
        <button className="small" onClick={()=>copy(purchaseText(plan.purchases))}>复制历史清单</button>
        {tab==='分批备餐'?plan.prep.days.map(d=><p key={d.date}>{d.date} · {d.task}</p>):
          <ul>{plan.purchases.map(p=><li key={p.id}>{p.name} · {decimal(p.buy)} 克 · {p.cost===null?'价格待补充':yuan(p.cost)}</li>)}</ul>}
      </section>)}
    {tab==='全周汇总'&&quote&&<>
      <section className="card"><SectionTitle title="全周采购清单"/>
        <p className="meta">一次采购仍保留独立备餐批次。易腐品会按实际保存条件另排采购日。在「分批采购」确认实际购买及金额。</p>
        <div className="actions"><button onClick={()=>copy(batchPurchaseText(quote.lines,'全周清单'))}>复制全周清单</button>
          <button onClick={()=>copy(batchPurchaseText(quote.lines,'全周清单'),true)}>分享全周清单</button>
          <button onClick={()=>download(batchPurchaseText(quote.lines,'全周清单'))}>下载清单</button></div>
      </section>
      <section className="card"><SectionTitle title="分类费用占比"/>
        <ul className="ingredients">{Object.entries(quote.categories).map(([category,c])=><li key={category}>{category}<strong>
          {costText(c)}{quote.purchase.known>0?' · 已知费用占比 '+Math.round(c.known/quote.purchase.known*100)+'%':''}
        </strong></li>)}</ul>
      </section>
      <section className="card"><LineList rows={quote.lines} start={quote.start} detail={detail} setDetail={setDetail}/></section>
    </>}
    {tab==='分批采购'&&quote&&<>
      <p className="hint">实际采购日期按保质条件调整。已有包装净剩余会在安全保存期限内抵扣后续批次。</p>
      {quote.batches.map((batch,index)=><details className="card" key={batch.date} open={index===0?true:undefined}>
        <summary>采购第 {index+1} 批 · {batch.date} · {costText(batch.purchase)}</summary>
        <p className="meta">对应食用日 {Array.from(new Set(batch.lines.flatMap(l=>l.uses.map(u=>addDays(quote.start,u.day))))).sort().join('、')||'已有购买记录'}</p>
        <p className="meta">本批消耗 {costText(batch.consumed)} · 采购 {costText(batch.purchase)} · 已购 {costText(batch.paid)} · 待购 {costText(batch.remaining)}</p>
        <button className="small" onClick={()=>copy(batchPurchaseText(batch.lines,'采购 '+batch.date))}>复制这一批采购</button>
        <LineList rows={batch.lines} start={quote.start} detail={detail} setDetail={setDetail} receipt={actions?.receipt}/>
      </details>)}
    </>}
    {tab==='分批备餐'&&quote&&<>
      <section className="card"><SectionTitle title={'备餐周期 · '+quote.prep.map(b=>b.range.to-b.range.from).join('＋')}/>
        <ul>{quote.notice.map(n=><li key={n}>{n}</li>)}</ul>
      </section>
      {quote.prep.map((batch,i)=>{
        const purchases=quote.batches.filter(b=>b.lines.some(l=>l.uses.some(u=>u.day>=batch.range.from&&u.day<batch.range.to))).map(b=>b.date);
        return <details className="card" key={batch.start} open={i===0?true:undefined}>
          <summary>备餐第 {i+1} 批 · {batch.start} 至 {batch.end}</summary>
          <p>计划备餐 {batch.prepDate} · 实际采购安排 {purchases.join('、')||'库存充足或无新增采购'}</p>
          <p className="meta">串行工作量估算 · 主动 {batch.active} 分钟 · 锅具等待 {batch.waiting} 分钟 · 合计 {batch.active+batch.waiting} 分钟
            {' · '}{batch.tools.join('、')||'无需厨具'} · 至多 {batch.boxes} 个分装容器。</p>
          <button className="small" onClick={()=>copy(prepText(batch,quote.start))}>复制这一批备餐</button>
          <GrainSchedule batch={batch} start={quote.start}/>
          <h3>按净重分装</h3>
          {batch.rows.map(row=><details key={row.id}><summary>{ingredientLabel(row.id)} · 合计 {decimal(row.grams)} 克 · {row.uses.length} 份</summary>
            <ul>{row.uses.map((u,j)=><li key={j}>{useText(quote.start,u)}。{u.method}</li>)}</ul></details>)}
          <h3>按操作日期执行</h3>
          {batch.jobs.map((job,j)=><details key={j}><summary>{addDays(quote.start,job.at)} · {job.name}</summary>
            <p>{addDays(quote.start,job.day)} {job.meal} 食用 · {job.method} · 主动 {job.active} 分钟 · 等待 {job.waiting} 分钟</p>
            <p className="meta">{job.ingredients.map(i=>food(i.id).name+' '+decimal(i.grams)+' 克').join('、')} · {job.tools.join('、')||'无需加热'}</p>
            <ol>{job.steps.map((s,k)=><li key={k}>{s}</li>)}</ol></details>)}
        </details>;
      })}
    </>}
  </>;
}

function Overview({quote:q}:{quote:Logistics}) {
  const avg={...q.consumed,known:q.consumed.known/7};
  const paidEstimate=q.lines.some(row=>row.paidEstimated);
  return <section className="card"><SectionTitle title="本周费用"><span className="meta">采购进度 {q.checked}/{q.toBuy}</span></SectionTitle>
    <progress value={q.checked} max={q.toBuy||1} aria-label="采购完成进度"/>
    <dl className="supply-summary">
    <div><dt>预计采购费用</dt><dd>{costText(q.purchase)}</dd></div>
    <div><dt>已采购金额{paidEstimate?'（含参考估计）':''}</dt><dd>{costText(q.paid)}</dd></div>
    <div><dt>剩余采购费用</dt><dd>{costText(q.remaining)}</dd></div>
    <div><dt>本周食材消耗</dt><dd>{costText(q.consumed)}</dd></div>
    <div><dt>日均消耗费用</dt><dd>{costText(avg)}</dd></div>
    <div><dt>日均采购费用</dt><dd>{costText({...q.purchase,known:q.purchase.known/7})}</dd></div>
    <div><dt>全周预算</dt><dd>{q.budget===null?'未设':yuan(q.budget)}</dd></div>
    </dl>
    {q.budget!==null&&<p className="meta">{q.purchase.missing?'有价格待补充，预算差额尚未确定。':
      (q.budget>=q.purchase.known?'预计剩余预算 ':'预计超过预算 ')+yuan(Math.abs(q.budget-q.purchase.known))}</p>}
  </section>;
}
function LineList({rows,start,detail,setDetail,receipt}:{rows:BuyLine[];start:string;detail:string;setDetail:(d:string)=>void;
  receipt?:(row:BuyLine,value?:Receipt)=>Promise<boolean>}) {
  return <ul className="purchase-list">{rows.map(row=>{
    const k=row.receiptKey||row.id, f=food(row.id);
    return <li key={k}><div className="purchase-row"><label className="check">
      {receipt&&row.buy>0&&<input type="checkbox" checked={row.remaining===0} onChange={e=>{
        const checked=e.target.checked;
        if(checked&&!edibleRate(row.price)){setDetail(k);return;}
        void receipt(row,checked?{gross:row.buy,net:Math.round((row.netConfirmed+row.remaining*edibleRate(row.price))*100)/100,...(row.paidActual!==undefined?{paid:row.paidActual,paidGross:row.paidGross}: {})}:undefined);
      }}/>}<strong>{f.name}</strong></label><b>{sizeText(row)}</b>
      <button className="small" onClick={()=>setDetail(detail===k?'':k)}>{detail===k?'收起':'详情'}</button></div>
      <p className="meta">{f.category} · 净需求 {decimal(row.need)} 克 · 原库存抵扣 {decimal(row.stock)} 克 · 结转或已买抵扣 {decimal(row.carry)} 克</p>
      <p className="meta">{pendingPrice(row)} · 采购小计 {costText(row.cost)}{row.remaining?' · 待买 '+decimal(row.remaining)+' 克':''}
        {row.leftover?' · 预计结余或结转 '+decimal(row.leftover)+' 克':''}</p>
      {detail===k&&<>
        {row.price?.basis==='毛重'&&<p className="meta">{row.price.yieldPercent?`按可食率 ${row.price.yieldPercent}% 将净需求换算为毛重。`:'未填写可食率，只显示净料下限。'}</p>}
        <ul>{row.uses.map((u,i)=><li key={i}>{useText(start,u)}</li>)}</ul>
        {receipt&&row.buy>0&&<ReceiptForm key={JSON.stringify([row.confirmed,row.paid,row.remaining])} row={row} save={receipt}/>}
      </>}
    </li>;
  })}</ul>;
}
function ReceiptForm({row,save}:{row:BuyLine;save:(row:BuyLine,value?:Receipt)=>Promise<boolean>}) {
  const [gross,setGross]=useState(String(row.confirmed||row.buy)),[net,setNet]=useState(String(row.confirmed?row.netConfirmed:''));
  const [paid,setPaid]=useState(row.paidEstimated?'':String(row.paidActual??''));
  const [error,setError]=useState('');
  async function submit() {
    const rate=edibleRate(row.price);
    const edible=net.trim()?+net:Number(gross)*rate;
    if(!(Number.isFinite(+gross)&&+gross>0&&+gross<=1e7&&Number.isFinite(edible)&&edible>0&&edible<=+gross&&
      (!paid.trim()||Number.isFinite(+paid)&&+paid>=0&&+paid<=1e7))) {setError('请填写有效购买重量、净重及实际金额。毛重换算未知时需填写实测净重。');return;}
    if(await save(row,{gross:+gross,net:Math.round(edible*100)/100,...(paid.trim()?{paid:+paid}:{})}))setError('');
  }
  return <><div className="fields">
    <label className="field">实际购买计价重量（克）<input type="number" min="0" step="any" value={gross} onChange={e=>setGross(e.target.value)}/></label>
    <label className="field">实测可食净重（克，可选）<input type="number" min="0" step="any" value={net} onChange={e=>setNet(e.target.value)}/></label>
    <label className="field">实际支付（元，可选）<input type="number" min="0" step=".01" value={paid} onChange={e=>setPaid(e.target.value)}/></label>
  </div><button className="small" onClick={()=>void submit()}>保存实际购买</button>
  {row.confirmed>0&&<button className="small" onClick={()=>void save(row)}>撤销此项已买</button>}
  {error&&<p className="error" role="alert">{error}</p>}</>;
}

function GrainSchedule({batch,start}:{batch:PrepBatch;start:string}) {
  const entries=new Map<string,{at:number;name:string;items:Map<string,number>;servings:number}>();
  for(const job of batch.jobs) {
    const grains=job.ingredients.filter(i=>food(i.id).category==='主食'&&food(i.id).state==='dry');
    if(!grains.length||job.waiting<=0)continue;
    const key=job.at+'|'+job.name;
    const group=entries.get(key)??{at:job.at,name:job.name,items:new Map(),servings:0};
    group.servings++;
    for(const i of grains)group.items.set(i.id,(group.items.get(i.id)??0)+i.grams);
    entries.set(key,group);
  }
  if(!entries.size)return null;
  return <><h3>主食煮制与分装</h3><ul>{[...entries].map(([key,row])=><li key={key}>
    {addDays(start,row.at)} · {row.name} · {[...row.items].map(([id,grams])=>food(id).name+' '+decimal(grams)+' 克干重').join('、')}
    {' · 分 '+row.servings+' 餐份'}
  </li>)}</ul></>;
}
