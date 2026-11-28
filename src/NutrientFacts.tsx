import {ingredientNutrition} from './nutrient-report';
import {formatNutrient as fmt,nutrientGroups} from './nutrient-catalog';
import {driUrl,olderDriUrl,type NutrientReference} from './nutrient-reference';
import type {Ingredient} from './catalog';
import type {Profile} from './profile';
import type {Targets} from './nutrition';

export function NutrientFacts({ingredients,days=1,profile,targets,daily=true}:{
  ingredients:Ingredient[];days?:number;profile?:Profile|null;targets?:Targets;daily?:boolean}){
  const rows=ingredientNutrition(ingredients,days,profile??undefined,targets);
  return <div className="nutrient-facts">
    <p className="meta">{daily?'按计划用量和原料称量状态估算。':'单人本份用量。以下参考值以全天为单位。'}
      覆盖率按已知数值对应的用料克重计算。</p>
    {nutrientGroups.map(group=><details key={group.name} className="item-fold nutrient-group">
      <summary>{group.name} · {group.keys.length} 项</summary>
      <dl className="nutrient-evaluation">{rows.filter(row=>group.keys.includes(row.key)).map(({key,label,unit,known,complete,
        coverage,missing,estimates,bounded,ref,status})=><div key={key}>
        <dt>{label}</dt>
        <dd><strong>{known===null?'—':(complete?'':'已知 ') + fmt(known)+' '+unit}</strong>
          <span className="meta"> · 覆盖 {new Intl.NumberFormat('zh-CN',{style:'percent',maximumFractionDigits:1}).format(coverage)}</span>
          <small>{daily||status.includes('高于参考限值')?status:complete?'数据完整，按全日评估':known===null?'暂无定量数据':'部分食材缺值'}
            {estimates?' · 含来源估算或参考值':''}</small>
          {ref&&<ReferenceLine unit={unit} value={ref}/>}
          {!complete&&missing.length>0&&<details className="nutrient-missing"><summary>部分食材缺值（{missing.length} 种状态）</summary>
            <p>{missing.join('、')}{bounded>0&&<>。其中已标报告阈值的部分合计少于 {fmt(bounded)} {unit}。</>}</p>
          </details>}
        </dd>
      </div>)}</dl>
    </details>)}
    {profile&&<p className="meta">参考值按适用成年人档案选择，烹调后的实际摄入会有差异。 <a href={Number(profile.age)>=50?olderDriUrl:driUrl}
      target="_blank" rel="noreferrer">中国居民膳食营养素参考摄入量（2023）</a></p>}
  </div>;
}

function ReferenceLine({unit,value}:{unit:string;value:NutrientReference}){
  const {goal,lower,upper,kind,note}=value;
  return <small className="meta">
    {goal!==undefined&&(kind??'推荐摄入量')+' '+fmt(goal)+' '+unit}
    {lower!==undefined&&upper!==undefined&&'适宜范围 '+fmt(lower)+'～'+fmt(upper)+' '+unit}
    {upper!==undefined&&lower===undefined&&((goal===undefined?(kind??'参考限值'):' · 参考限值')+' '+fmt(upper)+' '+unit)}
    {note&&<span className="nutrient-note">{note}</span>}
  </small>;
}
