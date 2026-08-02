# Main 持有临时扫描候选

## 状态

Accepted

## 背景

早期扫描结果向 Renderer 暴露 `directoryId + relativePath`，且 2.2C binding 写接口允许 Renderer 提交完整 `LocalAudioBinding`。即使 Main 再校验这些数据，被注入的 Renderer 仍能构造文件引用和文件元数据，并可能基于陈旧状态覆盖或删除新 binding。

## 决定

Main 为可信扫描结果生成不可预测的临时 `candidateId`，并在内存中保存 candidate 到 sourceRef/文件元数据的映射。公开预览只含 candidate ID 和安全展示字段，不含目录 ID、相对路径、sourceRef 或绝对路径。候选绑定到 webContents 和当前 scan generation；重扫、忘记目录、Renderer 销毁或应用重启都会使其失效。

Renderer 只能调用固定的 `bindCandidateToTrack` 和 `unbindTrack` 命令。Main 从内部候选生成 binding；替换和解绑必须携带与当前状态一致的 expected binding ID。只读查询返回不含 sourceRef 的 summary。

## 后果

Renderer 无法构造桌面文件引用或完整 binding，陈旧 UI 操作也不能覆盖或删除新状态。候选不持久化，UI 在 session 失效后必须重新扫描。本阶段不增加基于时间的 TTL；generation、目录忘记、owner 销毁和应用生命周期构成失效边界。
