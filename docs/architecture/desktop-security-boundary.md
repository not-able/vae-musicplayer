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
- `displayPath` 仅用于显示，不是访问凭据。

目录注册、扫描和 binding API 的当前操作说明见 [`../desktop-development.md`](../desktop-development.md)。binding IPC 只接受可序列化的 `desktop-file` source，并在写入前确认 `directoryId` 仍存在于 Main 的受控注册表；存储错误会转换为不含本机路径的稳定公开错误。
