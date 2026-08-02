# Electron 桌面壳开发说明

当前桌面版本使用 Electron 与 electron-builder。现有 React/Vite 应用继续作为 Renderer，桌面适配代码独立放在 `electron/`，不会改变 Web 开发入口。

桌面工具链要求 Node.js 22.12.0 或更高版本。

## 常用命令

```bash
npm run dev
npm run build

npm run desktop:dev
npm run desktop:build
npm run desktop:package
```

- `desktop:dev`：先类型检查并构建 Main/Preload，再在固定的 `http://127.0.0.1:5173/` 启动 Vite，服务可用后打开 Electron。关闭 Electron 后会清理 Vite 子进程。
- `desktop:build`：构建 Web Renderer 与 Electron Main/Preload，但不生成安装包。
- `desktop:package`：完成桌面构建后生成 Windows x64 NSIS 安装包和 unpacked 目录，产物写入 `release/`。

`dist/`、`dist-electron/` 和 `release/` 都是本地构建产物，不应提交。

## 进程边界

- Main：创建窗口、选择开发或生产页面、限制导航和新窗口，并注册白名单 IPC。
- Preload：通过 `contextBridge` 仅暴露 `window.desktop.getPlatformInfo()`。
- Renderer：现有 React 页面；不能直接访问 Node.js、Electron 或通用 IPC。

窗口启用 `nodeIntegration: false`、`contextIsolation: true` 和 `sandbox: true`。应用内导航只接受当前固定 Renderer 页面；新窗口始终拒绝。外部链接只有在解析并确认协议为 `https:` 且不含嵌入凭据后，才会交给系统浏览器。

本阶段不提供目录扫描、原生文件选择、系统托盘、快捷键、自动更新或其他桌面业务能力。
