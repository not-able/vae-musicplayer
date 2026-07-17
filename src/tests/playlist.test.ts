import { describe, expect, it } from "vitest";

import {
  PlaylistPersistenceError,
  parseStoredTemporaryPlaylist,
  serializeTemporaryPlaylist,
  type PlaylistPersistenceErrorCode
} from "../features/playlist/playlistPersistence";
import { temporaryPlaylistReducer } from "../features/playlist/playlistReducer";
import {
  TEMPORARY_PLAYLIST_SCHEMA_VERSION,
  type Album,
  type StoredTemporaryPlaylist,
  type TemporaryPlaylist
} from "../types";
import {
  addAlbumToPlaylist,
  addTrackToPlaylist,
  clearTemporaryPlaylist,
  createTemporaryPlaylist,
  expandPlaylistToPlaySequence,
  isValidRepeatCount,
  MAX_REPEAT_COUNT,
  movePlaylistItem,
  normalizeRepeatCount,
  parseRepeatCountInput,
  removePlaylistItem,
  updatePlaylistItemRepeatCount
} from "../utils/playlist";

const createdAt = "2026-07-13T00:00:00.000Z";
const updatedAt = "2026-07-13T00:01:00.000Z";

const sampleAlbum: Album = {
  id: "album_sample",
  artistId: "artist_sample",
  title: "示例专辑",
  type: "album",
  sortOrder: 1,
  trackIds: ["track_002", "track_001"]
};

function createEmptyPlaylist(): TemporaryPlaylist {
  return createTemporaryPlaylist({
    id: "playlist_temp_current",
    createdAt
  });
}

function addSampleTrack(
  playlist: TemporaryPlaylist,
  itemId: string,
  trackId = "track_001"
): TemporaryPlaylist {
  return addTrackToPlaylist(playlist, {
    trackId,
    itemId,
    addedAt: updatedAt
  });
}

function createStoredPlaylist(): StoredTemporaryPlaylist {
  const firstAdd = addSampleTrack(createEmptyPlaylist(), "item_001");
  const secondAdd = addSampleTrack(firstAdd, "item_002");

  return serializeTemporaryPlaylist(
    updatePlaylistItemRepeatCount(secondAdd, "item_001", 3, updatedAt)
  );
}

function expectPersistenceError(
  operation: () => unknown,
  code: PlaylistPersistenceErrorCode
): void {
  try {
    operation();
    throw new Error("Expected playlist persistence operation to fail.");
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(PlaylistPersistenceError);
    expect(error).toMatchObject({
      name: "PlaylistPersistenceError",
      code
    });
  }
}

describe("temporary playlist operations", () => {
  it("creates an empty temporary playlist", () => {
    expect(createEmptyPlaylist()).toEqual({
      id: "playlist_temp_current",
      name: "临时歌单",
      itemIds: [],
      itemsById: {},
      createdAt,
      updatedAt: createdAt
    });
  });

  it("adds a track as an independent item with repeatCount 1", () => {
    const playlist = createEmptyPlaylist();
    const nextPlaylist = addSampleTrack(playlist, "item_001");

    expect(nextPlaylist.itemIds).toEqual(["item_001"]);
    expect(nextPlaylist.itemsById.item_001).toEqual({
      id: "item_001",
      trackId: "track_001",
      repeatCount: 1,
      playedCount: 0,
      source: "single",
      sourceAlbumId: undefined,
      addedAt: updatedAt
    });
    expect(playlist.itemIds).toEqual([]);
  });

  it("adds every album track in the maintained album order", () => {
    const playlist = addSampleTrack(
      createEmptyPlaylist(),
      "item_existing",
      "track_existing"
    );
    const nextPlaylist = addAlbumToPlaylist(playlist, {
      album: sampleAlbum,
      itemIds: ["item_album_001", "item_album_002"],
      addedAt: updatedAt
    });

    expect(nextPlaylist.itemIds).toEqual([
      "item_existing",
      "item_album_001",
      "item_album_002"
    ]);
    expect(nextPlaylist.itemsById.item_album_001).toMatchObject({
      trackId: "track_002",
      repeatCount: 1,
      source: "album",
      sourceAlbumId: "album_sample"
    });
    expect(nextPlaylist.itemsById.item_album_002.trackId).toBe("track_001");
  });

  it("keeps duplicate tracks independent when repeatCount changes", () => {
    const firstAdd = addSampleTrack(createEmptyPlaylist(), "item_001");
    const secondAdd = addSampleTrack(firstAdd, "item_002");
    const nextPlaylist = updatePlaylistItemRepeatCount(
      secondAdd,
      "item_001",
      3,
      updatedAt
    );

    expect(nextPlaylist.itemsById.item_001.repeatCount).toBe(3);
    expect(nextPlaylist.itemsById.item_002.repeatCount).toBe(1);
    expect(secondAdd.itemsById.item_001.repeatCount).toBe(1);
  });

  it("validates and normalizes repeatCount at its supported boundaries", () => {
    expect(isValidRepeatCount(1)).toBe(true);
    expect(isValidRepeatCount(MAX_REPEAT_COUNT)).toBe(true);
    expect(isValidRepeatCount(0)).toBe(false);
    expect(isValidRepeatCount(-1)).toBe(false);
    expect(isValidRepeatCount(1.5)).toBe(false);
    expect(isValidRepeatCount(Number.NaN)).toBe(false);
    expect(isValidRepeatCount(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isValidRepeatCount(MAX_REPEAT_COUNT + 1)).toBe(false);

    expect(normalizeRepeatCount(0)).toBe(1);
    expect(normalizeRepeatCount(-1)).toBe(1);
    expect(normalizeRepeatCount(1.5)).toBe(1);
    expect(normalizeRepeatCount(Number.NaN)).toBe(1);
    expect(normalizeRepeatCount(MAX_REPEAT_COUNT + 1)).toBe(MAX_REPEAT_COUNT);
  });

  it("parses only decimal positive-integer repeatCount input", () => {
    expect(parseRepeatCountInput("1")).toEqual({ isValid: true, value: 1 });
    expect(parseRepeatCountInput(` ${MAX_REPEAT_COUNT} `)).toEqual({
      isValid: true,
      value: MAX_REPEAT_COUNT
    });
    expect(parseRepeatCountInput("03")).toEqual({ isValid: true, value: 3 });

    expect(parseRepeatCountInput("")).toEqual({
      isValid: false,
      reason: "required"
    });
    for (const input of ["0", "-2", "abc", "1.5", "1e1"]) {
      expect(parseRepeatCountInput(input)).toEqual({
        isValid: false,
        reason: "not-positive-integer"
      });
    }
    expect(parseRepeatCountInput(String(MAX_REPEAT_COUNT + 1))).toEqual({
      isValid: false,
      reason: "exceeds-maximum"
    });
  });

  it("rejects invalid repeatCount updates without changing the playlist", () => {
    const playlist = updatePlaylistItemRepeatCount(
      addSampleTrack(createEmptyPlaylist(), "item_001"),
      "item_001",
      3,
      updatedAt
    );

    for (const repeatCount of [
      0,
      -1,
      1.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      MAX_REPEAT_COUNT + 1
    ]) {
      expect(
        updatePlaylistItemRepeatCount(playlist, "item_001", repeatCount, updatedAt)
      ).toBe(playlist);
    }

    expect(playlist.itemsById.item_001.repeatCount).toBe(3);
    expect(expandPlaylistToPlaySequence(playlist)).toHaveLength(3);
  });

  it("removes one playlist item without changing the remaining items", () => {
    const firstAdd = addSampleTrack(createEmptyPlaylist(), "item_001");
    const secondAdd = addSampleTrack(firstAdd, "item_002", "track_002");
    const nextPlaylist = removePlaylistItem(secondAdd, "item_001", updatedAt);

    expect(nextPlaylist.itemIds).toEqual(["item_002"]);
    expect(nextPlaylist.itemsById.item_001).toBeUndefined();
    expect(nextPlaylist.itemsById.item_002.trackId).toBe("track_002");
  });

  it("clears every playlist item", () => {
    const playlist = addSampleTrack(createEmptyPlaylist(), "item_001");
    const nextPlaylist = clearTemporaryPlaylist(playlist, updatedAt);

    expect(nextPlaylist.itemIds).toEqual([]);
    expect(nextPlaylist.itemsById).toEqual({});
  });

  it("moves an item without mutating the previous order", () => {
    const firstAdd = addSampleTrack(createEmptyPlaylist(), "item_001");
    const secondAdd = addSampleTrack(firstAdd, "item_002", "track_002");
    const thirdAdd = addSampleTrack(secondAdd, "item_003", "track_003");
    const nextPlaylist = movePlaylistItem(thirdAdd, "item_003", 0, updatedAt);

    expect(nextPlaylist.itemIds).toEqual(["item_003", "item_001", "item_002"]);
    expect(thirdAdd.itemIds).toEqual(["item_001", "item_002", "item_003"]);
  });

  it("expands repeatCount values into the actual playback sequence", () => {
    const firstAdd = addSampleTrack(createEmptyPlaylist(), "item_001");
    const secondAdd = addSampleTrack(firstAdd, "item_002", "track_002");
    const playlist = updatePlaylistItemRepeatCount(secondAdd, "item_001", 2, updatedAt);

    expect(expandPlaylistToPlaySequence(playlist)).toEqual([
      {
        queueItemId: "item_001",
        trackId: "track_001",
        repeatIndex: 1,
        repeatTotal: 2
      },
      {
        queueItemId: "item_001",
        trackId: "track_001",
        repeatIndex: 2,
        repeatTotal: 2
      },
      {
        queueItemId: "item_002",
        trackId: "track_002",
        repeatIndex: 1,
        repeatTotal: 1
      }
    ]);
  });

  it("applies the same operations through the playlist reducer", () => {
    const addedPlaylist = temporaryPlaylistReducer(createEmptyPlaylist(), {
      type: "add-track",
      trackId: "track_001",
      itemId: "item_001",
      addedAt: updatedAt
    });
    const updatedPlaylist = temporaryPlaylistReducer(addedPlaylist, {
      type: "set-repeat-count",
      itemId: "item_001",
      repeatCount: 4,
      updatedAt
    });

    expect(updatedPlaylist.itemIds).toEqual(["item_001"]);
    expect(updatedPlaylist.itemsById.item_001.repeatCount).toBe(4);
  });
});

describe("temporary playlist invariants", () => {
  it("rejects mismatched or duplicate playlist item IDs", () => {
    const playlist = addSampleTrack(createEmptyPlaylist(), "item_001");

    expect(() =>
      addAlbumToPlaylist(playlist, {
        album: sampleAlbum,
        itemIds: ["only_one_id"],
        addedAt: updatedAt
      })
    ).toThrow("Each album track requires one playlist item ID.");

    expect(() => addSampleTrack(playlist, "item_001", "track_002")).toThrow(
      "Playlist item IDs must be unique."
    );
  });
});

describe("temporary playlist persistence", () => {
  it("round-trips an empty playlist through the versioned snapshot", () => {
    const playlist = createEmptyPlaylist();
    const snapshot = serializeTemporaryPlaylist(playlist);

    expect(snapshot).toEqual({
      schemaVersion: TEMPORARY_PLAYLIST_SCHEMA_VERSION,
      id: "playlist_temp_current",
      name: "临时歌单",
      itemIds: [],
      items: [],
      createdAt,
      updatedAt: createdAt
    });
    expect(parseStoredTemporaryPlaylist(snapshot)).toEqual(playlist);
  });

  it("restores duplicate tracks as independent queue items and repeat counts", () => {
    const snapshot = createStoredPlaylist();
    const restored = parseStoredTemporaryPlaylist(snapshot);

    expect(restored.itemIds).toEqual(["item_001", "item_002"]);
    expect(restored.itemsById.item_001).toMatchObject({
      id: "item_001",
      trackId: "track_001",
      repeatCount: 3,
      playedCount: 0
    });
    expect(restored.itemsById.item_002).toMatchObject({
      id: "item_002",
      trackId: "track_001",
      repeatCount: 1,
      playedCount: 0
    });
  });

  it("accepts the supported repeatCount boundaries without normalizing them", () => {
    const snapshot = createStoredPlaylist();
    snapshot.items[0].repeatCount = 99;

    const restored = parseStoredTemporaryPlaylist(snapshot);

    expect(restored.itemsById.item_001.repeatCount).toBe(99);
    expect(restored.itemsById.item_002.repeatCount).toBe(1);
  });

  it("round-trips a populated snapshot through JSON", () => {
    const playlist = parseStoredTemporaryPlaylist(createStoredPlaylist());
    const serializedSnapshot = JSON.stringify(serializeTemporaryPlaylist(playlist));

    expect(parseStoredTemporaryPlaylist(JSON.parse(serializedSnapshot))).toEqual(
      playlist
    );
  });

  it("persists only the queue source data and resets playback progress", () => {
    const playlist = addSampleTrack(createEmptyPlaylist(), "item_001");
    const localFile = new File(["self-created test bytes"], "test.mp3", {
      type: "audio/mpeg"
    });
    const runtimeWithTransientState = {
      ...playlist,
      isPlaying: true,
      playbackToken: "runtime-token",
      playSequence: [
        {
          queueItemId: "item_001",
          trackId: "track_001",
          repeatIndex: 1,
          repeatTotal: 1
        }
      ],
      file: localFile,
      itemsById: {
        item_001: {
          ...playlist.itemsById.item_001,
          playedCount: 1,
          objectUrl: "blob:https://example.invalid/runtime-audio",
          playbackToken: "item-runtime-token",
          file: localFile
        }
      }
    } as TemporaryPlaylist;

    const snapshot = serializeTemporaryPlaylist(runtimeWithTransientState);
    const serializedSnapshot = JSON.stringify(snapshot);

    expect(Object.keys(snapshot)).toEqual([
      "schemaVersion",
      "id",
      "name",
      "itemIds",
      "items",
      "createdAt",
      "updatedAt"
    ]);
    expect(Object.keys(snapshot.items[0])).toEqual([
      "id",
      "trackId",
      "repeatCount",
      "source",
      "addedAt"
    ]);
    expect(serializedSnapshot).not.toContain("playedCount");
    expect(serializedSnapshot).not.toContain("playSequence");
    expect(serializedSnapshot).not.toContain("isPlaying");
    expect(serializedSnapshot).not.toContain("playbackToken");
    expect(serializedSnapshot).not.toContain("objectUrl");
    expect(serializedSnapshot).not.toContain("test.mp3");
    expect(parseStoredTemporaryPlaylist(snapshot).itemsById.item_001.playedCount).toBe(
      0
    );
  });

  it("does not require the current catalog when parsing track IDs", () => {
    const snapshot = createStoredPlaylist();
    snapshot.items[0].trackId = "track_not_in_current_catalog";

    expect(parseStoredTemporaryPlaylist(snapshot).itemsById.item_001.trackId).toBe(
      "track_not_in_current_catalog"
    );
  });

  it.each([
    0,
    -0,
    -1,
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.MAX_SAFE_INTEGER + 1,
    100,
    "1"
  ])("rejects invalid repeatCount %s", (repeatCount) => {
    const snapshot = createStoredPlaylist();
    const damagedSnapshot = {
      ...snapshot,
      items: snapshot.items.map((item, index) =>
        index === 0 ? { ...item, repeatCount } : item
      )
    };

    expectPersistenceError(
      () => parseStoredTemporaryPlaylist(damagedSnapshot),
      "invalid_data"
    );
  });

  it("rejects duplicate queue item IDs in the order and item collection", () => {
    const duplicateOrder = createStoredPlaylist();
    duplicateOrder.itemIds[1] = "item_001";

    expectPersistenceError(
      () => parseStoredTemporaryPlaylist(duplicateOrder),
      "invalid_data"
    );

    const duplicateItems = createStoredPlaylist();
    duplicateItems.items[1].id = "item_001";

    expectPersistenceError(
      () => parseStoredTemporaryPlaylist(duplicateItems),
      "invalid_data"
    );
  });

  it("rejects missing and orphaned order references", () => {
    const missingItem = createStoredPlaylist();
    missingItem.items = missingItem.items.slice(0, 1);

    expectPersistenceError(
      () => parseStoredTemporaryPlaylist(missingItem),
      "invalid_data"
    );

    const orphanedItem = createStoredPlaylist();
    orphanedItem.itemIds = orphanedItem.itemIds.slice(0, 1);

    expectPersistenceError(
      () => parseStoredTemporaryPlaylist(orphanedItem),
      "invalid_data"
    );
  });

  it("rejects unknown versions distinctly from malformed version fields", () => {
    const unknownVersion = {
      ...createStoredPlaylist(),
      schemaVersion: TEMPORARY_PLAYLIST_SCHEMA_VERSION + 1
    };

    expectPersistenceError(
      () => parseStoredTemporaryPlaylist(unknownVersion),
      "unsupported_schema"
    );

    for (const schemaVersion of [
      "1",
      0,
      -1,
      1.5,
      Number.NaN,
      Number.POSITIVE_INFINITY
    ]) {
      expectPersistenceError(
        () =>
          parseStoredTemporaryPlaylist({
            ...createStoredPlaylist(),
            schemaVersion
          }),
        "invalid_data"
      );
    }
  });

  it.each([
    ["null root", null],
    ["array root", []],
    ["missing item collection", { ...createStoredPlaylist(), items: undefined }],
    ["unexpected root field", { ...createStoredPlaylist(), isPlaying: false }],
    [
      "unexpected item field",
      {
        ...createStoredPlaylist(),
        items: createStoredPlaylist().items.map((item, index) =>
          index === 0
            ? {
                ...item,
                objectUrl: "blob:https://example.invalid/runtime-audio"
              }
            : item
        )
      }
    ],
    ["invalid timestamp", { ...createStoredPlaylist(), updatedAt: "not-a-date" }]
  ])("rejects damaged or unknown snapshot structure: %s", (_label, value) => {
    expectPersistenceError(() => parseStoredTemporaryPlaylist(value), "invalid_data");
  });

  it("rejects inconsistent runtime queue maps before serialization", () => {
    const playlist = addSampleTrack(createEmptyPlaylist(), "item_001");
    const missingItem = {
      ...playlist,
      itemsById: {}
    };
    const mismatchedItemId = {
      ...playlist,
      itemsById: {
        item_001: {
          ...playlist.itemsById.item_001,
          id: "item_other"
        }
      }
    };

    expectPersistenceError(
      () => serializeTemporaryPlaylist(missingItem),
      "invalid_data"
    );
    expectPersistenceError(
      () => serializeTemporaryPlaylist(mismatchedItemId),
      "invalid_data"
    );

    expectPersistenceError(
      () =>
        serializeTemporaryPlaylist({
          ...playlist,
          itemIds: ["item_001", "item_001"]
        }),
      "invalid_data"
    );
  });

  it("returns independent snapshots and restored runtime objects", () => {
    const firstAdd = addSampleTrack(createEmptyPlaylist(), "item_001");
    const secondAdd = addSampleTrack(firstAdd, "item_002", "track_002");
    const playlist = updatePlaylistItemRepeatCount(secondAdd, "item_001", 3, updatedAt);
    const playlistBeforeSerialization = structuredClone(playlist);
    const snapshot = serializeTemporaryPlaylist(playlist);

    snapshot.itemIds.reverse();
    snapshot.items[0].repeatCount = 1;

    expect(playlist).toEqual(playlistBeforeSerialization);

    const freshSnapshot = serializeTemporaryPlaylist(playlist);
    const snapshotBeforeParsing = structuredClone(freshSnapshot);
    const restored = parseStoredTemporaryPlaylist(freshSnapshot);

    expect(freshSnapshot).toEqual(snapshotBeforeParsing);

    restored.itemIds.length = 0;
    restored.itemsById.item_001.repeatCount = 2;

    expect(freshSnapshot).toEqual(snapshotBeforeParsing);
    expect(freshSnapshot.itemIds).toEqual(["item_001", "item_002"]);
    expect(freshSnapshot.items[0].repeatCount).toBe(3);
  });
});
