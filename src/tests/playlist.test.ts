import { describe, expect, it } from "vitest";

import {
  expandPlaylistToPlaySequence,
  moveItem,
  normalizePlayCount
} from "../utils/playlist";
import type { TemporaryPlaylist } from "../types";

const samplePlaylist: TemporaryPlaylist = {
  id: "playlist_temp_current",
  name: "临时歌单",
  itemIds: ["queue_item_001", "queue_item_002"],
  itemsById: {
    queue_item_001: {
      id: "queue_item_001",
      trackId: "track_sample_001",
      playCount: 2,
      playedCount: 0,
      source: "single",
      addedAt: "2026-07-11T00:00:00.000Z"
    },
    queue_item_002: {
      id: "queue_item_002",
      trackId: "track_sample_002",
      playCount: 1,
      playedCount: 0,
      source: "single",
      addedAt: "2026-07-11T00:00:00.000Z"
    }
  },
  createdAt: "2026-07-11T00:00:00.000Z",
  updatedAt: "2026-07-11T00:00:00.000Z"
};

describe("playlist utilities", () => {
  it("expands playlist items according to playCount", () => {
    expect(expandPlaylistToPlaySequence(samplePlaylist)).toEqual([
      {
        queueItemId: "queue_item_001",
        trackId: "track_sample_001",
        repeatIndex: 1,
        repeatTotal: 2
      },
      {
        queueItemId: "queue_item_001",
        trackId: "track_sample_001",
        repeatIndex: 2,
        repeatTotal: 2
      },
      {
        queueItemId: "queue_item_002",
        trackId: "track_sample_002",
        repeatIndex: 1,
        repeatTotal: 1
      }
    ]);
  });

  it("moves item order without mutating the original array", () => {
    const itemIds = ["a", "b", "c"];

    expect(moveItem(itemIds, 2, 0)).toEqual(["c", "a", "b"]);
    expect(itemIds).toEqual(["a", "b", "c"]);
  });

  it("normalizes invalid play counts to the default value", () => {
    expect(normalizePlayCount(0)).toBe(1);
    expect(normalizePlayCount(1.5)).toBe(1);
    expect(normalizePlayCount(100)).toBe(99);
  });
});
