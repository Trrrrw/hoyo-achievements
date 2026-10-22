# 项目协作

- 本项目只从 Akasha API 读取游戏数据，不直接连接游戏数据来源
- 玩家状态由浏览器保存，WebDAV 凭据不发送到 Akasha，不写入导出文件
- 页面设计遵循 `.agents/skills/frontend-design/SKILL.md`，使用自定义冒险手册视觉系统；不使用 Ant Design 样式约束
- 变更后运行 `bun run test` 和 `bun run build`，交互变更做浏览器验证
- 本地验收前不提交、推送或发布
- 中文单行文案和注释末尾避免无必要的句号

## 目录与验证

- 本目录是工作区内独立的成就前端仓库，后端和采集器位于其他独立仓库，实际本机路径见上级工作区说明
- `src/offline-catalog.ts` 负责已验证目录的 IndexedDB 缓存，只在网络失败时回退，数据校验失败不得用缓存掩盖
- `src/gist.ts` 与 `src/file-sync.ts` 分别处理 Gist 和本地文件同步；Gist Token 仅在弹窗内存中使用，不进入进度文件或 Akasha 请求
- `src/Pwa.tsx` 与 `scripts/build-pwa.mjs` 负责 PWA，Service Worker 仅缓存本站静态资源，不缓存 API、授权请求或跨域数据；更新由用户点击后生效
- Bun 版本见 `package.json` 的 `packageManager`，构建脚本所用 Node.js 版本见 `.nvmrc`；冻结安装后运行测试与构建
- 文本统一使用 LF 换行，遵循 `.gitattributes`
