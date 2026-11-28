# V3.2 补充任务 · 全食材营养数据库

## 数据与统计口径

审查基线为 V3.2.0。覆盖原始、扩充、鲜、生、熟、干、冷冻、即食和复合调味料。共 36 项。用户列出的 35 项以外，独立记录天然叶酸。食材 ID、采购关联、价格实例、库存、食谱及执行记录结构沿用 V3.2。现有应用支持自定义价格、包装和配方用量，档案与备份 Schema 没有自定义食材表。以后录入此类食材时同样需要通过配餐准入。

`src/food-nutrition-v32.json` 保存每 100 克对应称重状态下的可食部成分。每个值附食品来源编号、营养素原字段、质量标记和已知阈值。数值不齐时用空值。供应表的 “0” 可表示没有成分、低于报告限、来源推定或文献处理，按来源说明分别显示。没有证据支持定量零的项目不进入已知合计。已核对的零营养包括纯油的蛋白质和膳食纤维、未裹料动物性食品的膳食纤维，以及来源明确报不含维生素 B12 的天然未强化植物原料。定量来源的计算值、标签、跨地区参考值均有标记。

生熟、干重和成品口径独立。原始表是可食部每 100 克。所有液体也按克保存。没有用体积数据替代重量数据。没有食品供应商或准确配方的行保留缺值，例如未指定加碘类型的食盐缺少碘数据。酱油以原 FDC 大豆与小麦酱油条目为参考，米醋以日本文部科学省 17016 米醋为参考。地区、品牌、强化剂、粗细与过滤工艺有区别时只录入口径匹配的字段。

天然叶酸与总叶酸分别保留。DFE 按来源单独记录。日本原表三个未强化鲜原料的食物叶酸按 1 微克天然叶酸等于 1 微克 DFE 计算，并标估算。未知合成叶酸时不由总叶酸代算 DFE，合成叶酸的上限也不用于评估总叶酸或总 DFE。总糖不能用添加糖上限评分。烟酸与烟酸当量、α-生育酚与总 α-生育酚当量各有口径说明。维生素 K 的 USDA 和 CoFID 主体为 K1，日本表记录的食品有来源口径，统一仅作参考展示。维生素 A 的预成型视黄醇上限不与总 RAE 直接比较。

每日和全周日均按计划原料用量计算。已知小计除以全部计划天数。覆盖率按每个营养素有定量记录的食材重量占总用料重量计算。重复用料按相同食材状态累计，缺值清单去重。确有范围的微量记录保留其范围，不加进已知小计。成分仅部分覆盖时无法确定总摄入量。如果已知小计高于适用限值，仍会显示已知部分超限。单份菜谱显示用量和参考口径，不按单道菜判断全天营养是否充足。既有历史营养快照和执行记录保持，新增细项按现行的同状态成分表计算。

适用成年人按《2023版中国居民膳食营养素参考摄入量》表 9–14 和 20–23，以性别、年龄和现有健康筛查选择参考。50–64 岁女性铁参考同时列出有月经及无月经的值。饱和脂肪的 10% 按方案总能量折算。已保存的历史方案仍使用生成时的个人快照。 [中国成人 18–49 岁参照表](https://www.cnsoc.org/drpostand/) · [50 岁及以上参照表](https://www.cnsoc.org/drpostand/page2.html)

## 数据来源与授权

- USDA FoodData Central SR Legacy 2018 是现有 220 条带 FDC 编号食材的主表。导入检查 USDA 营养编号及单位，编码保留原派生方式。Foundation Foods 2026-04 只补无糖常温豆浆的同规格未报告指标，以其已记录的钙、维生素 A、D 核对强化条件。美国官方数据属于公有领域。 [USDA 数据下载](https://fdc.nal.usda.gov/download-datasets/) · [USDA 使用说明](https://fdc.nal.usda.gov/api-guide/)
- USDA、FDA 和 NIH 的碘数据库采用 2024 年第 4 版每 100 克表。匹配同状态、同可食部和可核验食品规格。零值保持来源标记。 [碘数据库及说明](https://www.ars.usda.gov/northeast-area/beltsville-md-bhnrc/beltsville-human-nutrition-research-center/methods-and-application-of-food-composition-laboratory/mafcl-site-pages/iodine/)
- 日本食品标准成分表（八订）增补 2023 年，使用官方 2026 年 3 月更正工作簿，保留食品编号与原成分标识。日本文部科学省允许注明来源后再利用。补充同状态食品时限定可采用字段。 [原表及修订](https://www.mext.go.jp/a_menu/syokuhinseibun/mext_00001.html) · [标记定义](https://fooddb.mext.go.jp/help.html) · [引用许可](https://www.mext.go.jp/a_menu/syokuhinseibun/)
- 英国 Public Health England 维护的 McCance and Widdowson’s Composition of Foods Integrated Dataset 2021。保留 “Contains public sector information licensed under the Open Government Licence v3.0” 的归属。匹配表用于标注同种可食部，排除烹饪、包装、规格、强化和测量定义不一致的组合。 [CoFID 2021](https://www.gov.uk/government/publications/composition-of-foods-integrated-dataset-cofid) · [开放政府许可证](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/)
- 东盟《简明食物成分表》2014，手工核对 AAE55 鲜龙眼的钠及 AAD2、AAD17 生食材的总膳食纤维。 [东盟原表](https://inmu.mahidol.ac.th/aseanfoods/doc/OnlineASEAN_FCD_V1_2014.pdf)
- 未批量复制授权未确认的《中国食物成分表》。食品工程以营养数值事实为依据，储存的后台原表链接可定位源文件。 [天然食物维生素 B12 来源](https://ods.od.nih.gov/factsheets/VitaminB12-HealthProfessional/)

## 复现及准入

准备 Python 3 和 `openpyxl`。把官方原包分别放在参数目录下并命名。英国主表用 `cofid.xlsx`，日本主表用 `mext.xlsx`，日本脂肪酸第 2 章第 1 表用 `mext-fat.xlsx`，美国碘第 4 版原包用 `iodine.zip`，USDA Foundation 2026-04-30 CSV 原包用 `foundation.zip`。另传入 USDA SR Legacy 2018 CSV 压缩包。ASEAN 项已在脚本中逐条保存原表食品编号。锁定同类匹配见 `scripts/nutrition-matches.tsv` 和 `scripts/nutrition-mext-matches.tsv`。

| 原包 | SHA-256 |
| --- | --- |
| SR Legacy 2018 CSV | `b80817294b8850530aaedf2e515c02593b1824f763a0ff356e5c2081643e6fd0` |
| CoFID 2021 | `436e9445ef2adb2a75f3d7edd51302de3adad25385f9795fc94ba58bd030e97d` |
| Foundation 2026-04 | `70457ee9d9342f43bda2010318c85f04210c689fdeb9cd2da4c513b0e8dbc655` |
| USDA 碘第 4 版 | `bf8eab1cc7b152f4be035ff9fb53a1741a272182f8fa867eab06067f2177c2eb` |
| MEXT 主表 | `0d5a77077dd6cd91cbc2e6e317b8b218a38728c409eed452f1c10635a0d3099c` |
| MEXT 脂肪酸表 | `435ab7125d3de26fba968de952b463b71d011c6b0f50e8966112293c521fd5fd` |

```sh
python scripts/import-nutrition.py <官方原文件目录> <SR-Legacy-CSV.zip>
npm run audit:nutrition -- --write
npm run audit:nutrition
npm test
```

配餐 Worker 只载入轻量的审核索引。准入要求能量、蛋白质、脂肪、碳水、纤维和可审查的钠定量或上界。只有来源明确的检测报告阈值或来源样本最高值可以用作钠保守估算。不能确认营养口径的原材料仍可在大全与现有库存中查看。新数据必须通过重复 ID、原字段和单位、来源、食品状态、数值范围和重复成分图谱校验。数值上限用于发现全库单位或误抄异常，食材品类和加工方法还需人工核验。CI 重新检查数据库和审计报告。

[完整率及修正统计](NUTRIENT-AUDIT.md) · [逐食材缺值和原因](NUTRIENT-GAPS.csv)
