# 本地音频绑定模型

目录扫描结果只是“发现的候选文件”，例如 `DesktopScannedAudioFile`；`LocalAudioBinding` 则表示用户已经确认某个文件对应某首曲目。扫描阶段不会创建 `bindingId`，也不会自动建立曲目关系。

桌面来源只保存 `directoryId + relativePath`。`directoryId` 由受控目录注册表解析，`relativePath` 使用 `/` 且禁止绝对路径与 `..`，因此公共业务模型不会携带本机绝对路径。

当前 Web 实现仍使用 `src/types/audio.ts` 中的 `LocalAudioFileRecord`，并在 IndexedDB 记录中直接保存 `File` 或 `FileSystemFileHandle`。这些浏览器对象不可 JSON 序列化，也不能被 Electron 或其他平台复用，因此它们被明确保留在 `WebLocalAudioBindingService` 的兼容边界及既有播放数据流中，不属于公共 service contract。IndexedDB schema 和既有记录不迁移，目录导入、UI 和播放器行为保持不变。

## Service contract

`LocalAudioBindingService` 统一以下平台无关语义：

- 查询脱敏、可序列化的 binding summary；
- 使用 opaque `candidateId + trackId` 建立绑定；
- 只有提供当前 expected binding key 才允许替换或解绑；
- 以 `{ ok, value | error }` 返回稳定结构化结果，不向上层泄露原始异常。

公共 contract 不包含 `File`、`FileSystemFileHandle`、路径、source reference、Electron 对象或 IPC 能力。Web adapter 的候选表只存在于内存，浏览器对象只通过 adapter 专用兼容方法进入旧 Repository；Electron adapter 不新增 IPC，只调用 Preload 已有固定 binding 方法。Web 旧记录的 `id` 固定绑定到 track，adapter 因此将 `record.id + updatedAt` 派生为不持久化的版本化 binding key，以获得和 Electron binding UUID 相同的陈旧替换/解绑保护。

## Repository 契约

`LocalAudioBindingRepository` 只管理可序列化的绑定元数据，不负责检查文件是否存在、读取文件内容或生成播放地址。一首曲目至多保留一个当前绑定：相同 `bindingId + trackId` 会更新记录，同一曲目保存新的 `bindingId` 会替换旧绑定，而把已有 `bindingId` 用于另一首曲目会产生可识别的冲突错误。列表按 `createdAt`、`bindingId` 稳定排序，所有输入输出均进行防御性复制。

时间戳由调用方维护，Repository 不读取系统时间，也不改写 `createdAt` 或 `updatedAt`。内存实现用于验证契约；Electron 使用带 schema version、原子写入和损坏备份的 JSON adapter。Web 浏览器来源对象和绑定元数据仍由旧 Web adapter 管理，尚未迁移。

Electron Main 已通过固定 IPC 和 Preload 的 `window.desktop.musicLibrary.bindings` 子 API 提供查询、候选绑定和版本化解绑操作。Main 从可信候选 session 生成 `desktop-file` source，并确认其 `directoryId` 存在于受控目录注册表；Renderer 不会获得 source 或真实路径。当前尚未实现旧 Web 数据迁移、Electron 单文件 picker、智能匹配、文件可用性检查或桌面音频播放。
