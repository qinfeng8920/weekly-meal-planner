import {customDeficitLimit} from './nutrition';
import {deficitModes,type DeficitPreference} from './profile';

const labels:Record<DeficitPreference['mode'],string>={
  系统推荐:'系统推荐',维持体重:'维持体重（0 千卡）',缓慢减脂:'缓慢减脂（300 千卡）',适中减脂:'适中减脂（400 千卡）',自定义:'自定义',
};
export const usesExplicitDeficit=(value:DeficitPreference)=>value.mode==='缓慢减脂'||value.mode==='适中减脂'||value.mode==='自定义'&&(value.standard??0)>0;

export function DeficitChoice({value,onChange}:{value:DeficitPreference;onChange:(value:DeficitPreference)=>void}) {
  return <>
    <label className="field">标准热量缺口<select value={value.mode}
      onChange={e=>onChange({...value,mode:e.target.value as DeficitPreference['mode']})}>
      {deficitModes.map(mode=><option key={mode} value={mode}>{labels[mode]}</option>)}
    </select></label>
    {value.mode==='自定义'&&<label className="field">自定义标准缺口（千卡）<input type="number" min="0" max={customDeficitLimit} step="any"
      value={value.standard??''} onChange={e=>onChange({...value,standard:e.target.value===''?undefined:Number(e.target.value)})}/></label>}
  </>;
}

export function NormalDeficitConsent({checked,onChange}:{checked:boolean;onChange:(checked:boolean)=>void}) {
  return <label className="check"><input type="checkbox" checked={checked} onChange={e=>onChange(e.target.checked)}/>
    我主动选择在正常 BMI 时减脂，已核对健康情况及用药，没有需先由专业人员评估的情况</label>;
}
