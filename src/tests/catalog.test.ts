import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

import { mockCatalog } from "../data/catalog/mockCatalog";
import { CatalogOverview } from "../features/catalog/CatalogOverview";
import {
  getAlbumTracks,
  getReleaseYear,
  getSortedAlbums
} from "../features/catalog/catalog";
import { mergeCatalogChanges } from "../features/catalog/catalogMerge";
import {
  addAlbumToUserCatalog,
  addTrackToUserCatalog,
  createEmptyUserCatalogChanges
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

function createMemoryCatalogRepository(load: () => Promise<UserCatalogChanges>) {
  return {
    load: vi.fn(load),
    save: vi.fn(async () => undefined),
    clear: vi.fn(async () => undefined)
  } satisfies LocalCatalogRepository;
}

interface CatalogLibraryProbeProps {
  repository: LocalCatalogRepository;
}

function CatalogLibraryProbe({ repository }: CatalogLibraryProbeProps) {
  const library = useCatalogLibrary(mockCatalog, repository);

  return createElement(
    "output",
    {
      "data-error": library.errorMessage ?? "",
      "data-status": library.status
    },
    library.catalog.albums.map((album) => album.title).join("|")
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

  it("returns only referenced tracks for the selected album in disc and track order", () => {
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

  it("reads a release year only from a supported date value", () => {
    expect(getReleaseYear("2000-01-01")).toBe("2000");
    expect(getReleaseYear("2000")).toBe("2000");
    expect(getReleaseYear("待核对")).toBeUndefined();
    expect(getReleaseYear()).toBeUndefined();
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
      albumTrackIdAdditions: {}
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
        discNumber: 1,
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
          discNumber: 2,
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
      discNumber: 2,
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
          audioBindings: new Map(),
          pendingAudioTrackIds: new Set<string>(),
          audioLibraryStatus: "ready",
          onAddTrack,
          onAddAlbum,
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
      audioBindings: new Map(),
      pendingAudioTrackIds: new Set<string>(),
      audioLibraryStatus: "ready" as const,
      onAddTrack: vi.fn(),
      onAddAlbum: vi.fn(),
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
});
