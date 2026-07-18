import { describe, expect, it } from "vitest";

import { appReducer, createAppState, type AppState } from "../app/appReducer";
import {
  createPlayerState,
  playerReducer,
  syncPlayerSequence,
  type PlayerState
} from "../features/player/playerReducer";
import type { PlaySequenceEntry, TemporaryPlaylist } from "../types";
import {
  addTrackToPlaylist,
  createTemporaryPlaylist,
  expandPlaylistToPlaySequence,
  removeTracksFromTemporaryPlaylist,
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

function finishCurrentSource(state: PlayerState): PlayerState {
  return playerReducer(state, {
    type: "playback-ended",
    playbackRevision: state.playbackRevision
  });
}

function finishCurrentAppSource(state: AppState): AppState {
  return appReducer(state, {
    type: "player",
    action: {
      type: "playback-ended",
      playbackRevision: state.player.playbackRevision
    }
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
      { type: "playback-ended", playbackRevision: 0 }
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

    state = finishCurrentSource(state);
    expect(state.currentEntry).toMatchObject({
      trackId: "track_001",
      repeatIndex: 2,
      repeatTotal: 3
    });
    expect(state.status).toBe("playing");

    state = finishCurrentSource(state);
    expect(state.currentEntry).toMatchObject({
      trackId: "track_001",
      repeatIndex: 3,
      repeatTotal: 3
    });

    state = finishCurrentSource(state);
    expect(state.currentEntry).toMatchObject({
      trackId: "track_002",
      repeatIndex: 1,
      repeatTotal: 1
    });

    state = finishCurrentSource(state);
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

    expect(
      playerReducer(state, {
        type: "playback-ended",
        playbackRevision: state.playbackRevision
      })
    ).toBe(state);
  });

  it("ignores an ended event from an earlier playback revision", () => {
    const playingState = playerReducer(
      createPlayerState([
        createEntry("item_001", "track_001"),
        createEntry("item_002", "track_002"),
        createEntry("item_003", "track_003")
      ]),
      { type: "play" }
    );
    const stalePlaybackRevision = playingState.playbackRevision;
    const switchedState = playerReducer(playingState, { type: "next" });

    expect(switchedState.playbackRevision).toBe(stalePlaybackRevision + 1);
    expect(
      playerReducer(switchedState, {
        type: "playback-ended",
        playbackRevision: stalePlaybackRevision
      })
    ).toBe(switchedState);
  });

  it("accepts a current ended event only once", () => {
    const playingState = playerReducer(
      createPlayerState([
        createEntry("item_001", "track_001"),
        createEntry("item_002", "track_002"),
        createEntry("item_003", "track_003")
      ]),
      { type: "play" }
    );
    const endedAction = {
      type: "playback-ended",
      playbackRevision: playingState.playbackRevision
    } as const;
    const advancedState = playerReducer(playingState, endedAction);

    expect(advancedState.currentIndex).toBe(1);
    expect(advancedState.status).toBe("playing");
    expect(advancedState.playbackRevision).toBe(playingState.playbackRevision + 1);
    expect(playerReducer(advancedState, endedAction)).toBe(advancedState);
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
    const secondState = finishCurrentSource(firstState);
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

    const emptyState = syncPlayerSequence(reorderedState, []);
    expect(emptyState.status).toBe("empty");
    expect(emptyState.currentIndex).toBeNull();
    expect(emptyState.currentEntry).toBeNull();
  });

  it("leaves the ended state paused when new entries are appended", () => {
    const firstEntry = createEntry("item_001", "track_001");
    const playingState = playerReducer(createPlayerState([firstEntry]), {
      type: "play"
    });
    const endedState = finishCurrentSource(playingState);
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
  it("hydrates playlist and player atomically at the first paused occurrence", () => {
    const previousPlaylist = addTrackToPlaylist(createEmptyPlaylist(), {
      trackId: "track_previous",
      itemId: "item_previous",
      addedAt: updatedAt
    });
    const previousState = appReducer(createAppState(previousPlaylist), {
      type: "player",
      action: { type: "play" }
    });
    let restoredPlaylist = addTrackToPlaylist(createEmptyPlaylist(), {
      trackId: "track_restored_a",
      itemId: "item_restored_a",
      addedAt: updatedAt
    });
    restoredPlaylist = updatePlaylistItemRepeatCount(
      restoredPlaylist,
      "item_restored_a",
      3,
      updatedAt
    );
    restoredPlaylist = addTrackToPlaylist(restoredPlaylist, {
      trackId: "track_restored_b",
      itemId: "item_restored_b",
      addedAt: updatedAt
    });

    const hydratedState = appReducer(previousState, {
      type: "hydrate-playlist",
      playlist: restoredPlaylist
    });

    expect(previousState.player.status).toBe("playing");
    expect(hydratedState.playlist).toBe(restoredPlaylist);
    expect(hydratedState.player.playSequence).toEqual(
      expandPlaylistToPlaySequence(restoredPlaylist)
    );
    expect(hydratedState.player.playSequence).toHaveLength(4);
    expect(hydratedState.player.currentIndex).toBe(0);
    expect(hydratedState.player.currentEntry).toMatchObject({
      queueItemId: "item_restored_a",
      trackId: "track_restored_a",
      repeatIndex: 1,
      repeatTotal: 3
    });
    expect(hydratedState.player.status).toBe("paused");
    expect(hydratedState.player.playbackRevision).toBe(0);
  });

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
    const advancedState = finishCurrentAppSource(playingState);

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

  it("continues with the first surviving occurrence after repeatCount shrinks", () => {
    let playlist = addTrackToPlaylist(createEmptyPlaylist(), {
      trackId: "track_a",
      itemId: "item_a",
      addedAt: updatedAt
    });
    playlist = updatePlaylistItemRepeatCount(playlist, "item_a", 3, updatedAt);
    playlist = addTrackToPlaylist(playlist, {
      trackId: "track_b",
      itemId: "item_b",
      addedAt: updatedAt
    });
    playlist = addTrackToPlaylist(playlist, {
      trackId: "track_c",
      itemId: "item_c",
      addedAt: updatedAt
    });

    let state = createAppState(playlist);
    state = appReducer(state, {
      type: "player",
      action: { type: "play" }
    });
    state = finishCurrentAppSource(state);
    state = finishCurrentAppSource(state);

    expect(state.player.currentEntry).toMatchObject({
      queueItemId: "item_a",
      repeatIndex: 3
    });

    const syncedState = appReducer(state, {
      type: "playlist",
      action: {
        type: "set-repeat-count",
        itemId: "item_a",
        repeatCount: 1,
        updatedAt
      }
    });

    expect(syncedState.player.currentEntry).toMatchObject({
      queueItemId: "item_b",
      trackId: "track_b"
    });
    expect(syncedState.player.currentIndex).toBe(1);
    expect(syncedState.player.status).toBe("playing");
    expect(syncedState.player.playbackRevision).toBe(state.player.playbackRevision + 1);
  });

  it("continues after a removed middle item without skipping a survivor", () => {
    let playlist = addTrackToPlaylist(createEmptyPlaylist(), {
      trackId: "track_a",
      itemId: "item_a",
      addedAt: updatedAt
    });
    playlist = addTrackToPlaylist(playlist, {
      trackId: "track_b",
      itemId: "item_b",
      addedAt: updatedAt
    });
    playlist = updatePlaylistItemRepeatCount(playlist, "item_b", 2, updatedAt);
    playlist = addTrackToPlaylist(playlist, {
      trackId: "track_c",
      itemId: "item_c",
      addedAt: updatedAt
    });
    playlist = addTrackToPlaylist(playlist, {
      trackId: "track_d",
      itemId: "item_d",
      addedAt: updatedAt
    });

    let state = createAppState(playlist);
    state = appReducer(state, {
      type: "player",
      action: { type: "play" }
    });
    state = finishCurrentAppSource(state);
    state = finishCurrentAppSource(state);

    expect(state.player.currentEntry).toMatchObject({
      queueItemId: "item_b",
      repeatIndex: 2
    });

    const syncedState = appReducer(state, {
      type: "playlist",
      action: { type: "remove-item", itemId: "item_b", updatedAt }
    });

    expect(syncedState.player.currentEntry).toMatchObject({
      queueItemId: "item_c",
      trackId: "track_c"
    });
    expect(syncedState.player.currentIndex).toBe(1);
    expect(syncedState.player.status).toBe("playing");
  });

  it("ends when the removed current item has no surviving successor", () => {
    let playlist = addTrackToPlaylist(createEmptyPlaylist(), {
      trackId: "track_a",
      itemId: "item_a",
      addedAt: updatedAt
    });
    playlist = addTrackToPlaylist(playlist, {
      trackId: "track_b",
      itemId: "item_b",
      addedAt: updatedAt
    });

    let state = createAppState(playlist);
    state = appReducer(state, {
      type: "player",
      action: { type: "play" }
    });
    state = finishCurrentAppSource(state);

    expect(state.player.currentEntry?.queueItemId).toBe("item_b");

    const syncedState = appReducer(state, {
      type: "playlist",
      action: { type: "remove-item", itemId: "item_b", updatedAt }
    });

    expect(syncedState.player.status).toBe("ended");
    expect(syncedState.player.currentIndex).toBe(0);
    expect(syncedState.player.currentEntry?.queueItemId).toBe("item_a");
    expect(syncedState.player.playbackRevision).toBe(state.player.playbackRevision + 1);
  });

  it("keeps the current occurrence through a real move-item action", () => {
    let playlist = addTrackToPlaylist(createEmptyPlaylist(), {
      trackId: "track_a",
      itemId: "item_a",
      addedAt: updatedAt
    });
    playlist = addTrackToPlaylist(playlist, {
      trackId: "track_b",
      itemId: "item_b",
      addedAt: updatedAt
    });
    playlist = addTrackToPlaylist(playlist, {
      trackId: "track_c",
      itemId: "item_c",
      addedAt: updatedAt
    });

    let state = createAppState(playlist);
    state = appReducer(state, {
      type: "player",
      action: { type: "next" }
    });
    const revisionBeforeMove = state.player.playbackRevision;

    const movedState = appReducer(state, {
      type: "playlist",
      action: { type: "move-item", itemId: "item_b", toIndex: 0, updatedAt }
    });

    expect(movedState.playlist.itemIds).toEqual(["item_b", "item_a", "item_c"]);
    expect(movedState.player.currentIndex).toBe(0);
    expect(movedState.player.currentEntry?.queueItemId).toBe("item_b");
    expect(movedState.player.status).toBe("paused");
    expect(movedState.player.playbackRevision).toBe(revisionBeforeMove);
  });

  it("continues playing in the reordered sequence after move-item", () => {
    let playlist = addTrackToPlaylist(createEmptyPlaylist(), {
      trackId: "track_a",
      itemId: "item_a",
      addedAt: updatedAt
    });
    playlist = addTrackToPlaylist(playlist, {
      trackId: "track_b",
      itemId: "item_b",
      addedAt: updatedAt
    });
    playlist = addTrackToPlaylist(playlist, {
      trackId: "track_c",
      itemId: "item_c",
      addedAt: updatedAt
    });

    let state = createAppState(playlist);
    state = appReducer(state, {
      type: "player",
      action: { type: "play" }
    });
    state = finishCurrentAppSource(state);

    const movedState = appReducer(state, {
      type: "playlist",
      action: { type: "move-item", itemId: "item_a", toIndex: 2, updatedAt }
    });

    expect(movedState.playlist.itemIds).toEqual(["item_b", "item_c", "item_a"]);
    expect(movedState.player.currentEntry?.queueItemId).toBe("item_b");
    expect(movedState.player.status).toBe("playing");

    const advancedState = finishCurrentAppSource(movedState);

    expect(advancedState.player.currentEntry?.queueItemId).toBe("item_c");
    expect(advancedState.player.status).toBe("playing");
  });

  it("stops at the first surviving item when catalog deletion removes the current source", () => {
    let playlist = addTrackToPlaylist(createEmptyPlaylist(), {
      trackId: "track_a",
      itemId: "item_a",
      addedAt: updatedAt
    });
    playlist = addTrackToPlaylist(playlist, {
      trackId: "track_b",
      itemId: "item_b",
      addedAt: updatedAt
    });
    playlist = addTrackToPlaylist(playlist, {
      trackId: "track_c",
      itemId: "item_c",
      addedAt: updatedAt
    });

    let state = createAppState(playlist);
    state = appReducer(state, { type: "player", action: { type: "next" } });
    state = appReducer(state, { type: "player", action: { type: "play" } });
    const revisionBeforeDeletion = state.player.playbackRevision;
    const nextPlaylist = removeTracksFromTemporaryPlaylist(
      playlist,
      new Set(["track_b"]),
      updatedAt
    );

    const deletedState = appReducer(state, {
      type: "replace-playlist-after-catalog-deletion",
      playlist: nextPlaylist,
      removedTrackIds: ["track_b"]
    });

    expect(deletedState.playlist.itemIds).toEqual(["item_a", "item_c"]);
    expect(deletedState.player.currentEntry?.queueItemId).toBe("item_a");
    expect(deletedState.player.currentIndex).toBe(0);
    expect(deletedState.player.status).toBe("paused");
    expect(deletedState.player.playbackRevision).toBe(revisionBeforeDeletion + 1);
  });
});
