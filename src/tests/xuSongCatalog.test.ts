import { describe, expect, it } from "vitest";

import {
  createXuSongOfficialCatalog,
  xuSongOfficialAlbumDefinitions,
  xuSongOfficialCatalog
} from "../data/catalog/xuSongOfficialCatalog";
import { mockCatalog } from "../data/catalog/mockCatalog";
import { createXuSongCatalogImportPlan } from "../features/catalog/xuSongCatalogImport";
import type { CatalogData } from "../types";

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
  it("contains 11 official album entries and 111 ordered, local-only track records", () => {
    expect(xuSongOfficialCatalog.artists).toEqual([
      expect.objectContaining({ id: "artist_vae", name: "许嵩" })
    ]);
    expect(xuSongOfficialCatalog.albums).toHaveLength(11);
    expect(xuSongOfficialCatalog.tracks).toHaveLength(111);
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
      "安泊猜想"
    ]);
    expectCatalogIntegrity(xuSongOfficialCatalog);

    const serialized = JSON.stringify(xuSongOfficialCatalog).toLowerCase();
    expect(serialized).not.toContain("http");
    expect(serialized).not.toContain("audio");
    expect(serialized).not.toContain("lyric");
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

    expect(plan.drafts).toHaveLength(11);
    expect(plan.drafts.reduce((total, draft) => total + draft.tracks.length, 0)).toBe(
      111
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
    expect(partialPlan.drafts).toHaveLength(10);

    const ambiguousCatalog = structuredClone(mockCatalog);
    ambiguousCatalog.artists.push({ id: "artist_vae_duplicate", name: "许嵩" });

    expect(createXuSongCatalogImportPlan(ambiguousCatalog)).toEqual({
      status: "unavailable",
      errorMessage: "当前目录中有多个“许嵩”艺人，无法安全确定导入目标。"
    });
  });
});
