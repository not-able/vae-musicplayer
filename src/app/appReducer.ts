import {
  createPlayerState,
  playerReducer,
  stopPlayerAfterCurrentEntryRemoved,
  syncPlayerSequence,
  type PlayerAction,
  type PlayerState
} from "../features/player/playerReducer";
import {
  temporaryPlaylistReducer,
  type TemporaryPlaylistAction
} from "../features/playlist/playlistReducer";
import type { EntityId, TemporaryPlaylist } from "../types";
import { expandPlaylistToPlaySequence } from "../utils/playlist";

export interface AppState {
  playlist: TemporaryPlaylist;
  player: PlayerState;
}

export type AppAction =
  | { type: "hydrate-playlist"; playlist: TemporaryPlaylist }
  | {
      type: "replace-playlist-after-catalog-deletion";
      playlist: TemporaryPlaylist;
      removedTrackIds: readonly EntityId[];
    }
  | { type: "playlist"; action: TemporaryPlaylistAction }
  | { type: "player"; action: PlayerAction };

export function createAppState(playlist: TemporaryPlaylist): AppState {
  return {
    playlist,
    player: createPlayerState(expandPlaylistToPlaySequence(playlist))
  };
}

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "hydrate-playlist":
      return createAppState(action.playlist);
    case "replace-playlist-after-catalog-deletion": {
      const playSequence = expandPlaylistToPlaySequence(action.playlist);
      const currentTrackWasDeleted = Boolean(
        state.player.currentEntry &&
        action.removedTrackIds.includes(state.player.currentEntry.trackId)
      );

      return {
        playlist: action.playlist,
        player: currentTrackWasDeleted
          ? stopPlayerAfterCurrentEntryRemoved(state.player, playSequence)
          : syncPlayerSequence(state.player, playSequence)
      };
    }
    case "playlist": {
      const playlist = temporaryPlaylistReducer(state.playlist, action.action);

      if (playlist === state.playlist) {
        return state;
      }

      return {
        playlist,
        player: syncPlayerSequence(state.player, expandPlaylistToPlaySequence(playlist))
      };
    }
    case "player": {
      const player = playerReducer(state.player, action.action);

      return player === state.player ? state : { ...state, player };
    }
  }
}
