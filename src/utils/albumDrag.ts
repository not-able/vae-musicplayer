import type { EntityId } from "../types";

export const ALBUM_DRAG_MIME_TYPE = "application/x-vae-music-album-id";
export const TRACK_DRAG_MIME_TYPE = "application/x-vae-music-track-id";
export const PLAYLIST_ITEM_DRAG_MIME_TYPE = "application/x-vae-music-playlist-item-id";

export function hasAlbumDragData(dataTransfer: DataTransfer): boolean {
  return hasDragData(dataTransfer, ALBUM_DRAG_MIME_TYPE);
}

export function writeAlbumDragData(
  dataTransfer: DataTransfer,
  albumId: EntityId
): void {
  dataTransfer.effectAllowed = "copy";
  dataTransfer.setData(ALBUM_DRAG_MIME_TYPE, albumId);
}

export function readAlbumDragData(dataTransfer: DataTransfer): EntityId | undefined {
  return readDragData(dataTransfer, ALBUM_DRAG_MIME_TYPE);
}

export function hasTrackDragData(dataTransfer: DataTransfer): boolean {
  return hasDragData(dataTransfer, TRACK_DRAG_MIME_TYPE);
}

export function writeTrackDragData(
  dataTransfer: DataTransfer,
  trackId: EntityId
): void {
  dataTransfer.effectAllowed = "copy";
  dataTransfer.setData(TRACK_DRAG_MIME_TYPE, trackId);
}

export function readTrackDragData(dataTransfer: DataTransfer): EntityId | undefined {
  return readDragData(dataTransfer, TRACK_DRAG_MIME_TYPE);
}

export function hasPlaylistItemDragData(dataTransfer: DataTransfer): boolean {
  return hasDragData(dataTransfer, PLAYLIST_ITEM_DRAG_MIME_TYPE);
}

export function writePlaylistItemDragData(
  dataTransfer: DataTransfer,
  itemId: EntityId
): void {
  dataTransfer.effectAllowed = "move";
  dataTransfer.setData(PLAYLIST_ITEM_DRAG_MIME_TYPE, itemId);
}

export function readPlaylistItemDragData(
  dataTransfer: DataTransfer
): EntityId | undefined {
  return readDragData(dataTransfer, PLAYLIST_ITEM_DRAG_MIME_TYPE);
}

function hasDragData(dataTransfer: DataTransfer, mimeType: string): boolean {
  return Array.from(dataTransfer.types).includes(mimeType);
}

function readDragData(
  dataTransfer: DataTransfer,
  mimeType: string
): EntityId | undefined {
  if (!hasDragData(dataTransfer, mimeType)) {
    return undefined;
  }

  const entityId = dataTransfer.getData(mimeType).trim();

  return entityId || undefined;
}
