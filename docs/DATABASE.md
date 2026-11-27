# 食材及菜谱

食材版本 2026.11-sr3。128 个 FDC 编号来自 USDA FoodData Central SR Legacy 2018 年 4 月 CSV。脚本按已选原始编号提取并校验重复值，译名及过敏标签由项目维护。能量是千卡，蛋白、碳水、脂肪、纤维为克，钠、钙、钾和维生素 C 为毫克。均以每 100 克指定状态可食部分计。 [下载页](https://fdc.nal.usda.gov/download-datasets/) · [字段与数据说明](https://fdc.nal.usda.gov/data-documentation/)

- `scripts/foods.tsv` 维护项目 ID、中文名、分类、FDC 编号、数据状态、过敏原及别名。下载 SR Legacy CSV 后执行 `python scripts/import-foods.py 数据.zip`，输出可离线使用的 `src/foods.json`。
- 128 条记录的五项主要营养数据完整。任何其他指标缺失时保留空值。套餐汇总时未知指标保持未知。
- `src/catalog.ts`、`src/quick-recipes.ts` 和 `src/cooking-recipes.ts` 共有 179 道原创建议配方，包括按食材定制的蒸、煎、汤和蔬菜做法。食材和所有列出的调味品参与计算。名称是菜单建议，烹调时间需按厚度、设备和分量调整。
- `src/meal-catalog.ts` 独立保存餐次及所在槽位，维护 43 套中式、西式、快捷、粗粮和高蛋白早餐搭配。新增数据来自 7 个明确状态的 FDC 条目，如熟糙米、无盐熟鸡胸和强化钙无糖豆浆。强化产品按食品标签核对，普通豆浆与不同凝固剂制成的豆腐所含钙量可能不同。
- 份量按干重、可食原料或已有成品净重标注。由于切割、品牌和烹饪方式差异，项目没有录入通用生熟转换或可食率。肉和鱼按去骨净料安排，带皮水果和带壳鸡蛋等采购量按净料下限展示。可使用用户按包装或称量录入的可食率换算毛重，再按包装重量向上取整。
- 价格、当地包装和库存使用用户录入的数据。无可靠单价格时显示费用未知。食谱的微量营养来自组成原料，未估计烹调保留率。
- 过敏原标签是明示配方范围。购买豆腐、酱油、面包和其它预包装产品时仍需看包装，并留意交叉接触。

## 备餐安全资料

熟食分浅盒，室温最多 2 小时，高于 32°C 缩短为 1 小时。冷藏不超过 4°C，冷冻 −18°C 或更低。一般剩菜的监管资料上限为 3～4 天，应用偏向两天内食用，较晚食用的份量当天冷冻。鸡肉 74°C、整切牛猪肉 63°C 并静置 3 分钟、鱼 63°C、蛋类菜 71°C，剩菜复热 74°C。备餐时间与安全储存条件不同。 [USDA 安全温度表](https://www.fsis.usda.gov/food-safety/safe-food-handling-and-preparation/food-safety-basics/safe-temperature-chart) · [USDA 剩菜须知](https://www.fsis.usda.gov/food-safety/safe-food-handling-and-preparation/food-safety-basics/leftovers-and-food-safety)

1.2.0 新增 19 道快捷早餐、一锅、凉拌、集中备餐、家常与精致配方，采用已有可追溯 FDC 食材。结构化语义与烹饪工作量元数据分别在 `src/food-semantics.ts` 和 `src/cooking.ts`。历史快照保留既有配方和营养数据。


## V2.4 来源、校验与扩库

- USDA SR Legacy 2018 采用 FoodData Central 的 CC0 公共数据。人工核对的 ID 和食品状态在 `scripts/foods-v24.tsv`，运行 `python scripts/import-v24-foods.py <官方原始 ZIP>` 更新扩展 JSON 和铁、镁、锌、叶酸、维生素 B12 索引。 [USDA 下载](https://fdc.nal.usda.gov/download-datasets/) · [数据许可](https://fdc.nal.usda.gov/about-us/)
- 火龙果、杨梅和红色小番茄出典为「日本食品標準成分表（八訂）増補2023年」，按表中的每百克可食部记录。火龙果的钠为微量，界面显示数据精度，校验按每百克 0.5 毫克上界计算。 [文部科学省数据说明](https://www.mext.go.jp/a_menu/syokuhinseibun/) · [微量符号](https://fooddb.mext.go.jp/help.html)
- 新食材默认价格按购买净重明确标记为估算。没有核验的可食率、干湿转换、地区改良品种营养和出成率保留未知。使用者可录入包装或实际单价。
- 记录的 5 项关键营养缺失食材和暂缺审核做法的原料可浏览。数据库校验覆盖 ID、来源、状态、菜谱引用、称量值、厨具、精确重复配方及营养。执行 `node --import tsx scripts/catalog-report.ts` 可列出覆盖与待补项。
- 拼音索引通过 `node scripts/build-pinyin-index.mjs` 生成，静态离线使用，构建维护依赖为 MIT 许可的 pinyin-pro。
