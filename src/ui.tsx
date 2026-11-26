import {type ReactNode} from 'react';
import {alternativeRecipes,categoriesOf,foodMap,foodState,serving,type Recipe,type Serving} from './catalog';
import {type Nutrients} from './nutrition';
import {addDays} from './batches';
import {purchaseFood,type PurchaseOptions} from './purchase-food';
import {type Plan} from './planner';

export const integer = (n:number) => Math.round(n).toLocaleString('zh-CN');
export const decimal = (n:number) => Number(n.toFixed(1)).toLocaleString('zh-CN');
export const dayNames = ['周一','周二','周三','周四','周五','周六','周日'];
export const dateLabel=(iso:string)=>dayNames[(new Date(iso+'T12:00:00').getDay()+6)%7]+' '+Number(iso.slice(5,7))+'/'+Number(iso.slice(8,10));
export const planDay=(start:string|undefined,today:string)=>start?Math.max(0,Array.from({length:7},(_,i)=>addDays(start,i)).indexOf(today)):0;

export function SectionTitle({title,children}:{title:string;children?:ReactNode}) {
  return <div className="section-title"><h2>{title}</h2>{children}</div>;
}
export function Empty({title,children}:{title:string;children?:ReactNode}) {
  return <div className="card empty"><span aria-hidden="true" className="empty-mark">◌</span><h3>{title}</h3>{children}</div>;
}
export function NutritionRow({value}:{value:Nutrients}) {
  return <div className="nutrition-row">{([['kcal','能量','千卡'],['protein','蛋白质','克'],['carbs','碳水','克'],['fat','脂肪','克'],['fiber','膳食纤维','克']] as const)
    .map(([key,label,unit])=><div key={key}><span>{label}</span><b className="unit"><strong>{integer(value[key])}</strong><small> {unit}</small></b></div>)}</div>;
}
export function prepStorage(recipe:Recipe) {
  if (!recipe.batch) return '按包装说明储存，洗切或组合后尽快吃完。';
  if (recipe.ingredients.some(i=>['肉类','鱼虾','蛋','豆制品'].includes(foodMap.get(i.id)?.category??''))) return '生料密封冷藏并尽快加工。熟食分浅盒两小时内冷藏，建议两天内食用；需要更久时当天冷冻。冷藏解冻，中心复热至 74°C。';
  return '烹制后尽快分装，浅盒快速降温，两小时内冷藏。出锅后尽快食用，复热时中心达到 74°C。';
}
export function RecipeInfo({recipe,value,products}:{recipe:Recipe;value?:Serving;products?:PurchaseOptions}) {
  const current=value??serving(recipe);
  const conversions=current.ingredients.filter(i=>i.id!==purchaseFood(i.id,products).purchaseIngredientId)
    .map(i=>purchaseFood(i.id,products).conversion!);
  const extraMinutes=products?conversions.reduce((t,r)=>t+r.minutes,0):0;
  const allergy=value ? [...new Set(value.ingredients.flatMap(i=>foodMap.get(i.id)?.allergens??[]))] : categoriesOf(recipe);
  return <div className="recipe-info">
    <p className="meta">{recipe.cuisine} · {recipe.flavor} · {recipe.skill} · <span className="unit">约 {recipe.prep+recipe.cook+extraMinutes} 分钟</span></p>
    <NutritionRow value={current.nutrients}/>
    <h4>单人用量</h4><ul className="ingredients">{current.ingredients.map(i=>{
      const f=foodMap.get(i.id);
      return <li key={i.id}><span>{f?.name??i.id} <small>{f?foodState[f.state]:''}</small></span><strong>{decimal(i.grams)} 克</strong></li>;
    })}</ul>
    <div className="hint"><strong>厨具</strong> {recipe.tools.join('、')||'无需加热设备'}<br/><strong>过敏原</strong> {allergy.join('、')||'配方未含标注的过敏原'}。预包装食材需核对标签及交叉接触提示。</div>
    <h4>制作步骤</h4>{products&&conversions.length>0&&<p className="meta">未备好熟料时，先完成下列自制步骤。</p> }<ol>{[...conversions.filter(()=>products!==undefined).map(rule=>rule.steps),...recipe.steps].map(step=><li key={step}>{step}</li>)}</ol>
    <p className="meta">备料 {recipe.prep} 分钟 · 烹制 {recipe.cook} 分钟。放大份量时分批烹调，按实际熟度确认。</p>
    <h4>储存与复热</h4><p>{prepStorage(recipe)}</p>
    {alternativeRecipes(recipe).length>0&&<details><summary>同类食谱备选</summary><p>{alternativeRecipes(recipe).map(r=>r.name).join('、')}。在当前食谱使用换菜时会重新校验。</p></details>}
  </div>;
}
export function planText(plan:Plan) {
  return ['天天减 · 七天食谱',...plan.days.flatMap((day,i)=>[
    dateLabel(addDays(plan.start,i)),...day.meals.map(m=>m.name+'　'+m.dishes.map(s=>s.recipe.name+'（'+s.ingredients.map(x=>(foodMap.get(x.id)?.name??x.id)+' '+decimal(x.grams)+'克').join('、')+'）').join('；'))
  ])].join('\n');
}
export async function shareText(text:string,share:boolean) {
  if (share && typeof navigator.share==='function') {
    await navigator.share({title:'天天减',text});return '已打开系统分享。';
  }
  if (navigator.clipboard) {await navigator.clipboard.writeText(text);return '已复制到剪贴板。';}
  throw Error('浏览器无法写入剪贴板，请使用文本下载。');
}
