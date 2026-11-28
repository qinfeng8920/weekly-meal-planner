import type {NutrientKey} from './nutrient-catalog';

export const retentionSource='https://www.ars.usda.gov/ARSUserFiles/80400525/Data/retn/retn06.pdf';
const fields=['calcium','iron','magnesium','phosphorus','potassium','sodium','zinc','copper',
  'vitaminC','vitaminB1','vitaminB2','vitaminB3','vitaminB6','naturalFolate','folicAcid','folate','vitaminB12'] as const;
// USDA Release 6，按 100 克可食原料的营养总量乘保留率，非熟重乘生料浓度。
const profiles={
  '3005':[95,95,95,85,85,95,95,95,55,80,90,85,85,60,60,60,100],
  '3455':[95,95,95,90,90,95,95,95,65,80,90,90,90,65,65,65,100],
  '3775':[95,95,95,90,90,95,95,95,75,80,90,85,85,65,65,65,100],
  '3464':[100,100,100,100,100,100,100,100,75,90,95,95,95,80,80,80,100],
  '3784':[100,100,100,100,100,100,100,100,85,90,95,95,90,85,85,85,100],
  '0381':[95,75,85,85,30,50,100,90,70,65,75,65,80,70,70,70,100],
  '0432':[100,95,100,95,95,100,100,95,80,80,90,100,95,70,70,70,100],
} as const;
type Code=keyof typeof profiles;
const rows:Record<string,Partial<Record<NutrientKey,number>>>=Object.fromEntries(Object.entries(profiles).map(([code,values])=>
  [code,Object.fromEntries(fields.map((key,index)=>[key,values[index]/100]))]));
const leafy=new Set(['bok','napa','cabbage','spinach','butterlettuce','redlettuce','collards','chard']);
const roots=new Set(['carrot','daikon','lotusroot']);
const other=new Set(['broccoli','cauliflower','zucchini','asparagus','pumpkin','okra','redpepper','eggplant','celery','loofah','brussels','chayote','butternut']);
export function nutrientRetention(recipeId:string|undefined,id:string,state:string):Partial<Record<NutrientKey,number>>|undefined {
  if(!recipeId)return;
  const base=recipeId.split('--')[0];
  let code:Code|undefined;
  if(state==='dry'){
    if(base==='grain-pasta'&&id==='pasta')code='0381';
    if(base==='grain-rice'&&id==='rice'||['grain-brown','grain-mix'].includes(base)&&id==='brown')code='0432';
  }
  if(state==='raw'){
    if(base==='boil-'+id||base==='v24-boil-'+id){
      if(leafy.has(id))code='3005';
      else if(roots.has(id))code='3455';
      else if(other.has(id))code='3775';
    }
    if(base==='steam-'+id){
      if(roots.has(id))code='3464';
      else if(other.has(id))code='3784';
    }
  }
  if(code)return {...rows[code],folateDfe:rows[code].folate};
}
