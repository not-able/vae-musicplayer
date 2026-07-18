import { describe, expect, it, vi } from "vitest";

import {
  createCatalogImportDraft,
  previewCatalogImport
} from "../features/catalog/catalogImport";
import type {
  CatalogProvider,
  CatalogProviderAlbumCandidate,
  CatalogProviderSearchRequest,
  CatalogProviderTrackCandidate
} from "../features/catalog/catalogProvider";
import type { CatalogData } from "../types";

const providerId = "memory-catalog";

function createAlbumCandidate(): CatalogProviderAlbumCandidate {
  const artist = {
    kind: "artist" as const,
    reference: { providerId, entityType: "artist" as const, externalId: "artist-1" },
    name: " Main Artist ",
    aliases: ["M. Artist", "M. Artist", "Main Artist"]
  };

  return {
    kind: "album",
    reference: { providerId, entityType: "album", externalId: "album-1" },
    title: " Remote Album ",
    artist,
    type: "album",
    tracks: [
      {
        kind: "track",
        reference: { providerId, entityType: "track", externalId: "track-1" },
        title: " First Song ",
        artist,
        trackNumber: 1,
        durationSeconds: 245
      },
      {
        kind: "track",
        reference: { providerId, entityType: "track", externalId: "track-2" },
        title: "Second Song",
        artist,
        trackNumber: 2
      }
    ]
  };
}

function createCatalog(): CatalogData {
  return {
    schemaVersion: 1,
    artists: [{ id: "artist_local", name: "Main Artist" }],
    albums: [
      {
        id: "album_local",
        artistId: "artist_local",
        title: "Remote Album",
        type: "album",
        sortOrder: 1,
        trackIds: ["track_local"]
      }
    ],
    tracks: [
      {
        id: "track_local",
        artistId: "artist_local",
        albumId: "album_local",
        title: "First Song",
        trackNumber: 1
      }
    ]
  };
}

describe("catalog provider contract", () => {
  it("does not perform a provider request until a caller explicitly searches", async () => {
    const candidate = createAlbumCandidate();
    const provider = {
      descriptor: {
        id: providerId,
        displayName: "Memory provider",
        capabilities: { search: true, albumDetails: true, trackDetails: true }
      },
      search: vi.fn(async (request: CatalogProviderSearchRequest) => {
        void request;
        return { candidates: [candidate] };
      }),
      getAlbum: vi.fn(async (reference: CatalogProviderAlbumCandidate["reference"]) => {
        void reference;
        return candidate;
      }),
      getTrack: vi.fn(async (reference: CatalogProviderTrackCandidate["reference"]) => {
        void reference;
        return candidate.tracks?.[0] as NonNullable<typeof candidate.tracks>[number];
      })
    } satisfies CatalogProvider;

    const firstTrack = candidate.tracks?.[0];
    if (!firstTrack) {
      throw new Error("Test album should include a track.");
    }

    expect(provider.search).not.toHaveBeenCalled();
    expect(provider.getAlbum).not.toHaveBeenCalled();
    expect(provider.getTrack).not.toHaveBeenCalled();
    const result = await provider.search({ query: "Main Artist" });
    const album = await provider.getAlbum(candidate.reference);
    const track = await provider.getTrack(firstTrack.reference);

    expect(result.candidates).toEqual([candidate]);
    expect(album).toEqual(candidate);
    expect(track).toEqual(firstTrack);
    expect(provider.search).toHaveBeenCalledOnce();
    expect(provider.getAlbum).toHaveBeenCalledOnce();
    expect(provider.getTrack).toHaveBeenCalledOnce();
  });

  it("normalizes a provider album into an import draft without creating local IDs", () => {
    const draft = createCatalogImportDraft(createAlbumCandidate());

    expect(draft).toEqual({
      artist: {
        name: "Main Artist",
        aliases: ["M. Artist"],
        providerReference: {
          providerId,
          entityType: "artist",
          externalId: "artist-1"
        }
      },
      album: {
        title: "Remote Album",
        providerReference: {
          providerId,
          entityType: "album",
          externalId: "album-1"
        },
        type: "album",
        tracks: [
          {
            title: "First Song",
            providerReference: {
              providerId,
              entityType: "track",
              externalId: "track-1"
            },
            trackNumber: 1,
            durationSeconds: 245
          },
          {
            title: "Second Song",
            providerReference: {
              providerId,
              entityType: "track",
              externalId: "track-2"
            },
            trackNumber: 2
          }
        ]
      }
    });
    expect(JSON.stringify(draft)).not.toContain("local_");
  });

  it("previews possible local matches without mutating catalog data or IDs", () => {
    const catalog = createCatalog();
    const original = structuredClone(catalog);
    const preview = previewCatalogImport(
      catalog,
      createCatalogImportDraft(createAlbumCandidate())
    );

    expect(preview.differences).toEqual([
      {
        kind: "artist",
        title: "Main Artist",
        status: "possible_existing",
        localEntityIds: ["artist_local"]
      },
      {
        kind: "album",
        title: "Remote Album",
        status: "possible_existing",
        localEntityIds: ["album_local"]
      },
      {
        kind: "track",
        title: "First Song",
        status: "possible_existing",
        localEntityIds: ["track_local"]
      },
      {
        kind: "track",
        title: "Second Song",
        status: "new",
        localEntityIds: []
      }
    ]);
    expect(catalog).toEqual(original);
  });

  it("rejects malformed or duplicate provider references before an import can be shown", () => {
    const duplicateTracks = createAlbumCandidate();
    const duplicateReference = duplicateTracks.tracks?.[0]?.reference;
    const malformedAlbum = {
      ...createAlbumCandidate(),
      reference: { providerId, entityType: "track" as const, externalId: "wrong-kind" }
    };

    expect(() =>
      createCatalogImportDraft({
        ...duplicateTracks,
        tracks: [
          ...(duplicateTracks.tracks ?? []),
          {
            ...(duplicateTracks.tracks?.[1] as NonNullable<
              typeof duplicateTracks.tracks
            >[number]),
            reference: duplicateReference as NonNullable<typeof duplicateReference>
          }
        ]
      })
    ).toThrow("must not repeat");
    expect(() =>
      createCatalogImportDraft(
        malformedAlbum as unknown as CatalogProviderAlbumCandidate
      )
    ).toThrow("Invalid album provider reference");
  });
});
