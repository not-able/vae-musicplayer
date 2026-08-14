# ELECTRON-2.5 — Local Audio Availability Refresh

- 任务 ID：`ELECTRON-2.5`
- 状态：`deferred`
- 分支：`desktop/electron`
- 延后原因：用户明确将目录基线、音源统一与受控播放排在 availability 检查之前。
- 恢复顺序：`CATALOG-1B` → `AUDIO-UNIFY-1..3` → `PLAYBACK-1..2` → `ELECTRON-2.5`。

## 保留目标

由 Main 根据受控目录和文件元数据刷新桌面 binding 的 `available`、`missing`、`permission-required`、`changed` 或 `unknown` 状态，并向 Renderer 返回脱敏摘要。

## 保留边界

- Main 从持久化 binding 的 `directoryId + relativePath` 解析实际文件；Renderer 不提交路径或 sourceRef。
- 复用目录注册表、路径规范化、授权根目录、符号链接与逃逸防护规则。
- 只使用文件存在性、可读性、大小和修改时间；不读取音频内容。
- availability 更新必须使用并发保护，过期请求不得覆盖新 binding。
- UI 不展示路径、sourceRef、内部 channel、堆栈或原始异常。

## 明确不做

- 音频内容、标签/封面/时长、哈希、文件监听或自动修复。
- 音频播放、`app-media://`、Range、自动/批量匹配、SQLite、Tauri。

重新激活时应依据届时的统一音源与播放架构重写详细 active task，不直接照搬旧实现假设。
