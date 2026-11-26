# 部署与手机验收

[正式网站](https://qinfeng8920.github.io/weekly-meal-planner/) · [成功的发布工作流](https://github.com/qinfeng8920/weekly-meal-planner/actions/runs/45750054596)

正式托管设计为 GitHub Pages。GitHub Actions 运行单元测试、构建和 Chromium 浏览器测试，再上传 `dist`。Vite 的相对路径与 Service Worker 的 scope 保证站点可放在仓库子路径。

首次发布时，GitHub Free 需先开启公开可见性。在安卓 Chrome 打开仓库 **Settings → General**，在页面底部 **Danger Zone → Change repository visibility** 选择 **Public** 并确认。随后可打开仓库的 **Settings → Pages → Build and deployment → Source**，选择 **GitHub Actions**。若选项在安卓上折叠，在 Chrome 菜单勾选「桌面版网站」再操作。之后在 **Actions → 测试与发布 → Run workflow** 选择 `main` 运行；成功后以 Actions 的发布链接为准。 [GitHub 官方说明](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)

手机验收时，先用虚构档案生成一周食谱，保存一个历史方案。按浏览器菜单安装到主屏幕，再开飞行模式从图标进入，检查能否查看和生成。新版出现提示后保存或导出需要的资料，再选「应用新版本」。不同浏览器或换手机需主动导入备份。

中国大陆访问情况与线路有关，目前需实地验证。备用方案可考虑独立静态托管，域名、套餐、流量和可能的备案要求以选定托管商和地域的实际规则为准。引入付费或改变隐私策略前须重新确认。
