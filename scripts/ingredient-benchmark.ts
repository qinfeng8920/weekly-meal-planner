import {performance} from 'node:perf_hooks';
import {food} from '../src/catalog';
import {defaultPool,type PoolSettings,visiblePoolModes} from '../src/ingredient-pool';
import {purchaseCategory} from '../src/purchase-category';
import {regenerate,verifyAgainst} from '../src/planner';
import type {Pantry} from '../src/shopping';
import {demo} from '../tests/fixtures';

const adults=[
  {...demo,age:'25',sex:'男',height:'173',weight:'72',target:'65',tools:['煮锅','蒸锅']},
  {...demo,age:'31',sex:'女',height:'164',weight:'68',target:'60',allergens:['花生']},
  {...demo,age:'29',meals:'4',tools:[...demo.tools,'冷冻室']},
];
const stocked:Pantry={olive:{stock:350},oats:{stock:750},chicken:{stock:350},broccoli:{stock:900},orange:{stock:1300},soymilk:{stock:600}};
const seeds=[];
for(const [index,profile] of adults.entries())for(const mode of visiblePoolModes)for(let i=0;i<12;i++) {
  seeds.push({id:`专项-${index}-${mode}-${i}`,profile:i%6===3?{...profile,budget:'220'}:profile,
    pantry:i%3?stocked:{},settings:{...defaultPool,mode,...(i%6===4?{method:'库存优先'}:{}),
      ...(i%6===5?{method:'手动指定',strict:true,selected:[
        'oats','brown','chicken','bass','beef','broccoli','bok','carrot','tomato','orange','apple','egg','tofu','greek','yogurt','milk','soymilk',
        'walnut','olive','canola','ginger','garlic','scallion','salt','lemon','soy','vinegar','pepper','cinnamon',
      ]}:{}),} as PoolSettings});
}
const results=seeds.map(({id,profile,pantry,settings})=>{
  const time=performance.now();
  try {
    const plan=regenerate(profile,[],pantry,[],id,undefined,[],undefined,undefined,undefined,{settings});
    const ms=performance.now()-time;
    const quote=plan.logistics!;
    let qualified=true;
    try {verifyAgainst(plan,profile,[],pantry,[]);}catch{qualified=false;}
    const used=quote.lines.filter(row=>row.uses.length);
    const needed=quote.lines.filter(row=>row.remaining>0||row.estimate===null);
    const main=used.filter(row=>purchaseCategory(row.id)==='主要食材').length;
    const home=used.reduce((n,row)=>n+row.uses.reduce((s,u)=>s+(u.sourcing?.home??0)+(u.sourcing?.carry??0),0),0);
    const once=needed.filter(row=>new Set(row.uses.map(u=>u.jobKey)).size===1).length;
    const snapshot=id==='专项-0-少量种类-1'?{
      meals:plan.days.map(d=>d.meals.map(m=>[m.name,...m.dishes.map(s=>s.recipe.name+'（'+s.ingredients.map(i=>food(i.id).name+' '+i.grams+' 克').join('、')+'）')])),
      shopping:quote.batches.map(b=>b.lines.filter(r=>r.remaining>0).map(r=>[food(r.id).name,r.remaining,r.estimate])),
      prep:quote.prep.map(b=>({覆盖:b.range.to-b.range.from,净料:b.rows.map(row=>[food(row.id).name,row.grams]),任务:b.jobs.map(j=>j.meal+' · '+j.name+' · '+j.method)})),
    }:undefined;
    return {id,mode:settings.mode,used:used.length,needed:needed.length,main,seasonings:used.length-main,home,once,
      cost:quote.remaining.known,missing:quote.remaining.missing,ms,qualified,snapshot};
  }catch(e) {return {id,mode:settings.mode,error:(e as Error).message,ms:performance.now()-time};}
});
console.log(JSON.stringify(results));
