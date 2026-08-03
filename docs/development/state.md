# Electron Development State

- 更新时间：2026-08-03
- 分支：`desktop/electron`
- 当前阶段：阶段 2 — 桌面音频绑定与导入（2.4B 已完成）
- 当前任务：`ELECTRON-2.5` — missing/changed 状态检查

## 已完成

- Electron 安全 Main/Preload/Renderer 桌面壳，Web 入口保持独立。
- Windows x64 NSIS 安装包与 unpacked 打包流程。
- 受控目录选择、持久化目录注册表和安全递归扫描；绝对路径仅由 Main 持有。
- Web/Electron 共用的平台无关目录条目解析规则。
- 可序列化 `LocalAudioBinding` 模型、branded identifiers、Repository 契约与内存参考实现。
- 带 schema version、原子写入和损坏备份的 Electron JSON binding Repository。
- Main binding service、固定 IPC channels 和 `window.desktop.musicLibrary.bindings` 窄 API。
- Main 内存候选 session、不可预测 `candidateId`、安全绑定/替换/解绑命令与脱敏 binding summary。
- Electron 扫描候选逐项曲目搜索/选择、新绑定、替换确认、更换曲目和解绑确认 UI；Web 导入分支保持不变。

## 关键提交

- `80cf92f` — `desktop(electron): add secure application shell`
- `e082a02` — `desktop(electron): add controlled music directory scanning`
- `c3f3a26` — `refactor(local-library): define portable audio binding model`
- `7ccc999` — `refactor(local-library): define audio binding repository`
- `6d481c7` — `desktop(electron): persist local audio bindings`
- `db60170` — `desktop(electron): expose local audio binding service`
- `4fda05c` — `desktop(electron): preview scanned audio candidates`
- `db2c448` — `desktop(electron): secure candidate binding commands`
- `desktop(electron): add candidate binding confirmation UI` — 与本次状态交接同一提交

## 核心不变量

- Renderer 无 Node.js、Electron 或通用 IPC 能力。
- Main 校验 IPC sender，并只从受控注册表解析目录绝对路径。
- 桌面文件引用为 `directoryId + relativePath`；公共 binding 不保存绝对路径或平台对象。
- Renderer 的目录摘要不含 `displayPath`；扫描预览只含不可预测 `candidateId` 和安全展示元数据。
- 扫描候选不会自动成为 binding；一个 track 最多一个当前 binding。
- Main 将候选绑定到 webContents 和当前 scan generation；重扫、忘记目录、Renderer 销毁或应用重启都会使相关候选失效。
- Renderer 不能提交完整 binding、路径、sourceRef 或文件元数据；绑定 UI 只提交 candidate/track/expected binding ID。
- 替换和解绑使用 expected binding ID 比较交换；冲突后 UI 刷新 Main binding summary，过期请求不会覆盖或删除新 binding。
- Repository 不读取音频、不生成播放 URL、不隐式修改时间戳。
- Web 目录导入、旧 Web Repository、播放器和 Web 构建保持兼容。

## 当前遗留问题

- binding availability 尚未根据目录和文件状态刷新，`missing`/`changed` 仍不能自动判定。
- 受控桌面播放协议和桌面音频播放仍未实现。

## 下一步任务序列

1. `ELECTRON-2.5`：missing/changed 状态检查。
2. 阶段 3：受控桌面音频播放。
3. 后续音乐库增强与桌面体验。

## 最近一次验证状态

2026-08-03：`npm run test:run`（40 个文件、369 项测试）、`npm run lint`、`npm run build`、`npm run desktop:build` 与 `git diff --check` 全部通过。`npm run desktop:dev` 已实际验证安全探针、目录扫描预览、曲目搜索、新绑定、替换/取消、解绑/取消和重扫失效；临时目录授权与 binding 已清理。
