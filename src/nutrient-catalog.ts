import data from './food-nutrition-v32.json';

export const nutrientsList={
  kcal:['能量','千卡'],protein:['蛋白质','克'],fat:['脂肪','克'],carbs:['碳水化合物','克'],fiber:['膳食纤维','克'],
  sugar:['总糖','克'],saturated:['饱和脂肪酸','克'],monounsaturated:['单不饱和脂肪酸','克'],
  polyunsaturated:['多不饱和脂肪酸','克'],cholesterol:['胆固醇','毫克'],
  calcium:['钙','毫克'],iron:['铁','毫克'],zinc:['锌','毫克'],potassium:['钾','毫克'],sodium:['钠','毫克'],
  magnesium:['镁','毫克'],phosphorus:['磷','毫克'],selenium:['硒','微克'],copper:['铜','毫克'],manganese:['锰','毫克'],iodine:['碘','微克'],
  vitaminA:['维生素 A（RAE）','微克'],vitaminB1:['维生素 B1','毫克'],vitaminB2:['维生素 B2','毫克'],
  vitaminB3:['烟酸（B3）','毫克'],vitaminB5:['维生素 B5','毫克'],vitaminB6:['维生素 B6','毫克'],
  vitaminB7:['生物素（B7）','微克'],vitaminB12:['维生素 B12','微克'],folate:['总叶酸','微克'],
  naturalFolate:['天然叶酸','微克'],folateDfe:['膳食叶酸当量（DFE）','微克'],vitaminC:['维生素 C','毫克'],
  vitaminD:['维生素 D（D2+D3）','微克'],vitaminE:['维生素 E（α-生育酚）','毫克'],vitaminK:['维生素 K（主要为 K1）','微克'],
  retinol:['预成型维生素 A（视黄醇）','微克'],folicAcid:['合成叶酸','微克'],
} as const;
export type NutrientKey=keyof typeof nutrientsList;
export const nutrientKeys=Object.keys(nutrientsList) as NutrientKey[];
export const nutrientGroups=[{name:'基础营养',keys:nutrientKeys.slice(0,10)},
  {name:'矿物质',keys:nutrientKeys.slice(10,21)},{name:'维生素',keys:nutrientKeys.slice(21)}];
export type Quality='reported'|'estimated'|'reference'|'label'|'trace'|'assumedZero'|'sourceZero'|'structuralZero';
type NutrientDatum=readonly [number|null,string,string,Quality,number?];
const catalog=data.foods as unknown as Record<string,Array<NutrientDatum|null>>;
export const sourceRows=data.sources as Record<string,string>;
const fieldPositions=new Map(data.fields.map((key,index)=>[key,index]));
export const nutrientCatalogIds=Object.keys(catalog);
export const publishedFields=data.fields;
export const nutrientDatum=(id:string,key:NutrientKey):NutrientDatum|null=>catalog[id]?.[fieldPositions.get(key)!]??null;
export const qualityLabels:Record<Quality,string>={reported:'来源收录值',estimated:'来源估算',reference:'同品种或同规格参考',
  label:'标签数据',trace:'微量或低于报告阈值',assumedZero:'来源推定为零',sourceZero:'来源报零，检测信息不足',structuralZero:'成分不含'};
export const referencesSources:Record<string,{label:string;link:string}>={
  fdc:{label:'USDA FoodData Central SR Legacy 2018',link:'https://fdc.nal.usda.gov/download-datasets/'},
  foundation:{label:'USDA FoodData Central Foundation Foods 2026-04',link:'https://fdc.nal.usda.gov/download-datasets/'},
  cofid:{label:'英国卫生机构 CoFID 2021',link:'https://www.gov.uk/government/publications/composition-of-foods-integrated-dataset-cofid'},
  mext:{label:'日本食品标准成分表（八订）增补 2023 年',link:'https://www.mext.go.jp/a_menu/syokuhinseibun/mext_00001.html'},
  mfat:{label:'日本食品标准成分表（八订）增补 2023 年脂肪酸表',link:'https://www.mext.go.jp/a_menu/syokuhinseibun/mext_00001.html'},
  iodine:{label:'USDA、FDA、NIH 食品碘数据库 2024',link:'https://www.ars.usda.gov/ARSUserFiles/80400535/Data/Iodine/IODINE_DATABASE_RELEASE_4_PER_100G.pdf'},
  ssass:{label:'SSaSS 低钠盐配方及元素质量换算',link:'https://pubmed.ncbi.nlm.nih.gov/34459569/'},
  asean:{label:'东盟简明食物成分表 2014',link:'https://inmu.mahidol.ac.th/aseanfoods/doc/OnlineASEAN_FCD_V1_2014.pdf'},
};
export function nutrientSource(source:string) {
  const [table,id]=source.split(':');
  const meta=referencesSources[table];
  return {...meta,id,description:sourceRows[source],link:['fdc','foundation'].includes(table)?'https://fdc.nal.usda.gov/food-details/'+id+'/nutrients':meta.link};
}
export function formatNutrient(n:number) {
  return n.toLocaleString('zh-CN',{maximumSignificantDigits:5,maximumFractionDigits:6});
}
