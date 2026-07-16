import {
  USER_CATALOG_CHANGES_SCHEMA_VERSION,
  type Album,
  type CatalogData,
  type EntityId,
  type Track,
  type UserCatalogChanges
} from "../../types";
import { mergeCatalogChanges } from "./catalogMerge";

export type CatalogEntityIdFactory = () => EntityId;

export type NewAlbumInput = Omit<Album, "id" | "trackIds">;
export type NewTrackInput = Omit<Track, "id">;

function assertNonBlankTitle(title: string, entityName: string): void {
  if (title.trim().length === 0) {
    throw new Error(`${entityName} title must not be empty.`);
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
    ...optionalValue("releaseDate", input.releaseDate),
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
    ...optionalValue("discNumber", input.discNumber),
    ...optionalValue("trackNumber", input.trackNumber),
    ...optionalValue("durationSeconds", input.durationSeconds),
    ...optionalValue("version", input.version),
    ...optionalValue("releaseDate", input.releaseDate),
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
