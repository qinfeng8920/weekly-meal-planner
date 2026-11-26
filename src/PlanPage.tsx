import {useState} from 'react';
import {foodMap,recipeList} from './catalog';
import {sum} from './nutrition';
import {algorithmVersion,dayNutrition,type Plan,type Lock} from './planner';
import {mealMinutes} from './shopping';
import {mealPreference,type MealName,type Profile} from './profile';
import {breakfastMenus,fixedBreakfasts,labels,menuName} from './meal-catalog';
import {nutritionReview} from './diet-check';
import {MealSettings} from './MealSettings';
import {dayNames,decimal,Empty,NutritionRow,RecipeInfo,SectionTitle} from './ui';

type Pos = {day:number;meal?:number;dish?:number};
type Props = {plan:Plan|null;profile:Profile|null;busy:boolean;stale:boolean;day:number;setDay:(n:number)=>void;
  locks:Lock[];favorites:string[]; generate:()=>void;editProfile:()=>void; openHistory:()=>void;
  change:(pos:Pos)=>void; lock:(lock:Lock)=>void; favorite:(id:string)=>void;block:(id:string)=>void;
  revise:(day:number,meal:number,dish:number,grams:number[])=>Promise<boolean>;
  save:()=>void; share:(plan:Plan,share:boolean)=>void; exportText:(plan:Plan)=>void;
  rules:(fixed:string,required:string)=>void; saveMealSettings:(p:Profile['mealPreferences'])=>Promise<boolean>; seed:string; setSeed:(s:string)=>void; readonly?:boolean};
export function PlanPage(props:Props) {
  const {plan,profile,day,setDay,busy,stale,locks,favorites,generate,editProfile,openHistory,change,lock,favorite,block,revise,save,share,exportText,rules,saveMealSettings,seed,setSeed,readonly}=props;
  const [open,setOpen]=useState('');
  const [grams,setGrams]=useState<string[]|null>(null);
  const current=plan?.days[day];
  const n=current?dayNutrition(current):null;
  const readonlyOrStale=readonly||stale;
  const legacy=plan&&plan.algorithmVersion!==algorithmVersion;
  const selectedBreakfast=breakfastMenus.find(m=>m.id===profile?.fixedBreakfast);
  const fixedOptions=new Set([...fixedBreakfasts.map(r=>r.id),...breakfastMenus.map(m=>m.id)]);
  return <>
    <div className="page-title"><div><h1>{readonly?plan?.name:'每周食谱'}</h1>
      <p>{plan?`${plan.start} 起 · 七天 · 单人营养估算`:'按天查看搭配、食材用量和做法。'}</p></div>
      {!readonly&&<div className="actions"><button onClick={openHistory}>历史方案</button><button className="primary" disabled={busy}
        onClick={profile?generate:editProfile}>{busy?'正在校验…':profile?(plan?'重生成整周':'生成本周食谱'):'填写档案'}</button></div>}</div>
    {profile&&!readonly&&<details className="card settings" open={undefined}><summary>生成设置</summary><div className="fields">
      <label className="field">固定早餐<select value={profile.fixedBreakfast} onChange={e=>rules(e.target.value,profile.requiredDish)}><option value="">随机搭配</option>
        {profile.fixedBreakfast&&!fixedOptions.has(profile.fixedBreakfast)&&<option value={profile.fixedBreakfast}>已保存的旧版早餐设置</option>}
        <optgroup label="固定完整搭配">{breakfastMenus.map(m=><option value={m.id} key={m.id}>{menuName(m.recipes)}</option>)}</optgroup>
        <optgroup label="只固定主食">{fixedBreakfasts.map(r=><option value={r.id} key={r.id}>{r.name}</option>)}</optgroup></select></label>
      <label className="field">本周必须包含<select value={profile.requiredDish} onChange={e=>rules(profile.fixedBreakfast,e.target.value)}><option value="">不指定</option>
        {recipeList.map(r=><option value={r.id} key={r.id}>{r.name}</option>)}</select></label>
      <label className="field">随机种子（选填）<input value={seed} onChange={e=>setSeed(e.target.value)} maxLength={100} placeholder="留空时随机生成"/></label>
    </div></details>}
    {profile&&!readonly&&<MealSettings key={JSON.stringify(profile.mealPreferences)} profile={profile} onSave={saveMealSettings}/>}
    {!plan&&<Empty title="还没有每周食谱"><p>{profile?'生成后可锁定喜欢的菜、调整份量和查看采购清单。':'先完成档案和健康筛查。'}</p></Empty>}
    {plan&&current&&n&&<>
      {legacy&&<p className="hint">这是用旧版算法生成的食谱。原方案可继续查看，重新生成后将采用新餐次规则。</p>}
      {stale&&!legacy&&<p className="hint" role="status">个人档案、体重或屏蔽设置已更新。当前展示保存时的计划。若要调整，请先生成新方案。</p>}
      <div className="day-tabs" aria-label="选择星期">{dayNames.map((name,i)=><button aria-pressed={day===i} key={name}
        onClick={()=>{setDay(i);setOpen('');setGrams(null);}}>{name}</button>)}</div>
      <section className="card"><SectionTitle title={dayNames[day]+'营养'}>{!readonlyOrStale&&<button className="small" disabled={busy} onClick={()=>change({day})}>换一天</button>}</SectionTitle>
        <NutritionRow value={n}/>
        <NutrientReview days={[current]}/>
        <details><summary>全周日均营养检查</summary><NutrientReview days={plan.days}/></details>
      </section>
      {current.meals.map((meal,mi)=>{
        const fixedMeal=Boolean(profile&&mealPreference(profile,meal.name as MealName).fixed);
        return <section className="card meal-card" key={meal.name}>
        <SectionTitle title={meal.name}>{!readonlyOrStale&&<button className="small" disabled={busy||fixedMeal} onClick={()=>change({day,meal:mi})}>换一餐</button>}</SectionTitle>
        <p className="meta">约 {mealMinutes(meal)} 分钟，· 占全天热量 {Math.round(sum(meal.dishes.map(d=>d.nutrients)).kcal/n.kcal*100)}%{fixedMeal?' · 已固定搭配':''}</p><NutritionRow value={sum(meal.dishes.map(d=>d.nutrients))}/>
        {meal.dishes.map((s,di)=>{
          const key=mi+':'+di,locked=locks.some(l=>l.day===day&&l.meal===mi&&l.dish===di),fav=favorites.includes(s.recipe.id);
          return <div className="dish-wrap" key={key}><div className="dish">
            <div><button className="dish-title" aria-expanded={open===key} onClick={()=>{setOpen(open===key?'':key);setGrams(null);}}>{s.recipe.name}</button>
              <div className="meta">{legacy?s.recipe.group:labels(s.recipe).slot} · {s.recipe.prep+s.recipe.cook} 分钟{locked&&!readonly?' · 已锁定':''}</div></div>
            {!readonlyOrStale&&<button className="small" disabled={busy||locked||fixedMeal&&labels(s.recipe).slot!=='水果'||meal.name==='早餐'&&Boolean(profile?.fixedBreakfast)&&di<(selectedBreakfast?.recipes.length??1)} onClick={()=>change({day,meal:mi,dish:di})}>换{labels(s.recipe).slot}</button>}</div>
            {open===key&&<><RecipeInfo recipe={s.recipe} value={s}/>
              {!readonly&&<div className="actions">
                <button aria-pressed={fav} onClick={()=>favorite(s.recipe.id)}>{fav?'取消收藏':'收藏菜谱'}</button>
                <button onClick={()=>block(s.recipe.id)}>屏蔽菜品</button>
                {!stale&&<><button aria-pressed={locked} onClick={()=>lock({day,meal:mi,dish:di,serving:s})}>{locked?'解除锁定':'锁定这道菜'}</button>
                  <button disabled={locked} onClick={()=>setGrams(grams?null:s.ingredients.map(i=>String(i.grams)))}>调整克数</button></>}
              </div>}
              {grams&&<div className="hint"><div className="fields">{s.ingredients.map((i,index)=><label className="field" key={i.id}>{foodMap.get(i.id)?.name??i.id}（克）
                <input type="number" step=".01" value={grams[index]} onChange={e=>setGrams(grams.map((g,j)=>j===index?e.target.value:g))}/></label>)}</div>
                <button className="primary" onClick={()=>void revise(day,mi,di,grams.map(Number)).then(ok=>{if(ok)setGrams(null);})}>验证并应用</button></div>}
            </>}
          </div>;
        })}
      </section>;})}
      <section className="card"><p className="meta">随机种子 {plan.seed} · 算法 {plan.algorithmVersion} · 菜谱库 {plan.catalogVersion}</p>
      <div className="actions">
        {!readonly&&<button className="primary" onClick={save}>保存到历史</button>}
        <button onClick={()=>share(plan,false)}>复制食谱</button><button onClick={()=>share(plan,true)}>分享食谱</button>
        <button onClick={()=>exportText(plan)}>下载食谱文本</button>
      </div></section>
    </>}
  </>;
}

function NutrientReview({days}:{days:Plan['days']}) {
  return <><ul className="ingredients">{nutritionReview(days).map(row=><li key={row.key}>
    <span>{row.label} <small>{row.max?'参考上限':'参考值'} {row.goal} {row.unit}</small></span>
    <strong>{row.value===null?(days.length>1?row.missing+' 天数据不全':'部分食材缺值'):`${decimal(row.value)} ${row.unit} · ${row.status}`}</strong>
  </li>)}</ul><p className="meta">按食材表估算。全周参考结果需要每天的数据完整。</p></>;
}
