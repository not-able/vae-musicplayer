# Local Audio Lifecycle

```text
目录选择
→ Main 注册目录并返回 directoryId
→ 安全目录扫描
→ DesktopScannedAudioFile 候选
→ 用户确认匹配（planned）
→ LocalAudioBinding
→ Repository 持久化
→ availability 检查（planned）
→ 受控播放 URL 解析（planned）
→ audio element（planned for desktop source）
```

## 概念边界

| 概念              | 含义                                                             | 当前状态                                      |
| ----------------- | ---------------------------------------------------------------- | --------------------------------------------- |
| Scanned candidate | 扫描发现的候选文件；没有 `bindingId`，不代表用户确认。           | 已实现                                        |
| Source reference  | 平台无关的文件引用；桌面引用为 `directoryId + relativePath`。    | 已实现                                        |
| LocalAudioBinding | track 与 source reference 的用户确认关系，含可用性和文件元数据。 | 模型已实现                                    |
| Repository        | 保存 binding 元数据；不检查文件、不读音频、不生成 URL。          | 契约、内存实现和 Electron JSON adapter 已完成 |
| Binding API       | Main service 与固定 IPC；只接受已注册目录的 desktop source。     | 已实现，尚无 UI 调用方                        |
| Playable URL      | 播放期临时资源定位，由受控 resolver 生成，不进入 binding。       | planned                                       |

一个 track 最多一个当前 binding。扫描不会自动绑定；binding 不保存 Renderer 可用的绝对路径；playable URL 不作为持久化标识。Web 旧模型仍可保存浏览器 `File` 或 `FileSystemFileHandle`，但这些对象停留在 Web adapter 边界内。

模型细节见 [`../local-audio-binding-model.md`](../local-audio-binding-model.md)。
