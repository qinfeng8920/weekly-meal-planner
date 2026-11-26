import {useState} from 'react';
import {categoriesOf,foods,foodState,recipeList,recipeMap} from './catalog';
import {breakfastMenus,labels,menuName} from './meal-catalog';
import {decimal,Empty,RecipeInfo,SectionTitle} from './ui';

export function Library({favorites,blocked,toggleFavorite,toggleBlocked}:{favorites:string[];blocked:string[];toggleFavorite:(id:string)=>void;toggleBlocked:(id:string)=>void}) {
  const [query,setQuery]=useState(''),[category,setCategory]=useState('全部'),[tab,setTab]=useState('菜谱'),[limit,setLimit]=useState(18);
  const key=query.trim();
  const list=recipeList.filter(r=>(category==='全部'||labels(r).tags.some(t=>t===category)) &&
    (tab!=='收藏'||favorites.includes(r.id)) && (tab!=='已屏蔽'||blocked.includes(r.id)) &&
    (!key||r.name.includes(key)||r.cuisine.includes(key)||r.flavor.includes(key)));
  const menus=breakfastMenus.filter(m=>!key||menuName(m.recipes).includes(key)||m.style.includes(key));
  const ingredients=foods.filter(f=>!key||[f.name,f.category,...f.aliases].some(s=>s.includes(key)));
  return <>
    <div className="page-title"><div><h1>菜谱库</h1><p>{recipeList.length} 道菜谱 · {foods.length} 种可追溯食材</p></div></div>
    <div className="segmented">{['菜谱','早餐搭配','收藏','已屏蔽','食材'].map(t=><button aria-pressed={t===tab} key={t} onClick={()=>{setTab(t);setLimit(18);}}>{t}</button>)}</div>
    <div className="card fields">
      <label className="field">查找{tab==='食材'?'食材':'菜谱'}<input type="search" value={query} placeholder="输入名称" onChange={e=>{setQuery(e.target.value);setLimit(18);}}/></label>
      {!['食材','早餐搭配'].includes(tab)&&<label className="field">分类<select value={category} onChange={e=>{setCategory(e.target.value);setLimit(18);}}>
        {['全部','早餐','午餐','晚餐','加餐','通用主食','通用配菜'].map(c=><option key={c}>{c}</option>)}</select></label>}
    </div>
    {tab==='早餐搭配'?<section className="card">
      <SectionTitle title={breakfastMenus.length+' 套早餐搭配'}/>
      <p className="meta">查看食材与做法。在「食谱 → 生成设置」可以固定其中一套。</p>
      {menus.length?menus.slice(0,limit).map(m=><details key={m.id}>
        <summary>{menuName(m.recipes)} · {m.style}</summary>
        {m.recipes.map(id=>{const r=recipeMap.get(id)!;return <details key={id}><summary>{r.name}</summary><RecipeInfo recipe={r}/></details>;})}
      </details>):<p>未找到符合条件的早餐搭配。</p>}
    </section>:tab==='食材'?<section className="card"><SectionTitle title="食材营养成分"/>
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
      <summary><span><strong>{r.name}</strong><small>{labels(r).tags.join('、')} · {r.prep+r.cook} 分钟 · {categoriesOf(r).join('、')||r.cuisine}</small></span></summary>
      <RecipeInfo recipe={r}/>
      <div className="actions"><button onClick={()=>toggleFavorite(r.id)}>{favorites.includes(r.id)?'取消收藏':'收藏菜谱'}</button>
        <button onClick={()=>toggleBlocked(r.id)}>{blocked.includes(r.id)?'解除屏蔽':'屏蔽菜品'}</button></div>
    </details>)}</div>:<Empty title="没有找到菜谱"/>}
    {(tab==='食材'?ingredients.length:tab==='早餐搭配'?menus.length:list.length)>limit&&<button onClick={()=>setLimit(limit+18)}>显示更多</button>}
  </>;
}
