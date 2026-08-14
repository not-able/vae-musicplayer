# Development State

- 更新时间：2026-08-14
- 分支：`desktop/electron`
- 当前阶段：统一本地音频绑定服务准备（`CATALOG-1B` 已完成）
- 当前任务：`AUDIO-UNIFY-1` — Unified local audio binding service

## 已完成

- Electron 安全桌面壳、受控目录扫描、可移植 binding、Main 候选确认服务及绑定/替换/解绑 UI。
- 正式 Web/Electron 启动统一使用 `src/data/catalog/xuSongOfficialCatalog.ts`，不再使用占位 `mockCatalog`。
- 当前 11 张内置目录的 album/track ID 均在源码中显式定义；插入和重排不会改变既有 ID。
- 用户目录继续使用 `canonical baseline + UserCatalogChanges`，新增、编辑、删除和恢复默认能力保持可用。
- 正常产品 UI 已移除“导入许嵩目录”和“导入远程元数据”，本地音源入口保留；底层远程 Provider 暂未清理。
- 旧 verified import 仅在结构完整且唯一匹配时标记 canonical external reference，并以旧实体遮蔽重复 baseline；不删除旧实体或改写其随机 ID。
- 旧 placeholder baseline 的删除标记被安全丢弃；针对 placeholder 的编辑或用户新增歌曲会物化为普通用户实体，避免整个 change set 因 baseline 切换失效。
- Apple Music 与 MusicBrainz 审计已落在 `docs/catalog/xu-song-discography-audit.md`；默认目录由 11 个发行分组 / 111 首扩展为 14 个分组 / 162 首。
- 新增 3 个 `single_collection`，覆盖可可靠核对的早期作品、独立单曲、合作曲及影视/游戏歌曲；`放飞` 因只有 recording 且无 release 证据标为 `needs-review`，未进入 baseline。
- Track 最小增加可序列化 `aliases`；OST 长标题和必要合作署名作为 alias，UI 继续展示短 canonical title，存储与 overlay 会保留 aliases。

## 核心不变量

- `xuSongOfficialCatalog` 是 Web/Electron 唯一正式 baseline；`mockCatalog` 仅作为测试 fixture 导出。
- 内置 album/track ID 显式、稳定，不从数组位置或 track number 动态生成。
- 内置数据可由用户 overlay 修改或删除；开发者维护的 baseline 本身保持只读。
- 不按标题猜测或删除旧导入；只有完整、唯一结构匹配或已持久化 canonical reference 才去重显示。
- 旧导入的本地实体 ID 保持不变，因此引用这些 track ID 的 playlist/binding 不需要迁移。
- Renderer/Main 文件安全边界、桌面 binding API 和 Web 音频流程保持不变。
- CATALOG-1A 的 11 个 album ID 与 111 个 track ID 原样保留；新增 track ID 均为源码显式、可读且不依赖排序。

## 当前遗留问题

- CATALOG-1A 的 `许嵩 No.1` / `半城烟沙` 之间有 6 个历史同名 release-master；为保持已发布 ID 与 binding 兼容暂不合并，审计和测试明确锁定该集合。
- `放飞` 暂无可靠正式发行证据，保留为 `needs-review`；普通现场重复与伴奏版本未进入 baseline。
- 旧占位歌曲 `track_sample_*` 与真实作品没有可靠语义映射；相关 binding 记录不会被删除，但不能猜测迁移到 canonical track。
- 音源统一、桌面单曲绑定、智能批量匹配、受控播放协议和 availability 检查均尚未实现。

## 下一步任务序列

1. `AUDIO-UNIFY-1`：统一 Web/Electron 本地音频绑定服务边界。
2. `AUDIO-UNIFY-2`、`AUDIO-UNIFY-3`：单曲 Electron 绑定 UI 与智能批量匹配。
3. `PLAYBACK-1`、`PLAYBACK-2`：受控桌面播放与统一播放/binding 状态。
4. `ELECTRON-2.5`：missing/changed 状态检查（已延后，任务说明保存在 `docs/tasks/deferred/`）。

## 最近一次验证状态

2026-08-14：`npm run test:run`（41 个测试文件、382 项测试）、`npm run lint`、`npm run build`、`npm run desktop:build`、`git diff --check` 与本任务修改文件的 Prettier 检查全部通过。仓库级 `npm run format:check` 仍仅报告两个任务开始前已存在且本次未修改的文件：`src/features/local-library/inMemoryLocalAudioBindingRepository.ts`、`src/tests/localAudioBindingRepository.test.ts`。`npm run desktop:dev` 安全探针通过；隔离 userData 中确认 14 个唯一发行分组、3 个 single collection、代表歌曲浏览、内置专辑修改/恢复默认、实际删除、删除确认/取消、本地音源入口及两个旧导入入口保持移除。临时进程、userData 和日志已清理。
