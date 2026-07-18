import type {
  CatalogData,
  EntityId,
  LocalAudioFileRecord,
  PlaylistLibrary,
  UserCatalogChanges
} from "../../types";
import { removeTracksFromPlaylistLibrary } from "../playlist/playlistLibrary";
import { mergeCatalogChanges } from "./catalogMerge";

export type CatalogDeletionTarget =
  { kind: "album"; id: EntityId } | { kind: "track"; id: EntityId };

export interface CatalogDeletionPreview {
  target: CatalogDeletionTarget;
  targetTitle: string;
  trackIds: readonly EntityId[];
  trackCount: number;
  playlistItemCount: number;
  audioBindingCount: number;
}

export interface CatalogDeletionPlan extends CatalogDeletionPreview {
  nextCatalogChanges: UserCatalogChanges;
  nextPlaylistLibrary: PlaylistLibrary;
}

export function createCatalogDeletionPlan({
  defaultCatalog,
  changes,
  playlistLibrary,
  audioBindings,
  target,
  updatedAt
}: {
  defaultCatalog: CatalogData;
  changes: UserCatalogChanges;
  playlistLibrary: PlaylistLibrary;
  audioBindings: ReadonlyMap<EntityId, LocalAudioFileRecord>;
  target: CatalogDeletionTarget;
  updatedAt: string;
}): CatalogDeletionPlan {
  const currentCatalog = mergeCatalogChanges(defaultCatalog, changes);
  const targetEntity =
    target.kind === "album"
      ? currentCatalog.albums.find((album) => album.id === target.id)
      : currentCatalog.tracks.find((track) => track.id === target.id);

  if (!targetEntity) {
    throw new Error("要删除的目录记录已不存在，请刷新后重试。");
  }

  const trackIds = new Set<EntityId>(
    target.kind === "album"
      ? currentCatalog.tracks
          .filter((track) => track.albumId === target.id)
          .map((track) => track.id)
      : [target.id]
  );
  const sortedTrackIds = [...trackIds];
  const isDefaultTarget =
    target.kind === "album"
      ? defaultCatalog.albums.some((album) => album.id === target.id)
      : defaultCatalog.tracks.some((track) => track.id === target.id);
  const nextCatalogChanges = removeCatalogEntries(
    defaultCatalog,
    changes,
    target,
    trackIds,
    isDefaultTarget
  );
  const nextPlaylistLibrary = removeTracksFromPlaylistLibrary(
    playlistLibrary,
    trackIds,
    updatedAt
  );
  const playlistItemCount = getPlaylistItemCount(playlistLibrary, trackIds);
  const audioBindingCount = sortedTrackIds.filter((trackId) =>
    audioBindings.has(trackId)
  ).length;

  return {
    target,
    targetTitle: targetEntity.title,
    trackIds: sortedTrackIds,
    trackCount: sortedTrackIds.length,
    playlistItemCount,
    audioBindingCount,
    nextCatalogChanges,
    nextPlaylistLibrary
  };
}

function getPlaylistItemCount(
  playlistLibrary: PlaylistLibrary,
  trackIds: ReadonlySet<EntityId>
): number {
  const documents = [
    playlistLibrary.temporaryPlaylist,
    ...playlistLibrary.savedPlaylistIds.flatMap((playlistId) => {
      const playlist = playlistLibrary.savedPlaylistsById[playlistId];

      return playlist ? [playlist] : [];
    })
  ];

  return documents.reduce(
    (count, playlist) =>
      count +
      playlist.itemIds.filter((itemId) =>
        trackIds.has(playlist.itemsById[itemId]?.trackId ?? "")
      ).length,
    0
  );
}

function removeCatalogEntries(
  defaultCatalog: CatalogData,
  changes: UserCatalogChanges,
  target: CatalogDeletionTarget,
  trackIds: ReadonlySet<EntityId>,
  isDefaultTarget: boolean
): UserCatalogChanges {
  const isDeletedAlbum = (albumId: EntityId) =>
    target.kind === "album" && albumId === target.id;
  const defaultAlbumIds = new Set(defaultCatalog.albums.map((album) => album.id));
  const defaultTrackIds = new Set(defaultCatalog.tracks.map((track) => track.id));

  const addedAlbums = changes.addedAlbums
    .filter((album) => !isDeletedAlbum(album.id))
    .map((album) => ({
      ...album,
      trackIds: album.trackIds.filter((trackId) => !trackIds.has(trackId))
    }));
  const addedTracks = changes.addedTracks.filter((track) => !trackIds.has(track.id));
  const albumOverrides = removeRecordEntries(changes.albumOverrides, (albumId) =>
    isDeletedAlbum(albumId)
  );
  const trackOverrides = removeRecordEntries(changes.trackOverrides, (trackId) =>
    trackIds.has(trackId)
  );
  const albumTrackIdAdditions = Object.fromEntries(
    Object.entries(changes.albumTrackIdAdditions)
      .filter(([albumId]) => !isDeletedAlbum(albumId))
      .map(([albumId, addedTrackIds]) => [
        albumId,
        (addedTrackIds ?? []).filter((trackId) => !trackIds.has(trackId))
      ])
      .filter(([, addedTrackIds]) => addedTrackIds.length > 0)
  );
  const deletedDefaultAlbumIds = new Set(changes.deletedDefaultAlbumIds);
  const deletedDefaultTrackIds = new Set(changes.deletedDefaultTrackIds);

  if (isDefaultTarget && target.kind === "album" && defaultAlbumIds.has(target.id)) {
    deletedDefaultAlbumIds.add(target.id);
  }
  if (isDefaultTarget && target.kind === "track" && defaultTrackIds.has(target.id)) {
    deletedDefaultTrackIds.add(target.id);
  }

  return {
    ...changes,
    addedAlbums,
    addedTracks,
    albumOverrides,
    trackOverrides,
    albumTrackIdAdditions,
    deletedDefaultAlbumIds: [...deletedDefaultAlbumIds],
    deletedDefaultTrackIds: [...deletedDefaultTrackIds]
  };
}

function removeRecordEntries<T>(
  record: Partial<Record<EntityId, T>>,
  shouldRemove: (id: EntityId) => boolean
): Partial<Record<EntityId, T>> {
  return Object.fromEntries(Object.entries(record).filter(([id]) => !shouldRemove(id)));
}
