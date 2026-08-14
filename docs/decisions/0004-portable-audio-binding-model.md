# 使用可移植音频绑定模型

## 状态

Accepted

## 背景

旧 Web 记录直接包含 `File` 或 `FileSystemFileHandle`，无法 JSON 序列化，也不能被 Electron 或其他平台复用。扫描候选同样不等于用户确认的曲目关系。

## 决定

`LocalAudioBinding` 使用可序列化的 discriminated source reference、稳定 branded identifiers 和明确 availability。桌面 source 只含 `directoryId + relativePath`；扫描候选与 binding 保持独立；一个 track 最多一个当前 binding。

Application/Renderer 使用更窄的 `LocalAudioBindingService`：公共命令只含 opaque candidate ID、track ID 与 expected binding key，公共结果只含脱敏 summary 或结构化 error。Web adapter 私有持有浏览器文件候选并继续使用旧 IndexedDB Repository；Electron adapter 只调用既有固定 Preload API。Web 旧记录以 `record.id + updatedAt` 派生版本化 binding key，无需迁移即可获得和 Electron 相同的陈旧替换/解绑保护。

## 后果

公共 Repository 契约可以由 Web、Electron 和测试 adapter 共用；上层状态也可以依赖同一 service 结果语义。平台对象必须由各自 adapter 单独管理，Web 兼容播放流暂时仍消费旧记录，但这些对象不会进入公共 service summary/result。实际文件解析、可用性检查与播放 URL 不属于 binding 模型。
