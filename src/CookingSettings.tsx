import {useState} from 'react';
import {cookingDefaults,cookingDuration,cookingModes,cookingNames,type CookingOverride,type CookingProfile,type CookingSelection} from './cooking-profile';
import {mainMeals,type MainMeal} from './profile';

export const modeOptions=[...cookingModes,'混合'] as const;
export function ModeOptions({mixed=true}:{mixed?:boolean}) {
  return <>{(mixed?modeOptions:cookingModes).map(mode=><option key={mode} value={mode}>
    {mode==='混合'?'混合 · 按日期':mode+' · 优先 '+cookingDuration[mode].join('～')+' 分钟'}
  </option>)}</>;
}

export function CookingEditor({value,onChange,overrides=true}:{value:CookingProfile;onChange:(p:CookingProfile)=>void;overrides?:boolean}) {
  const [scope,setScope]=useState('meals');
  const [meal,setMeal]=useState<MainMeal>('午餐');
  const current=(scope==='meals'?value.meals:value.days?.[scope])?.[meal]??{};
  function patch<K extends keyof CookingOverride>(key:K,setting:CookingOverride[K]) {
    const next={...current,[key]:setting};
    if(scope==='meals') onChange({...value,meals:{...value.meals,[meal]:next}});
    else onChange({...value,days:{...value.days,[scope]:{...value.days?.[scope],[meal]:next}}});
  }
  function reset() {
    const meals={...(scope==='meals'?value.meals:value.days?.[scope])};
    delete meals[meal];
    if(scope==='meals') onChange({...value,meals});
    else onChange({...value,days:{...value.days,[scope]:meals}});
  }
  const numberField=(key:'total'|'active'|'maxDishes',title:string,values:number[],unit:string)=>
    <label className="field">{title}<select value={current[key]??''} onChange={e=>patch(key,e.target.value?Number(e.target.value):undefined)}>
      <option value="">沿用默认</option>{values.map(n=><option value={n} key={n}>{n} {unit}</option>)}</select></label>;
  const choice=(key:'prep'|'onePot'|'fixedBreakfast',title:string)=><label className="field">{title}
    <select value={current[key]===undefined?'':String(current[key])} onChange={e=>patch(key,e.target.value?e.target.value==='true':undefined)}>
      <option value="">沿用默认</option><option value="true">是</option><option value="false">否</option>
    </select></label>;
  return <>
    <div className="fields">
      <label className="field">默认烹饪模式<select value={value.mode} onChange={e=>onChange({...value,mode:e.target.value as CookingSelection})}><ModeOptions/></select></label>
      {value.mode==='混合'&&<>
        <label className="field">工作日模式<select value={value.weekday} onChange={e=>onChange({...value,weekday:e.target.value as CookingProfile['weekday']})}><ModeOptions mixed={false}/></select></label>
        <label className="field">周末模式<select value={value.weekend} onChange={e=>onChange({...value,weekend:e.target.value as CookingProfile['weekend']})}><ModeOptions mixed={false}/></select></label>
      </>}
    </div>
    {overrides&&<>
      <p className="meta">单日设置优先于同餐通用设置，最后使用默认模式。允许备餐时，有冷藏条件的菜品可在前一天制作。</p>
      <div className="fields">
        <label className="field">应用日期<select value={scope} onChange={e=>setScope(e.target.value)}><option value="meals">每天同一餐次</option>
          {cookingNames.map((day,i)=><option key={day} value={i}>{day}</option>)}</select></label>
        <label className="field">餐次<select value={meal} onChange={e=>setMeal(e.target.value as MainMeal)}>{mainMeals.map(name=><option key={name}>{name}</option>)}</select></label>
        <label className="field">该餐烹饪模式<select value={current.mode??''} onChange={e=>patch('mode',e.target.value as CookingOverride['mode']||undefined)}><option value="">沿用默认</option><ModeOptions mixed={false}/></select></label>
        {numberField('total','最长总制作时间',[5,8,10,15,20,25,30,40,50,60,90,120,180],'分钟')}
        {numberField('active','最长主动操作时间',[3,5,8,10,12,15,20,25,30,40,60,90,120],'分钟')}
        {numberField('maxDishes','最大菜品数量',[1,2,3,4,5,6],'项')}
        {choice('prep','允许提前备餐')}{choice('onePot','优先一锅完成')}{meal==='早餐'&&choice('fixedBreakfast','固定早餐搭配')}
      </div>
      {Object.keys(current).length>0&&<button className="small" type="button" onClick={reset}>恢复这项覆盖</button>}
    </>}
  </>;
}

export function CookingSettings({initial,onSave}:{initial:CookingProfile|undefined;onSave:(settings:CookingProfile)=>Promise<boolean>}) {
  const [value,setValue]=useState(initial??cookingDefaults),[busy,setBusy]=useState(false);
  return <details className="card settings"><summary>烹饪模式与分日设置</summary>
    <CookingEditor value={value} onChange={setValue}/>
    <div className="actions"><button className="primary" disabled={busy} onClick={()=>{
      setBusy(true);void onSave(value).finally(()=>setBusy(false));
    }}>保存烹饪设置</button></div>
  </details>;
}
