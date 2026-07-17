import {
  USER_CATALOG_CHANGES_SCHEMA_VERSION,
  type Album,
  type AlbumFieldOverrides,
  type Artist,
  type CatalogData,
  type EntityId,
  type Track,
  type TrackFieldOverrides,
  type UserCatalogChanges
} from "../../types";
import { isPositiveSafeInteger } from "./catalogValidation";

const albumTypes = new Set<Album["type"]>([
  "album",
  "ep",
  "single_collection",
  "other"
]);

function hasOwn(value: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function cloneArtist(artist: Artist): Artist {
  return {
    ...artist,
    ...(artist.aliases === undefined ? {} : { aliases: [...artist.aliases] })
  };
}

function cloneAlbum(album: Album): Album {
  return {
    ...album,
    trackIds: [...album.trackIds]
  };
}

function cloneTrack(track: Track): Track {
  return { ...track };
}

function applyAlbumOverrides(
  album: Album,
  overrides: AlbumFieldOverrides | undefined
): Album {
  const nextAlbum = cloneAlbum(album);

  if (overrides === undefined) {
    return nextAlbum;
  }

  if (hasOwn(overrides, "title")) {
    if (overrides.title !== undefined && typeof overrides.title !== "string") {
      throw new Error("Album title overrides must be strings.");
    }
    if (overrides.title !== undefined) {
      nextAlbum.title = overrides.title;
    }
  }

  if (hasOwn(overrides, "type")) {
    if (overrides.type !== undefined && !albumTypes.has(overrides.type)) {
      throw new Error("Album type overrides must use a supported value.");
    }
    if (overrides.type !== undefined) {
      nextAlbum.type = overrides.type;
    }
  }

  if (hasOwn(overrides, "releaseDate")) {
    if (
      overrides.releaseDate !== undefined &&
      overrides.releaseDate !== null &&
      typeof overrides.releaseDate !== "string"
    ) {
      throw new Error("Album release date overrides must be strings.");
    }
    if (overrides.releaseDate !== undefined) {
      nextAlbum.releaseDate = overrides.releaseDate ?? undefined;
    }
  }

  if (hasOwn(overrides, "sortOrder")) {
    if (overrides.sortOrder !== undefined && typeof overrides.sortOrder !== "number") {
      throw new Error("Album sort order overrides must be numbers.");
    }
    if (overrides.sortOrder !== undefined) {
      nextAlbum.sortOrder = overrides.sortOrder;
    }
  }

  if (hasOwn(overrides, "note")) {
    if (
      overrides.note !== undefined &&
      overrides.note !== null &&
      typeof overrides.note !== "string"
    ) {
      throw new Error("Album note overrides must be strings.");
    }
    if (overrides.note !== undefined) {
      nextAlbum.note = overrides.note ?? undefined;
    }
  }

  return nextAlbum;
}

function applyOptionalNumberOverride(
  track: Track,
  overrides: TrackFieldOverrides,
  field: "discNumber" | "trackNumber" | "durationSeconds"
): void {
  if (!hasOwn(overrides, field)) {
    return;
  }

  const value = overrides[field];
  if (value !== undefined && value !== null && typeof value !== "number") {
    throw new Error(`Track ${field} overrides must be numbers.`);
  }
  if (value !== undefined) {
    track[field] = value ?? undefined;
  }
}

function applyOptionalStringOverride(
  track: Track,
  overrides: TrackFieldOverrides,
  field: "version" | "releaseDate" | "note"
): void {
  if (!hasOwn(overrides, field)) {
    return;
  }

  const value = overrides[field];
  if (value !== undefined && value !== null && typeof value !== "string") {
    throw new Error(`Track ${field} overrides must be strings.`);
  }
  if (value !== undefined) {
    track[field] = value ?? undefined;
  }
}

function applyTrackOverrides(
  track: Track,
  overrides: TrackFieldOverrides | undefined
): Track {
  const nextTrack = cloneTrack(track);

  if (overrides === undefined) {
    return nextTrack;
  }

  if (hasOwn(overrides, "title")) {
    if (overrides.title !== undefined && typeof overrides.title !== "string") {
      throw new Error("Track title overrides must be strings.");
    }
    if (overrides.title !== undefined) {
      nextTrack.title = overrides.title;
    }
  }

  applyOptionalNumberOverride(nextTrack, overrides, "discNumber");
  applyOptionalNumberOverride(nextTrack, overrides, "trackNumber");
  applyOptionalNumberOverride(nextTrack, overrides, "durationSeconds");
  applyOptionalStringOverride(nextTrack, overrides, "version");
  applyOptionalStringOverride(nextTrack, overrides, "releaseDate");
  applyOptionalStringOverride(nextTrack, overrides, "note");

  return nextTrack;
}

function assertNonBlank(value: string, entityName: string): void {
  if (value.trim().length === 0) {
    throw new Error(`${entityName} title must not be empty.`);
  }
}

function assertOptionalPositiveInteger(
  value: number | undefined,
  fieldName: string
): void {
  if (value !== undefined && !isPositiveSafeInteger(value)) {
    throw new Error(`${fieldName} must be a positive integer.`);
  }
}

function assertCatalogIntegrity(catalog: CatalogData): void {
  const entityIds = new Set<EntityId>();

  for (const entity of [...catalog.artists, ...catalog.albums, ...catalog.tracks]) {
    if (entity.id.trim().length === 0) {
      throw new Error("Catalog entity IDs must not be empty.");
    }
    if (entityIds.has(entity.id)) {
      throw new Error(`Catalog entity IDs must be unique: ${entity.id}.`);
    }
    entityIds.add(entity.id);
  }

  const artistIds = new Set(catalog.artists.map((artist) => artist.id));
  const albumsById = new Map(catalog.albums.map((album) => [album.id, album]));
  const tracksById = new Map(catalog.tracks.map((track) => [track.id, track]));
  const trackReferenceCounts = new Map<EntityId, number>();

  for (const album of catalog.albums) {
    assertNonBlank(album.title, "Album");

    if (!artistIds.has(album.artistId)) {
      throw new Error(`Unknown artist ID for album ${album.id}: ${album.artistId}.`);
    }

    const albumTrackIds = new Set<EntityId>();
    for (const trackId of album.trackIds) {
      if (albumTrackIds.has(trackId)) {
        throw new Error(
          `Album ${album.id} references track ${trackId} more than once.`
        );
      }
      albumTrackIds.add(trackId);

      const track = tracksById.get(trackId);
      if (track === undefined) {
        throw new Error(`Album ${album.id} references unknown track ${trackId}.`);
      }
      if (track.albumId !== album.id) {
        throw new Error(
          `Album ${album.id} cannot reference track ${trackId} from ${track.albumId}.`
        );
      }
      trackReferenceCounts.set(trackId, (trackReferenceCounts.get(trackId) ?? 0) + 1);
    }
  }

  for (const track of catalog.tracks) {
    assertNonBlank(track.title, "Track");
    assertOptionalPositiveInteger(track.discNumber, "Track disc number");
    assertOptionalPositiveInteger(track.trackNumber, "Track number");

    if (!artistIds.has(track.artistId)) {
      throw new Error(`Unknown artist ID for track ${track.id}: ${track.artistId}.`);
    }
    if (!albumsById.has(track.albumId)) {
      throw new Error(`Unknown album ID for track ${track.id}: ${track.albumId}.`);
    }
    if (trackReferenceCounts.get(track.id) !== 1) {
      throw new Error(
        `Track ${track.id} must be referenced once by album ${track.albumId}.`
      );
    }
  }
}

export function mergeCatalogChanges(
  defaultCatalog: CatalogData,
  changes: UserCatalogChanges
): CatalogData {
  if (changes.schemaVersion !== USER_CATALOG_CHANGES_SCHEMA_VERSION) {
    throw new Error(`Unsupported user catalog schema: ${changes.schemaVersion}.`);
  }

  const albums = [
    ...defaultCatalog.albums.map(cloneAlbum),
    ...changes.addedAlbums.map(cloneAlbum)
  ];
  const tracks = [
    ...defaultCatalog.tracks.map(cloneTrack),
    ...changes.addedTracks.map(cloneTrack)
  ];
  const albumIds = new Set(albums.map((album) => album.id));
  const trackIds = new Set(tracks.map((track) => track.id));

  for (const albumId of Object.keys(changes.albumOverrides)) {
    if (!albumIds.has(albumId)) {
      throw new Error(`Unknown album override target: ${albumId}.`);
    }
  }

  for (const trackId of Object.keys(changes.trackOverrides)) {
    if (!trackIds.has(trackId)) {
      throw new Error(`Unknown track override target: ${trackId}.`);
    }
  }

  for (const albumId of Object.keys(changes.albumTrackIdAdditions)) {
    if (!albumIds.has(albumId)) {
      throw new Error(`Unknown album track-addition target: ${albumId}.`);
    }
  }

  const mergedCatalog: CatalogData = {
    schemaVersion: defaultCatalog.schemaVersion,
    artists: defaultCatalog.artists.map(cloneArtist),
    albums: albums.map((album) => {
      const overriddenAlbum = applyAlbumOverrides(
        album,
        changes.albumOverrides[album.id]
      );
      const addedTrackIds = changes.albumTrackIdAdditions[album.id] ?? [];

      if (!addedTrackIds.every((trackId) => typeof trackId === "string")) {
        throw new Error("Album track ID additions must be string arrays.");
      }

      return {
        ...overriddenAlbum,
        trackIds: [...overriddenAlbum.trackIds, ...addedTrackIds]
      };
    }),
    tracks: tracks.map((track) =>
      applyTrackOverrides(track, changes.trackOverrides[track.id])
    )
  };

  assertCatalogIntegrity(mergedCatalog);
  return mergedCatalog;
}
