# Active Task

- 任务 ID：`ELECTRON-2.2C`
- 状态：`ready`
- 分支：`desktop/electron`

## 前置条件

- 工作区干净。
- 当前分支包含 `desktop(electron): persist local audio bindings`，即 Electron JSON binding Repository 及其测试。
- 开始前阅读：
  - `docs/architecture/overview.md`
  - `docs/architecture/desktop-security-boundary.md`
  - `docs/architecture/local-audio-lifecycle.md`
  - `docs/decisions/0002-secure-electron-boundary.md`
  - `docs/decisions/0003-controlled-directory-references.md`
  - `docs/decisions/0004-portable-audio-binding-model.md`

## 目标

将 binding Repository 接入 Electron Main service，并通过 Preload 暴露窄、可验证的专用 API。

## 范围

- Main 使用 `app.getPath("userData")` 组装 binding 文件路径，并注入现有 JSON Repository。
- 在 Main service 中提供 list、find、save 和 remove binding 操作，不读取音频或生成播放 URL。
- IPC channel、参数与返回值使用明确类型和固定方法，不暴露通用 `send`/`invoke`。
- Main 对 sender、参数、binding 可序列化性和标识符进行显式校验。
- Electron 只接受 `desktop-file` source；保存前确认其 `directoryId` 存在于受控目录注册表。
- 将存储、冲突和校验错误映射为稳定且不泄露本机路径的公开错误。
- Preload 只扩展 `window.desktop.musicLibrary` 的窄 binding API，并更新全局 TypeScript 声明。
- 增加 service、IPC handler、sender/参数校验和 Main wiring 聚焦测试。
- 更新相关开发文档。

## 明确不做

- UI、导入预览、用户确认流程或自动匹配。
- 音频播放、`app-media://` 或 availability 刷新。
- IndexedDB 迁移、旧 Web Repository 改造或 SQLite。
- 将绝对路径、Node/Electron 对象或通用 IPC 暴露给 Renderer。

## 验收条件

- Main 启动时使用注入路径构造并复用 binding Repository。
- 可信 Renderer 可通过窄 API 查询、保存和删除 binding；非可信 sender 与非法参数被拒绝。
- `desktop-file` 以外的 source 及未知 `directoryId` 不会写入 Electron store。
- Renderer 仍无法访问绝对路径、Node.js、Electron 或通用 IPC。
- Repository 错误以稳定且非敏感的结构返回。
- 默认验证命令全部通过。

## 建议提交

`desktop(electron): expose local audio binding service`
