import type { EntityId, ISODateString } from "./catalog";

export type PlaylistItemSource = "single" | "album" | "manual";

export const TEMPORARY_PLAYLIST_SCHEMA_VERSION = 1 as const;
export const PLAYLIST_LIBRARY_SCHEMA_VERSION = 1 as const;

export interface PlaylistDocument {
  id: EntityId;
  name: string;
  itemIds: EntityId[];
  itemsById: Record<EntityId, PlaylistItem>;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

// The temporary playlist remains a document so current MVP callers stay compatible
// while the library can later hold both a draft and saved documents.
export type TemporaryPlaylist = PlaylistDocument;

export interface PlaylistLibrary {
  temporaryPlaylist: PlaylistDocument;
  savedPlaylistIds: EntityId[];
  savedPlaylistsById: Record<EntityId, PlaylistDocument>;
}

export type PlaylistSelection =
  { kind: "temporary" } | { kind: "saved"; playlistId: EntityId };

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

export interface StoredPlaylistLibrary {
  schemaVersion: typeof PLAYLIST_LIBRARY_SCHEMA_VERSION;
  temporaryPlaylist: StoredTemporaryPlaylist;
  savedPlaylistIds: EntityId[];
  savedPlaylistsById: Record<EntityId, StoredTemporaryPlaylist>;
}

export interface PlaySequenceEntry {
  queueItemId: EntityId;
  trackId: EntityId;
  repeatIndex: number;
  repeatTotal: number;
}
