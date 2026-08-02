# Active Task

- 任务 ID：`ELECTRON-2.3`
- 状态：`ready`
- 分支：`desktop/electron`

## 前置条件

- 工作区干净。
- 当前分支包含 `desktop(electron): expose local audio binding service`，即 Main binding service、窄 IPC 和 Preload API。
- 开始前阅读：
  - `docs/architecture/overview.md`
  - `docs/architecture/desktop-security-boundary.md`
  - `docs/architecture/local-audio-lifecycle.md`
  - `docs/decisions/0003-controlled-directory-references.md`
  - `docs/decisions/0004-portable-audio-binding-model.md`

## 目标

将 Electron 扫描得到的 `DesktopScannedAudioFile` 候选接入桌面导入预览，同时保持候选与 binding 分离。

## 范围

- 在 Electron 环境中通过现有目录 API 选择/列出授权目录并触发扫描。
- 将扫描结果映射为仅用于预览的客户端 view model，不创建 `bindingId`，不调用 binding save。
- 预览展示文件名、相对路径、大小、修改时间、解析出的曲目提示、`parseStatus` 和 issues。
- 扫描结果只保存在当前页面内存状态，重新扫描时明确替换；不新增持久化。
- 提供 loading、空结果、扫描错误和目录失效反馈，不显示或传递真实绝对路径。
- 现有 Web `LocalDirectoryImport` 行为、旧 browser `File`/handle 流程和播放器保持不变。
- 使用现有视觉与组件模式，不进行全局 UI 改版。
- 增加候选映射纯函数、Electron 条件分支和预览交互的聚焦测试。
- 更新相关开发文档。

## 明确不做

- 创建、保存、替换或删除 `LocalAudioBinding`。
- 自动匹配曲目、用户确认导入或修改曲目元数据。
- 音频播放、`app-media://`、availability 刷新或文件内容读取。
- 新 IPC、目录扫描协议修改、IndexedDB 迁移或 SQLite。
- 全局 UI 改版或现有 Web 导入重构。

## 验收条件

- Electron 用户可以选择授权目录、扫描并看到候选预览及安全错误状态。
- 预览 view model 不含绝对路径、Node/Electron 对象、`File` 或持久化 `bindingId`。
- 预览阶段不会写入 binding Repository，也不会自动建立 track 关系。
- Web 目录导入测试与行为保持不变。
- 默认验证命令全部通过。

## 建议提交

`desktop(electron): preview scanned audio candidates`
