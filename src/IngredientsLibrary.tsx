import {useMemo,useState} from 'react';
import {food,foods,foodState,recipeList,type Food} from './catalog';
import micros from './food-micros-v24.json';
import {foodClass,foodGroups,recipeUses} from './catalog-taxonomy';
import {searchMatches} from './catalog-search';
import {PurchaseForm} from './InventoryInputs';
import {PriceEditor} from './SupplyEditors';
import {priceFor,type PriceBook,type PriceInput} from './prices';
import {purchaseFood,purchaseIngredientId,type PurchaseOptions} from './purchase-food';
import {conditionalPair,directRules} from './substitution';
import {recipeCooking} from './cooking';
import {macroKeys} from './nutrition';
import type {Pantry} from './shopping';
import type {PoolSettings} from './ingredient-pool';
import type {Receipt} from './logistics';
import {CatalogPaging,decimal,Empty} from './ui';

const unitLabels:Record<string,[string,string]>={kcal:['能量','千卡'],protein:['蛋白质','克'],fat:['脂肪','克'],
  carbs:['碳水','克'],fiber:['膳食纤维','克'],sodium:['钠','毫克'],potassium:['钾','毫克'],calcium:['钙','毫克'],
  iron:['铁','毫克'],magnesium:['镁','毫克'],zinc:['锌','毫克'],vitaminC:['维生素 C','毫克'],folate:['总叶酸','微克'],vitaminB12:['维生素 B12','微克']};
const extra:Record<string,Record<string,number|null>>={...micros,
  pitaya:{iron:.3,magnesium:41,zinc:.3,folate:44,vitaminB12:0},
  bayberry:{iron:.4,magnesium:7,zinc:.1,folate:26,vitaminB12:0},
  cherrytomato:{iron:.4,magnesium:13,zinc:.2,folate:35,vitaminB12:0},
};
type Props={products?:PurchaseOptions;stock:ReadonlyMap<string,number>;pantry:Pantry;prices:PriceBook;settings:PoolSettings;
  savePrice:(id:string,value?:PriceInput)=>Promise<boolean>;savePurchase:(source:string,receipt?:Receipt)=>Promise<boolean>;
  change:(field:'locked'|'preferred'|'excluded',id:string)=>void;related:(query:string)=>void;back:()=>void};
const perPage=15;
export function IngredientsLibrary(props:Props) {
  const [query,setQuery]=useState(''),[group,setGroup]=useState(''),[sub,setSub]=useState(''),[page,setPage]=useState(0),[open,setOpen]=useState('');
  const index=useMemo(()=>{
    const grouped=new Map<string,Food[]>();
    for(const item of foods){
      const id=purchaseIngredientId(item.id,props.products);
      grouped.set(id,[...(grouped.get(id)??[]),item]);
    }
    return [...grouped].map(([id,states])=>({id,states,f:food(id),...foodClass(food(id)),
      search:states.flatMap(item=>[item.name,...item.aliases,item.description,item.id])}));
  },[props.products]);
  const primary=group?index.filter(row=>row.group===group):index;
  const secondaries=[...new Set(primary.map(row=>row.subgroup))];
  const result=primary.filter(row=>(!sub||row.subgroup===sub)&&searchMatches([...row.search,row.group,row.subgroup],query));
  function select(g:string,s='') {setGroup(g);setSub(s);setPage(0);setOpen('');}
  return <>
    <div className="page-title"><div><h1>原材料大全</h1><p>{index.length} 种采购原材料 · {foods.length} 条食材状态记录</p></div><button onClick={props.back}>返回我的</button></div>
    <section className="card"><label className="field">搜索原材料<input type="search" placeholder="名称、别名、拼音" value={query}
      onChange={e=>{setQuery(e.target.value);setPage(0);setOpen('');}}/></label>
      <div className="taxonomy-tabs"><button aria-pressed={!group} onClick={()=>select('')}>查看全部</button>
        {foodGroups.map(g=><button key={g} aria-pressed={g===group} onClick={()=>select(g)}>{g} <small>{index.filter(row=>row.group===g).length}</small></button>)}</div>
      {group&&<div className="taxonomy-tabs taxonomy-sub"><button onClick={()=>select(group)} aria-pressed={!sub}>全部{group}</button>
        {secondaries.map(g=><button key={g} aria-pressed={g===sub} onClick={()=>select(group,g)}>{g} <small>{primary.filter(row=>row.subgroup===g).length}</small></button>)}</div>}
    </section>
    <p className="meta">找到 {result.length} 种</p>
    {!result.length&&<Empty title="没有找到原材料"/>}
    {result.slice(page*perPage,(page+1)*perPage).map(row=><details className="card item-fold recipe-card" key={row.id} open={open===row.id}
      onToggle={e=>{if(e.currentTarget.open&&open!==row.id)setOpen(row.id);else if(!e.currentTarget.open&&open===row.id)setOpen('');}}>
      <summary><span><strong>{row.f.name}</strong><small>{row.subgroup} · 库存 {decimal(props.stock.get(row.id)??0)} 克{row.states.length>1?' · '+row.states.length+' 种称量状态':''}</small></span></summary>
      {open===row.id&&<IngredientDetail key={row.id} {...props} id={row.id} states={row.states}/>}
    </details>)}
    <CatalogPaging total={result.length} page={page} size={perPage} change={n=>{setPage(n);setOpen('');}}/>
  </>;
}
function IngredientDetail({id,states,products,prices,pantry,settings,savePrice,savePurchase,change,related}:Props&{id:string;states:Food[]}) {
  const [selected,setSelected]=useState(id),[editor,setEditor]=useState(''),[source,setSource]=useState(()=>crypto.randomUUID());
  const f=food(selected), price=priceFor(id,prices,pantry[id]);
  const stats={...f.nutrients,...extra[f.id]} as Record<string,number|null>;
  const uses=recipeList.filter(r=>recipeUses(f.id,r));
  const substitute=foods.filter(row=>conditionalPair(f.id,row.id)||directRules.some(rule=>rule.from===f.id&&rule.to===row.id)).map(row=>row.name);
  const conversion=purchaseFood(f.id,products).conversion;
  return <>
    {states.length>1&&<div className="segmented">{states.map(state=><button key={state.id} aria-pressed={selected===state.id}
      onClick={()=>setSelected(state.id)}>{foodState[state.state]}</button>)}</div>}
    <p className="meta">{foodState[f.state]}每 100 克 · {f.aliases.join('、')||f.name} · 过敏原 {f.allergens.join('、')||'无记录'}</p>
    <dl className="ingredient-nutrients">{Object.entries(unitLabels).map(([k,[label,unit]])=><div key={k}><dt>{label}</dt><dd>{stats[k]==null?k==='sodium'&&f.sodiumUpperBound!==undefined?'微量（少于 '+f.sodiumUpperBound+' 毫克）':'未知':decimal(stats[k])+' '+unit}</dd></div>)}</dl>
    <p className="meta">{f.description} · {f.sourceUrl?.includes('mext.go.jp')?'出典：日本食品標準成分表（八訂）増補2023年':f.sourceUrl?'原数据机构食品成分表':'USDA FoodData Central SR Legacy 2018'}
      {macroKeys.some(k=>f.nutrients[k]===null)?' · 关键营养缺失，暂不参与自动配餐':!uses.length?' · 暂无审核菜谱':''}</p>
    <p><a href={f.sourceUrl??`https://fdc.nal.usda.gov/food-details/${f.fdc}/nutrients`} target="_blank" rel="noreferrer">查看营养原始条目</a></p>
    <p className="meta">{conversion?`每 1 克净原料约得到 ${conversion.rate} 克${foodState[f.state]}，${conversion.method}。`:'未录入通用可食率或出成率，按标注状态称量。'}
      {conversion&&<a href={conversion.source} target="_blank" rel="noreferrer">换算依据</a>}</p>
    <p>{price?`¥${price.amount.toFixed(2)}/${price.unit} · ${price.basis} · ${price.kind}${price.pack?' · 包装 '+price.pack+' 克':''}`:'价格待补充'}</p>
    <p>已收录做法 {[...new Set(uses.map(r=>recipeCooking(r).method))].join('、')||'暂无'}</p>
    {substitute.length>0&&<details className="item-fold"><summary>有条件替代 · {substitute.length} 种</summary><p>{substitute.join('、')}。以完整菜谱重新校验份量和过敏限制。</p></details>}
    {uses.length>0&&<p><button onClick={()=>related(f.name)}>查看 {uses.length} 道相关菜谱</button></p>}
    <div className="actions"><button onClick={()=>{setEditor(editor==='库存'?'':'库存');setSource(crypto.randomUUID());}}>加入库存</button>
      <button onClick={()=>setEditor(editor==='价格'?'':'价格')}>修改价格</button>
      {(['preferred','locked','excluded'] as const).map((key,i)=><button key={key} aria-pressed={settings[key]?.includes(id)??false}
        onClick={()=>change(key,id)}>{settings[key]?.includes(id)?['取消优先','解除本周锁定','取消排除'][i]:['优先使用','锁定为本周食材','排除食材'][i]}</button>)}</div>
    {editor==='库存'&&<PurchaseForm key={source} id={id} price={price} save={async value=>{const ok=await savePurchase('手动|'+source+'|'+id,value);if(ok)setEditor('');return ok;}}/>}
    {editor==='价格'&&<PriceEditor id={id} current={price} save={savePrice}/>}
  </>;
}
