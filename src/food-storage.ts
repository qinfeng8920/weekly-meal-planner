import {food} from './catalog';

export const leafyFoods=new Set(['napa','bok','spinach','romaine','kale','mustard','watercress','arugula','leek']);
export const riceFoods=new Set(['rice','brown','cookedbrown']);
export function rawSeafood(id:string) {
  const f=food(id);
  return f.category==='鱼虾'&&f.state==='raw';
}
export const cookOnServingDay=(id:string)=>leafyFoods.has(id)||rawSeafood(id)||id==='cookedbrown';
