import type { AlbumType, CatalogExternalReference, EntityId } from "../../types";

export type CatalogProviderEntityReference<
  TEntityType extends CatalogExternalReference["entityType"]
> = CatalogExternalReference & { entityType: TEntityType };

export interface CatalogProviderDescriptor {
  id: string;
  displayName: string;
  capabilities: Readonly<{
    search: boolean;
    albumDetails: boolean;
    trackDetails: boolean;
  }>;
}

export interface CatalogProviderSearchRequest {
  query: string;
  limit?: number;
}

export interface CatalogProviderArtistCandidate {
  kind: "artist";
  reference: CatalogProviderEntityReference<"artist">;
  name: string;
  aliases?: readonly string[];
}

export interface CatalogProviderAlbumCandidate {
  kind: "album";
  reference: CatalogProviderEntityReference<"album">;
  title: string;
  artist: CatalogProviderArtistCandidate;
  type?: AlbumType;
  tracks?: readonly CatalogProviderTrackCandidate[];
}

export interface CatalogProviderTrackCandidate {
  kind: "track";
  reference: CatalogProviderEntityReference<"track">;
  title: string;
  artist: CatalogProviderArtistCandidate;
  album?: Pick<CatalogProviderAlbumCandidate, "reference" | "title" | "type">;
  trackNumber?: number;
  durationSeconds?: number;
}

export type CatalogProviderSearchCandidate =
  | CatalogProviderArtistCandidate
  | CatalogProviderAlbumCandidate
  | CatalogProviderTrackCandidate;

export interface CatalogProviderSearchResult {
  candidates: readonly CatalogProviderSearchCandidate[];
}

export interface CatalogProvider {
  readonly descriptor: CatalogProviderDescriptor;
  search(request: CatalogProviderSearchRequest): Promise<CatalogProviderSearchResult>;
  getAlbum(
    reference: CatalogProviderEntityReference<"album">
  ): Promise<CatalogProviderAlbumCandidate>;
  getTrack(
    reference: CatalogProviderEntityReference<"track">
  ): Promise<CatalogProviderTrackCandidate>;
}

/**
 * Maps only stable local IDs to provider references after a user confirms an import.
 * It intentionally has no audio URL, cookie, lyric, image, comment, or raw-response field.
 */
export interface CatalogProviderImportReference {
  localEntityId: EntityId;
  reference: CatalogExternalReference;
}
