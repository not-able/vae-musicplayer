export type EntityId = string;
export type ISODateString = string;

export interface Artist {
  id: EntityId;
  name: string;
  aliases?: string[];
  note?: string;
}

export type AlbumType = "album" | "ep" | "single_collection" | "other";

export interface Album {
  id: EntityId;
  artistId: EntityId;
  title: string;
  type: AlbumType;
  sortOrder: number;
  trackIds: EntityId[];
  note?: string;
}

export interface Track {
  id: EntityId;
  artistId: EntityId;
  albumId: EntityId;
  title: string;
  trackNumber?: number;
  durationSeconds?: number;
  note?: string;
}

export interface CatalogData {
  schemaVersion: number;
  artists: Artist[];
  albums: Album[];
  tracks: Track[];
}

export const USER_CATALOG_CHANGES_SCHEMA_VERSION = 1 as const;

export interface AlbumFieldOverrides {
  title?: string;
  type?: AlbumType;
  sortOrder?: number;
  note?: string | null;
}

export interface TrackFieldOverrides {
  title?: string;
  trackNumber?: number | null;
  durationSeconds?: number | null;
  note?: string | null;
}

export interface UserCatalogChanges {
  schemaVersion: typeof USER_CATALOG_CHANGES_SCHEMA_VERSION;
  addedAlbums: Album[];
  addedTracks: Track[];
  albumOverrides: Partial<Record<EntityId, AlbumFieldOverrides>>;
  trackOverrides: Partial<Record<EntityId, TrackFieldOverrides>>;
  albumTrackIdAdditions: Partial<Record<EntityId, EntityId[]>>;
  /**
   * Built-in records stay in source control. A user "deletion" only hides
   * those records locally so the default catalog can be restored later.
   */
  hiddenDefaultAlbumIds: EntityId[];
  hiddenDefaultTrackIds: EntityId[];
}
