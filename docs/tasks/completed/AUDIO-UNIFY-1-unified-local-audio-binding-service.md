# AUDIO-UNIFY-1 — Unified local audio binding service

- 状态：`completed`
- 完成日期：2026-08-14
- 分支：`desktop/electron`

## 目标

为 Web 与 Electron 建立同一套平台无关的本地音频 binding service contract，同时把浏览器文件对象和桌面安全能力限制在各自 adapter 内。

## 完成内容

- 新增统一的 binding summary、查询、绑定、显式替换、版本化解绑、结构化错误与结果契约。
- 新增 Web adapter，在不迁移 IndexedDB 数据的前提下继续读写现有 `LocalAudioFileRecord`；`File` 与 `FileSystemFileHandle` 只存在于 Web adapter 的兼容边界。
- 新增 Electron adapter，只调用既有固定 Preload API，并保留 Main 管理的 candidate/session、expected binding ID 和脱敏错误语义。
- Web replacement/unbind 使用单调递增的版本化 binding key，并在 adapter 内串行化写入，避免并发或过期请求覆盖/删除更新后的绑定。
- 现有 Web 导入 hook 与 Electron 目录扫描预览改为依赖统一服务语义；UI 与播放器行为未改变。
- 更新本地音频生命周期、绑定模型、架构概览和 ADR 0004。

## 安全边界

- 公共 contract 不包含 `File`、`FileSystemFileHandle`、路径、sourceRef、Electron 类型或通用 IPC。
- Renderer 仍只能向 Electron 提交 `candidateId`、`trackId` 和 expected binding ID，不能构造路径、sourceRef 或完整 binding。
- 旧 Web 记录中的浏览器对象仍由现有 Repository 保存，并仅在 Web adapter/未改造播放器兼容路径中使用。

## 验证

- 新增 15 项聚焦测试；完整自动验证结果见同提交的 `docs/development/state.md`。
- Electron 隔离 userData 安全探针确认 Renderer 无 `require` / `process`，Preload 仅暴露固定 binding 方法，目录扫描入口可正常打开且不显示内部路径或 ID。

## 未包含

- Electron 单文件 picker、新绑定 UI、自动/批量匹配、播放、`app-media://`、Range、seek、availability 或数据迁移。

## 后续

- 唯一 active task：`AUDIO-UNIFY-2`。
