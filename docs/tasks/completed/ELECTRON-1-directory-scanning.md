# ELECTRON-1 — Controlled Directory Scanning

- 任务 ID：`ELECTRON-1`
- 状态：`completed`
- 目标：在 Main 中建立受控目录授权、持久化注册和安全扫描能力。
- 主要交付：目录选择、版本化注册表、原子写入、`directoryId` 解析、窄 IPC、sender 校验、安全递归扫描、路径逃逸防护及平台无关目录条目解析。
- Commit：`e082a02`（`desktop(electron): add controlled music directory scanning`）
- 验证：目录注册表、扫描器、IPC handler、共享解析规则及全部默认测试/构建在任务完成时通过。
- 已知限制：候选结果未接入 UI，不解析音频内容、标签、时长或封面，也不建立 binding。
