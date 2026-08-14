import { xuSongOfficialCatalog } from "../../data/catalog/xuSongOfficialCatalog";
import { legacyPlaceholderCatalog } from "../../data/catalog/legacyPlaceholderCatalog";
import type {
  Album,
  AlbumFieldOverrides,
  CatalogData,
  CatalogExternalEntityType,
  CatalogExternalReferenceMapping,
  EntityId,
  Track,
  TrackFieldOverrides,
  UserCatalogChanges
} from "../../types";
import { mergeCatalogChanges } from "./catalogMerge";

export const XU_SONG_CANONICAL_REFERENCE_PROVIDER = "xu-song-canonical-catalog";

/**
 * The retired verified-catalog importer persisted random `catalog_user_*` IDs
 * but not its draft source tokens. We only recognize a legacy album when its
 * complete album/track structure is an unambiguous match. The returned marker
 * is non-destructive: it keeps every legacy entity ID so playlists and local
 * audio bindings can continue to reference it.
 */
export function prepareXuSongCanonicalCatalogChanges(
  changes: UserCatalogChanges
): UserCatalogChanges {
  const compatibleChanges = migrateLegacyPlaceholderChanges(changes);
  const references = [...(compatibleChanges.externalReferences ?? [])];
  const addedTracksById = new Map(
    compatibleChanges.addedTracks.map((track) => [track.id, track])
  );
  let changed = false;

  for (const canonicalAlbum of xuSongOfficialCatalog.albums) {
    if (hasCanonicalReference(references, "album", canonicalAlbum.id)) {
      continue;
    }

    const canonicalTracks = getCanonicalAlbumTracks(canonicalAlbum);
    const candidates = compatibleChanges.addedAlbums.filter((album) =>
      isExactLegacyImportAlbum(album, canonicalAlbum, canonicalTracks, addedTracksById)
    );

    if (candidates.length !== 1) {
      continue;
    }

    const legacyAlbum = candidates[0];
    if (!legacyAlbum) {
      continue;
    }

    changed =
      addCanonicalReference(references, legacyAlbum.id, "album", canonicalAlbum.id) ||
      changed;

    for (const [index, canonicalTrack] of canonicalTracks.entries()) {
      const legacyTrackId = legacyAlbum.trackIds[index];
      if (!legacyTrackId) {
        continue;
      }

      changed =
        addCanonicalReference(references, legacyTrackId, "track", canonicalTrack.id) ||
        changed;
    }
  }

  if (!changed) {
    return compatibleChanges;
  }

  return {
    ...compatibleChanges,
    externalReferences: references
  };
}

/**
 * A marked legacy import shadows the same canonical album at read time. No
 * persisted user data is deleted or rewritten; removing the legacy album makes
 * the canonical baseline visible again.
 */
export function mergeXuSongCanonicalCatalogChanges(
  defaultCatalog: CatalogData,
  changes: UserCatalogChanges
): CatalogData {
  const preparedChanges = prepareXuSongCanonicalCatalogChanges(changes);
  const mergedCatalog = mergeCatalogChanges(defaultCatalog, preparedChanges);
  const addedAlbumIds = new Set(preparedChanges.addedAlbums.map((album) => album.id));
  const canonicalAlbumIds = new Set(defaultCatalog.albums.map((album) => album.id));
  const shadowedAlbumIds = new Set<EntityId>();

  for (const mapping of preparedChanges.externalReferences ?? []) {
    if (
      mapping.reference.providerId === XU_SONG_CANONICAL_REFERENCE_PROVIDER &&
      mapping.reference.entityType === "album" &&
      canonicalAlbumIds.has(mapping.reference.externalId) &&
      addedAlbumIds.has(mapping.localEntityId)
    ) {
      shadowedAlbumIds.add(mapping.reference.externalId);
    }
  }

  if (shadowedAlbumIds.size === 0) {
    return mergedCatalog;
  }

  const shadowedTrackIds = new Set(
    defaultCatalog.tracks
      .filter((track) => shadowedAlbumIds.has(track.albumId))
      .map((track) => track.id)
  );

  return {
    ...mergedCatalog,
    albums: mergedCatalog.albums.filter((album) => !shadowedAlbumIds.has(album.id)),
    tracks: mergedCatalog.tracks.filter((track) => !shadowedTrackIds.has(track.id))
  };
}

function getCanonicalAlbumTracks(album: Album): readonly Track[] {
  const tracksById = new Map(
    xuSongOfficialCatalog.tracks.map((track) => [track.id, track])
  );

  return album.trackIds.flatMap((trackId) => {
    const track = tracksById.get(trackId);
    return track ? [track] : [];
  });
}

function isExactLegacyImportAlbum(
  legacyAlbum: Album,
  canonicalAlbum: Album,
  canonicalTracks: readonly Track[],
  addedTracksById: ReadonlyMap<EntityId, Track>
): boolean {
  if (
    !legacyAlbum.id.startsWith("catalog_user_") ||
    legacyAlbum.artistId !== canonicalAlbum.artistId ||
    legacyAlbum.title !== canonicalAlbum.title ||
    legacyAlbum.type !== "album" ||
    legacyAlbum.trackIds.length !== canonicalTracks.length
  ) {
    return false;
  }

  return canonicalTracks.every((canonicalTrack, index) => {
    const legacyTrackId = legacyAlbum.trackIds[index];
    const legacyTrack = legacyTrackId ? addedTracksById.get(legacyTrackId) : undefined;

    return Boolean(
      legacyTrack &&
      legacyTrack.id.startsWith("catalog_user_") &&
      legacyTrack.artistId === canonicalTrack.artistId &&
      legacyTrack.albumId === legacyAlbum.id &&
      legacyTrack.title === canonicalTrack.title &&
      legacyTrack.trackNumber === canonicalTrack.trackNumber
    );
  });
}

function hasCanonicalReference(
  references: readonly CatalogExternalReferenceMapping[],
  entityType: CatalogExternalEntityType,
  externalId: EntityId
): boolean {
  return references.some(
    ({ reference }) =>
      reference.providerId === XU_SONG_CANONICAL_REFERENCE_PROVIDER &&
      reference.entityType === entityType &&
      reference.externalId === externalId
  );
}

function addCanonicalReference(
  references: CatalogExternalReferenceMapping[],
  localEntityId: EntityId,
  entityType: CatalogExternalEntityType,
  externalId: EntityId
): boolean {
  if (hasCanonicalReference(references, entityType, externalId)) {
    return false;
  }

  references.push({
    localEntityId,
    reference: {
      providerId: XU_SONG_CANONICAL_REFERENCE_PROVIDER,
      entityType,
      externalId
    }
  });
  return true;
}

/**
 * User-created albums/tracks are already baseline-independent. Only changes
 * that targeted the retired placeholder baseline need translation. Obsolete
 * placeholder deletions are discarded; edited placeholder entities or user
 * tracks added to them are materialized as ordinary added records so the whole
 * change set remains readable against the canonical baseline.
 */
function migrateLegacyPlaceholderChanges(
  changes: UserCatalogChanges
): UserCatalogChanges {
  const legacyAlbumIds = new Set(
    legacyPlaceholderCatalog.albums.map((album) => album.id)
  );
  const legacyTracksById = new Map(
    legacyPlaceholderCatalog.tracks.map((track) => [track.id, track])
  );
  const legacyTrackIds = new Set(legacyTracksById.keys());
  const deletedLegacyAlbumIds = new Set(
    changes.deletedDefaultAlbumIds.filter((id) => legacyAlbumIds.has(id))
  );
  const deletedLegacyTrackIds = new Set(
    changes.deletedDefaultTrackIds.filter((id) => legacyTrackIds.has(id))
  );
  const materializedAlbumIds = new Set<EntityId>();

  for (const albumId of Object.keys(changes.albumOverrides)) {
    if (legacyAlbumIds.has(albumId)) {
      materializedAlbumIds.add(albumId);
    }
  }
  for (const albumId of Object.keys(changes.albumTrackIdAdditions)) {
    if (legacyAlbumIds.has(albumId)) {
      materializedAlbumIds.add(albumId);
    }
  }
  for (const trackId of Object.keys(changes.trackOverrides)) {
    const albumId = legacyTracksById.get(trackId)?.albumId;
    if (albumId) {
      materializedAlbumIds.add(albumId);
    }
  }
  for (const track of changes.addedTracks) {
    if (legacyAlbumIds.has(track.albumId)) {
      materializedAlbumIds.add(track.albumId);
    }
  }

  const materializedAlbums: Album[] = [];
  const materializedTracks: Track[] = [];
  const existingAddedAlbumIds = new Set(changes.addedAlbums.map((album) => album.id));
  const existingAddedTrackIds = new Set(changes.addedTracks.map((track) => track.id));

  for (const legacyAlbum of legacyPlaceholderCatalog.albums) {
    if (
      !materializedAlbumIds.has(legacyAlbum.id) ||
      deletedLegacyAlbumIds.has(legacyAlbum.id) ||
      existingAddedAlbumIds.has(legacyAlbum.id)
    ) {
      continue;
    }

    const visibleLegacyTracks = legacyAlbum.trackIds.flatMap((trackId) => {
      const track = legacyTracksById.get(trackId);
      if (
        !track ||
        deletedLegacyTrackIds.has(trackId) ||
        existingAddedTrackIds.has(trackId)
      ) {
        return [];
      }

      const materializedTrack = applyLegacyTrackOverrides(
        track,
        changes.trackOverrides[trackId]
      );
      materializedTracks.push(materializedTrack);
      return [trackId];
    });
    const addedTrackIds = changes.addedTracks
      .filter((track) => track.albumId === legacyAlbum.id)
      .map((track) => track.id);

    materializedAlbums.push({
      ...applyLegacyAlbumOverrides(legacyAlbum, changes.albumOverrides[legacyAlbum.id]),
      trackIds: [...visibleLegacyTracks, ...addedTrackIds]
    });
  }

  const hasLegacyKeys =
    deletedLegacyAlbumIds.size > 0 ||
    deletedLegacyTrackIds.size > 0 ||
    Object.keys(changes.albumOverrides).some((id) => legacyAlbumIds.has(id)) ||
    Object.keys(changes.trackOverrides).some((id) => legacyTrackIds.has(id)) ||
    Object.keys(changes.albumTrackIdAdditions).some((id) => legacyAlbumIds.has(id));

  if (!hasLegacyKeys && materializedAlbums.length === 0) {
    return changes;
  }

  return {
    ...changes,
    addedAlbums: [...changes.addedAlbums, ...materializedAlbums],
    addedTracks: [...materializedTracks, ...changes.addedTracks],
    albumOverrides: omitRecordKeys(changes.albumOverrides, legacyAlbumIds),
    trackOverrides: omitRecordKeys(changes.trackOverrides, legacyTrackIds),
    albumTrackIdAdditions: omitRecordKeys(
      changes.albumTrackIdAdditions,
      legacyAlbumIds
    ),
    deletedDefaultAlbumIds: changes.deletedDefaultAlbumIds.filter(
      (id) => !legacyAlbumIds.has(id)
    ),
    deletedDefaultTrackIds: changes.deletedDefaultTrackIds.filter(
      (id) => !legacyTrackIds.has(id)
    )
  };
}

function applyLegacyAlbumOverrides(
  album: Album,
  overrides: AlbumFieldOverrides | undefined
): Album {
  if (!overrides) {
    return { ...album, trackIds: [...album.trackIds] };
  }

  const result: Album = {
    ...album,
    trackIds: [...album.trackIds],
    ...(overrides.title === undefined ? {} : { title: overrides.title }),
    ...(overrides.type === undefined ? {} : { type: overrides.type }),
    ...(overrides.sortOrder === undefined ? {} : { sortOrder: overrides.sortOrder })
  };

  if (Object.prototype.hasOwnProperty.call(overrides, "note")) {
    if (overrides.note === null) {
      delete result.note;
    } else if (overrides.note !== undefined) {
      result.note = overrides.note;
    }
  }

  return result;
}

function applyLegacyTrackOverrides(
  track: Track,
  overrides: TrackFieldOverrides | undefined
): Track {
  if (!overrides) {
    return { ...track };
  }

  const result: Track = {
    ...track,
    ...(overrides.title === undefined ? {} : { title: overrides.title })
  };

  applyNullableTrackOverride(result, overrides, "trackNumber");
  applyNullableTrackOverride(result, overrides, "durationSeconds");
  if (Object.prototype.hasOwnProperty.call(overrides, "note")) {
    if (overrides.note === null) {
      delete result.note;
    } else if (overrides.note !== undefined) {
      result.note = overrides.note;
    }
  }

  return result;
}

function applyNullableTrackOverride(
  track: Track,
  overrides: TrackFieldOverrides,
  key: "trackNumber" | "durationSeconds"
): void {
  if (!Object.prototype.hasOwnProperty.call(overrides, key)) {
    return;
  }

  const value = overrides[key];
  if (value === null) {
    delete track[key];
  } else if (value !== undefined) {
    track[key] = value;
  }
}

function omitRecordKeys<T>(
  record: Partial<Record<EntityId, T>>,
  omittedKeys: ReadonlySet<EntityId>
): Partial<Record<EntityId, T>> {
  return Object.fromEntries(
    Object.entries(record).filter(([key]) => !omittedKeys.has(key))
  );
}
