import {Action,CategoryGlyph,Icon,ListRow,PageHeader,SearchField,Segment,Sheet,useCatalogBack,useRemembered} from './design';
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
import {foodPreference,foodStates,type FoodState,type PoolSettings} from './ingredient-pool';
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
  change:(id:string,state:FoodState)=>void;related:(query:string)=>void;back:()=>void};
const perPage=15;
export function IngredientsLibrary(props:Props) {
  const [view,setView]=useRemembered('ingredients',{query:'',group:'',sub:'',page:0,all:false});
  const {query,group,sub,page,all}=view;
  const [open,setOpen]=useState('');
  const change=(patch:Partial<typeof view>)=>setView(old=>({...old,...patch}));
  const browseHistory=useCatalogBack('ingredients',()=>change({group:'',sub:'',query:'',all:false,page:0}));
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
  const active=index.find(item=>item.id===open);
  const categoryName=(name:string)=>name==='主食'?'主食杂粮':name;
  const browse=Boolean(group||query.trim()||all);
  return <>
    <PageHeader title="原材料大全" subtitle={index.length+' 种采购原材料 · '+foods.length+' 条称量状态'}/>
    <SearchField label="搜索原材料" placeholder="搜索名称、别名或拼音" value={query} change={value=>change({query:value,page:0})}/>
    {!browse?<section className="row-stack category-list" aria-label="原材料分类">
      {foodGroups.map(key=>{
        const rows=index.filter(row=>row.group===key);
        const secondary=[...new Set(rows.map(row=>row.subgroup))];
        return <ListRow key={key} icon={<CategoryGlyph category={key}/>} title={categoryName(key)}
          detail={secondary.slice(0,4).join('、')||'暂无收录'} aside={rows.length+' 种'}
          onClick={()=>{browseHistory.enter();change({group:key,sub:'',page:0});}}/>;
      })}
      <ListRow icon={<Icon name="book"/>} title="查看全部原材料" onClick={()=>{browseHistory.enter();change({all:true,page:0});}}/>
    </section>:<>
      <div className="browse-heading"><button className="flat" onClick={browseHistory.back}>返回分类</button>
        <h2>{query.trim()?'搜索结果':group?categoryName(group):'全部原材料'}</h2><span className="meta">{result.length} 种</span></div>
      {group&&secondaries.length>0&&<Segment label="二级分类" items={['全部',...secondaries]} value={sub||'全部'} change={v=>change({sub:v==='全部'?'':v,page:0})}/>}
      {!result.length?<Empty title="未找到原材料"><p>试试其他名称、别名或拼音。</p></Empty>:<div className="row-stack">
        {result.slice(page*perPage,(page+1)*perPage).map(row=><ListRow key={row.id} icon={<CategoryGlyph category={row.group}/>}
          title={row.f.name} detail={row.subgroup+(row.states.length>1?' · '+row.states.length+' 种称量状态':'')}
          aside={decimal(props.stock.get(row.id)??0)+' 克'} onClick={()=>setOpen(row.id)}/>)}
      </div>}
      <CatalogPaging total={result.length} page={page} size={perPage} change={n=>{change({page:n});window.scrollTo(0,0);}}/>
    </>}
    {active&&<Sheet kind="detail" title={active.f.name} subtitle={active.group+' · '+active.subgroup} close={()=>setOpen('')}>
      <IngredientDetail key={active.id} {...props} id={active.id} states={active.states}/>
    </Sheet>}
  </>;
}
function IngredientDetail({id,states,products,prices,pantry,settings,stock,savePrice,savePurchase,change,related}:Props&{id:string;states:Food[]}) {
  const [selected,setSelected]=useState(id),[editor,setEditor]=useState(''),[source,setSource]=useState(()=>crypto.randomUUID());
  const f=food(selected), price=priceFor(id,prices,pantry[id]);
  const stats={...f.nutrients,...extra[f.id]} as Record<string,number|null>;
  const uses=recipeList.filter(r=>recipeUses(f.id,r));
  const substitute=foods.filter(row=>conditionalPair(f.id,row.id)||directRules.some(rule=>rule.from===f.id&&rule.to===row.id)).map(row=>row.name);
  const conversion=purchaseFood(f.id,products).conversion;
  const measures=Object.entries(unitLabels).map(([k,[label,unit]])=><div key={k}><dt>{label}</dt>
    <dd>{stats[k]==null?k==='sodium'&&f.sodiumUpperBound!==undefined?'微量（少于 '+f.sodiumUpperBound+' 毫克）':'未知':decimal(stats[k])+' '+unit}</dd></div>);
  return <>
    <section className="card ingredient-hero"><div className="ingredient-hero-heading"><CategoryGlyph category={foodClass(f).group}/><div><h3>营养概览</h3><span className="meta">{foodState[f.state]}每 100 克</span></div></div>
      {states.length>1&&<div className="segmented app-segment" role="group" aria-label="称量状态">{states.map(state=><button key={state.id} aria-pressed={selected===state.id} onClick={()=>setSelected(state.id)}>{foodState[state.state]}</button>)}</div>}
      <dl className="ingredient-nutrients">{measures.slice(0,5)}</dl>
    </section>
    <section className="card"><h3>库存与价格</h3><p><strong>{decimal(stock.get(id)??0)} 克</strong> <span className="meta">账面库存</span></p>
      <p className="meta">{price?`¥${price.amount.toFixed(2)}/${price.unit} · ${price.basis} · ${price.kind}${price.pack?' · 包装 '+price.pack+' 克':''}`:'价格待补充'}</p>
      <div className="actions"><Action icon="plus" className="primary" onClick={()=>{setEditor('库存');setSource(crypto.randomUUID());}}>加入库存</Action>
        <Action icon="edit" onClick={()=>setEditor('价格')}>修改价格</Action></div>
      <label className="field ingredient-preference">食材偏好<select value={foodPreference(settings,id)} onChange={e=>change(id,e.target.value as FoodState)}>
        {foodStates.map(state=><option key={state}>{state}</option>)}</select></label>
    </section>
    <section className="card"><h3>称量与替代</h3>
      <p className="meta">{f.aliases.join('、')||f.name} · 过敏原 {f.allergens.join('、')||'无记录'}</p>
      <p className="meta">{conversion?`每 1 克净原料约得到 ${conversion.rate} 克${foodState[f.state]}，${conversion.method}。`:'按标注状态称量。'}
        {conversion&&<a href={conversion.source} target="_blank" rel="noreferrer">换算依据</a>}</p>
      <p className="meta">已收录做法 {[...new Set(uses.map(r=>recipeCooking(r).method))].join('、')||'暂无'}</p>
      {substitute.length>0&&<details className="item-fold"><summary>有条件替代 · {substitute.length} 种</summary>
        <p>{substitute.join('、')}。以完整菜谱重新校验份量和过敏限制。</p></details>}
      {uses.length>0&&<Action icon="book" onClick={()=>related(f.name)}>查看 {uses.length} 道相关菜谱</Action>}
    </section>
    <section className="card"><h3>详细成分与来源</h3><dl className="micro-list">{measures.slice(5)}</dl>
      <p className="meta">{f.description} · {f.sourceUrl?.includes('mext.go.jp')?'日本食品标准成分表 · 八订增补 2023 年':f.sourceUrl?'原数据机构食品成分表':'USDA FoodData Central SR Legacy 2018'}
        {macroKeys.some(k=>f.nutrients[k]===null)?' · 关键营养缺失，暂不参与自动配餐':!uses.length?' · 暂无审核菜谱':''}</p>
      <a href={f.sourceUrl??`https://fdc.nal.usda.gov/food-details/${f.fdc}/nutrients`} target="_blank" rel="noreferrer">查看营养原始条目</a>
    </section>
    {editor==='库存'&&<Sheet title={'加入库存 · '+food(id).name} close={()=>setEditor('')}><PurchaseForm key={source} id={id} price={price}
      save={async value=>{const ok=await savePurchase('手动|'+source+'|'+id,value);if(ok)setEditor('');return ok;}}/></Sheet>}
    {editor==='价格'&&<Sheet title={'修改价格 · '+food(id).name} close={()=>setEditor('')}><PriceEditor id={id} current={price} save={async(key,value)=>{
      const ok=await savePrice(key,value);if(ok)setEditor('');return ok;
    }}/></Sheet>}
  </>;
}
