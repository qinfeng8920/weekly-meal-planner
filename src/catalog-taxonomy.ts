import type {Food,Recipe} from './catalog';

export const foodGroups=['肉类','鱼虾海鲜','蛋类','蔬菜','菌菇','主食','豆类及豆制品','水果','奶制品','坚果种子','食用油','调味料','其他食品'] as const;
type FoodGroup=typeof foodGroups[number];
const typeById:Record<string,string>={chicken:'禽肉',thigh:'禽肉',turkey:'禽肉',cookedchicken:'禽肉',pork:'猪肉',beef:'牛羊肉',
  bass:'海水鱼',tilapia:'淡水鱼',trout:'淡水鱼',salmon:'海水鱼',cod:'海水鱼',mackerel:'海水鱼',tuna:'海水鱼',cannedsalmon:'海水鱼',shrimp:'虾蟹',scallop:'贝类',squid:'其他水产',
  egg:'全蛋',boiledegg:'全蛋',eggwhite:'蛋清',shiitake:'鲜菌菇',whitefungi:'鲜菌菇',enoki:'鲜菌菇',oystermushroom:'鲜菌菇',
  peas:'鲜豆类',asparagus:'嫩茎类',celery:'嫩茎类',onion:'根茎类',turnip:'根茎类',broccoli:'花球类',cauliflower:'花球类',tomato:'茄果类',redpepper:'茄果类',yellowpepper:'茄果类',eggplant:'茄果类',
  zucchini:'瓜类',cucumber:'瓜类',pumpkin:'瓜类',okra:'鲜豆类',greenbean:'鲜豆类',carrot:'根茎类',daikon:'根茎类',beet:'根茎类',
  rice:'米类',brown:'米类',cookedbrown:'米类',oats:'麦类',barley:'麦类',bread:'面食',pasta:'面食',sweet:'薯类',potato:'薯类',cookedsweet:'薯类',
  tofu:'豆腐',softtofu:'豆腐',soymilk:'豆浆',edamame:'鲜豆',chickpea:'其他豆制品',lentil:'干豆',blackbean:'干豆',mung:'干豆',
  apple:'仁果类',pear:'仁果类',asianpear:'仁果类',orange:'柑橘类',mandarin:'柑橘类',peach:'核果类',plum:'核果类',apricot:'核果类',
  watermelon:'瓜类',cantaloupe:'瓜类',melon:'瓜类',pineapple:'热带水果',banana:'热带水果',mango:'热带水果',papaya:'热带水果',avocado:'热带水果',
  milk:'牛奶',greek:'酸奶',yogurt:'酸奶',cheese:'奶酪',peanut:'花生',almond:'树坚果',walnut:'树坚果',cashew:'树坚果',pistachio:'树坚果',hazelnut:'树坚果',
  canola:'植物烹调油',peanutoil:'植物烹调油',olive:'植物烹调油',sesameoil:'风味油',salt:'食盐',soy:'酱油',vinegar:'食醋',ricevinegar:'食醋',
  scallion:'新鲜调味食材',ginger:'新鲜调味食材',garlic:'新鲜调味食材',cilantro:'新鲜调味食材',lemon:'新鲜调味食材'};
const classifications=new WeakMap<Food,{group:FoodGroup;subgroup:string}>();
function classify(f:Food):{group:FoodGroup;subgroup:string} {
  const type=f.subcategory??typeById[f.id];
  if(type==='新鲜调味食材')return {group:'调味料',subgroup:type};
  if(type==='植物烹调油'||type==='风味油'||type==='其他油脂')return {group:'食用油',subgroup:type};
  if(type?.endsWith('菌菇'))return {group:'菌菇',subgroup:type};
  const defaults:Record<string,[FoodGroup,string]>={肉类:['肉类','其他肉类'],鱼虾:['鱼虾海鲜','其他水产'],蛋:['蛋类','其他蛋品'],
    蔬菜:['蔬菜','叶菜'],主食:['主食','杂粮'],豆制品:['豆类及豆制品','其他豆制品'],水果:['水果','浆果类'],
    乳制品:['奶制品','其他奶制品'],坚果种子:['坚果种子','食用种子'],调味品:['调味料','干香辛料']};
  const [group,fallback]=defaults[f.category]??['其他食品','其他'];
  return {group,subgroup:type??fallback};
}
export function foodClass(f:Food) {
  const cached=classifications.get(f);
  if(cached)return cached;
  const value=classify(f);
  classifications.set(f,value);
  return value;
}
export const recipeGroups=['早餐','主食','肉类','鱼虾海鲜','蛋类','豆制品','蔬菜菌菇','汤类','凉拌菜','一锅套餐','水果','加餐'] as const;
export type RecipeGroup=typeof recipeGroups[number];
export function recipeUses(id:string,recipe:Recipe) {return recipe.ingredients.some(i=>i.id===id);}
