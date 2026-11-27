import {useMemo,useState} from 'react';
import {food,baseRecipeList,fruitPreparations,recipeList,recipeMap,serving,variantsOf,type Recipe} from './catalog';
import {recipeGroups} from './catalog-taxonomy';
import {groupsForRecipe} from './recipe-taxonomy';
import {searchMatches} from './catalog-search';
import {canServe,breakfastMenus,labels,menuName} from './meal-catalog';
import {recipeCooking} from './cooking';
import {recipeMeaning} from './food-semantics';
import {recipeRestrictions} from './planner';
import type {Profile} from './profile';
import {amountFor,edibleRate,priceFor,type PriceBook} from './prices';
import {purchaseFood,rawNetGrams,type PurchaseOptions} from './purchase-food';
import type {Pantry} from './shopping';
import {CatalogPaging,decimal,Empty,RecipeInfo} from './ui';

const baselineIds=new Set(baseRecipeList.map(r=>r.id));
const index=[...recipeMap.values()].map(r=>{
  const meaning=recipeMeaning(r), cooking=recipeCooking(r), groups=groupsForRecipe(r);
  const fields=[r.name,r.cuisine,r.flavor,...groups,...r.ingredients.flatMap(i=>[food(i.id).name,...food(i.id).aliases])];
  return {r,base:baselineIds.has(r.id),groups,cooking,fields,nutrition:serving(r).nutrients,meaning};
});
const facets=[{key:'meal',name:'适用餐次',options:['早餐','午餐','晚餐','加餐']},
  {key:'method',name:'制作方式',options:[...new Set(index.map(row=>row.cooking.method))]},
  {key:'tool',name:'所需厨具',options:[...new Set(recipeList.flatMap(r=>r.tools))]},
  {key:'cuisine',name:'菜系',options:[...new Set(recipeList.map(r=>r.cuisine))]}] as const;
const perPage=14;
type SlotOption={key:string;label:string};
type Props={favorites:string[];blocked:string[];toggleFavorite:(id:string)=>void;toggleBlocked:(id:string)=>void;profile?:Profile;
  stock:ReadonlyMap<string,number>;prices:PriceBook;pantry:Pantry;products?:PurchaseOptions;back:()=>void;initialQuery?:string;
  slots:(r:Recipe)=>SlotOption[];add:(r:Recipe,key:string)=>void;required:(r:Recipe)=>void;busy:boolean;};
export function Library({favorites,blocked,toggleFavorite,toggleBlocked,profile,stock,prices,pantry,products,back,initialQuery,slots,add,required,busy}:Props) {
  const [query,setQuery]=useState(initialQuery??''),[group,setGroup]=useState(''),[tab,setTab]=useState('全部菜谱'),[page,setPage]=useState(0);
  const [filters,setFilters]=useState({meal:'',method:'',tool:'',cuisine:'',kcal:'',protein:'',stock:false,compatible:false});
  const [open,setOpen]=useState(''),[slot,setSlot]=useState('');
  const restrictions=useMemo(()=>new Map(index.map(({r})=>[r.id,recipeRestrictions(r,profile,blocked,products)])),[profile,blocked,products]);
  const hasStock=(r:Recipe)=>r.ingredients.every(i=>{
    const p=purchaseFood(i.id,products);
    return p.rate!==null&&(stock.get(p.purchaseIngredientId)??0)>=rawNetGrams(i.grams,p.rate)*Number(profile?.people??1);
  });
  const matches=index.filter(({r,base,groups,cooking,fields,nutrition})=>
    (tab!=='全部菜谱'||base)&&
    (!group||groups.some(g=>g===group))&&(tab!=='收藏'||favorites.includes(r.id))&&(tab!=='已屏蔽'||blocked.includes(r.id))&&
    (!filters.meal||canServe(r,filters.meal as '早餐'|'午餐'|'晚餐'|'加餐',labels(r).slot))&&
    (!filters.method||cooking.method===filters.method)&&(!filters.tool||r.tools.includes(filters.tool))&&
    (!filters.cuisine||r.cuisine===filters.cuisine)&&(!filters.kcal||nutrition.kcal<=+filters.kcal)&&
    (!filters.protein||nutrition.protein>=+filters.protein)&&(!filters.stock||hasStock(r))&&
    (!filters.compatible||!restrictions.get(r.id)?.length)&&searchMatches(fields,query));
  const menus=breakfastMenus.filter(m=>searchMatches([menuName(m.recipes),m.style],query));
  const total=tab==='早餐搭配'?menus.length:matches.length;
  const setFilter=(patch:Partial<typeof filters>)=>{setFilters({...filters,...patch});setPage(0);};
  function cost(r:Recipe) {
    let sum=0,missing=0;
    for(const i of r.ingredients){
      const row=purchaseFood(i.id,products),p=priceFor(row.purchaseIngredientId,prices,pantry[row.purchaseIngredientId]),rate=edibleRate(p);
      const value=row.rate&&rate?amountFor(rawNetGrams(i.grams,row.rate)/rate,p):null;
      if(value===null)missing++;else sum+=value;
    }
    if(missing===r.ingredients.length)return '份量成本待补充';
    return '份量成本约 ¥'+sum.toFixed(2)+(missing?'（部分价格待补）':'');
  }
  return <>
    <div className="page-title"><div><h1>食谱大全</h1><p>{baseRecipeList.length} 道基础菜谱 · {breakfastMenus.length} 套早餐搭配</p></div><button onClick={back}>返回我的</button></div>
    <div className="segmented">{['全部菜谱','早餐搭配','收藏','已屏蔽'].map(t=><button aria-pressed={tab===t} key={t} onClick={()=>{setTab(t);setPage(0);}}>{t}</button>)}</div>
    <section className="card">
      <label className="field">搜索菜谱<input type="search" placeholder="菜名、食材、拼音" value={query} onChange={e=>{setQuery(e.target.value);setPage(0);}}/></label>
      {tab!=='早餐搭配'&&<><div className="taxonomy-tabs"><button aria-pressed={!group} onClick={()=>{setGroup('');setPage(0);}}>查看全部</button>
        {recipeGroups.map(g=><button aria-pressed={group===g} key={g} onClick={()=>{setGroup(g);setPage(0);}}>{g} <small>{index.filter(r=>r.base&&r.groups.includes(g)).length}</small></button>)}</div>
        <details className="item-fold"><summary>更多筛选</summary><div className="fields">
          {facets.map(f=><label className="field" key={f.key}>{f.name}<select value={filters[f.key]} onChange={e=>setFilter({[f.key]:e.target.value})}>
            <option value="">全部</option>{f.options.map(v=><option key={v}>{v}</option>)}</select></label>)}
          <label className="field">热量上限（千卡）<input type="number" min="0" value={filters.kcal} onChange={e=>setFilter({kcal:e.target.value})}/></label>
          <label className="field">蛋白质下限（克）<input type="number" min="0" value={filters.protein} onChange={e=>setFilter({protein:e.target.value})}/></label>
          <label className="check"><input type="checkbox" checked={filters.stock} onChange={e=>setFilter({stock:e.target.checked})}/>家中库存足够</label>
          <label className="check"><input type="checkbox" checked={filters.compatible} onChange={e=>setFilter({compatible:e.target.checked})}/>只看符合档案的菜谱</label>
        </div></details></>}
    </section>
    {tab==='早餐搭配'?<h2>{total} 套早餐搭配</h2>:<p className="meta">找到 {total} 项</p>}
    {!total&&<Empty title="没有找到菜谱"/>}
    {tab==='早餐搭配'?menus.slice(page*perPage,(page+1)*perPage).map(m=><details className="card item-fold" key={m.id}><summary>{menuName(m.recipes)} · {m.style}</summary>
      {m.recipes.map(id=>{const r=recipeMap.get(id)!;return <details className="item-fold" key={id}><summary>{r.name}</summary><RecipeInfo recipe={r}/></details>;})}
    </details>):matches.slice(page*perPage,(page+1)*perPage).map(({r,groups,meaning,nutrition})=>{
      const reasons=restrictions.get(r.id)??[];
      const active=open===r.id, variants=variantsOf(r).filter(candidate=>candidate.id!==r.id), preparations=fruitPreparations(r);
      return <details className="card item-fold recipe-card" key={r.id} open={active} onToggle={e=>{
        if(e.currentTarget.open&&open!==r.id){setOpen(r.id);setSlot('');}
        else if(!e.currentTarget.open&&open===r.id)setOpen('');
      }}><summary><span><strong>{r.name}</strong><small>{groups.join('、')} · {Math.round(nutrition.kcal)} 千卡 · 蛋白质 {decimal(nutrition.protein)} 克
        {reasons.length?' · '+reasons.join('、'):''}</small></span></summary>
        {active&&<><RecipeInfo recipe={r} products={products}/><p className="meta">{cost(r)} · {hasStock(r)?'家中库存足够':'按实际食谱计算补购'}</p>
          {preparations.length>0&&<p className="meta">同水果的其他处理方式 {preparations.map(r=>r.name).join('、')}</p>}
          {variants.length>0&&<p className="meta">已审核配方变体 {variants.map(v=>v.replacements?.map(n=>food(n.to).name).join('＋')).join('、')}</p>}
          <p className="meta">相关菜谱 {index.filter(v=>v.base&&v.r.id!==r.id&&v.meaning.core.some(id=>meaning.core.includes(id))).slice(0,5).map(v=>v.r.name).join('、')||'暂无'}</p>
          <div className="actions"><button onClick={()=>toggleFavorite(r.id)}>{favorites.includes(r.id)?'取消收藏':'收藏菜谱'}</button>
            <button onClick={()=>toggleBlocked(r.id)}>{blocked.includes(r.id)?'解除屏蔽':'屏蔽菜品'}</button>
            <button disabled={!profile||Boolean(reasons.length)} onClick={()=>required(r)}>{profile?.requiredDish===r.id?'取消本周必选':'设为本周必选'}</button></div>
          {slots(r).length>0&&<div className="actions"><label className="field">加入未执行食谱<select value={slot} onChange={e=>setSlot(e.target.value)}>
            <option value="">选择餐次</option>{slots(r).map(x=><option key={x.key} value={x.key}>{x.label}</option>)}</select></label>
            <button disabled={!slot||busy||Boolean(reasons.length)} onClick={()=>add(r,slot)}>校验并加入</button></div>}
        </>}
      </details>;
    })}
    <CatalogPaging total={total} page={page} size={perPage} change={n=>{setOpen('');setPage(n);}}/>
  </>;
}
