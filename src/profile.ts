export const equipment = ['煮锅','蒸锅','炒锅','电饭煲','微波炉','空气炸锅','烤箱','压力锅','冰箱','冷冻室','电子厨房秤'];
export const allergens = ['奶','蛋','鱼','甲壳类','软体动物','大豆','小麦','花生','树坚果','芝麻'];
export const conditions = ['脂肪肝','高血糖','高血脂','高尿酸','高血压','痤疮','胃肠道问题','肾脏疾病','其他特殊情况'];
export const screening = ['未满18岁','怀孕或哺乳期','进食障碍风险','医嘱特殊饮食','需要医学营养干预'];
export const cuisines = ['中式家常','粤菜','川湘菜','日式','韩式','西式轻食','清淡','其他'];

export const initialProfile = {
  name: '', sex: '', age: '', height: '', weight: '', target: '', waist: '', fat: '',
  goal: '减脂', pace: '缓慢', activity: '长期久坐', exerciseCount: '', exerciseType: '', exerciseMinutes: '',
  wake: '', sleep: '', breakfast: '', lunch: '', dinner: '', screened: false, allergyChecked: false,
  risks: [] as string[], conditions: [] as string[], allergens: [] as string[], avoid: '', otherHealth: '',
  cuisines: [] as string[], preferred: '', protein: [] as string[], starch: [] as string[],
  vegetables: [] as string[], fruits: [] as string[], nuts: [] as string[], seasonings: [] as string[],
  fruit: '正常摄入', fruitGrams: '', dairy: '正常摄入',
  tools: ['煮锅', '蒸锅', '炒锅', '冰箱'], skill: '简单做饭', minutes: '40',
  country: '', city: '', budget: '', people: '1', trips: '1', frozen: true, repeats: true,
  packed: false, lunchPlace: '在家', prep: '混合模式', waste: true, meals: '3',
  fixedBreakfast: '', requiredDish: '', fluidLimit: false,
};

export type Profile = typeof initialProfile & {mealPreferences?:Partial<Record<MainMeal,MealPreference>>};
export type Weight = { date: string; kg: number; waist?: number };
export const split = (value: string) => value.split(/[、,，;；\n]/).map(x => x.trim()).filter(Boolean);

export function dateKey(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

export const mainMeals = ['早餐','午餐','晚餐'] as const;
export type MainMeal = typeof mainMeals[number];
export type MealName = MainMeal|'早午餐'|'加餐';
export type MealPreference = {minutes:string; cuisines:string[]; likes:string; dislikes:string;
  repeats:boolean; fixed:boolean; prep:boolean};
export const defaultMealPreference = (p:Profile,meal:MainMeal):MealPreference => ({
  minutes:meal==='早餐' ? String(Math.min(10,Number(p.minutes))) : p.minutes, cuisines:[],
  likes:'',dislikes:'',repeats:p.repeats,fixed:false,prep:false,
});
export function mealPreference(p:Profile,name:MealName) {
  const meal=name==='早午餐'||name==='加餐'?'午餐':name;
  const result=p.mealPreferences?.[meal]??defaultMealPreference(p,meal);
  return name==='加餐'?{...result,minutes:'10',cuisines:[],likes:'',dislikes:'',repeats:true,fixed:false,prep:false}:result;
}
