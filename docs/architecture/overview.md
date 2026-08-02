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

| 层                 | 职责                                                                       |
| ------------------ | -------------------------------------------------------------------------- |
| React Renderer     | Web UI 与 Electron 扫描预览；不能访问 Node.js、Electron 或真实目录路径。   |
| Electron Preload   | 通过 `contextBridge` 暴露平台信息、目录和 binding 窄 API，不暴露通用 IPC。 |
| Electron Main      | 窗口、安全导航、sender 校验、目录/扫描、binding service 及 JSON adapter。  |
| Domain/Application | 平台无关目录条目解析、`LocalAudioBinding` 与 Repository 契约。             |
| Web adapter        | 旧 Web IndexedDB Repository 继续管理浏览器 `File`/handle；尚未迁移。       |

## Planned

- 用户确认或解除扫描候选 binding。
- availability 检查和受控播放 URL 解析。

详细安全边界见 [`desktop-security-boundary.md`](desktop-security-boundary.md)，音频生命周期见 [`local-audio-lifecycle.md`](local-audio-lifecycle.md)，运行与打包说明见 [`../desktop-development.md`](../desktop-development.md)。
