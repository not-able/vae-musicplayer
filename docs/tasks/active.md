# Active Task

- 任务 ID：`ELECTRON-2.4`
- 状态：`ready`
- 分支：`desktop/electron`

## 前置条件

- 工作区干净。
- 当前分支包含 `desktop(electron): preview scanned audio candidates`，即 Electron 扫描候选临时预览。
- 开始前阅读：
  - `docs/architecture/overview.md`
  - `docs/architecture/desktop-security-boundary.md`
  - `docs/architecture/local-audio-lifecycle.md`
  - `docs/decisions/0003-controlled-directory-references.md`
  - `docs/decisions/0004-portable-audio-binding-model.md`

## 目标

允许用户在 Electron 扫描预览中明确选择一首现有曲目，并确认创建、替换或解除该曲目的 `LocalAudioBinding`。

## 范围

- 只允许用户从当前 catalog 中明确选择目标 track；不根据文件名或元数据自动匹配。
- 用户确认后，使用现有 `window.desktop.musicLibrary.bindings` 窄 API 保存 `desktop-file` binding；来源只能取自当前扫描候选的 `directoryId + relativePath`。
- 保存前显示明确的目标 track 和候选文件；若该 track 已有 binding，必须二次确认替换，不能静默覆盖。
- 显示当前 track 的 binding 状态，并允许用户明确解除；解除前需确认，且只调用现有按 track 解除 API。
- binding ID、时间戳和文件元数据在确认动作发生时生成或复制；不把扫描候选本身改造成 binding。
- 保存/替换/解除成功后刷新 binding 状态；失败时显示稳定脱敏错误，且保留可重试的扫描预览。
- Web `LocalDirectoryImport`、旧 browser `File`/handle 流程和播放器保持不变。
- 使用现有弹窗、表格、字段与按钮模式；不进行全局 UI 改版。
- 增加 binding 草稿纯函数与确认、替换、解除、错误恢复的聚焦测试，并更新相关开发文档。

## 明确不做

- 自动匹配曲目、批量确认或修改曲目元数据。
- 音频播放、`app-media://`、availability 刷新或文件内容读取。
- 新 IPC、目录扫描协议修改、Repository/schema 修改、IndexedDB 迁移或 SQLite。
- 将绝对路径、Electron/Node 对象或浏览器 `File`/handle 写入公共 binding。
- 全局 UI 改版或现有 Web 导入重构。

## 验收条件

- Electron 用户可以逐个明确确认候选与现有 track 的 binding，并看到成功或脱敏失败反馈。
- 已绑定 track 的替换和解除都需要用户明确确认，且不会误改其他 track。
- binding source 只来自扫描候选的 `directoryId + relativePath`，不包含绝对路径。
- 取消或失败不会写入错误 binding；预览保留并可重试。
- Web 目录导入测试与行为保持不变，默认验证命令全部通过。

## 建议提交

`desktop(electron): confirm local audio bindings`
