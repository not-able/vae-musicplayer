# Electron Development Roadmap

状态标记只以 Git 中已存在的实现和测试为依据。路线图描述顺序与总体目标；当前工作的详细边界只由 `docs/tasks/active.md` 定义。

## 当前近期顺序（用户调整）

- [x] `CATALOG-1A`：canonical built-in Xu Song catalog。
- [x] `CATALOG-1B`：complete Xu Song discography audit。
- [x] `AUDIO-UNIFY-1`：unified local audio binding service。
- [ ] `AUDIO-UNIFY-2`：unified single-track Electron binding UI（当前 active task）。
- [ ] `AUDIO-UNIFY-3`：smart multi-format batch matching。
- [ ] `PLAYBACK-1`：Electron binding playback / controlled media protocol。
- [ ] `PLAYBACK-2`：unified playback and binding state。
- [ ] `ELECTRON-2.5`：missing / changed detection（延后）。

## 阶段 0：Electron 基础壳

- [x] Main / Preload / Renderer 三层结构与安全窗口配置。
- [x] 开发服务器和生产 Renderer 加载流程。
- [x] 导航、新窗口与外部 HTTPS 链接限制。
- [x] Web、Electron 构建与 Windows x64 NSIS/unpacked 打包。

## 阶段 1：目录授权与扫描

- [x] 受控目录选择和 `directoryId`。
- [x] 带版本的持久化目录注册表及原子写入。
- [x] 窄 IPC、sender 校验和目录忘记操作。
- [x] 安全递归扫描、路径逃逸防护和可序列化候选结果。
- [x] 平台无关目录条目解析。

## 阶段 2：桌面音频绑定与导入

- [x] 2.1 可移植 `LocalAudioBinding` 模型。
- [x] 2.2A Repository 契约与内存参考实现。
- [x] 2.2B Electron JSON binding 持久化。
- [x] 2.2C Main binding service 与窄 IPC。
- [x] 2.3 扫描候选接入导入预览。
- [x] 2.4A 安全的候选确认与绑定服务。
- [x] 2.4B 曲目选择、替换确认和解绑确认 UI。
- [ ] 2.5 missing/changed 状态检查（按用户调整延后至近期序列尾部）。

## 阶段 3：本地播放

- [ ] 受控媒体协议及安全响应头。
- [ ] Range 请求、seek 与资源生命周期。
- [ ] 平台无关 `AudioSourceResolver`。
- [ ] 播放错误处理和多格式实际验证。

## 阶段 4：音乐库增强

- [ ] 标签、时长和封面元数据。
- [ ] 增量扫描、文件变化检测与大型曲库性能。

## 阶段 5：桌面体验

- [ ] 系统媒体控制、托盘与快捷键。
- [ ] 窗口状态和桌面交互完善。

## 阶段 6：正式发布

- [ ] 正式图标、签名、自动更新和发布检查清单。
- [ ] Windows 安装/升级/卸载及目标平台验收。

## 阶段 7：Tauri 验证

- [ ] 在 Electron 验证产品规则后开展独立技术验证。
- [ ] 比较受控文件访问、播放、打包和维护成本。
- [ ] 形成是否进入 Tauri 产品实现的 ADR；在此之前不重复完整产品功能。
