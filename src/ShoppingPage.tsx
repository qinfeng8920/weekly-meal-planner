import {useState} from 'react';
import {food} from './catalog';
import {addDays} from './batches';
import {amountFor,edibleRate,gramsPerPriceUnit,type PriceInput} from './prices';
import {ingredientLabel,type BuyLine,type Cost,type Logistics,type PrepJob,type PrepBatch,type Receipt,type SupplyState} from './logistics';
import type {Plan} from './planner';
import {dateKey} from './profile';
import type {StockInfo,TaskAction} from './execution';
import {poolGroup} from './ingredient-pool';
import type {Purchase} from './shopping';
import {dateLabel,decimal,Empty,SectionTitle} from './ui';
import {PriceEditor,StorageFields,yuan} from './SupplyEditors';

const tabs=['采购清单','备餐清单'] as const;
export type SupplyTab=typeof tabs[number];
export type SupplyActions={
  savePrice:(id:string,value?:PriceInput)=>Promise<boolean>;resetPrices:()=>void;
  exportPrices:()=>void;importPrices:(file:File)=>void;stock:(id:string,n:number,info:StockInfo)=>Promise<boolean>;
  task:(job:PrepJob,action:TaskAction,checked:boolean)=>Promise<boolean>;
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
const useText=(start:string,u:BuyLine['uses'][number])=>
  `${dateLabel(addDays(start,u.day))} ${u.meal} · ${u.dish} · ${u.recipeId?ingredientLabel(u.recipeId)+' ':''}${decimal(u.recipeGrams??u.grams)} 克`+
    (u.conversionMissing?' · 生熟换算待补充':u.recipeId&&u.grams!==u.recipeGrams?' · 约 '+decimal(u.grams)+' 克采购净料':'');

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
export function ShoppingPage({plan,quote,state,actions,copy,download,initialTab='采购清单',onSettings,reprice,repriced=false}:{
  plan:Plan|null;quote?:Logistics;state?:SupplyState;actions?:SupplyActions;
  copy:(text:string,share?:boolean)=>void;download:(text:string)=>void;initialTab?:SupplyTab;onSettings?:()=>void;reprice?:()=>void;repriced?:boolean;
}) {
  const [tab,setTab]=useState<SupplyTab>(initialTab),[detail,setDetail]=useState('');
  const today=dateKey();
  const prepIndex=quote?.prep.findIndex(b=>b.end>=today)??-1;
  const shoppingIndex=quote?.batches.findIndex(b=>b.lines.some(l=>l.remaining>0))??-1;
  const editPrice=actions?.savePrice;
  return <>
    <div className="page-title"><h1>采购</h1>
      {onSettings&&<button className="flat" onClick={onSettings}>生成设置</button>}
      {reprice&&<button onClick={reprice}>{repriced?'返回历史价格快照':'按最新价格重新估算'}</button>}</div>
    {quote&&<Overview quote={quote}/>}
    {quote?.conflicts?.length? <section className="hint error" role="alert"><strong>这份采购计划有待解决的日期或换算问题</strong>
      <ul>{quote.conflicts.slice(0,5).map(t=><li key={t}>{t}</li>)}</ul>
      {quote.conflicts.length>5&&<p>另有 {quote.conflicts.length-5} 项待核对</p>}
      <p>请调整购物日期、食材或已确认库存。费用为当前可估算部分。</p>
    </section>:null}
    <div className="segmented" aria-label="采购与备餐视图">{tabs.map(t=><button key={t}
      aria-pressed={tab===t} onClick={()=>{setTab(t);setDetail('');}}>{t}</button>)}</div>
    {!quote&&(!plan?<Empty title="尚无食谱"><p>生成后可查看购物日和备餐清单。</p></Empty>:
      <section className="card"><SectionTitle title="旧版快照"/>
        <button className="small" onClick={()=>copy(purchaseText(plan.purchases))}>复制历史清单</button>
        {tab==='备餐清单'?plan.prep.days.map(d=><p key={d.date}>{d.date} · {d.task}</p>):
          <ul>{plan.purchases.map(p=><li key={p.id}>{p.name} · {decimal(p.buy)} 克 · {p.cost===null?'价格待补充':yuan(p.cost)}</li>)}</ul>}
      </section>)}
    {tab==='采购清单'&&quote&&<>
      <div className="actions list-actions"><button onClick={()=>copy(batchPurchaseText(quote.lines,'全周清单'))}>复制全周</button>
        <details><summary>更多</summary><div className="actions">
          <button onClick={()=>copy(batchPurchaseText(quote.lines,'全周清单'),true)}>分享清单</button>
          <button onClick={()=>download(batchPurchaseText(quote.lines,'全周清单'))}>下载清单</button></div></details></div>
      {quote.batches.map((batch,index)=>{
        const lines=batch.lines.filter(r=>r.buy>0||r.estimate===null);
        return <details className="card" key={batch.date} open={index===Math.max(shoppingIndex,0)?true:undefined}>
          <summary>采购第 {index+1} 批 · {dateLabel(batch.date)} · <span className="unit">{costText(batch.purchase)}</span></summary>
          {lines.length? <><LineList rows={lines} start={quote.start} detail={detail} setDetail={setDetail} receipt={actions?.receipt} editPrice={editPrice}/>
            <button className="small" onClick={()=>copy(batchPurchaseText(lines,'采购 '+batch.date))}>复制这一批采购</button></>:<p className="meta">无需采购</p>}
        </details>;
      })}
      <details className="card"><summary>全周食材汇总</summary>
        <GroupedLines rows={quote.lines} start={quote.start} detail={detail} setDetail={setDetail} editPrice={editPrice}/>
      </details>
    {quote?.storageWarnings?.length?<details className="card"><summary>保存条件待核对 · {quote.storageWarnings.length} 项</summary>
      <p className="meta">这些食材按你的购物日列出。请按包装与实际保存条件确认供货或使用安全库存，再开始备餐。</p>
      <ul>{quote.storageWarnings.map(warning=><li key={warning}>{warning}</li>)}</ul>
    </details>:null}
      {quote.actualBatches?.length? <details className="card"><summary>另有实际购买记录 · {quote.actualBatches.reduce((n,b)=>n+b.lines.length,0)} 项</summary>
        <p className="meta">包含计划日期以外的实付和旧商品，单独记账。</p>
        {quote.actualBatches.map(batch=><details key={batch.date}><summary>{dateLabel(batch.date)} · {costText(batch.paid)}</summary>
          <LineList rows={batch.lines} start={quote.start} detail={detail} setDetail={setDetail} receipt={actions?.receipt}/></details>)}
      </details>:null}
    </>}
    {tab==='备餐清单'&&quote&&<>
      <section className="card"><SectionTitle title={'备餐周期 · '+quote.prep.map(b=>b.range.to-b.range.from).join('＋')}/>
        {quote.notice.filter(n=>n.startsWith('没有')||n.startsWith('生熟分开')||n.startsWith('熟米饭')).map(n=><p className="meta" key={n}>{n}</p>)}
        <details><summary>储存、解冻与复热</summary><ul>{quote.notice.filter(n=>!n.startsWith('没有')&&!n.startsWith('生熟分开')&&!n.startsWith('熟米饭')).map(n=><li key={n}>{n}</li>)}</ul></details>
      </section>
      {quote.prep.map((batch,i)=>{
        const allocated=quote.batches.flatMap(b=>b.lines).filter(l=>l.uses.length?l.uses[0].day>=batch.range.from&&l.uses[0].day<batch.range.to:i===0);
        const purchase=allocated.reduce((total,row)=>sumCost(total,row.cost),emptyCost());
        const consumed=batch.rows.reduce((total,row)=>{
          const price=quote.lines.find(l=>l.id===row.id)?.price, rate=edibleRate(price);
          const value=price&&rate&&!row.uses.some(u=>u.conversionMissing)?amountFor(row.grams/rate,price):null;
          return sumCost(total,{known:value??0,missing:value===null?1:0,items:1});
        },emptyCost());
        return <details className="card prep-batch" key={batch.start} open={i===Math.max(prepIndex,0)?true:undefined}>
          <summary>备餐第 {i+1} 批 · {dateLabel(batch.start)} 至 {dateLabel(batch.end)}</summary>
          <p>准备 {dateLabel(batch.prepDate)} · 食材消耗 {costText(consumed)} · 分配采购 {costText(purchase)}</p>
          <p className="meta">主动 <span className="unit">{batch.active} 分钟</span> · 合计 <span className="unit">{batch.active+batch.waiting} 分钟</span>
            {' · '}{batch.tools.join('、')||'无需加热厨具'} · 备 {batch.boxes} 个分装容器</p>
          <button className="small" onClick={()=>copy(prepText(batch,quote.start))}>复制这一批备餐</button>
          <details><summary>食材取用、补购与分装</summary>
            {batch.rows.map(row=>{
              const totals=row.uses.reduce((a,u)=>({stock:a.stock+(u.sourcing?.home??0)+(u.sourcing?.carry??0),forecast:a.forecast+(u.sourcing?.forecast??0),taken:a.taken+(u.sourcing?.taken??0)}),{stock:0,forecast:0,taken:0});
              return <details key={row.id}><summary>{food(row.id).name} · <span className="unit">{decimal(row.grams)} 克</span>净料 · {row.uses.length} 份</summary>
                <p className="meta">按采购净料折算 · 已有 {decimal(totals.stock)} 克 · 计划供应 {decimal(totals.forecast)} 克 · 已取 {decimal(totals.taken)} 克</p>
                <ul>{row.uses.map((u,j)=><li key={j}>{useText(quote.start,u)} · {u.method}</li>)}</ul></details>;
            })}
          </details>
          <h3>制作步骤</h3>
          {batch.jobs.map((job,j)=>{
            const task=job.key?state?.execution?.tasks?.[job.key]:undefined;
            const taken=task?.taken&&job.ingredients.every(i=>task.taken!.allocation.filter(a=>a.id===i.id).reduce((n,a)=>n+(a.recipeGrams??a.grams),0)>=i.grams-.005);
            const label=[job.name,job.ingredients.map(i=>ingredientLabel(i.id)+' '+decimal(i.grams)+' 克').join('、'),
              '制备 '+addDays(quote.start,job.at),'食用 '+addDays(quote.start,job.day)+' '+job.meal,job.method,
              ...(job.reheat?['当天复热约 '+job.reheat+' 分钟至中心 74°C']:[])].join(' · ');
            return <details className="prep-task" key={job.key??j}><summary>{dateLabel(addDays(quote.start,job.at))} · {job.name}{taken?' · 已取用':task?.made?' · 已制作':task?.packed?' · 已分装':''}</summary>
              <p>{label}</p><p className="meta">{job.tools.join('、')||'无需加热'}</p>
              {actions&&job.key&&<div className="actions">{([['分装',task?.packed],['制作',task?.made],['取用',taken]] as const).map(([action,flag])=>
                <label className="check task-check" key={action}><input type="checkbox" checked={Boolean(flag)} onChange={e=>void actions.task(job,action,e.target.checked)}/>已{action}</label>)}</div>}
              <ol>{job.steps.map((s,k)=><li key={k}>{s}</li>)}</ol>
              <button className="small" onClick={()=>copy(label)}>复制分装标签</button>
            </details>;
          })}
        </details>;
      })}
    </>}
  </>;
}

function Overview({quote:q}:{quote:Logistics}) {
  const paidEstimate=[...q.batches,...q.actualBatches??[]].some(batch=>batch.lines.some(row=>row.paidEstimated));
  const avg={...q.consumed,known:q.consumed.known/7};
  return <section className="card"><SectionTitle title="本周采购"><strong className="unit">{costText(q.purchase)}</strong></SectionTitle>
    <p className="meta">{q.lines.filter(r=>r.uses.length).length} 种食材 · 预定采购 {q.batches.length} 次 · 完成 {q.checked}/{q.toBuy} 项</p>
    <progress value={q.checked} max={q.toBuy||1} aria-label="采购完成进度"/>
    <details><summary>费用明细</summary><dl className="supply-summary">
      <div><dt>实际购买{paidEstimate?'（部分参考估计）':''}</dt><dd>{costText(q.paid)}</dd></div>
      <div><dt>待采购参考</dt><dd>{costText(q.remaining)}</dd></div>
      <div><dt>食材消耗参考</dt><dd>{costText(q.consumed)}</dd></div>
      <div><dt>日均消耗</dt><dd>{costText(avg)}</dd></div>
      <div><dt>全周预算</dt><dd>{q.budget===null?'未设':yuan(q.budget)}</dd></div>
    </dl>{q.budget!==null&&<p className="meta">{q.purchase.missing?'价格未齐，预算差额待定。':
      (q.budget>=q.purchase.known?'预计剩余预算 ':'预计超过预算 ')+yuan(Math.abs(q.budget-q.purchase.known))}</p>}</details>
  </section>;
}
const emptyCost=():Cost=>({known:0,items:0,missing:0});
const sumCost=(a:Cost,b:Cost):Cost=>({known:Math.round((a.known+b.known)*100)/100,items:a.items+b.items,missing:a.missing+b.missing});
type LineProps={rows:BuyLine[];start:string;detail:string;setDetail:(d:string)=>void;
  receipt?:(row:BuyLine,value?:Receipt)=>Promise<boolean>;editPrice?:SupplyActions['savePrice']};
function GroupedLines({rows,...props}:LineProps) {
  const categories=[...new Set(rows.map(r=>food(r.id).category))];
  return <>{categories.map((category,i)=><details key={category} open={i===0?true:undefined}>
    <summary>{category} · {rows.filter(r=>food(r.id).category===category).length} 种</summary>
    <LineList {...props} rows={rows.filter(r=>food(r.id).category===category)}/>
  </details>)}</>;
}
function LineList({rows,start,detail,setDetail,receipt,editPrice}:LineProps) {
  return <ul className="purchase-list">{rows.map(row=>{
    const k=row.receiptKey||row.id, f=food(row.id), group=poolGroup(row.id);
    return <li key={k}><div className="purchase-row"><label className="check">
      {receipt&&row.buy>0&&<input type="checkbox" checked={row.remaining===0} onChange={e=>{
        const checked=e.target.checked;
        if(checked&&!edibleRate(row.price)){setDetail(k);return;}
        void receipt(row,checked?{gross:row.buy,net:Math.round((row.netConfirmed+row.remaining*edibleRate(row.price))*100)/100,...(row.paidActual!==undefined?{paid:row.paidActual,paidGross:row.paidGross}: {}),...(row.receiptDate?{date:row.receiptDate}:{}),...(row.receiptStorage?{storage:row.receiptStorage}:{})}:undefined);
      }}/>}<strong>{f.name}</strong></label><b className="unit">{row.estimate===null&&!row.buy?'待补全':sizeText(row)}</b>
      <button className="small" onClick={()=>setDetail(detail===k?'':k)}>{detail===k?'收起':'详情'}</button></div>
      <p className="meta">{f.category}{group!=='基础食材'?' · 核心食材':''} · {row.uses.length} 次 · 净需求 {decimal(row.need)} 克 · 原库存抵扣 {decimal(row.stock)} 克 · 结转或已买抵扣 {decimal(row.carry)} 克</p>
      <p className="meta purchase-price">{editPrice?<button className="small flat" onClick={()=>setDetail(detail===k?'':k)} aria-label={'编辑'+f.name+'单价'}>{pendingPrice(row)}</button>:pendingPrice(row)} <b className="unit">{costText(row.cost)}</b>{row.remaining?' · 待买 '+decimal(row.remaining)+' 克':''}
        {row.leftover?' · 预计结余或结转 '+decimal(row.leftover)+' 克':''}</p>
      {detail===k&&<>
        {row.price?.basis==='毛重'&&<p className="meta">{row.price.yieldPercent?`按可食率 ${row.price.yieldPercent}% 将净需求换算为毛重。`:'未填写可食率，只显示净料下限。'}</p>}
        {editPrice&&<details><summary>修改此食材单价</summary><PriceEditor key={JSON.stringify(row.price)} id={row.id} current={row.price} save={editPrice}/></details>}
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
  const [purchaseDate,setPurchaseDate]=useState(row.receiptDate??'');
  const [storage,setStorage]=useState<StockInfo['storage']>(row.receiptStorage?.storage??'冷藏'),[expires,setExpires]=useState(row.receiptStorage?.expires??'');
  async function submit() {
    const rate=edibleRate(row.price);
    const edible=net.trim()?+net:Number(gross)*rate;
    if(!(Number.isFinite(+gross)&&+gross>0&&+gross<=1e7&&Number.isFinite(edible)&&edible>0&&edible<=+gross&&(!purchaseDate||purchaseDate<=dateKey())&&
      (!paid.trim()||Number.isFinite(+paid)&&+paid>=0&&+paid<=1e7))) {setError('请填写有效购买重量、净重及实际金额。毛重换算未知时需填写实测净重。');return;}
    if(await save(row,{gross:+gross,net:Math.round(edible*100)/100,...(paid.trim()?{paid:+paid}:{}),...(purchaseDate?{date:purchaseDate}:{}),...(expires?{storage:{storage,expires}}:{})}))setError('');
  }
  return <><div className="fields">
    <label className="field">实际购买计价重量（克）<input type="number" min="0" step="any" value={gross} onChange={e=>setGross(e.target.value)}/></label>
    <label className="field">实测可食净重（克，可选）<input type="number" min="0" step="any" value={net} onChange={e=>setNet(e.target.value)}/></label>
    <label className="field">实际支付（元，可选）<input type="number" min="0" step=".01" value={paid} onChange={e=>setPaid(e.target.value)}/></label>
    <label className="field">实际购买日期（选填）<input type="date" value={purchaseDate} max={dateKey()} onChange={e=>setPurchaseDate(e.target.value)}/></label>
    <StorageFields storage={storage} expires={expires} onStorage={setStorage} onExpires={setExpires}/>
  </div><button className="small" onClick={()=>void submit()}>保存实际购买</button>
  {row.confirmed>0&&<button className="small" onClick={()=>void save(row)}>撤销此项已买</button>}
  {error&&<p className="error" role="alert">{error}</p>}</>;
}
