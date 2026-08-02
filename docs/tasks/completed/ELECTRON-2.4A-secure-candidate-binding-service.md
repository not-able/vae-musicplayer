# ELECTRON-2.4A — Secure Candidate Binding Service

- 任务 ID：`ELECTRON-2.4A`
- 状态：`completed`
- 目标：由 Main 持有可信扫描候选，并通过不透明 candidate ID 提供安全绑定、显式替换和版本化解绑命令。
- 主要交付：按 webContents/generation 隔离的候选 store、安全扫描预览 DTO、Main 创建 binding、expected-ID 冲突保护、脱敏 binding summary、固定 IPC/Preload API，以及移除 Renderer 完整 binding 写能力。
- Commit：与本归档同一提交（`desktop(electron): secure candidate binding commands`）。
- 验证：9 个聚焦测试文件共 39 项测试；完成时 39 个测试文件共 357 项测试及 Lint、Web/Electron 构建全部通过。
- 已知限制：尚无曲目选择、替换确认或解绑确认 UI；候选无时间 TTL，且不检查 availability 或提供播放 URL。
