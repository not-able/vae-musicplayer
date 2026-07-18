import type { PlaySequenceEntry } from "../../types";

export type PlayerStatus = "empty" | "paused" | "playing" | "ended";

export interface PlayerState {
  playSequence: readonly PlaySequenceEntry[];
  currentIndex: number | null;
  currentEntry: PlaySequenceEntry | null;
  status: PlayerStatus;
  playbackRevision: number;
}

export type PlayerAction =
  | { type: "play" }
  | { type: "pause" }
  | { type: "next" }
  | { type: "previous" }
  | { type: "restart-current" }
  | { type: "playback-ended"; playbackRevision: number };

export function createPlayerState(
  playSequence: readonly PlaySequenceEntry[] = []
): PlayerState {
  if (playSequence.length === 0) {
    return createEmptyPlayerState();
  }

  const nextSequence = [...playSequence];

  return {
    playSequence: nextSequence,
    currentIndex: 0,
    currentEntry: nextSequence[0],
    status: "paused",
    playbackRevision: 0
  };
}

export function playerReducer(state: PlayerState, action: PlayerAction): PlayerState {
  switch (action.type) {
    case "play":
      return play(state);
    case "pause":
      return pause(state);
    case "next":
      return moveToNext(state);
    case "previous":
      return moveToPrevious(state);
    case "restart-current":
      return restartCurrent(state);
    case "playback-ended":
      return handlePlaybackEnded(state, action.playbackRevision);
  }
}

export function syncPlayerSequence(
  state: PlayerState,
  playSequence: readonly PlaySequenceEntry[]
): PlayerState {
  const nextSequence = [...playSequence];

  if (nextSequence.length === 0) {
    if (state.status === "empty" && state.playSequence.length === 0) {
      return state;
    }

    return {
      ...createEmptyPlayerState(),
      playbackRevision: state.playbackRevision + 1
    };
  }

  if (!state.currentEntry || state.currentIndex === null) {
    return {
      playSequence: nextSequence,
      currentIndex: 0,
      currentEntry: nextSequence[0],
      status: "paused",
      playbackRevision: state.playbackRevision
    };
  }

  const currentEntry = state.currentEntry;
  const currentIndex = state.currentIndex;
  const matchingIndex = nextSequence.findIndex((entry) =>
    isSamePlaybackOccurrence(entry, currentEntry)
  );
  const nextIndex =
    matchingIndex === -1
      ? findFirstSurvivingOccurrenceIndex(
          state.playSequence,
          currentIndex,
          nextSequence
        )
      : matchingIndex;

  if (nextIndex === -1) {
    const finalIndex = nextSequence.length - 1;

    return {
      playSequence: nextSequence,
      currentIndex: finalIndex,
      currentEntry: nextSequence[finalIndex],
      status: "ended",
      playbackRevision: state.playbackRevision + 1
    };
  }

  const nextEntry = nextSequence[nextIndex];
  const currentEntryChanged = !isSamePlaybackOccurrence(nextEntry, currentEntry);
  const status = reconcileStatusAfterSequenceChange(
    state.status,
    nextIndex,
    nextSequence.length
  );

  return {
    playSequence: nextSequence,
    currentIndex: nextIndex,
    currentEntry: nextEntry,
    status,
    playbackRevision: state.playbackRevision + (currentEntryChanged ? 1 : 0)
  };
}

export function stopPlayerAfterCurrentEntryRemoved(
  state: PlayerState,
  playSequence: readonly PlaySequenceEntry[]
): PlayerState {
  const nextSequence = [...playSequence];

  if (nextSequence.length === 0) {
    return {
      ...createEmptyPlayerState(),
      playbackRevision: state.playbackRevision + 1
    };
  }

  return {
    playSequence: nextSequence,
    currentIndex: 0,
    currentEntry: nextSequence[0],
    status: "paused",
    playbackRevision: state.playbackRevision + 1
  };
}

export function isPlayerEmpty(state: PlayerState): boolean {
  return state.status === "empty";
}

function createEmptyPlayerState(): PlayerState {
  return {
    playSequence: [],
    currentIndex: null,
    currentEntry: null,
    status: "empty",
    playbackRevision: 0
  };
}

function play(state: PlayerState): PlayerState {
  if (state.status === "empty" || state.status === "playing") {
    return state;
  }

  if (state.status === "ended") {
    return moveToIndex(state, 0, "playing");
  }

  return { ...state, status: "playing" };
}

function pause(state: PlayerState): PlayerState {
  if (state.status !== "playing") {
    return state;
  }

  return { ...state, status: "paused" };
}

function moveToNext(state: PlayerState): PlayerState {
  if (state.currentIndex === null || state.status === "empty") {
    return state;
  }

  const nextIndex = state.currentIndex + 1;

  if (nextIndex >= state.playSequence.length) {
    return state.status === "ended" ? state : { ...state, status: "ended" };
  }

  return moveToIndex(
    state,
    nextIndex,
    state.status === "ended" ? "paused" : state.status
  );
}

function moveToPrevious(state: PlayerState): PlayerState {
  if (state.currentIndex === null || state.status === "empty") {
    return state;
  }

  return moveToIndex(
    state,
    Math.max(0, state.currentIndex - 1),
    state.status === "ended" ? "paused" : state.status
  );
}

function restartCurrent(state: PlayerState): PlayerState {
  if (state.currentIndex === null || state.status === "empty") {
    return state;
  }

  return {
    ...state,
    status: state.status === "ended" ? "paused" : state.status,
    playbackRevision: state.playbackRevision + 1
  };
}

function handlePlaybackEnded(
  state: PlayerState,
  playbackRevision: number
): PlayerState {
  if (
    state.status !== "playing" ||
    state.currentIndex === null ||
    playbackRevision !== state.playbackRevision
  ) {
    return state;
  }

  const nextIndex = state.currentIndex + 1;

  if (nextIndex >= state.playSequence.length) {
    return { ...state, status: "ended" };
  }

  return moveToIndex(state, nextIndex, "playing");
}

function moveToIndex(
  state: PlayerState,
  index: number,
  status: PlayerStatus
): PlayerState {
  const currentEntry = state.playSequence[index];

  if (!currentEntry) {
    return state;
  }

  return {
    ...state,
    currentIndex: index,
    currentEntry,
    status,
    playbackRevision: state.playbackRevision + 1
  };
}

function isSamePlaybackOccurrence(
  first: PlaySequenceEntry,
  second: PlaySequenceEntry
): boolean {
  return (
    first.queueItemId === second.queueItemId &&
    first.trackId === second.trackId &&
    first.repeatIndex === second.repeatIndex &&
    first.sourcePlaylistId === second.sourcePlaylistId
  );
}

function findFirstSurvivingOccurrenceIndex(
  previousSequence: readonly PlaySequenceEntry[],
  currentIndex: number,
  nextSequence: readonly PlaySequenceEntry[]
): number {
  for (let index = currentIndex + 1; index < previousSequence.length; index += 1) {
    const previousEntry = previousSequence[index];
    const survivingIndex = nextSequence.findIndex((nextEntry) =>
      isSamePlaybackOccurrence(nextEntry, previousEntry)
    );

    if (survivingIndex !== -1) {
      return survivingIndex;
    }
  }

  return -1;
}

function reconcileStatusAfterSequenceChange(
  status: PlayerStatus,
  currentIndex: number,
  sequenceLength: number
): PlayerStatus {
  if (status !== "ended") {
    return status;
  }

  return currentIndex === sequenceLength - 1 ? "ended" : "paused";
}
