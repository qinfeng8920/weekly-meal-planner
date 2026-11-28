import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {foods,foodState,hasPlanningNutrition,planningNutrition} from '../src/catalog';
import {foodClass} from '../src/catalog-taxonomy';
import {macroKeys} from '../src/nutrition';
import {nutrientCatalogIds,nutrientDatum,nutrientKeys,nutrientsList,publishedFields,qualityLabels,sourceRows,type NutrientKey} from '../src/nutrient-catalog';
import base from '../src/foods.json';
import expansion from '../src/foods-v24.json';
import mext from '../src/foods-mext-v24.json';
import planningValues from '../src/nutrient-planning-values.json';
import oldMicros from './nutrition-baseline-v3.2.json';

const gramsFields=new Set<NutrientKey>(['protein','fat','carbs','fiber','sugar','saturated','monounsaturated','polyunsaturated']);
const limits:Partial<Record<NutrientKey,number>>={
  kcal:900,sodium:40000,potassium:23000,calcium:5000,magnesium:5000,phosphorus:6000,
  iron:200,zinc:250,selenium:4000,copper:100,manganese:150,iodine:3000,
  vitaminA:20000,vitaminB1:30,vitaminB2:30,vitaminB3:200,vitaminB5:30,vitaminB6:30,vitaminB7:400,
  retinol:20000,folicAcid:3000,vitaminB12:200,folate:3000,naturalFolate:3000,folateDfe:5000,vitaminC:3000,vitaminD:150,vitaminE:200,vitaminK:4000,cholesterol:2500,
};
const fdcFields=Object.fromEntries(nutrientKeys.map((key,index)=>[key,
  [1008,1003,1004,1005,1079,2000,1258,1292,1293,1253,1087,1089,1095,1092,1093,1090,1091,1103,1098,1101,1100,1106,1165,1166,1167,1170,1175,1176,1178,1177,1187,1190,1162,1114,1109,1185,1105,1186][index]]));
const raw=[...base,...expansion,...mext];
const baseline=new Map(raw.map(f=>[f.id,{...f.nutrients,...(oldMicros as Record<string,Record<string,number|null>>)[f.id]}] as const));
const csvCell=(value:unknown)=>'"'+String(value??'').replaceAll('"','""')+'"';
const pct=(have:number,total:number)=>(100*have/total).toFixed(1)+'%';
const sourcePattern=/^(fdc|foundation|cofid|mext|mfat|iodine|asean|ssass):[^\s:]+$/;

export function validateNutrientCatalog() {
  assert.deepEqual(publishedFields,nutrientKeys,'数据列、顺序和单位词典须一致');
  assert.equal(new Set(foods.map(f=>f.id)).size,foods.length,'重复食材 ID');
  assert.deepEqual([...nutrientCatalogIds].sort(),foods.map(f=>f.id).sort(),'食材与审核表须一一对应');
  assert.deepEqual(Object.keys(planningNutrition).sort(),[...nutrientCatalogIds].sort(),'配餐索引与审核表须一一对应');
  assert.deepEqual(Object.keys(planningValues.foods).sort(),[...nutrientCatalogIds].sort(),'营养评分索引与审核表须一一对应');
  const planningKeys=planningValues.keys as NutrientKey[];
  assert.equal(new Set(planningKeys).size,planningKeys.length,'营养评分索引的字段重复');
  assert(planningKeys.every(key=>nutrientKeys.includes(key)),'营养评分索引含未知字段');
  const scoring=planningValues.foods as Record<string,ReadonlyArray<number|null>>;
  const fdc=new Set<number>(), fingerprints=new Map<string,string>();
  for(const food of foods){
    assert(foodState[food.state],food.id+' 食材缺少有效状态');
    if(food.fdc!==undefined){assert(!fdc.has(food.fdc),food.id+' 重复的主来源');fdc.add(food.fdc);}
    const rows=nutrientKeys.map(key=>nutrientDatum(food.id,key));
    for(const [index,row] of rows.entries()){
      const key=nutrientKeys[index],line=food.id+' '+key;
      if(row===null)continue;
      const [value,source,code,status,upper]=row,max=gramsFields.has(key)?100:limits[key]!;
      assert(sourcePattern.test(source)&&sourceRows[source]&&code.trim(),line+' 缺少来源或原字段');
      assert(status in qualityLabels,line+' 数据状态无效');
      if(source.startsWith('fdc:')){
        assert.equal(source,'fdc:'+food.fdc,line+' 的 USDA 食品记录号不匹配');
        if(!(status==='structuralZero'&&key==='fiber'))assert.equal(Number(code.split(':')[0]),fdcFields[key],line+' 原始字段或单位不匹配');
      }
      if(value!==null){
        assert(Number.isFinite(value)&&value>=0&&value<=max,line+' 数值异常 '+value);
        assert(!['trace','assumedZero','sourceZero'].includes(status),line+' 缺值不应作为数值');
      }else assert(['trace','assumedZero','sourceZero'].includes(status),line+' 缺失状态无效');
      if(upper!==undefined)assert(value===null&&Number.isFinite(upper)&&upper>0&&upper<=max,line+' 报告阈值无效');
    }
    const values=rows.map(row=>row?.[0]??null);
    const nonZero=values.filter(value=>value!==null&&value>0);
    const fingerprint=JSON.stringify(values);
    if(nonZero.length>=12){
      assert(!fingerprints.has(fingerprint),food.id+' 与 '+fingerprints.get(fingerprint)+' 营养数据完全重复');
      fingerprints.set(fingerprint,food.id);
    }
    const lookup=(key:NutrientKey)=>nutrientDatum(food.id,key)?.[0]??null;
    assert.deepEqual(scoring[food.id],planningKeys.map(lookup),food.id+' 评分索引须与审核数值相同');
    const sum=macroKeys.slice(1,4).reduce((total,key)=>total+(lookup(key)??0),0);
    assert(sum<=101,food.id+' 三大宏量营养质量超出 100 克');
    const fat=lookup('fat'), saturated=lookup('saturated');
    if(fat!==null&&saturated!==null)assert(saturated<=fat+.15,food.id+' 饱和脂肪超过总脂肪');
    const sodium=nutrientDatum(food.id,'sodium');
    assert.equal(planningNutrition[food.id].sodium,sodium?.[0]??sodium?.[4]??null,food.id+' 钠约束不等于审核值');
    assert.equal(hasPlanningNutrition(food),macroKeys.every(key=>lookup(key)!==null)&&planningNutrition[food.id].sodium!==null,food.id+' 配餐准入与审核结果不一致');
  }
}

function count(rows:typeof foods,keys=nutrientKeys) {
  let before=0,after=0,filled=0,corrected=0,withdrawn=0,flagged=0;
  for(const f of rows)for(const key of keys){
    const old=(baseline.get(f.id) as Record<string,number|null>|undefined)?.[key]??null;
    const entry=nutrientDatum(f.id,key), now=entry?.[0]??null;
    if(old!==null)before++;
    if(now!==null)after++;
    if(old===null&&now!==null)filled++;
    if(old!==null&&now!==old){corrected++;if(now===null)withdrawn++;}
    if(now===null&&entry)flagged++;
  }
  return {total:rows.length*keys.length,before,after,filled,corrected,withdrawn,flagged};
}

function report(){
  const summary=count(foods);
  const inactive=foods.filter(f=>!hasPlanningNutrition(f));
  const tables=[
    '# V3.2.2 全食材营养补全报告','',
    '范围覆盖全部可食部称量状态和复合调味料。现行档案 Schema 无自定义食材数据表。自定义价格、采购规格和菜谱调整仍引用原食材 ID。','',
    '定量完整率只统计有数值的字段，低于报告阈值、来源报零但未证实、推定零及未知分别记录。下表的旧版统计采用 V3.2.0 基线。','',
    '上一个正式版本 V3.2.1 记录 224 条食材、36 项字段和 6745 项可定量数据。V3.2.2 增加低钠盐和两种独立成分，可定量数据净增 '+(summary.after-6745)+' 项。两版记录的字段范围不同。','',
    '| 指标 | 结果 |','| --- | ---: |',
    '| 食材记录 | '+raw.length+' → '+foods.length+' |',
    '| 每条食材审查字段 | 14 → '+nutrientKeys.length+' |',
    '| 可定量字段 | '+summary.before+' → '+summary.after+' / '+summary.total+' |',
    '| 相同新版字段口径的完整率 | '+pct(summary.before,summary.total)+' → '+pct(summary.after,summary.total)+' |',
    '| 新增定量项 | '+summary.filled+' |',
    '| 修正旧值或取消未经证实的定量 | '+summary.corrected+' |',
    '| 其中更新数值 | '+(summary.corrected-summary.withdrawn)+' |',
    '| 其中旧值改为无定量 | '+summary.withdrawn+' |',
    '| 剩余无定量字段 | '+(summary.total-summary.after)+' |',
    '| 其中已有来源零或微量标记 | '+summary.flagged+' |',
    '| 关键成分审核通过 | '+(foods.length-inactive.length)+' / '+foods.length+' |','',
    '暂不进入自动配餐的食材为 '+inactive.map(f=>f.name).join('、')+'。原有记录和 ID 继续可查。','',
    '## 每项营养指标','',
    '| 成分 | 单位 | 原定量 | 新定量 | 新完整率 | 新补 | 旧值修正 |','| --- | --- | ---: | ---: | ---: | ---: | ---: |',
    ...nutrientKeys.map(key=>{
      const c=count(foods,[key]),[name,unit]=nutrientsList[key];
      return '| '+[name,unit,c.before,c.after,pct(c.after,c.total),c.filled,c.corrected].join(' | ')+' |';
    }),'','## 食材一级类','',
    '| 分类 | 条目数 | 原完整率 | 新完整率 | 新补 | 旧值修正 |','| --- | ---: | ---: | ---: | ---: | ---: |',
  ];
  const groups=[...new Set(foods.map(f=>foodClass(f).group))];
  for(const group of groups){
    const rows=foods.filter(f=>foodClass(f).group===group),c=count(rows);
    tables.push('| '+[group,rows.length,pct(c.before,c.total),pct(c.after,c.total),c.filled,c.corrected].join(' | ')+' |');
  }
  tables.push('','## 称量状态','',
    '| 状态 | 条目数 | 原完整率 | 新完整率 |','| --- | ---: | ---: | ---: |');
  for(const [state,label] of Object.entries(foodState)){
    const rows=foods.filter(f=>f.state===state);
    if(!rows.length)continue;
    const c=count(rows);
    tables.push('| '+[label,rows.length,pct(c.before,c.total),pct(c.after,c.total)].join(' | ')+' |');
  }
  tables.push('','详细缺项、旧值修正、来源标记和原因可查 CSV。取用原表时可凭食品编号、原字段编号及单位复核。','',
    '[逐项缺值及旧值修正](NUTRIENT-GAPS.csv) · [来源、规则和复现命令](NUTRIENT-DATA.md)','');
  return tables.join('\n');
}
function details() {
  const csv=[['食材ID','食材','分类','状态','字段','营养素','单位','旧数值','审核数值','状态','阈值或样本最高','来源记录','原字段','记录原因']];
  for(const f of foods)for(const key of nutrientKeys){
    const old=(baseline.get(f.id) as Record<string,number|null>|undefined)?.[key]??null,entry=nutrientDatum(f.id,key);
    const now=entry?.[0]??null;
    if(now!==null&&(old===null||old===now))continue;
    csv.push([f.id,f.name,foodClass(f).group,foodState[f.state],key,...nutrientsList[key],old===null?'':String(old),
      now===null?'':String(now),entry?qualityLabels[entry[3]]:'未知',String(entry?.[4]??''),entry?.[1]??'',entry?.[2]??'',
      now!==null?'以核验来源的新数值为准':entry?'源文件没有可靠定量值':f.sourceUrl?'同状态官方表未查到口径匹配值':'USDA 该编号未公布，同状态补充源未匹配']);
  }
  return '\uFEFF'+csv.map(row=>row.map(csvCell).join(',')).join('\n')+'\n';
}

if(process.argv[1]?.endsWith('nutrition-audit.ts')){
  validateNutrientCatalog();
  const targets={'../docs/NUTRIENT-AUDIT.md':report(),'../docs/NUTRIENT-GAPS.csv':details()};
  for(const [path,content] of Object.entries(targets)){
    const url=new URL(path,import.meta.url);
    if(process.argv.includes('--write'))writeFileSync(url,content);
    else assert.equal(readFileSync(url,'utf8'),content,path+' 报告过期，请运行 npm run audit:nutrition -- --write');
  }
  console.log(foods.length+' 条食材，'+nutrientKeys.length+' 项审核字段，完整性校验通过。');
}
