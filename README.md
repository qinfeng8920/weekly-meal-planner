# 天天减 V1.1

天天减是一款简体中文 PWA。它根据成人档案、厨房条件和饮食偏好，生成七天食谱，并汇总多人采购和备餐。档案、记录与方案保存在当前浏览器，可导出备份。

[打开天天减](https://qinfeng8920.github.io/weekly-meal-planner/)

## 手机上使用

1. 用安卓 Chrome 或 iPhone Safari 打开部署网址。点「开始填写档案」，完成健康和过敏筛查。
2. 回到首页生成本周食谱。食谱页可以按餐设置偏好、固定早餐搭配、换单项、查看克数、做法及全周营养检查。
3. 到「采购」勾选已购买项目，或查看备餐。在「我的」导出个人备份。
4. 安卓 Chrome 点菜单中的「安装应用」或「添加到主屏幕」。iPhone Safari 点底部分享按钮，再点「添加到主屏幕」。

首次在线缓存完成后可以离线使用。新版缓存完成后，从顶部提示选择「应用新版本」。普通网页访问会经过静态托管服务，应用不发送健康档案，不接入第三方运行时资源。

## 开发与验收

需要 Node.js 24 和 npm。执行 `npm ci`、`npm test`、`npm run build`。浏览器测试执行 `npx playwright install chromium` 与 `npm run test:e2e`。已有系统 Chromium 时可设 `TTJ_CHROMIUM` 为其可执行文件绝对路径。开发预览使用 `npm run dev`。

- [产品需求](docs/PRD.md)
- [已完成和待验证事项](docs/STATUS.md)
- [测试记录](docs/TESTING.md)
- [营养规范](docs/NUTRITION.md)
- [数据结构和来源](docs/DATABASE.md)
- [食谱算法](docs/ALGORITHM.md)
- [界面规范](docs/UI.md)
- [部署和手机验收](docs/DEPLOYMENT.md)
- [版本记录](docs/CHANGELOG.md)
