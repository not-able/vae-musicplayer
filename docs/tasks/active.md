# Active Task

- 任务 ID：`ELECTRON-2.2B`
- 状态：`ready`
- 分支：`desktop/electron`

## 前置条件

- 工作区干净。
- 当前分支包含提交 `7ccc999`，即 `LocalAudioBindingRepository` 契约和内存参考实现。
- 开始前阅读：
  - `docs/architecture/overview.md`
  - `docs/architecture/local-audio-lifecycle.md`
  - `docs/decisions/0003-controlled-directory-references.md`
  - `docs/decisions/0004-portable-audio-binding-model.md`

## 目标

实现供 Electron Main 使用的 JSON `LocalAudioBindingRepository`。

## 范围

- 实现现有 `LocalAudioBindingRepository` 契约。
- 数据文件路径由调用方注入，不硬编码用户目录。
- 定义文件 schema version。
- 使用临时文件与重命名进行原子写入。
- 损坏文件保留备份并明确报错，不静默覆盖。
- 未知 schema 明确拒绝且不覆盖原文件。
- 写入失败时内存与磁盘状态不分叉。
- 同一实例内写操作串行化，避免并发更新丢失。
- 增加 Repository 契约和持久化聚焦测试。
- 更新相关开发文档。

## 明确不做

- IPC 或 Preload API。
- UI、导入工作流或自动匹配。
- 音频播放、`app-media://` 或 availability 刷新。
- IndexedDB 迁移、旧 Web Repository 改造或 SQLite。

## 验收条件

- 重建 Repository 实例后可以恢复 bindings。
- 稳定排序、替换和冲突语义与内存实现一致。
- 损坏 JSON 与未知 schema 不会被静默覆盖。
- 写入失败时状态不分叉。
- 并发写入不丢失更新。
- 默认验证命令全部通过。

## 建议提交

`desktop(electron): persist local audio bindings`
