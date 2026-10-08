# 项目协作

- 本项目只从 Akasha API 读取游戏数据，不直接连接游戏数据来源
- 玩家状态由浏览器保存，WebDAV 凭据不发送到 Akasha，不写入导出文件
- 页面设计遵循 `.agents/skills/frontend-design/SKILL.md`，使用自定义冒险手册视觉系统；不使用 Ant Design 样式约束
- 变更后运行 `bun run test` 和 `bun run build`，交互变更做浏览器验证
- 本地验收前不提交、推送或发布
- 中文单行文案和注释末尾避免无必要的句号
