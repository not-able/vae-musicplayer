# Electron 桌面壳开发说明

当前桌面版本使用 Electron 与 electron-builder。现有 React/Vite 应用继续作为 Renderer，桌面适配代码独立放在 `electron/`，不会改变 Web 开发入口。

桌面工具链要求 Node.js 22.12.0 或更高版本。

## 常用命令

```bash
npm run dev
npm run build

npm run desktop:dev
npm run desktop:build
npm run desktop:package
```

- `desktop:dev`：先类型检查并构建 Main/Preload，再在固定的 `http://127.0.0.1:5173/` 启动 Vite，服务可用后打开 Electron。关闭 Electron 后会清理 Vite 子进程。
- `desktop:build`：构建 Web Renderer 与 Electron Main/Preload，但不生成安装包。
- `desktop:package`：完成桌面构建后生成 Windows x64 NSIS 安装包和 unpacked 目录，产物写入 `release/`。

`dist/`、`dist-electron/` 和 `release/` 都是本地构建产物，不应提交。

## 进程边界

- Main：创建窗口、选择开发或生产页面、限制导航和新窗口，并注册白名单 IPC；只有 Main 保存和解析已授权目录的真实路径。
- Preload：通过 `contextBridge` 暴露 `window.desktop.getPlatformInfo()` 和下述明确的音乐目录/binding 接口，不暴露通用 IPC。
- Renderer：现有 React 页面；不能直接访问 Node.js、Electron 或通用 IPC。

窗口启用 `nodeIntegration: false`、`contextIsolation: true` 和 `sandbox: true`。应用内导航只接受当前固定 Renderer 页面；新窗口始终拒绝。外部链接只有在解析并确认协议为 `https:` 且不含嵌入凭据后，才会交给系统浏览器。

## 音乐目录 API

Renderer 可通过以下窄接口使用受控目录能力：

```ts
window.desktop.musicLibrary.selectDirectory();
window.desktop.musicLibrary.listDirectories();
window.desktop.musicLibrary.scanDirectory({ directoryId });
window.desktop.musicLibrary.forgetDirectory(directoryId);
```

- `selectDirectory()` 只打开系统原生目录选择器；取消时返回 `null`。
- `listDirectories()` 返回不含真实路径的目录摘要及 `available`、`missing` 或 `unreadable` 状态。
- `scanDirectory()` 只接受由 Main 生成的 `directoryId`，返回带不透明 `candidateId` 的安全预览和脱敏扫描错误。
- `forgetDirectory()` 删除该目录的授权记录；之后原 ID 不能再用于扫描。

真实 `displayPath` 不再返回 Renderer。Renderer 不能提交绝对路径，Main 会校验 IPC 来源和参数，再从自己的注册表解析 `directoryId`。这避免被注入的 Renderer 任意读取本机目录，也让文件系统权限始终停留在受信任进程中。

目录注册表是带版本的 JSON，只记录用户授权的根目录，不记录扫描到的单个文件。生产环境文件位于 Electron 的 `app.getPath("userData")` 下，而不是仓库、Renderer 存储或应用安装目录。写入使用临时文件和重命名；注册表不存在时按空记录处理，损坏时安全回退为空记录并报告通用错误。

扫描器递归读取目录条目和必要的文件状态，不读取音频内容或标签；跳过符号链接，并确保每个候选路径仍位于授权根目录中。原始相对路径和 sourceRef 留在 Main 的临时候选 session，公开预览不会包含它们、绝对路径、`Buffer`、Node.js 对象或文件内容。

Electron Renderer 会在现有目录导入弹窗中使用这些 API：列出或选择授权目录后触发扫描，并将结果映射为仅存在于当前页面内存的候选预览。预览显示文件名、大小、修改时间和文件名解析提示，只保留不透明 `candidateId`；重新扫描会替换旧预览、关闭旧确认对话框并使旧 candidate 失效。Web 环境继续显示原有 `LocalDirectoryImport` 流程。

## 本地音频 Binding API

Renderer 可通过以下固定子 API 管理可序列化 binding 元数据：

```ts
window.desktop.musicLibrary.bindings.list();
window.desktop.musicLibrary.bindings.findByBindingId({ bindingId });
window.desktop.musicLibrary.bindings.findByTrackId({ trackId });
window.desktop.musicLibrary.bindings.bindCandidateToTrack({
  candidateId,
  trackId,
  expectedExistingBindingId
});
window.desktop.musicLibrary.bindings.unbindTrack({
  trackId,
  expectedBindingId
});
```

查询只返回不含 sourceRef 的 binding summary。Renderer 不能提交完整 binding；绑定命令只接受当前候选 ID、track ID 和可选 expected binding ID，Main 从候选 session 获取可信 sourceRef 与文件元数据。已有 binding 必须提供匹配的 expected ID 才能替换，解绑也必须匹配当前 ID，过期请求不会覆盖或删除新绑定。Repository 不读取音频、不检查 availability，也不生成播放 URL。数据保存在 Electron `userData` 下的 `local-audio-bindings.json`，采用带版本 schema 和原子写入；所有存储错误在跨 IPC 前都会转换为不含本机路径的稳定错误。

扫描预览为每个候选提供“绑定曲目”。曲目选择对话框只搜索现有 catalog 的曲名、歌手和专辑，不创建新曲目。未绑定目标可直接确认；目标已有 binding 时必须进入“确认替换绑定”，请求携带当前 `expectedExistingBindingId`。候选已有 binding 时可更换曲目或进入“确认解除绑定”，解绑请求携带 `expectedBindingId`。成功后只重新加载 binding summary 并刷新当前行，不重新扫描目录；冲突时显示稳定提示并要求重新确认。UI 不展示 candidate ID、binding ID、目录 ID、路径、IPC channel 或原始异常。

## 手动验证目录能力

1. 执行 `npm run desktop:dev`，确认窗口和原有页面正常显示。
2. 在开发者工具 Console 中确认 `require` 与 `process` 为 `undefined`。
3. 调用 `window.desktop.getPlatformInfo()`，确认平台信息仍可返回。
4. 调用 `window.desktop.musicLibrary.selectDirectory()`；关闭选择器，确认 Promise 返回 `null`。
5. 再次调用并选择一个仅含测试空文件的目录，保存返回的 `directoryId`。
6. 调用 `window.desktop.musicLibrary.scanDirectory({ directoryId })`，确认结果只有不透明 `candidateId` 和可序列化展示元数据，不含路径、目录 ID 或 sourceRef。
7. 重启应用并调用 `window.desktop.musicLibrary.listDirectories()`，确认授权记录仍存在。
8. 调用 `window.desktop.musicLibrary.forgetDirectory(directoryId)`，再确认列表中记录已移除且原 ID 无法扫描。
9. 从扫描候选打开曲目选择，分别按曲名、歌手和专辑搜索；确认无结果状态且没有新建曲目入口。
10. 创建新 binding，确认当前行显示曲目且目录没有自动重扫。
11. 对已有目标检查替换二次确认与取消，再确认替换请求冲突时不会覆盖新状态。
12. 检查解绑说明明确不会删除磁盘文件、歌曲、专辑或歌单；分别验证取消和确认。
13. 保持选择对话框打开并重新扫描，确认旧对话框关闭且旧 candidate 不能提交。
14. 检查界面与可访问文本不显示路径、candidate/binding ID、IPC channel、堆栈或原始异常。

如需清理测试数据，请先退出应用，再从操作系统提供的 Electron 用户数据目录中删除本应用的 `music-directory-registry.json` 或 `local-audio-bindings.json`。不要删除整个用户数据目录，以免影响其他本地设置；若存在 `.corrupt-*.bak`，应先保留并人工确认内容。

## 当前范围

当前仍不提供桌面音频播放、availability 刷新、标签或时长解析、封面提取、文件监听、增量或后台扫描、进度与取消 UI、系统托盘、媒体快捷键、自动更新等能力。现有 Web 目录导入和 Web 构建入口保持不变。
