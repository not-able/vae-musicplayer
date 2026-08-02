# Desktop Security Boundary

## BrowserWindow

当前 Electron 窗口固定使用：

```ts
nodeIntegration: false;
contextIsolation: true;
sandbox: true;
```

Renderer 只加载明确的开发服务器地址或打包后的本地页面。非预期导航、重定向、`webview` 和新窗口被拒绝；只有无凭据的 `https:` 外链可交给系统浏览器。

## IPC

- Preload 只暴露命名明确的只读或领域操作，不暴露通用 IPC。
- Main 注册固定 channel，并验证调用 sender 属于当前可信 Renderer。
- 参数和返回值必须经过显式校验且可序列化；错误返回稳定、非敏感的结构。
- 不通过 IPC 传输整首音频、Node/Electron 对象或文件系统句柄。

## 文件权限

- Renderer 不能提交任意绝对路径请求访问文件。
- Main 持有目录注册表中的真实根路径，并以 opaque `directoryId` 查找。
- 公共桌面文件引用只包含 `directoryId + relativePath`；相对路径使用 `/`。
- Main 解析路径时拒绝绝对路径、`..`、符号链接和授权根目录逃逸。
- Renderer 收到的目录摘要不含 `displayPath`；真实根路径只存在于 Main 注册表。
- Main 为扫描结果生成不可预测 `candidateId`；公开预览不含 `directoryId`、相对路径或 sourceRef。
- 候选按 webContents 和 scan generation 隔离；重扫、忘记目录、Renderer 销毁或重启后失效。

目录注册、扫描和 binding API 的当前操作说明见 [`../desktop-development.md`](../desktop-development.md)。Renderer 只能提交 `candidateId + trackId`，不能提交完整 binding、路径、sourceRef 或文件元数据。Main 从候选 session 生成 `desktop-file` source，并通过 expected binding ID 防止过期替换或解绑；存储错误会转换为不含本机路径的稳定公开错误。
