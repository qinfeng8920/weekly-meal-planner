import type {Ingredient} from './catalog';

export type NutritionIngredient=Ingredient&{recipeId?:string};
export const recipeIngredients=(recipeId:string,ingredients:Ingredient[]):NutritionIngredient[]=>ingredients.map(item=>({...item,recipeId}));

