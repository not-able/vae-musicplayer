import type { CatalogData, EntityId } from "../../types";
import type {
  CatalogProviderAlbumCandidate,
  CatalogProviderArtistCandidate,
  CatalogProviderTrackCandidate
} from "./catalogProvider";

export interface CatalogImportArtistDraft {
  name: string;
  aliases: readonly string[];
  providerReference: CatalogProviderArtistCandidate["reference"];
}

export interface CatalogImportTrackDraft {
  title: string;
  providerReference: CatalogProviderTrackCandidate["reference"];
  trackNumber?: number;
  durationSeconds?: number;
}

export interface CatalogImportAlbumDraft {
  title: string;
  providerReference: CatalogProviderAlbumCandidate["reference"];
  type?: CatalogProviderAlbumCandidate["type"];
  tracks: readonly CatalogImportTrackDraft[];
}

export interface CatalogImportDraft {
  artist: CatalogImportArtistDraft;
  album: CatalogImportAlbumDraft;
}

export type CatalogImportDifferenceKind = "artist" | "album" | "track";
export type CatalogImportDifferenceStatus = "new" | "possible_existing";

export interface CatalogImportDifference {
  kind: CatalogImportDifferenceKind;
  title: string;
  status: CatalogImportDifferenceStatus;
  localEntityIds: readonly EntityId[];
}

export interface CatalogImportPreview {
  draft: CatalogImportDraft;
  differences: readonly CatalogImportDifference[];
}

export function createCatalogImportDraft(
  candidate: CatalogProviderAlbumCandidate
): CatalogImportDraft {
  const artist = normalizeArtist(candidate.artist);
  const albumReference = normalizeReference(candidate.reference, "album");
  if (artist.providerReference.providerId !== albumReference.providerId) {
    throw new Error("Album artist and album reference must use the same provider.");
  }
  const tracks = (candidate.tracks ?? []).map((track) => {
    assertSameArtist(artist.providerReference.providerId, track.artist);
    const trackReference = normalizeReference(track.reference, "track");
    if (trackReference.providerId !== albumReference.providerId) {
      throw new Error("Album tracks must use the same provider as the album.");
    }
    assertOptionalPositiveSafeInteger(track.trackNumber, "Track number");
    assertOptionalDuration(track.durationSeconds);

    return {
      title: normalizeRequiredText(track.title, "Track title"),
      providerReference: trackReference,
      ...(track.trackNumber === undefined ? {} : { trackNumber: track.trackNumber }),
      ...(track.durationSeconds === undefined
        ? {}
        : { durationSeconds: track.durationSeconds })
    };
  });

  assertUniqueTrackReferences(tracks);

  return {
    artist,
    album: {
      title: normalizeRequiredText(candidate.title, "Album title"),
      providerReference: albumReference,
      ...(candidate.type === undefined ? {} : { type: candidate.type }),
      tracks
    }
  };
}

export function previewCatalogImport(
  catalog: CatalogData,
  draft: CatalogImportDraft
): CatalogImportPreview {
  const artistKey = normalizeCatalogImportKey(draft.artist.name);
  const matchingArtistIds = catalog.artists
    .filter((artist) =>
      [artist.name, ...(artist.aliases ?? [])].some(
        (name) => normalizeCatalogImportKey(name) === artistKey
      )
    )
    .map((artist) => artist.id);
  const albumKey = normalizeCatalogImportKey(draft.album.title);
  const matchingAlbumIds = catalog.albums
    .filter(
      (album) =>
        normalizeCatalogImportKey(album.title) === albumKey &&
        (matchingArtistIds.length === 0 || matchingArtistIds.includes(album.artistId))
    )
    .map((album) => album.id);

  return {
    draft,
    differences: [
      createDifference("artist", draft.artist.name, matchingArtistIds),
      createDifference("album", draft.album.title, matchingAlbumIds),
      ...draft.album.tracks.map((track) => {
        const trackKey = normalizeCatalogImportKey(track.title);
        const matchingTrackIds = catalog.tracks
          .filter(
            (existingTrack) =>
              normalizeCatalogImportKey(existingTrack.title) === trackKey &&
              (matchingAlbumIds.length === 0 ||
                matchingAlbumIds.includes(existingTrack.albumId)) &&
              (matchingArtistIds.length === 0 ||
                matchingArtistIds.includes(existingTrack.artistId))
          )
          .map((existingTrack) => existingTrack.id);

        return createDifference("track", track.title, matchingTrackIds);
      })
    ]
  };
}

export function normalizeCatalogImportKey(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
}

function normalizeArtist(
  artist: CatalogProviderArtistCandidate
): CatalogImportArtistDraft {
  const aliases = (artist.aliases ?? [])
    .map((alias) => normalizeRequiredText(alias, "Artist alias"))
    .filter(
      (alias, index, values) =>
        normalizeCatalogImportKey(alias) !== normalizeCatalogImportKey(artist.name) &&
        values.findIndex(
          (value) =>
            normalizeCatalogImportKey(value) === normalizeCatalogImportKey(alias)
        ) === index
    );

  return {
    name: normalizeRequiredText(artist.name, "Artist name"),
    aliases,
    providerReference: normalizeReference(artist.reference, "artist")
  };
}

function normalizeReference<
  T extends { providerId: string; entityType: string; externalId: string }
>(reference: T, expectedEntityType: string): T {
  if (
    !reference.providerId.trim() ||
    !reference.externalId.trim() ||
    reference.entityType !== expectedEntityType
  ) {
    throw new Error(`Invalid ${expectedEntityType} provider reference.`);
  }

  return {
    ...reference,
    providerId: reference.providerId.trim(),
    externalId: reference.externalId.trim()
  };
}

function normalizeRequiredText(value: string, fieldName: string): string {
  const normalized = value.normalize("NFKC").replace(/\s+/g, " ").trim();

  if (!normalized) {
    throw new Error(`${fieldName} must not be empty.`);
  }

  return normalized;
}

function assertSameArtist(
  providerId: string,
  artist: CatalogProviderArtistCandidate
): void {
  const reference = normalizeReference(artist.reference, "artist");

  if (reference.providerId !== providerId) {
    throw new Error("Album tracks must use the same provider as the album artist.");
  }
}

function assertOptionalPositiveSafeInteger(
  value: number | undefined,
  fieldName: string
): void {
  if (
    value !== undefined &&
    (!Number.isSafeInteger(value) || value <= 0 || Object.is(value, -0))
  ) {
    throw new Error(`${fieldName} must be a positive integer.`);
  }
}

function assertOptionalDuration(value: number | undefined): void {
  if (
    value !== undefined &&
    (!Number.isFinite(value) || value < 0 || Object.is(value, -0))
  ) {
    throw new Error("Track duration must be a non-negative finite number.");
  }
}

function assertUniqueTrackReferences(tracks: readonly CatalogImportTrackDraft[]): void {
  const references = new Set<string>();

  for (const track of tracks) {
    const key = `${track.providerReference.providerId}:${track.providerReference.externalId}`;
    if (references.has(key)) {
      throw new Error("Album tracks must not repeat a provider track reference.");
    }
    references.add(key);
  }
}

function createDifference(
  kind: CatalogImportDifferenceKind,
  title: string,
  localEntityIds: readonly EntityId[]
): CatalogImportDifference {
  return {
    kind,
    title,
    status: localEntityIds.length === 0 ? "new" : "possible_existing",
    localEntityIds
  };
}
