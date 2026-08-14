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

## Catalog

Web 与 Electron 共用 `src/data/catalog/xuSongOfficialCatalog.ts` 作为唯一静态 baseline，再叠加持久化 `UserCatalogChanges`。当前 baseline 含 11 个既有发行分组和 3 个 `single_collection`，共 162 首；内置 album/track ID 显式稳定，Track 的有限 `aliases` 用于保存真实标题变体。旧 verified import 通过非破坏 canonical reference 兼容，不按标题猜测删除。来源清单见 [`../catalog/xu-song-discography-audit.md`](../catalog/xu-song-discography-audit.md)，长期决定见 [`../decisions/0006-canonical-built-in-catalog.md`](../decisions/0006-canonical-built-in-catalog.md)。

## 当前实现

| 层                 | 职责                                                                                   |
| ------------------ | -------------------------------------------------------------------------------------- |
| React Renderer     | Web UI 与只含 `candidateId` 的 Electron 预览/绑定确认；依赖统一 binding service 结果。 |
| Electron Preload   | 暴露平台信息、目录摘要和候选 binding 固定方法，不暴露通用 IPC。                        |
| Electron Main      | 安全窗口、目录/扫描、临时候选 session、binding service 及 JSON adapter。               |
| Domain/Application | 平台无关目录解析、`LocalAudioBinding`、Repository 与统一 service contract。            |
| Web adapter        | 旧 IndexedDB Repository 与浏览器 `File`/handle 兼容；对外只给脱敏 service result。     |

## Planned

- availability 检查和受控播放 URL 解析。

详细安全边界见 [`desktop-security-boundary.md`](desktop-security-boundary.md)，音频生命周期见 [`local-audio-lifecycle.md`](local-audio-lifecycle.md)，运行与打包说明见 [`../desktop-development.md`](../desktop-development.md)。
