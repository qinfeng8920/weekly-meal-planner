import {customDeficitLimit} from './nutrition';
import {deficitModes,type DeficitPreference} from './profile';

const labels:Record<DeficitPreference['mode'],string>={
  系统推荐:'系统推荐',维持体重:'维持体重（0 千卡）',缓慢减脂:'缓慢减脂',适中减脂:'适中减脂',缓慢增重:'缓慢增重',适中增重:'适中增重',自定义:'自定义',
};
export const usesExplicitDeficit=(value:DeficitPreference)=>value.mode==='缓慢减脂'||value.mode==='适中减脂'||value.mode==='自定义'&&(value.standard??0)>0;

export function DeficitChoice({value,onChange,gain=false}:{value:DeficitPreference;onChange:(value:DeficitPreference)=>void;gain?:boolean}) {
  const options=deficitModes.filter(mode=>!mode.endsWith(gain?'减脂':'增重'));
  return <>
    <label className="field">{gain?'热量盈余设置':'标准热量缺口'}<select value={options.includes(value.mode)?value.mode:'系统推荐'}
      onChange={e=>onChange({...value,curve:'percent',mode:e.target.value as DeficitPreference['mode']})}>
      {options.map(mode=><option key={mode} value={mode}>{labels[mode]}</option>)}
    </select></label>
    {!value.curve&&usesExplicitDeficit(value)&&value.mode!=='自定义'&&<div>
      <p className="meta">已保留旧版 {value.mode==='缓慢减脂'?300:400} 千卡选择，实际值受新版上限限制。</p>
      <button type="button" className="small" onClick={()=>onChange({...value,curve:'percent'})}>采用新版百分比</button>
    </div>}
    {value.mode==='自定义'&&<>
      <label className="field">调整单位<select value={value.unit??'千卡'} onChange={e=>onChange({...value,standard:undefined,unit:e.target.value as DeficitPreference['unit']})}>
        <option>千卡</option><option>百分比</option></select></label>
      <label className="field">自定义{gain?'热量盈余':'标准缺口'}（{value.unit??'千卡'}）<input type="number" min="0" max={value.unit==='百分比'?15:customDeficitLimit} step="any"
        value={value.standard??''} onChange={e=>onChange({...value,standard:e.target.value===''?undefined:Number(e.target.value)})}/></label>
    </>}
  </>;
}

export function NormalDeficitConsent({checked,onChange}:{checked:boolean;onChange:(checked:boolean)=>void}) {
  return <label className="check"><input type="checkbox" checked={checked} onChange={e=>onChange(e.target.checked)}/>
    我主动选择在正常 BMI 时减脂，已核对健康情况及用药，没有需先由专业人员评估的情况</label>;
}
