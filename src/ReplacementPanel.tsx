import {SearchField,Segment,Sheet} from './design';
import {Fragment,useMemo,useState} from 'react';
import {food,recipeMap,serving,type Serving} from './catalog';
import {searchMatches} from './catalog-search';
import {recipeCooking} from './cooking';
import {mealConflict} from './food-semantics';
import type {PoolSettings} from './ingredient-pool';
import {labels,pairingOk} from './meal-catalog';
import {recipeRestrictions,replacementMatches,replacementRestrictions,type Change} from './planner';
import {amountFor,edibleRate,priceFor,type PriceBook} from './prices';
import type {MealName,Profile} from './profile';
import {purchaseFood,rawNetGrams,type PurchaseOptions} from './purchase-food';
import {decimal} from './ui';

const pageSize=12;
const tiers=['当前库存可满足','本周已使用','需要新增采购','查看不符合条件'] as const;
type Props={current:Serving;other:Serving[];profile:Profile;meal:MealName;settings?:PoolSettings;used:Set<string>;
  stock:ReadonlyMap<string,number>;products?:PurchaseOptions;blocked:string[];prices?:PriceBook;busy:boolean;initialMode?:Change['swapMode'];
  apply:(change:Pick<Change,'replacement'|'swapMode'|'expandPool'|'weekFruit'>)=>void;close:()=>void};
export function ReplacementPanel({current,other,profile,meal,settings,used,stock,products,blocked,prices,busy,initialMode,apply,close}:Props) {
  const [swapMode,setMode]=useState<NonNullable<Change['swapMode']>>(initialMode??'换食材');
  const [query,setQuery]=useState(''),[tier,setTier]=useState(''),[method,setMethod]=useState(''),[page,setPage]=useState(0);
  const [weekFruit,setWeekFruit]=useState(false),[tried,setTried]=useState<string[]>([]);
  const fruit=current.recipe.group==='水果';
  const rows=useMemo(()=>{
    const candidates=[...recipeMap.values()];
    return candidates.filter(r=>replacementMatches(current.recipe,r,swapMode)).map(recipe=>{
      const restrictions=replacementRestrictions(current.recipe,recipe,profile,meal,
        fruit&&swapMode==='换食材'&&settings?.fruitPolicy==='每周固定一种'?{...settings,fruitId:recipe.ingredients[0].id}:settings,products);
      const recipes=[...other.map(row=>row.recipe),recipe];
      const conflict=mealConflict(recipes);
      const reasons=[...recipeRestrictions(recipe,profile,blocked,products),...restrictions.reasons];
      if(conflict||!pairingOk(recipes))reasons.push(conflict??'与本餐其他菜品的搭配不符');
      const nominal=serving(recipe,fruit?current.ingredients[0].grams/recipe.ingredients[0].grams:1);
      const needed=new Map<string,number>();
      for(const row of nominal.ingredients) {
        const part=purchaseFood(row.id,products);
        if(part.rate===null){reasons.push('缺少已核对的原材料换算');continue;}
        needed.set(part.purchaseIngredientId,(needed.get(part.purchaseIngredientId)??0)+rawNetGrams(row.grams,part.rate)*Number(profile.people));
      }
      const missing=[...needed].map(([id,grams])=>({id,grams:Math.max(0,grams-(stock.get(id)??0))})).filter(r=>r.grams>.005);
      const rank=!missing.length?0:missing.every(r=>used.has(r.id))?1:2;
      const added=missing.map(({id,grams})=>{
        const price=priceFor(id,prices??{}),rate=edibleRate(price);
        const gross=rate?grams/rate:0;
        const buy=price?.pack&&gross?Math.ceil(gross/price.pack)*price.pack:gross;
        return {id,grams,cost:buy?amountFor(buy,price):null};
      });
      const info=recipeCooking(recipe);
      const fields=[recipe.name,recipe.cuisine,info.method,...recipe.ingredients.flatMap(i=>[food(i.id).name,...food(i.id).aliases])];
      return {recipe,nominal,rank,reasons,strict:restrictions.strict,added,info,fields};
    }).sort((a,b)=>Number(Boolean(a.reasons.length||a.strict))-Number(Boolean(b.reasons.length||b.strict))||a.rank-b.rank);
  },[current,other,profile,meal,settings,used,stock,products,blocked,prices,swapMode,weekFruit,fruit]);
  const available=rows.filter(r=>!r.reasons.length&&!r.strict);
  const result=rows.filter(r=>(tier===tiers[3]?r.reasons.length||r.strict:!r.reasons.length&&!r.strict)&&
    (!tier||tier===tiers[3]||tiers[r.rank]===tier)&&(!method||r.info.method===method)&&searchMatches(r.fields,query));
  function pick(row:typeof rows[number]) {
    if(row.strict&&!confirm('此候选包含严格食材池以外的原料。是否将这些原料加入指定食材？通过营养和采购校验后才保存。'))return;
    setTried([...tried,row.recipe.id]);
    apply({replacement:row.recipe.id,swapMode,expandPool:row.strict,weekFruit});
  }
  const random=result.filter(r=>available.includes(r)&&!tried.includes(r.recipe.id));
  const visible=result.slice(page*pageSize,(page+1)*pageSize);
  const group=(row:typeof rows[number])=>row.reasons.length||row.strict?'不符合当前条件':tiers[row.rank];
  return <Sheet title="智能替换选择" subtitle={current.recipe.name+' · '+meal} close={close}><section className="replacement-panel" aria-label="智能替换选择">
    <Segment label="替换方式" items={['换食材','换做法'] as const} value={swapMode}
      change={mode=>{setMode(mode);setPage(0);setWeekFruit(false);setTried([]);}}/>
    {fruit&&swapMode==='换食材'&&<label className="check-line"><input type="checkbox" checked={weekFruit} onChange={e=>{setWeekFruit(e.target.checked);setPage(0);}}/>更换本周尚未执行的水果</label>}
    <SearchField label="搜索替换候选" placeholder="菜名、食材或拼音" value={query} change={value=>{setQuery(value);setPage(0);}}/>
    <div className="fields">
      <label className="field">候选分组<select value={tier} onChange={e=>{setTier(e.target.value);setPage(0);}}><option value="">全部可选</option>{tiers.map(t=><option key={t}>{t}</option>)}</select></label>
      <label className="field">制作方式<select value={method} onChange={e=>{setMethod(e.target.value);setPage(0);}}><option value="">全部</option>{[...new Set(rows.map(r=>r.info.method))].map(m=><option key={m}>{m}</option>)}</select></label>
    </div>
    <button disabled={busy||!random.length} onClick={()=>{
      const preferred=random.filter(r=>r.rank===random[0]?.rank);
      const row=preferred[Math.floor(Math.random()*preferred.length)];
      if(row)pick(row);
    }}>随机更换</button>
    {!result.length&&<p className="meta">暂无其他符合条件的{swapMode==='换食材'?'核心食材':'做法'}。可清除筛选或查看受限原因。</p>}
    {visible.map((row,index)=><Fragment key={row.recipe.id}>
      {(index===0||group(visible[index-1])!==group(row))&&<h3 className="replacement-group">{group(row)}</h3>}
      <div className="replacement-row">
      <div><strong>{row.recipe.name}</strong><p className="meta">{row.nominal.ingredients.map(i=>food(i.id).name+' '+decimal(i.grams)+' 克').join('、')} · 约 {Math.round(row.nominal.nutrients.kcal)} 千卡/人</p>
        <p className="meta">{row.reasons.length?row.reasons.join('、'):row.strict?'严格食材池外，需确认调整':''}
        {!row.reasons.length&&row.added.length>0&&'本餐净重缺口 '+row.added.map(i=>food(i.id).name+' '+decimal(i.grams)+' 克'+(i.cost===null?'（价格待补）':'（约 ¥'+i.cost.toFixed(2)+'）')).join('、')}</p>
      </div>
      {!row.reasons.length&&<button className="small" disabled={busy} onClick={()=>pick(row)}>{row.strict?'确认加入并替换':'选择此项'}</button>}
    </div></Fragment>)}
    {result.length>pageSize&&<div className="actions"><button disabled={page===0} onClick={()=>setPage(page-1)}>上一页</button>
      <span className="meta">第 {page+1} / {Math.ceil(result.length/pageSize)} 页</span><button disabled={(page+1)*pageSize>=result.length} onClick={()=>setPage(page+1)}>下一页</button></div>}
  </section></Sheet>;
}
