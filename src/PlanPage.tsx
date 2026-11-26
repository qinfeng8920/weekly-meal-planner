import {useState} from 'react';
import {foodMap,recipeList} from './catalog';
import {sum} from './nutrition';
import {algorithmVersion,dayNutrition,type Change,type Plan,type Lock} from './planner';
import {cookingRule,usesNamedBreakfast,type CookingProfile,type CookingSelection} from './cooking-profile';
import {complexityLabels,mealCooking,recipeCooking} from './cooking';
import {recipeMeaning} from './food-semantics';
import {CookingSettings,ModeOptions} from './CookingSettings';
import {mealPreference,type MealName,type Profile} from './profile';
import {breakfastMenus,fixedBreakfasts,labels,menuName} from './meal-catalog';
import {nutritionReview} from './diet-check';
import {MealSettings} from './MealSettings';
import {PoolOverview} from './PoolPage';
import {dayNames,decimal,Empty,NutritionRow,RecipeInfo,SectionTitle} from './ui';

type Props = {plan:Plan|null;profile:Profile|null;busy:boolean;stale:boolean;day:number;setDay:(n:number)=>void;
  locks:Lock[];favorites:string[]; generate:()=>void;editProfile:()=>void; openHistory:()=>void;
  change:(pos:Change)=>void; lock:(lock:Lock)=>void; favorite:(id:string)=>void;block:(id:string)=>void;
  revise:(day:number,meal:number,dish:number,grams:number[])=>Promise<boolean>;
  save:()=>void; share:(plan:Plan,share:boolean)=>void; exportText:(plan:Plan)=>void;
  temporary?:CookingSelection;setTemporary:(value?:CookingSelection)=>void;saveCooking:(value:CookingProfile)=>Promise<boolean>;
  openPool?:()=>void;keepPool?:()=>void;rules:(fixed:string,required:string)=>void; saveMealSettings:(p:Profile['mealPreferences'])=>Promise<boolean>; seed:string; setSeed:(s:string)=>void; readonly?:boolean};
export function PlanPage(props:Props) {
  const {plan,profile,day,setDay,busy,stale,locks,favorites,generate,editProfile,openHistory,change,lock,favorite,block,revise,save,share,exportText,rules,temporary,setTemporary,saveCooking,saveMealSettings,seed,setSeed,readonly}=props;
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
      {!readonly&&<div className="actions"><button onClick={openHistory}>历史方案</button>{profile&&props.openPool&&<button onClick={props.openPool}>食材池与生成</button>}<button className="primary" disabled={busy}
        onClick={profile?generate:editProfile}>{busy?'正在校验…':profile?(plan?'重生成整周':'生成本周食谱'):'填写档案'}</button></div>}</div>
    {profile&&!readonly&&<details className="card settings" open={undefined}><summary>生成设置</summary><div className="fields">
      <label className="field">本次生成模式<select value={temporary??''} onChange={e=>setTemporary(e.target.value as CookingSelection||undefined)}>
        <option value="">沿用档案</option><ModeOptions/></select></label>
      <label className="field">固定早餐<select value={profile.fixedBreakfast} onChange={e=>rules(e.target.value,profile.requiredDish)}><option value="">随机搭配</option>
        {profile.fixedBreakfast&&!fixedOptions.has(profile.fixedBreakfast)&&<option value={profile.fixedBreakfast}>已保存的旧版早餐设置</option>}
        <optgroup label="固定完整搭配">{breakfastMenus.map(m=><option value={m.id} key={m.id}>{menuName(m.recipes)}</option>)}</optgroup>
        <optgroup label="只固定主食">{fixedBreakfasts.map(r=><option value={r.id} key={r.id}>{r.name}</option>)}</optgroup></select></label>
      <label className="field">本周必须包含<select value={profile.requiredDish} onChange={e=>rules(profile.fixedBreakfast,e.target.value)}><option value="">不指定</option>
        {recipeList.map(r=><option value={r.id} key={r.id}>{r.name}</option>)}</select></label>
      <label className="field">随机种子（选填）<input value={seed} onChange={e=>setSeed(e.target.value)} maxLength={100} placeholder="留空时随机生成"/></label>
    </div></details>}
    {profile&&!readonly&&<CookingSettings key={JSON.stringify(profile.cooking)} initial={profile.cooking} onSave={saveCooking}/>}
    {profile&&!readonly&&<MealSettings key={JSON.stringify(profile.mealPreferences)} profile={profile} onSave={saveMealSettings}/>}
    {!plan&&<Empty title="还没有每周食谱"><p>{profile?'生成后可锁定喜欢的菜、调整份量和查看采购清单。':'先完成档案和健康筛查。'}</p></Empty>}
    {plan&&current&&n&&<>
      {legacy&&<p className="hint">这是用旧版算法生成的食谱。原方案可继续查看，重新生成后将采用新餐次规则。</p>}
      {stale&&!legacy&&<p className="hint" role="status">个人档案、体重或屏蔽设置已更新。当前展示保存时的计划。若要调整，请先生成新方案。</p>}
      {plan.pool&&<PoolOverview pool={plan.pool}/> }
      {plan.pool&&!readonly&&props.keepPool&&<button disabled={busy} onClick={props.keepPool}>保留食材重新生成</button>}
      <div className="day-tabs" aria-label="选择星期">{dayNames.map((name,i)=><button aria-pressed={day===i} key={name}
        onClick={()=>{setDay(i);setOpen('');setGrams(null);}}>{name}</button>)}</div>
      <section className="card"><SectionTitle title={dayNames[day]+'营养'}>{!readonlyOrStale&&<button className="small" disabled={busy} onClick={()=>change({day})}>换一天</button>}</SectionTitle>
        <NutritionRow value={n}/>
        {nutritionReview([current]).some(r=>['低于','高于','数据不全'].some(v=>r.status.includes(v)))&&
          <p className="hint">部分微量营养指标需关注，展开查看。</p>}
        <details><summary>每日微量营养与覆盖</summary><NutrientReview days={[current]}/></details>
        <details><summary>全周日均营养检查</summary><NutrientReview days={plan.days}/></details>
      </section>
      {current.meals.map((meal,mi)=>{
        const name=meal.name as MealName, rule=cookingRule(plan.profile,name,day,plan.cookingOverride);
        const fixedMeal=name==='早餐'?rule.fixedBreakfast:mealPreference(plan.profile,name).fixed;
        const isLocked=locks.some(l=>l.day===day&&l.meal===mi);
        const stats=mealCooking(meal.dishes.map(d=>d.recipe),rule,plan.profile.tools.includes('冰箱'));
        const tools=new Set(meal.dishes.flatMap(d=>d.recipe.tools));
        if(stats.ahead.length) tools.add('冰箱');
        return <section className="card meal-card" key={meal.name}>
        <SectionTitle title={meal.name}>{!readonlyOrStale&&<button className="small" disabled={busy||fixedMeal} onClick={()=>change({day,meal:mi})}>换一餐</button>}</SectionTitle>
        <p className="meta">约 {stats.total} 分钟 · 主动 {stats.active} 分钟 · 等待 {stats.waiting} 分钟 · {complexityLabels[stats.level]}难度 · {stats.count} 项</p>
        <p className="meta">{rule.mode}模式 · {tools.size?'需 '+[...tools].join('、'):'无需厨具'}{stats.onePot?' · 一锅完成':''} · 占全天热量 {Math.round(sum(meal.dishes.map(d=>d.nutrients)).kcal/n.kcal*100)}%{fixedMeal?' · 已固定搭配':''}</p>
        {stats.ahead.length>0?<p className="hint">需提前制作：{stats.ahead.map(a=>a.name+' '+a.minutes+' 分钟、用餐时复热 '+a.reheat+' 分钟').join('；')}。前一天做好并及时冷藏，复热到中心 74°C。</p>:<p className="meta">无需提前备餐</p>}
        {!readonlyOrStale&&<details><summary>调整这餐</summary><div className="actions">
          {(['简单一点','丰富一点','减少一道菜','改成一锅料理'] as const).map(intent=><button key={intent} className="small" disabled={busy||fixedMeal||isLocked} onClick={()=>change({day,meal:mi,intent})}>{intent}</button>)}
        </div></details>}
        <NutritionRow value={sum(meal.dishes.map(d=>d.nutrients))}/>
        {meal.dishes.map((s,di)=>{
          const key=mi+':'+di,locked=locks.some(l=>l.day===day&&l.meal===mi&&l.dish===di),fav=favorites.includes(s.recipe.id);
          const cannotSwap=busy||locked||fixedMeal&&labels(s.recipe).slot!=='水果'||meal.name==='早餐'&&usesNamedBreakfast(plan.profile,day)&&di<(selectedBreakfast?.recipes.length??1);
          return <div className="dish-wrap" key={key}><div className="dish">
            <div><button className="dish-title" aria-expanded={open===key} onClick={()=>{setOpen(open===key?'':key);setGrams(null);}}>{s.recipe.name}</button>
              <div className="meta">{legacy?s.recipe.group:labels(s.recipe).slot} · {decimal(s.ingredients.reduce((total,i)=>total+i.grams,0))} 克 · {Math.round(s.nutrients.kcal)} 千卡 · {s.recipe.prep+s.recipe.cook} 分钟{locked&&!readonly?' · 已锁定':''}</div></div>
            {!readonlyOrStale&&<button className="small" disabled={cannotSwap} onClick={()=>change({day,meal:mi,dish:di})}>换{labels(s.recipe).slot}</button>}</div>
            {open===key&&<><RecipeInfo recipe={s.recipe} value={s}/><DishCooking recipe={s.recipe}/>
              {!readonly&&<div className="actions">
                <button aria-pressed={fav} onClick={()=>favorite(s.recipe.id)}>{fav?'取消收藏':'收藏菜谱'}</button>
                <button onClick={()=>block(s.recipe.id)}>屏蔽菜品</button>
                {!stale&&<><button disabled={cannotSwap} onClick={()=>change({day,meal:mi,dish:di,intent:'更换同类食材'})}>更换同类食材</button>
                  <button aria-pressed={locked} onClick={()=>lock({day,meal:mi,dish:di,serving:s})}>{locked?'解除锁定':'锁定这道菜'}</button>
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

function DishCooking({recipe}:{recipe:(typeof recipeList)[number]}) {
  const c=recipeCooking(recipe), meaning=recipeMeaning(recipe);
  return <p className="meta">{meaning.types.join('、')} · {c.method} · {meaning.functions.join('、')} · 主动 {c.active} 分钟 · 等待 {c.wait} 分钟 ·
    {' '}切配 {['无','基础','较细'][c.cutting]} · 调味 {['无','基础','复合'][c.seasoning]} · {c.steps} 步 · {c.toolCount} 件加热厨具 ·
    {' '}清洁负担 {c.clean<=1?'低':c.clean<=3?'中':'较高'}{c.onePot?' · 单锅工序':''}
    {c.canPrep?` · 可提前做 ${c.prepAhead} 分钟${c.reheat?'，复热 '+c.reheat+' 分钟':''}`:''}</p>;
}
