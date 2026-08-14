# Active Task

- 任务 ID：`AUDIO-UNIFY-2`
- 状态：`ready`
- 分支：`desktop/electron`

## 前置条件

- 工作区干净。
- 当前分支包含 `AUDIO-UNIFY-1` 的统一 binding service contract 与 Web/Electron adapters。
- 开始前阅读：
  - `docs/architecture/desktop-security-boundary.md`
  - `docs/architecture/local-audio-lifecycle.md`
  - `docs/local-audio-binding-model.md`
  - `docs/decisions/0002-secure-electron-boundary.md`
  - `docs/decisions/0005-main-owned-scan-candidates.md`
  - `src/features/local-library/localAudioBindingService.ts`
  - `src/features/local-library/electronLocalAudioBindingService.ts`

## 目标

为现有歌曲行增加安全、统一的 Electron 单曲音频绑定入口，使用户可以选择一个本地文件并创建、替换或解除该 track 的 binding，同时继续通过 `LocalAudioBindingService` 使用版本化写入语义。

## 范围

- 新增固定的 Main/Preload 单文件选择能力；Main 将选择结果转换为绑定到发起 webContents 的不透明临时 candidate，不向 Renderer 返回绝对路径或 sourceRef。
- 在现有歌曲行/详情交互中展示当前 binding 状态，并提供选择文件、确认绑定、替换确认和解绑确认。
- 绑定请求只提交 `candidateId`、`trackId` 与可选 `expectedExistingBindingId`；解绑请求必须提交 `expectedBindingId`。
- 冲突、取消选择、candidate 失效和文件对话框错误使用统一、脱敏的反馈；过期操作不得覆盖或删除新状态。
- 保持 Web 现有文件选择、导入、播放和 binding 行为不变，并添加聚焦单元/组件/Main 安全测试。

## 明确不做

- 自动或批量文件名匹配（`AUDIO-UNIFY-3`）。
- 音频播放、`app-media://`、Range、seek、播放器 hook 或队列重构。
- availability、标签、封面、时长、文件监听、数据迁移、SQLite 或 Tauri。
- 允许 Renderer 提交路径、sourceRef、完整 binding、文件元数据或使用通用 IPC。
- 大规模 UI 改版、创建新曲目或修改 canonical catalog。

## 验收条件

- Electron 用户可从单个 track 发起文件选择，并完成新绑定、显式替换和版本化解绑；取消操作不改变状态。
- Renderer 无法获得或提交绝对路径/sourceRef；candidate 不可预测、绑定到 sender、重启后失效且仅由 Main 解析。
- replacement/unbind 的 expected binding ID 冲突会刷新状态并要求用户重新确认。
- Web 流程和目录扫描预览继续工作，公共 service contract 不新增平台对象或通用 IPC。
- 默认验证全部通过，并完成实际 Electron 新绑定、替换、取消与解绑验证。

## 建议提交

`feat(local-audio): add Electron single-track binding flow`
