# 使用安全 Electron 进程边界

## 状态

Accepted

## 背景

Renderer 展示大量应用 UI，一旦受到脚本注入，不应因此获得操作系统或任意 IPC 能力。

## 决定

使用隔离的 Main/Preload/Renderer 结构，启用 sandbox 和 context isolation，关闭 node integration。Preload 只暴露类型明确的窄 API；Main 使用固定 channel、参数校验和 sender 校验。

## 后果

平台能力需要逐项设计契约，不能用通用 `send`/`invoke` 走捷径。安全边界测试和 Web 独立构建成为每次桌面变更的默认验收项。
