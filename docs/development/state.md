# Electron Development State

- 更新时间：2026-08-02
- 分支：`desktop/electron`
- 当前阶段：阶段 2 — 桌面音频绑定与导入（2.2B 已完成）
- 当前任务：`ELECTRON-2.2C` — Main binding service 与窄 IPC

## 已完成

- Electron 安全 Main/Preload/Renderer 桌面壳，Web 入口保持独立。
- Windows x64 NSIS 安装包与 unpacked 打包流程。
- 受控目录选择及持久化目录注册表，绝对路径仅由 Main 持有。
- 安全递归目录扫描，跳过符号链接并阻止路径逃逸。
- Web/Electron 共用的平台无关目录条目解析规则。
- 可序列化 `LocalAudioBinding` 模型与 branded identifiers。
- `LocalAudioBindingRepository` 契约和无平台依赖的内存参考实现。
- 带 schema version、原子写入和损坏备份的 Electron JSON binding Repository。

## 关键提交

- `80cf92f` — `desktop(electron): add secure application shell`
- `e082a02` — `desktop(electron): add controlled music directory scanning`
- `c3f3a26` — `refactor(local-library): define portable audio binding model`
- `7ccc999` — `refactor(local-library): define audio binding repository`
- `desktop(electron): persist local audio bindings` — 与本次状态交接同一提交

## 核心不变量

- Renderer 无 Node.js、Electron 或通用 IPC 能力。
- Main 校验 IPC sender，并只从受控注册表解析目录绝对路径。
- 桌面文件引用为 `directoryId + relativePath`；公共 binding 不保存绝对路径或平台对象。
- 扫描候选不会自动成为 binding；一个 track 最多一个当前 binding。
- Repository 不读取音频、不生成播放 URL、不隐式修改时间戳。
- JSON Repository 的文件路径由 Main 调用方注入；损坏数据和未知 schema 不会被静默覆盖。
- Web 目录导入、旧 Web Repository 和 Web 构建保持兼容。

## 当前遗留问题

- binding 尚未接入 Main service、IPC、导入确认 UI 或播放器。
- availability 检查和受控播放协议尚未实现。

## 下一步任务序列

1. `ELECTRON-2.2C`：Main binding service 与窄 IPC。
2. `ELECTRON-2.3`：扫描候选接入导入预览。
3. `ELECTRON-2.4`：用户确认绑定与解绑。
4. `ELECTRON-2.5`：missing/changed 状态检查。

## 最近一次验证状态

2026-08-02：`npm run test:run`（31 个文件、321 项测试）、`npm run lint`、`npm run build`、`npm run desktop:build` 与 `git diff --check` 全部通过。
