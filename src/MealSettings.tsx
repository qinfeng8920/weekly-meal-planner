import {Action,Segment} from './design';
import {useState} from 'react';
import {cuisines,mainMeals,mealPreference,type MainMeal,type MealPreference,type Profile} from './profile';

export function MealSettings({profile,onSave}:{profile:Profile;onSave:(p:Profile['mealPreferences'])=>Promise<boolean>}) {
  const [settings,setSettings]=useState<NonNullable<Profile['mealPreferences']>>(()=>({...profile.mealPreferences}));
  const [saving,setSaving]=useState(false),[active,setActive]=useState<MainMeal>('早餐');
  const add=(name:MainMeal,changes:Partial<MealPreference>)=>
    setSettings(prior=>({...prior,[name]:{...(prior[name]??mealPreference(profile,name)),...changes}}));
  const reset=(name:MainMeal)=>setSettings(previous=>{
    const value={...previous};delete value[name];return value;
  });
  return <details className="settings item-fold"><summary>早餐、午餐和晚餐偏好</summary>
    <p className="meta">喜欢的食材会优先选用。本餐不喜欢的食材会排除，过敏和强制忌口继续适用于全天。</p>
    <Segment label="餐次偏好" items={mainMeals} value={active} change={setActive}/>
    {[active].map(name=>{
      const preferences=settings[name]??mealPreference({...profile,mealPreferences:undefined},name);
      return <div className="meal-settings-panel" key={name}>
        <div className="fields">
          <label className="field">喜欢的食材<input value={preferences.likes} onChange={e=>add(name,{likes:e.target.value})} maxLength={200} placeholder="例如：燕麦、鸡蛋"/></label>
          <label className="field">不喜欢的食材<input value={preferences.dislikes} onChange={e=>add(name,{dislikes:e.target.value})} maxLength={200} placeholder="例如：香菜、酸奶"/></label>
        </div>
        <fieldset className="choices"><legend>菜系偏好</legend><div className="chips">{cuisines.map(c=><label className="chip" key={c}>
          <input type="checkbox" checked={preferences.cuisines.includes(c)} onChange={e=>add(name,{cuisines:e.target.checked?[...preferences.cuisines,c]:preferences.cuisines.filter(v=>v!==c)})}/>{c}</label>)}</div></fieldset>
        <label className="check"><input type="checkbox" checked={preferences.repeats} onChange={e=>add(name,{repeats:e.target.checked})}/>允许本餐在一周内重复菜品</label>
        <label className="check"><input type="checkbox" checked={preferences.fixed} onChange={e=>add(name,{fixed:e.target.checked})}/>全周固定主食、主菜和配菜，份量可调整</label>
        <label className="check"><input type="checkbox" checked={preferences.prep} onChange={e=>add(name,{prep:e.target.checked})}/>优先安排可提前备餐的菜品</label>
        {settings[name]&&<button className="small" onClick={()=>reset(name)}>恢复该餐默认</button>}
      </div>;
    })}
    <Action icon="check" className="primary" disabled={saving} onClick={()=>{setSaving(true);void onSave(settings).finally(()=>setSaving(false));}}>保存分餐偏好</Action>
  </details>;
}
