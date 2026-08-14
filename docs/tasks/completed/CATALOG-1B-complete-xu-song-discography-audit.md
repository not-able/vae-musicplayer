# CATALOG-1B — Complete Xu Song discography audit

- 状态：`completed`
- 完成日期：2026-08-14
- 分支：`desktop/electron`

## 目标

使用可复核来源审计并补充许嵩静态目录，同时永久保留 CATALOG-1A 已发布的 11 个 album ID 与 111 个 track ID。

## 完成内容

- 使用 Apple Music 艺人/发行页、Apple 官方 iTunes Lookup API 以及 MusicBrainz artist recordings/releases 完成差异审计，结果写入 `docs/catalog/xu-song-discography-audit.md`。
- 新增 3 个 `single_collection` 和 51 个显式稳定 track ID，默认目录由 11 个发行分组 / 111 首扩展为 14 个分组 / 162 首。
- 补充《素颜》《天龙八部之宿敌》《雨幕》《放肆》《曼陀山庄》《如谜》等独立、合作和主题作品。
- Track 最小增加可序列化 `aliases`，并在 merge/storage 边界保留与校验；UI canonical title 保持简短。
- 明确保留 CATALOG-1A 的 6 个历史同名 release-master；新增 single collection 不重复正式目录 canonical title。
- 将缺少正式 release 证据的《放飞》标为 `needs-review`，未加入默认目录；普通现场重复和伴奏版被排除。

## 验证

- 聚焦测试覆盖旧 ID 快照、新作品/aliases、ID 与标题冲突、排序稳定性及 overlay 删除/恢复。
- 完整自动验证结果见同提交的 `docs/development/state.md`。
- Electron 隔离 userData 手工确认 14 个唯一发行分组、3 个 single collection、代表歌曲浏览、修改/恢复默认、实际删除、删除确认/取消、本地音源入口与旧导入入口继续移除。

## 未包含

- AUDIO-UNIFY、文件选择、自动/批量匹配、播放、availability、标签解析、扫描改造或 UI 改版。

## 后续

- 唯一 active task：`AUDIO-UNIFY-1`。
