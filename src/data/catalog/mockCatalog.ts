import type { CatalogData } from "../../types";

export const mockCatalog: CatalogData = {
  schemaVersion: 1,
  artists: [
    {
      id: "artist_vae",
      name: "许嵩",
      note: "占位艺人数据。完整元数据需要开发者后续手动核对维护。"
    }
  ],
  albums: [
    {
      id: "album_sample_001",
      artistId: "artist_vae",
      title: "示例专辑 A",
      type: "album",
      releaseDate: "2000-01-01",
      sortOrder: 1,
      trackIds: ["track_sample_001", "track_sample_002"],
      note: "占位专辑，不代表真实完整发行数据。"
    },
    {
      id: "album_sample_002",
      artistId: "artist_vae",
      title: "示例专辑 B",
      type: "ep",
      sortOrder: 2,
      trackIds: ["track_sample_003"],
      note: "占位专辑，用于验证列表结构。"
    }
  ],
  tracks: [
    {
      id: "track_sample_001",
      artistId: "artist_vae",
      albumId: "album_sample_001",
      title: "示例歌曲一",
      discNumber: 1,
      trackNumber: 1,
      note: "占位歌曲，不包含真实音频或歌词。"
    },
    {
      id: "track_sample_002",
      artistId: "artist_vae",
      albumId: "album_sample_001",
      title: "示例歌曲二",
      discNumber: 1,
      trackNumber: 2,
      note: "占位歌曲，不包含真实音频或歌词。"
    },
    {
      id: "track_sample_003",
      artistId: "artist_vae",
      albumId: "album_sample_002",
      title: "示例歌曲三",
      discNumber: 1,
      trackNumber: 1,
      note: "占位歌曲，不包含真实音频或歌词。"
    }
  ]
};
