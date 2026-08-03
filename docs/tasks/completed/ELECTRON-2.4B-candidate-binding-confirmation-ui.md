# ELECTRON-2.4B — Candidate Binding Confirmation UI

- 任务 ID：`ELECTRON-2.4B`
- 状态：`completed`
- 目标：在桌面扫描预览中提供现有曲目搜索/选择、新绑定、显式替换和版本化解绑确认 UI。
- 主要交付：逐候选绑定状态、按曲名/歌手/专辑搜索、替换与解绑二次确认、expected-ID 请求、冲突/失效脱敏反馈、重扫代际清理、键盘焦点管理和 Web 分支兼容。
- 安全边界：Renderer 只提交 `candidateId`、`trackId` 与 expected binding ID，不接收或构造路径、sourceRef 或完整 binding；Main binding summary 是状态事实来源。
- Commit：与本归档同一提交（`desktop(electron): add candidate binding confirmation UI`）。
- 验证：新增 12 项测试；完成时 40 个测试文件共 369 项测试及 Lint、Web/Electron 构建全部通过，并完成真实 Electron 扫描、搜索、绑定、替换、解绑与重扫失效验证。
- 已知限制：availability 检查与受控播放 URL 尚未实现；候选 session 仍无时间 TTL。
