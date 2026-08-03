# Active Task

- 任务 ID：`ELECTRON-2.5`
- 状态：`ready`
- 分支：`desktop/electron`

## 前置条件

- 工作区干净。
- 当前分支包含 `desktop(electron): add candidate binding confirmation UI`。
- 开始前阅读：
  - `docs/architecture/overview.md`
  - `docs/architecture/desktop-security-boundary.md`
  - `docs/architecture/local-audio-lifecycle.md`
  - `docs/decisions/0003-controlled-directory-references.md`
  - `docs/decisions/0004-portable-audio-binding-model.md`
  - `docs/decisions/0005-main-owned-scan-candidates.md`

## 目标

由 Main 根据受控目录和文件元数据刷新桌面 binding 的 `available`、`missing`、`permission-required`、`changed` 或 `unknown` 状态，并向 Renderer 返回脱敏摘要。

## 范围

- 只由 Main 从持久化 binding 的 `directoryId + relativePath` 解析实际文件；Renderer 不提交路径或 sourceRef。
- 复用目录注册表和扫描器的路径规范化、授权根目录、符号链接与逃逸防护规则。
- 使用文件存在性、可读性、大小和修改时间判断 availability；不读取音频内容。
- 为 availability 刷新增加固定 IPC/Preload 窄接口或扩展现有只读查询流程，并继续校验 sender 和参数。
- 更新 binding availability 时保持 Repository 的显式时间戳语义和一个 track 一个 binding 约束。
- UI 显示安全状态和可恢复反馈，不展示路径、sourceRef、内部 channel、堆栈或原始异常。
- 增加可用、丢失、权限不足、元数据变化、未知错误、路径逃逸、冲突和 Web 兼容测试。

## 明确不做

- 音频内容读取、标签/封面/时长解析或哈希比对。
- 文件监听、后台常驻扫描、增量索引或自动修复 binding。
- 音频播放、`app-media://`、Range 请求或播放器 hook 重构。
- 自动匹配、批量绑定、目录导入 UI 改版或 Repository schema 迁移。
- SQLite、IndexedDB 迁移、Tauri 或系统媒体能力。

## 验收条件

- Renderer 只能请求刷新受控 binding 状态，不能构造任意文件访问。
- Main 能稳定区分现存未变、丢失、权限不足和大小/修改时间变化，并为未知失败返回安全状态或脱敏错误。
- availability 更新不会覆盖并发产生的新 binding，过期请求不能修改新状态。
- 绑定确认 UI 能刷新并显示状态；Web 导入和 Web 播放行为不变。
- 默认验证命令和新增聚焦测试全部通过。

## 建议提交

`desktop(electron): refresh local audio availability`
