# ELECTRON-2.1 — Portable Audio Binding Model

- 任务 ID：`ELECTRON-2.1`
- 状态：`completed`
- 目标：定义 Web 与 Electron 可共用、可 JSON 序列化的本地音频绑定模型。
- 主要交付：branded identifiers、discriminated source reference、availability、`directoryId + relativePath` 桌面引用及纯校验/规范化函数。
- Commit：`c3f3a26`（`refactor(local-library): define portable audio binding model`）
- 验证：相对路径安全、source narrowing、JSON round-trip 和候选/binding 类型分离测试及全部默认检查通过。
- 已知限制：旧 Web `File`/`FileSystemFileHandle` 模型仍作为兼容层存在；尚无生产持久化或播放接入。
