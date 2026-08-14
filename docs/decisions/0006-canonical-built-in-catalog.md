# 使用唯一的内置 Canonical Catalog

## 状态

Accepted

## 背景

正式应用此前以占位 `mockCatalog` 启动，并要求用户手动导入仓库内已经存在的许嵩目录。旧导入将随机 `catalog_user_*` ID 写入 `UserCatalogChanges`，却没有持久化 draft source token；Electron binding 又会长期保存 track ID。直接切换 baseline、按标题删除或统一改 ID都会产生重复目录或破坏用户引用。

## 决定

- Web 和 Electron 的唯一正式 baseline 是 `src/data/catalog/xuSongOfficialCatalog.ts`。
- 内置 album/track ID 在源码中显式定义，不从数组位置、曲序或运行时 UUID 生成。
- 用户目录仍为 `canonical baseline + UserCatalogChanges`，内置内容可通过 overlay 新增、修改、删除和恢复默认。
- 正式 UI 不再提供“导入许嵩目录”或“导入远程元数据”；远程 Provider 实现可暂时保留为未使用模块。
- 旧 verified import 只有在完整结构与某个 canonical album 唯一匹配时才获得 canonical external reference。显示合并时保留旧实体并遮蔽对应 baseline，不删除或改写旧 ID。
- 旧 placeholder baseline 的无效删除标记可移除；针对 placeholder 的用户编辑或新增歌曲按需物化为用户实体。不迁移没有可靠语义对应的 `track_sample_*` binding。
- 完整目录补充必须记录 Apple Music / MusicBrainz 等可复核来源；证据不足的作品留在审计文件中，不凭标题猜测加入 baseline。
- 独立单曲、合作曲及主题曲按少量 `single_collection` 组织，不为每首单曲创建一张 UI 专辑，也不重复正式专辑中的 canonical track。
- Track 可保存少量、真实且有匹配意义的 `aliases`；UI 使用短 canonical title，合作署名和 OST 长标题留在 alias / 审计边界，不因此扩展 artist domain。

## 后果

新用户首次启动即可看到稳定且经来源审计的目录；后续插入或重排作品不会改变既有 binding 目标。旧完整导入不会明显重复，且 playlist/binding 继续引用原 ID。无法明确识别的同名、不完整用户内容或无正式发行证据作品会被保留或标记待审，而不是猜测删除或并入。目录可通过 canonical title 与有限 aliases 为后续匹配提供输入，但本决策不包含 matcher。
