import {Action,CategoryGlyph,Icon,PageHeader,Sheet,StatusLabel} from './design';
import {ReplacementPanel} from './ReplacementPanel';
import type {PriceBook} from './prices';
import {WithdrawalControl} from './InventoryInputs';
import type {PrepJob} from './logistics';
import type {Execution} from './execution';
import {useEffect,useState} from 'react';
import {foodMap,foodState} from './catalog';
import {algorithmVersion,dayNutrition,executionLocked,type Change,type Plan,type Lock} from './planner';
import {cookingRule,usesNamedBreakfast} from './cooking-profile';
import {dateKey,mealPreference,type MealName,type Profile} from './profile';
import {breakfastMenus,labels} from './meal-catalog';
import {nutritionReview,supplementalReview} from './diet-check';

import {addDays} from './batches';
import type {PurchaseOptions} from './purchase-food';
import type {WeeklyIngredientPool} from './ingredient-pool';
import {PoolOverview} from './PoolPage';
import {dateLabel,decimal,Empty,NutritionRow,RecipeInfo,SectionTitle} from './ui';

type Props = {plan:Plan|null;profile:Profile|null;busy:boolean;stale:boolean;products?:PurchaseOptions;prices?:PriceBook;livePool?:WeeklyIngredientPool;stock?:ReadonlyMap<string,number>;blocked?:string[];day:number;setDay:(n:number)=>void;
  locks:Lock[];favorites:string[]; generate:()=>void;editProfile:()=>void; openHistory:()=>void;
  change:(pos:Change)=>void; lock:(lock:Lock)=>void; favorite:(id:string)=>void;block:(id:string)=>void;
  revise:(day:number,meal:number,dish:number,grams:number[])=>Promise<boolean>;
  save:()=>void; share:(plan:Plan,share:boolean)=>void; exportText:(plan:Plan)=>void;
  updatePlan?:()=>void;currentTargets?:import('./nutrition').Targets|null;targetChanged?:boolean;today?:string;execution?:Execution;mealJobs?:PrepJob[];completeMeal?:(jobs:PrepJob[])=>Promise<boolean>;undoMeal?:(jobs:PrepJob[])=>Promise<boolean>;openPool?:()=>void;keepPool?:()=>void;readonly?:boolean};
export function PlanPage(props:Props) {
  const {plan,profile,day,setDay,busy,stale,locks,favorites,generate,editProfile,openHistory,change,lock,favorite,block,revise,save,share,exportText,readonly,products}=props;
  const [open,setOpen]=useState('');
  const [alternative,setAlternative]=useState<{key:string;mode:Change['swapMode'];recipeId:string}|null>(null);
  const [grams,setGrams]=useState<string[]|null>(null);
  const pool=readonly?plan?.pool:props.livePool??plan?.pool;
  const current=plan?.days[day];
  const n=current?dayNutrition(current):null;
  const edited=alternative&&(()=>{const [meal,dish]=alternative.key.split(':').map(Number);
    return current?.meals[meal]?.dishes[dish]?.recipe.id!==alternative.recipeId;})();
  useEffect(()=>{if(edited){setAlternative(null);setOpen('');}},[edited]);
  const readonlyOrStale=readonly||stale;
  const elapsed=Boolean(plan&&addDays(plan.start,day)<(props.today??dateKey()));
  const hasExecution=Boolean(plan?.days.some((_,i)=>executionLocked(plan,props.execution,i)));
  const dayExecuted=Boolean(plan&&executionLocked(plan,props.execution,day));
  const legacy=plan&&plan.algorithmVersion!==algorithmVersion;
  const selectedBreakfast=breakfastMenus.find(m=>m.id===profile?.fixedBreakfast);
  const dates=plan?plan.days.map((_,i)=>dateLabel(addDays(plan.start,i))):[];
  return <>
    <PageHeader title={readonly?plan?.name??'历史食谱':'每周食谱'} subtitle={plan?`${plan.start} 起 · 七天 · 每人用量`:'查看每日餐次与营养。'}>
      {!readonly&&<div className="actions plan-actions"><Action icon="calendar" onClick={openHistory}>历史方案</Action>
        {profile&&props.openPool&&<Action icon="slider" onClick={props.openPool}>生成设置</Action>}
        <button className={plan?'flat':'primary'} disabled={busy} onClick={profile?hasExecution?props.updatePlan??generate:generate:editProfile}>
          {busy?'正在校验…':profile?(plan?(hasExecution?'重生成未执行餐次':'重生成七天'):'生成七天食谱'):'填写档案'}
        </button></div>}
    </PageHeader>
    {!plan&&<Empty title="还没有每周食谱"><p>{profile?'生成后可锁定喜欢的菜、调整份量和查看采购清单。':'先完成档案和健康筛查。'}</p></Empty>}
    {plan&&current&&n&&<>
      {legacy&&<p className="hint">这是旧版本生成的食谱，保留方案当时的计算目标。</p>}
      {!readonly&&props.targetChanged&&props.currentTargets&&<div className="hint">
        当前建议 {props.currentTargets.kcal} 千卡 · 生成时目标 {plan.targets.kcal} 千卡
        <div><button className="small" disabled={busy} onClick={props.updatePlan??generate}>更新未执行食谱</button></div>
      </div>}
      {readonly&&!props.execution&&<p className="meta">此历史方案未保存执行状态。</p>}
      {stale&&<p className="hint" role="status">个人健康、档案或饮食限制需要重新核对。调整前请更新未执行食谱。</p>}
      <div className="day-tabs" aria-label="选择星期">{dates.map((name,i)=>{
        const today=addDays(plan.start,i)===(props.today??dateKey()),jobs=props.mealJobs?.filter(job=>job.day===i)??[];
        const done=jobs.length>0&&jobs.every(job=>job.key&&props.execution?.tasks?.[job.key]?.eaten);
        const status=today?'今天':done?'已完成':addDays(plan.start,i)<dateKey()?'已过':'待执行';
        return <button aria-pressed={day===i} aria-current={today?'date':undefined} aria-label={name} aria-description={status}
          className={done?'day-done':''} key={name} onClick={()=>{setDay(i);setOpen('');setAlternative(null);setGrams(null);}}>
          <span>{name.split(' ')[0]}</span><b>{name.split(' ')[1]}</b><small>{status}</small></button>;
      })}</div>
      <section className="card plan-nutrition"><SectionTitle title={dates[day]+' 计划营养'}>{!readonlyOrStale&&
        <button className="small flat" disabled={busy||elapsed||dayExecuted} onClick={()=>change({day})}>换一天</button>}</SectionTitle>
        <div className="nutrition-hero"><div className="energy-ring">
          <svg aria-hidden="true" viewBox="0 0 92 92"><circle cx="46" cy="46" r="39"/><circle cx="46" cy="46" r="39" pathLength="100"
            strokeDasharray={Math.min(100,100*n.kcal/plan.targets.kcal)+' 100'} transform="rotate(-90 46 46)"/></svg>
          <div><b>{Math.round(n.kcal)}</b><small>计划千卡</small></div>
        </div><div><p className="meta">生成时目标 {Math.round(plan.targets.kcal)} 千卡</p>
          <p><strong className="unit">{Math.round(n.kcal-plan.targets.kcal)>0?'+':''}{Math.round(n.kcal-plan.targets.kcal)} 千卡</strong><span className="meta"> · 与目标差值</span></p>
          <p className="meta">按食谱用量估算。完成标记和库存取用都不能用来确定实际摄入热量。</p></div></div>
        <NutritionRow value={n} targets={plan.targets}/>
        {nutritionReview([current]).some(r=>['低于','高于','数据不全'].some(v=>r.status.includes(v)))&&
          <p className="hint">部分微量营养指标需关注，展开查看。</p>}
        <details className="item-fold"><summary>每日微量营养与覆盖</summary><NutrientReview days={[current]}/></details>
        <details className="item-fold"><summary>全周日均营养检查</summary><NutrientReview days={plan.days}/></details>
      </section>
      {current.meals.map((meal,mi)=>{
        const name=meal.name as MealName, rule=cookingRule(plan.profile,name,day,plan.cookingOverride);
        const fixedMeal=name==='早餐'?rule.fixedBreakfast:mealPreference(plan.profile,name).fixed;
        const jobs=props.mealJobs?.filter(job=>job.day===day&&job.meal===meal.name)??[];
        const mealExecuted=executionLocked(plan,props.execution,day,mi);
        const eaten=jobs.length>0&&jobs.every(job=>job.key&&props.execution?.tasks?.[job.key]?.eaten);
        return <section className="card meal-card" key={meal.name}>
        <SectionTitle title={meal.name}>{!readonlyOrStale&&<button className="small" disabled={busy||elapsed||fixedMeal||mealExecuted} onClick={()=>change({day,meal:mi})}>换一餐</button>}</SectionTitle>
        {mealExecuted&&<p><StatusLabel tone={eaten?'positive':'neutral'}>{eaten?'本餐已完成':readonly?'有历史执行记录':'已执行的菜品已锁定'}</StatusLabel></p>}
        {fixedMeal&&<p className="meta">已固定搭配</p>}
        {meal.dishes.map((s,di)=>{
          const key=mi+':'+di,locked=locks.some(l=>l.day===day&&l.meal===mi&&l.dish===di),fav=favorites.includes(s.recipe.id);
          const executed=executionLocked(plan,props.execution,day,mi,di);
          const cannotSwap=busy||elapsed||locked||executed||fixedMeal&&labels(s.recipe).slot!=='水果'||meal.name==='早餐'&&usesNamedBreakfast(plan.profile,day)&&di<(selectedBreakfast?.recipes.length??1);
          return <div className="dish-wrap" key={key}><div className="dish">
            <div><button className="dish-title" aria-expanded={open===key} onClick={()=>{setOpen(open===key?'':key);setAlternative(null);setGrams(null);}}>{s.recipe.name}</button>
              <div className="meta">{Math.round(s.nutrients.kcal)} 千卡{!readonly&&(executed?' · 已执行 · 已锁定':locked?' · 已锁定':'')}</div><p className="meta dish-ingredients">{s.ingredients.map(i=>{const f=foodMap.get(i.id);return <span key={i.id}>{f?.name??i.id} <span className="unit">{decimal(i.grams)} 克</span> <small>{f?foodState[f.state]:''}</small></span>;})}</p></div>
            {!readonlyOrStale&&<button className="small" disabled={cannotSwap} onClick={()=>setAlternative(alternative?.key===key?null:{key,mode:'换食材',recipeId:s.recipe.id})}>换{labels(s.recipe).slot}</button>}</div>
            {open===key&&<Sheet kind="detail" title={s.recipe.name} subtitle={meal.name+' · 配方与做法'} close={()=>{setOpen('');setGrams(null);}}><RecipeInfo recipe={s.recipe} value={s} products={readonly?undefined:products??{}}/>
              {s.recipe.replacements?.map(row=><p className="meta" key={row.from}>{foodMap.get(row.from)?.name} → {foodMap.get(row.to)?.name} · 已按实际配方计算</p>)}
              {!readonly&&<div className="actions">
                <button aria-pressed={fav} onClick={()=>favorite(s.recipe.id)}>{fav?'取消收藏':'收藏菜谱'}</button>
                {!stale&&<><button disabled={cannotSwap} onClick={()=>setAlternative(alternative?.key===key?null:{key,mode:'换做法',recipeId:s.recipe.id})}>换做法</button>
                  <button disabled={executed} aria-pressed={locked} onClick={()=>lock({day,meal:mi,dish:di,serving:s})}>{locked?'解除锁定':'锁定这道菜'}</button>
                  <button disabled={locked||executed} onClick={()=>setGrams(grams?null:s.ingredients.map(i=>String(i.grams)))}>调整克数</button></>}
              </div>}
              {!readonly&&<details className="item-fold"><summary>更多菜品操作</summary><button onClick={()=>block(s.recipe.id)}>屏蔽菜品</button></details>}
              {grams&&!executed&&<div className="hint"><div className="fields">{s.ingredients.map((i,index)=><label className="field" key={i.id}>{foodMap.get(i.id)?.name??i.id}（克）
                <input type="number" step=".01" value={grams[index]} onChange={e=>setGrams(grams.map((g,j)=>j===index?e.target.value:g))}/></label>)}</div>
                <button className="primary" onClick={()=>void revise(day,mi,di,grams.map(Number)).then(ok=>{if(ok)setGrams(null);})}>验证并应用</button></div>}
            </Sheet>}
            {alternative?.key===key&&!readonlyOrStale&&profile&&<ReplacementPanel key={key+s.recipe.id+alternative.mode}
              current={s} other={meal.dishes.filter((_,i)=>i!==di)} profile={profile} meal={name} settings={pool?.settings}
              used={new Set(pool?.used.map(i=>i.id))} stock={props.stock??new Map()} blocked={props.blocked??[]} prices={props.prices}
              products={products} busy={busy} initialMode={alternative.mode} apply={value=>change({day,meal:mi,dish:di,...value})}
              close={()=>setAlternative(null)}/>}
          </div>;
        })}
        {!readonly&&jobs.length>0&&props.completeMeal&&(eaten?<div className="actions">{props.undoMeal&&
          <button className="small flat" onClick={()=>{if(confirm('撤销本餐完成标记？已取用食材继续保留在库存流水。'))void props.undoMeal?.(jobs);}}>撤销完成标记</button>}</div>:
          <WithdrawalControl key={day+meal.name} label="完成本餐" jobs={jobs} tasks={props.execution?.tasks} execute={props.completeMeal}/>)}
      </section>;})}
      {pool&&<details className="card"><summary>本周食材池</summary><PoolOverview pool={pool}>{!readonly&&props.keepPool&&<button disabled={busy} onClick={props.keepPool}>沿用食材</button>}</PoolOverview></details>}
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
  </li>)}
    {supplementalReview(days).map(row=><li key={row.label}>
      <span>{row.label} <small>已覆盖 {row.known}/{row.items} 项用料</small></span>
      <strong>{row.value===null?'部分食材缺值':decimal(row.value)+' '+row.unit}</strong>
    </li>)}</ul><p className="meta">按食材表估算。全周参考结果需要每天的数据完整。</p></>;
}
