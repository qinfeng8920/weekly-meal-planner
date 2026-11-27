import {food,type Recipe} from './catalog';
import {foodClass,recipeGroups} from './catalog-taxonomy';
import {recipeCooking} from './cooking';
import {recipeMeaning} from './food-semantics';
import {labels} from './meal-catalog';

export function groupsForRecipe(r:Recipe) {
  const meaning=recipeMeaning(r), method=recipeCooking(r).method;
  const core=meaning.core.map(id=>foodClass(food(id)).group);
  return recipeGroups.filter(group=>group==='早餐'?labels(r).tags.includes('早餐')&&r.group!=='水果'&&r.group!=='加餐':
    group==='蔬菜菌菇'?r.group==='蔬菜':group==='一锅套餐'?meaning.role===group:group==='凉拌菜'?method==='凉拌':
      [r.group,...core].some(type=>type===group||group==='豆制品'&&type==='豆类及豆制品'));
}
