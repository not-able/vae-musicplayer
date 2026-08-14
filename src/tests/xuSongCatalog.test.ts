import { describe, expect, it } from "vitest";

import {
  createXuSongOfficialCatalog,
  xuSongOfficialAlbumDefinitions,
  xuSongOfficialCatalog
} from "../data/catalog/xuSongOfficialCatalog";
import { mockCatalog } from "../data/catalog/mockCatalog";
import { mergeCatalogChanges } from "../features/catalog/catalogMerge";
import { createEmptyUserCatalogChanges } from "../features/catalog/catalogMutations";
import { createXuSongCatalogImportPlan } from "../features/catalog/xuSongCatalogImport";
import type { CatalogData } from "../types";

const catalog1AAlbumTrackCounts = new Map<string, number>([
  ["album_xusong_zidingyi", 9],
  ["album_xusong_xunwuqishi", 9],
  ["album_xusong_no1", 11],
  ["album_xusong_banchengyansha", 16],
  ["album_xusong_sugelameiyoudi", 10],
  ["album_xusong_mengyouji", 10],
  ["album_xusong_buruchichaqu", 9],
  ["album_xusong_qingnianwanbao", 9],
  ["album_xusong_xunbaoyouxi", 9],
  ["album_xusong_huxizhiyue", 10],
  ["album_xusong_anbocaixiang", 9]
]);

const catalog1ALegacyDuplicateTitles = new Set([
  "安琪",
  "粉色信笺",
  "看不见的风景",
  "天使",
  "我的Baby",
  "我很喜欢"
]);

function expectCatalogIntegrity(catalog: CatalogData): void {
  const artistIds = new Set(catalog.artists.map((artist) => artist.id));
  const albumsById = new Map(catalog.albums.map((album) => [album.id, album]));
  const tracksById = new Map(catalog.tracks.map((track) => [track.id, track]));
  const allIds = [
    ...catalog.artists.map((artist) => artist.id),
    ...catalog.albums.map((album) => album.id),
    ...catalog.tracks.map((track) => track.id)
  ];

  expect(new Set(allIds).size).toBe(allIds.length);

  for (const album of catalog.albums) {
    expect(artistIds.has(album.artistId)).toBe(true);
    expect(new Set(album.trackIds).size).toBe(album.trackIds.length);

    for (const trackId of album.trackIds) {
      const track = tracksById.get(trackId);
      expect(track?.albumId).toBe(album.id);
      expect(track?.artistId).toBe(album.artistId);
    }
  }

  for (const track of catalog.tracks) {
    expect(albumsById.get(track.albumId)?.trackIds).toContain(track.id);
  }
}

describe("verified Xu Song catalog", () => {
  it("contains the original 11 groups plus 3 audited single collections", () => {
    expect(xuSongOfficialCatalog.artists).toEqual([
      expect.objectContaining({ id: "artist_vae", name: "许嵩" })
    ]);
    expect(xuSongOfficialCatalog.albums).toHaveLength(14);
    expect(xuSongOfficialCatalog.tracks).toHaveLength(162);
    expect(xuSongOfficialCatalog.albums.map((album) => album.title)).toEqual([
      "自定义",
      "寻雾启示",
      "许嵩 No.1",
      "半城烟沙",
      "苏格拉没有底",
      "梦游计",
      "不如吃茶去",
      "青年晚报",
      "寻宝游戏",
      "呼吸之野",
      "安泊猜想",
      "早期与独立作品（2006—2015）",
      "独立单曲与合作（2016—2020）",
      "独立单曲与合作（2021—至今）"
    ]);
    expect(
      xuSongOfficialCatalog.albums
        .slice(11)
        .every(({ type }) => type === "single_collection")
    ).toBe(true);
    expectCatalogIntegrity(xuSongOfficialCatalog);

    const serialized = JSON.stringify(xuSongOfficialCatalog).toLowerCase();
    expect(serialized).not.toContain("http");
    expect(serialized).not.toContain("audio");
    expect(serialized).not.toContain("lyric");
  });

  it("preserves every CATALOG-1A album and track ID", () => {
    for (const [albumId, trackCount] of catalog1AAlbumTrackCounts) {
      const album = xuSongOfficialCatalog.albums.find(({ id }) => id === albumId);
      expect(album?.trackIds).toEqual(
        Array.from(
          { length: trackCount },
          (_, index) => `${albumId}_track_${String(index + 1).padStart(2, "0")}`
        )
      );
    }

    expect(
      xuSongOfficialCatalog.tracks.find(({ title }) => title === "有何不可")?.id
    ).toBe("album_xusong_zidingyi_track_03");
  });

  it("includes audited singles, Tian Long Ba Bu works, and useful title aliases", () => {
    const tracksById = new Map(
      xuSongOfficialCatalog.tracks.map((track) => [track.id, track])
    );

    expect(tracksById.get("track_xusong_suyan")).toMatchObject({
      title: "素颜",
      aliases: ["素颜 (with 何曼婷)"]
    });
    expect(tracksById.get("track_xusong_tianlongbabu_zhisudi")?.title).toBe(
      "天龙八部之宿敌"
    );
    expect(tracksById.get("track_xusong_yumu")?.aliases).toContain(
      "雨幕（新天龙八部端游主题曲）"
    );
    expect(tracksById.get("track_xusong_fangsi")?.title).toBe("放肆");
    expect(tracksById.get("track_xusong_mantuoshanzhuang")?.title).toBe("曼陀山庄");
    expect(tracksById.get("track_xusong_rumi")?.title).toBe("如谜");
  });

  it("adds no single-collection duplicate and keeps aliases globally unambiguous", () => {
    const formalTrackTitles = new Set(
      xuSongOfficialCatalog.tracks
        .filter((track) => catalog1AAlbumTrackCounts.has(track.albumId))
        .map((track) => track.title)
    );
    const singleCollectionTracks = xuSongOfficialCatalog.tracks.filter(
      (track) => !catalog1AAlbumTrackCounts.has(track.albumId)
    );
    const canonicalTitleCounts = new Map<string, number>();
    const aliases = new Map<string, string>();

    for (const track of xuSongOfficialCatalog.tracks) {
      canonicalTitleCounts.set(
        track.title,
        (canonicalTitleCounts.get(track.title) ?? 0) + 1
      );
      for (const alias of track.aliases ?? []) {
        const normalizedAlias = alias.trim().toLocaleLowerCase();
        expect(aliases.has(normalizedAlias)).toBe(false);
        expect(
          xuSongOfficialCatalog.tracks.some(
            (candidate) =>
              candidate.id !== track.id &&
              candidate.title.trim().toLocaleLowerCase() === normalizedAlias
          )
        ).toBe(false);
        aliases.set(normalizedAlias, track.id);
      }
    }

    expect(
      singleCollectionTracks.filter((track) => formalTrackTitles.has(track.title))
    ).toEqual([]);
    expect(
      new Set(
        [...canonicalTitleCounts]
          .filter(([, count]) => count > 1)
          .map(([title]) => title)
      )
    ).toEqual(catalog1ALegacyDuplicateTitles);
  });

  it("keeps new single IDs stable when collections and songs are reordered", () => {
    const reversedDefinitions = xuSongOfficialAlbumDefinitions
      .slice()
      .reverse()
      .map((album) => ({ ...album, tracks: album.tracks.slice().reverse() }));
    const reorderedCatalog = createXuSongOfficialCatalog(reversedDefinitions);
    const originalIdsByTitle = new Map(
      xuSongOfficialCatalog.tracks.map((track) => [track.title, track.id])
    );

    for (const track of reorderedCatalog.tracks.filter(({ id }) =>
      id.startsWith("track_xusong_")
    )) {
      expect(track.id).toBe(originalIdsByTitle.get(track.title));
    }
  });

  it("keeps catalog overlays, deletion, and restoration working for new collections", () => {
    const changes = createEmptyUserCatalogChanges();
    changes.deletedDefaultTrackIds = ["track_xusong_suyan"];
    changes.trackOverrides = {
      track_xusong_yumu: { title: "雨幕（我的标题）" }
    };
    const merged = mergeCatalogChanges(xuSongOfficialCatalog, changes);
    const restored = mergeCatalogChanges(
      xuSongOfficialCatalog,
      createEmptyUserCatalogChanges()
    );

    expect(merged.tracks.some(({ id }) => id === "track_xusong_suyan")).toBe(false);
    expect(merged.tracks.find(({ id }) => id === "track_xusong_yumu")?.title).toBe(
      "雨幕（我的标题）"
    );
    expect(restored.tracks.find(({ id }) => id === "track_xusong_suyan")?.title).toBe(
      "素颜"
    );
  });

  it("keeps explicit album and track IDs stable when definitions are inserted or reordered", () => {
    const originalTrackIdsByAlbumAndTitle = new Map(
      xuSongOfficialCatalog.tracks.map((track) => [
        `${track.albumId}:${track.title}`,
        track.id
      ])
    );
    const firstAlbum = xuSongOfficialAlbumDefinitions[0];
    if (!firstAlbum) {
      throw new Error("Expected at least one built-in album definition.");
    }

    const reorderedDefinitions = [
      ...xuSongOfficialAlbumDefinitions.slice(1).reverse(),
      {
        ...firstAlbum,
        tracks: [
          ["track_xusong_future_explicit", "后续显式单曲"] as const,
          ...firstAlbum.tracks.slice().reverse()
        ]
      }
    ];
    const reorderedCatalog = createXuSongOfficialCatalog(reorderedDefinitions);

    expect(reorderedCatalog.albums.find((album) => album.title === "自定义")?.id).toBe(
      "album_xusong_zidingyi"
    );
    for (const track of xuSongOfficialCatalog.tracks) {
      expect(
        reorderedCatalog.tracks.find(
          (candidate) =>
            candidate.albumId === track.albumId && candidate.title === track.title
        )?.id
      ).toBe(originalTrackIdsByAlbumAndTitle.get(`${track.albumId}:${track.title}`));
    }
    expect(
      reorderedCatalog.tracks.find((track) => track.title === "后续显式单曲")?.id
    ).toBe("track_xusong_future_explicit");
  });

  it("previews all verified albums as one additive import without mutating the current catalog", () => {
    const catalog = structuredClone(mockCatalog);
    const original = structuredClone(catalog);
    const plan = createXuSongCatalogImportPlan(catalog);

    expect(plan).toMatchObject({
      status: "ready",
      artistId: "artist_vae",
      skippedAlbumTitles: []
    });
    if (plan.status !== "ready") {
      throw new Error("Expected a ready import plan.");
    }

    expect(plan.drafts).toHaveLength(14);
    expect(plan.drafts.reduce((total, draft) => total + draft.tracks.length, 0)).toBe(
      162
    );
    expect(plan.drafts[0]).toEqual({
      artistId: "artist_vae",
      title: "自定义",
      tracks: expect.arrayContaining([
        expect.objectContaining({ title: "如果当时", trackNumber: 1 })
      ])
    });
    expect(catalog).toEqual(original);
  });

  it("skips existing album titles and refuses an ambiguous artist target", () => {
    const catalogWithExistingAlbum = structuredClone(mockCatalog);
    catalogWithExistingAlbum.albums.push({
      id: "album_existing_zidingyi",
      artistId: "artist_vae",
      title: "自定义",
      type: "album",
      sortOrder: 99,
      trackIds: []
    });
    const partialPlan = createXuSongCatalogImportPlan(catalogWithExistingAlbum);

    expect(partialPlan).toMatchObject({
      status: "ready",
      skippedAlbumTitles: ["自定义"]
    });
    if (partialPlan.status !== "ready") {
      throw new Error("Expected a ready import plan.");
    }
    expect(partialPlan.drafts).toHaveLength(13);

    const ambiguousCatalog = structuredClone(mockCatalog);
    ambiguousCatalog.artists.push({ id: "artist_vae_duplicate", name: "许嵩" });

    expect(createXuSongCatalogImportPlan(ambiguousCatalog)).toEqual({
      status: "unavailable",
      errorMessage: "当前目录中有多个“许嵩”艺人，无法安全确定导入目标。"
    });
  });
});
