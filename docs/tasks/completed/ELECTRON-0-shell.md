# ELECTRON-0 — Secure Electron Shell

- 任务 ID：`ELECTRON-0`
- 状态：`completed`
- 目标：为现有 React/Vite 应用建立最小安全 Electron 壳及 Windows 打包能力。
- 主要交付：Main/Preload/Renderer 边界、安全窗口与导航策略、平台信息窄 IPC、开发/生产构建、electron-builder NSIS 与 unpacked 配置。
- Commit：`80cf92f`（`desktop(electron): add secure application shell`）
- 验证：Web 测试、Lint、Web/Electron 构建、开发窗口安全探针及 Windows x64 打包在任务完成时通过。
- 已知限制：使用默认应用图标；不含目录访问、音频绑定或桌面播放功能。
