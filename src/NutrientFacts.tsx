import {dailyNutritionAlerts,ingredientNutrition} from './nutrient-report';
import {formatNutrient as fmt,nutrientGroups} from './nutrient-catalog';
import {driUrl,olderDriUrl,generalDriApplicable,type NutrientReference} from './nutrient-reference';
import type {NutritionIngredient} from './nutrient-report-input';
import {retentionSource} from './nutrient-retention';
import type {Profile} from './profile';
import type {Targets} from './nutrition';

export function NutrientFacts({ingredients,days=1,perDay,profile,targets,daily=true}:{
  ingredients:NutritionIngredient[];days?:number;perDay?:{label:string;ingredients:NutritionIngredient[]}[];
  profile?:Profile|null;targets?:Targets;daily?:boolean}){
  const rows=ingredientNutrition(ingredients,days,profile??undefined,targets);
  const alerts=perDay?dailyNutritionAlerts(perDay,profile??undefined,targets):undefined;
  return <div className="nutrient-facts">
    <p className="meta">{daily?'按计划用量和原料称量状态估算。':'单人本份用量。以下参考值以全天为单位。'}覆盖率按已知数据的用料克重计算。</p>
    {alerts&&<details className="item-fold nutrient-group" open={alerts.length>0}>
      <summary>单日异常 · {alerts.length} / {days} 天</summary>
      {alerts.length?<ul className="ingredients">{alerts.map(({label,issues})=><li key={label}><div><strong>{label}</strong>
        {issues.map(row=><p key={row.key} className="meta">{row.label} · {fmt(row.known!)} {row.unit} · {row.status}</p>)}</div></li>)}</ul>:
        <p className="meta">已知计划用量中暂无可判断的单日异常。各项缺值见明细。</p>}
    </details>}
    {nutrientGroups.map(group=><details key={group.name} className="item-fold nutrient-group">
      <summary>{group.name} · {group.keys.length} 项</summary>
      <dl className="nutrient-evaluation">{rows.filter(row=>group.keys.includes(row.key)).map(({key,label,unit,known,complete,
        coverage,missing,estimates,retained,bounded,ref,status})=><div key={key}>
        <dt>{label}</dt>
        <dd><strong>{known===null?'—':(complete?'':'已知 ') + fmt(known)+' '+unit}</strong>
          <span className="meta"> · 覆盖 {new Intl.NumberFormat('zh-CN',{style:'percent',maximumFractionDigits:1}).format(coverage)}</span>
          <small>{daily||/超过|接近上限/.test(status)?status:complete?'数据完整，按全日评估':'数据不完整'}
            {estimates?' · 含来源估算或参考值':''}{retained?' · 含烹调保留率估算':''}</small>
          {ref&&<ReferenceLine unit={unit} value={ref}/>}
          {daily&&ref?.pi?.direction==='至少'&&known!==null&&<small className="meta">{known>=ref.pi.amount?'已知量达到 PI-NCD':complete?'低于 PI-NCD 建议量':'PI-NCD 待核对'}</small>}
          {!complete&&missing.length>0&&<details className="nutrient-missing"><summary>部分食材缺值（{missing.length} 种状态）</summary>
            <p>{missing.join('、')}{bounded>0&&<>。其中已标报告阈值的部分合计少于 {fmt(bounded)} {unit}。</>}</p>
          </details>}
        </dd>
      </div>)}</dl>
    </details>)}
    {generalDriApplicable(profile??undefined)?<p className="meta">参考值按成年人档案选择。EAR 和 RNI 用于比较计划摄入，UL 用于比较适用成分的上限。
      <a href={Number(profile?.age)>=50?olderDriUrl:driUrl} target="_blank" rel="noreferrer"> 中国居民膳食营养素参考摄入量（2023）</a></p>:
      profile&&<p className="meta">当前档案仅显示用量。适用参考需按个人健康条件核对。</p>}
    {rows.some(row=>row.retained)&&<p className="meta">有匹配方法的原料附保留率估算，其余按对应称量状态报告。
      <a href={retentionSource} target="_blank" rel="noreferrer"> USDA 烹调营养保留率</a></p>}
  </div>;
}

function ReferenceLine({unit,value}:{unit:string;value:NutrientReference}){
  const {ear,rni,ai,pi,ul,range,target,ratioLimit,note}=value;
  const entries=[
    ear===undefined?null:'平均需要量（EAR） '+fmt(ear)+' '+unit,
    rni===undefined?null:'推荐摄入量 '+fmt(rni)+' '+unit+'（RNI）',
    ai===undefined?null:'适宜摄入量（AI） '+fmt(ai)+' '+unit,
    pi?'慢病预防建议（PI-NCD） '+pi.direction+' '+fmt(pi.amount)+' '+unit:null,
    ul===undefined?null:'可耐受最高摄入量（UL） '+fmt(ul)+' '+unit,
    range?'参考范围 '+fmt(range[0])+'～'+fmt(range[1])+' '+unit:null,
    ratioLimit===undefined?null:'膳食比例建议每天低于 '+fmt(ratioLimit)+' '+unit,
    target===undefined?null:'方案目标 '+fmt(target)+' '+unit,
  ].filter(Boolean);
  return <small className="meta">{entries.join(' · ')}{note&&<span className="nutrient-note">{note}</span>}</small>;
}
