import { afterEach, describe, expect, it, vi } from "vitest";

import { serializeTemporaryPlaylist } from "../features/playlist/playlistPersistence";
import type { PlaylistRepositoryErrorCode } from "../features/playlist/playlistRepository";
import { LOCAL_CATALOG_STORAGE_KEY } from "../infra/storage/localStorageCatalogRepository";
import {
  LOCAL_TEMPORARY_PLAYLIST_STORAGE_KEY,
  createLocalStoragePlaylistRepository
} from "../infra/storage/localStoragePlaylistRepository";
import type { TemporaryPlaylist } from "../types";
import {
  addTrackToPlaylist,
  createTemporaryPlaylist,
  updatePlaylistItemRepeatCount
} from "../utils/playlist";

const createdAt = "2026-07-17T00:00:00.000Z";
const updatedAt = "2026-07-17T00:01:00.000Z";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.values.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  peek(key: string): string | null {
    return this.values.get(key) ?? null;
  }
}

function createPopulatedPlaylist(): TemporaryPlaylist {
  const emptyPlaylist = createTemporaryPlaylist({
    id: "playlist_temp_current",
    name: "临时歌单",
    createdAt
  });
  const firstAdd = addTrackToPlaylist(emptyPlaylist, {
    itemId: "item_001",
    trackId: "track_001",
    addedAt: updatedAt
  });
  const secondAdd = addTrackToPlaylist(firstAdd, {
    itemId: "item_002",
    trackId: "track_001",
    addedAt: updatedAt
  });

  return updatePlaylistItemRepeatCount(secondAdd, "item_001", 3, updatedAt);
}

async function expectRepositoryError(
  promise: Promise<unknown>,
  code: PlaylistRepositoryErrorCode
): Promise<void> {
  await expect(promise).rejects.toMatchObject({
    name: "PlaylistRepositoryError",
    code
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("localStorage temporary playlist repository", () => {
  it("returns null without writing when no snapshot exists", async () => {
    const storage = new MemoryStorage();
    const setItemSpy = vi.spyOn(storage, "setItem");
    const removeItemSpy = vi.spyOn(storage, "removeItem");
    const repository = createLocalStoragePlaylistRepository(storage);

    expect(await repository.load()).toBeNull();
    expect(setItemSpy).not.toHaveBeenCalled();
    expect(removeItemSpy).not.toHaveBeenCalled();
  });

  it("distinguishes a stored empty playlist from no snapshot", async () => {
    const storage = new MemoryStorage();
    const repository = createLocalStoragePlaylistRepository(storage);
    const emptyPlaylist = createTemporaryPlaylist({
      id: "playlist_temp_current",
      name: "临时歌单",
      createdAt
    });

    await repository.save(emptyPlaylist);

    expect(storage.peek(LOCAL_TEMPORARY_PLAYLIST_STORAGE_KEY)).not.toBeNull();
    expect(await repository.load()).toEqual(emptyPlaylist);
  });

  it("saves and reloads a validated playlist without mutating the input", async () => {
    const storage = new MemoryStorage();
    const playlist = createPopulatedPlaylist();
    const playlistBeforeSave = structuredClone(playlist);
    const firstRepository = createLocalStoragePlaylistRepository(storage);

    await firstRepository.save(playlist);

    expect(playlist).toEqual(playlistBeforeSave);
    expect(
      JSON.parse(storage.peek(LOCAL_TEMPORARY_PLAYLIST_STORAGE_KEY) ?? "")
    ).toEqual(serializeTemporaryPlaylist(playlist));

    const secondRepository = createLocalStoragePlaylistRepository(storage);
    const firstLoad = await secondRepository.load();

    expect(firstLoad).toEqual(playlist);

    if (firstLoad === null) {
      throw new Error("Expected the stored playlist to load.");
    }

    firstLoad.itemIds.reverse();
    firstLoad.itemsById.item_001.repeatCount = 1;

    expect(await secondRepository.load()).toEqual(playlist);
  });

  it("clears only the playlist key and then reports no snapshot", async () => {
    const storage = new MemoryStorage();
    const repository = createLocalStoragePlaylistRepository(storage);
    const clearSpy = vi.spyOn(storage, "clear");
    storage.setItem(LOCAL_CATALOG_STORAGE_KEY, "keep-catalog");
    storage.setItem("unrelated-key", "keep-unrelated");
    await repository.save(createPopulatedPlaylist());

    await repository.clear();

    expect(LOCAL_TEMPORARY_PLAYLIST_STORAGE_KEY).not.toBe(LOCAL_CATALOG_STORAGE_KEY);
    expect(storage.peek(LOCAL_TEMPORARY_PLAYLIST_STORAGE_KEY)).toBeNull();
    expect(storage.peek(LOCAL_CATALOG_STORAGE_KEY)).toBe("keep-catalog");
    expect(storage.peek("unrelated-key")).toBe("keep-unrelated");
    expect(clearSpy).not.toHaveBeenCalled();
    expect(await repository.load()).toBeNull();
  });

  it("reports invalid JSON without changing or clearing the original value", async () => {
    const storage = new MemoryStorage();
    const originalValue = "{broken";
    storage.setItem(LOCAL_TEMPORARY_PLAYLIST_STORAGE_KEY, originalValue);
    const setItemSpy = vi.spyOn(storage, "setItem");
    const removeItemSpy = vi.spyOn(storage, "removeItem");
    const repository = createLocalStoragePlaylistRepository(storage);

    await expectRepositoryError(repository.load(), "invalid_json");

    expect(storage.peek(LOCAL_TEMPORARY_PLAYLIST_STORAGE_KEY)).toBe(originalValue);
    expect(setItemSpy).not.toHaveBeenCalled();
    expect(removeItemSpy).not.toHaveBeenCalled();
  });

  it.each([
    ["null root", null],
    ["array root", []],
    [
      "duplicate queue item ID",
      {
        ...serializeTemporaryPlaylist(createPopulatedPlaylist()),
        itemIds: ["item_001", "item_001"]
      }
    ],
    [
      "invalid repeat count",
      {
        ...serializeTemporaryPlaylist(createPopulatedPlaylist()),
        items: serializeTemporaryPlaylist(createPopulatedPlaylist()).items.map(
          (item, index) => (index === 0 ? { ...item, repeatCount: 0 } : item)
        )
      }
    ],
    [
      "unexpected playback state",
      {
        ...serializeTemporaryPlaylist(createPopulatedPlaylist()),
        isPlaying: false
      }
    ]
  ])(
    "reports damaged stored data without overwriting it: %s",
    async (_label, value) => {
      const storage = new MemoryStorage();
      const originalValue = JSON.stringify(value);
      storage.setItem(LOCAL_TEMPORARY_PLAYLIST_STORAGE_KEY, originalValue);
      const setItemSpy = vi.spyOn(storage, "setItem");
      const removeItemSpy = vi.spyOn(storage, "removeItem");
      const repository = createLocalStoragePlaylistRepository(storage);

      await expectRepositoryError(repository.load(), "invalid_data");

      expect(storage.peek(LOCAL_TEMPORARY_PLAYLIST_STORAGE_KEY)).toBe(originalValue);
      expect(setItemSpy).not.toHaveBeenCalled();
      expect(removeItemSpy).not.toHaveBeenCalled();
    }
  );

  it("reports an unsupported schema without changing the stored snapshot", async () => {
    const storage = new MemoryStorage();
    const originalValue = JSON.stringify({
      ...serializeTemporaryPlaylist(createPopulatedPlaylist()),
      schemaVersion: 2,
      futureQueueData: { enabled: true }
    });
    storage.setItem(LOCAL_TEMPORARY_PLAYLIST_STORAGE_KEY, originalValue);
    const setItemSpy = vi.spyOn(storage, "setItem");
    const removeItemSpy = vi.spyOn(storage, "removeItem");
    const repository = createLocalStoragePlaylistRepository(storage);

    await expectRepositoryError(repository.load(), "unsupported_schema");

    expect(storage.peek(LOCAL_TEMPORARY_PLAYLIST_STORAGE_KEY)).toBe(originalValue);
    expect(setItemSpy).not.toHaveBeenCalled();
    expect(removeItemSpy).not.toHaveBeenCalled();
  });

  it("wraps storage read failures without attempting recovery writes", async () => {
    const storage = new MemoryStorage();
    const originalValue = JSON.stringify(
      serializeTemporaryPlaylist(createPopulatedPlaylist())
    );
    storage.setItem(LOCAL_TEMPORARY_PLAYLIST_STORAGE_KEY, originalValue);
    vi.spyOn(storage, "getItem").mockImplementation(() => {
      throw new Error("read denied");
    });
    const setItemSpy = vi.spyOn(storage, "setItem");
    const removeItemSpy = vi.spyOn(storage, "removeItem");
    const repository = createLocalStoragePlaylistRepository(storage);

    await expectRepositoryError(repository.load(), "read_failed");

    expect(storage.peek(LOCAL_TEMPORARY_PLAYLIST_STORAGE_KEY)).toBe(originalValue);
    expect(setItemSpy).not.toHaveBeenCalled();
    expect(removeItemSpy).not.toHaveBeenCalled();
  });

  it("keeps the in-memory playlist and previous value when a write fails", async () => {
    const storage = new MemoryStorage();
    const originalValue = "recoverable-original-value";
    storage.setItem(LOCAL_TEMPORARY_PLAYLIST_STORAGE_KEY, originalValue);
    vi.spyOn(storage, "setItem").mockImplementation(() => {
      throw new Error("quota exceeded");
    });
    const removeItemSpy = vi.spyOn(storage, "removeItem");
    const clearSpy = vi.spyOn(storage, "clear");
    const playlist = createPopulatedPlaylist();
    const playlistBeforeSave = structuredClone(playlist);
    const repository = createLocalStoragePlaylistRepository(storage);

    await expectRepositoryError(repository.save(playlist), "write_failed");

    expect(playlist).toEqual(playlistBeforeSave);
    expect(storage.peek(LOCAL_TEMPORARY_PLAYLIST_STORAGE_KEY)).toBe(originalValue);
    expect(removeItemSpy).not.toHaveBeenCalled();
    expect(clearSpy).not.toHaveBeenCalled();
  });

  it("keeps the previous value when clear fails", async () => {
    const storage = new MemoryStorage();
    const originalValue = JSON.stringify(
      serializeTemporaryPlaylist(createPopulatedPlaylist())
    );
    storage.setItem(LOCAL_TEMPORARY_PLAYLIST_STORAGE_KEY, originalValue);
    vi.spyOn(storage, "removeItem").mockImplementation(() => {
      throw new Error("remove denied");
    });
    const repository = createLocalStoragePlaylistRepository(storage);

    await expectRepositoryError(repository.clear(), "clear_failed");

    expect(storage.peek(LOCAL_TEMPORARY_PLAYLIST_STORAGE_KEY)).toBe(originalValue);
  });

  it("validates before writing and preserves the existing stored value", async () => {
    const storage = new MemoryStorage();
    const originalValue = JSON.stringify(
      serializeTemporaryPlaylist(createPopulatedPlaylist())
    );
    storage.setItem(LOCAL_TEMPORARY_PLAYLIST_STORAGE_KEY, originalValue);
    const setItemSpy = vi.spyOn(storage, "setItem");
    const playlist = createPopulatedPlaylist();
    const invalidPlaylist = {
      ...playlist,
      itemIds: ["item_001", "item_001"]
    };
    const repository = createLocalStoragePlaylistRepository(storage);

    await expectRepositoryError(repository.save(invalidPlaylist), "invalid_data");

    expect(storage.peek(LOCAL_TEMPORARY_PLAYLIST_STORAGE_KEY)).toBe(originalValue);
    expect(setItemSpy).not.toHaveBeenCalled();
  });

  it("does not persist runtime playback or media fields", async () => {
    const storage = new MemoryStorage();
    const playlist = createPopulatedPlaylist();
    const localFile = new File(["self-created test bytes"], "test.mp3", {
      type: "audio/mpeg"
    });
    const playlistWithRuntimeState = {
      ...playlist,
      isPlaying: true,
      playbackToken: "runtime-token",
      playSequence: [{ queueItemId: "item_001" }],
      file: localFile,
      itemsById: {
        ...playlist.itemsById,
        item_001: {
          ...playlist.itemsById.item_001,
          objectUrl: "blob:https://example.invalid/runtime-audio",
          file: localFile
        }
      }
    } as TemporaryPlaylist;
    const repository = createLocalStoragePlaylistRepository(storage);

    await repository.save(playlistWithRuntimeState);

    const storedValue = storage.peek(LOCAL_TEMPORARY_PLAYLIST_STORAGE_KEY) ?? "";

    expect(JSON.parse(storedValue)).toEqual(
      serializeTemporaryPlaylist(playlistWithRuntimeState)
    );
    expect(storedValue).not.toContain("playSequence");
    expect(storedValue).not.toContain("isPlaying");
    expect(storedValue).not.toContain("playbackToken");
    expect(storedValue).not.toContain("objectUrl");
    expect(storedValue).not.toContain("test.mp3");
  });

  it("does not access the local audio IndexedDB", async () => {
    const openIndexedDb = vi.fn();
    vi.stubGlobal("indexedDB", { open: openIndexedDb });
    const storage = new MemoryStorage();
    const repository = createLocalStoragePlaylistRepository(storage);

    await repository.save(createPopulatedPlaylist());
    await repository.load();
    await repository.clear();

    expect(openIndexedDb).not.toHaveBeenCalled();
  });

  it("reports an unavailable storage provider for every operation", async () => {
    const repository = createLocalStoragePlaylistRepository(() => undefined);

    await expectRepositoryError(repository.load(), "storage_unavailable");
    await expectRepositoryError(
      repository.save(createPopulatedPlaylist()),
      "storage_unavailable"
    );
    await expectRepositoryError(repository.clear(), "storage_unavailable");
  });

  it("reports lazy browser storage access failures", async () => {
    const repository = createLocalStoragePlaylistRepository(() => {
      throw new Error("localStorage denied");
    });

    await expectRepositoryError(repository.load(), "storage_unavailable");
  });
});
