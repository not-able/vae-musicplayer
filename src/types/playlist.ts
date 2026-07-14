import type { EntityId, ISODateString } from "./catalog";

export type PlaylistItemSource = "single" | "album" | "manual";

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

export interface PlaySequenceEntry {
  queueItemId: EntityId;
  trackId: EntityId;
  repeatIndex: number;
  repeatTotal: number;
}
