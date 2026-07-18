import { act, createElement, type ComponentProps } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

import { mockCatalog } from "../data/catalog/mockCatalog";
import { CatalogOverview } from "../features/catalog/CatalogOverview";
import { getAlbumTracks, getSortedAlbums } from "../features/catalog/catalog";
import { mergeCatalogChanges } from "../features/catalog/catalogMerge";
import {
  addAlbumToUserCatalog,
  addTrackToUserCatalog,
  createEmptyUserCatalogChanges,
  patchAlbumInUserCatalog,
  patchTrackInUserCatalog,
  resetAlbumInUserCatalog,
  resetTrackInUserCatalog
} from "../features/catalog/catalogMutations";
import type { LocalCatalogRepository } from "../features/catalog/localCatalogRepository";
import { useCatalogLibrary } from "../features/catalog/useCatalogLibrary";
import type { Album, CatalogData, UserCatalogChanges } from "../types";

function expectCatalogIntegrity(catalog: CatalogData): void {
  const artistIds = catalog.artists.map((artist) => artist.id);
  const albumIds = catalog.albums.map((album) => album.id);
  const trackIds = catalog.tracks.map((track) => track.id);
  const allIds = [...artistIds, ...albumIds, ...trackIds];
  const artistIdSet = new Set(artistIds);
  const albumIdSet = new Set(albumIds);
  const trackIdSet = new Set(trackIds);

  expect(new Set(allIds).size).toBe(allIds.length);

  for (const album of catalog.albums) {
    expect(artistIdSet.has(album.artistId)).toBe(true);
    expect(new Set(album.trackIds).size).toBe(album.trackIds.length);

    for (const trackId of album.trackIds) {
      const track = catalog.tracks.find((item) => item.id === trackId);

      expect(trackIdSet.has(trackId)).toBe(true);
      expect(track?.albumId).toBe(album.id);
    }
  }

  for (const track of catalog.tracks) {
    const album = catalog.albums.find((item) => item.id === track.albumId);

    expect(artistIdSet.has(track.artistId)).toBe(true);
    expect(albumIdSet.has(track.albumId)).toBe(true);
    expect(album?.trackIds.filter((trackId) => trackId === track.id)).toHaveLength(1);
  }
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, reject, resolve };
}

function changeInputValue(input: HTMLInputElement, value: string): void {
  const valueSetter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value"
  )?.set;

  valueSetter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }));
}

function changeSelectValue(select: HTMLSelectElement, value: string): void {
  const valueSetter = Object.getOwnPropertyDescriptor(
    HTMLSelectElement.prototype,
    "value"
  )?.set;

  valueSetter?.call(select, value);
  select.dispatchEvent(new Event("change", { bubbles: true, cancelable: true }));
}

function findButtonByText(
  container: HTMLElement,
  text: string
): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
    (button) => button.textContent?.trim() === text
  );
}

function findButton(
  container: HTMLElement,
  ariaLabel: string
): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
    (button) => button.getAttribute("aria-label") === ariaLabel
  );
}

async function chooseAlbumMenuAction(
  container: HTMLElement,
  albumTitle: string,
  actionText: string
): Promise<void> {
  await act(async () => {
    findButton(container, `打开${albumTitle}的更多操作`)?.click();
  });
  await act(async () => {
    findButtonByText(document.body, actionText)?.click();
  });
}

function createCatalogOverviewProps(
  overrides: Partial<ComponentProps<typeof CatalogOverview>> = {}
): ComponentProps<typeof CatalogOverview> {
  return {
    catalog: mockCatalog,
    catalogLibraryStatus: "ready",
    isSavingAlbum: false,
    isSavingTrack: false,
    resettableAlbumIds: new Set<string>(),
    resettableTrackIds: new Set<string>(),
    audioBindings: new Map(),
    pendingAudioTrackIds: new Set<string>(),
    audioLibraryStatus: "ready",
    onAddTrack: vi.fn(),
    onAddAlbum: vi.fn(),
    onCreateAlbum: vi.fn(async () => ({
      ok: true as const,
      albumId: "album_user_test"
    })),
    onCreateTrack: vi.fn(async () => ({
      ok: true as const,
      trackId: "track_user_test"
    })),
    onUpdateAlbum: vi.fn(async () => ({ ok: true as const })),
    onUpdateTrack: vi.fn(async () => ({ ok: true as const })),
    onResetAlbum: vi.fn(async () => ({ ok: true as const })),
    onResetTrack: vi.fn(async () => ({ ok: true as const })),
    onBindAudio: vi.fn().mockResolvedValue(true),
    onUnbindAudio: vi.fn().mockResolvedValue(true),
    ...overrides
  };
}

function createMemoryCatalogRepository(load: () => Promise<UserCatalogChanges>) {
  return {
    load: vi.fn(load),
    save: vi.fn(async () => undefined),
    clear: vi.fn(async () => undefined)
  } satisfies LocalCatalogRepository;
}

function createUserCatalogForResetTest(): UserCatalogChanges {
  const albumChanges = addAlbumToUserCatalog(
    mockCatalog,
    createEmptyUserCatalogChanges(),
    {
      artistId: "artist_vae",
      title: "用户重置测试专辑",
      type: "other",
      sortOrder: 3
    },
    () => "album_user_reset"
  );

  return addTrackToUserCatalog(
    mockCatalog,
    albumChanges,
    {
      artistId: "artist_vae",
      albumId: "album_user_reset",
      title: "用户重置测试歌曲",
      trackNumber: 1
    },
    () => "track_user_reset"
  );
}

interface CatalogLibraryProbeProps {
  catalog?: CatalogData;
  repository: LocalCatalogRepository;
  createAlbumTitle?: string;
  createTrackTitle?: string;
  trackAlbumId?: string;
  updateAlbumTitle?: string;
  updateAlbumId?: string;
  updateTrackTitle?: string;
  updateTrackId?: string;
  resetAlbumId?: string;
  resetTrackId?: string;
  idFactory?: () => string;
}

function CatalogLibraryProbe({
  catalog = mockCatalog,
  repository,
  createAlbumTitle,
  createTrackTitle,
  trackAlbumId = "album_sample_001",
  updateAlbumTitle,
  updateAlbumId = "album_sample_001",
  updateTrackTitle,
  updateTrackId = "track_sample_001",
  resetAlbumId,
  resetTrackId,
  idFactory
}: CatalogLibraryProbeProps) {
  const library = useCatalogLibrary(catalog, repository, idFactory);

  return createElement(
    "div",
    null,
    createElement(
      "output",
      {
        "data-error": library.errorMessage ?? "",
        "data-resettable-albums": [...library.resettableAlbumIds].join("|"),
        "data-resettable-tracks": [...library.resettableTrackIds].join("|"),
        "data-status": library.status
      },
      [
        ...library.catalog.albums.map((album) => album.title),
        ...library.catalog.tracks.map((track) => track.title)
      ].join("|")
    ),
    createAlbumTitle
      ? createElement(
          "button",
          {
            disabled: library.status !== "ready",
            onClick: () => {
              void library.createAlbum({
                title: createAlbumTitle,
                type: "album"
              });
            },
            type: "button"
          },
          "创建测试专辑"
        )
      : null,
    createTrackTitle
      ? createElement(
          "button",
          {
            disabled: library.status !== "ready",
            onClick: () => {
              void library.createTrack(trackAlbumId, {
                title: createTrackTitle,
                trackNumber: 3
              });
            },
            type: "button"
          },
          "创建测试歌曲"
        )
      : null,
    updateAlbumTitle
      ? createElement(
          "button",
          {
            disabled: library.status !== "ready",
            onClick: () => {
              const album = library.catalog.albums.find(
                (item) => item.id === updateAlbumId
              );

              if (album) {
                void library.updateAlbum(album.id, {
                  title: updateAlbumTitle,
                  type: album.type
                });
              }
            },
            type: "button"
          },
          "修改测试专辑"
        )
      : null,
    updateTrackTitle
      ? createElement(
          "button",
          {
            disabled: library.status !== "ready",
            onClick: () => {
              const track = library.catalog.tracks.find(
                (item) => item.id === updateTrackId
              );

              if (track) {
                void library.updateTrack(track.id, {
                  title: updateTrackTitle,
                  trackNumber: track.trackNumber ?? null
                });
              }
            },
            type: "button"
          },
          "修改测试歌曲"
        )
      : null,
    resetAlbumId
      ? createElement(
          "button",
          {
            disabled: library.status !== "ready",
            onClick: () => {
              void library.resetAlbum(resetAlbumId);
            },
            type: "button"
          },
          "重置测试专辑"
        )
      : null,
    resetTrackId
      ? createElement(
          "button",
          {
            disabled: library.status !== "ready",
            onClick: () => {
              void library.resetTrack(resetTrackId);
            },
            type: "button"
          },
          "重置测试歌曲"
        )
      : null
  );
}

describe("catalog helpers", () => {
  it("sorts albums by their maintained sort order without mutating catalog data", () => {
    const reversedCatalog: CatalogData = {
      ...mockCatalog,
      albums: [...mockCatalog.albums].reverse()
    };
    const originalIds = reversedCatalog.albums.map((album) => album.id);

    expect(getSortedAlbums(reversedCatalog).map((album) => album.id)).toEqual([
      "album_sample_001",
      "album_sample_002"
    ]);
    expect(reversedCatalog.albums.map((album) => album.id)).toEqual(originalIds);
  });

  it("returns only referenced tracks for the selected album in track order", () => {
    const album: Album = {
      ...mockCatalog.albums[0],
      trackIds: [
        "track_sample_002",
        "track_missing",
        "track_sample_003",
        "track_sample_001"
      ]
    };

    expect(getAlbumTracks(mockCatalog, album).map((track) => track.id)).toEqual([
      "track_sample_001",
      "track_sample_002"
    ]);
  });

  it("sorts tracks by track number with stable relation-order ties", () => {
    const album: Album = {
      id: "album_sort_test",
      artistId: "artist_vae",
      title: "排序测试专辑",
      type: "album",
      sortOrder: 1,
      trackIds: [
        "track_missing_number",
        "track_ten",
        "track_two_first",
        "track_two_second"
      ]
    };
    const catalog: CatalogData = {
      schemaVersion: 1,
      artists: structuredClone(mockCatalog.artists),
      albums: [album],
      tracks: [
        {
          id: "track_missing_number",
          artistId: "artist_vae",
          albumId: album.id,
          title: "曲序待维护"
        },
        {
          id: "track_ten",
          artistId: "artist_vae",
          albumId: album.id,
          title: "第十首",
          trackNumber: 10
        },
        {
          id: "track_two_first",
          artistId: "artist_vae",
          albumId: album.id,
          title: "第二首甲",
          trackNumber: 2
        },
        {
          id: "track_two_second",
          artistId: "artist_vae",
          albumId: album.id,
          title: "第二首乙",
          trackNumber: 2
        }
      ]
    };

    expect(getAlbumTracks(catalog, album).map((track) => track.id)).toEqual([
      "track_two_first",
      "track_two_second",
      "track_ten",
      "track_missing_number"
    ]);
    expect(album.trackIds).toEqual([
      "track_missing_number",
      "track_ten",
      "track_two_first",
      "track_two_second"
    ]);
  });
});

describe("mock catalog integrity", () => {
  it("uses unique IDs and valid artist, album, and track references", () => {
    expectCatalogIntegrity(mockCatalog);
  });
});

describe("user catalog mutations", () => {
  it("creates a versioned empty change set and adds an album with an injected ID", () => {
    const changes = createEmptyUserCatalogChanges();
    const changesSnapshot = structuredClone(changes);
    const idFactory = vi.fn(() => "album_user_001");

    const nextChanges = addAlbumToUserCatalog(
      mockCatalog,
      changes,
      {
        artistId: "artist_vae",
        title: "示例专辑 A",
        type: "album",
        sortOrder: 3
      },
      idFactory
    );

    expect(changes).toEqual(changesSnapshot);
    expect(changes).toEqual({
      schemaVersion: 1,
      addedAlbums: [],
      addedTracks: [],
      albumOverrides: {},
      trackOverrides: {},
      albumTrackIdAdditions: {},
      deletedDefaultAlbumIds: [],
      deletedDefaultTrackIds: []
    });
    expect(nextChanges.addedAlbums).toEqual([
      {
        id: "album_user_001",
        artistId: "artist_vae",
        title: "示例专辑 A",
        type: "album",
        sortOrder: 3,
        trackIds: []
      }
    ]);
    expect(idFactory).toHaveBeenCalledOnce();
  });

  it("adds a track to a user album while updating both sides of the relation", () => {
    const albumChanges = addAlbumToUserCatalog(
      mockCatalog,
      createEmptyUserCatalogChanges(),
      {
        artistId: "artist_vae",
        title: "用户专辑",
        type: "other",
        sortOrder: 3
      },
      () => "album_user_001"
    );
    const albumChangesSnapshot = structuredClone(albumChanges);

    const trackChanges = addTrackToUserCatalog(
      mockCatalog,
      albumChanges,
      {
        artistId: "artist_vae",
        albumId: "album_user_001",
        title: "示例歌曲一",
        trackNumber: 1
      },
      () => "track_user_001"
    );
    const mergedCatalog = mergeCatalogChanges(mockCatalog, trackChanges);
    const addedAlbum = trackChanges.addedAlbums[0];
    const addedTrack = trackChanges.addedTracks[0];

    expect(albumChanges).toEqual(albumChangesSnapshot);
    expect(addedAlbum.trackIds).toEqual(["track_user_001"]);
    expect(addedTrack).toMatchObject({
      id: "track_user_001",
      albumId: "album_user_001",
      artistId: "artist_vae",
      title: "示例歌曲一"
    });
    expect(
      mergedCatalog.albums.find((album) => album.id === addedTrack.albumId)?.trackIds
    ).toContain(addedTrack.id);
    expectCatalogIntegrity(mergedCatalog);
  });

  it("adds a track to a built-in album without mutating the built-in catalog", () => {
    const catalogSnapshot = structuredClone(mockCatalog);
    const changes = createEmptyUserCatalogChanges();
    const changesSnapshot = structuredClone(changes);

    const nextChanges = addTrackToUserCatalog(
      mockCatalog,
      changes,
      {
        artistId: "artist_vae",
        albumId: "album_sample_001",
        title: "用户示例歌曲",
        trackNumber: 3
      },
      () => "track_user_001"
    );
    const mergedCatalog = mergeCatalogChanges(mockCatalog, nextChanges);

    expect(nextChanges.albumTrackIdAdditions.album_sample_001).toEqual([
      "track_user_001"
    ]);
    expect(
      mergedCatalog.albums.find((album) => album.id === "album_sample_001")?.trackIds
    ).toEqual(["track_sample_001", "track_sample_002", "track_user_001"]);
    expect(mockCatalog).toEqual(catalogSnapshot);
    expect(changes).toEqual(changesSnapshot);
    expectCatalogIntegrity(mergedCatalog);
  });

  it("rejects blank titles and unknown artist or album references before using an ID", () => {
    const changes = createEmptyUserCatalogChanges();
    const catalogSnapshot = structuredClone(mockCatalog);
    const changesSnapshot = structuredClone(changes);
    const idFactory = vi.fn(() => "unused_id");

    expect(() =>
      addAlbumToUserCatalog(
        mockCatalog,
        changes,
        {
          artistId: "artist_vae",
          title: "   ",
          type: "album",
          sortOrder: 3
        },
        idFactory
      )
    ).toThrow("title");
    expect(() =>
      addAlbumToUserCatalog(
        mockCatalog,
        changes,
        {
          artistId: "artist_unknown",
          title: "用户专辑",
          type: "album",
          sortOrder: 3
        },
        idFactory
      )
    ).toThrow("Unknown artist");
    expect(() =>
      addTrackToUserCatalog(
        mockCatalog,
        changes,
        {
          artistId: "artist_vae",
          albumId: "album_unknown",
          title: "用户歌曲"
        },
        idFactory
      )
    ).toThrow("Unknown album");
    expect(() =>
      addTrackToUserCatalog(
        mockCatalog,
        changes,
        {
          artistId: "artist_vae",
          albumId: "album_sample_001",
          title: "   "
        },
        idFactory
      )
    ).toThrow("title");
    expect(() =>
      addTrackToUserCatalog(
        mockCatalog,
        changes,
        {
          artistId: "artist_unknown",
          albumId: "album_sample_001",
          title: "用户歌曲"
        },
        idFactory
      )
    ).toThrow("Unknown artist");
    expect(idFactory).not.toHaveBeenCalled();
    expect(mockCatalog).toEqual(catalogSnapshot);
    expect(changes).toEqual(changesSnapshot);
  });

  it("rejects empty generated IDs without changing either input", () => {
    const changes = createEmptyUserCatalogChanges();
    const catalogSnapshot = structuredClone(mockCatalog);
    const changesSnapshot = structuredClone(changes);

    expect(() =>
      addTrackToUserCatalog(
        mockCatalog,
        changes,
        {
          artistId: "artist_vae",
          albumId: "album_sample_001",
          title: "用户歌曲"
        },
        () => "   "
      )
    ).toThrow("must not be empty");
    expect(mockCatalog).toEqual(catalogSnapshot);
    expect(changes).toEqual(changesSnapshot);
  });

  it.each([
    ["zero track number", { trackNumber: 0 }],
    ["negative track number", { trackNumber: -1 }],
    ["decimal track number", { trackNumber: 1.5 }],
    ["unsafe track number", { trackNumber: Number.MAX_SAFE_INTEGER + 1 }]
  ])("rejects an invalid provided track position: %s", (_label, position) => {
    const changes = createEmptyUserCatalogChanges();
    const changesSnapshot = structuredClone(changes);
    const catalogSnapshot = structuredClone(mockCatalog);
    const idFactory = vi.fn(() => "track_user_invalid_position");

    expect(() =>
      addTrackToUserCatalog(
        mockCatalog,
        changes,
        {
          artistId: "artist_vae",
          albumId: "album_sample_001",
          title: "无效曲序歌曲",
          ...position
        },
        idFactory
      )
    ).toThrow("positive integer");
    expect(idFactory).not.toHaveBeenCalled();
    expect(changes).toEqual(changesSnapshot);
    expect(mockCatalog).toEqual(catalogSnapshot);
  });

  it("allows duplicate titles but rejects IDs already used by any catalog entity", () => {
    const firstChanges = addAlbumToUserCatalog(
      mockCatalog,
      createEmptyUserCatalogChanges(),
      {
        artistId: "artist_vae",
        title: "示例专辑 A",
        type: "album",
        sortOrder: 3
      },
      () => "album_user_001"
    );
    const secondChanges = addAlbumToUserCatalog(
      mockCatalog,
      firstChanges,
      {
        artistId: "artist_vae",
        title: "示例专辑 A",
        type: "album",
        sortOrder: 4
      },
      () => "album_user_002"
    );

    expect(secondChanges.addedAlbums.map((album) => album.title)).toEqual([
      "示例专辑 A",
      "示例专辑 A"
    ]);
    const catalogSnapshot = structuredClone(mockCatalog);
    const changesSnapshot = structuredClone(secondChanges);

    expect(() =>
      addAlbumToUserCatalog(
        mockCatalog,
        secondChanges,
        {
          artistId: "artist_vae",
          title: "另一个专辑",
          type: "album",
          sortOrder: 5
        },
        () => "track_sample_001"
      )
    ).toThrow("unique");
    expect(() =>
      addAlbumToUserCatalog(
        mockCatalog,
        secondChanges,
        {
          artistId: "artist_vae",
          title: "另一个专辑",
          type: "album",
          sortOrder: 5
        },
        () => "album_user_001"
      )
    ).toThrow("unique");
    expect(mockCatalog).toEqual(catalogSnapshot);
    expect(secondChanges).toEqual(changesSnapshot);
  });

  it("patches built-in metadata with sparse overrides while preserving identity", () => {
    const changes: UserCatalogChanges = {
      ...createEmptyUserCatalogChanges(),
      albumOverrides: {
        album_sample_001: { title: "已有专辑标题" }
      },
      trackOverrides: {
        track_sample_001: { note: "已有歌曲说明" }
      }
    };
    const catalogSnapshot = structuredClone(mockCatalog);
    const changesSnapshot = structuredClone(changes);
    const albumPatch = { type: "ep" as const };
    const trackPatch = {
      title: "修正后的歌曲",
      trackNumber: 4
    };
    const albumPatchSnapshot = structuredClone(albumPatch);
    const trackPatchSnapshot = structuredClone(trackPatch);

    const albumChanges = patchAlbumInUserCatalog(
      mockCatalog,
      changes,
      "album_sample_001",
      albumPatch
    );
    const trackChanges = patchTrackInUserCatalog(
      mockCatalog,
      albumChanges,
      "track_sample_001",
      trackPatch
    );
    const mergedCatalog = mergeCatalogChanges(mockCatalog, trackChanges);
    const album = mergedCatalog.albums.find((item) => item.id === "album_sample_001");
    const track = mergedCatalog.tracks.find((item) => item.id === "track_sample_001");

    expect(trackChanges.albumOverrides.album_sample_001).toEqual({
      title: "已有专辑标题",
      type: "ep"
    });
    expect(trackChanges.trackOverrides.track_sample_001).toEqual({
      note: "已有歌曲说明",
      title: "修正后的歌曲",
      trackNumber: 4
    });
    expect(album).toMatchObject({
      id: "album_sample_001",
      artistId: "artist_vae",
      title: "已有专辑标题",
      type: "ep",
      trackIds: ["track_sample_001", "track_sample_002"]
    });
    expect(track).toMatchObject({
      id: "track_sample_001",
      artistId: "artist_vae",
      albumId: "album_sample_001",
      title: "修正后的歌曲",
      trackNumber: 4
    });
    expect(mockCatalog).toEqual(catalogSnapshot);
    expect(changes).toEqual(changesSnapshot);
    expect(albumPatch).toEqual(albumPatchSnapshot);
    expect(trackPatch).toEqual(trackPatchSnapshot);
    expectCatalogIntegrity(mergedCatalog);
  });

  it("patches user-created records directly and removes legacy redundant overrides", () => {
    let changes = addAlbumToUserCatalog(
      mockCatalog,
      createEmptyUserCatalogChanges(),
      {
        artistId: "artist_vae",
        title: "用户专辑",
        type: "other",
        sortOrder: 3,
        note: "用户专辑说明"
      },
      () => "album_user_patch"
    );
    changes = addTrackToUserCatalog(
      mockCatalog,
      changes,
      {
        artistId: "artist_vae",
        albumId: "album_user_patch",
        title: "用户歌曲",
        trackNumber: 1,
        note: "用户歌曲说明"
      },
      () => "track_user_patch"
    );
    changes = {
      ...changes,
      albumOverrides: {
        album_user_patch: { title: "旧覆盖标题" }
      },
      trackOverrides: {
        track_user_patch: { note: "旧覆盖说明" }
      }
    };
    const changesSnapshot = structuredClone(changes);

    const albumChanges = patchAlbumInUserCatalog(
      mockCatalog,
      changes,
      "album_user_patch",
      {
        title: "直接更新专辑"
      }
    );
    const trackChanges = patchTrackInUserCatalog(
      mockCatalog,
      albumChanges,
      "track_user_patch",
      {
        title: "直接更新歌曲",
        trackNumber: 3
      }
    );
    const album = trackChanges.addedAlbums[0];
    const track = trackChanges.addedTracks[0];

    expect(album).toEqual({
      id: "album_user_patch",
      artistId: "artist_vae",
      title: "直接更新专辑",
      type: "other",
      sortOrder: 3,
      trackIds: ["track_user_patch"],
      note: "用户专辑说明"
    });
    expect(track).toEqual({
      id: "track_user_patch",
      artistId: "artist_vae",
      albumId: "album_user_patch",
      title: "直接更新歌曲",
      trackNumber: 3,
      note: "旧覆盖说明"
    });
    expect(trackChanges.albumOverrides).toEqual({});
    expect(trackChanges.trackOverrides).toEqual({});
    expect(changes).toEqual(changesSnapshot);
    expectCatalogIntegrity(mergeCatalogChanges(mockCatalog, trackChanges));
  });

  it("rejects identity fields, invalid metadata, and unknown patch targets immutably", () => {
    const changes = createEmptyUserCatalogChanges();
    const catalogSnapshot = structuredClone(mockCatalog);
    const changesSnapshot = structuredClone(changes);

    for (const forbiddenPatch of [
      { id: "album_changed" },
      { artistId: "artist_changed" },
      { trackIds: [] },
      { releaseDate: "2024-01-01" }
    ]) {
      expect(() =>
        patchAlbumInUserCatalog(
          mockCatalog,
          changes,
          "album_sample_001",
          forbiddenPatch as never
        )
      ).toThrow("cannot change field");
    }

    for (const forbiddenPatch of [
      { id: "track_changed" },
      { artistId: "artist_changed" },
      { albumId: "album_sample_002" },
      { discNumber: 1 },
      { version: "旧版本" },
      { releaseDate: "2024-01-01" }
    ]) {
      expect(() =>
        patchTrackInUserCatalog(
          mockCatalog,
          changes,
          "track_sample_001",
          forbiddenPatch as never
        )
      ).toThrow("cannot change field");
    }

    expect(() =>
      patchAlbumInUserCatalog(
        mockCatalog,
        changes,
        "album_sample_001",
        Object.assign(Object.create({ inherited: true }), {
          title: "非普通对象"
        }) as never
      )
    ).toThrow("plain objects");
    expect(() =>
      patchAlbumInUserCatalog(mockCatalog, changes, "album_sample_001", {
        title: "  "
      })
    ).toThrow("title");
    expect(() =>
      patchTrackInUserCatalog(mockCatalog, changes, "track_sample_001", {
        trackNumber: 0
      })
    ).toThrow("positive integer");
    expect(() =>
      patchTrackInUserCatalog(mockCatalog, changes, "track_sample_001", {
        trackNumber: Number.MAX_SAFE_INTEGER + 1
      })
    ).toThrow("positive integer");
    expect(() =>
      patchAlbumInUserCatalog(mockCatalog, changes, "album_missing", {
        title: "未知专辑"
      })
    ).toThrow("Unknown album");
    expect(() =>
      patchTrackInUserCatalog(mockCatalog, changes, "track_missing", {
        title: "未知歌曲"
      })
    ).toThrow("Unknown track");
    expect(mockCatalog).toEqual(catalogSnapshot);
    expect(changes).toEqual(changesSnapshot);
  });

  it("resets only built-in overrides while preserving user tracks and other changes", () => {
    let changes = addTrackToUserCatalog(
      mockCatalog,
      createEmptyUserCatalogChanges(),
      {
        artistId: "artist_vae",
        albumId: "album_sample_001",
        title: "保留的用户歌曲",
        trackNumber: 3
      },
      () => "track_user_reset_preserved"
    );
    changes = {
      ...changes,
      albumOverrides: {
        album_sample_001: { title: "待恢复专辑" },
        album_sample_002: { title: "保留专辑覆盖" }
      },
      trackOverrides: {
        track_sample_001: { title: "待恢复歌曲" },
        track_sample_002: { title: "保留歌曲覆盖" }
      }
    };
    const changesSnapshot = structuredClone(changes);

    const albumReset = resetAlbumInUserCatalog(
      mockCatalog,
      changes,
      "album_sample_001"
    );
    const trackReset = resetTrackInUserCatalog(
      mockCatalog,
      albumReset,
      "track_sample_001"
    );
    const mergedCatalog = mergeCatalogChanges(mockCatalog, trackReset);

    expect(trackReset.albumOverrides).toEqual({
      album_sample_002: { title: "保留专辑覆盖" }
    });
    expect(trackReset.trackOverrides).toEqual({
      track_sample_002: { title: "保留歌曲覆盖" }
    });
    expect(trackReset.albumTrackIdAdditions).toEqual({
      album_sample_001: ["track_user_reset_preserved"]
    });
    expect(trackReset.addedTracks).toEqual(changes.addedTracks);
    expect(
      mergedCatalog.albums.find((album) => album.id === "album_sample_001")?.trackIds
    ).toContain("track_user_reset_preserved");
    expect(
      mergedCatalog.tracks.find((track) => track.id === "track_sample_001")?.title
    ).toBe("示例歌曲一");
    expect(changes).toEqual(changesSnapshot);

    const userChanges = createUserCatalogForResetTest();
    expect(() =>
      resetAlbumInUserCatalog(mockCatalog, userChanges, "album_user_reset")
    ).toThrow("cannot be reset");
    expect(() =>
      resetTrackInUserCatalog(mockCatalog, userChanges, "track_user_reset")
    ).toThrow("cannot be reset");
    const emptyChanges = createEmptyUserCatalogChanges();
    expect(
      patchAlbumInUserCatalog(mockCatalog, emptyChanges, "album_sample_001", {})
    ).toBe(emptyChanges);
    expect(
      patchTrackInUserCatalog(mockCatalog, emptyChanges, "track_sample_001", {})
    ).toBe(emptyChanges);
    expect(resetAlbumInUserCatalog(mockCatalog, emptyChanges, "album_sample_001")).toBe(
      emptyChanges
    );
  });
});

describe("catalog change merging", () => {
  it("merges additions and allowed field overrides without changing stable IDs", () => {
    const defaultCatalogSnapshot = structuredClone(mockCatalog);
    const changes: UserCatalogChanges = {
      ...createEmptyUserCatalogChanges(),
      albumOverrides: {
        album_sample_001: {
          title: "用户专辑标题",
          sortOrder: 20
        }
      },
      trackOverrides: {
        track_sample_001: {
          title: "用户歌曲标题",
          trackNumber: 8,
          note: null
        }
      }
    };
    const changesSnapshot = structuredClone(changes);

    const mergedCatalog = mergeCatalogChanges(mockCatalog, changes);
    const album = mergedCatalog.albums.find((item) => item.id === "album_sample_001");
    const track = mergedCatalog.tracks.find((item) => item.id === "track_sample_001");

    expect(album).toMatchObject({
      id: "album_sample_001",
      artistId: "artist_vae",
      title: "用户专辑标题",
      sortOrder: 20
    });
    expect(track).toMatchObject({
      id: "track_sample_001",
      artistId: "artist_vae",
      albumId: "album_sample_001",
      title: "用户歌曲标题",
      trackNumber: 8
    });
    expect(track?.note).toBeUndefined();
    expect(mockCatalog).toEqual(defaultCatalogSnapshot);
    expect(changes).toEqual(changesSnapshot);
    expect(mergedCatalog.albums[0].trackIds).not.toBe(mockCatalog.albums[0].trackIds);
    expectCatalogIntegrity(mergedCatalog);
  });

  it("preserves later built-in tracks when replaying user track additions", () => {
    const changes = addTrackToUserCatalog(
      mockCatalog,
      createEmptyUserCatalogChanges(),
      {
        artistId: "artist_vae",
        albumId: "album_sample_001",
        title: "用户示例歌曲"
      },
      () => "track_user_001"
    );
    const updatedDefaultCatalog: CatalogData = {
      ...mockCatalog,
      albums: mockCatalog.albums.map((album) =>
        album.id === "album_sample_001"
          ? {
              ...album,
              trackIds: [...album.trackIds, "track_sample_004"]
            }
          : { ...album, trackIds: [...album.trackIds] }
      ),
      tracks: [
        ...mockCatalog.tracks,
        {
          id: "track_sample_004",
          artistId: "artist_vae",
          albumId: "album_sample_001",
          title: "后续内置占位歌曲"
        }
      ]
    };

    const mergedCatalog = mergeCatalogChanges(updatedDefaultCatalog, changes);

    expect(
      mergedCatalog.albums.find((album) => album.id === "album_sample_001")?.trackIds
    ).toEqual([
      "track_sample_001",
      "track_sample_002",
      "track_sample_004",
      "track_user_001"
    ]);
    expectCatalogIntegrity(mergedCatalog);
  });

  it("keeps sparse overrides compatible with later built-in metadata updates", () => {
    const changes = patchAlbumInUserCatalog(
      mockCatalog,
      createEmptyUserCatalogChanges(),
      "album_sample_001",
      { title: "仅覆盖标题" }
    );
    const updatedDefaultCatalog: CatalogData = {
      ...structuredClone(mockCatalog),
      albums: mockCatalog.albums.map((album) =>
        album.id === "album_sample_001"
          ? {
              ...album,
              type: "other",
              note: "更新后的内置说明",
              trackIds: [...album.trackIds]
            }
          : { ...album, trackIds: [...album.trackIds] }
      )
    };

    const mergedCatalog = mergeCatalogChanges(updatedDefaultCatalog, changes);
    const overriddenAlbum = mergedCatalog.albums.find(
      (album) => album.id === "album_sample_001"
    );

    expect(changes.albumOverrides.album_sample_001).toEqual({
      title: "仅覆盖标题"
    });
    expect(overriddenAlbum).toMatchObject({
      title: "仅覆盖标题",
      type: "other",
      note: "更新后的内置说明"
    });

    const resetChanges = resetAlbumInUserCatalog(
      updatedDefaultCatalog,
      changes,
      "album_sample_001"
    );
    const resetAlbum = mergeCatalogChanges(
      updatedDefaultCatalog,
      resetChanges
    ).albums.find((album) => album.id === "album_sample_001");

    expect(resetChanges.albumOverrides).toEqual({});
    expect(resetAlbum).toMatchObject({
      title: "示例专辑 A",
      type: "other",
      note: "更新后的内置说明"
    });
  });

  it("keeps sparse track overrides compatible with later built-in metadata updates", () => {
    const changes = patchTrackInUserCatalog(
      mockCatalog,
      createEmptyUserCatalogChanges(),
      "track_sample_001",
      { title: "仅覆盖歌曲标题" }
    );
    const updatedDefaultCatalog: CatalogData = {
      ...structuredClone(mockCatalog),
      tracks: mockCatalog.tracks.map((track) =>
        track.id === "track_sample_001"
          ? {
              ...track,
              trackNumber: 7,
              durationSeconds: 240,
              note: "更新后的内置歌曲说明"
            }
          : { ...track }
      )
    };

    const mergedCatalog = mergeCatalogChanges(updatedDefaultCatalog, changes);
    const overriddenTrack = mergedCatalog.tracks.find(
      (track) => track.id === "track_sample_001"
    );

    expect(changes.trackOverrides.track_sample_001).toEqual({
      title: "仅覆盖歌曲标题"
    });
    expect(overriddenTrack).toMatchObject({
      title: "仅覆盖歌曲标题",
      trackNumber: 7,
      durationSeconds: 240,
      note: "更新后的内置歌曲说明"
    });

    const resetChanges = resetTrackInUserCatalog(
      updatedDefaultCatalog,
      changes,
      "track_sample_001"
    );
    const resetTrack = mergeCatalogChanges(
      updatedDefaultCatalog,
      resetChanges
    ).tracks.find((track) => track.id === "track_sample_001");

    expect(resetChanges.trackOverrides).toEqual({});
    expect(resetTrack).toMatchObject({
      title: "示例歌曲一",
      trackNumber: 7,
      durationSeconds: 240,
      note: "更新后的内置歌曲说明"
    });
  });

  it("rejects unknown override targets and incomplete bidirectional references", () => {
    const unknownOverrideChanges: UserCatalogChanges = {
      ...createEmptyUserCatalogChanges(),
      albumOverrides: {
        album_unknown: { title: "未知专辑" }
      }
    };
    const oneSidedTrackChanges: UserCatalogChanges = {
      ...createEmptyUserCatalogChanges(),
      addedTracks: [
        {
          id: "track_user_001",
          artistId: "artist_vae",
          albumId: "album_sample_001",
          title: "孤立歌曲"
        }
      ]
    };
    const catalogSnapshot = structuredClone(mockCatalog);
    const unknownOverrideSnapshot = structuredClone(unknownOverrideChanges);
    const oneSidedTrackSnapshot = structuredClone(oneSidedTrackChanges);

    expect(() => mergeCatalogChanges(mockCatalog, unknownOverrideChanges)).toThrow(
      "Unknown album override"
    );
    expect(() => mergeCatalogChanges(mockCatalog, oneSidedTrackChanges)).toThrow(
      "referenced once"
    );
    expect(mockCatalog).toEqual(catalogSnapshot);
    expect(unknownOverrideChanges).toEqual(unknownOverrideSnapshot);
    expect(oneSidedTrackChanges).toEqual(oneSidedTrackSnapshot);
  });

  it("rejects unknown track overrides and unsupported change schemas", () => {
    const unknownTrackOverride: UserCatalogChanges = {
      ...createEmptyUserCatalogChanges(),
      trackOverrides: {
        track_unknown: { title: "未知歌曲" }
      }
    };
    const unsupportedSchema = {
      ...createEmptyUserCatalogChanges(),
      schemaVersion: 2
    } as unknown as UserCatalogChanges;

    expect(() => mergeCatalogChanges(mockCatalog, unknownTrackOverride)).toThrow(
      "Unknown track override"
    );
    expect(() => mergeCatalogChanges(mockCatalog, unsupportedSchema)).toThrow(
      "Unsupported user catalog schema"
    );
  });

  it("rejects duplicate IDs in manually constructed changes", () => {
    const changes: UserCatalogChanges = {
      ...createEmptyUserCatalogChanges(),
      addedAlbums: [
        {
          id: "album_sample_001",
          artistId: "artist_vae",
          title: "重复 ID 专辑",
          type: "other",
          sortOrder: 3,
          trackIds: []
        }
      ]
    };

    expect(() => mergeCatalogChanges(mockCatalog, changes)).toThrow("unique");
  });
});

describe("catalog library loading", () => {
  it("keeps the built-in catalog available while loading and becomes ready without saving", async () => {
    const deferred = createDeferred<UserCatalogChanges>();
    const repository = createMemoryCatalogRepository(() => deferred.promise);
    const container = document.createElement("div");
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(CatalogLibraryProbe, { repository }));
    });

    const output = container.querySelector("output");

    expect(output?.dataset.status).toBe("loading");
    expect(output?.textContent).toContain("示例专辑 A");
    expect(repository.save).not.toHaveBeenCalled();
    expect(repository.clear).not.toHaveBeenCalled();

    await act(async () => {
      deferred.resolve(createEmptyUserCatalogChanges());
    });

    expect(output?.dataset.status).toBe("ready");
    expect(output?.textContent).toContain("示例专辑 A");
    expect(repository.save).not.toHaveBeenCalled();
    expect(repository.clear).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
  });

  it("falls back to the built-in catalog when loaded changes cannot be merged", async () => {
    const invalidChanges: UserCatalogChanges = {
      ...createEmptyUserCatalogChanges(),
      albumOverrides: {
        album_unknown: { title: "无效覆盖" }
      }
    };
    const repository = createMemoryCatalogRepository(async () => invalidChanges);
    const container = document.createElement("div");
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(CatalogLibraryProbe, { repository }));
    });

    const output = container.querySelector("output");

    expect(output?.dataset.status).toBe("error");
    expect(output?.dataset.error).toBe("无法读取用户目录，已继续使用内置目录。");
    expect(output?.textContent).toContain("示例专辑 A");
    expect(repository.save).not.toHaveBeenCalled();
    expect(repository.clear).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
  });

  it("ignores a stale repository result after the repository changes", async () => {
    const firstDeferred = createDeferred<UserCatalogChanges>();
    const secondDeferred = createDeferred<UserCatalogChanges>();
    const firstRepository = createMemoryCatalogRepository(() => firstDeferred.promise);
    const secondRepository = createMemoryCatalogRepository(
      () => secondDeferred.promise
    );
    const firstChanges: UserCatalogChanges = {
      ...createEmptyUserCatalogChanges(),
      albumOverrides: {
        album_sample_001: { title: "迟到的目录" }
      }
    };
    const secondChanges: UserCatalogChanges = {
      ...createEmptyUserCatalogChanges(),
      albumOverrides: {
        album_sample_001: { title: "当前目录" }
      }
    };
    const container = document.createElement("div");
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(CatalogLibraryProbe, { repository: firstRepository }));
    });
    await act(async () => {
      root.render(createElement(CatalogLibraryProbe, { repository: secondRepository }));
    });
    await act(async () => {
      secondDeferred.resolve(secondChanges);
    });

    expect(container.textContent).toContain("当前目录");

    await act(async () => {
      firstDeferred.resolve(firstChanges);
    });

    expect(container.textContent).toContain("当前目录");
    expect(container.textContent).not.toContain("迟到的目录");
    expect(firstRepository.save).not.toHaveBeenCalled();
    expect(secondRepository.save).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
  });

  it("ignores a repository result that arrives after unmounting", async () => {
    const deferred = createDeferred<UserCatalogChanges>();
    const repository = createMemoryCatalogRepository(() => deferred.promise);
    const container = document.createElement("div");
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(CatalogLibraryProbe, { repository }));
    });
    await act(async () => {
      root.unmount();
    });
    await act(async () => {
      deferred.resolve(createEmptyUserCatalogChanges());
    });

    expect(container.childNodes).toHaveLength(0);
    expect(repository.load).toHaveBeenCalledOnce();
    expect(repository.save).not.toHaveBeenCalled();
    expect(repository.clear).not.toHaveBeenCalled();
  });

  it("does not publish a pending save after the repository source changes", async () => {
    const saveDeferred = createDeferred<void>();
    const firstRepository = {
      load: vi.fn(async () => createEmptyUserCatalogChanges()),
      save: vi.fn(async () => saveDeferred.promise),
      clear: vi.fn(async () => undefined)
    } satisfies LocalCatalogRepository;
    const secondChanges: UserCatalogChanges = {
      ...createEmptyUserCatalogChanges(),
      albumOverrides: {
        album_sample_001: { title: "当前仓储目录" }
      }
    };
    const secondRepository = createMemoryCatalogRepository(async () => secondChanges);
    const container = document.createElement("div");
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(CatalogLibraryProbe, {
          repository: firstRepository,
          createAlbumTitle: "迟到的新专辑",
          idFactory: () => "album_user_stale"
        })
      );
    });
    await act(async () => {
      Array.from(container.querySelectorAll<HTMLButtonElement>("button"))
        .find((button) => button.textContent === "创建测试专辑")
        ?.click();
    });

    expect(firstRepository.save).toHaveBeenCalledOnce();
    expect(container.querySelector("output")?.textContent).not.toContain(
      "迟到的新专辑"
    );

    await act(async () => {
      root.render(
        createElement(CatalogLibraryProbe, {
          repository: secondRepository,
          createAlbumTitle: "迟到的新专辑",
          idFactory: () => "album_user_stale"
        })
      );
    });

    expect(container.querySelector("output")?.textContent).toContain("当前仓储目录");

    await act(async () => {
      saveDeferred.resolve(undefined);
      await saveDeferred.promise;
    });

    expect(container.querySelector("output")?.textContent).toContain("当前仓储目录");
    expect(container.querySelector("output")?.textContent).not.toContain(
      "迟到的新专辑"
    );
    expect(secondRepository.save).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
  });

  it("does not publish a pending track save after the repository source changes", async () => {
    const saveDeferred = createDeferred<void>();
    const firstRepository = {
      load: vi.fn(async () => createEmptyUserCatalogChanges()),
      save: vi.fn(async () => saveDeferred.promise),
      clear: vi.fn(async () => undefined)
    } satisfies LocalCatalogRepository;
    const secondChanges: UserCatalogChanges = {
      ...createEmptyUserCatalogChanges(),
      albumOverrides: {
        album_sample_001: { title: "当前歌曲仓储目录" }
      }
    };
    const secondRepository = createMemoryCatalogRepository(async () => secondChanges);
    const idFactory = vi.fn(() => "track_user_stale");
    const container = document.createElement("div");
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(CatalogLibraryProbe, {
          repository: firstRepository,
          createTrackTitle: "迟到的新歌曲",
          idFactory
        })
      );
    });
    await act(async () => {
      findButtonByText(container, "创建测试歌曲")?.click();
    });

    expect(firstRepository.save).toHaveBeenCalledOnce();
    expect(idFactory).toHaveBeenCalledOnce();
    expect(container.querySelector("output")?.textContent).not.toContain(
      "迟到的新歌曲"
    );

    await act(async () => {
      root.render(
        createElement(CatalogLibraryProbe, {
          repository: secondRepository,
          createTrackTitle: "迟到的新歌曲",
          idFactory
        })
      );
    });

    expect(container.querySelector("output")?.textContent).toContain(
      "当前歌曲仓储目录"
    );

    await act(async () => {
      saveDeferred.resolve(undefined);
      await saveDeferred.promise;
    });

    expect(container.querySelector("output")?.textContent).toContain(
      "当前歌曲仓储目录"
    );
    expect(container.querySelector("output")?.textContent).not.toContain(
      "迟到的新歌曲"
    );
    expect(secondRepository.save).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
  });

  it("does not publish a pending edit after the repository source changes", async () => {
    const saveDeferred = createDeferred<void>();
    const firstRepository = {
      load: vi.fn(async () => createEmptyUserCatalogChanges()),
      save: vi.fn(async () => saveDeferred.promise),
      clear: vi.fn(async () => undefined)
    } satisfies LocalCatalogRepository;
    const secondChanges: UserCatalogChanges = {
      ...createEmptyUserCatalogChanges(),
      trackOverrides: {
        track_sample_001: { title: "当前编辑仓储歌曲" }
      }
    };
    const secondRepository = createMemoryCatalogRepository(async () => secondChanges);
    const container = document.createElement("div");
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(CatalogLibraryProbe, {
          repository: firstRepository,
          updateTrackTitle: "迟到的歌曲修改"
        })
      );
    });
    await act(async () => {
      findButtonByText(container, "修改测试歌曲")?.click();
    });

    expect(firstRepository.save).toHaveBeenCalledOnce();
    expect(container.querySelector("output")?.textContent).not.toContain(
      "迟到的歌曲修改"
    );

    await act(async () => {
      root.render(
        createElement(CatalogLibraryProbe, {
          repository: secondRepository,
          updateTrackTitle: "迟到的歌曲修改"
        })
      );
    });

    expect(container.querySelector("output")?.textContent).toContain(
      "当前编辑仓储歌曲"
    );

    await act(async () => {
      saveDeferred.resolve(undefined);
      await saveDeferred.promise;
    });

    expect(container.querySelector("output")?.textContent).toContain(
      "当前编辑仓储歌曲"
    );
    expect(container.querySelector("output")?.textContent).not.toContain(
      "迟到的歌曲修改"
    );
    expect(secondRepository.save).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
  });

  it("publishes an edit only after saving and resets only its built-in override", async () => {
    const saveDeferred = createDeferred<void>();
    const repository = {
      load: vi.fn(async () => createEmptyUserCatalogChanges()),
      save: vi.fn(async () => saveDeferred.promise),
      clear: vi.fn(async () => undefined)
    } satisfies LocalCatalogRepository;
    const container = document.createElement("div");
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(CatalogLibraryProbe, {
          repository,
          updateTrackTitle: "Hook 修改歌曲",
          resetTrackId: "track_sample_001"
        })
      );
    });
    await act(async () => {
      findButtonByText(container, "修改测试歌曲")?.click();
    });

    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        trackOverrides: {
          track_sample_001: { title: "Hook 修改歌曲" }
        }
      })
    );
    expect(container.querySelector("output")?.textContent).toContain("示例歌曲一");
    expect(container.querySelector("output")?.textContent).not.toContain(
      "Hook 修改歌曲"
    );

    await act(async () => {
      saveDeferred.resolve(undefined);
      await saveDeferred.promise;
    });

    expect(container.querySelector("output")?.textContent).toContain("Hook 修改歌曲");
    expect(container.querySelector("output")?.dataset.resettableTracks).toContain(
      "track_sample_001"
    );

    await act(async () => {
      findButtonByText(container, "重置测试歌曲")?.click();
    });

    expect(repository.save).toHaveBeenCalledTimes(2);
    expect(repository.save).toHaveBeenLastCalledWith(
      expect.objectContaining({
        trackOverrides: {}
      })
    );
    expect(container.querySelector("output")?.textContent).toContain("示例歌曲一");
    expect(container.querySelector("output")?.textContent).not.toContain(
      "Hook 修改歌曲"
    );
    expect(container.querySelector("output")?.dataset.resettableTracks).toBe("");
    expect(repository.clear).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
  });

  it("shares one synchronous lock across edit, reset, and create operations", async () => {
    const saveDeferred = createDeferred<void>();
    const initialChanges: UserCatalogChanges = {
      ...createEmptyUserCatalogChanges(),
      albumOverrides: {
        album_sample_001: { title: "可重置专辑" }
      }
    };
    const repository = {
      load: vi.fn(async () => initialChanges),
      save: vi.fn(async () => saveDeferred.promise),
      clear: vi.fn(async () => undefined)
    } satisfies LocalCatalogRepository;
    const idFactory = vi.fn(() => "album_user_should_not_be_created");
    const container = document.createElement("div");
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(CatalogLibraryProbe, {
          repository,
          updateTrackTitle: "锁定中的修改",
          resetAlbumId: "album_sample_001",
          createAlbumTitle: "不应并发创建",
          idFactory
        })
      );
    });
    await act(async () => {
      findButtonByText(container, "修改测试歌曲")?.click();
      findButtonByText(container, "重置测试专辑")?.click();
      findButtonByText(container, "创建测试专辑")?.click();
    });

    expect(repository.save).toHaveBeenCalledOnce();
    expect(idFactory).not.toHaveBeenCalled();
    expect(container.querySelector("output")?.textContent).not.toContain(
      "锁定中的修改"
    );

    await act(async () => {
      saveDeferred.resolve(undefined);
      await saveDeferred.promise;
    });

    expect(container.querySelector("output")?.textContent).toContain("锁定中的修改");
    expect(container.querySelector("output")?.textContent).toContain("可重置专辑");

    await act(async () => {
      root.unmount();
    });
  });

  it("uses one synchronous write lock for album and track creation", async () => {
    const saveDeferred = createDeferred<void>();
    const repository = {
      load: vi.fn(async () => createEmptyUserCatalogChanges()),
      save: vi.fn(async () => saveDeferred.promise),
      clear: vi.fn(async () => undefined)
    } satisfies LocalCatalogRepository;
    const idFactory = vi.fn(() => "album_user_locked");
    const container = document.createElement("div");
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(CatalogLibraryProbe, {
          repository,
          createAlbumTitle: "锁定中的专辑",
          createTrackTitle: "不应同时保存的歌曲",
          idFactory
        })
      );
    });
    await act(async () => {
      findButtonByText(container, "创建测试专辑")?.click();
      findButtonByText(container, "创建测试歌曲")?.click();
    });

    expect(repository.save).toHaveBeenCalledOnce();
    expect(idFactory).toHaveBeenCalledOnce();
    expect(container.querySelector("output")?.textContent).not.toContain(
      "不应同时保存的歌曲"
    );

    await act(async () => {
      saveDeferred.resolve(undefined);
      await saveDeferred.promise;
    });

    expect(container.querySelector("output")?.textContent).toContain("锁定中的专辑");
    expect(container.querySelector("output")?.textContent).not.toContain(
      "不应同时保存的歌曲"
    );

    await act(async () => {
      root.unmount();
    });
  });

  it("derives the track artist from the target album instead of the first artist", async () => {
    const catalog: CatalogData = {
      ...mockCatalog,
      artists: [
        ...structuredClone(mockCatalog.artists),
        {
          id: "artist_second",
          name: "第二位占位艺人"
        }
      ],
      albums: [
        ...structuredClone(mockCatalog.albums),
        {
          id: "album_second_artist",
          artistId: "artist_second",
          title: "第二位艺人专辑",
          type: "other",
          sortOrder: 3,
          trackIds: []
        }
      ],
      tracks: structuredClone(mockCatalog.tracks)
    };
    const repository = createMemoryCatalogRepository(async () =>
      createEmptyUserCatalogChanges()
    );
    const idFactory = vi.fn(() => "track_user_second_artist");
    const container = document.createElement("div");
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(CatalogLibraryProbe, {
          catalog,
          repository,
          createTrackTitle: "第二位艺人的歌曲",
          trackAlbumId: "album_second_artist",
          idFactory
        })
      );
    });
    await act(async () => {
      findButtonByText(container, "创建测试歌曲")?.click();
    });

    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        addedTracks: [
          expect.objectContaining({
            id: "track_user_second_artist",
            artistId: "artist_second",
            albumId: "album_second_artist"
          })
        ],
        albumTrackIdAdditions: {
          album_second_artist: ["track_user_second_artist"]
        }
      })
    );
    expect(idFactory).toHaveBeenCalledOnce();
    expect(container.querySelector("output")?.textContent).toContain(
      "第二位艺人的歌曲"
    );

    await act(async () => {
      root.unmount();
    });
  });

  it("rejects a missing target album before generating an ID or saving", async () => {
    const repository = createMemoryCatalogRepository(async () =>
      createEmptyUserCatalogChanges()
    );
    const idFactory = vi.fn(() => "track_user_unknown_album");
    const container = document.createElement("div");
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(CatalogLibraryProbe, {
          repository,
          createTrackTitle: "无目标歌曲",
          trackAlbumId: "album_missing",
          idFactory
        })
      );
    });
    await act(async () => {
      findButtonByText(container, "创建测试歌曲")?.click();
    });

    expect(idFactory).not.toHaveBeenCalled();
    expect(repository.save).not.toHaveBeenCalled();
    expect(container.querySelector("output")?.textContent).not.toContain("无目标歌曲");

    await act(async () => {
      root.unmount();
    });
  });
});

describe("catalog browsing", () => {
  it("shows the selected album and its tracks after an album click", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const onAddTrack = vi.fn();
    const onAddAlbum = vi.fn();
    const onBindAudio = vi.fn().mockResolvedValue(true);
    const onUnbindAudio = vi.fn().mockResolvedValue(true);

    await act(async () => {
      root.render(
        createElement(CatalogOverview, {
          catalog: mockCatalog,
          catalogLibraryStatus: "ready",
          isSavingAlbum: false,
          isSavingTrack: false,
          resettableAlbumIds: new Set<string>(),
          resettableTrackIds: new Set<string>(),
          audioBindings: new Map(),
          pendingAudioTrackIds: new Set<string>(),
          audioLibraryStatus: "ready",
          onAddTrack,
          onAddAlbum,
          onCreateAlbum: vi.fn(async () => ({
            ok: true as const,
            albumId: "album_user_unused"
          })),
          onCreateTrack: vi.fn(async () => ({
            ok: true as const,
            trackId: "track_user_unused"
          })),
          onUpdateAlbum: vi.fn(async () => ({ ok: true as const })),
          onUpdateTrack: vi.fn(async () => ({ ok: true as const })),
          onResetAlbum: vi.fn(async () => ({ ok: true as const })),
          onResetTrack: vi.fn(async () => ({ ok: true as const })),
          onBindAudio,
          onUnbindAudio
        })
      );
    });

    const secondAlbumButton = Array.from(
      container.querySelectorAll<HTMLButtonElement>(".album-list-button")
    ).find((button) => button.textContent?.includes("示例专辑 B"));

    expect(secondAlbumButton).toBeDefined();

    await act(async () => {
      secondAlbumButton?.click();
    });

    expect(container.querySelector("#album-detail-heading")?.textContent).toBe(
      "示例专辑 B"
    );
    expect(container.querySelector(".album-track-list")?.textContent).toContain(
      "示例歌曲三"
    );
    expect(container.querySelector(".album-track-list")?.textContent).not.toContain(
      "示例歌曲一"
    );

    await act(async () => {
      container.querySelector<HTMLButtonElement>(".add-album-button")?.click();
      container.querySelector<HTMLButtonElement>(".add-track-button")?.click();
    });

    expect(onAddAlbum).toHaveBeenCalledWith("album_sample_002");
    expect(onAddTrack).toHaveBeenCalledWith("track_sample_003");

    await act(async () => {
      root.unmount();
    });
  });

  it("keeps the first available album selected after the previous selection disappears", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const commonProps = {
      catalogLibraryStatus: "ready" as const,
      isSavingAlbum: false,
      isSavingTrack: false,
      resettableAlbumIds: new Set<string>(),
      resettableTrackIds: new Set<string>(),
      audioBindings: new Map(),
      pendingAudioTrackIds: new Set<string>(),
      audioLibraryStatus: "ready" as const,
      onAddTrack: vi.fn(),
      onAddAlbum: vi.fn(),
      onCreateAlbum: vi.fn(async () => ({
        ok: true as const,
        albumId: "album_user_unused"
      })),
      onCreateTrack: vi.fn(async () => ({
        ok: true as const,
        trackId: "track_user_unused"
      })),
      onUpdateAlbum: vi.fn(async () => ({ ok: true as const })),
      onUpdateTrack: vi.fn(async () => ({ ok: true as const })),
      onResetAlbum: vi.fn(async () => ({ ok: true as const })),
      onResetTrack: vi.fn(async () => ({ ok: true as const })),
      onBindAudio: vi.fn().mockResolvedValue(true),
      onUnbindAudio: vi.fn().mockResolvedValue(true)
    };

    await act(async () => {
      root.render(
        createElement(CatalogOverview, {
          ...commonProps,
          catalog: mockCatalog
        })
      );
    });

    const secondAlbumButton = Array.from(
      container.querySelectorAll<HTMLButtonElement>(".album-list-button")
    ).find((button) => button.textContent?.includes("示例专辑 B"));

    await act(async () => {
      secondAlbumButton?.click();
    });

    expect(container.querySelector("#album-detail-heading")?.textContent).toBe(
      "示例专辑 B"
    );

    const catalogWithoutSecondAlbum: CatalogData = {
      ...mockCatalog,
      albums: [mockCatalog.albums[0]],
      tracks: mockCatalog.tracks.filter((track) => track.albumId === "album_sample_001")
    };

    await act(async () => {
      root.render(
        createElement(CatalogOverview, {
          ...commonProps,
          catalog: catalogWithoutSecondAlbum
        })
      );
    });

    expect(container.querySelector("#album-detail-heading")?.textContent).toBe(
      "示例专辑 A"
    );

    await act(async () => {
      root.render(
        createElement(CatalogOverview, {
          ...commonProps,
          catalog: mockCatalog
        })
      );
    });

    expect(container.querySelector("#album-detail-heading")?.textContent).toBe(
      "示例专辑 A"
    );
    expect(
      Array.from(container.querySelectorAll<HTMLButtonElement>(".album-list-button"))
        .find((button) => button.textContent?.includes("示例专辑 A"))
        ?.getAttribute("aria-current")
    ).toBe("true");

    await act(async () => {
      root.unmount();
    });
  });

  it("groups secondary album actions in an accessible overflow menu", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(CatalogOverview, createCatalogOverviewProps({ canDelete: true }))
      );
    });

    const trigger = findButton(container, "打开示例专辑 A的更多操作");

    expect(trigger?.getAttribute("aria-expanded")).toBe("false");
    expect(findButtonByText(container, "编辑专辑")).toBeUndefined();
    expect(findButtonByText(container, "添加歌曲")).toBeUndefined();
    expect(findButton(container, "从目录删除专辑示例专辑 A")).toBeUndefined();

    await act(async () => {
      trigger?.focus();
      trigger?.click();
    });

    expect(trigger?.getAttribute("aria-expanded")).toBe("true");
    expect(
      document.body.querySelector('[aria-label="示例专辑 A的专辑操作"]')
    ).not.toBeNull();
    expect(findButtonByText(document.body, "编辑专辑")?.disabled).toBe(false);
    expect(findButtonByText(document.body, "添加歌曲")?.disabled).toBe(false);
    expect(findButton(document.body, "从目录删除专辑示例专辑 A")).toBeDefined();

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });

    expect(trigger?.getAttribute("aria-expanded")).toBe("false");
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});

describe("catalog album editor", () => {
  it("opens and cancels without creating or saving an album", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const onCreateAlbum = vi.fn(async () => ({
      ok: true as const,
      albumId: "album_user_cancelled"
    }));

    await act(async () => {
      root.render(
        createElement(CatalogOverview, {
          catalog: mockCatalog,
          catalogLibraryStatus: "ready",
          isSavingAlbum: false,
          isSavingTrack: false,
          resettableAlbumIds: new Set<string>(),
          resettableTrackIds: new Set<string>(),
          audioBindings: new Map(),
          pendingAudioTrackIds: new Set<string>(),
          audioLibraryStatus: "ready",
          onAddTrack: vi.fn(),
          onAddAlbum: vi.fn(),
          onCreateAlbum,
          onCreateTrack: vi.fn(async () => ({
            ok: true as const,
            trackId: "track_user_unused"
          })),
          onUpdateAlbum: vi.fn(async () => ({ ok: true as const })),
          onUpdateTrack: vi.fn(async () => ({ ok: true as const })),
          onResetAlbum: vi.fn(async () => ({ ok: true as const })),
          onResetTrack: vi.fn(async () => ({ ok: true as const })),
          onBindAudio: vi.fn().mockResolvedValue(true),
          onUnbindAudio: vi.fn().mockResolvedValue(true)
        })
      );
    });

    await act(async () => {
      findButtonByText(container, "新增专辑")?.click();
    });

    const titleInput = container.querySelector<HTMLInputElement>(
      ".catalog-editor input:not([readonly])"
    );

    expect(container.querySelector(".catalog-editor")).not.toBeNull();
    expect(
      container.querySelector<HTMLInputElement>(".catalog-editor input[readonly]")
        ?.value
    ).toBe("许嵩");
    expect(container.querySelector('input[name="album-release-date"]')).toBeNull();

    await act(async () => {
      if (titleInput) {
        changeInputValue(titleInput, "不会保存的专辑");
      }
      findButtonByText(container, "取消")?.click();
    });

    expect(container.querySelector(".catalog-editor")).toBeNull();
    expect(onCreateAlbum).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("blocks blank titles with a Chinese message", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const onCreateAlbum = vi.fn(async () => ({
      ok: true as const,
      albumId: "album_user_invalid"
    }));

    await act(async () => {
      root.render(
        createElement(CatalogOverview, {
          catalog: mockCatalog,
          catalogLibraryStatus: "ready",
          isSavingAlbum: false,
          isSavingTrack: false,
          resettableAlbumIds: new Set<string>(),
          resettableTrackIds: new Set<string>(),
          audioBindings: new Map(),
          pendingAudioTrackIds: new Set<string>(),
          audioLibraryStatus: "ready",
          onAddTrack: vi.fn(),
          onAddAlbum: vi.fn(),
          onCreateAlbum,
          onCreateTrack: vi.fn(async () => ({
            ok: true as const,
            trackId: "track_user_unused"
          })),
          onUpdateAlbum: vi.fn(async () => ({ ok: true as const })),
          onUpdateTrack: vi.fn(async () => ({ ok: true as const })),
          onResetAlbum: vi.fn(async () => ({ ok: true as const })),
          onResetTrack: vi.fn(async () => ({ ok: true as const })),
          onBindAudio: vi.fn().mockResolvedValue(true),
          onUnbindAudio: vi.fn().mockResolvedValue(true)
        })
      );
    });
    await act(async () => {
      findButtonByText(container, "新增专辑")?.click();
    });

    const titleInput = container.querySelector<HTMLInputElement>(
      ".catalog-editor input:not([readonly])"
    );

    await act(async () => {
      changeInputValue(titleInput as HTMLInputElement, "　 ");
      findButtonByText(container, "保存专辑")?.click();
    });

    expect(container.textContent).toContain("请输入专辑名。");
    expect(onCreateAlbum).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("trims valid input and retains the raw title and type when saving fails", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const onCreateAlbum = vi.fn(async () => ({
      ok: false as const,
      code: "save_failed" as const,
      errorMessage: "测试保存失败，请重试。"
    }));

    await act(async () => {
      root.render(
        createElement(CatalogOverview, {
          catalog: mockCatalog,
          catalogLibraryStatus: "ready",
          isSavingAlbum: false,
          isSavingTrack: false,
          resettableAlbumIds: new Set<string>(),
          resettableTrackIds: new Set<string>(),
          audioBindings: new Map(),
          pendingAudioTrackIds: new Set<string>(),
          audioLibraryStatus: "ready",
          onAddTrack: vi.fn(),
          onAddAlbum: vi.fn(),
          onCreateAlbum,
          onCreateTrack: vi.fn(async () => ({
            ok: true as const,
            trackId: "track_user_unused"
          })),
          onUpdateAlbum: vi.fn(async () => ({ ok: true as const })),
          onUpdateTrack: vi.fn(async () => ({ ok: true as const })),
          onResetAlbum: vi.fn(async () => ({ ok: true as const })),
          onResetTrack: vi.fn(async () => ({ ok: true as const })),
          onBindAudio: vi.fn().mockResolvedValue(true),
          onUnbindAudio: vi.fn().mockResolvedValue(true)
        })
      );
    });
    await act(async () => {
      findButtonByText(container, "新增专辑")?.click();
    });

    const titleInput = container.querySelector<HTMLInputElement>(
      ".catalog-editor input:not([readonly])"
    );
    const typeSelect = container.querySelector<HTMLSelectElement>(
      ".catalog-editor select"
    );

    await act(async () => {
      changeInputValue(titleInput as HTMLInputElement, "  保存失败专辑  ");
      if (typeSelect) {
        changeSelectValue(typeSelect, "ep");
      }
      findButtonByText(container, "保存专辑")?.click();
    });

    expect(onCreateAlbum).toHaveBeenCalledWith({
      title: "保存失败专辑",
      type: "ep"
    });
    expect(container.textContent).toContain("测试保存失败，请重试。");
    expect(titleInput?.value).toBe("  保存失败专辑  ");
    expect(typeSelect?.value).toBe("ep");
    expect(container.querySelector(".catalog-editor")).not.toBeNull();

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("submits valid input successfully and closes the isolated editor", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const onCreateAlbum = vi.fn(async () => ({
      ok: true as const,
      albumId: "album_user_component_success"
    }));

    await act(async () => {
      root.render(
        createElement(CatalogOverview, {
          catalog: mockCatalog,
          catalogLibraryStatus: "ready",
          isSavingAlbum: false,
          isSavingTrack: false,
          resettableAlbumIds: new Set<string>(),
          resettableTrackIds: new Set<string>(),
          audioBindings: new Map(),
          pendingAudioTrackIds: new Set<string>(),
          audioLibraryStatus: "ready",
          onAddTrack: vi.fn(),
          onAddAlbum: vi.fn(),
          onCreateAlbum,
          onCreateTrack: vi.fn(async () => ({
            ok: true as const,
            trackId: "track_user_unused"
          })),
          onUpdateAlbum: vi.fn(async () => ({ ok: true as const })),
          onUpdateTrack: vi.fn(async () => ({ ok: true as const })),
          onResetAlbum: vi.fn(async () => ({ ok: true as const })),
          onResetTrack: vi.fn(async () => ({ ok: true as const })),
          onBindAudio: vi.fn().mockResolvedValue(true),
          onUnbindAudio: vi.fn().mockResolvedValue(true)
        })
      );
    });
    await act(async () => {
      findButtonByText(container, "新增专辑")?.click();
    });

    const titleInput = container.querySelector<HTMLInputElement>(
      ".catalog-editor input:not([readonly])"
    );

    await act(async () => {
      if (titleInput) {
        changeInputValue(titleInput, "  组件成功专辑  ");
      }
      findButtonByText(container, "保存专辑")?.click();
    });

    expect(onCreateAlbum).toHaveBeenCalledWith({
      title: "组件成功专辑",
      type: "album"
    });
    expect(container.querySelector(".catalog-editor")).toBeNull();

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});

describe("catalog track editor", () => {
  it("binds the form to the selected album, cancels cleanly, and closes on album switch", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const onCreateTrack = vi.fn(async () => ({
      ok: true as const,
      trackId: "track_user_context"
    }));

    await act(async () => {
      root.render(
        createElement(CatalogOverview, createCatalogOverviewProps({ onCreateTrack }))
      );
    });
    await chooseAlbumMenuAction(container, "示例专辑 A", "添加歌曲");

    expect(
      container.querySelector<HTMLInputElement>('input[name="track-artist"]')?.value
    ).toBe("许嵩");
    expect(
      container.querySelector<HTMLInputElement>('input[name="track-album"]')?.value
    ).toBe("示例专辑 A");
    expect(container.querySelector('input[name="track-disc-number"]')).toBeNull();
    expect(container.querySelector('input[name="track-version"]')).toBeNull();
    expect(container.querySelector('input[name="track-release-date"]')).toBeNull();

    await act(async () => {
      const titleInput = container.querySelector<HTMLInputElement>(
        'input[name="track-title"]'
      );
      if (titleInput) {
        changeInputValue(titleInput, "不会保存的歌曲");
      }
      findButtonByText(container, "取消")?.click();
    });

    expect(container.querySelector(".catalog-track-editor")).toBeNull();
    expect(onCreateTrack).not.toHaveBeenCalled();

    await chooseAlbumMenuAction(container, "示例专辑 A", "添加歌曲");
    await act(async () => {
      const titleInput = container.querySelector<HTMLInputElement>(
        'input[name="track-title"]'
      );
      if (titleInput) {
        changeInputValue(titleInput, "不应带到另一张专辑");
      }
    });

    const secondAlbumButton = Array.from(
      container.querySelectorAll<HTMLButtonElement>(".album-list-button")
    ).find((button) => button.textContent?.includes("示例专辑 B"));

    await act(async () => {
      secondAlbumButton?.click();
    });

    expect(container.querySelector(".catalog-track-editor")).toBeNull();

    await chooseAlbumMenuAction(container, "示例专辑 B", "添加歌曲");

    expect(
      container.querySelector<HTMLInputElement>('input[name="track-album"]')?.value
    ).toBe("示例专辑 B");
    expect(
      container.querySelector<HTMLInputElement>('input[name="track-title"]')?.value
    ).toBe("");
    expect(onCreateTrack).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("blocks blank titles and invalid track positions", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const onCreateTrack = vi.fn(async () => ({
      ok: true as const,
      trackId: "track_user_invalid"
    }));

    await act(async () => {
      root.render(
        createElement(CatalogOverview, createCatalogOverviewProps({ onCreateTrack }))
      );
    });
    await chooseAlbumMenuAction(container, "示例专辑 A", "添加歌曲");

    const titleInput = container.querySelector<HTMLInputElement>(
      'input[name="track-title"]'
    );
    const trackInput = container.querySelector<HTMLInputElement>(
      'input[name="track-number"]'
    );

    await act(async () => {
      changeInputValue(titleInput as HTMLInputElement, "　 ");
      changeInputValue(trackInput as HTMLInputElement, "1.5");
      findButtonByText(container, "保存歌曲")?.click();
    });

    expect(container.textContent).toContain("请输入歌曲名。");
    expect(container.textContent).toContain("曲序必须是正整数。");
    expect(onCreateTrack).not.toHaveBeenCalled();

    await act(async () => {
      changeInputValue(titleInput as HTMLInputElement, "有效歌曲名");
    });

    for (const invalidTrackNumber of [
      "",
      "0",
      "-1",
      "1.5",
      "1e2",
      "9007199254740992"
    ]) {
      await act(async () => {
        changeInputValue(trackInput as HTMLInputElement, invalidTrackNumber);
        findButtonByText(container, "保存歌曲")?.click();
      });

      expect(container.textContent).toContain("曲序必须是正整数。");
      expect(onCreateTrack).not.toHaveBeenCalled();
    }

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("normalizes a valid track position on success", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const onCreateTrack = vi.fn(async () => ({
      ok: true as const,
      trackId: "track_user_success"
    }));

    await act(async () => {
      root.render(
        createElement(CatalogOverview, createCatalogOverviewProps({ onCreateTrack }))
      );
    });
    await chooseAlbumMenuAction(container, "示例专辑 A", "添加歌曲");

    await act(async () => {
      changeInputValue(
        container.querySelector<HTMLInputElement>(
          'input[name="track-title"]'
        ) as HTMLInputElement,
        "  成功歌曲  "
      );
      changeInputValue(
        container.querySelector<HTMLInputElement>(
          'input[name="track-number"]'
        ) as HTMLInputElement,
        "002"
      );
      findButtonByText(container, "保存歌曲")?.click();
    });

    expect(onCreateTrack).toHaveBeenCalledWith("album_sample_001", {
      title: "成功歌曲",
      trackNumber: 2
    });
    expect(container.querySelector(".catalog-track-editor")).toBeNull();

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("retains raw input and shows a safe error when saving fails", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const onCreateTrack = vi.fn(async () => ({
      ok: false as const,
      code: "save_failed" as const,
      errorMessage: "测试歌曲保存失败，请重试。"
    }));

    await act(async () => {
      root.render(
        createElement(CatalogOverview, createCatalogOverviewProps({ onCreateTrack }))
      );
    });
    await chooseAlbumMenuAction(container, "示例专辑 A", "添加歌曲");

    const rawValues = {
      title: "  失败歌曲  ",
      trackNumber: " 3 "
    };

    await act(async () => {
      changeInputValue(
        container.querySelector<HTMLInputElement>(
          'input[name="track-title"]'
        ) as HTMLInputElement,
        rawValues.title
      );
      changeInputValue(
        container.querySelector<HTMLInputElement>(
          'input[name="track-number"]'
        ) as HTMLInputElement,
        rawValues.trackNumber
      );
      findButtonByText(container, "保存歌曲")?.click();
    });

    expect(onCreateTrack).toHaveBeenCalledWith("album_sample_001", {
      title: "失败歌曲",
      trackNumber: 3
    });
    expect(container.textContent).toContain("测试歌曲保存失败，请重试。");
    expect(
      container.querySelector<HTMLInputElement>('input[name="track-title"]')?.value
    ).toBe(rawValues.title);
    expect(
      container.querySelector<HTMLInputElement>('input[name="track-number"]')?.value
    ).toBe(rawValues.trackNumber);
    expect(container.querySelector(".catalog-track-editor")).not.toBeNull();

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});

describe("catalog metadata editing", () => {
  it("prefills and submits an album edit without retired fields", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const onUpdateAlbum = vi.fn(async () => ({ ok: true as const }));

    await act(async () => {
      root.render(
        createElement(
          CatalogOverview,
          createCatalogOverviewProps({
            resettableAlbumIds: new Set(["album_sample_001"]),
            onUpdateAlbum
          })
        )
      );
    });
    await chooseAlbumMenuAction(container, "示例专辑 A", "编辑专辑");

    expect(container.querySelector("#catalog-editor-heading")?.textContent).toBe(
      "编辑专辑"
    );
    expect(
      container.querySelector<HTMLInputElement>('input[name="album-artist"]')?.value
    ).toBe("许嵩");
    expect(
      container.querySelector<HTMLInputElement>('input[name="album-title"]')?.value
    ).toBe("示例专辑 A");
    expect(
      container.querySelector<HTMLSelectElement>('select[name="album-type"]')?.value
    ).toBe("album");
    expect(container.querySelector('input[name="album-release-date"]')).toBeNull();
    expect(findButtonByText(container, "恢复默认")).toBeDefined();

    await act(async () => {
      changeInputValue(
        container.querySelector<HTMLInputElement>(
          'input[name="album-title"]'
        ) as HTMLInputElement,
        "  修改后的专辑  "
      );
      changeSelectValue(
        container.querySelector<HTMLSelectElement>(
          'select[name="album-type"]'
        ) as HTMLSelectElement,
        "ep"
      );
      findButtonByText(container, "保存修改")?.click();
    });

    expect(onUpdateAlbum).toHaveBeenCalledWith("album_sample_001", {
      title: "修改后的专辑",
      type: "ep"
    });
    expect(container.querySelector("#catalog-editor-heading")).toBeNull();

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("keeps album edit input and shows an error when reset saving fails", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const onResetAlbum = vi.fn(async () => ({
      ok: false as const,
      code: "save_failed" as const,
      errorMessage: "测试恢复专辑失败，请重试。"
    }));

    await act(async () => {
      root.render(
        createElement(
          CatalogOverview,
          createCatalogOverviewProps({
            resettableAlbumIds: new Set(["album_sample_001"]),
            onResetAlbum
          })
        )
      );
    });
    await chooseAlbumMenuAction(container, "示例专辑 A", "编辑专辑");

    const titleInput = container.querySelector<HTMLInputElement>(
      'input[name="album-title"]'
    );

    await act(async () => {
      changeInputValue(titleInput as HTMLInputElement, "  尚未保存的输入  ");
      findButtonByText(container, "恢复默认")?.click();
    });

    expect(onResetAlbum).toHaveBeenCalledWith("album_sample_001");
    expect(titleInput?.value).toBe("  尚未保存的输入  ");
    expect(container.textContent).toContain("测试恢复专辑失败，请重试。");
    expect(container.querySelector("#catalog-editor-heading")?.textContent).toBe(
      "编辑专辑"
    );

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("edits a track without exposing identity fields and closes on album switch", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const onUpdateTrack = vi.fn(async () => ({ ok: true as const }));

    await act(async () => {
      root.render(
        createElement(
          CatalogOverview,
          createCatalogOverviewProps({
            resettableTrackIds: new Set(["track_sample_001"]),
            onUpdateTrack
          })
        )
      );
    });
    await act(async () => {
      findButton(container, "编辑示例歌曲一的元数据")?.click();
    });

    expect(
      container.querySelector<HTMLInputElement>('input[name="track-title"]')?.value
    ).toBe("示例歌曲一");
    expect(
      container.querySelector<HTMLInputElement>('input[name="track-album"]')?.value
    ).toBe("示例专辑 A");
    expect(
      container.querySelector<HTMLInputElement>('input[name="track-artist"]')?.value
    ).toBe("许嵩");
    expect(
      container
        .querySelector<HTMLInputElement>('input[name="track-title"]')
        ?.form?.querySelector('input[name="track-id"]')
    ).toBeNull();
    expect(container.querySelector('input[name="track-disc-number"]')).toBeNull();
    expect(container.querySelector('input[name="track-version"]')).toBeNull();
    expect(container.querySelector('input[name="track-release-date"]')).toBeNull();
    expect(findButtonByText(container, "恢复默认")).toBeDefined();

    await act(async () => {
      changeInputValue(
        container.querySelector<HTMLInputElement>(
          'input[name="track-title"]'
        ) as HTMLInputElement,
        "  修改后的歌曲  "
      );
      changeInputValue(
        container.querySelector<HTMLInputElement>(
          'input[name="track-number"]'
        ) as HTMLInputElement,
        "03"
      );
      findButtonByText(container, "保存修改")?.click();
    });

    expect(onUpdateTrack).toHaveBeenCalledWith("track_sample_001", {
      title: "修改后的歌曲",
      trackNumber: 3
    });
    expect(container.querySelector(".catalog-track-editor")).toBeNull();

    await act(async () => {
      findButton(container, "编辑示例歌曲一的元数据")?.click();
    });
    const secondAlbumButton = Array.from(
      container.querySelectorAll<HTMLButtonElement>(".album-list-button")
    ).find((button) => button.textContent?.includes("示例专辑 B"));

    await act(async () => {
      secondAlbumButton?.click();
    });

    expect(container.querySelector(".catalog-track-editor")).toBeNull();
    expect(container.querySelector("#album-detail-heading")?.textContent).toBe(
      "示例专辑 B"
    );

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});
