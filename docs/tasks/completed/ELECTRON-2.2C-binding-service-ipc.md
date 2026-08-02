# ELECTRON-2.2C — Main Binding Service and Narrow IPC

- 任务 ID：`ELECTRON-2.2C`
- 状态：`completed`
- 目标：将 Electron JSON binding Repository 接入 Main，并通过 Preload 暴露窄 API。
- 主要交付：`userData` 路径注入、Main binding CRUD service、6 个固定 IPC channels、严格 sender/参数/source/directory 校验、稳定脱敏错误和只读 `window.desktop.musicLibrary.bindings` API。
- Commit：与本归档同一提交（`desktop(electron): expose local audio binding service`）。
- 验证：6 个聚焦测试文件共 19 项测试；完成时 36 个测试文件共 336 项测试及 Lint、Web/Electron 构建全部通过。
- 已知限制：尚无导入预览或确认 binding UI；不检查 availability、不解析文件且不提供播放 URL。
