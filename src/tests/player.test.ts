import { describe, expect, it } from "vitest";

import { appReducer, createAppState } from "../app/appReducer";
import {
  createPlayerState,
  playerReducer,
  syncPlayerSequence
} from "../features/player/playerReducer";
import type { PlaySequenceEntry, TemporaryPlaylist } from "../types";
import {
  addTrackToPlaylist,
  createTemporaryPlaylist,
  expandPlaylistToPlaySequence,
  updatePlaylistItemRepeatCount
} from "../utils/playlist";

const createdAt = "2026-07-14T00:00:00.000Z";
const updatedAt = "2026-07-14T00:01:00.000Z";

function createEntry(
  queueItemId: string,
  trackId: string,
  repeatIndex = 1,
  repeatTotal = 1
): PlaySequenceEntry {
  return { queueItemId, trackId, repeatIndex, repeatTotal };
}

function createEmptyPlaylist(): TemporaryPlaylist {
  return createTemporaryPlaylist({
    id: "playlist_player_test",
    createdAt
  });
}

describe("player reducer", () => {
  it("represents an empty queue and ignores playback commands safely", () => {
    const state = createPlayerState();

    expect(state).toEqual({
      playSequence: [],
      currentIndex: null,
      currentEntry: null,
      status: "empty",
      playbackRevision: 0
    });

    for (const action of [
      { type: "play" },
      { type: "pause" },
      { type: "next" },
      { type: "previous" },
      { type: "restart-current" },
      { type: "playback-ended" }
    ] as const) {
      expect(playerReducer(state, action)).toBe(state);
    }
  });

  it("starts at the first sequence entry and toggles play and pause", () => {
    const sequence = [
      createEntry("item_001", "track_001"),
      createEntry("item_002", "track_002")
    ];
    const initialState = createPlayerState(sequence);

    expect(initialState.currentIndex).toBe(0);
    expect(initialState.currentEntry).toEqual(sequence[0]);
    expect(initialState.status).toBe("paused");

    const playingState = playerReducer(initialState, { type: "play" });
    expect(playingState.status).toBe("playing");
    expect(playingState.playbackRevision).toBe(0);
    expect(playerReducer(playingState, { type: "play" })).toBe(playingState);

    const pausedState = playerReducer(playingState, { type: "pause" });
    expect(pausedState.status).toBe("paused");
    expect(pausedState.currentEntry).toEqual(sequence[0]);
    expect(playerReducer(pausedState, { type: "pause" })).toBe(pausedState);
  });

  it("moves next and previous and exposes restart requests", () => {
    const sequence = [
      createEntry("item_001", "track_001"),
      createEntry("item_002", "track_002"),
      createEntry("item_003", "track_003")
    ];
    const initialState = createPlayerState(sequence);
    const secondState = playerReducer(initialState, { type: "next" });

    expect(secondState.currentIndex).toBe(1);
    expect(secondState.currentEntry).toEqual(sequence[1]);
    expect(secondState.status).toBe("paused");
    expect(secondState.playbackRevision).toBe(1);

    const restartedState = playerReducer(secondState, {
      type: "restart-current"
    });
    expect(restartedState.currentIndex).toBe(1);
    expect(restartedState.status).toBe("paused");
    expect(restartedState.playbackRevision).toBe(2);

    const firstState = playerReducer(restartedState, { type: "previous" });
    expect(firstState.currentIndex).toBe(0);
    expect(firstState.playbackRevision).toBe(3);

    const restartedFirstState = playerReducer(firstState, { type: "previous" });
    expect(restartedFirstState.currentIndex).toBe(0);
    expect(restartedFirstState.playbackRevision).toBe(4);
  });

  it("advances automatically through an expanded repeatCount sequence", () => {
    const firstAdd = addTrackToPlaylist(createEmptyPlaylist(), {
      trackId: "track_001",
      itemId: "item_001",
      addedAt: updatedAt
    });
    const repeated = updatePlaylistItemRepeatCount(firstAdd, "item_001", 3, updatedAt);
    const playlist = addTrackToPlaylist(repeated, {
      trackId: "track_002",
      itemId: "item_002",
      addedAt: updatedAt
    });
    const sequence = expandPlaylistToPlaySequence(playlist);
    let state = playerReducer(createPlayerState(sequence), { type: "play" });

    expect(sequence).toHaveLength(4);
    expect(state.currentEntry).toMatchObject({
      trackId: "track_001",
      repeatIndex: 1,
      repeatTotal: 3
    });

    state = playerReducer(state, { type: "playback-ended" });
    expect(state.currentEntry).toMatchObject({
      trackId: "track_001",
      repeatIndex: 2,
      repeatTotal: 3
    });
    expect(state.status).toBe("playing");

    state = playerReducer(state, { type: "playback-ended" });
    expect(state.currentEntry).toMatchObject({
      trackId: "track_001",
      repeatIndex: 3,
      repeatTotal: 3
    });

    state = playerReducer(state, { type: "playback-ended" });
    expect(state.currentEntry).toMatchObject({
      trackId: "track_002",
      repeatIndex: 1,
      repeatTotal: 1
    });

    state = playerReducer(state, { type: "playback-ended" });
    expect(state.status).toBe("ended");
    expect(state.currentIndex).toBe(3);
    expect(state.playSequence).toHaveLength(4);

    state = playerReducer(state, { type: "play" });
    expect(state.status).toBe("playing");
    expect(state.currentIndex).toBe(0);
    expect(state.currentEntry?.repeatIndex).toBe(1);
  });

  it("ignores stale ended events while playback is paused", () => {
    const state = createPlayerState([createEntry("item_001", "track_001")]);

    expect(playerReducer(state, { type: "playback-ended" })).toBe(state);
  });

  it("keeps the same playback occurrence when the sequence is reordered", () => {
    const initialSequence = [
      createEntry("item_001", "track_001", 1, 2),
      createEntry("item_001", "track_001", 2, 2),
      createEntry("item_002", "track_002")
    ];
    const firstState = playerReducer(createPlayerState(initialSequence), {
      type: "play"
    });
    const secondState = playerReducer(firstState, { type: "playback-ended" });
    const reorderedSequence = [
      createEntry("item_002", "track_002"),
      createEntry("item_001", "track_001", 1, 3),
      createEntry("item_001", "track_001", 2, 3),
      createEntry("item_001", "track_001", 3, 3)
    ];
    const reorderedState = syncPlayerSequence(secondState, reorderedSequence);

    expect(reorderedState.currentIndex).toBe(2);
    expect(reorderedState.currentEntry).toEqual(reorderedSequence[2]);
    expect(reorderedState.status).toBe("playing");
    expect(reorderedState.playbackRevision).toBe(secondState.playbackRevision);

    const removedState = syncPlayerSequence(reorderedState, [
      createEntry("item_002", "track_002"),
      createEntry("item_001", "track_001", 1, 1)
    ]);
    expect(removedState.currentIndex).toBe(1);
    expect(removedState.currentEntry?.repeatIndex).toBe(1);
    expect(removedState.playbackRevision).toBe(reorderedState.playbackRevision + 1);

    const emptyState = syncPlayerSequence(removedState, []);
    expect(emptyState.status).toBe("empty");
    expect(emptyState.currentIndex).toBeNull();
    expect(emptyState.currentEntry).toBeNull();
  });

  it("leaves the ended state paused when new entries are appended", () => {
    const firstEntry = createEntry("item_001", "track_001");
    const playingState = playerReducer(createPlayerState([firstEntry]), {
      type: "play"
    });
    const endedState = playerReducer(playingState, { type: "playback-ended" });
    const appendedState = syncPlayerSequence(endedState, [
      firstEntry,
      createEntry("item_002", "track_002")
    ]);

    expect(endedState.status).toBe("ended");
    expect(appendedState.currentIndex).toBe(0);
    expect(appendedState.status).toBe("paused");
  });
});

describe("app player integration", () => {
  it("updates the player sequence atomically with playlist repeatCount", () => {
    const initialState = createAppState(createEmptyPlaylist());
    const addedState = appReducer(initialState, {
      type: "playlist",
      action: {
        type: "add-track",
        trackId: "track_001",
        itemId: "item_001",
        addedAt: updatedAt
      }
    });

    expect(addedState.player.status).toBe("paused");
    expect(addedState.player.playSequence).toHaveLength(1);
    expect(addedState.player.currentEntry?.trackId).toBe("track_001");

    const repeatedState = appReducer(addedState, {
      type: "playlist",
      action: {
        type: "set-repeat-count",
        itemId: "item_001",
        repeatCount: 3,
        updatedAt
      }
    });

    expect(repeatedState.playlist.itemsById.item_001.repeatCount).toBe(3);
    expect(repeatedState.player.playSequence).toHaveLength(3);
    expect(repeatedState.player.currentEntry).toMatchObject({
      repeatIndex: 1,
      repeatTotal: 3
    });

    const playingState = appReducer(repeatedState, {
      type: "player",
      action: { type: "play" }
    });
    const advancedState = appReducer(playingState, {
      type: "player",
      action: { type: "playback-ended" }
    });

    expect(advancedState.player.currentIndex).toBe(1);
    expect(advancedState.player.currentEntry?.repeatIndex).toBe(2);
    expect(advancedState.player.status).toBe("playing");

    const clearedState = appReducer(advancedState, {
      type: "playlist",
      action: { type: "clear", updatedAt }
    });
    expect(clearedState.player.status).toBe("empty");
    expect(clearedState.player.playSequence).toEqual([]);
  });
});
