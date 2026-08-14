# Active Task

- 任务 ID：`CATALOG-1B`
- 状态：`ready`
- 分支：`desktop/electron`

## 前置条件

- 工作区干净。
- 当前分支包含 `feat(catalog): use canonical built-in Xu Song catalog`。
- 开始前阅读：
  - `docs/architecture/overview.md`
  - `docs/decisions/0006-canonical-built-in-catalog.md`
  - `src/data/catalog/xuSongOfficialCatalog.ts`
  - `src/features/catalog/xuSongCatalogCompatibility.ts`

## 目标

基于可追溯的可靠来源审计并补充许嵩完整作品目录，同时保持 `CATALOG-1A` 已发布的 album/track ID 永久稳定。

## 范围

- 盘点正式专辑、EP、独立单曲、合作曲及游戏/影视歌曲，并为来源留下可维护的审计说明。
- 只为新增实体分配新的显式 ID；不得修改现有 11 张目录及 111 首歌曲的 ID。
- 在现有模型允许范围内补充必要的目录分类；确需最小 metadata 扩展时先写清兼容策略和测试。
- 继续使用同一个 `xuSongOfficialCatalog`，不创建 Web/Electron 两份目录。
- 更新聚焦测试，覆盖完整性、来源审计、显式 ID 唯一性和现有 binding ID 兼容。

## 明确不做

- 音频 Provider 或音源体系统一。
- 自动/批量匹配、单曲 Electron 文件选择绑定。
- 音频播放、`app-media://`、Range、seek 或播放器重构。
- availability、标签解析、封面、时长、SQLite 或 Tauri。
- 恢复已移除的远程/许嵩目录导入 UI。

## 验收条件

- 目录补充均有可靠来源依据，不凭记忆猜测。
- 所有新增 album/track ID 显式且唯一，现有 ID 快照不变。
- Web/Electron 默认目录一致，用户 overlay 与旧导入兼容测试继续通过。
- 默认验证命令全部通过，并完成 Web/Electron 目录浏览核验。

## 建议提交

`feat(catalog): complete Xu Song discography audit`
