# CATALOG-1A — Canonical Built-in Xu Song Catalog

- 任务 ID：`CATALOG-1A`
- 状态：`completed`
- 目标：让 Web/Electron 默认直接加载唯一的静态许嵩目录，并稳定现有 album/track ID。
- 主要交付：canonical 默认目录、111 个显式 track ID、正式 UI 移除两个旧导入入口、保留本地音源入口与用户目录 overlay。
- 兼容策略：完整且唯一匹配的旧 verified import 获得非破坏 canonical reference 并保留旧实体 ID；旧 placeholder 定向修改按需物化，旧删除标记安全移除；不按标题猜测删除。
- Binding：旧 verified import track ID 保留，因此现有 binding 不需改写；无法语义映射的 `track_sample_*` binding 不删除也不猜测迁移。
- Commit：与本归档同一提交（`feat(catalog): use canonical built-in Xu Song catalog`）。
- 验证：完成单元/集成测试、Lint、Web/Electron 构建，以及隔离 Electron/Web 的真实首屏、增改删、重启持久化和恢复默认验收。
- 已知限制：完整作品目录与可靠来源审计由 `CATALOG-1B` 完成；远程 Provider 底层代码暂时保留。
