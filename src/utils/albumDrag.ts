import type { EntityId } from "../types";

export const ALBUM_DRAG_MIME_TYPE = "application/x-vae-music-album-id";

export function hasAlbumDragData(dataTransfer: DataTransfer): boolean {
  return Array.from(dataTransfer.types).includes(ALBUM_DRAG_MIME_TYPE);
}

export function writeAlbumDragData(
  dataTransfer: DataTransfer,
  albumId: EntityId
): void {
  dataTransfer.effectAllowed = "copy";
  dataTransfer.setData(ALBUM_DRAG_MIME_TYPE, albumId);
}

export function readAlbumDragData(dataTransfer: DataTransfer): EntityId | undefined {
  if (!hasAlbumDragData(dataTransfer)) {
    return undefined;
  }

  const albumId = dataTransfer.getData(ALBUM_DRAG_MIME_TYPE).trim();

  return albumId || undefined;
}
