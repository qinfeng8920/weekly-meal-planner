import {z} from 'zod';
import {poolGroups,poolMethods,poolModes,rotations,fruitPolicies} from './ingredient-pool';
import {foodMap} from './catalog';
const id=z.string().refine(v=>foodMap.has(v));
const ids=z.array(id).max(foodMap.size);
const grams=z.number().min(0).max(1e7);
export const poolSettingsSchema=z.strictObject({
  mode:z.enum(poolModes),method:z.enum(poolMethods),strict:z.boolean(),selected:ids,locked:ids,excluded:ids,
  fruitPolicy:z.enum(fruitPolicies).optional(),fruitId:id.optional(),fruitOverrides:z.record(z.iso.date(),id).optional(),
  caps:z.partialRecord(z.enum(poolGroups),z.int().min(0).max(foodMap.size)).optional(),
  goals:z.record(id,grams).optional(),rotation:z.enum(rotations),preferred:ids.optional(),
});
export const ingredientPoolSchema=z.strictObject({version:z.literal(1),week:z.iso.date(),settings:poolSettingsSchema,selected:ids,
  used:z.array(z.strictObject({id,grams,uses:z.int().min(0).max(400)})).max(foodMap.size),
  supplements:z.array(z.strictObject({id,grams,reason:z.string().max(180),cost:grams.nullable()})).max(foodMap.size)});
export const poolTemplateSchema=z.strictObject({id:z.string().max(100),name:z.string().max(80),settings:poolSettingsSchema});
