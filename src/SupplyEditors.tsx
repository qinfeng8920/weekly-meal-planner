import {useState} from 'react';
import {foods,foodState} from './catalog';
import {addDays,patternOptions,prepPeriods,purchasePeriods,splitWeek,type SupplySettings} from './batches';
import {priceDefaults,priceFor,priceUnits,type PriceBook,type PriceInput,type PriceUnit} from './prices';
import {consumedBySource,homeKey,type Execution,type StockInfo} from './execution';
import {requiresCooling} from './food-storage';
import type {Pantry} from './shopping';
import {decimal,SectionTitle} from './ui';

const categories=[...new Set(foods.map(f=>f.category))];
export const yuan=(amount:number)=>'¥'+amount.toFixed(2);
export function PriceLabel({id,book,pantry}:{id:string;book:PriceBook;pantry:Pantry}) {
  const price=priceFor(id,book,pantry[id]);
  return <>{price?`${yuan(price.amount)}/${price.unit} · ${price.basis} · ${price.kind}`:'待补充单价'}</>;
}
function FoodSearch({category,query,onCategory,onQuery}:{category:string;query:string;onCategory:(s:string)=>void;onQuery:(s:string)=>void}) {
  return <div className="fields"><label className="field">食材分类<select value={category} onChange={e=>onCategory(e.target.value)}><option>全部</option>
    {categories.map(c=><option key={c}>{c}</option>)}</select></label>
    <label className="field">搜索食材<input type="search" value={query} onChange={e=>onQuery(e.target.value)} placeholder="例如鸡胸肉、酸奶"/></label></div>;
}
function matches(category:string,query:string){return (f:typeof foods[number])=>(category==='全部'||f.category===category)&&
  [f.name,...f.aliases].some(n=>n.includes(query.trim()));}
export function PriceManager({book,pantry,save,resetAll,exportPrices,importPrices}:{
  book:PriceBook;pantry:Pantry;save:(id:string,value?:PriceInput)=>Promise<boolean>;resetAll:()=>void;
  exportPrices:()=>void;importPrices:(file:File)=>void;
}) {
  const [category,setCategory]=useState('全部'),[query,setQuery]=useState(''),[limit,setLimit]=useState(24);
  const found=foods.filter(matches(category,query));
  return <section className="card"><SectionTitle title="广东食材参考价"/>
    <p className="hint">人民币零售参考。监测、类别参考和估算分别标注。可食率和液体换算重量为估算，按实际标签或称重修改。自定义价格优先。</p>
    <div className="actions"><button onClick={exportPrices}>备份自定义价格</button><label className="file-button">恢复价格备份
      <input type="file" aria-label="恢复价格备份" accept=".json,application/json" onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(f)importPrices(f);}}/></label>
      <button className="danger" onClick={resetAll}>恢复全部默认价格</button></div>
    <FoodSearch category={category} query={query} onCategory={c=>{setCategory(c);setLimit(24);}} onQuery={q=>{setQuery(q);setLimit(24);}}/>
    <p className="meta">显示 {Math.min(limit,found.length)} / {found.length} 种食材</p>
    {found.slice(0,limit).map(f=><details key={f.id}><summary>{f.name} · <PriceLabel id={f.id} book={book} pantry={pantry}/></summary>
      <PriceEditor key={JSON.stringify([book[f.id],pantry[f.id]?.price,pantry[f.id]?.pack,pantry[f.id]?.yieldPercent])}
        id={f.id} current={priceFor(f.id,book,pantry[f.id])} save={save}/></details>)}
    {limit<found.length&&<button onClick={()=>setLimit(limit+24)}>显示更多食材</button>}
  </section>;
}
export function PriceEditor({id,current,save}:{id:string;current:ReturnType<typeof priceFor>;save:(id:string,value?:PriceInput)=>Promise<boolean>}) {
  const reference=priceDefaults[id];
  const [amount,setAmount]=useState(String(current?.amount??'')),[unit,setUnit]=useState<PriceUnit>(current?.unit??'公斤');
  const [basis,setBasis]=useState<PriceInput['basis']>(current?.basis??'净重');
  const [pack,setPack]=useState(String(current?.pack??'')),[equivalent,setEquivalent]=useState(String(current?.unitGrams??''));
  const [yieldValue,setYield]=useState(String(current?.yieldPercent??'')),[note,setNote]=useState(current?.note??'');
  const [date,setDate]=useState(current?.kind==='用户自定义'?current.date??'':'');
  const [error,setError]=useState('');
  const countOrVolume=['升','毫升','个','盒','袋'].includes(unit);
  async function submit() {
    const counted=['个','盒','袋'].includes(unit);
    if(counted&&pack&&+equivalent>0&&Math.abs(+pack/+equivalent-Math.round(+pack/+equivalent))>1e-6) {
      setError('按件计价时，购买包装应包含整数个计价单位。');return;
    }
    if(!amount.trim()||!Number.isFinite(+amount)||+amount<0||+amount>1e7||
      pack&&(!Number.isFinite(+pack)||+pack<=0||+pack>1e6)||
      countOrVolume&&(!Number.isFinite(+equivalent)||+equivalent<=0||+equivalent>1e6)||
      basis==='毛重'&&(!Number.isFinite(+yieldValue)||+yieldValue<1||+yieldValue>100)) {
      setError('请填写有效单价。毛重计价需要 1～100% 可食率，容积或按件计价需要每单位对应克数。');return;
    }
    if(await save(id,{amount:+amount,unit,basis,...(pack?{pack:+pack}:{}),...(countOrVolume?{unitGrams:+equivalent}:{}),
      ...(basis==='毛重'?{yieldPercent:+yieldValue}:{}),...(note.trim()?{note:note.trim()}:{}),...(date?{date}:{})}))setError('');
  }
  return <section>
    <p className="meta">系统默认 {yuan(reference.amount)}/{reference.unit} · {reference.region} · {reference.date} · {reference.kind}。{reference.source}
      {reference.url&&<> · <a href={reference.url} target="_blank" rel="noreferrer">查看监测资料</a></>}</p>
    <div className="fields">
      <label className="field">单价（元）<input type="number" min="0" step=".01" value={amount} onChange={e=>setAmount(e.target.value)}/></label>
      <label className="field">计价单位<select value={unit} onChange={e=>{const next=e.target.value as PriceUnit;
        setEquivalent(unit==='升'&&next==='毫升'&&equivalent?String(+equivalent/1000):unit==='毫升'&&next==='升'&&equivalent?String(+equivalent*1000):'');
        setUnit(next);}}>{priceUnits.map(u=><option key={u}>{u}</option>)}</select></label>
      <label className="field">计价重量<select value={basis} onChange={e=>setBasis(e.target.value as PriceInput['basis'])}><option>净重</option><option>毛重</option></select></label>
      {basis==='毛重'&&<label className="field">可食率（%）<input type="number" min="1" max="100" step=".1" value={yieldValue} onChange={e=>setYield(e.target.value)}/></label>}
      {countOrVolume&&<label className="field">每{unit}对应计价重量（克）<input type="number" min=".01" step="any" value={equivalent} onChange={e=>setEquivalent(e.target.value)}/></label>}
      <label className="field">购买包装重量（克，可选）<input type="number" min="1" step="any" value={pack} onChange={e=>setPack(e.target.value)}/></label>
      <label className="field">地区或商店（可选）<input value={note} onChange={e=>setNote(e.target.value)} maxLength={100}/></label>
      <label className="field">购买日期（可选）<input type="date" value={date} onChange={e=>setDate(e.target.value)}/></label>
    </div>
    {error&&<p className="error" role="alert">{error}</p>}
    <div className="actions"><button className="primary" onClick={()=>void submit()}>保存此食材价格</button>
      {current?.kind==='用户自定义'&&<button onClick={()=>void save(id)}>恢复单项默认价格</button>}</div>
  </section>;
}

export function InventoryManager({pantry,inventory,execution,save}:{pantry:Pantry;inventory:Record<string,{confirmed:number;projected:number;usable?:number;taken?:number}>;execution?:Execution;save:(id:string,n:number,info:StockInfo)=>Promise<boolean>}) {
  const [category,setCategory]=useState('全部'),[query,setQuery]=useState(''),[limit,setLimit]=useState(24);
  const found=foods.filter(matches(category,query)).sort((a,b)=>Number(Boolean(pantry[b.id]?.stock||inventory[b.id]))-Number(Boolean(pantry[a.id]?.stock||inventory[a.id])));
  const used=consumedBySource(execution);
  return <section className="card"><SectionTitle title="家中库存"/>
    <p className="hint">按可食净重登记。请核对实际保存方式和可用日期。预计结余独立显示。</p>
    <FoodSearch category={category} query={query} onCategory={c=>{setCategory(c);setLimit(24);}} onQuery={q=>{setQuery(q);setLimit(24);}}/>
    {found.slice(0,limit).map(f=>{
      const row=inventory[f.id], info=execution?.stock?.[f.id];
      const net=Math.max(0,(pantry[f.id]?.stock??0)-(used.get(homeKey(f.id))??0));
      return <details key={f.id}><summary>{f.name} · {decimal(net)} 克</summary>
        <p className="meta">{foodState[f.state]} · 已购净重 {decimal(row?.confirmed??0)} 克 · 已取用 {decimal(row?.taken??0)} 克 · 预计周末结余 {decimal(row?.projected??0)} 克</p>
        {net>0&&!info&&<p className="hint">旧库存缺少保存日期。确认后可用于抵扣。</p>}
        <StockInput key={JSON.stringify([net,info])} value={net} info={info} cold={requiresCooling(f.id)} save={(amount,value)=>save(f.id,amount,value)}/></details>;
    })}
    {limit<found.length&&<button onClick={()=>setLimit(limit+24)}>显示更多食材</button>}
  </section>;
}
export function StorageFields({storage,expires,onStorage,onExpires}:{storage:string;expires:string;onStorage:(v:StockInfo['storage'])=>void;onExpires:(v:string)=>void}) {
  return <><label className="field">保存方式<select value={storage} onChange={e=>onStorage(e.target.value as StockInfo['storage'])}>
    <option>干燥常温</option><option>冷藏</option><option>冷冻</option></select></label>
    <label className="field">可用至<input type="date" value={expires} onChange={e=>onExpires(e.target.value)}/></label></>;
}
function StockInput({value,info,cold,save}:{value:number;info?:StockInfo;cold:boolean;save:(n:number,info:StockInfo)=>Promise<boolean>}) {
  const [amount,setAmount]=useState(String(value)),[error,setError]=useState('');
  const [storage,setStorage]=useState<StockInfo['storage']>(info?.storage??(cold?'冷藏':'干燥常温'));
  const [expires,setExpires]=useState(info?.expires??'');
  return <div className="fields"><label className="field">实有库存净重（克）<input type="number" min="0" step="any" value={amount} onChange={e=>setAmount(e.target.value)}/></label>
    <StorageFields storage={storage} expires={expires} onStorage={setStorage} onExpires={setExpires}/>
    <button onClick={()=>{if(!amount.trim()||!Number.isFinite(+amount)||+amount<0||+amount>1e7||+amount>0&&(!expires||cold&&storage==='干燥常温'))setError('请填写有效库存、可用日期和适合食材的保存方式。');
      else void save(+amount,{storage,expires:expires||'0001-01-01'}).then(success=>{if(success)setError('');});}}>保存库存</button>{error&&<p role="alert" className="error">{error}</p>}</div>;
}
export function SupplyEditor({settings,start,people,budget,save}:{settings:SupplySettings;start?:string;people:string;budget:string;
  save:(settings:SupplySettings,people:string,budget:string)=>Promise<boolean>}) {
  const [s,setS]=useState(settings);
  const [custom,setCustom]=useState((settings.pattern??[2,2,3]).join('＋'));
  const [count,setCount]=useState(people),[cap,setCap]=useState(budget),[error,setError]=useState('');
  const options=s.prep==='自定义'?undefined:patternOptions[s.prep];
  const current=s.prep==='自定义'?{...s,pattern:custom.split(/[+＋，,\s]+/).filter(Boolean).map(Number)}:s;
  let ranges:ReturnType<typeof splitWeek>=[];
  try{ranges=splitWeek(current);}catch{/* 输入期间显示在保存提示中 */}
  function updateDate(key:'prepDates'|'purchaseDates',i:number,value:number) {
    const next=ranges.map((r,j)=>j===i?value:key==='prepDates'?r.prepAt:r.purchaseAt);
    setS(key==='prepDates'?{...s,prepDates:next,purchaseDates:ranges.map((r,j)=>Math.min(r.purchaseAt,next[j]))}:{...s,purchaseDates:next});
  }
  return <details className="card settings"><summary>采购周期、备餐周期与预算</summary>
    <div className="fields">
      <label className="field">备餐周期<select value={s.prep} onChange={e=>setS({prep:e.target.value as SupplySettings['prep'],purchase:s.purchase})}>
        {prepPeriods.map(p=><option key={p}>{p}</option>)}</select></label>
      <label className="field">采购周期<select value={s.purchase} onChange={e=>setS({...s,purchase:e.target.value as SupplySettings['purchase']})}>
        {purchasePeriods.map(p=><option key={p}>{p}</option>)}</select></label>
      <label className="field">用餐人数<input type="number" min="1" max="12" step="1" value={count} onChange={e=>setCount(e.target.value)}/></label>
      <label className="field">全周预算（元，可选）<input type="number" min=".01" step=".01" value={cap} onChange={e=>setCap(e.target.value)}/></label>
      {options&&options.length>1&&<label className="field">批次划分<select value={(s.pattern??options[0]).join('＋')}
        onChange={e=>setS({...s,pattern:e.target.value.split('＋').map(Number),prepDates:undefined,purchaseDates:undefined})}>
        {options.map(p=><option key={p.join()}>{p.join('＋')}</option>)}</select></label>}
      {s.prep==='自定义'&&<label className="field">各批覆盖天数（合计7天）<input value={custom} onChange={e=>{setCustom(e.target.value);setS({...s,prepDates:undefined,purchaseDates:undefined});}}/></label>}
    </div>
    {s.prep==='自定义'&&ranges.map((r,i)=><div key={r.index}>
      <p>第 {i+1} 批 · 第 {r.from+1}～{r.to} 天</p><div className="fields">
      {(['prepDates','purchaseDates'] as const).map(key=><label className="field" key={key}>{key==='prepDates'?'备餐日':'计划采购日'}
        <select value={key==='prepDates'?r.prepAt:r.purchaseAt} onChange={e=>updateDate(key,i,+e.target.value)}>
          {Array.from({length:(key==='prepDates'?r.from:r.prepAt)+2},(_,j)=>j-1).map(n=><option key={n} value={n}>
            {start?addDays(start,n):n<0?'计划前一天':'第 '+(n+1)+' 天'}</option>)}
        </select></label>)}</div>
    </div>)}
    {error&&<p role="alert" className="error">{error}</p>}
    <button className="primary" onClick={()=>{try{
      splitWeek(current);
      if(!Number.isInteger(+count)||+count<1||+count>12||cap&&(!Number.isFinite(+cap)||+cap<=0||+cap>1e7))throw Error('请检查用餐人数及预算。');
      void save(current,count,cap).then(ok=>{if(ok)setError('');});
    }catch(e){setError(e instanceof Error?e.message:'设置无效。');}}}>应用批次设置</button>
  </details>;
}
