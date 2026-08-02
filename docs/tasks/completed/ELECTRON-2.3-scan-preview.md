# ELECTRON-2.3 — Scanned Audio Candidate Preview

- 任务 ID：`ELECTRON-2.3`
- 状态：`completed`
- 目标：将 Electron 目录扫描候选接入现有导入弹窗的临时预览，同时保持候选与 binding 分离。
- 主要交付：窄目录扫描能力检测、安全候选 view model、授权目录选择/刷新/扫描、loading/空结果/失效与脱敏错误反馈，以及 Electron/Web 条件分支。
- Commit：与本归档同一提交（`desktop(electron): preview scanned audio candidates`）。
- 验证：3 个聚焦测试文件共 21 项测试；完成时 38 个测试文件共 352 项测试及 Lint、Web/Electron 构建全部通过。
- 已知限制：预览只存在于页面内存；尚不能确认、替换或解除 binding，也不检查 availability 或播放音频。
