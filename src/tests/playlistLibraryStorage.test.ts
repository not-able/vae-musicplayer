import { describe, expect, it, vi } from "vitest";

import {
  copyPlaylistToSaved,
  createPlaylistLibrary
} from "../features/playlist/playlistLibrary";
import { serializePlaylistLibrary } from "../features/playlist/playlistLibraryPersistence";
import { serializeTemporaryPlaylist } from "../features/playlist/playlistPersistence";
import type { PlaylistRepositoryErrorCode } from "../features/playlist/playlistRepository";
import type { PlaylistLibrary } from "../types";
import {
  LOCAL_PLAYLIST_LIBRARY_STORAGE_KEY,
  createLocalStoragePlaylistLibraryRepository
} from "../infra/storage/localStoragePlaylistLibraryRepository";
import { LOCAL_TEMPORARY_PLAYLIST_STORAGE_KEY } from "../infra/storage/localStoragePlaylistRepository";
import { addTrackToPlaylist, createTemporaryPlaylist } from "../utils/playlist";

const createdAt = "2026-07-18T00:00:00.000Z";
const updatedAt = "2026-07-18T00:01:00.000Z";

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

function createPlaylistLibraryFixture(): PlaylistLibrary {
  const temporaryPlaylist = addTrackToPlaylist(
    createTemporaryPlaylist({
      id: "playlist_temporary",
      createdAt
    }),
    {
      itemId: "queue_item_001",
      trackId: "track_001",
      addedAt: updatedAt
    }
  );

  return copyPlaylistToSaved(createPlaylistLibrary({ temporaryPlaylist }), {
    sourcePlaylist: temporaryPlaylist,
    savedPlaylistId: "playlist_saved_001",
    name: "收藏歌单",
    createdAt: "2026-07-18T00:02:00.000Z"
  });
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

describe("localStorage playlist library repository", () => {
  it("saves and reloads a versioned library without persisting runtime media state", async () => {
    const storage = new MemoryStorage();
    const repository = createLocalStoragePlaylistLibraryRepository(storage);
    const library = createPlaylistLibraryFixture();
    const localFile = new File(["self-created test bytes"], "test.mp3", {
      type: "audio/mpeg"
    });
    const libraryWithRuntimeState = {
      ...library,
      isPlaying: true,
      playSequence: [{ queueItemId: "queue_item_001" }],
      temporaryPlaylist: {
        ...library.temporaryPlaylist,
        mediaToken: "runtime-token",
        file: localFile,
        itemsById: {
          ...library.temporaryPlaylist.itemsById,
          queue_item_001: {
            ...library.temporaryPlaylist.itemsById.queue_item_001,
            playedCount: 1,
            objectUrl: "blob:https://example.invalid/runtime-audio",
            file: localFile
          }
        }
      }
    } as PlaylistLibrary;

    await repository.save(libraryWithRuntimeState);

    const storedValue = storage.peek(LOCAL_PLAYLIST_LIBRARY_STORAGE_KEY) ?? "";

    expect(storedValue).not.toContain("isPlaying");
    expect(storedValue).not.toContain("playSequence");
    expect(storedValue).not.toContain("mediaToken");
    expect(storedValue).not.toContain("objectUrl");
    expect(storedValue).not.toContain("test.mp3");
    expect(storedValue).not.toContain("playedCount");
    expect(await repository.load()).toEqual(createPlaylistLibraryFixture());
  });

  it("migrates a valid legacy draft in memory without changing either storage key", async () => {
    const storage = new MemoryStorage();
    const legacyPlaylist = createPlaylistLibraryFixture().temporaryPlaylist;
    const legacyValue = JSON.stringify(serializeTemporaryPlaylist(legacyPlaylist));
    storage.setItem(LOCAL_TEMPORARY_PLAYLIST_STORAGE_KEY, legacyValue);
    const setItemSpy = vi.spyOn(storage, "setItem");
    const removeItemSpy = vi.spyOn(storage, "removeItem");
    const repository = createLocalStoragePlaylistLibraryRepository(storage);

    const library = await repository.load();

    expect(library).toEqual(
      createPlaylistLibrary({ temporaryPlaylist: legacyPlaylist })
    );
    expect(storage.peek(LOCAL_PLAYLIST_LIBRARY_STORAGE_KEY)).toBeNull();
    expect(storage.peek(LOCAL_TEMPORARY_PLAYLIST_STORAGE_KEY)).toBe(legacyValue);
    expect(setItemSpy).not.toHaveBeenCalled();
    expect(removeItemSpy).not.toHaveBeenCalled();
  });

  it("does not fall back to or overwrite legacy data when the new snapshot is damaged", async () => {
    const storage = new MemoryStorage();
    const newValue = "{broken";
    const legacyValue = JSON.stringify(
      serializeTemporaryPlaylist(createPlaylistLibraryFixture().temporaryPlaylist)
    );
    storage.setItem(LOCAL_PLAYLIST_LIBRARY_STORAGE_KEY, newValue);
    storage.setItem(LOCAL_TEMPORARY_PLAYLIST_STORAGE_KEY, legacyValue);
    const setItemSpy = vi.spyOn(storage, "setItem");
    const removeItemSpy = vi.spyOn(storage, "removeItem");
    const repository = createLocalStoragePlaylistLibraryRepository(storage);

    await expectRepositoryError(repository.load(), "invalid_json");

    expect(storage.peek(LOCAL_PLAYLIST_LIBRARY_STORAGE_KEY)).toBe(newValue);
    expect(storage.peek(LOCAL_TEMPORARY_PLAYLIST_STORAGE_KEY)).toBe(legacyValue);
    expect(setItemSpy).not.toHaveBeenCalled();
    expect(removeItemSpy).not.toHaveBeenCalled();
  });

  it("reports damaged legacy data without changing the migration source", async () => {
    const storage = new MemoryStorage();
    const legacyValue = "{broken";
    storage.setItem(LOCAL_TEMPORARY_PLAYLIST_STORAGE_KEY, legacyValue);
    const setItemSpy = vi.spyOn(storage, "setItem");
    const removeItemSpy = vi.spyOn(storage, "removeItem");
    const repository = createLocalStoragePlaylistLibraryRepository(storage);

    await expectRepositoryError(repository.load(), "invalid_json");

    expect(storage.peek(LOCAL_PLAYLIST_LIBRARY_STORAGE_KEY)).toBeNull();
    expect(storage.peek(LOCAL_TEMPORARY_PLAYLIST_STORAGE_KEY)).toBe(legacyValue);
    expect(setItemSpy).not.toHaveBeenCalled();
    expect(removeItemSpy).not.toHaveBeenCalled();
  });

  it("rejects an unsupported library schema without overwriting it", async () => {
    const storage = new MemoryStorage();
    const originalValue = JSON.stringify({
      ...serializePlaylistLibrary(createPlaylistLibraryFixture()),
      schemaVersion: 2
    });
    storage.setItem(LOCAL_PLAYLIST_LIBRARY_STORAGE_KEY, originalValue);
    const setItemSpy = vi.spyOn(storage, "setItem");
    const repository = createLocalStoragePlaylistLibraryRepository(storage);

    await expectRepositoryError(repository.load(), "unsupported_schema");

    expect(storage.peek(LOCAL_PLAYLIST_LIBRARY_STORAGE_KEY)).toBe(originalValue);
    expect(setItemSpy).not.toHaveBeenCalled();
  });

  it("rejects malformed saved documents without overwriting the original library", async () => {
    const storage = new MemoryStorage();
    const originalValue = JSON.stringify({
      schemaVersion: 1,
      temporaryPlaylist: serializeTemporaryPlaylist(
        createPlaylistLibraryFixture().temporaryPlaylist
      ),
      savedPlaylistIds: ["playlist_saved_001"],
      savedPlaylistsById: {
        playlist_saved_001: {
          ...serializeTemporaryPlaylist(
            createPlaylistLibraryFixture().temporaryPlaylist
          ),
          id: "playlist_saved_001",
          name: "   "
        }
      }
    });
    storage.setItem(LOCAL_PLAYLIST_LIBRARY_STORAGE_KEY, originalValue);
    const setItemSpy = vi.spyOn(storage, "setItem");
    const repository = createLocalStoragePlaylistLibraryRepository(storage);

    await expectRepositoryError(repository.load(), "invalid_data");

    expect(storage.peek(LOCAL_PLAYLIST_LIBRARY_STORAGE_KEY)).toBe(originalValue);
    expect(setItemSpy).not.toHaveBeenCalled();
  });

  it("keeps the existing library value when a storage write fails", async () => {
    const storage = new MemoryStorage();
    const originalValue = "recoverable-original-value";
    storage.setItem(LOCAL_PLAYLIST_LIBRARY_STORAGE_KEY, originalValue);
    vi.spyOn(storage, "setItem").mockImplementation(() => {
      throw new Error("quota exceeded");
    });
    const repository = createLocalStoragePlaylistLibraryRepository(storage);

    await expectRepositoryError(
      repository.save(createPlaylistLibraryFixture()),
      "write_failed"
    );

    expect(storage.peek(LOCAL_PLAYLIST_LIBRARY_STORAGE_KEY)).toBe(originalValue);
  });

  it("clears only the new library key and leaves the migration source untouched", async () => {
    const storage = new MemoryStorage();
    const repository = createLocalStoragePlaylistLibraryRepository(storage);
    const legacyValue = JSON.stringify(
      serializeTemporaryPlaylist(createPlaylistLibraryFixture().temporaryPlaylist)
    );
    storage.setItem(LOCAL_TEMPORARY_PLAYLIST_STORAGE_KEY, legacyValue);
    await repository.save(createPlaylistLibraryFixture());

    await repository.clear();

    expect(storage.peek(LOCAL_PLAYLIST_LIBRARY_STORAGE_KEY)).toBeNull();
    expect(storage.peek(LOCAL_TEMPORARY_PLAYLIST_STORAGE_KEY)).toBe(legacyValue);
  });
});
