# Local Audio Lifecycle

```text
目录选择
→ Main 注册目录并返回 directoryId
→ 安全目录扫描
→ Main 保存 DesktopScannedAudioFile 与 candidateId 映射
→ Renderer 只接收 candidateId 临时预览
→ 用户搜索现有曲目并确认绑定/替换
→ LocalAudioBinding
→ Repository 持久化
→ availability 检查（planned）
→ 受控播放 URL 解析（planned）
→ audio element（planned for desktop source）
```

## 概念边界

| 概念              | 含义                                                             | 当前状态                                      |
| ----------------- | ---------------------------------------------------------------- | --------------------------------------------- |
| Scanned candidate | Main 持有的扫描文件记录；Renderer 只见临时 `candidateId`。       | 已实现并接入安全预览                          |
| Source reference  | 平台无关的文件引用；桌面引用为 `directoryId + relativePath`。    | 已实现                                        |
| LocalAudioBinding | track 与 source reference 的用户确认关系，含可用性和文件元数据。 | 模型已实现                                    |
| Repository        | 保存 binding 元数据；不检查文件、不读音频、不生成 URL。          | 契约、内存实现和 Electron JSON adapter 已完成 |
| Binding API       | 只接受 candidate/track/expected binding ID 的 Main 窄命令。      | 已实现并接入确认 UI                           |
| Playable URL      | 播放期临时资源定位，由受控 resolver 生成，不进入 binding。       | planned                                       |

一个 track 最多一个当前 binding。扫描不会自动绑定；Main 候选 session 不持久化，并按 webContents/generation 隔离。Renderer 不接收可组合成文件引用的目录与相对路径，替换/解绑使用 expected binding ID 防止陈旧操作。确认 UI 只在候选与 binding 展示元数据一一对应时恢复已有行关联，歧义时不自动猜测；本次会话的成功写入仍以 Main 返回并重新加载的 binding summary 为事实来源。binding 不保存 Renderer 可用的绝对路径；playable URL 不作为持久化标识。Web 旧模型仍可保存浏览器 `File` 或 `FileSystemFileHandle`，但这些对象停留在 Web adapter 边界内。

模型细节见 [`../local-audio-binding-model.md`](../local-audio-binding-model.md)。
