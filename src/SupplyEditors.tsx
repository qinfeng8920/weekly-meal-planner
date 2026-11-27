import {Action,CategoryGlyph,Icon,SearchField,Sheet,StatusLabel,useRemembered} from './design';
import {foodClass,foodGroups} from './catalog-taxonomy';
import {searchMatches} from './catalog-search';
import {useState} from 'react';
import {food,foods,foodState} from './catalog';
import {addDays,patternOptions,prepPeriods,shoppingOffsets,splitWeek,type ShoppingSchedule,type SupplySettings} from './batches';
import {priceDefaults,priceFor,priceUnits,type PriceBook,type PriceInput,type PriceUnit} from './prices';
import type {Execution} from './execution';
import {balances,type InventoryEvent,type Ledger,type Review} from './inventory';
import {inventoryGroup,inventoryGroups} from './purchase-category';
import type {Receipt} from './logistics';
import {PurchaseForm} from './InventoryInputs';
import {convertibleFoods,purchaseFood,type PurchaseOptions} from './purchase-food';
import type {Profile} from './profile';
import type {Pantry} from './shopping';
import {dateLabel,decimal,SectionTitle} from './ui';

const categories=foodGroups;
export const yuan=(amount:number)=>'¥'+amount.toFixed(2);
export function PriceLabel({id,book,pantry}:{id:string;book:PriceBook;pantry:Pantry}) {
  const price=priceFor(id,book,pantry[id]);
  return <>{price?`${yuan(price.amount)}/${price.unit} · ${price.basis} · ${price.kind}`:'待补充单价'}</>;
}
function FoodSearch({category,query,onCategory,onQuery}:{category:string;query:string;onCategory:(s:string)=>void;onQuery:(s:string)=>void}) {
  return <div className="fields"><label className="field">食材分类<select value={category} onChange={e=>onCategory(e.target.value)}><option>全部</option>
    {categories.map(c=><option key={c}>{c}</option>)}</select></label>
    <SearchField label="搜索食材" value={query} change={onQuery} placeholder="名称或别名，如鸡胸肉、酸奶"/></div>;
}
function matches(category:string,query:string){return (f:typeof foods[number])=>(category==='全部'||foodClass(f).group===category)&&
  searchMatches([f.name,...f.aliases],query);}
export function PriceManager({book,pantry,save,resetAll,exportPrices,importPrices,products,saveProducts}:{
  book:PriceBook;pantry:Pantry;save:(id:string,value?:PriceInput)=>Promise<boolean>;resetAll:()=>void;
  exportPrices:()=>void;importPrices:(file:File)=>void;products?:PurchaseOptions;saveProducts:(products:PurchaseOptions)=>Promise<boolean>;
}) {
  const [category,setCategory]=useRemembered('prices-category','全部'),[query,setQuery]=useRemembered('prices-query',''),[limit,setLimit]=useRemembered('prices-limit',24);
  const found=foods.filter(f=>purchaseFood(f.id,products).purchaseIngredientId===f.id||book[f.id]||pantry[f.id]?.price!==undefined).filter(matches(category,query));
  return <section className="card price-manager"><SectionTitle title="广东食材参考价"><StatusLabel>人民币</StatusLabel></SectionTitle>
    <p className="meta">优先使用你的单价。参考价可按标签或实际称重修改。</p>
    <details className="group-fold"><summary>生熟换算与即食商品</summary>
      <p className="meta">出成率为熟的可食净重 ÷ 生料或干料的可食净重。即食选项独立计价。旧成品单价会保留。</p>
      {convertibleFoods.map(id=><ConversionEditor key={JSON.stringify([id,products])} id={id} options={products} save={saveProducts}/>)}
    </details>
    <details className="item-fold"><summary>价格备份与恢复</summary><div className="actions"><button onClick={exportPrices}>备份自定义价格</button><label className="file-button">恢复价格备份
      <input type="file" aria-label="恢复价格备份" accept=".json,application/json" onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(f)importPrices(f);}}/></label>
      <button className="danger" onClick={resetAll}>恢复全部默认价格</button></div></details>
    <FoodSearch category={category} query={query} onCategory={c=>{setCategory(c);setLimit(24);}} onQuery={q=>{setQuery(q);setLimit(24);}}/>
    <p className="meta">显示 {Math.min(limit,found.length)} / {found.length} 种食材</p>
    {found.slice(0,limit).map(f=><details className="item-fold price-list-item" key={f.id}><summary><span>{f.name} · <PriceLabel id={f.id} book={book} pantry={pantry}/></span><Icon name="edit" size={17}/></summary>
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
  const countOrVolume=['升','毫升','个','盒','袋','瓶'].includes(unit);
  async function submit() {
    const counted=['个','盒','袋','瓶'].includes(unit);
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
  return <section className="price-editor">
    <p className="meta">系统默认 {yuan(reference.amount)}/{reference.unit} · {reference.region} · {reference.date} · {reference.kind}。{reference.source}
      {reference.url&&<> · <a href={reference.url} target="_blank" rel="noreferrer">查看监测资料</a></>}</p>
    <div className="fields">
      <label className="field">单价（元）<input type="number" inputMode="decimal" min="0" step=".01" value={amount} onChange={e=>setAmount(e.target.value)}/></label>
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

type InventoryProps={pantry:Pantry;prices:PriceBook;ledger:Ledger;receipts:Record<string,Receipt>;execution?:Execution;
  inventory:Record<string,{projected:number;demand?:number;shortage?:number}>;
  save:(id:string,n:number,mode:'增加'|'扣除'|'报损'|'设为')=>Promise<boolean>;
  savePurchase:(source:string,receipt?:Receipt)=>Promise<boolean>;
  clear:(item?:string)=>Promise<boolean>;undoClear:(reference:string)=>Promise<boolean>;
  reverse:(event:InventoryEvent)=>Promise<boolean>;review:(id:string,n:number)=>Promise<boolean>};

export function InventoryManager(props:InventoryProps) {
  const {pantry,prices,ledger,inventory,savePurchase,review}=props;
  const [query,setQuery]=useRemembered('inventory-query',''),[all,setAll]=useRemembered('inventory-all',false);
  const [isAdding,setAdding]=useState(false),[choose,setChoose]=useState(''),[mode,setMode]=useState('实际购买');
  const [active,setActive]=useState(''),[clearing,setClearing]=useState(''),[clearBusy,setClearBusy]=useState(false);
  const [addingQuery,setAddingQuery]=useState('');
  const activeFood=foods.find(f=>f.id===active);
  const quantities=balances(ledger), found=foods.filter(matches('全部',query));
  const items=found.filter(f=>all||(quantities.get(f.id)??0)>0);
  const [choicePage,setChoicePage]=useState(0);
  const common=['chicken','oats','olive','egg','rice','yogurt','tofu','broccoli','apple','milk'];
  const available=foods.filter(matches('全部',addingQuery));
  const order=[...available].sort((a,b)=>Number(common.includes(b.id))-Number(common.includes(a.id)));
  const pageChoice=order.slice(choicePage*24,choicePage*24+24);
  const entering=foods.find(f=>f.id===choose);
  if(entering&&!pageChoice.some(f=>f.id===choose))pageChoice.unshift(entering);
  const events=new Map<string,InventoryEvent[]>();
  for(const event of ledger.events) {
    const entries=events.get(event.item)??[];
    entries.push(event);events.set(event.item,entries);
  }
  const reversals=new Set(ledger.events.flatMap(event=>event.reverses??[]));
  const lastClear=ledger.events.findLast(event=>event.kind==='库存清空'&&event.reference&&!reversals.has(event.id));
  const productCount=[...quantities.values()].filter(grams=>grams>0).length;
  return <section className="inventory-manager">
    <div className="card inventory-overview"><div><Icon name="box"/><h2>账面库存</h2><strong>{productCount} <small>种商品</small></strong></div>
      <Action icon="plus" className="primary" aria-expanded={isAdding} onClick={()=>{setAdding(true);setAddingQuery('');setChoicePage(0);}}>添加或登记购买</Action>
    </div>
    <SearchField label="搜索食材" value={query} change={setQuery} placeholder="搜索库存食材"/>
    <div className="actions inventory-tools">
      <label className="check"><input type="checkbox" checked={all} onChange={e=>setAll(e.target.checked)}/>显示零库存</label>
      {lastClear?.reference&&<button className="small" onClick={()=>void props.undoClear(lastClear.reference!)}>撤销最近清空</button>}
    </div>
    {isAdding&&<Sheet title="登记库存" close={()=>setAdding(false)}><section className="inline-editor">
      <SearchField label="搜索要登记的食材" value={addingQuery} change={q=>{setAddingQuery(q);setChoicePage(0);}} placeholder="输入食材名称"/>
      <label className="field">选择食材<select value={choose} onChange={e=>setChoose(e.target.value)}>
        <option value="">请选择</option>{pageChoice.map(f=><option value={f.id} key={f.id}>{f.name}</option>)}</select></label>
      {available.length>24&&<div className="actions"><button disabled={choicePage===0} onClick={()=>setChoicePage(choicePage-1)}>上一页食材</button>
        <span className="meta">第 {choicePage+1} / {Math.ceil(available.length/24)} 页</span>
        <button disabled={(choicePage+1)*24>=available.length} onClick={()=>setChoicePage(choicePage+1)}>下一页食材</button></div>}
      <label className="field">登记方式<select value={mode} onChange={e=>setMode(e.target.value)}><option>实际购买</option><option>手动补充</option></select></label>
      {entering&&(mode==='实际购买'?<NewInventoryPurchase key={choose} id={choose} price={priceFor(choose,prices,pantry[choose])}
        save={savePurchase} close={()=>setAdding(false)}/>:<StockEdit key={choose} initial={quantities.get(choose)??0} onlyAdd
        save={(value,action)=>props.save(choose,value,action).then(ok=>{if(ok)setAdding(false);return ok;})}/>)}
    </section></Sheet>}
    {ledger.review.length>0&&<details className="group-fold"><summary>旧库存待核对 <span className="unit">{ledger.review.length} 项</span></summary>
      {ledger.review.map(item=><LegacyReview key={item.id} item={item} balance={quantities.get(item.item)??0} save={review}/>)}
    </details>}
    {!items.length&&<p className="hint">{query?'当前筛选没有库存。可勾选显示零库存。':'还没有账面库存。确认购买或手动补充后会显示在这里。'}</p>}
    {inventoryGroups.map(group=>{
      const rows=items.filter(f=>inventoryGroup(f.id)===group);
      return rows.length?<details className="group-fold inventory-group card" key={group} open>
        <summary>{group}<span className="unit">{rows.length} 项</span></summary>
        {rows.map(f=>{
          const net=quantities.get(f.id)??0,row=inventory[f.id];
          return <details className="item-fold inventory-row" key={f.id}>
            <summary aria-haspopup="dialog" onClick={event=>{event.preventDefault();setActive(f.id);}}><CategoryGlyph category={foodClass(f).group}/>
              <span>{f.name}<small>本周用量 {decimal(row?.demand??0)} 克</small></span><span className="unit">{decimal(net)} 克</span></summary>
          </details>;
        })}
      </details>:null;
    })}
    {!all&&events.size>0&&<details className="group-fold"><summary>零库存历史流水</summary>
      {[...events].filter(([id])=>!(quantities.get(id)??0)&&found.some(f=>f.id===id)).map(([id,list])=>
        <details className="item-fold" key={id}><summary>{food(id).name}</summary><InventoryEvents events={list} {...{reversals,...props}}/></details>)}
    </details>}
    {productCount>0&&<details className="card stock-danger"><summary>库存管理</summary>
      <button className="danger" onClick={()=>setClearing('*')}>清空全部库存</button>
    </details>}
    {activeFood&&<Sheet title={activeFood.name} kind="detail" subtitle={foodState[activeFood.state]} close={()=>setActive('')}>
      <section className="card"><h3>账面库存</h3><p className="large">{decimal(quantities.get(active)??0)} <small>克</small></p>
        <p className="meta">本周用量 {decimal(inventory[active]?.demand??0)} 克 · 预计剩余 {decimal(inventory[active]?.projected??quantities.get(active)??0)} 克 · 待补购 {decimal(inventory[active]?.shortage??0)} 克</p>
        <StockEdit key={active+':'+(quantities.get(active)??0)} initial={quantities.get(active)??0} save={(value,action)=>props.save(active,value,action)}/>
      </section>
      <details className="card"><summary>流水与购买修正</summary><InventoryEvents events={events.get(active)??[]} {...{reversals,...props}}/></details>
      {(quantities.get(active)??0)>0&&<button className="danger" onClick={()=>setClearing(active)}>清空此项库存</button>}
    </Sheet>}
    {clearing&&<Sheet title={clearing==='*'?'清空全部库存':'清空 '+food(clearing).name} kind="dialog" close={()=>setClearing('')}>
      <p>将{clearing==='*'?'全部 '+productCount+' 种库存':food(clearing).name+'的 '+decimal(quantities.get(clearing)??0)+' 克库存'}归零。购买、实付和历史记录保留，可从库存页撤销。</p>
      <div className="actions"><button onClick={()=>setClearing('')}>取消</button><Action icon="trash" className="danger" disabled={clearBusy} onClick={()=>{
        setClearBusy(true);void props.clear(clearing==='*'?undefined:clearing).then(ok=>{if(ok)setClearing('');}).finally(()=>setClearBusy(false));
      }}>确认清空</Action></div></Sheet>}
  </section>;
}
function NewInventoryPurchase({id,price,save,close}:{id:string;price?:PriceInput;save:InventoryProps['savePurchase'];close:()=>void}) {
  const [source]=useState(()=>['手动',crypto.randomUUID(),id].join('|'));
  return <PurchaseForm id={id} price={price} save={async value=>{const ok=await save(source,value);if(ok)close();return ok;}}/>;
}
function StockEdit({initial,onlyAdd=false,save}:{initial:number;onlyAdd?:boolean;save:(value:number,mode:'增加'|'扣除'|'报损'|'设为')=>Promise<boolean>}) {
  const [mode,setMode]=useState<'增加'|'扣除'|'报损'|'设为'>('增加'),[amount,setAmount]=useState('');
  const [error,setError]=useState(''),[busy,setBusy]=useState(false);
  return <div className="inline-editor">
    <div className="fields">{!onlyAdd&&<label className="field">库存调整<select value={mode} onChange={e=>{
      const action=e.target.value as typeof mode;setMode(action);setAmount(action==='设为'?String(initial):'');
    }}><option>增加</option><option>扣除</option><option>报损</option><option>设为</option></select></label>}
    <label className="field">调整净重（克）<input type="number" min="0" step="any" value={amount} onChange={e=>setAmount(e.target.value)}/></label></div>
    <button disabled={busy} onClick={()=>{
      const value=+amount;
      if(!amount.trim()||!Number.isFinite(value)||value<0||value>1e8||!value&&mode!=='设为'){setError('请输入有效的净重。');return;}
      setBusy(true);setError('');
      void save(value,mode).then(ok=>{if(ok)setAmount('');}).finally(()=>setBusy(false));
    }}>保存库存调整</button>
    {error&&<p className="error" role="alert">{error}</p>}
  </div>;
}
function LegacyReview({item,balance,save}:{item:Review;balance:number;save:InventoryProps['review']}) {
  const [amount,setAmount]=useState('');
  return <div className="fold-body">
    <p>{food(item.item).name} · {item.kind} {decimal(item.grams)} 克 · 当前账面 {decimal(balance)} 克</p>
    <label className="field">核对后应额外计入的净重（克）<input type="number" min="0" step="any" value={amount} onChange={e=>setAmount(e.target.value)}/></label>
    <div className="actions"><button disabled={!amount.trim()||!Number.isFinite(+amount)||+amount<0||+amount>1e8} onClick={()=>void save(item.id,+amount)}>确认数量</button>
      <button onClick={()=>void save(item.id,0)}>已核对，无需补录</button></div>
  </div>;
}
function InventoryEvents({events,reversals,receipts,execution,prices,pantry,savePurchase,reverse,undoClear}:InventoryProps&{events:InventoryEvent[];reversals:Set<string>}) {
  const [limit,setLimit]=useState(12);
  const latest=new Set<string>();
  const list=[...events].reverse();
  if(!list.length)return <p className="meta">暂无流水</p>;
  return <div className="fold-body">{list.slice(0,limit).map(r=>{
    const purchase=receipts[r.source]&&['采购入库','购买修正'].includes(r.kind)&&!latest.has(r.source);
    if(purchase)latest.add(r.source);
    const taken=r.kind==='实际取用'&&Boolean(r.reference&&execution?.tasks?.[r.reference]?.taken);
    const editable=['手动补充','手动扣除','报损丢弃','旧手工库存'].includes(r.kind)&&!reversals.has(r.id);
    return <details className="item-fold" key={r.id}><summary><span>{r.date??'旧记录'} · {r.kind}</span><span className="unit">{r.delta>0?'+':''}{decimal(r.delta)} 克</span></summary>
      <div className="fold-body">
        <p className="meta">原始数量 {decimal(r.quantity)} {r.unit}{r.paid!==undefined?' · 实付 '+yuan(r.paid):''}</p>
        {purchase&&<><PurchaseForm key={JSON.stringify(receipts[r.source])} id={r.item} previous={receipts[r.source]} price={priceFor(r.item,prices,pantry[r.item])}
          save={value=>savePurchase(r.source,value)}/><button className="danger" onClick={()=>void savePurchase(r.source)}>撤销购买</button></>}
        {(editable||taken)&&<button className="danger" onClick={()=>void reverse(r)}>{taken?'撤销该任务取用':'撤销此调整'}</button>}
        {r.kind==='库存清空'&&r.reference&&!reversals.has(r.id)&&<button onClick={()=>void undoClear(r.reference!)}>撤销这次清空</button>}
      </div></details>;
  })}{list.length>limit&&<button onClick={()=>setLimit(limit+24)}>查看更早记录</button>}</div>;
}
function ConversionEditor({id,options,save}:{id:string;options?:PurchaseOptions;save:(options:PurchaseOptions)=>Promise<boolean>}) {
  const rule=purchaseFood(id).conversion!;
  const effective=purchaseFood(id,{yields:options?.yields});
  const [rate,setRate]=useState(effective.rate===null||effective.rate===undefined?'':String(effective.rate*100));
  const [ready,setReady]=useState(options?.ready?.includes(id)??false);
  const [error,setError]=useState('');
  return <details className="item-fold"><summary>{food(id).name} · {effective.rate==null?'换算待补充':decimal(effective.rate*100)+'%'} {options?.ready?.includes(id)?'· 买即食':''}</summary>
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
