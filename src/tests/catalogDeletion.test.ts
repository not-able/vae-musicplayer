import { describe, expect, it, vi } from "vitest";

import { mockCatalog } from "../data/catalog/mockCatalog";
import {
  createCatalogDeletionPlan,
  type CatalogDeletionPlan
} from "../features/catalog/catalogDeletion";
import {
  completeCatalogDeletion,
  startCatalogDeletion
} from "../features/catalog/catalogDeletionExecution";
import type {
  CatalogDeletionIntent,
  CatalogDeletionIntentRepository
} from "../features/catalog/catalogDeletionRepository";
import { mergeCatalogChanges } from "../features/catalog/catalogMerge";
import {
  addAlbumToUserCatalog,
  addTrackToUserCatalog,
  createEmptyUserCatalogChanges,
  restoreHiddenDefaultCatalog
} from "../features/catalog/catalogMutations";
import type { LocalCatalogRepository } from "../features/catalog/localCatalogRepository";
import type { LocalAudioFileRepository } from "../features/local-library/localAudioRepository";
import type { TemporaryPlaylistRepository } from "../features/playlist/playlistRepository";
import type {
  LocalAudioFileRecord,
  TemporaryPlaylist,
  UserCatalogChanges
} from "../types";
import { addTrackToPlaylist, createTemporaryPlaylist } from "../utils/playlist";

const timestamp = "2026-07-18T00:00:00.000Z";

function createPlaylist(trackIds: readonly string[]): TemporaryPlaylist {
  return trackIds.reduce(
    (playlist, trackId, index) =>
      addTrackToPlaylist(playlist, {
        trackId,
        itemId: `item_${index + 1}`,
        addedAt: timestamp
      }),
    createTemporaryPlaylist({
      id: "playlist_temp_current",
      name: "临时歌单",
      createdAt: timestamp
    })
  );
}

function createAudioRecord(trackId: string): LocalAudioFileRecord {
  return {
    id: `local_audio_${trackId}`,
    trackId,
    fileName: `${trackId}.wav`,
    fileType: "audio/wav",
    fileSize: 4,
    status: "available",
    updatedAt: timestamp,
    file: new File(["test"], `${trackId}.wav`, { type: "audio/wav" })
  };
}

function createUserAlbumChanges(): UserCatalogChanges {
  const albumChanges = addAlbumToUserCatalog(
    mockCatalog,
    createEmptyUserCatalogChanges(),
    {
      artistId: "artist_vae",
      title: "待删除专辑",
      type: "other",
      sortOrder: 3
    },
    () => "album_user_delete"
  );

  return addTrackToUserCatalog(
    mockCatalog,
    albumChanges,
    {
      artistId: "artist_vae",
      albumId: "album_user_delete",
      title: "待删除歌曲",
      trackNumber: 1
    },
    () => "track_user_delete"
  );
}

describe("catalog deletion plans", () => {
  it("permanently removes a user album and every duplicate queue item that references it", () => {
    const changes = createUserAlbumChanges();
    const plan = createCatalogDeletionPlan({
      defaultCatalog: mockCatalog,
      changes,
      playlist: createPlaylist([
        "track_sample_001",
        "track_user_delete",
        "track_user_delete",
        "track_sample_002"
      ]),
      audioBindings: new Map([
        ["track_user_delete", createAudioRecord("track_user_delete")]
      ]),
      target: { kind: "album", id: "album_user_delete" },
      updatedAt: timestamp
    });

    expect(plan.action).toBe("delete");
    expect(plan.trackIds).toEqual(["track_user_delete"]);
    expect(plan.trackCount).toBe(1);
    expect(plan.playlistItemCount).toBe(2);
    expect(plan.audioBindingCount).toBe(1);
    expect(plan.nextPlaylist.itemIds).toEqual(["item_1", "item_4"]);
    expect(plan.nextCatalogChanges.addedAlbums).toEqual([]);
    expect(plan.nextCatalogChanges.addedTracks).toEqual([]);
    expect(
      mergeCatalogChanges(mockCatalog, plan.nextCatalogChanges).albums.some(
        (album) => album.id === "album_user_delete"
      )
    ).toBe(false);
  });

  it("hides a built-in album locally, clears its user additions, and restores only default metadata", () => {
    const changes = addTrackToUserCatalog(
      mockCatalog,
      createEmptyUserCatalogChanges(),
      {
        artistId: "artist_vae",
        albumId: "album_sample_001",
        title: "用户附加歌曲",
        trackNumber: 3
      },
      () => "track_user_added_to_default"
    );
    const plan = createCatalogDeletionPlan({
      defaultCatalog: mockCatalog,
      changes,
      playlist: createPlaylist([
        "track_sample_001",
        "track_user_added_to_default",
        "track_sample_002"
      ]),
      audioBindings: new Map(),
      target: { kind: "album", id: "album_sample_001" },
      updatedAt: timestamp
    });

    expect(plan.action).toBe("hide");
    expect(plan.trackCount).toBe(3);
    expect(plan.nextCatalogChanges.hiddenDefaultAlbumIds).toEqual(["album_sample_001"]);
    expect(plan.nextCatalogChanges.addedTracks).toEqual([]);
    expect(
      mergeCatalogChanges(mockCatalog, plan.nextCatalogChanges).albums.some(
        (album) => album.id === "album_sample_001"
      )
    ).toBe(false);

    const restoredCatalog = mergeCatalogChanges(
      mockCatalog,
      restoreHiddenDefaultCatalog(plan.nextCatalogChanges)
    );

    expect(
      restoredCatalog.albums.find((album) => album.id === "album_sample_001")?.trackIds
    ).toEqual(["track_sample_001", "track_sample_002"]);
    expect(
      restoredCatalog.tracks.some((track) => track.id === "track_user_added_to_default")
    ).toBe(false);
  });
});

describe("catalog deletion recovery", () => {
  it("keeps the intent after a failed step and safely replays the idempotent final state", async () => {
    const plan = createDeletionPlanForRecovery();
    let storedChanges = createUserAlbumChanges();
    let storedPlaylist = plan.nextPlaylist;
    let storedIntent: CatalogDeletionIntent | null = null;
    let shouldFailAudioRemoval = true;
    const catalogRepository = {
      load: vi.fn(async () => storedChanges),
      save: vi.fn(async (changes: UserCatalogChanges) => {
        storedChanges = changes;
      }),
      clear: vi.fn(async () => undefined)
    } satisfies LocalCatalogRepository;
    const playlistRepository = {
      load: vi.fn(async () => storedPlaylist),
      save: vi.fn(async (playlist: TemporaryPlaylist) => {
        storedPlaylist = playlist;
      }),
      clear: vi.fn(async () => undefined)
    } satisfies TemporaryPlaylistRepository;
    const audioRepository = {
      list: vi.fn(async () => []),
      save: vi.fn(async () => undefined),
      remove: vi.fn(async () => {
        if (shouldFailAudioRemoval) {
          throw new Error("IndexedDB temporarily unavailable");
        }
      })
    } satisfies LocalAudioFileRepository;
    const intentRepository = {
      load: vi.fn(async () => storedIntent),
      save: vi.fn(async (intent: CatalogDeletionIntent) => {
        storedIntent = intent;
      }),
      clear: vi.fn(async () => {
        storedIntent = null;
      })
    } satisfies CatalogDeletionIntentRepository;
    const stores = {
      catalogRepository,
      playlistRepository,
      audioRepository,
      intentRepository
    };

    await expect(
      startCatalogDeletion(stores, plan, "catalog_deletion_test", timestamp)
    ).rejects.toThrow("IndexedDB");

    const unfinishedIntent = await intentRepository.load();

    expect(unfinishedIntent?.id).toBe("catalog_deletion_test");
    expect(storedChanges).toEqual(plan.nextCatalogChanges);
    expect(storedPlaylist).toEqual(plan.nextPlaylist);

    shouldFailAudioRemoval = false;
    if (!unfinishedIntent) {
      throw new Error("Expected a recoverable catalog deletion intent.");
    }
    await completeCatalogDeletion(stores, unfinishedIntent);

    expect(audioRepository.remove).toHaveBeenCalledTimes(2);
    expect(storedIntent).toBeNull();
    expect(storedChanges).toEqual(plan.nextCatalogChanges);
    expect(storedPlaylist).toEqual(plan.nextPlaylist);
  });
});

function createDeletionPlanForRecovery(): CatalogDeletionPlan {
  return createCatalogDeletionPlan({
    defaultCatalog: mockCatalog,
    changes: createUserAlbumChanges(),
    playlist: createPlaylist(["track_user_delete", "track_sample_001"]),
    audioBindings: new Map([
      ["track_user_delete", createAudioRecord("track_user_delete")]
    ]),
    target: { kind: "track", id: "track_user_delete" },
    updatedAt: timestamp
  });
}
