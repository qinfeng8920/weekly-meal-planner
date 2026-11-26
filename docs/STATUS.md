# 当前开发状态

| 阶段 | 当前成果 | 主要文件 |
| --- | --- | --- |
| 0 环境 | 云端检出空白仓库，核对 npm 和 GitHub 仓库访问以及权限 | `docs/PRD.md`、`AGENTS.md` |
| 1 基础 | 五页导航、手机优先布局、浅深色和空状态 | `src/main.tsx`、`src/style.css` |
| 2 档案与计算 | 六步档案、安全筛查、成人能量与营养估算、体重趋势 | `src/ProfileForm.tsx`、`src/nutrition.ts`、`src/Dashboard.tsx` |
| 3 数据库 | 128 种可追溯食材、183 道菜、43 套早餐搭配 | `scripts/foods.tsv`、`src/foods.json`、`src/catalog.ts` |
| 4 生成 | 分餐模板、食材语义去重、五种烹饪模式、快捷调整与日周校验 | `src/planner.ts`、`src/PlanPage.tsx` |
| 5 采购备餐 | 独立采购和备餐周期、128 种广东价格、确认实付、预计结转、按菜谱安排安全操作 | `src/shopping.ts`、`src/ShoppingPage.tsx` |
| 6 历史与数据 | IndexedDB、体重日志、历史独立快照和重新使用校验 | `src/store.ts`、`src/main.tsx` |
| 7 离线与备份 | 安装清单、离线缓存、版本更新与 JSON 恢复 | `public/manifest.webmanifest`、`scripts/sw.mjs` |
| 8 验收 | 单元与 Chromium 端到端验收，结果单列 | `tests/`、`docs/TESTING.md` |
| 9 发布 | GitHub Pages 已上线。匿名访问、正式子路径资源、模拟手机离线生成均已验证 | `.github/workflows/pages.yml`、`docs/DEPLOYMENT.md` |

## 已知限制与下一步

- 本版根据实际可食率调整采购毛重，尚无按中国市场食材形态核验的默认可食率表。菜谱用可食部、干重或成品状态，未提供通用生熟系数。默认广东售价按来源和口径标注，支持录入本地实际单价，未提供实时价格。
- 菜谱目前偏向中式和少量西式。系统记录更多菜系偏好，尚需扩充川湘、日韩、更多主食和便当品种。不同地区、极紧预算及多重限制下可能找不到满足条件的组合。
- 备餐提供逐日菜单和分批建议。多人并行操作、设备容量、冷冻保质期按各食材实际情况核查。
- 个人数据由本机保存。备份恢复采用经二次确认的覆盖模式；未提供跨设备同步和自动合并。
- 后续验收包括安卓与 iPhone 真机安装、手动全按钮检查和中国大陆线路验证。 [正式站点](https://qinfeng8920.github.io/weekly-meal-planner/)

- 烹饪时长为按步骤和厨具估算。同一模式在厨具、食材、营养或用户时间上限不同的情况下可采用不同菜品。极严的限时、最多菜数或忌口可能导致无解。

- 广东默认价格覆盖 128/128，价格、库存和批次都保存在设备。保存历史会冻结当时的安排和费用。 [采购说明](PURCHASE.md)

## V2.0 开发

| 阶段 | 完成情况 | 实现 |
| --- | --- | --- |
| 审计和布局 | 对照 V1.3 基线，保存原始附件，规划手机布局 | [附件](PRD-V2.md) · [审计](V2-IMPLEMENTATION.md) |
| 核心食材池 | 分类上限、严格限定、三种来源、食材锁定排除、周间轮换与模板 | `src/ingredient-pool.ts`、`src/pool-storage.ts` |
| 配餐 | 先筛食材再配餐。沿用现有约束、增加四道一锅餐、新增采购食材确认 | `src/planner.ts`、`src/cooking-recipes.ts` |
| 备餐与库存 | 按份标签、任务进度、实际领用、跨批跨周费用、并行耗时 | `src/logistics.ts`、`src/execution.ts` |
| 手机界面与性能 | 紧凑首页、独立设置、行内改价、分类和过滤，生成可取消 | `src/PoolPage.tsx`、`src/ShoppingPage.tsx`、`src/planner.worker.ts` |
| 验收和部署 | 基线 V1.3 通过 30 项模块与 7 项浏览器测试。V2 数据见独立记录 | [测试](TESTING.md) · [发布](DEPLOYMENT.md) |

食材分类数为可调上限。偏好目标受厨具和营养约束影响。排程按一个操作者、每类加热设备一台估算。包装剩余为预算预测，实际库存按录入、已购和已取用记录计算。
