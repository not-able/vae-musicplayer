# ELECTRON-2.2A — Binding Repository Contract

- 任务 ID：`ELECTRON-2.2A`
- 状态：`completed`
- 目标：定义 `LocalAudioBindingRepository` 行为及平台无关内存参考实现。
- 主要交付：查询、upsert、双向删除、单 track 单 binding、binding ID 冲突错误、稳定排序、时间戳所有权和防御性复制。
- Commit：`7ccc999`（`refactor(local-library): define audio binding repository`）
- 验证：新增 20 项聚焦测试；完成时 30 个测试文件共 312 项测试及 Lint、Web/Electron 构建全部通过。
- 已知限制：内存实现不持久化；尚无 Electron JSON adapter、IPC、UI 或播放接入。
