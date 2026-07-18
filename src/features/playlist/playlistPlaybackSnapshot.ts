import type {
  EntityId,
  PlaybackSource,
  PlaySequenceEntry,
  PlaylistDocument,
  PlaylistSelection
} from "../../types";
import { expandPlaylistToPlaySequence } from "../../utils/playlist";

export interface PlaylistPlaybackSnapshot {
  source: PlaybackSource;
  playSequence: readonly PlaySequenceEntry[];
}

export function createPlaylistPlaybackSnapshot(
  playlist: PlaylistDocument,
  selection: PlaylistSelection,
  startItemId?: EntityId
): PlaylistPlaybackSnapshot {
  const playSequence = expandPlaylistToPlaySequence(playlist).map((entry) => ({
    ...entry,
    sourcePlaylistId: playlist.id
  }));
  const startIndex = startItemId
    ? playSequence.findIndex((entry) => entry.queueItemId === startItemId)
    : 0;

  if (startIndex === -1) {
    throw new Error(
      "The requested playlist item does not exist in the playback snapshot."
    );
  }

  return {
    source:
      selection.kind === "temporary"
        ? { kind: "temporary-playlist" }
        : { kind: "saved-playlist", playlistId: selection.playlistId },
    playSequence: playSequence.slice(startIndex)
  };
}

export function createSingleTrackPlaybackSnapshot(
  trackId: EntityId
): PlaylistPlaybackSnapshot {
  return {
    source: { kind: "album-track-preview", trackId },
    playSequence: [
      {
        queueItemId: `album-track-preview:${trackId}`,
        trackId,
        repeatIndex: 1,
        repeatTotal: 1
      }
    ]
  };
}
