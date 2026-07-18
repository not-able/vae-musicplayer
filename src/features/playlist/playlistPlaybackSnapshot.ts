import type {
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
  selection: PlaylistSelection
): PlaylistPlaybackSnapshot {
  return {
    source:
      selection.kind === "temporary"
        ? { kind: "temporary-playlist" }
        : { kind: "saved-playlist", playlistId: selection.playlistId },
    playSequence: expandPlaylistToPlaySequence(playlist).map((entry) => ({
      ...entry,
      sourcePlaylistId: playlist.id
    }))
  };
}
