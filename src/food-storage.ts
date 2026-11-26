import {food} from './catalog';

export const leafyFoods=new Set(['napa','bok','spinach','romaine','kale','mustard','watercress','arugula','leek']);
export const riceFoods=new Set(['rice','brown','cookedbrown']);
export function rawSeafood(id:string) {
  const f=food(id);
  return f.category==='鱼虾'&&f.state==='raw';
}
export const cookOnServingDay=(id:string)=>leafyFoods.has(id)||rawSeafood(id)||id==='cookedbrown';

import type {Profile} from './profile';
// 整颗、未切的耐储蔬果与可常温保存的未开封罐头。
const intact=new Set(['apple','pear','asianpear','orange','mandarin','kiwi','banana','lemon','tomato','onion','garlic','ginger','sweet','potato',
  'pumpkin','carrot','beet','turnip','daikon','cabbage','redcabbage','cannedsalmon','chickpea','soymilk']);
export function requiresCooling(id:string) {
  const f=food(id);
  return !intact.has(id)&&(f.state==='cooked'||f.state==='frozen'||['蔬菜','水果','乳制品','蛋','肉类','鱼虾','豆制品'].includes(f.category)&&f.state!=='dry');
}
export function storageDays(id:string,p:Profile) {
  const f=food(id), fridge=p.tools.includes('冰箱'), freezer=fridge&&p.tools.includes('冷冻室')&&p.frozen;
  if(!requiresCooling(id))return 7;
  if(!fridge)return 0;
  if(riceFoods.has(id)||leafyFoods.has(id)&&id!=='napa')return f.state==='cooked'?0:1;
  if(f.state==='frozen')return freezer?7:0;
  if(f.state==='cooked')return 1;
  if(f.category==='肉类'||f.category==='鱼虾')return freezer?7:1;
  if(f.category==='乳制品'||f.category==='蛋')return 4; // 未开封，须核对包装及标签
  if(f.category==='豆制品')return 1;
  if(f.category==='蔬菜'||f.category==='水果')return 3;
  return 1;
}
