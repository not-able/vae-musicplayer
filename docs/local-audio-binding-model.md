# 本地音频绑定模型

目录扫描结果只是“发现的候选文件”，例如 `DesktopScannedAudioFile`；`LocalAudioBinding` 则表示用户已经确认某个文件对应某首曲目。扫描阶段不会创建 `bindingId`，也不会自动建立歌曲关系。

桌面来源只保存 `directoryId + relativePath`。`directoryId` 由受控目录注册表解析，`relativePath` 使用 `/` 且禁止绝对路径与 `..`，因此公共业务模型不会携带本机绝对路径。

当前 Web 实现仍使用 `src/types/audio.ts` 中的 `LocalAudioFileRecord`，并在 IndexedDB 记录中直接保存 `File` 或 `FileSystemFileHandle`。这些浏览器对象不可 JSON 序列化，也不能被 Electron 或其他平台复用，因此它们被明确保留为 Web 兼容层，不属于新的公共绑定模型。现有目录导入、Repository、Hook、UI 和播放器调用方暂不迁移，行为保持不变。

下一步 Repository 应负责持久化 `LocalAudioBinding`，并由各平台适配器保存或解析实际文件能力：Web 适配器管理浏览器对象，桌面适配器通过 `directoryId + relativePath` 解析受控文件。本阶段只定义模型和纯校验函数，不实现 Repository、数据迁移、IPC、导入 UI 或音频播放。
