import {Action,CategoryGlyph,Icon,Progress} from './design';
import {DeficitChoice,NormalDeficitConsent,usesExplicitDeficit} from './DeficitFields';
import {useState, type ReactNode} from 'react';
import {allergens, conditions, cuisines, equipment, initialProfile, screening, type Profile} from './profile';
import {foods} from './catalog';
import {foodClass} from './catalog-taxonomy';
import {searchMatches} from './catalog-search';
import {between,customDeficitLimit} from './nutrition';

type TextKey = {[K in keyof Profile]-?:Profile[K] extends string?K:never}[keyof Profile];
type ArrayKey = {[K in keyof Profile]-?:Profile[K] extends string[]?K:never}[keyof Profile];
type BoolKey = {[K in keyof Profile]-?:Profile[K] extends boolean?K:never}[keyof Profile];
const titles=['身体信息','生活与运动','健康筛查','饮食偏好','厨房条件','采购与用餐'];
const preferences: [ArrayKey,string,string[]][] = [
  ['protein','蛋白质',['鸡胸肉','鸡腿肉','牛肉','猪肉','鱼肉','虾','鸡蛋','豆腐','牛奶','无糖酸奶']],
  ['starch','主食',['米饭','糙米杂粮饭','燕麦','红薯','土豆','玉米','面条','馒头','全麦面包']],
  ...([['vegetables','蔬菜','蔬菜'],['fruits','水果','水果'],['nuts','坚果与种子','坚果种子'],['seasonings','调味品','调味品']] as const)
    .map(([key,label,category]): [ArrayKey,string,string[]]=>[key,label,foods.filter(f=>
      f.category===category&&(key!=='vegetables'||foodClass(f).group!=='调味料')).map(f=>f.name)]),
];
export function ProfileForm({value,hasWeightLog,onSave,onCancel}:{value:Profile|null;hasWeightLog?:boolean;onSave:(p:Profile)=>Promise<boolean>;onCancel:()=>void}) {
  const [p,set]=useState<Profile>(()=>structuredClone(value??initialProfile));
  const [step,setStep]=useState(0);
  const [error,setError]=useState('');
  const [saving,setSaving]=useState(false);
  const [preferenceQuery,setPreferenceQuery]=useState(''),[preferenceLimits,setPreferenceLimits]=useState<Record<string,number>>({});
  function patch<K extends keyof Profile>(key:K,value:Profile[K]) {set(before=>({...before,[key]:value}));setError('');}
  const text=(key:TextKey,label:string,type='text',placeholder='')=><label className="field" key={key}>{label}<input
    type={type} inputMode={type==='number'?'decimal':undefined} step={type==='number'?'any':undefined}
    value={p[key]} placeholder={placeholder} maxLength={200} onChange={e=>patch(key,e.target.value)}/></label>;
  const select=(key:TextKey,label:string,values:string[],labels=values)=><label className="field" key={key}>{label}<select
    value={p[key]} onChange={e=>patch(key,e.target.value)}>{values.map((v,i)=><option key={v} value={v}>{labels[i]}</option>)}</select></label>;
  const check=(key:BoolKey,label:string)=><label className="check"><input type="checkbox" checked={p[key]} onChange={e=>patch(key,e.target.checked)}/>{label}</label>;
  const multi=(key:ArrayKey,label:string,options:string[])=><fieldset className="choices"><legend>{label}</legend><div className="chips">{options.map(option=><label key={option} className={'chip '+(p[key].includes(option)?'selected':'')}>
    <input type="checkbox" checked={p[key].includes(option)} onChange={e=>patch(key,e.target.checked?[...p[key],option]:p[key].filter(s=>s!==option))}/>{option}</label>)}</div></fieldset>;
  const deficit=p.deficit??{mode:'系统推荐' as const};
  const grids=(...fields:ReactNode[])=><div className="fields">{fields}</div>;
  function advance() {
    const age=Number(p.age);
    if (step===0 && (!p.sex || !Number.isInteger(age) || !between(age,1,120) || !between(+p.height,80,250) ||
      !between(+p.weight,15,350) || p.goal==='减脂' && !between(+p.target,15,350) ||
      p.waist && !between(+p.waist,35,250) || p.fat && !between(+p.fat,2,80))) {
      setError('请填全必填项，检查年龄、身高、体重和选填数据。');return;
    }
    if(step===0&&p.goal==='减脂') {
      if(+p.target/(+p.height/100)**2<18.5-1e-9){setError('目标体重对应的 BMI 不能低于 18.5。');return;}
      if(deficit.mode==='自定义'&&(p.deficit?.standard===undefined||!between(p.deficit.standard,0,customDeficitLimit))){
        setError('请输入 0～400 千卡的自定义标准缺口。');return;
      }
    }
    if (step===2 && (!p.screened||!p.allergyChecked)) {setError('完成并确认两项安全筛查后可继续。');return;}
    if (step===3 && p.fruit==='自定义摄入量' && (!p.fruitGrams.trim() || !between(+p.fruitGrams,0,350))) {setError('请输入 0～350 克的水果量。');return;}
    if (step===5) {
      if (!Number.isInteger(+p.people)||!between(+p.people,1,12)||p.budget&&!between(+p.budget,.01,100000)) {setError('人数应为 1～12 的整数，预算可留空。');return;}
      setSaving(true);
      void onSave(p).finally(()=>setSaving(false));
      return;
    }
    setStep(step+1);
    window.scrollTo(0,0);
  }
  return <section className="card form-card">
    <div className="profile-step-heading">
      <div><p className="meta">第 {step+1} 步，共 {titles.length} 步</p><h2>{titles[step]}</h2></div>
      <CategoryGlyph category={['蛋类','水果','蔬菜','豆制品','汤类','主食'][step]}/>
    </div>
    <Progress value={step+1} max={titles.length} label="档案填写进度"/>
    {step===0&&<>{grids(text('name','昵称（选填）','text','怎么称呼你'),select('sex','公式使用的性别',['','女','男'],['请选择','女','男']),
      text('age','年龄（岁）','number'),text('height','身高（厘米）','number'),hasWeightLog?<p className="meta">当前体重由首页称重记录更新。档案仅保留首次输入的备用值。</p>:text('weight','当前体重（千克）','number'),
      select('goal','目标',['减脂','维持体重']),p.goal==='减脂'?text('target','目标体重（千克）','number'):null,p.goal==='减脂'?<DeficitChoice value={deficit} onChange={value=>patch('deficit',value)}/>:null,
      text('waist','腰围（厘米，选填）','number'),text('fat','体脂率（%，选填）','number'))}
      {p.goal==='减脂'&&<p className="meta">正常 BMI 默认维持。明确启用减脂后，实际缺口仍随 BMI、距目标和健康条件缩小。</p>}</>}
    {step===1&&<>{grids(select('activity','日常活动量',['长期久坐','正常通勤','经常站立走动','体力劳动']),text('exerciseCount','每周运动次数','number'),
      text('exerciseType','运动类型'),text('exerciseMinutes','每次运动分钟数','number'),text('wake','起床时间','time'),text('sleep','睡觉时间','time'),
      text('breakfast','早餐时间','time'),text('lunch','午餐时间','time'),text('dinner','晚餐时间','time'))}</>}
    {step===2&&<>
      <p className="hint">请勾选适用项目，并确认已完成筛查。符合医学营养干预条件时，应用会暂停生成。</p>
      {multi('risks','安全筛查',screening)}
      {multi('conditions','健康注意事项',conditions)}
      {text('otherHealth','其他需要专业评估的情况或药物（选填）')}
      {multi('allergens','食物过敏原',allergens)}
      {text('avoid','强制忌口或其他过敏食材，用顿号分隔','text','如葱、芝麻油')}
      {p.goal==='减脂'&&usesExplicitDeficit(deficit)&&
        <NormalDeficitConsent checked={Boolean(deficit.normalOptIn)} onChange={normalOptIn=>patch('deficit',{...deficit,normalOptIn})}/>}
      {check('screened','我已核对年龄、孕哺期、进食障碍及医嘱筛查')}
      {check('allergyChecked','我已核对过敏原与其他强制忌口')}
      {check('fluidLimit','医生要求限水')}
    </>}
    {step===3&&<>
      {multi('cuisines','喜欢的菜系',cuisines)}
      <label className="field">搜索偏好食材<input type="search" value={preferenceQuery} onChange={e=>{
        setPreferenceQuery(e.target.value);setPreferenceLimits({});
      }}/></label>
      {preferences.map(([key,label,options])=>{
        const matches=options.filter(name=>searchMatches([name,...(foods.find(f=>f.name===name)?.aliases??[])],preferenceQuery));
        const limit=preferenceLimits[key]??16;
        return <details className="group-fold" key={key}><summary>{label}{p[key].length?(' · 已选 '+p[key].length):''}</summary>
          {matches.length?multi(key,label,matches.slice(0,limit)):<p className="meta">当前分类没有匹配项。</p>}
          {matches.length>limit&&<button onClick={()=>setPreferenceLimits({...preferenceLimits,[key]:limit+16})}>显示更多{label}</button>}
        </details>;
      })}
      {text('preferred','自定义偏好，用顿号分隔')}
      {grids(select('fruit','水果',['正常摄入','优先低糖水果','自定义摄入量','不吃水果']),
        p.fruit==='自定义摄入量'?text('fruitGrams','每日水果克数','number'):null,
        select('dairy','乳制品',['正常摄入','减少牛奶','不吃乳制品','乳糖不耐受']))}
    </>}
    {step===4&&<>{multi('tools','可用厨具',equipment)}<p className="meta">也请勾选实际可用的冰箱和冷冻室，采购计划会用它们判断能安全保存几天。</p></>}
    {step===5&&<>
      {grids(text('people','用餐人数','number'),select('lunchPlace','午餐地点',['在家','食堂','外卖']),
        select('meals','每日餐次',['2','3','4'],['早午餐和晚餐','三餐','三餐加加餐']))}
      <p className="meta">选好档案后，在「生成设置」统一填写采购次数和备餐周期。</p>
      {check('frozen','接受冷冻食材')}{check('repeats','允许主菜和蔬菜在一周内重复')}{check('packed','需要自带便当')}{check('waste','优先复用食材，减少浪费')}
    </>}
    {error&&<p role="alert" className="error">{error}</p>}
    <div className="actions profile-step-actions">
      {step>0?<button onClick={()=>{setStep(step-1);setError('');window.scrollTo(0,0);}}>上一步</button>:<button onClick={onCancel}>返回</button>}
      <Action icon={step===5?'check':'arrow'} className="primary" disabled={saving} onClick={advance}>{step===5?(saving?'正在保存…':'保存档案'):'继续'}</Action>
    </div>
  </section>;
}
