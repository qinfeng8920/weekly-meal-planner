import type {NutrientKey} from './nutrient-catalog';
import type {Profile} from './profile';
import type {Targets} from './nutrition';

export const driUrl='https://www.cnsoc.org/drpostand/';
export const olderDriUrl='https://www.cnsoc.org/drpostand/page2.html';
export type NutrientReference={
  ear?:number;rni?:number;ai?:number;pi?:{amount:number;direction:'至少'|'至多'};
  ul?:number;range?:readonly [number,number];target?:number;ratioLimit?:number;note?:string;
};
type ProfileContext=Pick<Profile,'age'|'sex'|'risks'|'conditions'|'otherHealth'>;
type DRI=Partial<Record<NutrientKey,NutrientReference>>;

export function generalDriApplicable(profile?:ProfileContext){
  const age=Number(profile?.age);
  return Boolean(profile&&Number.isInteger(age)&&age>=18&&age<=79&&['男','女'].includes(profile.sex)&&
    !profile.risks.length&&!profile.otherHealth.trim()&&!profile.conditions.some(c=>['肾脏疾病','其他特殊情况'].includes(c)));
}
export function nutrientReferences(profile?:ProfileContext,targets?:Targets):DRI {
  if(!profile||!generalDriApplicable(profile))return {};
  const age=Number(profile.age),male=profile.sex==='男',older=age>=65,oldest=age>=75;
  const vitaminA=age<50?(male?770:660):age<65?(male?750:660):age<75?(male?730:640):(male?710:600);
  const vitaminAEar=age<50?(male?550:470):age<65?(male?540:470):age<75?(male?520:460):(male?500:430);
  const result:DRI={
    calcium:{ear:650,rni:800,ul:2000},iron:{ear:male?9:age<50?12:8,rni:male?12:age<50?18:10,ul:42},
    zinc:{ear:male?10.1:6.9,rni:male?age<30?12.5:12:8.5,ul:40},
    potassium:{ai:2000,pi:{amount:3600,direction:'至少'}},
    sodium:{ai:older?1400:1500,pi:{amount:oldest?1800:older?1900:2000,direction:'至多'}},
    magnesium:{ear:oldest?250:older?260:270,rni:age<30?330:!older?320:oldest?300:310},
    phosphorus:{ear:age<30?600:older?570:590,rni:age<30?720:older?680:710,ul:older?3000:3500},
    selenium:{ear:50,rni:60,ul:400},copper:{ear:age<30?.62:oldest?.57:older?.58:.6,rni:oldest?.7:.8,ul:8},
    manganese:{ai:male?4.5:4,ul:11},iodine:{ear:85,rni:120,ul:600},
    vitaminA:{ear:vitaminAEar,rni:vitaminA,note:'上限见预成型维生素 A（视黄醇）。'},
    retinol:{ul:3000,note:'上限适用于预成型维生素 A，包含食物与补充剂。'},
    vitaminB1:{ear:male?1.2:1,rni:male?1.4:1.2},vitaminB2:{ear:male?1.2:1,rni:male?1.4:1.2},
    vitaminB3:{note:'烟酸当量包含色氨酸转化部分。本项记录烟酸，按适用化学形式核对上限。'},
    vitaminB5:{ai:5},vitaminB6:{ear:age<50?1.2:1.3,rni:age<50?1.4:1.6,ul:age<50?60:55},
    vitaminB7:{ai:40},vitaminB12:{ear:2,rni:2.4},
    folate:{note:'营养推荐见膳食叶酸当量（DFE）。'},
    naturalFolate:{note:'营养推荐见膳食叶酸当量（DFE）。'},
    folateDfe:{ear:320,rni:400,note:'上限见合成叶酸。'},
    folicAcid:{ul:1000,note:'上限适用于强化食品和补充剂的合成叶酸。'},
    vitaminC:{ear:85,rni:100,pi:{amount:200,direction:'至少'},ul:2000},
    vitaminD:{ear:8,rni:older?15:10,ul:50},
    vitaminE:{note:'参考采用每日 14 毫克 α-生育酚当量，本项为 α-生育酚。'},
    vitaminK:{note:'总维生素 K 的 AI 为每日 80 微克，本项主要记录 K1。'},
    fiber:{range:[25,30],note:'适宜摄入范围。'},
    sugar:{note:'总糖含天然糖，添加糖限值需另算。'},
    cholesterol:{note:'成人参考表未列通用 UL。'},
    monounsaturated:{note:'成人参考表未列该总量的独立参考值。'},
    polyunsaturated:{note:'成人参考表分别列 n-3 和 n-6，本项为合计。'},
    protein:{ear:male?60:50,rni:male?(older?72:65):(older?62:55),target:targets?.protein},
    carbs:{ear:age<50?120:undefined,target:targets?.carbs,range:targets?[targets.kcal*.5/4,targets.kcal*.65/4]:undefined},
    fat:{target:targets?.fat,range:targets?[targets.kcal*.2/9,targets.kcal*.3/9]:undefined},
    kcal:{target:targets?.kcal},
    saturated:targets?{ratioLimit:targets.kcal*.1/9,note:'按方案能量的 10% 换算。'}:{note:'适用全日总能量的 10% 比例建议。'},
  };
  if(!male&&age>=50&&age<65)result.iron={ul:42,note:'有月经时 EAR 12、RNI 18 毫克，无月经时 EAR 8、RNI 10 毫克。'};
  return result;
}
