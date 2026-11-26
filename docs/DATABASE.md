# 食材及菜谱

食材版本 2026.11-sr2。128 个 FDC 编号来自 USDA FoodData Central SR Legacy 2018 年 4 月 CSV。脚本按已选原始编号提取并校验重复值，译名及过敏标签由项目维护。能量是千卡，蛋白、碳水、脂肪、纤维为克，钠、钙、钾和维生素 C 为毫克。均以每 100 克指定状态可食部分计。 [下载页](https://fdc.nal.usda.gov/download-datasets/) · [字段与数据说明](https://fdc.nal.usda.gov/data-documentation/)

- `scripts/foods.tsv` 维护项目 ID、中文名、分类、FDC 编号、数据状态、过敏原及别名。下载 SR Legacy CSV 后执行 `python scripts/import-foods.py 数据.zip`，输出可离线使用的 `src/foods.json`。
- 128 条记录的五项主要营养数据完整。任何其他指标缺失时保留空值。套餐汇总时未知指标保持未知。
- `src/catalog.ts` 和 `src/quick-recipes.ts` 共有 160 道原创建议配方，包括按食材定制的蒸、煎、汤和蔬菜做法。食材和所有列出的调味品参与计算。名称是菜单建议，烹调时间需按厚度、设备和分量调整。
- `src/meal-catalog.ts` 独立保存餐次及所在槽位，维护 43 套中式、西式、快捷、粗粮和高蛋白早餐搭配。新增数据来自 7 个明确状态的 FDC 条目，如熟糙米、无盐熟鸡胸和强化钙无糖豆浆。强化产品按食品标签核对，普通豆浆与不同凝固剂制成的豆腐所含钙量可能不同。
- 份量按干重、可食原料或已有成品净重标注。由于切割、品牌和烹饪方式差异，项目没有录入通用生熟转换或可食率。肉和鱼按去骨净料安排，带皮水果和带壳鸡蛋等采购量按净料下限展示。可使用用户按包装或称量录入的可食率换算毛重，再按包装重量向上取整。
- 价格、当地包装和库存使用用户录入的数据。无可靠单价格时显示费用未知。食谱的微量营养来自组成原料，未估计烹调保留率。
- 过敏原标签是明示配方范围。购买豆腐、酱油、面包和其它预包装产品时仍需看包装，并留意交叉接触。

## 备餐安全资料

熟食分浅盒，室温最多 2 小时，高于 32°C 缩短为 1 小时。冷藏不超过 4°C，冷冻 −18°C 或更低。一般剩菜的监管资料上限为 3～4 天，应用偏向两天内食用，较晚食用的份量当天冷冻。鸡肉 74°C、整切牛猪肉 63°C 并静置 3 分钟、鱼 63°C、蛋类菜 71°C，剩菜复热 74°C。备餐时间与安全储存条件不同。 [USDA 安全温度表](https://www.fsis.usda.gov/food-safety/safe-food-handling-and-preparation/food-safety-basics/safe-temperature-chart) · [USDA 剩菜须知](https://www.fsis.usda.gov/food-safety/safe-food-handling-and-preparation/food-safety-basics/leftovers-and-food-safety)
