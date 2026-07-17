import type { EntityId, ISODateString } from "./catalog";

export type PlaylistItemSource = "single" | "album" | "manual";

export const TEMPORARY_PLAYLIST_SCHEMA_VERSION = 1 as const;

export interface TemporaryPlaylist {
  id: EntityId;
  name: string;
  itemIds: EntityId[];
  itemsById: Record<EntityId, PlaylistItem>;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface PlaylistItem {
  id: EntityId;
  trackId: EntityId;
  repeatCount: number;
  playedCount: number;
  source: PlaylistItemSource;
  sourceAlbumId?: EntityId;
  addedAt: ISODateString;
}

export interface StoredTemporaryPlaylistItem {
  id: EntityId;
  trackId: EntityId;
  repeatCount: number;
  source: PlaylistItemSource;
  sourceAlbumId?: EntityId;
  addedAt: ISODateString;
}

export interface StoredTemporaryPlaylist {
  schemaVersion: typeof TEMPORARY_PLAYLIST_SCHEMA_VERSION;
  id: EntityId;
  name: string;
  itemIds: EntityId[];
  items: StoredTemporaryPlaylistItem[];
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface PlaySequenceEntry {
  queueItemId: EntityId;
  trackId: EntityId;
  repeatIndex: number;
  repeatTotal: number;
}
