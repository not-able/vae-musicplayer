import {
  createPlayerState,
  playerReducer,
  stopPlayerAfterCurrentEntryRemoved,
  syncPlayerSequence,
  type PlayerAction,
  type PlayerState
} from "../features/player/playerReducer";
import {
  getSelectedPlaylist,
  selectPlaylist
} from "../features/playlist/playlistLibrary";
import { createPlaylistPlaybackSnapshot } from "../features/playlist/playlistPlaybackSnapshot";
import {
  temporaryPlaylistReducer,
  type TemporaryPlaylistAction
} from "../features/playlist/playlistReducer";
import type {
  EntityId,
  PlaybackSource,
  PlaylistLibrary,
  PlaylistSelection,
  TemporaryPlaylist
} from "../types";
import { createPlaylistLibrary } from "../features/playlist/playlistLibrary";

export interface AppState {
  playlistLibrary: PlaylistLibrary;
  selectedPlaylist: PlaylistSelection;
  // Kept as the selected document while the existing panel is still temporary-playlist UI.
  playlist: TemporaryPlaylist;
  player: PlayerState;
  playbackSource: PlaybackSource | null;
}

export type AppAction =
  | { type: "hydrate-playlist"; playlist: TemporaryPlaylist }
  | { type: "hydrate-playlist-library"; library: PlaylistLibrary }
  | {
      type: "replace-playlist-after-catalog-deletion";
      playlist: TemporaryPlaylist;
      removedTrackIds: readonly EntityId[];
    }
  | {
      type: "replace-playlist-library-after-catalog-deletion";
      library: PlaylistLibrary;
      removedTrackIds: readonly EntityId[];
    }
  | { type: "select-playlist"; selection: PlaylistSelection }
  | { type: "start-playback-from-selection"; autoplay?: boolean }
  | { type: "playlist"; action: TemporaryPlaylistAction }
  | { type: "player"; action: PlayerAction };

export function createAppState(
  playlistOrLibrary: TemporaryPlaylist | PlaylistLibrary
): AppState {
  const playlistLibrary = isPlaylistLibrary(playlistOrLibrary)
    ? playlistOrLibrary
    : createPlaylistLibrary({ temporaryPlaylist: playlistOrLibrary });
  const selectedPlaylist: PlaylistSelection = { kind: "temporary" };
  const playlist = getSelectedPlaylist(playlistLibrary, selectedPlaylist);
  const snapshot = createPlaylistPlaybackSnapshot(playlist, selectedPlaylist);

  return {
    playlistLibrary,
    selectedPlaylist,
    playlist,
    player: createPlayerState(snapshot.playSequence),
    playbackSource: snapshot.source
  };
}

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "hydrate-playlist":
      return createAppState(action.playlist);
    case "hydrate-playlist-library":
      return createHydratedAppState(action.library);
    case "replace-playlist-after-catalog-deletion":
      return replaceLibraryAfterCatalogDeletion(
        state,
        {
          ...state.playlistLibrary,
          temporaryPlaylist: action.playlist
        },
        action.removedTrackIds
      );
    case "replace-playlist-library-after-catalog-deletion":
      return replaceLibraryAfterCatalogDeletion(
        state,
        action.library,
        action.removedTrackIds
      );
    case "select-playlist": {
      const selectedPlaylist = selectPlaylist(state.playlistLibrary, action.selection);

      if (
        selectedPlaylist.kind === state.selectedPlaylist.kind &&
        (selectedPlaylist.kind === "temporary" ||
          (state.selectedPlaylist.kind === "saved" &&
            selectedPlaylist.playlistId === state.selectedPlaylist.playlistId))
      ) {
        return state;
      }

      return {
        ...state,
        selectedPlaylist,
        playlist: getSelectedPlaylist(state.playlistLibrary, selectedPlaylist)
      };
    }
    case "start-playback-from-selection": {
      const snapshot = createPlaylistPlaybackSnapshot(
        state.playlist,
        state.selectedPlaylist
      );
      const replacementPlayer = createPlayerState(snapshot.playSequence);

      return {
        ...state,
        player: {
          ...replacementPlayer,
          status:
            action.autoplay && replacementPlayer.status !== "empty"
              ? "playing"
              : replacementPlayer.status,
          playbackRevision: state.player.playbackRevision + 1
        },
        playbackSource: snapshot.source
      };
    }
    case "playlist": {
      const playlist = temporaryPlaylistReducer(state.playlist, action.action);

      if (playlist === state.playlist) {
        return state;
      }

      const playlistLibrary = replaceSelectedPlaylist(
        state.playlistLibrary,
        state.selectedPlaylist,
        playlist
      );

      return { ...state, playlistLibrary, playlist };
    }
    case "player": {
      const player = playerReducer(state.player, action.action);

      return player === state.player ? state : { ...state, player };
    }
  }
}

function createHydratedAppState(playlistLibrary: PlaylistLibrary): AppState {
  const selectedPlaylist: PlaylistSelection = { kind: "temporary" };

  return {
    playlistLibrary,
    selectedPlaylist,
    playlist: getSelectedPlaylist(playlistLibrary, selectedPlaylist),
    player: createPlayerState(),
    playbackSource: null
  };
}

function replaceLibraryAfterCatalogDeletion(
  state: AppState,
  playlistLibrary: PlaylistLibrary,
  removedTrackIds: readonly EntityId[]
): AppState {
  const playSequence = state.player.playSequence.filter(
    (entry) => !removedTrackIds.includes(entry.trackId)
  );
  const currentTrackWasDeleted = Boolean(
    state.player.currentEntry &&
    removedTrackIds.includes(state.player.currentEntry.trackId)
  );
  const player = currentTrackWasDeleted
    ? stopPlayerAfterCurrentEntryRemoved(state.player, playSequence)
    : syncPlayerSequence(state.player, playSequence);

  return {
    ...state,
    playlistLibrary,
    playlist: getSelectedPlaylist(playlistLibrary, state.selectedPlaylist),
    player,
    playbackSource: player.playSequence.length === 0 ? null : state.playbackSource
  };
}

function replaceSelectedPlaylist(
  library: PlaylistLibrary,
  selection: PlaylistSelection,
  playlist: TemporaryPlaylist
): PlaylistLibrary {
  if (selection.kind === "temporary") {
    return { ...library, temporaryPlaylist: playlist };
  }

  return {
    ...library,
    savedPlaylistsById: {
      ...library.savedPlaylistsById,
      [selection.playlistId]: playlist
    }
  };
}

function isPlaylistLibrary(
  value: TemporaryPlaylist | PlaylistLibrary
): value is PlaylistLibrary {
  return "temporaryPlaylist" in value;
}
