import { describe, expect, it } from "vitest";

import type { CatalogDeletionIntent } from "../features/catalog/catalogDeletionRepository";
import { createEmptyUserCatalogChanges } from "../features/catalog/catalogMutations";
import {
  createLocalStorageCatalogDeletionIntentRepository,
  LOCAL_CATALOG_DELETION_INTENT_STORAGE_KEY
} from "../infra/storage/localStorageCatalogDeletionIntentRepository";
import { addTrackToPlaylist, createTemporaryPlaylist } from "../utils/playlist";

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
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe("catalog deletion intent storage", () => {
  it("round-trips a recoverable cross-storage deletion without persisting runtime-only fields", async () => {
    const createdAt = "2026-07-18T00:00:00.000Z";
    const playlist = addTrackToPlaylist(
      createTemporaryPlaylist({
        id: "playlist_temp_current",
        name: "临时歌单",
        createdAt
      }),
      {
        trackId: "track_sample_001",
        itemId: "item_sample_001",
        addedAt: createdAt
      }
    );
    const intent: CatalogDeletionIntent = {
      schemaVersion: 1,
      id: "catalog_deletion_test",
      createdAt,
      trackIds: ["track_sample_001"],
      nextCatalogChanges: createEmptyUserCatalogChanges(),
      nextPlaylist: playlist
    };
    const storage = new MemoryStorage();
    const repository = createLocalStorageCatalogDeletionIntentRepository(storage);

    await repository.save(intent);

    expect(storage.getItem(LOCAL_CATALOG_DELETION_INTENT_STORAGE_KEY)).not.toContain(
      "playedCount"
    );
    expect(await repository.load()).toEqual(intent);

    await repository.clear();

    expect(await repository.load()).toBeNull();
  });
});
