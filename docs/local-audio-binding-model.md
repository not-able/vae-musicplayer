# 本地音频绑定模型

目录扫描结果只是“发现的候选文件”，例如 `DesktopScannedAudioFile`；`LocalAudioBinding` 则表示用户已经确认某个文件对应某首曲目。扫描阶段不会创建 `bindingId`，也不会自动建立曲目关系。

桌面来源只保存 `directoryId + relativePath`。`directoryId` 由受控目录注册表解析，`relativePath` 使用 `/` 且禁止绝对路径与 `..`，因此公共业务模型不会携带本机绝对路径。

当前 Web 实现仍使用 `src/types/audio.ts` 中的 `LocalAudioFileRecord`，并在 IndexedDB 记录中直接保存 `File` 或 `FileSystemFileHandle`。这些浏览器对象不可 JSON 序列化，也不能被 Electron 或其他平台复用，因此它们被明确保留为 Web 兼容层，不属于新的公共绑定模型。现有目录导入、旧 Repository、Hook、UI 和播放器调用方暂不迁移，行为保持不变。

## Repository 契约

`LocalAudioBindingRepository` 只管理可序列化的绑定元数据，不负责检查文件是否存在、读取文件内容或生成播放地址。一首曲目至多保留一个当前绑定：相同 `bindingId + trackId` 会更新记录，同一曲目保存新的 `bindingId` 会替换旧绑定，而把已有 `bindingId` 用于另一首曲目会产生可识别的冲突错误。列表按 `createdAt`、`bindingId` 稳定排序，所有输入输出均进行防御性复制。

时间戳由调用方维护，Repository 不读取系统时间，也不改写 `createdAt` 或 `updatedAt`。本阶段提供的内存实现仅用于验证契约和后续适配器开发，不是生产持久化方案；Web 浏览器来源对象和绑定元数据将由后续 Web 适配器分别管理，Electron 适配器则会通过 `directoryId + relativePath` 解析受控文件。

本阶段尚未实现 Web 或 Electron 持久化、旧数据迁移、IPC、导入 UI、文件解析或音频播放。
