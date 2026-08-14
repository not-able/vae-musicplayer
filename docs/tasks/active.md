# Active Task

- 任务 ID：`AUDIO-UNIFY-1`
- 状态：`ready`
- 分支：`desktop/electron`

## 前置条件

- 工作区干净。
- 当前分支包含 `feat(catalog): complete built-in Xu Song discography`。
- 开始前阅读：
  - `docs/architecture/local-audio-lifecycle.md`
  - `docs/local-audio-binding-model.md`
  - `docs/decisions/0004-portable-audio-binding-model.md`
  - `src/features/local-library/useLocalAudioLibrary.ts`
  - `src/features/local-library/localAudioRepository.ts`

## 目标

定义一个供 Web 与 Electron 调用方共同使用的本地音频绑定服务边界，统一读取、绑定、替换和解绑结果语义，同时保持平台文件对象与安全能力留在各自 adapter 内。

## 范围

- 盘点 Web `LocalAudioFileRecord` 流程与 Electron `LocalAudioBinding` 窄 API 的重复职责和差异。
- 定义平台无关的 service contract、结构化错误与读取/写入结果，不在公共接口暴露 `File`、handle、路径、Electron 或通用 IPC。
- 为现有 Web Repository 与 Electron preload API 提供最小 adapter，使上层状态管理可依赖同一服务语义。
- 保持一个 track 最多一个 binding，并保留 Electron expected binding ID 的乐观并发保护。
- 添加聚焦纯测试和兼容测试；现有 Web 导入、Electron 候选确认与目录预览行为不变。

## 明确不做

- Electron 单文件 picker 或新的绑定 UI（`AUDIO-UNIFY-2`）。
- 自动/批量文件名匹配（`AUDIO-UNIFY-3`）。
- 音频播放、`app-media://`、Range、seek 或播放器 hook 重构。
- availability、标签解析、封面、时长、数据迁移、SQLite 或 Tauri。
- 修改 canonical catalog、恢复旧导入入口或扩展 Renderer 文件权限。

## 验收条件

- Web/Electron 上层可通过同一平台无关 service contract 查询并变更 binding。
- Renderer 仍不能构造桌面 sourceRef、绝对路径或完整 binding；Preload 不暴露通用 IPC。
- 旧 Web 浏览器对象仅存在于 Web adapter，既有持久化数据与导入流程继续可用。
- Electron candidate/session、expected binding ID 与脱敏错误安全语义保持不变。
- 默认验证全部通过，并分别验证 Web 与 Electron 现有绑定入口。

## 建议提交

`refactor(local-audio): unify binding service contract`
