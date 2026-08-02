# Active Task

- 任务 ID：`ELECTRON-2.4B`
- 状态：`ready`
- 分支：`desktop/electron`

## 前置条件

- 工作区干净。
- 当前分支包含 `desktop(electron): secure candidate binding commands`。
- 开始前阅读：
  - `docs/architecture/overview.md`
  - `docs/architecture/desktop-security-boundary.md`
  - `docs/architecture/local-audio-lifecycle.md`
  - `docs/decisions/0004-portable-audio-binding-model.md`
  - `docs/decisions/0005-main-owned-scan-candidates.md`

## 目标

在现有 Electron 扫描预览中增加逐项曲目选择、显式替换确认和解绑确认 UI，只调用 2.4A 的安全候选命令。

## 范围

- 为每个当前 candidate 提供从现有 catalog 明确选择目标 track 的交互；不根据文件名自动选择。
- 加载不含 sourceRef 的 binding summary，并显示目标 track 当前是否已绑定。
- 未绑定 track 经用户明确确认后调用 `bindCandidateToTrack({ candidateId, trackId })`。
- 已绑定 track 必须展示当前 binding 信息并二次确认，再携带 `expectedExistingBindingId` 调用替换命令。
- 解绑必须二次确认，并调用 `unbindTrack({ trackId, expectedBindingId })`。
- 成功后刷新 binding summary；冲突或 candidate 失效时显示脱敏反馈，保留可用预览并提示重新扫描/刷新。
- 使用现有弹窗、表格、表单和按钮模式；保持键盘可访问性，不进行全局 UI 改版。
- Web `LocalDirectoryImport`、旧 browser `File`/handle 流程和播放器保持不变。
- 增加选择、确认、取消、冲突、失效与 Web 兼容的聚焦测试，并更新相关文档。

## 明确不做

- 新 IPC、通用 invoke/send、路径/sourceRef/完整 binding 参数。
- 自动匹配、批量绑定或修改 catalog 元数据。
- 音频播放、`app-media://`、availability 刷新、标签解析。
- Repository/schema 修改、IndexedDB 迁移或 SQLite。
- 全局 UI 改版或现有 Web 导入重构。

## 验收条件

- 用户可逐项选择现有 track 并明确确认新 binding；取消不会写入。
- 替换和解绑都有二次确认，并使用当前 expected binding ID；冲突不会误改新状态。
- UI 和请求中不出现目录 ID、相对路径、sourceRef、绝对路径或完整 binding。
- candidate 失效和 Repository 错误显示安全可恢复反馈。
- Web 目录导入行为保持不变，默认验证命令全部通过。

## 建议提交

`desktop(electron): add candidate binding confirmation UI`
