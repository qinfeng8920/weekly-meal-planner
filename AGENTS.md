# 天天减开发规范

- 初版需求保存在 docs/PRD.md，V2.2 需求见 docs/PRD-V2.2.md。后续任务、库存和费用规则见 docs/ALGORITHM.md 与 docs/PURCHASE.md，变更同步更新相关文档、docs/STATUS.md 和 docs/CHANGELOG.md。
- 项目文档及界面使用简体中文。核心营养、食谱、采购算法保持独立于 React 和设备存储。
- 健康筛查、过敏、明确忌口和厨具限制是硬约束。数据缺失、搜索失败和实测范围需如实展示。
- 测试只使用虚构档案。未经确认不接入跟踪、账户、健康数据外传、付费服务或公开代码仓库。
- 提交前执行 npm test、npm run build 和可用的浏览器测试。移动端真机和发布结果分别记录。
