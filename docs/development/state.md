# Development State

- 更新时间：2026-08-14
- 分支：`desktop/electron`
- 当前阶段：统一本地音频工作流（`AUDIO-UNIFY-1` 已完成）
- 当前任务：`AUDIO-UNIFY-2` — Unified single-track Electron binding UI

## 已完成

- Electron 安全桌面壳、受控目录授权/扫描、可移植 binding、Main 候选确认服务及目录扫描预览中的绑定/替换/解绑 UI。
- `AUDIO-UNIFY-1` 新增 Web/Electron 共用的 `LocalAudioBindingService`：统一查询、绑定、显式替换、版本化解绑、结构化结果与脱敏错误语义。
- 公共 service contract 只传输可序列化、平台无关的 binding summary、candidate ID、track ID 与 expected binding ID，不包含浏览器对象、路径、sourceRef、Electron 或通用 IPC。
- Web adapter 继续使用现有 `LocalAudioFileRepository` 与 IndexedDB 记录，不迁移既有数据；`File` / `FileSystemFileHandle` 被限制在 adapter 和暂未改造的现有播放器兼容路径中。
- Web adapter 使用单调递增的版本化 binding key，显式 replacement/unbind 可拒绝过期请求；现有导入、批量导入和解绑入口行为保持不变。
- Electron adapter 只调用既有固定 Preload API，Main 持有 candidate/sourceRef 的安全边界、扫描 session、sender 绑定和 expected binding ID 语义保持不变。
- Web hook 与 Electron 目录预览已接入统一服务语义；没有新增 UI、单文件 picker 或播放器能力。
- 正式 Web/Electron 目录继续统一使用稳定 ID 的 `xuSongOfficialCatalog`（14 个发行分组、162 首）。

## 核心不变量

- Renderer 不得获取或构造绝对路径、桌面 sourceRef 或完整 binding；Preload 不暴露通用 IPC。
- 扫描候选、确认后的 binding、source reference 与 playable URL 是不同概念。
- 一个 track 最多只有一个当前 binding；替换和解绑必须携带调用方观察到的 expected binding ID。
- Web 浏览器文件对象不进入公共 contract；桌面 candidate 只由 Main 解析且具有受控 session 生命周期。
- Web 版本继续可以独立开发、测试和构建；现有 IndexedDB 数据没有迁移。
- 内置目录元数据与用户本地 binding 分离，稳定 track ID 保持不变。

## 当前遗留问题

- 单曲行尚无 Electron 安全文件选择与绑定入口；由 `AUDIO-UNIFY-2` 处理。
- Web 播放器仍直接消费旧 `LocalAudioFileRecord.file`；播放器统一不属于当前阶段。
- 自动/批量文件名匹配、受控桌面播放协议、availability 检查和标签解析尚未实现。
- 仓库级 Prettier 基线仍有两个与本任务无关的既有文件未格式化：`src/features/local-library/inMemoryLocalAudioBindingRepository.ts`、`src/tests/localAudioBindingRepository.test.ts`。

## 下一步任务序列

1. `AUDIO-UNIFY-2`：安全的 Electron 单曲选择与统一绑定 UI。
2. `AUDIO-UNIFY-3`：智能多格式批量匹配。
3. `PLAYBACK-1`、`PLAYBACK-2`：受控桌面播放与统一播放/binding 状态。
4. `ELECTRON-2.5`：missing/changed 状态检查（已延后，任务说明保存在 `docs/tasks/deferred/`）。

## 最近一次验证状态

2026-08-14：`npm run test:run`（43 个测试文件、397 项测试）、`npm run lint`、`npm run build`、`npm run desktop:build`、`git diff --check` 与本任务修改文件的 Prettier 检查通过。Electron 隔离 userData 安全探针确认 Renderer 中 `require` / `process` 均为 `undefined`，固定 binding API 可用，目录扫描预览可打开且没有内部路径或 ID 泄露；临时进程、userData 和日志已清理。仓库级 `npm run format:check` 仅报告上述两个任务开始前已存在且本次未修改的文件。
