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
  releaseDate?: ISODateString;
  sortOrder: number;
  trackIds: EntityId[];
  note?: string;
}

export interface Track {
  id: EntityId;
  artistId: EntityId;
  albumId: EntityId;
  title: string;
  discNumber: number;
  trackNumber: number;
  durationSeconds?: number;
  version?: string;
  releaseDate?: ISODateString;
  note?: string;
}

export interface CatalogData {
  schemaVersion: number;
  artists: Artist[];
  albums: Album[];
  tracks: Track[];
}
