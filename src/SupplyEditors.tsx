import {useState} from 'react';
import {food,foods,foodState} from './catalog';
import {addDays,patternOptions,prepPeriods,shoppingOffsets,splitWeek,type ShoppingSchedule,type SupplySettings} from './batches';
import {priceDefaults,priceFor,priceUnits,type PriceBook,type PriceInput,type PriceUnit} from './prices';
import {consumedBySource,homeKey,type Execution,type StockInfo} from './execution';
import {convertibleFoods,purchaseFood,type PurchaseOptions} from './purchase-food';
import type {Profile} from './profile';
import {requiresCooling} from './food-storage';
import type {Pantry} from './shopping';
import {dateLabel,decimal,SectionTitle} from './ui';

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
export function PriceManager({book,pantry,save,resetAll,exportPrices,importPrices,products,saveProducts}:{
  book:PriceBook;pantry:Pantry;save:(id:string,value?:PriceInput)=>Promise<boolean>;resetAll:()=>void;
  exportPrices:()=>void;importPrices:(file:File)=>void;products?:PurchaseOptions;saveProducts:(products:PurchaseOptions)=>Promise<boolean>;
}) {
  const [category,setCategory]=useState('全部'),[query,setQuery]=useState(''),[limit,setLimit]=useState(24);
  const found=foods.filter(f=>purchaseFood(f.id,products).purchaseIngredientId===f.id||book[f.id]||pantry[f.id]?.price!==undefined).filter(matches(category,query));
  return <section className="card"><SectionTitle title="广东食材参考价"/>
    <p className="hint">人民币零售参考。监测、类别参考和估算分别标注。可食率和液体换算重量为估算，按实际标签或称重修改。自定义价格优先。</p>
    <details><summary>生熟换算与即食商品</summary>
      <p className="meta">出成率为熟的可食净重 ÷ 生料或干料的可食净重。即食选项独立计价。旧成品单价会保留。</p>
      {convertibleFoods.map(id=><ConversionEditor key={JSON.stringify([id,products])} id={id} options={products} save={saveProducts}/>)}
    </details>
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
function ConversionEditor({id,options,save}:{id:string;options?:PurchaseOptions;save:(options:PurchaseOptions)=>Promise<boolean>}) {
  const rule=purchaseFood(id).conversion!;
  const effective=purchaseFood(id,{yields:options?.yields});
  const [rate,setRate]=useState(effective.rate===null||effective.rate===undefined?'':String(effective.rate*100));
  const [ready,setReady]=useState(options?.ready?.includes(id)??false);
  const [error,setError]=useState('');
  return <details><summary>{food(id).name} · {effective.rate==null?'换算待补充':decimal(effective.rate*100)+'%'} {options?.ready?.includes(id)?'· 买即食':''}</summary>
    <p className="meta">{food(rule.purchaseIngredientId).name} · {rule.method} · {rule.version} · 初始估算 {decimal(rule.rate*100)}%。<a href={rule.source} target="_blank" rel="noreferrer">查阅估算依据</a></p>
    <label className="check"><input type="checkbox" checked={ready} onChange={e=>setReady(e.target.checked)}/>明确购买这一种无盐即食成品，按包装保质保存</label>
    <label className="field">我的实际出成率（%）<input type="number" min={10} max={1000} step="any" value={rate} onChange={e=>setRate(e.target.value)}/></label>
    <p className="meta">留空表示未知，受影响的采购会标记为待补充。</p>
    {error&&<p className="error" role="alert">{error}</p>}
    <div className="actions"><button onClick={()=>{
      if(rate&&(!Number.isFinite(+rate)||+rate<10||+rate>1000)){setError('请输入 10%～1000% 的有效出成率。');return;}
      if(ready!==Boolean(options?.ready?.includes(id))&&!confirm('切换后，当前方案会按所选原料或即食商品重新估算，已购凭证仍会保留。继续？'))return;
      const selected=(options?.ready??[]).filter(item=>item!==id);
      if(ready)selected.push(id);
      void save({ready:selected,yields:{...options?.yields,[id]:rate?+rate/100:null}});
    }}>保存换算与商品</button>
    <button onClick={()=>{const yields={...options?.yields};delete yields[id];void save({...options,yields});}}>恢复参考出成率</button></div>
  </details>;
}

export function SupplyFields({settings,start,profile,change}:{settings:SupplySettings;start:string;profile:Profile;change:(v:SupplySettings)=>void}) {
  const [custom,setCustom]=useState((settings.pattern??[2,2,3]).join('＋'));
  const [selected,setSelected]=useState(settings.shopping?.offsets??[0,3]);
  const options=settings.prep==='自定义'?undefined:patternOptions[settings.prep];
  let dates:number[]=[];
  try{dates=shoppingOffsets(settings,profile,start);}catch{/* 保存时检查 */}
  const ranges=(()=>{try{return splitWeek(settings);}catch{return [];}})();
  return <>
    <div className="fields">
      <label className="field">每周采购次数<select value={settings.shopping?.count??2} onChange={e=>{
        const count=e.target.value==='自定义'?'自定义':+e.target.value as 1|2|3;
        change({...settings,shopping:{count,...(count==='自定义'?{offsets:selected}:{})}});
      }}><option value="1">1 次</option><option value="2">2 次</option><option value="3">3 次</option><option>自定义</option></select></label>
      <label className="field">备餐周期<select value={settings.prep} onChange={e=>change({...settings,prep:e.target.value as SupplySettings['prep'],pattern:undefined,prepDates:undefined})}>
        {prepPeriods.map(p=><option key={p}>{p}</option>)}</select></label>
      {options&&options.length>1&&<label className="field">批次划分<select value={(settings.pattern??options[0]).join('＋')}
        onChange={e=>change({...settings,pattern:e.target.value.split('＋').map(Number),prepDates:undefined})}>
        {options.map(p=><option key={p.join()}>{p.join('＋')}</option>)}</select></label>}
      {settings.prep==='自定义'&&<label className="field">各批覆盖天数（合计 7 天）<input value={custom} onChange={e=>{
        setCustom(e.target.value);change({...settings,pattern:e.target.value.split(/[+＋，,\s]+/).filter(Boolean).map(Number),prepDates:undefined});
      }}/></label>}
    </div>
    {settings.shopping?.count==='自定义'&&<fieldset className="choices"><legend>选购物日期</legend>
      <div className="chips">{Array.from({length:8},(_,i)=>i-1).map(d=><label className="chip" key={d}>
        <input type="checkbox" checked={selected.includes(d)} onChange={e=>{
          const next=(e.target.checked?[...selected,d]:selected.filter(v=>v!==d)).sort((a,b)=>a-b);
          setSelected(next);change({...settings,shopping:{count:'自定义',offsets:next}});
        }}/>{dateLabel(addDays(start,d))}</label>)}</div></fieldset>}
    {dates.length>0&&<p className="meta">预定购物日 {dates.map(d=>dateLabel(addDays(start,d))).join('、')}</p>}
    {settings.prep==='自定义'&&ranges.map((r,i)=><label key={i} className="field">第 {i+1} 批备餐日<select value={r.prepAt}
      onChange={e=>change({...settings,prepDates:ranges.map((range,index)=>index===i?+e.target.value:range.prepAt)})}>
      {Array.from({length:r.from+2},(_,j)=>j-1).filter(d=>d>=dates[0]).map(d=><option key={d} value={d}>{dateLabel(addDays(start,d))}</option>)}</select></label>)}
  </>;
}
