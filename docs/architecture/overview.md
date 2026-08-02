# Architecture Overview

项目保留一个 React/Vite Renderer，同时通过平台适配层支持 Web 与 Electron。公共领域规则不依赖平台对象。

```text
React Renderer
    │ typed narrow API
Electron Preload
    │ whitelisted IPC
Electron Main ── platform adapters ── filesystem / JSON storage

Domain and application rules
    ├─ catalog / queue / player rules
    ├─ portable LocalAudioBinding
    └─ repository contracts

Web adapters
    └─ browser File / FileSystemFileHandle compatibility storage
```

## 当前实现

| 层                 | 职责                                                                            |
| ------------------ | ------------------------------------------------------------------------------- |
| React Renderer     | 现有 Web UI 和业务调用方；不能访问 Node.js、Electron 或真实目录路径。           |
| Electron Preload   | 通过 `contextBridge` 暴露平台信息和音乐目录窄 API，不暴露通用 `send`/`invoke`。 |
| Electron Main      | 窗口、安全导航、IPC sender 校验、目录注册、绝对路径解析和扫描。                 |
| Domain/Application | 平台无关目录条目解析、`LocalAudioBinding` 与 Repository 契约。                  |
| Web adapter        | 旧 Web IndexedDB Repository 继续管理浏览器 `File`/handle；尚未迁移。            |

## Planned

- Electron JSON binding adapter（当前 `ELECTRON-2.2B`）。
- Main binding service 与专用 IPC。
- 导入确认、availability 检查、受控播放 URL 解析。

详细安全边界见 [`desktop-security-boundary.md`](desktop-security-boundary.md)，音频生命周期见 [`local-audio-lifecycle.md`](local-audio-lifecycle.md)，运行与打包说明见 [`../desktop-development.md`](../desktop-development.md)。
