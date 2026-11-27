import {baseRecipeList,foods,recipeList,recipeMap} from '../src/catalog';
import {foodClass,foodGroups,recipeGroups} from '../src/catalog-taxonomy';
import {purchaseIngredientId} from '../src/purchase-food';
import {groupsForRecipe} from '../src/recipe-taxonomy';
import {macroKeys} from '../src/nutrition';

const products=new Set(foods.map(f=>purchaseIngredientId(f.id)));
const used=new Set(recipeList.flatMap(r=>r.ingredients.map(i=>i.id)));
const counts=(keys:readonly string[],values:string[])=>Object.fromEntries(keys.map(key=>[key,values.filter(v=>v===key).length]));
console.log(JSON.stringify({
  records:foods.length,products:products.size,base:baseRecipeList.length,
  preparationVariants:recipeList.length-baseRecipeList.length,substitutionVariants:recipeMap.size-recipeList.length,
  foodGroups:counts(foodGroups,foods.map(f=>foodClass(f).group)),
  recipeGroups:counts(recipeGroups,baseRecipeList.flatMap(groupsForRecipe)),
  noRecipe:foods.filter(f=>!used.has(f.id)).map(f=>f.id),
  missingMacros:foods.filter(f=>macroKeys.some(k=>f.nutrients[k]===null)).map(f=>f.id),
},null,2));
