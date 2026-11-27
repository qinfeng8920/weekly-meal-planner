import {procurementSummary} from './procurement-score';
import {useState} from 'react';
import {food} from './catalog';
import {addDays} from './batches';
import {gramsPerPriceUnit,type PriceInput} from './prices';
import {ingredientLabel,prepSchedule,type BuyLine,type Cost,type Logistics,type PrepJob,type PrepBatch,type Receipt,type SupplyState} from './logistics';
import type {Plan} from './planner';
import {dateKey} from './profile';
import type {TaskAction} from './execution';
import {purchaseCategories,purchaseCategory} from './purchase-category';
import {needsPortion,prepWork,recipePrepSteps} from './prep-work';
import {PurchaseForm,WithdrawalControl} from './InventoryInputs';
import type {Purchase} from './shopping';
import {dateLabel,decimal,Empty,SectionTitle} from './ui';
import {PriceEditor,yuan} from './SupplyEditors';

const tabs=['采购清单','备餐清单'] as const;
export type SupplyTab=typeof tabs[number];
export type SupplyActions={
  savePrice:(id:string,value?:PriceInput)=>Promise<boolean>;resetPrices:()=>void;
  exportPrices:()=>void;importPrices:(file:File)=>void;
  task:(jobs:PrepJob[],action:TaskAction,checked:boolean)=>Promise<boolean>;
  shared:(key:string,checked:boolean)=>Promise<boolean>;
  receipt:(source:string,value?:Receipt)=>Promise<boolean>;
};
export const costText=(cost:Cost)=>cost.missing?(cost.items===cost.missing?'价格待补充':yuan(cost.known)+' + 待补充')+
  '（'+(cost.items-cost.missing)+'/'+cost.items+' 项已知）':yuan(cost.known);
const pendingPrice=(r:BuyLine)=>r.price?`${yuan(r.price.amount)}/${r.price.unit} · ${r.price.basis} · ${r.price.kind}`:'待补充单价';
function purchaseStatus(row:BuyLine) {
  if (row.confirmed>0) return row.remaining||row.estimate===null?'已买部分':'已购';
  if (row.remaining>0) return '待买';
  return row.estimate===null?'待核对':'无需补购';
}
function purchaseProgress(rows:BuyLine[]) {
  let done=0,total=0;
  for (const row of rows) {
    const status=purchaseStatus(row);
    if (status==='无需补购') continue;
    total++;
    if (status==='已购') done++;
  }
  return {done,total};
}
function PurchaseProgress({progress:{done,total}}:{progress:ReturnType<typeof purchaseProgress>}) {
  const complete=total>0&&done===total;
  return <span className={'purchase-progress'+(complete?' complete':'')}>
    {complete&&<span aria-hidden="true">✓ </span>}{total?`已购 ${done}/${total} 项`:'无需补购'}
  </span>;
}
const sizeText=(row:BuyLine)=>{
  const amount=row.remaining||row.confirmed||row.buy;
  const price=row.price;
  const grams=price&&gramsPerPriceUnit(price);
  const countUnit=price&&['个','盒','袋','瓶'].includes(price.unit)?price.unit:undefined;
  const pack=price?.pack??(countUnit?grams:undefined);
  const suffix=pack?(countUnit&&pack===grams?`（${decimal(amount/pack)} ${countUnit}）`:
    row.id==='oats'?`（${decimal(amount/pack)} 袋）`:`（规格 ${decimal(pack)} 克）`):'';
  if(grams&&(price?.unit==='升'||price?.unit==='毫升')&&amount>0) {
    const ml=price.unit==='升'?amount*1000/grams:amount/grams;
    return (ml>=1000?decimal(ml/1000)+' 升':decimal(ml)+' 毫升')+suffix;
  }
  return decimal(amount)+' 克'+suffix;
};
const useText=(start:string,u:BuyLine['uses'][number])=>
  `${dateLabel(addDays(start,u.day))} ${u.meal} · ${u.dish} · ${u.recipeId?ingredientLabel(u.recipeId)+' ':''}${decimal(u.recipeGrams??u.grams)} 克`+
    (u.conversionMissing?' · 生熟换算待补充':u.recipeId&&u.grams!==u.recipeGrams?' · 约 '+decimal(u.grams)+' 克采购净料':'');

export function purchaseText(purchases:Purchase[]) {
  return ['天天减 · 旧版采购清单',...purchases.map(p=>`${p.name} ${decimal(p.buy)} 克`)].join('\n');
}
export function batchPurchaseText(rows:BuyLine[],title:string) {
  return ['天天减 · '+title,...rows.filter(r=>purchaseStatus(r)!=='无需补购').map(r=>
    `${r.buy&&!r.remaining?'✓':'□'} ${food(r.id).name} · 采购 ${sizeText(r)} · ${pendingPrice(r)} · 小计 ${costText(r.cost)}`)].join('\n');
}
function prepText(batch:PrepBatch,start:string,work:ReturnType<typeof prepWork>) {
  const main=batch.rows.filter(row=>purchaseCategory(row.id)==='主要食材');
  const seasonings=batch.rows.filter(row=>purchaseCategory(row.id)!=='主要食材');
  return ['天天减 · 分批备餐 '+batch.start+' 至 '+batch.end,'准备日 '+batch.prepDate,'食材取用与分装',
    ...main.flatMap(row=>[
      ingredientLabel(row.id)+' '+decimal(row.grams)+' 克 · '+row.uses.filter(needsPortion).length+' 份需分装',
      ...row.uses.map(u=>useText(start,u)+' · '+u.method),
    ]),'调味料用量',...seasonings.map(row=>food(row.id).name+' '+decimal(row.grams)+' 克'),
    '集中制作与称量',...work.map(row=>food(row.id).name+' '+decimal(row.raw)+' 克 · '+row.portions.length+' 份 · '+row.method+' '+row.steps.join(' ')),
    '制作步骤',...batch.jobs.map(j=>addDays(start,j.at)+' '+j.name+' · '+j.method+' · '+recipePrepSteps(j,work).join(' '))].join('\n');
}
export function ShoppingPage({plan,quote,state,actions,copy,download,initialTab='采购清单',onSettings,reprice,repriced=false}:{
  plan:Plan|null;quote?:Logistics;state?:SupplyState;actions?:SupplyActions;
  copy:(text:string,share?:boolean)=>void;download:(text:string)=>void;initialTab?:SupplyTab;onSettings?:()=>void;reprice?:()=>void;repriced?:boolean;
}) {
  const [purchase,setPurchase]=useState<{key:string;source:string}|null>(null);
  const [tab,setTab]=useState<SupplyTab>(initialTab),[detail,setDetail]=useState('');
  const today=dateKey();
  const prepIndex=quote?.prep.findIndex(b=>b.end>=today&&b.jobs.some(j=>j.key&&!state?.execution?.tasks?.[j.key]?.taken))??-1;
  const shoppingIndex=quote?.batches.findIndex(b=>b.lines.some(l=>l.remaining>0))??-1;
  const stored=quote?.lines.filter(row=>purchaseStatus(row)==='无需补购'&&row.stock+row.carry>0)??[];
  const changed=plan?new Map(plan.days.flatMap(day=>day.meals.flatMap(meal=>meal.dishes.flatMap(dish=>
    dish.recipe.replacements??[]))).map(r=>[r.from+'|'+r.to,r])):new Map();
  const weeklyRows=quote?.batches.flatMap(batch=>batch.lines)??[];
  const weeklyProgress=purchaseProgress(weeklyRows);
  const editPrice=actions?.savePrice;
  return <>
    <div className="page-title"><h1>采购</h1>
      {onSettings&&<button className="flat" onClick={onSettings}>生成设置</button>}
      {reprice&&<button onClick={reprice}>{repriced?'返回历史价格快照':'按最新价格重新估算'}</button>}</div>
    {quote&&<Overview quote={quote} progress={weeklyProgress}/>}
    {quote?.conflicts?.length? <section className="hint error" role="alert"><strong>这份采购计划有待解决的日期或换算问题</strong>
      <ul>{quote.conflicts.slice(0,5).map(t=><li key={t}>{t}</li>)}</ul>
      {quote.conflicts.length>5&&<p>另有 {quote.conflicts.length-5} 项待核对</p>}
      <p>请调整购物日期、食材或已确认库存。费用为当前可估算部分。</p>
    </section>:null}
    <div className="segmented" aria-label="采购与备餐视图">{tabs.map(t=><button key={t}
      aria-pressed={tab===t} onClick={()=>{setTab(t);setDetail('');setPurchase(null);}}>{t}</button>)}</div>
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
        const lines=batch.lines.filter(r=>purchaseStatus(r)!=='无需补购');
        return <details className="card batch-fold" key={batch.date} open={index===Math.max(shoppingIndex,0)?true:undefined}>
          <summary><span>采购第 {index+1} 批 · {dateLabel(batch.date)}<PurchaseProgress progress={purchaseProgress(lines)}/></span><span className="unit">{costText(batch.purchase)}</span></summary>
          {lines.length? <><GroupedLines rows={lines} start={quote.start} detail={detail} setDetail={setDetail} receipt={actions?.receipt} editPrice={editPrice} purchase={purchase} setPurchase={setPurchase}/>
            <button className="small" onClick={()=>copy(batchPurchaseText(lines,'采购 '+batch.date))}>复制这一批采购</button></>:<p className="meta">无需采购</p>}
        </details>;
      })}
      <details className="card"><summary><span>全周食材汇总<PurchaseProgress progress={weeklyProgress}/></span></summary>
        <GroupedLines rows={quote.lines.filter(row=>purchaseStatus(row)!=='无需补购')} progressRows={weeklyRows} start={quote.start} detail={detail} setDetail={setDetail} editPrice={editPrice}/>
      </details>
      {!!stored.length&&<details className="card"><summary>已有库存抵扣 · {stored.length} 种</summary>
        <ul className="ledger-list">{stored.map(row=><li key={row.id}><span>{food(row.id).name}</span><span className="unit">{decimal(row.stock+row.carry)} 克</span></li>)}</ul>
      </details>}
      {!!changed.size&&<details className="card"><summary>本周食材替换 · {changed.size} 种</summary>
        <ul className="ledger-list">{[...changed.values()].map(r=>{
          const row=quote.lines.find(line=>line.id===r.to);
          return <li key={r.from+'|'+r.to}><span>{food(r.from).name} → {food(r.to).name}</span><span>{row?.remaining?'需补购':row?.confirmed?'已登记购买':'无需补购'}</span></li>;
        })}</ul>
      </details>}
      {quote.actualBatches?.length? <details className="card"><summary>另有实际购买记录 · {quote.actualBatches.reduce((n,b)=>n+b.lines.length,0)} 项</summary>
        <p className="meta">本周计划外买入及未并入采购批次的实付记录。</p>
        {quote.actualBatches.map(batch=><details key={batch.date}><summary>{dateLabel(batch.date)} · {costText(batch.paid)}</summary>
          <LineList rows={batch.lines} start={quote.start} detail={detail} setDetail={setDetail} receipt={actions?.receipt} purchase={purchase} setPurchase={setPurchase}/></details>)}
      </details>:null}
    </>}
    {tab==='备餐清单'&&quote&&<>
      <h2 className="section-label">{'备餐周期 · '+quote.prep.map(b=>b.range.to-b.range.from).join('＋')}</h2>
      {quote.prep.map((batch,i)=>{
        const selected=i===Math.max(prepIndex,0);
        const main=batch.rows.filter(r=>purchaseCategory(r.id)==='主要食材');
        const seasonings=batch.rows.filter(r=>purchaseCategory(r.id)!=='主要食材');
        const tasks=state?.execution?.tasks;
        const schedule=prepSchedule(batch,quote.start);
        const work=state?prepWork(batch,state.products,new Map(quote.inventory.map(row=>[row.id,row.usable??row.home])),state.execution):[];
        const portions=main.filter(row=>row.uses.some(needsPortion));
        const done=batch.jobs.filter(j=>j.key&&tasks?.[j.key]?.taken).length;
        return <details className="card batch-fold prep-batch" key={batch.start} open={selected?true:undefined}>
          <summary><span>备餐第 {i+1} 批 · {dateLabel(batch.start)} 至 {dateLabel(batch.end)}</span><span className="meta unit">{done}/{batch.jobs.length} 已取用</span></summary>
          <div className="fold-body">
            <p className="meta">准备 {dateLabel(batch.prepDate)} · {batch.tools.join('、')||'无需加热厨具'} · {batch.boxes} 个分装容器</p>
            {schedule.concentrated.map(s=><p className="meta" key={s.date}>{dateLabel(s.date)} 集中备餐估算 · 主动 <span className="unit">{s.active} 分钟</span> · 等待 <span className="unit">{s.waiting} 分钟</span></p>)}
            {!schedule.concentrated.length&&<p className="meta">这批按食用日现做。</p>}
            <div className="actions"><button className="small" onClick={()=>copy(prepText(batch,quote.start,work))}>复制这一批备餐</button></div>
            {actions&&done<batch.jobs.length&&<WithdrawalControl label="确认本批实际取用" jobs={batch.jobs} tasks={tasks} execute={jobs=>actions.task(jobs,'取用',true)}/>}
            <details className="group-fold" open={selected?true:undefined}><summary>食材取用<span className="meta unit">{main.length} 种</span></summary>
              {main.length?main.map(row=>{
                const portions=row.uses.filter(needsPortion);
                const packed=portions.filter(u=>u.jobKey&&(tasks?.[u.jobKey]?.packed||tasks?.[u.jobKey]?.taken)).length;
                const used=row.uses.filter(u=>u.jobKey&&tasks?.[u.jobKey]?.taken).length;
                const totals=row.uses.reduce((a,u)=>({stock:a.stock+(u.sourcing?.home??0)+(u.sourcing?.carry??0),forecast:a.forecast+(u.sourcing?.forecast??0)}),{stock:0,forecast:0});
                return <details className="item-fold" key={row.id}>
                  <summary><span>{food(row.id).name}<small>{portions.length?'分装 '+packed+'/'+portions.length+' 份':'当天用'} · 已取 {used}/{row.uses.length}</small></span><span className="unit">{decimal(row.grams)} 克</span></summary>
                  <div className="fold-body"><p className="meta">采购净料折算 · 账面可领 {decimal(totals.stock)} 克 · 计划供应 {decimal(totals.forecast)} 克</p>
                    <ul className="share-details">{row.uses.map((u,j)=><li key={j}>{useText(quote.start,u)} · {u.method}</li>)}</ul></div>
                </details>;
              }):<p className="meta">本批无主要食材。</p>}
            </details>
            <details className="group-fold"><summary>调味料用量<span className="meta unit">{seasonings.length} 种</span></summary>
              {seasonings.length?<ul className="ledger-list">{seasonings.map(row=><li key={row.id}><span>{food(row.id).name}</span><span className="unit">{decimal(row.grams)} 克</span></li>)}</ul>:<p className="meta">本批无调味料。</p>}
            </details>
            <details className="group-fold prep-steps"><summary>制作步骤<span className="meta unit">{batch.jobs.length} 项</span></summary>
              {work.filter(row=>row.kind==='煮熟').map(row=><div className="hint" key={row.key}>
                <strong>{row.blend?.length===2?'小米糙米饭':food(row.id).name}集中煮熟 · {dateLabel(addDays(quote.start,row.at))}</strong>
                <p>净料 {decimal(row.raw)} 克 · {row.cooked===undefined?'出锅后称熟重':`预计熟重 ${decimal(row.cooked)} 克`} · {row.portions.length} 份 · {row.method}</p>
                {!!row.blend?.length&&<p className="meta">{row.blend.map(i=>food(i.id).name+' '+decimal(i.grams)+' 克干重').join('、')}。按各份原料比例分装熟饭。</p>}
                <ol>{row.steps.map(step=><li key={step}>{step}</li>)}</ol>
                <ul className="ledger-list">{row.portions.map(({job,grams})=><li key={job.key}><span>{dateLabel(addDays(quote.start,job.day))} {job.meal} · {job.name}</span><span className="unit">{decimal(grams)} 克{row.cooked===undefined?'干重':'熟重'}</span></li>)}</ul>
                {actions&&<label className="check"><input type="checkbox" checked={!!state?.execution?.shared?.[row.key]}
                  onChange={e=>void actions.shared(row.key,e.target.checked)}/>集中制作已完成</label>}
              </div>)}
              {schedule.later.map(s=><div className="ledger-line meta" key={s.date}><span>{dateLabel(s.date)} 现做或复热</span><span className="unit">约 {s.total} 分钟</span></div>)}
              {batch.jobs.map((job,j)=>{
                const task=job.key?tasks?.[job.key]:undefined;
                const label=[job.name,...job.ingredients.filter(i=>purchaseCategory(i.id)==='主要食材').map(i=>ingredientLabel(i.id)+' '+decimal(i.grams)+' 克'),
                  '制备 '+addDays(quote.start,job.at),'食用 '+addDays(quote.start,job.day)+' '+job.meal,job.method].join(' · ');
                return <details className="item-fold prep-task" key={job.key??j}>
                  <summary><span>{job.name}<small>{dateLabel(addDays(quote.start,job.at))} · {job.meal}</small></span>
                    <span className="meta unit">{task?.eaten?'已用餐':task?.made?'已制作':task?.taken?'已取用':task?.packed?'已分装':''}</span></summary>
                  <div className="fold-body">
                    <p className="meta">{job.tools.join('、')||'无需加热'} · {job.method}</p>
                    {actions&&job.key&&<><div className="actions">{([['分装',task?.packed],['制作',task?.made]] as const).map(([action,flag])=>
                      <label className="check task-check" key={action}><input type="checkbox" checked={Boolean(flag)} onChange={e=>void actions.task([job],action,e.target.checked)}/>已{action}</label>)}</div>
                      {task?.taken?<button className="flat" onClick={()=>void actions.task([job],'取用',false)}>撤销取用</button>:
                        <WithdrawalControl label="确认实际取用" jobs={[job]} tasks={tasks} execute={jobs=>actions.task(jobs,'取用',true)}/>}</>}
                    <ol>{recipePrepSteps(job,work).map((step,k)=><li key={k}>{step}</li>)}</ol>
                    <button className="small" onClick={()=>copy(label)}>复制分装标签</button>
                  </div></details>;
              })}
            </details>
            <details className="group-fold"><summary>分装<span className="meta unit">{portions.length} 种</span></summary>
              {work.filter(row=>row.kind==='称量分装').map(row=><div className="hint" key={row.key}>
                <strong>{food(row.id).name}统一称量 · {dateLabel(addDays(quote.start,row.at))}</strong>
                <p>{decimal(row.raw)} 克生净重 · {row.portions.length} 份。生熟分开，各份按菜谱调味。</p>
                <ul className="ledger-list">{row.portions.map(({job,grams})=><li key={job.key}><span>{dateLabel(addDays(quote.start,job.day))} {job.meal} · {job.name}</span><span className="unit">{decimal(grams)} 克</span></li>)}</ul>
                {actions&&<label className="check"><input type="checkbox" checked={!!state?.execution?.shared?.[row.key]}
                  onChange={e=>void actions.shared(row.key,e.target.checked)}/>集中称量已完成</label>}
              </div>)}
              {portions.map(row=><div className="ledger-line" key={row.id}><span>{food(row.id).name}</span>
                <span className="unit">{row.uses.filter(needsPortion).length} 份</span></div>)}
              {!portions.length&&!work.some(row=>row.kind==='称量分装')&&<p className="meta">本批按食用日称量。</p>}
            </details>
            <details className="group-fold"><summary>储存与复热</summary>
              <ul className="share-details">{quote.notice.map(n=><li key={n}>{n}</li>)}</ul>
              {quote.storageWarnings?.length?<p className="hint">购物日与食用日间隔较长时，按厨具和包装说明妥善保存，或改用安全可用的食材。</p>:null}
            </details>
          </div>
        </details>;
      })}
    </>}
  </>;
}

function Overview({quote:q,progress:{done,total}}:{quote:Logistics;progress:ReturnType<typeof purchaseProgress>}) {
  const paidEstimate=[...q.batches,...q.actualBatches??[]].some(batch=>batch.lines.some(row=>row.paidEstimated));
  const avg={...q.consumed,known:q.consumed.known/7};
  const summary=procurementSummary(q);
  return <section className="card"><SectionTitle title="本周采购"><strong className="unit">{costText(q.purchase)}</strong></SectionTitle>
    <p className="meta">使用 {summary.used} 种 · 需买 {summary.needed} 种 · 预定采购 {q.batches.length} 次 · {total?`已购 ${done}/${total} 项`:'无需补购'}</p>
    {total>0&&<progress value={done} max={total} aria-label="采购完成进度"/>}
    <details><summary>费用明细</summary><dl className="supply-summary">
      <div><dt>{q.actualPaid?'已实际支付':paidEstimate?'历史付款与估算':'历史实付'}</dt><dd>{q.actualPaid?.items===0&&q.unpricedPaid?.items?'暂未登记':costText(q.actualPaid??q.paid)}</dd></div>
      {!!q.unpricedPaid?.items&&<div><dt>已购未填实付（参考）</dt><dd>{costText(q.unpricedPaid)}</dd></div>}
      <div><dt>剩余预计采购费用</dt><dd>{costText(q.remaining)}</dd></div>
      <div><dt>本周预计总支出</dt><dd>{costText(q.purchase)}</dd></div>
      {purchaseCategories.map(category=><div key={category}><dt>{category==='常备调味料'?'常备调味料补货':category}费用</dt><dd>{q.categories[category]?costText(q.categories[category]):'无需补购'}</dd></div>)}
      <div><dt>本周食材消耗价值</dt><dd>{costText(q.consumed)}</dd></div>
      <div><dt>日均消耗</dt><dd>{costText(avg)}</dd></div>
      <div><dt>全周预算</dt><dd>{q.budget===null?'未设':yuan(q.budget)}</dd></div>
    </dl>{q.budget!==null&&<p className="meta">{q.purchase.missing?'价格未齐，预算差额待定。':
      (q.budget>=q.purchase.known?'预计剩余预算 ':'预计超过预算 ')+yuan(Math.abs(q.budget-q.purchase.known))}</p>}</details>
  </section>;
}
type LineProps={rows:BuyLine[];start:string;detail:string;setDetail:(d:string)=>void;
  receipt?:(source:string,value?:Receipt)=>Promise<boolean>;editPrice?:SupplyActions['savePrice'];
  purchase?:{key:string;source:string}|null;setPurchase?:(value:{key:string;source:string}|null)=>void};
function GroupedLines({rows,progressRows=rows,...props}:LineProps&{progressRows?:BuyLine[]}) {
  return <>{purchaseCategories.map(category=>{
    const matching=rows.filter(row=>purchaseCategory(row.id)===category);
    const progress=purchaseProgress(progressRows.filter(row=>purchaseCategory(row.id)===category));
    return <details className="group-fold" key={category} open={category==='主要食材'?true:undefined}>
      <summary><span>{category==='常备调味料'?'常备调味料补货':category}</span><PurchaseProgress progress={progress}/></summary>
      {matching.length>0&&<LineList {...props} rows={matching}/>}
    </details>;
  })}</>;
}
function LineList({rows,start,detail,setDetail,receipt,editPrice,purchase,setPurchase}:LineProps) {
  return <ul className="purchase-list">{rows.map(row=>{
    const k=row.receiptKey||row.id, f=food(row.id);
    const status=purchaseStatus(row);
    return <li key={k}><div className="purchase-row"><label className="check">
      {receipt&&row.buy>0&&<input type="checkbox" checked={row.remaining===0} onChange={e=>{
        if(e.target.checked) {
          setDetail('');
          setPurchase?.({key:k,source:row.confirmed?'手动|'+crypto.randomUUID()+'|'+row.id:k});
        } else void receipt(k);
      }}/>}<span>{f.name}{(status==='已购'||status==='已买部分')&&<small className={'purchase-item-status'+(status==='已购'?' complete':'')}>{status}</small>}</span></label><b className="unit">{row.estimate===null&&!row.buy?'待补全':sizeText(row)}</b>
      <button className="small flat" aria-expanded={detail===k} onClick={()=>{setPurchase?.(null);setDetail(detail===k?'':k);}}>{detail===k?'收起':'详情'}</button></div>
      <p className="meta purchase-price">{editPrice?<button className="small flat" onClick={()=>{setPurchase?.(null);setDetail(detail===k?'':k);}} aria-label={'编辑'+f.name+'单价'}>{pendingPrice(row)}</button>:pendingPrice(row)}
        <b className="unit">{costText(row.cost)}</b></p>
      {receipt&&purchase?.key===k&&<div className="hint">
        <p className="meta">{row.confirmed?'登记再次购买':'确认实际购买'}</p>
        <PurchaseForm key={purchase.source} id={row.id} suggested={row.remaining||undefined} price={row.price}
          save={async value=>{const ok=await receipt(purchase.source,value);if(ok)setPurchase?.(null);return ok;}}/>
        <button className="flat" onClick={()=>setPurchase?.(null)}>取消登记</button>
      </div>}
      {detail===k&&<>
        {row.price?.basis==='毛重'&&<p className="meta">{row.price.yieldPercent?`按可食率 ${row.price.yieldPercent}% 将净需求换算为毛重。`:'未填写可食率，只显示净料下限。'}</p>}
        {editPrice&&<details><summary>修改此食材单价</summary><PriceEditor key={JSON.stringify(row.price)} id={row.id} current={row.price} save={editPrice}/></details>}
        <p className="meta">净需求 {decimal(row.need)} 克 · 库存及结转抵扣 {decimal(row.stock+row.carry)} 克 · 待买 {decimal(row.remaining)} 克</p>
        <ul>{row.uses.map((u,i)=><li key={i}>{useText(start,u)}</li>)}</ul>
        {receipt&&row.confirmed>0&&<><p className="meta">修正这笔购买记录</p><PurchaseForm key={JSON.stringify([row.confirmed,row.paid,row.receiptDate])} id={row.id}
          previous={row.confirmed?{gross:row.confirmed,net:row.netConfirmed,date:row.receiptDate,quantity:row.receiptQuantity,unit:row.receiptUnit,paid:row.paidActual,netOnly:row.receiptNetOnly}:undefined}
          price={row.price} save={value=>receipt(row.receiptKey,value)}/></>}
        {receipt&&<button className="small" onClick={()=>{setDetail('');setPurchase?.({key:k,source:row.confirmed?'手动|'+crypto.randomUUID()+'|'+row.id:k});}}>{row.confirmed?'再次购买':'登记购买'}</button>}
        {receipt&&row.confirmed>0&&<button className="danger" onClick={()=>void receipt(row.receiptKey)}>撤销此项已买</button>}
      </>}
    </li>;
  })}</ul>;
}
