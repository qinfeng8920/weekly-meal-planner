# 部署与手机验收

[正式网站](https://qinfeng8920.github.io/weekly-meal-planner/) · [V2.1 发布工作流](https://github.com/qinfeng8920/weekly-meal-planner/actions/runs/45801879129)

正式托管设计为 GitHub Pages。GitHub Actions 运行单元测试、构建和 Chromium 浏览器测试，再上传 `dist`。Vite 的相对路径与 Service Worker 的 scope 保证站点可放在仓库子路径。

首次发布时，GitHub Free 需先开启公开可见性。在安卓 Chrome 打开仓库 **Settings → General**，在页面底部 **Danger Zone → Change repository visibility** 选择 **Public** 并确认。随后可打开仓库的 **Settings → Pages → Build and deployment → Source**，选择 **GitHub Actions**。若选项在安卓上折叠，在 Chrome 菜单勾选「桌面版网站」再操作。之后在 **Actions → 测试与发布 → Run workflow** 选择 `main` 运行；成功后以 Actions 的发布链接为准。 [GitHub 官方说明](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)

手机验收时，先用虚构档案生成一周食谱，保存一个历史方案。按浏览器菜单安装到主屏幕，再开飞行模式从图标进入，检查能否查看和生成。新版出现提示后保存或导出需要的资料，再选「应用新版本」。不同浏览器或换手机需主动导入备份。

中国大陆访问情况与线路有关，目前需实地验证。备用方案可考虑独立静态托管，域名、套餐、流量和可能的备案要求以选定托管商和地域的实际规则为准。引入付费或改变隐私策略前须重新确认。


## V2.0 正式验收

发布代码提交为 `93425a2`。GitHub Actions 完成模块测试、生产构建和浏览器测试，Pages 部署成功。正式网址使用空白 Chromium 手机模拟上下文验证匿名访问、安装清单和图标、离线食材池生成、分批备餐、分装勾选、广东监测价及版本 V2.0.0。正式 Service Worker 与本地构建字节一致，缓存标识为 `f2d1c7ebbf92`。


## V2.1 正式验收

代码提交 `68201b0` 通过 GitHub Actions 的 39 项模块测试、9 项 Chromium 测试和生产构建，随后发布至原 GitHub Pages 地址。正式网址匿名打开并通过安装资源、离线生成、真实日期、2 次购物与 3 批备餐、分装进度、换算入口和 V2.1.0 版本验收。正式 Service Worker 与本地构建字节一致，缓存标识为 `892b216ee362`。

## V2.2 正式验收

程序提交 `0cec01d` 通过 45 项模块测试、11 项 Chromium 测试和生产构建，随后由 GitHub Pages 发布。新版正式 Service Worker 和本地生产构建字节一致，缓存标识 `29b13650a195`。匿名 Chromium 模拟安卓访问、安装资源、离线生成七天、两次采购与三批备餐、分装、离线购买入库及刷新后余额均通过。浅色与深色在 360、390、430 像素大字体检查了库存、档案、菜谱库和历史方案。真实手机安装及大陆网络线路待实测。 [发布记录](https://github.com/qinfeng8920/weekly-meal-planner/actions/runs/45837565537)

## V2.2.1 正式验收

提交 `392dcfb` 通过 45 项模块测试、12 项 Chromium 测试与生产构建，随后发布到原 GitHub Pages。线上 PWA 缓存 `73fdcd40a9a0` 与本地构建一致。匿名模拟安卓离线勾选后，食材标记、折叠分类、采购批次和全周进度均可见，刷新后仍保留。 [发布记录](https://github.com/qinfeng8920/weekly-meal-planner/actions/runs/45855739343)

## V2.3 正式验收

最终生产提交为 `135b436`。GitHub Actions 通过 51 项模块、14 项 Chromium 端到端测试和生产构建，随后发布至原 GitHub Pages。线上 Service Worker 与本地生产文件字节相同，缓存标识 `b6e8c753eb9d`。初始匿名模拟安卓成功离线生成、确认实购金额 18.37 元、查看实付与待购估算，折叠进度和付款在刷新后保留。V2.2.1 的旧资料、历史和取用流水通过同源升级复核。安卓实体机尚未测试。 [最终发布](https://github.com/qinfeng8920/weekly-meal-planner/actions/runs/45861101424)

## V2.3.1 正式验收

最终生产提交 `1bf5f3c` 通过 56 项模块测试、16 项 Chromium 端到端测试和生产构建。GitHub Pages 已发布，线上 Service Worker 与本地一致，缓存标识 `47db68f3ff82`。匿名 Chromium 模拟安卓复核离线生成、确认实付 18.37 元、折叠进度、刷新保留、清空和撤销。清空后的实付仍为 18.37 元。安卓实体机未测试。 [正式工作流](https://github.com/qinfeng8920/weekly-meal-planner/actions/runs/45947514141)

## V2.3.2 采购排版正式验收

提交 `35bdd95` 通过 56 项模块、17 项 Chromium 测试和生产构建，已发布至原站。线上 PWA 缓存标识 `883f80a55c9b` 与本地生产文件一致。模拟手机确认长规格、部分购买状态与离线刷新。 [发布记录](https://github.com/qinfeng8920/weekly-meal-planner/actions/runs/45949122904)

## V2.4 正式验收

程序提交 `a7422da` 通过 GitHub Actions 的 62 项模块测试、19 项 Chromium 测试和生产构建，已发布至原 GitHub Pages。线上与本地 Service Worker 的 SHA-256 均为 `59e4094ad7567e9a703cd966bfb91a54991c10f422ac7b4d1b18cb3a08f5b7a8`，PWA 缓存标识为 `12c0c942fd52`。

正式站匿名 HTTPS 返回 200。真实 Chromium 模拟安卓，在断网刷新后完成生成、确认固定橙子、排除同核心橙子候选、指定绿色猕猴桃并联动采购。两个大全均可离线打开，360、390、430 像素布局通过。实际 V2.3.2 同源升级复核通过，旧档案、体重、价格、库存流水、历史方案及已执行餐次保留。 [正式站](https://qinfeng8920.github.io/weekly-meal-planner/) · [发布记录](https://github.com/qinfeng8920/weekly-meal-planner/actions/runs/45953770468)

## V2.4.1 正式验收

程序提交 `2ac2788` 通过 68 项模块测试、21 项 Chromium 测试、生产构建及 GitHub Pages 部署。108 个多食材锁定种子全部通过。旧 V2.4.0 的同源 PWA 升级验证了旧偏好、历史、已购和已完成餐次的保留。

正式网址匿名 HTTPS 返回 200。Chromium 模拟安卓完成离线锁定鸡胸肉和瘦牛肉、刷新恢复、沿用食材时新增番石榴，并打开两个大全。360、390、430 像素视口通过。线上与本地 Service Worker 指纹均为 `b41dda8563e37e5540511361531ae4ce0c3ba0dfa706ad88092004d55ea09f58`，缓存标识为 `41d2ba761b4a`。 [正式站](https://qinfeng8920.github.io/weekly-meal-planner/) · [发布记录](https://github.com/qinfeng8920/weekly-meal-planner/actions/runs/45983770965)

## V3.0 正式验收

代码提交 `89e0bea`。GitHub Actions 通过 68 项模块测试、26 项 Chromium 端到端测试及生产构建，已部署至原 GitHub Pages 地址。匿名 Chromium 访问返回 HTTPS 200，页面显示 V3.0.0。正式 Service Worker 与本地构建逐字节一致，缓存标识为 `59a6a724b5d9`。正式站断网后可保存并恢复多个锁定食材、沿用新设置生成食谱、登记采购、查看分批备餐及在关闭原材料详情后保留搜索。另使用同源旧生产构建验证更新保留 IndexedDB 数据。 [正式发布工作流](https://github.com/qinfeng8920/weekly-meal-planner/actions/runs/45989236324)

## V3.1 正式验收

最终代码提交 `9984ce7`。GitHub Actions 通过 74 项模块测试、27 项 Chromium 端到端测试及生产构建。专项 100 个种子通过 100 个，远程执行与复核用时约 5.6 秒。GitHub Pages 已部署到原网址。用独立 Chromium 访问正式站确认版本 V3.1.0，Service Worker 与本地生产构建逐字节一致，缓存标识 `de68df540235`。正式站复现男性 25 岁、173 厘米、久坐、明确选择标准 300 千卡且确认适用的示例，72 至 71 千克时建议热量由 1718 变为 1721 千卡。正式站分别通过离线重配、多食材锁定保存、采购登记、分批备餐和原材料大全返回验证。同源 V3.0 至 V3.1 升级另验证 IndexedDB 数据逐字段保留。 [正式发布工作流](https://github.com/qinfeng8920/weekly-meal-planner/actions/runs/46101638561)

## V3.1.1 正式验收

代码提交 `21dce82` 的模块测试、28 项 Chromium 流程及生产构建通过，已部署到原网址。正式站用独立 Chromium 会话复现旧档案在 71 千克时显示 2006 千卡，通过首页设置、确认适用后变为 1721 千卡，离线刷新仍保留。正式缓存 `eaf8c5fb0d53` 与本地构建逐字节一致。同源升级保留 IndexedDB 旧数据及已执行记录。库存清空测试的后续修正移除随机方案中首件商品固定为鸡蛋的假设，独立重复三次通过。 [正式发布工作流](https://github.com/qinfeng8920/weekly-meal-planner/actions/runs/46102513141)

## V3.1.2 正式验收

提交 `3fd361d` 通过 74 项模块测试、30 项 Chromium 流程与生产构建。正式站以只有 71 千克档案体重的测试资料验证，选择缓慢减脂可查看预计目标，取消仍显示 2006 千卡，确认适用后更新为 1721 千卡，离线刷新仍保留。正式缓存 `a1d99b2f03ed` 与本地构建相同。V3.1.1 至 V3.1.2 的同源升级核对旧档案、历史、已执行任务及库存逐字段一致。 [正式发布工作流](https://github.com/qinfeng8920/weekly-meal-planner/actions/runs/46103178762)

## V3.2 正式验收

最终发布提交为 `f973a98`。GitHub Actions 通过 76 项模块测试、35 项 Chromium 端到端测试和生产构建，并部署至原地址。另以 WebKit 的 iPhone 13 配置通过 3 项增重及多档案验证。 [正式发布工作流](https://github.com/qinfeng8920/weekly-meal-planner/actions/runs/46125065404)

正式站匿名 HTTPS 返回 200。独立 Chromium 确认 V3.2.0、72 千克虚构档案的 1815 千卡目标及断网刷新。线上 Service Worker 与本地生产文件的 SHA-256 均为 `2a8f8d62f6068cb09265a7a37f0576d91f1a0cbf4b7755dd0c87bef8159d43b1`，缓存标识为 `d72ef9efab6e`。另在原网址用同一虚构浏览器档案从 V3.1.2 升级，档案、称重、库存、实际购买、收藏、历史和执行数据逐字段一致，断网更新未执行食谱后已执行餐次和流水仍保留。实体手机安装未实测。 [正式站](https://qinfeng8920.github.io/weekly-meal-planner/)
