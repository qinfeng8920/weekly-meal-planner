"""用 USDA SR Legacy CSV 压缩包重建扩展食材基础数据。"""
import csv
import io
import json
import math
import sys
from pathlib import Path
from zipfile import ZipFile

root = Path(__file__).resolve().parents[1]
legacy = json.loads((root / 'src/foods.json').read_text())
selected = list(csv.reader((root / 'scripts/foods-v24.tsv').read_text().splitlines(), delimiter='|'))
keys = dict(zip(
    [1008, 1003, 1005, 1004, 1079, 1093, 1087, 1092, 1162, 1089, 1090, 1095, 1177, 1178],
    ['kcal', 'protein', 'carbs', 'fat', 'fiber', 'sodium', 'calcium', 'potassium', 'vitaminC',
     'iron', 'magnesium', 'zinc', 'folate', 'vitaminB12'],
))
existing_ids = {f['id'] for f in legacy}
existing_fdc = {str(f['fdc']) for f in legacy if f.get('fdc') and not f.get('sourceUrl')}
for id_, _, _, fdc, *_ in selected:
    if id_ in existing_ids or fdc in existing_fdc:
        raise ValueError(f'重复食材或营养来源 {id_} {fdc}')
    existing_ids.add(id_)
    existing_fdc.add(fdc)

with ZipFile(sys.argv[1]) as archive:
    def rows(name):
        path = next(n for n in archive.namelist() if n.endswith('/' + name + '.csv'))
        with archive.open(path) as contents:
            yield from csv.DictReader(io.TextIOWrapper(contents, encoding='utf-8-sig'))

    descriptions = {r['fdc_id']: r['description'] for r in rows('food') if r['fdc_id'] in existing_fdc}
    nutrients = {id_: {} for id_ in descriptions}
    for row in rows('food_nutrient'):
        values = nutrients.get(row['fdc_id'])
        key = keys.get(int(row['nutrient_id']))
        if values is None or not key or not row['amount']:
            continue
        value = float(row['amount'])
        if not math.isfinite(value) or value < 0 or (key in values and values[key] != value):
            raise ValueError((row['fdc_id'], key, value))
        values[key] = value

base_keys = list(keys.values())[:9]
output = []
for id_, name, category, fdc, state, allergens, aliases, subcategory in selected:
    values = nutrients[fdc]
    output.append(dict(id=id_, name=name, category=category, fdc=int(fdc), description=descriptions[fdc],
                       state=state, allergens=allergens.split(',') if allergens else [],
                       aliases=aliases.split(',') if aliases else [], subcategory=subcategory,
                       nutrients={k: values.get(k) for k in base_keys}))
(root / 'src/foods-v24.json').write_text(json.dumps(output, ensure_ascii=False, indent=2) + '\n')
print(len(output), '条扩展食材')
print('缺失核心营养', [f['id'] for f in output if any(f['nutrients'][k] is None for k in base_keys[:5])])
