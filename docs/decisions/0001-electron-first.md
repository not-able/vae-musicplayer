# Electron 作为近期桌面交付路线

## 状态

Accepted

## 背景

项目已有 React/Vite/TypeScript Web 应用。近期需要先验证可安装桌面版本、本地文件权限和产品流程，而团队的 Rust/Tauri 能力仍需独立学习验证。

## 决定

Electron 是近期正式桌面交付路线；Tauri 仅在 Electron 验证核心产品规则后作为后续技术验证，不并行重写完整产品。

## 后果

Electron 可复用现有技术栈并快速交付。公共业务规则必须保持平台无关，以便未来评估 Tauri；是否进入 Tauri 产品实现需另立 ADR。
