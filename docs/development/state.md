# Electron Development State

- 更新时间：2026-08-02
- 分支：`desktop/electron`
- 当前阶段：阶段 2 — 桌面音频绑定与导入（2.4A 已完成）
- 当前任务：`ELECTRON-2.4B` — 曲目选择、替换确认和解绑确认 UI

## 已完成

- Electron 安全 Main/Preload/Renderer 桌面壳，Web 入口保持独立。
- Windows x64 NSIS 安装包与 unpacked 打包流程。
- 受控目录选择及持久化目录注册表，绝对路径仅由 Main 持有。
- 安全递归目录扫描，跳过符号链接并阻止路径逃逸。
- Web/Electron 共用的平台无关目录条目解析规则。
- 可序列化 `LocalAudioBinding` 模型与 branded identifiers。
- `LocalAudioBindingRepository` 契约和无平台依赖的内存参考实现。
- 带 schema version、原子写入和损坏备份的 Electron JSON binding Repository。
- Main binding service、固定 IPC channels 和 `window.desktop.musicLibrary.bindings` 窄 API。
- Electron 扫描候选已接入现有导入弹窗的临时预览；Web 导入分支保持不变。
- Main 内存候选 session、不可预测 `candidateId`、安全绑定/替换/解绑命令与脱敏 binding summary。

## 关键提交

- `80cf92f` — `desktop(electron): add secure application shell`
- `e082a02` — `desktop(electron): add controlled music directory scanning`
- `c3f3a26` — `refactor(local-library): define portable audio binding model`
- `7ccc999` — `refactor(local-library): define audio binding repository`
- `6d481c7` — `desktop(electron): persist local audio bindings`
- `db60170` — `desktop(electron): expose local audio binding service`
- `4fda05c` — `desktop(electron): preview scanned audio candidates`
- `desktop(electron): secure candidate binding commands` — 与本次状态交接同一提交

## 核心不变量

- Renderer 无 Node.js、Electron 或通用 IPC 能力。
- Main 校验 IPC sender，并只从受控注册表解析目录绝对路径。
- 桌面文件引用为 `directoryId + relativePath`；公共 binding 不保存绝对路径或平台对象。
- 扫描候选不会自动成为 binding；一个 track 最多一个当前 binding。
- Repository 不读取音频、不生成播放 URL、不隐式修改时间戳。
- JSON Repository 的文件路径由 Main 调用方注入；损坏数据和未知 schema 不会被静默覆盖。
- Electron binding 写入只接受已注册目录中的 `desktop-file` source；公开错误不泄露本机路径。
- Renderer 的目录摘要不含 `displayPath`；扫描预览只含不可预测 `candidateId` 和安全展示元数据，不含 `directoryId`、相对路径、sourceRef 或 binding。
- Main 将候选绑定到 webContents 和当前 scan generation；重扫、忘记目录、Renderer 销毁或应用重启都会使相关候选失效。
- Renderer 不能提交完整 binding、路径、sourceRef 或文件元数据；Main 只从内部候选创建 binding。
- 替换和解绑使用 expected binding ID 比较交换；过期请求不会覆盖或删除新 binding。
- Web 目录导入、旧 Web Repository 和 Web 构建保持兼容。

## 当前遗留问题

- 桌面预览尚无曲目选择、替换确认或解绑确认 UI；安全 binding 命令尚无 UI 调用方。
- availability 检查和受控播放协议尚未实现。

## 下一步任务序列

1. `ELECTRON-2.4B`：曲目选择、替换确认和解绑确认 UI。
2. `ELECTRON-2.5`：missing/changed 状态检查。
3. 阶段 3：受控桌面音频播放。

## 最近一次验证状态

2026-08-02：`npm run test:run`（39 个文件、357 项测试）、`npm run lint`、`npm run build`、`npm run desktop:build` 与 `git diff --check` 全部通过。
