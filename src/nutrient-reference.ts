import type {NutrientKey} from './nutrient-catalog';
import type {Profile} from './profile';
import type {Targets} from './nutrition';

export const driUrl='https://www.cnsoc.org/drpostand/';
export const olderDriUrl='https://www.cnsoc.org/drpostand/page2.html';
export type NutrientReference={goal?:number;lower?:number;upper?:number;kind?:string;note?:string};
type ProfileContext=Pick<Profile,'age'|'sex'|'risks'|'conditions'|'otherHealth'>;
type DRI=Partial<Record<NutrientKey,NutrientReference>>;
const adultMacros=new Set<NutrientKey>(['kcal','protein','fat','carbs']);
const formNotes:DRI={
  sugar:{note:'总糖包含天然糖。添加糖或游离糖的上限需单独计算。'},
  cholesterol:{note:'本应用未设通用胆固醇上限。'},
  monounsaturated:{note:'该表未列此类脂肪酸的独立总量参考。'},
  polyunsaturated:{note:'n-3 和 n-6 有各自参考，总多不饱和脂肪酸不能代替。'},
  folate:{note:'推荐量采用膳食叶酸当量，见 DFE 项。'},
  naturalFolate:{note:'膳食叶酸参考见 DFE 项。'},
  vitaminE:{note:'参考为每日 14 毫克 α-生育酚当量。本项只计 α-生育酚。'},
  vitaminB3:{note:'参考采用烟酸当量，包含由色氨酸转化的部分。本项只计烟酸。'},
  vitaminK:{note:'总维生素 K 的适宜量为每日 80 微克。本项主要记录 K1。'},
};
export function nutrientReferences(profile?:ProfileContext,targets?:Targets):DRI {
  const age=Number(profile?.age);
  if(!profile||!Number.isInteger(age)||age<18||age>79||!['男','女'].includes(profile.sex)||
    profile.risks.length||profile.otherHealth.trim()||
    profile.conditions.some(c=>['肾脏疾病','其他特殊情况'].includes(c)))return {};
  const male=profile.sex==='男';
  const iron=male?12:age<50?18:10;
  const vitaminA=age<50?(male?770:660):age<65?(male?750:660):age<75?(male?730:640):(male?710:600);
  const result:DRI={
    ...formNotes,
    calcium:{goal:800,upper:2000},iron:{goal:iron,upper:42},
    zinc:{goal:male?age<30?12.5:12:8.5,upper:40},
    potassium:{goal:2000,kind:'适宜摄入量'},sodium:{goal:age<65?1500:1400,upper:age<65?2000:age<75?1900:1800,kind:'适宜摄入量'},
    magnesium:{goal:age<30?330:age<65?320:age<75?310:300},
    phosphorus:{goal:age<30?720:age<65?710:680,upper:age<65?3500:3000},
    selenium:{goal:60,upper:400},copper:{goal:age<75?.8:.7,upper:8},
    manganese:{goal:male?4.5:4,upper:11,kind:'适宜摄入量'},iodine:{goal:120,upper:600},
    vitaminA:{goal:vitaminA,note:'每日 3000 微克上限针对预成型维生素 A，不用于评估本项总 RAE。'},
    vitaminB1:{goal:male?1.4:1.2},vitaminB2:{goal:male?1.4:1.2},
    vitaminB5:{goal:5,kind:'适宜摄入量'},vitaminB6:{goal:age<50?1.4:1.6,upper:age<50?60:55},
    vitaminB7:{goal:40,kind:'适宜摄入量'},vitaminB12:{goal:2.4},
    folateDfe:{goal:400,note:'1000 微克上限仅适用于合成叶酸。本项为全部膳食叶酸当量。'},
    vitaminC:{goal:100,upper:2000},vitaminD:{goal:age<65?10:15,upper:50},
    fiber:{lower:25,upper:30,kind:'适宜范围'},
  };
  if(!male&&age>=50&&age<65)result.iron={upper:42,note:'参考值随月经状态而异：有月经每日 18 毫克，无月经每日 10 毫克。'};
  if(targets){
    for(const key of adultMacros)result[key]={goal:targets[key as 'kcal'|'protein'|'carbs'|'fat'],kind:'原方案目标'};
    result.saturated={upper:targets.kcal*.1/9,kind:'低于计划能量的 10%'};
  }else result.saturated={note:'每日低于总能量的 10%，单道菜没有独立限额。'};
  return result;
}
