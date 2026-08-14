# Development State

- 更新时间：2026-08-14
- 分支：`desktop/electron`
- 当前阶段：目录基线稳定化（`CATALOG-1A` 已完成）
- 当前任务：`CATALOG-1B` — 完整许嵩作品目录审计与补充

## 已完成

- Electron 安全桌面壳、受控目录扫描、可移植 binding、Main 候选确认服务及绑定/替换/解绑 UI。
- 正式 Web/Electron 启动统一使用 `src/data/catalog/xuSongOfficialCatalog.ts`，不再使用占位 `mockCatalog`。
- 当前 11 张内置目录的 album/track ID 均在源码中显式定义；插入和重排不会改变既有 ID。
- 用户目录继续使用 `canonical baseline + UserCatalogChanges`，新增、编辑、删除和恢复默认能力保持可用。
- 正常产品 UI 已移除“导入许嵩目录”和“导入远程元数据”，本地音源入口保留；底层远程 Provider 暂未清理。
- 旧 verified import 仅在结构完整且唯一匹配时标记 canonical external reference，并以旧实体遮蔽重复 baseline；不删除旧实体或改写其随机 ID。
- 旧 placeholder baseline 的删除标记被安全丢弃；针对 placeholder 的编辑或用户新增歌曲会物化为普通用户实体，避免整个 change set 因 baseline 切换失效。

## 核心不变量

- `xuSongOfficialCatalog` 是 Web/Electron 唯一正式 baseline；`mockCatalog` 仅作为测试 fixture 导出。
- 内置 album/track ID 显式、稳定，不从数组位置或 track number 动态生成。
- 内置数据可由用户 overlay 修改或删除；开发者维护的 baseline 本身保持只读。
- 不按标题猜测或删除旧导入；只有完整、唯一结构匹配或已持久化 canonical reference 才去重显示。
- 旧导入的本地实体 ID 保持不变，因此引用这些 track ID 的 playlist/binding 不需要迁移。
- Renderer/Main 文件安全边界、桌面 binding API 和 Web 音频流程保持不变。

## 当前遗留问题

- 现有 11 张目录尚未覆盖全部独立单曲、合作曲、影视/游戏歌曲和可靠发行元数据；由 `CATALOG-1B` 处理。
- 旧占位歌曲 `track_sample_*` 与真实作品没有可靠语义映射；相关 binding 记录不会被删除，但不能猜测迁移到 canonical track。
- 音源统一、桌面单曲绑定、智能批量匹配、受控播放协议和 availability 检查均尚未实现。

## 下一步任务序列

1. `CATALOG-1B`：完整许嵩作品目录审计与补充。
2. `AUDIO-UNIFY-1` 至 `AUDIO-UNIFY-3`：统一音频绑定服务、单曲 Electron 绑定 UI 与智能批量匹配。
3. `PLAYBACK-1`、`PLAYBACK-2`：受控桌面播放与统一播放/binding 状态。
4. `ELECTRON-2.5`：missing/changed 状态检查（已延后，任务说明保存在 `docs/tasks/deferred/`）。

## 最近一次验证状态

2026-08-14：`npm run test:run`（41 个测试文件、377 项测试）、`npm run lint`、`npm run build`、`npm run desktop:build` 与 `git diff --check` 全部通过。`npm run desktop:dev` 已验证 Electron 安全探针和 canonical 首屏；隔离 userData 中完成本地音源入口、专辑打开、新增、编辑、删除确认、重启持久化与恢复默认验证；普通 `npm run dev` Web 首屏行为一致。临时进程、userData、日志和截图均已清理。
