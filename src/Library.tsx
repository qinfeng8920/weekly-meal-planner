import {useState} from 'react';
import {categoriesOf,foods,foodState,recipeList} from './catalog';
import {decimal,Empty,RecipeInfo,SectionTitle} from './ui';

export function Library({favorites,blocked,toggleFavorite,toggleBlocked}:{favorites:string[];blocked:string[];toggleFavorite:(id:string)=>void;toggleBlocked:(id:string)=>void}) {
  const [query,setQuery]=useState(''),[category,setCategory]=useState('全部'),[tab,setTab]=useState('菜谱'),[limit,setLimit]=useState(18);
  const key=query.trim();
  const list=recipeList.filter(r=>(category==='全部'||category===r.group) &&
    (tab!=='收藏'||favorites.includes(r.id)) && (tab!=='已屏蔽'||blocked.includes(r.id)) &&
    (!key||r.name.includes(key)||r.cuisine.includes(key)||r.flavor.includes(key)));
  const ingredients=foods.filter(f=>!key||[f.name,f.category,...f.aliases].some(s=>s.includes(key)));
  return <>
    <div className="page-title"><div><h1>菜谱库</h1><p>{recipeList.length} 道菜谱 · {foods.length} 种可追溯食材</p></div></div>
    <div className="segmented">{['菜谱','收藏','已屏蔽','食材'].map(t=><button aria-pressed={t===tab} key={t} onClick={()=>{setTab(t);setLimit(18);}}>{t}</button>)}</div>
    <div className="card fields">
      <label className="field">查找{tab==='食材'?'食材':'菜谱'}<input type="search" value={query} placeholder="输入名称" onChange={e=>{setQuery(e.target.value);setLimit(18);}}/></label>
      {tab!=='食材'&&<label className="field">分类<select value={category} onChange={e=>{setCategory(e.target.value);setLimit(18);}}>
        {['全部','蛋白质菜','汤类','蔬菜','主食','早餐','水果','加餐'].map(c=><option key={c}>{c}</option>)}</select></label>}
    </div>
    {tab==='食材'?<section className="card"><SectionTitle title="食材营养成分"/>
      <p className="meta">每 100 克相应状态的可食部，缺失指标显示未知。</p>
      {!ingredients.length&&<p>未找到相符的食材。</p>}
      {ingredients.slice(0,limit).map(f=><details key={f.id}><summary>{f.name} · {foodState[f.state]}</summary>
        <p className="meta">{f.category} · {f.aliases.join('、')||'无其他索引名'} · 过敏原 {f.allergens.join('、')||'无标注'}</p>
        <p>能量 {f.nutrients.kcal} 千卡 · 蛋白质 {f.nutrients.protein} 克 · 碳水 {f.nutrients.carbs} 克 · 脂肪 {f.nutrients.fat} 克 · 纤维 {f.nutrients.fiber} 克</p>
        <p>钠 {f.nutrients.sodium===null?'未知':decimal(f.nutrients.sodium)+' 毫克'} · 钙 {f.nutrients.calcium===null?'未知':decimal(f.nutrients.calcium)+' 毫克'} · 钾 {f.nutrients.potassium===null?'未知':decimal(f.nutrients.potassium)+' 毫克'} · 维生素 C {f.nutrients.vitaminC===null?'未知':decimal(f.nutrients.vitaminC)+' 毫克'}</p>
        <p className="meta">{f.description} · 可食率和生熟换算未知，使用标注状态称量。</p>
        <a href={`https://fdc.nal.usda.gov/food-details/${f.fdc}/nutrients`} target="_blank" rel="noreferrer">查看 USDA 原始条目</a>
      </details>)}
    </section>:list.length?<div className="library-grid">{list.slice(0,limit).map(r=><details className="card recipe-card" key={r.id}>
      <summary><span><strong>{r.name}</strong><small>{r.group} · {r.prep+r.cook} 分钟 · {categoriesOf(r).join('、')||r.cuisine}</small></span></summary>
      <RecipeInfo recipe={r}/>
      <div className="actions"><button onClick={()=>toggleFavorite(r.id)}>{favorites.includes(r.id)?'取消收藏':'收藏菜谱'}</button>
        <button onClick={()=>toggleBlocked(r.id)}>{blocked.includes(r.id)?'解除屏蔽':'屏蔽菜品'}</button></div>
    </details>)}</div>:<Empty title="没有找到菜谱"/>}
    {(tab==='食材'?ingredients.length:list.length)>limit&&<button onClick={()=>setLimit(limit+18)}>显示更多</button>}
  </>;
}
