import type {
  CatalogData,
  EntityId,
  LocalAudioFileRecord,
  TemporaryPlaylist,
  UserCatalogChanges
} from "../../types";
import { removeTracksFromTemporaryPlaylist } from "../../utils/playlist";
import { mergeCatalogChanges } from "./catalogMerge";

export type CatalogDeletionTarget =
  { kind: "album"; id: EntityId } | { kind: "track"; id: EntityId };

export interface CatalogDeletionPreview {
  target: CatalogDeletionTarget;
  targetTitle: string;
  action: "delete" | "hide";
  trackIds: readonly EntityId[];
  trackCount: number;
  playlistItemCount: number;
  audioBindingCount: number;
}

export interface CatalogDeletionPlan extends CatalogDeletionPreview {
  nextCatalogChanges: UserCatalogChanges;
  nextPlaylist: TemporaryPlaylist;
}

export function createCatalogDeletionPlan({
  defaultCatalog,
  changes,
  playlist,
  audioBindings,
  target,
  updatedAt
}: {
  defaultCatalog: CatalogData;
  changes: UserCatalogChanges;
  playlist: TemporaryPlaylist;
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
  const nextPlaylist = removeTracksFromTemporaryPlaylist(playlist, trackIds, updatedAt);
  const playlistItemCount = playlist.itemIds.filter((itemId) =>
    trackIds.has(playlist.itemsById[itemId]?.trackId ?? "")
  ).length;
  const audioBindingCount = sortedTrackIds.filter((trackId) =>
    audioBindings.has(trackId)
  ).length;

  return {
    target,
    targetTitle: targetEntity.title,
    action: isDefaultTarget ? "hide" : "delete",
    trackIds: sortedTrackIds,
    trackCount: sortedTrackIds.length,
    playlistItemCount,
    audioBindingCount,
    nextCatalogChanges,
    nextPlaylist
  };
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
  const hiddenDefaultAlbumIds = new Set(changes.hiddenDefaultAlbumIds);
  const hiddenDefaultTrackIds = new Set(changes.hiddenDefaultTrackIds);

  if (isDefaultTarget && target.kind === "album" && defaultAlbumIds.has(target.id)) {
    hiddenDefaultAlbumIds.add(target.id);
  }
  if (isDefaultTarget && target.kind === "track" && defaultTrackIds.has(target.id)) {
    hiddenDefaultTrackIds.add(target.id);
  }

  return {
    ...changes,
    addedAlbums,
    addedTracks,
    albumOverrides,
    trackOverrides,
    albumTrackIdAdditions,
    hiddenDefaultAlbumIds: [...hiddenDefaultAlbumIds],
    hiddenDefaultTrackIds: [...hiddenDefaultTrackIds]
  };
}

function removeRecordEntries<T>(
  record: Partial<Record<EntityId, T>>,
  shouldRemove: (id: EntityId) => boolean
): Partial<Record<EntityId, T>> {
  return Object.fromEntries(Object.entries(record).filter(([id]) => !shouldRemove(id)));
}
