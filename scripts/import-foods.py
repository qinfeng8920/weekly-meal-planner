"""Usage: python scripts/import-foods.py /path/to/USDA-SR-Legacy.zip"""
import csv
import io
import json
import sys
import zipfile
from pathlib import Path

root = Path(__file__).resolve().parent.parent
keys = dict(zip(
    [1008, 1003, 1005, 1004, 1079, 1093, 1087, 1092, 1162],
    ['kcal', 'protein', 'carbs', 'fat', 'fiber', 'sodium', 'calcium', 'potassium', 'vitaminC']
))
with zipfile.ZipFile(sys.argv[1]) as archive:
    def rows(name):
        file = next(n for n in archive.namelist() if n.endswith('/' + name + '.csv'))
        with archive.open(file) as contents:
            yield from csv.DictReader(io.TextIOWrapper(contents, encoding='utf-8-sig'))

    source = {r['fdc_id']: r['description'] for r in rows('food')}
    selection = [(row + '\t' * 6).split('\t')[:7] for row in (root / 'scripts/foods.tsv').read_text().splitlines()]
    nutrients = {row[3]: {} for row in selection}
    for row in rows('food_nutrient'):
        record = nutrients.get(row['fdc_id'])
        key = keys.get(int(row['nutrient_id']))
        if record is not None and key and row['amount']:
            value = float(row['amount'])
            if key in record and value != record[key]:
                raise ValueError(f"Conflicting values: {row['fdc_id']} {key}")
            record[key] = value
    output = []
    for id_, name, category, fdc, state, allergens, aliases in selection:
        output.append(dict(id=id_, name=name, category=category, fdc=int(fdc), description=source[fdc],
                           state=state, allergens=allergens.split(',') if allergens else [],
                           aliases=aliases.split(',') if aliases else [],
                           nutrients={key: nutrients[fdc].get(key) for key in keys.values()}))
    (root / 'src/foods.json').write_text(json.dumps(output, ensure_ascii=False, indent=2) + '\n')
    print(len(output), 'records;', sum(all(f['nutrients'][k] is not None for k in list(keys.values())[:5]) for f in output), 'with complete macros')
    print('Missing macros:', [f['id'] for f in output if any(f['nutrients'][k] is None for k in list(keys.values())[:5])])
