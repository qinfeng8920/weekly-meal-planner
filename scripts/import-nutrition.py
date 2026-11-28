"""从官方工作簿和 SR Legacy 生成逐项营养数据库。使用说明见 docs/NUTRIENT-DATA.md。"""
import argparse
import csv
import io
import json
import math
from collections import Counter
from pathlib import Path
from zipfile import ZipFile

from openpyxl import load_workbook

ROOT = Path(__file__).resolve().parents[1]
# SR Legacy 营养素编号、规范单位。额外区分天然叶酸和合成叶酸。
FIELDS = {
    'kcal': (1008,'KCAL'), 'protein': (1003,'G'), 'fat': (1004,'G'), 'carbs': (1005,'G'),
    'fiber': (1079,'G'), 'sugar': (2000,'G'), 'saturated': (1258,'G'), 'monounsaturated': (1292,'G'),
    'polyunsaturated': (1293,'G'), 'cholesterol': (1253,'MG'), 'calcium': (1087,'MG'), 'iron': (1089,'MG'),
    'zinc': (1095,'MG'), 'potassium': (1092,'MG'), 'sodium': (1093,'MG'), 'magnesium': (1090,'MG'),
    'phosphorus': (1091,'MG'), 'selenium': (1103,'UG'), 'copper': (1098,'MG'), 'manganese': (1101,'MG'),
    'iodine': (1100,'UG'), 'vitaminA': (1106,'UG'), 'vitaminB1': (1165,'MG'), 'vitaminB2': (1166,'MG'),
    'vitaminB3': (1167,'MG'), 'vitaminB5': (1170,'MG'), 'vitaminB6': (1175,'MG'), 'vitaminB7': (1176,'UG'),
    'vitaminB12': (1178,'UG'), 'folate': (1177,'UG'), 'naturalFolate': (1187,'UG'), 'folateDfe': (1190,'UG'),
    'vitaminC': (1162,'MG'), 'vitaminD': (1114,'UG'), 'vitaminE': (1109,'MG'), 'vitaminK': (1185,'UG'), 'retinol': (1105,'UG'), 'folicAcid': (1186,'UG'),
}
MEXT = {'kcal':'ENERC_KCAL','protein':'PROT-','fat':'FAT-','carbs':'CHOCDF-','fiber':'FIB-',
        'cholesterol':'CHOLE','calcium':'CA','iron':'FE','zinc':'ZN','potassium':'K','sodium':'NA',
        'magnesium':'MG','phosphorus':'P','selenium':'SE','copper':'CU','manganese':'MN','iodine':'ID',
        'vitaminA':'VITA_RAE','vitaminB1':'THIA','vitaminB2':'RIBF','vitaminB3':'NIA','vitaminB5':'PANTAC',
        'vitaminB6':'VITB6A','vitaminB7':'BIOT','vitaminB12':'VITB12','folate':'FOL','vitaminC':'VITC',
        'vitaminD':'VITD','vitaminE':'TOCPHA','vitaminK':'VITK','retinol':'RETOL'}
MEXT_MINIMUM = {'fat':.1,'fiber':.1,'cholesterol':1,'sodium':1,'potassium':1,'calcium':1,'magnesium':1,
                'phosphorus':1,'iron':.1,'zinc':.1,'copper':.01,'manganese':.01,'iodine':1,'selenium':1,
                'vitaminA':1,'vitaminD':.1,'vitaminE':.1,'vitaminK':1,'vitaminB1':.01,'vitaminB2':.01,
                'vitaminB3':.1,'vitaminB5':.01,'vitaminB6':.01,'vitaminB7':.1,'vitaminB12':.1,'folate':1,'vitaminC':1}
# CoFID CHO/能量、RE、总维生素 E、烟酸当量、D(含羟基维生素 D) 与 SR 口径不同，禁止作为这些字段的替代。
COFID = {'1.3 Proximates': {'sugar':'TOTSUG','fiber':'AOACFIB','cholesterol':'CHOL',
                            'saturated':'SATFOD','monounsaturated':'MONOFOD','polyunsaturated':'POLYFOD'},
         '1.4 Inorganics': dict(zip(('sodium','potassium','calcium','magnesium','phosphorus',
                                   'iron','copper','zinc','manganese','selenium','iodine'),(7,8,9,10,11,12,13,14,16,17,18))),
         '1.5 Vitamins': {'vitaminK':'VITK1','vitaminB1':'THIA','vitaminB2':'RIBO','vitaminB3':'NIAC',
                          'vitaminB6':'VITB6','vitaminB12':'VITB12','folate':'FOLT','vitaminB5':'PANTO',
                          'vitaminB7':'BIOT','vitaminC':'VITC'}}
OILS = {'canola','olive','sesameoil','peanutoil','soyoil','cornoil','ricebranoil','avocadooil'}
VINEGARS = {'vinegar','ricevinegar','redwinevinegar','balsamic'}
IODINE_MATCH = {'salmon':496,'cod':375,'scallop':394,'bread':48,'cabbage':204,'spinach':206,'tomato':76,
                'whitefungi':141,'onion':82,'celery':73,'almond':227,'walnut':201,'garlic':454,
                'haddock':377,'halibut':378,'pollock':396,'catfish':499,'egg':353,'greek0':361,'banana':56,
                'avocado':67,'apple':54,'blueberry':196,'grape':63,'orange':55,'pear':60,'shrimp':391}
FUNGI = {'whitefungi','shiitake','oystermushroom','enoki','crimini','dryshiitake','portabella','maitake'}
# 份量工具只使用可溯源的宏量零：无添加油脂、食盐、醋及无纤维动物性食材。
def structural_zero(food, key):
    id_, category = food['id'], food['category']
    if id_ == 'salt' and key in {'kcal','protein','carbs','fat','fiber','sugar'}:
        return True
    if id_ in OILS and key in {'protein','carbs','fiber','sugar','cholesterol','vitaminB12'}:
        return True
    if id_ in VINEGARS and id_!='balsamic' and key in {'fat','fiber'}:
        return True
    if category in {'肉类','鱼虾','蛋','奶制品','乳制品','奶类'} and key == 'fiber':
        return True
    if category in {'肉类','鱼虾'} and key in {'carbs','sugar'} and food['state'] in {'raw','cooked'}:
        return True
    if id_=='cannedsalmon' and key=='carbs':
        return True
    return key=='vitaminB12' and id_ not in FUNGI and food['state']=='raw' and category in {'水果','蔬菜'}

def source_key(source, identifier):
    return f'{source}:{identifier}'

def record(value, source, code, quality='reported', upper=None):
    if value is not None and (not math.isfinite(value) or value < 0):
        raise ValueError((value,source,code))
    return [value,source,code,quality] + ([] if upper is None else [upper])

def workbook_rows(path):
    yield from load_workbook(path,read_only=True,data_only=True).worksheets[0].values

def parse_mext(raw, key, source, code, food):
    token = str(raw or ('0' if raw == 0 else '')).strip()
    estimated = token.startswith('(')
    token = token.strip('()')
    if token in {'','-','*'}:
        return None
    minimum = MEXT_MINIMUM.get(key)
    if token == 'Tr':
        return record(None,source,code,'trace',minimum*.5 if minimum else None)
    value = float(token)
    if value == 0:
        if structural_zero(food,key):
            return record(0,source,code,'structuralZero')
        threshold = minimum*(.3 if key in {'iodine','selenium','vitaminB7'} else .1) if minimum else None
        return record(None,source,code,'assumedZero' if estimated else 'trace',None if estimated else threshold)
    return record(value,source,code,'estimated' if estimated or key=='kcal' else 'reported')

def parse_cofid(raw, key, source, code):
    token = str(raw or '0' if raw == 0 else raw or '').strip()
    if token == 'Tr':
        return record(None,source,code,'trace')
    if token in {'','N','-'}:
        return None
    value = float(token)
    return record(value if value>0 else None,source,code,'reference' if value>0 else 'sourceZero')

def import_data(folder, sr_file):
    foods = [f for part in ['foods.json','foods-v24.json','foods-mext-v24.json']
              for f in json.loads((ROOT/'src'/part).read_text())]
    salt=json.loads((ROOT/'src/low-sodium-salt.json').read_text())
    foods.append(salt)
    by_fdc = {str(f['fdc']):f for f in foods if 'fdc' in f}
    values = {f['id']:{} for f in foods}
    sources = {}
    codes = {str(n):(k,u) for k,(n,u) in FIELDS.items()}
    def add(food, key, item, replace=False):
        if item is None:
            return
        previous = values[food].get(key)
        if previous is None or replace or previous[0] is None and item[0] is not None:
            values[food][key] = item

    with ZipFile(sr_file) as z:
        def table(name):
            path = next(x for x in z.namelist() if x.endswith('/'+name+'.csv'))
            with z.open(path) as f:
                yield from csv.DictReader(io.TextIOWrapper(f,encoding='utf-8-sig'))
        for row in table('nutrient'):
            if row['id'] in codes and row['unit_name'].upper() != codes[row['id']][1]:
                raise ValueError(('USDA 单位不匹配',row))
        methods = {r['id']:r['code'] for r in table('food_nutrient_derivation')}
        descriptions = {r['fdc_id']:r['description'] for r in table('food') if r['fdc_id'] in by_fdc}
        for fdc,food in by_fdc.items():
            if descriptions[fdc] != food['description']:
                raise ValueError(('USDA 食品描述有变化',food['id']))
            sources[source_key('fdc',fdc)] = descriptions[fdc]
        for row in table('food_nutrient'):
            food = by_fdc.get(row['fdc_id'])
            nutrient = codes.get(row['nutrient_id'])
            if food is None or nutrient is None or not row['amount']:
                continue
            key,_ = nutrient
            source = source_key('fdc',row['fdc_id'])
            val = float(row['amount'])
            method = methods.get(row['derivation_id'],'')
            code = row['nutrient_id'] + (':'+method if method else '')
            if val == 0:
                if structural_zero(food,key):
                    item = record(0,source,code,'structuralZero')
                elif key in {'kcal','protein','fat','carbs','fiber'} and method=='A' and int(row['data_points'] or 0)>0:
                    item = record(0,source,code)
                else:
                    observed_max = float(row['max']) if key=='sodium' and row['max'] else None
                    item = record(None,source,code,'assumedZero' if method=='Z' else 'sourceZero',observed_max or None)
            elif row['footnote'].startswith('<') or method in {'LCGL','LCSL'}:
                item = record(None,source,code,'trace',val)
            else:
                quality = ('label' if method.startswith('LC') or method=='ML'
                           else 'estimated' if method.startswith(('B','C','D','F','N','P','R')) or method in {'O','AR','AS'}
                           else 'reported')
                item = record(val,source,code,quality)
            if key in values[food['id']] and values[food['id']][key] != item:
                raise ValueError(('USDA 数据重复且不同',food['id'],key))
            add(food['id'],key,item)

    # 同一条食品记录；不跨品种或称量状态复制数值。
    by_mext = {f['sourceUrl'].split('=')[1].split('_')[1]:f for f in foods if 'mext.go.jp' in f.get('sourceUrl','')}
    fallback = {}
    for line in (ROOT/'scripts/nutrition-mext-matches.tsv').read_text().splitlines():
        if line and not line.startswith('#'):
            food,code,keys = line.split('\t')
            fallback.setdefault(code,[]).append((food,keys.split(',')))
    food_index={f['id']:f for f in foods}
    cols = {}
    for row in workbook_rows(folder/'mext.xlsx'):
        if row[3]=='成分識別子':
            cols = {str(name).strip():i for i,name in enumerate(row) if name}
        for food,keys in fallback.get(row[1],[]):
            source=source_key('mext',row[1])
            sources[source]=row[3]
            for key in keys:
                code=MEXT[key]
                datum=parse_mext(row[cols[code]],key,source,code,food_index[food])
                if datum and datum[0] is not None and datum[3]=='reported':
                    datum[3]='reference'
                previous=values[food].get(key)
                add(food,key,datum,bool(datum and len(datum)>4 and previous and previous[0] is None and len(previous)==4))
        if row[1] not in by_mext:
            continue
        food = by_mext[row[1]]
        source = source_key('mext',row[1])
        sources[source] = row[3]
        for key,code in MEXT.items():
            add(food['id'],key,parse_mext(row[cols[code]],key,source,code,food))
        # 日本成分表这些原材料未强化，天然食物叶酸与 DFE 按 1:1 换算。
        if food['state']=='raw' and values[food['id']].get('folate',[None])[0] is not None:
            amount = values[food['id']]['folate'][0]
            add(food['id'],'naturalFolate',record(amount,source,'FOL:无强化原料','estimated'))
            add(food['id'],'folateDfe',record(amount,source,'FOL:天然1:1 DFE','estimated'))
    for row in workbook_rows(folder/'mext-fat.xlsx'):
        if row[1] not in by_mext:
            continue
        food = by_mext[row[1]]
        source = source_key('mfat',row[1])
        sources[source] = row[3]
        for index,key,code in [(8,'saturated','FASAT'),(9,'monounsaturated','FAMS'),(10,'polyunsaturated','FAPU')]:
            add(food['id'],key,parse_mext(row[index],key,source,code,food))
    # MEXT 的可利用碳水并非总糖：未完整覆盖所有糖类时，不补总糖。
    with ZipFile(folder/'iodine.zip') as z:
        sheet = load_workbook(io.BytesIO(z.read(next(n for n in z.namelist() if '100g' in n))),read_only=True,data_only=True).active
        index = {r[0]:r for r in sheet.values if isinstance(r[0],int)}
    for food,num in IODINE_MATCH.items():
        row = index[num]
        source = source_key('iodine',num)
        sources[source] = row[3]
        val = float(row[5])
        add(food,'iodine',record(val if val else None,source,'Iodine mcg/100g','reference' if val else 'sourceZero'))

    # 同为无糖并含钙、维生素 A 和 D 的市售豆浆，仅补较稳定的缺项，保留原商品模型与主数据。
    with ZipFile(folder/'foundation.zip') as z:
        def foundation_table(name):
            path=next(x for x in z.namelist() if x.endswith('/'+name+'.csv'))
            with z.open(path) as file:
                yield from csv.DictReader(io.TextIOWrapper(file,encoding='utf-8-sig'))
        source=source_key('foundation',1999630)
        description=next(r['description'] for r in foundation_table('food') if r['fdc_id']=='1999630')
        if description!='Soy milk, unsweetened, plain, shelf stable':
            raise ValueError(('Foundation 食品规格有变化',description))
        sources[source]=description
        units={row['id']:row['unit_name'].upper() for row in foundation_table('nutrient')}
        target_keys={'zinc','folate','vitaminB7','copper','manganese','selenium','vitaminB1','vitaminB2','vitaminB6'}
        for row in foundation_table('food_nutrient'):
            if row['fdc_id']!='1999630' or row['nutrient_id'] not in codes or not row['amount']:
                continue
            key,unit=codes[row['nutrient_id']]
            if key not in target_keys:
                continue
            if units[row['nutrient_id']]!=unit:
                raise ValueError(('Foundation 单位不匹配',key))
            val=float(row['amount'])
            if val>0:
                add('soymilk',key,record(val,source,row['nutrient_id'],'reference'))

    # ASEAN 简明食物成分表（2014），100 克可食部。仅收录已对照原表的三个缺项。
    for id_,code,name,key,val in [
        ('longan','AAE55','Longan, fresh','sodium',9),
        ('yardlong','AAD17','Yard long bean, pod, green, fresh, raw','fiber',2.7),
        ('amaranthleaf','AAD2','Amaranth, spineless, fresh, raw','fiber',3.8),
    ]:
        source=source_key('asean',code)
        sources[source]=name
        add(id_,key,record(val,source,'Na' if key=='sodium' else 'TDF','reference'))

    cofid_codes = dict(line.split('\t') for line in (ROOT/'scripts/nutrition-matches.tsv').read_text().splitlines() if line and not line.startswith('#'))
    reverse = {code:food for food,code in cofid_codes.items()}
    wb = load_workbook(folder/'cofid.xlsx',read_only=True,data_only=True)
    for name, mapping in COFID.items():
        rows = iter(wb[name].values)
        headers = next(rows)
        codes_ = next(rows)
        positions = {key:(code if isinstance(code,int) else codes_.index(code)) for key,code in mapping.items()}
        for key,pos in positions.items():
            unit = FIELDS[key][1]
            if {'G':'(g)','MG':'(mg)','UG':'(µg)'}[unit] not in headers[pos]:
                raise ValueError(('CoFID 单位不匹配',key,headers[pos]))
        for row in rows:
            if row[0] not in reverse:
                continue
            food = reverse[row[0]]
            source = source_key('cofid',row[0])
            sources[source] = row[1]
            for key,pos in positions.items():
                add(food,key,parse_cofid(row[pos],key,source,codes_[pos] or headers[pos]))

    sodium=round(75000*22.990/(22.990+35.45),6)
    potassium=round(25000*39.098/(39.098+35.45),6)
    if (salt['nutrients']['sodium'],salt['nutrients']['potassium'])!=(sodium,potassium):
        raise ValueError('低钠盐配方元素含量与计算不一致')
    source=source_key('ssass','75NaCl25KCl')
    sources[source]='SSaSS 配方，按 CIAAW 元素质量折算'
    for k,v in salt['nutrients'].items():
        if v is not None:
            add(salt['id'],k,record(v,source,k,'estimated' if v else 'structuralZero'))
    for food in foods:
        id_ = food['id']
        if id_ in {'lambleg','pollock'} and values[id_].get('fiber') is None:
            values[id_]['fiber'] = record(0,source_key('fdc',food['fdc']),'无裹料纯肉：无膳食纤维','structuralZero')
        for key in FIELDS:
            values[id_].setdefault(key,None)
    return foods,sources,values

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source_directory',type=Path)
    parser.add_argument('sr_zip',type=Path)
    args = parser.parse_args()
    foods,sources,values = import_data(args.source_directory,args.sr_zip)
    doc = {'fields':list(FIELDS),'sources':dict(sorted(sources.items())),
           'foods':{f['id']:[values[f['id']][k] for k in FIELDS] for f in foods}}
    (ROOT/'src/food-nutrition-v32.json').write_text(json.dumps(doc,ensure_ascii=False,separators=(',',':'))+'\n')
    core = {}
    for food in foods:
        id_ = food['id']
        row = values[id_]
        macros = ('kcal','protein','carbs','fat','fiber')
        sodium = row['sodium']
        sodium_value = sodium[0] if sodium and sodium[0] is not None else sodium[4] if sodium and len(sodium)>4 else None
        core[id_] = {'verified':all(row[key] and row[key][0] is not None for key in macros),'sodium':sodium_value,
                     'additions':{k:row[k][0] for k,v in food['nutrients'].items() if v is None and row[k] and row[k][0] is not None}}
    # Worker 用数值与可审查上界，不载入来源文字和不参与算法的字段。
    track=['calcium','iron','zinc','potassium','sodium','magnesium','folateDfe','vitaminC','fiber','phosphorus',
           'selenium','copper','manganese','iodine','vitaminA','retinol','vitaminD','vitaminB1','vitaminB2',
           'vitaminB5','vitaminB6','vitaminB7','vitaminB12','folicAcid','saturated']
    projected={'keys':track,'foods':{f['id']:[values[f['id']][k][0] if values[f['id']][k] else None for k in track] for f in foods}}
    (ROOT/'src/nutrient-planning-values.json').write_text(json.dumps(projected,ensure_ascii=False,separators=(',',':'))+'\n')
    (ROOT/'src/food-planning-nutrients.json').write_text(json.dumps(core,ensure_ascii=False,separators=(',',':'))+'\n')
    print(len(foods),'条食材记录。数值覆盖',dict(Counter(k for row in values.values() for k,v in row.items() if v and v[0] is not None)))

if __name__=='__main__':
    main()
