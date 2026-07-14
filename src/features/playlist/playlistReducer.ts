import type { Album, EntityId, ISODateString, TemporaryPlaylist } from "../../types";
import {
  addAlbumToPlaylist,
  addTrackToPlaylist,
  clearTemporaryPlaylist,
  movePlaylistItem,
  removePlaylistItem,
  updatePlaylistItemRepeatCount
} from "../../utils/playlist";

export type TemporaryPlaylistAction =
  | {
      type: "add-track";
      trackId: EntityId;
      itemId: EntityId;
      addedAt: ISODateString;
    }
  | {
      type: "add-album";
      album: Album;
      itemIds: EntityId[];
      addedAt: ISODateString;
    }
  | {
      type: "set-repeat-count";
      itemId: EntityId;
      repeatCount: number;
      updatedAt: ISODateString;
    }
  | {
      type: "remove-item";
      itemId: EntityId;
      updatedAt: ISODateString;
    }
  | {
      type: "clear";
      updatedAt: ISODateString;
    }
  | {
      type: "move-item";
      itemId: EntityId;
      toIndex: number;
      updatedAt: ISODateString;
    };

export function temporaryPlaylistReducer(
  playlist: TemporaryPlaylist,
  action: TemporaryPlaylistAction
): TemporaryPlaylist {
  switch (action.type) {
    case "add-track":
      return addTrackToPlaylist(playlist, action);
    case "add-album":
      return addAlbumToPlaylist(playlist, action);
    case "set-repeat-count":
      return updatePlaylistItemRepeatCount(
        playlist,
        action.itemId,
        action.repeatCount,
        action.updatedAt
      );
    case "remove-item":
      return removePlaylistItem(playlist, action.itemId, action.updatedAt);
    case "clear":
      return clearTemporaryPlaylist(playlist, action.updatedAt);
    case "move-item":
      return movePlaylistItem(
        playlist,
        action.itemId,
        action.toIndex,
        action.updatedAt
      );
  }
}
