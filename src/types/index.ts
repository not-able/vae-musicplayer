export { USER_CATALOG_CHANGES_SCHEMA_VERSION } from "./catalog";

export type {
  Album,
  AlbumFieldOverrides,
  AlbumType,
  Artist,
  CatalogExternalEntityType,
  CatalogExternalReference,
  CatalogData,
  EntityId,
  ISODateString,
  Track,
  TrackFieldOverrides,
  UserCatalogChanges
} from "./catalog";

export type {
  PlaySequenceEntry,
  PlaylistItem,
  PlaylistItemSource,
  StoredTemporaryPlaylist,
  StoredTemporaryPlaylistItem,
  TemporaryPlaylist
} from "./playlist";

export { TEMPORARY_PLAYLIST_SCHEMA_VERSION } from "./playlist";

export type {
  AudioMappingStatus,
  LocalAudioFileMapping,
  LocalAudioFileRecord,
  PlaybackProviderDescriptor,
  PlaybackProviderType
} from "./audio";
