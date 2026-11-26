import {food} from './catalog';

// 显式商品分类。柠檬、葱姜蒜和鲜香草在当前食谱中作为调味食材。
const freshSeasonings=new Set(['ginger','garlic','scallion','cilantro','lemon']);
export const purchaseCategories=['主要食材','新鲜调味食材','常备调味料'] as const;
export type PurchaseCategory=typeof purchaseCategories[number];
export function purchaseCategory(id:string):PurchaseCategory {
  if(freshSeasonings.has(id))return '新鲜调味食材';
  return food(id).category==='调味品'?'常备调味料':'主要食材';
}

export const inventoryGroups=['肉蛋及鱼虾','蔬菜水果','主食杂粮','奶豆及其他主要食材','新鲜调味食材','常备调味料'] as const;
export function inventoryGroup(id:string):typeof inventoryGroups[number] {
  const group=purchaseCategory(id), category=food(id).category;
  if(group!=='主要食材')return group;
  if(['肉类','蛋','鱼虾'].includes(category))return '肉蛋及鱼虾';
  if(['蔬菜','水果'].includes(category))return '蔬菜水果';
  if(category==='主食')return '主食杂粮';
  return '奶豆及其他主要食材';
}
