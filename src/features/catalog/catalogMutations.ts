import {
  USER_CATALOG_CHANGES_SCHEMA_VERSION,
  type Album,
  type AlbumFieldOverrides,
  type AlbumType,
  type CatalogData,
  type EntityId,
  type Track,
  type TrackFieldOverrides,
  type UserCatalogChanges
} from "../../types";
import { mergeCatalogChanges } from "./catalogMerge";
import { isPositiveSafeInteger } from "./catalogValidation";

export type CatalogEntityIdFactory = () => EntityId;

export type NewAlbumInput = Omit<Album, "id" | "trackIds">;
export type NewTrackInput = Omit<Track, "id">;
export type CatalogAlbumPatch = Readonly<AlbumFieldOverrides>;
export type CatalogTrackPatch = Readonly<TrackFieldOverrides>;

const albumTypes = new Set<AlbumType>(["album", "ep", "single_collection", "other"]);
const albumPatchKeys = new Set<keyof AlbumFieldOverrides>([
  "title",
  "type",
  "sortOrder",
  "note"
]);
const trackPatchKeys = new Set<keyof TrackFieldOverrides>([
  "title",
  "trackNumber",
  "durationSeconds",
  "note"
]);

function hasOwn(value: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function assertNonBlankTitle(title: string, entityName: string): void {
  if (title.trim().length === 0) {
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

function assertPatchKeys(
  patch: unknown,
  allowedKeys: ReadonlySet<string>,
  entityName: string
): asserts patch is Record<string, unknown> {
  if (typeof patch !== "object" || patch === null || Array.isArray(patch)) {
    throw new Error(`${entityName} patches must be plain objects.`);
  }

  const prototype = Object.getPrototypeOf(patch);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error(`${entityName} patches must be plain objects.`);
  }

  for (const key of Reflect.ownKeys(patch)) {
    if (typeof key !== "string" || !allowedKeys.has(key)) {
      throw new Error(`${entityName} patches cannot change field: ${String(key)}.`);
    }
  }
}

function assertOptionalStringPatch(
  value: unknown,
  fieldName: string
): asserts value is string | null {
  if (value !== null && typeof value !== "string") {
    throw new Error(`${fieldName} must be a string or null.`);
  }
}

function assertOptionalPositiveIntegerPatch(
  value: unknown,
  fieldName: string
): asserts value is number | null {
  if (value !== null && !isPositiveSafeInteger(value)) {
    throw new Error(`${fieldName} must be null or a positive integer.`);
  }
}

function assertAlbumPatch(patch: CatalogAlbumPatch): void {
  assertPatchKeys(patch, albumPatchKeys, "Album");

  if (hasOwn(patch, "title")) {
    if (typeof patch.title !== "string") {
      throw new Error("Album title patches must be strings.");
    }
    assertNonBlankTitle(patch.title, "Album");
  }
  if (
    hasOwn(patch, "type") &&
    (typeof patch.type !== "string" || !albumTypes.has(patch.type))
  ) {
    throw new Error("Album type patches must use a supported value.");
  }
  if (
    hasOwn(patch, "sortOrder") &&
    (typeof patch.sortOrder !== "number" ||
      !Number.isFinite(patch.sortOrder) ||
      Object.is(patch.sortOrder, -0))
  ) {
    throw new Error("Album sort order patches must be finite numbers.");
  }
  if (hasOwn(patch, "note")) {
    assertOptionalStringPatch(patch.note, "Album note");
  }
}

function assertTrackPatch(patch: CatalogTrackPatch): void {
  assertPatchKeys(patch, trackPatchKeys, "Track");

  if (hasOwn(patch, "title")) {
    if (typeof patch.title !== "string") {
      throw new Error("Track title patches must be strings.");
    }
    assertNonBlankTitle(patch.title, "Track");
  }
  if (hasOwn(patch, "trackNumber")) {
    assertOptionalPositiveIntegerPatch(patch.trackNumber, "Track number");
  }
  if (
    hasOwn(patch, "durationSeconds") &&
    patch.durationSeconds !== null &&
    (typeof patch.durationSeconds !== "number" ||
      !Number.isFinite(patch.durationSeconds) ||
      patch.durationSeconds < 0 ||
      Object.is(patch.durationSeconds, -0))
  ) {
    throw new Error("Track duration patches must be null or non-negative numbers.");
  }
  if (hasOwn(patch, "note")) {
    assertOptionalStringPatch(patch.note, "Track note");
  }
}

function createUniqueEntityId(
  catalog: CatalogData,
  idFactory: CatalogEntityIdFactory
): EntityId {
  const id = idFactory();

  if (typeof id !== "string" || id.trim().length === 0) {
    throw new Error("Catalog entity IDs must not be empty.");
  }

  const isDuplicate = [...catalog.artists, ...catalog.albums, ...catalog.tracks].some(
    (entity) => entity.id === id
  );

  if (isDuplicate) {
    throw new Error(`Catalog entity IDs must be unique: ${id}.`);
  }

  return id;
}

function optionalValue<T>(key: string, value: T | undefined): Record<string, T> {
  return value === undefined ? {} : { [key]: value };
}

function applyAlbumPatch(album: Album, patch: CatalogAlbumPatch): Album {
  const nextAlbum: Album = {
    ...album,
    trackIds: [...album.trackIds]
  };

  if (hasOwn(patch, "title")) {
    nextAlbum.title = patch.title as string;
  }
  if (hasOwn(patch, "type")) {
    nextAlbum.type = patch.type as AlbumType;
  }
  if (hasOwn(patch, "sortOrder")) {
    nextAlbum.sortOrder = patch.sortOrder as number;
  }
  if (hasOwn(patch, "note")) {
    if (patch.note === null) {
      delete nextAlbum.note;
    } else {
      nextAlbum.note = patch.note;
    }
  }

  return nextAlbum;
}

function applyTrackPatch(track: Track, patch: CatalogTrackPatch): Track {
  const nextTrack: Track = { ...track };

  if (hasOwn(patch, "title")) {
    nextTrack.title = patch.title as string;
  }

  for (const field of ["trackNumber", "durationSeconds"] as const) {
    if (hasOwn(patch, field)) {
      if (patch[field] === null) {
        delete nextTrack[field];
      } else {
        nextTrack[field] = patch[field];
      }
    }
  }

  for (const field of ["note"] as const) {
    if (hasOwn(patch, field)) {
      if (patch[field] === null) {
        delete nextTrack[field];
      } else {
        nextTrack[field] = patch[field];
      }
    }
  }

  return nextTrack;
}

function removeRecordEntry<T>(
  record: Partial<Record<EntityId, T>>,
  entityId: EntityId
): Partial<Record<EntityId, T>> {
  const nextRecord = { ...record };
  delete nextRecord[entityId];
  return nextRecord;
}

function setNormalizedAlbumOverride(
  defaultAlbum: Album,
  currentOverrides: AlbumFieldOverrides | undefined,
  patch: CatalogAlbumPatch
): AlbumFieldOverrides | undefined {
  const nextOverrides: AlbumFieldOverrides = { ...currentOverrides };

  for (const key of Reflect.ownKeys(patch) as Array<keyof AlbumFieldOverrides>) {
    const value = patch[key];
    const defaultValue = defaultAlbum[key];
    const matchesDefault =
      value === null ? defaultValue === undefined : Object.is(value, defaultValue);

    if (matchesDefault) {
      delete nextOverrides[key];
    } else {
      Object.assign(nextOverrides, { [key]: value });
    }
  }

  return Object.keys(nextOverrides).length === 0 ? undefined : nextOverrides;
}

function setNormalizedTrackOverride(
  defaultTrack: Track,
  currentOverrides: TrackFieldOverrides | undefined,
  patch: CatalogTrackPatch
): TrackFieldOverrides | undefined {
  const nextOverrides: TrackFieldOverrides = { ...currentOverrides };

  for (const key of Reflect.ownKeys(patch) as Array<keyof TrackFieldOverrides>) {
    const value = patch[key];
    const defaultValue = defaultTrack[key];
    const matchesDefault =
      value === null ? defaultValue === undefined : Object.is(value, defaultValue);

    if (matchesDefault) {
      delete nextOverrides[key];
    } else {
      Object.assign(nextOverrides, { [key]: value });
    }
  }

  return Object.keys(nextOverrides).length === 0 ? undefined : nextOverrides;
}

export function createEmptyUserCatalogChanges(): UserCatalogChanges {
  return {
    schemaVersion: USER_CATALOG_CHANGES_SCHEMA_VERSION,
    addedAlbums: [],
    addedTracks: [],
    albumOverrides: {},
    trackOverrides: {},
    albumTrackIdAdditions: {}
  };
}

export function addAlbumToUserCatalog(
  defaultCatalog: CatalogData,
  changes: UserCatalogChanges,
  input: NewAlbumInput,
  idFactory: CatalogEntityIdFactory
): UserCatalogChanges {
  const currentCatalog = mergeCatalogChanges(defaultCatalog, changes);
  assertNonBlankTitle(input.title, "Album");

  if (!currentCatalog.artists.some((artist) => artist.id === input.artistId)) {
    throw new Error(`Unknown artist ID: ${input.artistId}.`);
  }

  const id = createUniqueEntityId(currentCatalog, idFactory);
  const album: Album = {
    id,
    artistId: input.artistId,
    title: input.title,
    type: input.type,
    sortOrder: input.sortOrder,
    trackIds: [],
    ...optionalValue("note", input.note)
  };

  return {
    ...changes,
    addedAlbums: [...changes.addedAlbums, album]
  };
}

export function addTrackToUserCatalog(
  defaultCatalog: CatalogData,
  changes: UserCatalogChanges,
  input: NewTrackInput,
  idFactory: CatalogEntityIdFactory
): UserCatalogChanges {
  const currentCatalog = mergeCatalogChanges(defaultCatalog, changes);
  assertNonBlankTitle(input.title, "Track");
  assertOptionalPositiveInteger(input.trackNumber, "Track number");

  const targetAlbum = currentCatalog.albums.find((album) => album.id === input.albumId);
  if (targetAlbum === undefined) {
    throw new Error(`Unknown album ID: ${input.albumId}.`);
  }
  if (!currentCatalog.artists.some((artist) => artist.id === input.artistId)) {
    throw new Error(`Unknown artist ID: ${input.artistId}.`);
  }

  const id = createUniqueEntityId(currentCatalog, idFactory);
  const track: Track = {
    id,
    artistId: input.artistId,
    albumId: input.albumId,
    title: input.title,
    ...optionalValue("trackNumber", input.trackNumber),
    ...optionalValue("durationSeconds", input.durationSeconds),
    ...optionalValue("note", input.note)
  };
  const targetIsAddedAlbum = changes.addedAlbums.some(
    (album) => album.id === targetAlbum.id
  );
  let addedAlbums = changes.addedAlbums;
  let albumTrackIdAdditions = changes.albumTrackIdAdditions;

  if (targetIsAddedAlbum) {
    addedAlbums = changes.addedAlbums.map((album) =>
      album.id === targetAlbum.id
        ? { ...album, trackIds: [...album.trackIds, id] }
        : album
    );
  } else {
    albumTrackIdAdditions = {
      ...changes.albumTrackIdAdditions,
      [targetAlbum.id]: [...(changes.albumTrackIdAdditions[targetAlbum.id] ?? []), id]
    };
  }

  return {
    ...changes,
    addedAlbums,
    addedTracks: [...changes.addedTracks, track],
    albumTrackIdAdditions
  };
}

export function patchAlbumInUserCatalog(
  defaultCatalog: CatalogData,
  changes: UserCatalogChanges,
  albumId: EntityId,
  patch: CatalogAlbumPatch
): UserCatalogChanges {
  assertAlbumPatch(patch);
  const currentCatalog = mergeCatalogChanges(defaultCatalog, changes);
  const currentAlbum = currentCatalog.albums.find((album) => album.id === albumId);

  if (!currentAlbum) {
    throw new Error(`Unknown album ID: ${albumId}.`);
  }
  if (Reflect.ownKeys(patch).length === 0) {
    return changes;
  }

  const addedAlbum = changes.addedAlbums.find((album) => album.id === albumId);

  if (addedAlbum) {
    const nextAlbum = applyAlbumPatch(
      {
        ...currentAlbum,
        trackIds: [...addedAlbum.trackIds]
      },
      patch
    );

    return {
      ...changes,
      addedAlbums: changes.addedAlbums.map((album) =>
        album.id === albumId ? nextAlbum : album
      ),
      albumOverrides: removeRecordEntry(changes.albumOverrides, albumId)
    };
  }

  const defaultAlbum = defaultCatalog.albums.find((album) => album.id === albumId);
  if (!defaultAlbum) {
    throw new Error(`Album source is unavailable: ${albumId}.`);
  }

  const nextOverride = setNormalizedAlbumOverride(
    defaultAlbum,
    changes.albumOverrides[albumId],
    patch
  );
  const albumOverrides = removeRecordEntry(changes.albumOverrides, albumId);

  if (nextOverride) {
    albumOverrides[albumId] = nextOverride;
  }

  return {
    ...changes,
    albumOverrides
  };
}

export function patchTrackInUserCatalog(
  defaultCatalog: CatalogData,
  changes: UserCatalogChanges,
  trackId: EntityId,
  patch: CatalogTrackPatch
): UserCatalogChanges {
  assertTrackPatch(patch);
  const currentCatalog = mergeCatalogChanges(defaultCatalog, changes);
  const currentTrack = currentCatalog.tracks.find((track) => track.id === trackId);

  if (!currentTrack) {
    throw new Error(`Unknown track ID: ${trackId}.`);
  }
  if (Reflect.ownKeys(patch).length === 0) {
    return changes;
  }

  const addedTrack = changes.addedTracks.find((track) => track.id === trackId);

  if (addedTrack) {
    const nextTrack = applyTrackPatch(currentTrack, patch);

    return {
      ...changes,
      addedTracks: changes.addedTracks.map((track) =>
        track.id === trackId ? nextTrack : track
      ),
      trackOverrides: removeRecordEntry(changes.trackOverrides, trackId)
    };
  }

  const defaultTrack = defaultCatalog.tracks.find((track) => track.id === trackId);
  if (!defaultTrack) {
    throw new Error(`Track source is unavailable: ${trackId}.`);
  }

  const nextOverride = setNormalizedTrackOverride(
    defaultTrack,
    changes.trackOverrides[trackId],
    patch
  );
  const trackOverrides = removeRecordEntry(changes.trackOverrides, trackId);

  if (nextOverride) {
    trackOverrides[trackId] = nextOverride;
  }

  return {
    ...changes,
    trackOverrides
  };
}

export function resetAlbumInUserCatalog(
  defaultCatalog: CatalogData,
  changes: UserCatalogChanges,
  albumId: EntityId
): UserCatalogChanges {
  const currentCatalog = mergeCatalogChanges(defaultCatalog, changes);

  if (!currentCatalog.albums.some((album) => album.id === albumId)) {
    throw new Error(`Unknown album ID: ${albumId}.`);
  }
  if (!defaultCatalog.albums.some((album) => album.id === albumId)) {
    throw new Error(`User-created albums cannot be reset: ${albumId}.`);
  }
  if (!hasOwn(changes.albumOverrides, albumId)) {
    return changes;
  }

  return {
    ...changes,
    albumOverrides: removeRecordEntry(changes.albumOverrides, albumId)
  };
}

export function resetTrackInUserCatalog(
  defaultCatalog: CatalogData,
  changes: UserCatalogChanges,
  trackId: EntityId
): UserCatalogChanges {
  const currentCatalog = mergeCatalogChanges(defaultCatalog, changes);

  if (!currentCatalog.tracks.some((track) => track.id === trackId)) {
    throw new Error(`Unknown track ID: ${trackId}.`);
  }
  if (!defaultCatalog.tracks.some((track) => track.id === trackId)) {
    throw new Error(`User-created tracks cannot be reset: ${trackId}.`);
  }
  if (!hasOwn(changes.trackOverrides, trackId)) {
    return changes;
  }

  return {
    ...changes,
    trackOverrides: removeRecordEntry(changes.trackOverrides, trackId)
  };
}
