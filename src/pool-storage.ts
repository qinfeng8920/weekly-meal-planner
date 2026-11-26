import {z} from 'zod';
import {poolGroups,poolMethods,poolModes,rotations} from './ingredient-pool';
import {foodMap} from './catalog';
const id=z.string().refine(v=>foodMap.has(v));
const ids=z.array(id).max(128);
const grams=z.number().min(0).max(1e7);
export const poolSettingsSchema=z.strictObject({
  mode:z.enum(poolModes),method:z.enum(poolMethods),strict:z.boolean(),selected:ids,locked:ids,excluded:ids,
  caps:z.partialRecord(z.enum(poolGroups),z.int().min(0).max(128)).optional(),
  goals:z.record(id,grams).optional(),rotation:z.enum(rotations),
});
export const ingredientPoolSchema=z.strictObject({version:z.literal(1),week:z.iso.date(),settings:poolSettingsSchema,selected:ids,
  used:z.array(z.strictObject({id,grams,uses:z.int().min(0).max(400)})).max(128),
  supplements:z.array(z.strictObject({id,grams,reason:z.string().max(180),cost:grams.nullable()})).max(128)});
export const poolTemplateSchema=z.strictObject({id:z.string().max(100),name:z.string().max(80),settings:poolSettingsSchema});
