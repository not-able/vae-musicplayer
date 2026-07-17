import { describe, expect, it, vi } from "vitest";

import type { CatalogRepositoryErrorCode } from "../features/catalog/localCatalogRepository";
import { createEmptyUserCatalogChanges } from "../features/catalog/catalogMutations";
import {
  LOCAL_CATALOG_STORAGE_KEY,
  createLocalStorageCatalogRepository
} from "../infra/storage/localStorageCatalogRepository";
import type { UserCatalogChanges } from "../types";

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

function createCompleteChanges(): UserCatalogChanges {
  return {
    schemaVersion: 1,
    addedAlbums: [
      {
        id: "album_user_001",
        artistId: "artist_vae",
        title: "用户专辑",
        type: "other",
        releaseDate: "2026-07-17",
        sortOrder: 3,
        trackIds: ["track_user_001"],
        note: "用户维护的占位元数据"
      }
    ],
    addedTracks: [
      {
        id: "track_user_001",
        artistId: "artist_vae",
        albumId: "album_user_001",
        title: "用户歌曲一",
        discNumber: 1,
        trackNumber: 1,
        durationSeconds: 180,
        version: "演示版本",
        releaseDate: "2026-07-17",
        note: "仅保存元数据"
      },
      {
        id: "track_user_002",
        artistId: "artist_vae",
        albumId: "album_sample_001",
        title: "用户歌曲二"
      }
    ],
    albumOverrides: {
      album_sample_001: {
        title: "用户专辑标题",
        type: "album",
        releaseDate: null,
        sortOrder: 20,
        note: null
      }
    },
    trackOverrides: {
      track_sample_001: {
        title: "用户歌曲标题",
        discNumber: null,
        trackNumber: 8,
        durationSeconds: null,
        version: null,
        releaseDate: null,
        note: null
      }
    },
    albumTrackIdAdditions: {
      album_sample_001: ["track_user_002"]
    }
  };
}

async function expectRepositoryError(
  promise: Promise<unknown>,
  code: CatalogRepositoryErrorCode
): Promise<void> {
  await expect(promise).rejects.toMatchObject({
    name: "CatalogRepositoryError",
    code
  });
}

describe("localStorage catalog repository", () => {
  it("returns a fresh empty change set without writing when storage is empty", async () => {
    const storage = new MemoryStorage();
    const setItemSpy = vi.spyOn(storage, "setItem");
    const removeItemSpy = vi.spyOn(storage, "removeItem");
    const repository = createLocalStorageCatalogRepository(storage);

    const firstLoad = await repository.load();
    firstLoad.albumOverrides.album_user_001 = { title: "只修改本次结果" };
    const secondLoad = await repository.load();

    expect(secondLoad).toEqual(createEmptyUserCatalogChanges());
    expect(firstLoad).not.toEqual(secondLoad);
    expect(setItemSpy).not.toHaveBeenCalled();
    expect(removeItemSpy).not.toHaveBeenCalled();
  });

  it("saves and reloads a complete change set without mutating the input", async () => {
    const storage = new MemoryStorage();
    const firstRepository = createLocalStorageCatalogRepository(storage);
    const changes = createCompleteChanges();
    const changesSnapshot = structuredClone(changes);

    await firstRepository.save(changes);

    const secondRepository = createLocalStorageCatalogRepository(storage);
    const firstLoad = await secondRepository.load();

    expect(firstLoad).toEqual(changes);
    expect(changes).toEqual(changesSnapshot);

    firstLoad.addedAlbums[0].title = "只修改加载结果";

    expect(await secondRepository.load()).toEqual(changes);
  });

  it("clears only the catalog key and then loads an empty change set", async () => {
    const storage = new MemoryStorage();
    const repository = createLocalStorageCatalogRepository(storage);
    const clearSpy = vi.spyOn(storage, "clear");
    storage.setItem("unrelated-key", "keep-me");
    await repository.save(createCompleteChanges());

    await repository.clear();

    expect(storage.peek(LOCAL_CATALOG_STORAGE_KEY)).toBeNull();
    expect(storage.peek("unrelated-key")).toBe("keep-me");
    expect(clearSpy).not.toHaveBeenCalled();
    expect(await repository.load()).toEqual(createEmptyUserCatalogChanges());
  });

  it("reports invalid JSON without changing the original string", async () => {
    const storage = new MemoryStorage();
    const originalValue = "{broken";
    storage.setItem(LOCAL_CATALOG_STORAGE_KEY, originalValue);
    const setItemSpy = vi.spyOn(storage, "setItem");
    const removeItemSpy = vi.spyOn(storage, "removeItem");
    const repository = createLocalStorageCatalogRepository(storage);

    await expectRepositoryError(repository.load(), "invalid_json");

    expect(storage.peek(LOCAL_CATALOG_STORAGE_KEY)).toBe(originalValue);
    expect(setItemSpy).not.toHaveBeenCalled();
    expect(removeItemSpy).not.toHaveBeenCalled();
  });

  it("reports an unsupported schema without changing the original string", async () => {
    const storage = new MemoryStorage();
    const originalValue = JSON.stringify({
      ...createEmptyUserCatalogChanges(),
      schemaVersion: 2,
      futureMigrationData: { enabled: true }
    });
    storage.setItem(LOCAL_CATALOG_STORAGE_KEY, originalValue);
    const repository = createLocalStorageCatalogRepository(storage);

    await expectRepositoryError(repository.load(), "unsupported_schema");

    expect(storage.peek(LOCAL_CATALOG_STORAGE_KEY)).toBe(originalValue);
  });

  it.each([
    ["null root", null],
    ["array root", []],
    ["missing containers", { schemaVersion: 1 }],
    ["wrong collection type", { ...createEmptyUserCatalogChanges(), addedAlbums: {} }],
    [
      "invalid nested album",
      { ...createEmptyUserCatalogChanges(), addedAlbums: [{ id: "incomplete" }] }
    ],
    [
      "invalid override map",
      { ...createEmptyUserCatalogChanges(), albumOverrides: [] }
    ],
    [
      "invalid track addition",
      {
        ...createEmptyUserCatalogChanges(),
        albumTrackIdAdditions: { album_sample_001: [1] }
      }
    ],
    [
      "unexpected media field",
      { ...createEmptyUserCatalogChanges(), audioUrl: "https://example.invalid/a.mp3" }
    ]
  ])("rejects invalid stored data: %s", async (_label, value) => {
    const storage = new MemoryStorage();
    const originalValue = JSON.stringify(value);
    storage.setItem(LOCAL_CATALOG_STORAGE_KEY, originalValue);
    const repository = createLocalStorageCatalogRepository(storage);

    await expectRepositoryError(repository.load(), "invalid_data");

    expect(storage.peek(LOCAL_CATALOG_STORAGE_KEY)).toBe(originalValue);
  });

  it("wraps storage read failures without attempting recovery writes", async () => {
    const storage = new MemoryStorage();
    const originalValue = JSON.stringify(createCompleteChanges());
    storage.setItem(LOCAL_CATALOG_STORAGE_KEY, originalValue);
    vi.spyOn(storage, "getItem").mockImplementation(() => {
      throw new Error("read denied");
    });
    const setItemSpy = vi.spyOn(storage, "setItem");
    const removeItemSpy = vi.spyOn(storage, "removeItem");
    const repository = createLocalStorageCatalogRepository(storage);

    await expectRepositoryError(repository.load(), "read_failed");

    expect(storage.peek(LOCAL_CATALOG_STORAGE_KEY)).toBe(originalValue);
    expect(setItemSpy).not.toHaveBeenCalled();
    expect(removeItemSpy).not.toHaveBeenCalled();
  });

  it("keeps the previous value when storage rejects a write", async () => {
    const storage = new MemoryStorage();
    const originalValue = "recoverable-original-value";
    storage.setItem(LOCAL_CATALOG_STORAGE_KEY, originalValue);
    vi.spyOn(storage, "setItem").mockImplementation(() => {
      throw new Error("quota exceeded");
    });
    const repository = createLocalStorageCatalogRepository(storage);

    await expectRepositoryError(
      repository.save(createCompleteChanges()),
      "write_failed"
    );

    expect(storage.peek(LOCAL_CATALOG_STORAGE_KEY)).toBe(originalValue);
  });

  it("keeps the previous value when storage rejects a clear", async () => {
    const storage = new MemoryStorage();
    const originalValue = JSON.stringify(createCompleteChanges());
    storage.setItem(LOCAL_CATALOG_STORAGE_KEY, originalValue);
    vi.spyOn(storage, "removeItem").mockImplementation(() => {
      throw new Error("remove denied");
    });
    const repository = createLocalStorageCatalogRepository(storage);

    await expectRepositoryError(repository.clear(), "clear_failed");

    expect(storage.peek(LOCAL_CATALOG_STORAGE_KEY)).toBe(originalValue);
  });

  it("rejects unsafe save values before touching the stored value", async () => {
    const storage = new MemoryStorage();
    const originalValue = JSON.stringify(createEmptyUserCatalogChanges());
    storage.setItem(LOCAL_CATALOG_STORAGE_KEY, originalValue);
    const setItemSpy = vi.spyOn(storage, "setItem");
    const changes = createCompleteChanges();
    const invalidChanges = {
      ...changes,
      addedTracks: [
        {
          ...changes.addedTracks[0],
          audioUrl: "blob:https://example.invalid/local-audio"
        }
      ]
    } as unknown as UserCatalogChanges;
    const repository = createLocalStorageCatalogRepository(storage);

    await expectRepositoryError(repository.save(invalidChanges), "invalid_data");

    expect(storage.peek(LOCAL_CATALOG_STORAGE_KEY)).toBe(originalValue);
    expect(setItemSpy).not.toHaveBeenCalled();
  });

  it.each([
    ["non-finite number", Number.NaN],
    ["negative zero", -0]
  ])("rejects a %s before JSON can change it", async (_label, sortOrder) => {
    const storage = new MemoryStorage();
    const repository = createLocalStorageCatalogRepository(storage);
    const changes = createCompleteChanges();
    changes.addedAlbums[0].sortOrder = sortOrder;

    await expectRepositoryError(repository.save(changes), "invalid_data");

    expect(storage.peek(LOCAL_CATALOG_STORAGE_KEY)).toBeNull();
  });

  it("reports lazy browser storage access failures", async () => {
    const repository = createLocalStorageCatalogRepository(() => {
      throw new Error("localStorage denied");
    });

    await expectRepositoryError(repository.load(), "storage_unavailable");
  });
});
