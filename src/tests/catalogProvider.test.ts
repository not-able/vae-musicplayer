import { describe, expect, it, vi } from "vitest";

import {
  createQqMusicCatalogProvider,
  QqMusicCatalogProviderError
} from "../infra/catalog/qqMusicCatalogProvider";
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
      getArtistAlbums: vi.fn(async (artist) => {
        void artist;
        return [candidate];
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

describe("self-hosted QQ Music metadata provider", () => {
  it("does not issue a request until the caller explicitly tests or searches", async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ endpoints: [] }));
    const provider = createQqMusicCatalogProvider({
      baseUrl: "https://metadata.example.test",
      fetchFn
    });

    expect(fetchFn).not.toHaveBeenCalled();
    await provider.testConnection();
    expect(fetchFn).toHaveBeenCalledOnce();
  });

  it("normalizes only album, artist, and track facts from search and detail responses", async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            album: {
              list: [
                {
                  albumMID: "album-remote-1",
                  albumName: "Remote Album",
                  singerMID: "artist-remote-1",
                  singerName: "Main Artist",
                  cover: "https://not-stored.example.test/cover.jpg"
                }
              ]
            }
          }
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            albumName: "Remote Album",
            singer: [{ singerMID: "artist-remote-1", singerName: "Main Artist" }],
            songlist: [
              {
                songmid: "track-remote-1",
                songname: "First Song",
                singer: [{ singerMID: "artist-remote-1", singerName: "Main Artist" }],
                interval: 245,
                index_album: 1,
                playUrl: "https://not-stored.example.test/audio.mp3"
              }
            ]
          }
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            track_info: {
              songmid: "track-remote-1",
              songname: "First Song",
              singer: [{ singerMID: "artist-remote-1", singerName: "Main Artist" }],
              album: { albumMID: "album-remote-1", albumName: "Remote Album" },
              interval: 245
            }
          }
        })
      );
    const provider = createQqMusicCatalogProvider({
      baseUrl: "https://metadata.example.test/api/",
      fetchFn
    });

    const search = await provider.search({ query: " Main Artist ", limit: 99 });
    const searchAlbum = search.candidates[0];
    if (!searchAlbum || searchAlbum.kind !== "album") {
      throw new Error("Expected an album search candidate.");
    }
    const album = await provider.getAlbum(searchAlbum.reference);
    const albumTrack = album.tracks?.[0];
    if (!albumTrack) {
      throw new Error("Expected an album track.");
    }
    const track = await provider.getTrack(albumTrack.reference);

    expect(search).toEqual({
      candidates: [
        {
          kind: "album",
          reference: {
            providerId: "qq-music-api",
            entityType: "album",
            externalId: "album-remote-1"
          },
          title: "Remote Album",
          artist: {
            kind: "artist",
            reference: {
              providerId: "qq-music-api",
              entityType: "artist",
              externalId: "artist-remote-1"
            },
            name: "Main Artist"
          },
          type: "album"
        }
      ]
    });
    expect(album.tracks).toEqual([
      {
        kind: "track",
        reference: {
          providerId: "qq-music-api",
          entityType: "track",
          externalId: "track-remote-1"
        },
        title: "First Song",
        artist: {
          kind: "artist",
          reference: {
            providerId: "qq-music-api",
            entityType: "artist",
            externalId: "artist-remote-1"
          },
          name: "Main Artist"
        },
        album: {
          reference: {
            providerId: "qq-music-api",
            entityType: "album",
            externalId: "album-remote-1"
          },
          title: "Remote Album",
          type: "album"
        },
        trackNumber: 1,
        durationSeconds: 245
      }
    ]);
    expect(track).toMatchObject({
      title: "First Song",
      reference: { externalId: "track-remote-1" }
    });
    expect(JSON.stringify({ search, album, track })).not.toContain("cover");
    expect(JSON.stringify({ search, album, track })).not.toContain("playUrl");

    expect(new URL(fetchFn.mock.calls[0]?.[0] as string).pathname).toBe(
      "/api/getSearchByKey"
    );
    expect(
      new URL(fetchFn.mock.calls[0]?.[0] as string).searchParams.get("limit")
    ).toBe("50");
  });

  it("loads an artist's album list without requiring artwork or playback fields", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        data: {
          list: [
            {
              albumMID: "album-remote-2",
              albumName: "Another Remote Album",
              cover: "https://not-stored.example.test/cover.jpg"
            }
          ]
        }
      })
    );
    const provider = createQqMusicCatalogProvider({
      baseUrl: "https://metadata.example.test",
      fetchFn
    });
    const artist = {
      kind: "artist" as const,
      reference: {
        providerId: "qq-music-api",
        entityType: "artist" as const,
        externalId: "artist-remote-1"
      },
      name: "Main Artist"
    };

    await expect(provider.getArtistAlbums(artist)).resolves.toEqual([
      {
        kind: "album",
        reference: {
          providerId: "qq-music-api",
          entityType: "album",
          externalId: "album-remote-2"
        },
        title: "Another Remote Album",
        artist,
        type: "album"
      }
    ]);
    expect(new URL(fetchFn.mock.calls[0]?.[0] as string).pathname).toBe(
      "/getSingerAlbum/artist-remote-1"
    );
  });

  it("returns an empty candidate list but rejects malformed and failed responses", async () => {
    const emptyProvider = createQqMusicCatalogProvider({
      baseUrl: "https://metadata.example.test",
      fetchFn: vi
        .fn<typeof fetch>()
        .mockResolvedValue(jsonResponse({ data: { album: { list: [] } } }))
    });
    const malformedProvider = createQqMusicCatalogProvider({
      baseUrl: "https://metadata.example.test",
      fetchFn: vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ data: {} }))
    });
    const failedProvider = createQqMusicCatalogProvider({
      baseUrl: "https://metadata.example.test",
      fetchFn: vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({}, 502))
    });

    await expect(emptyProvider.search({ query: "Main Artist" })).resolves.toEqual({
      candidates: []
    });
    await expect(
      malformedProvider.search({ query: "Main Artist" })
    ).rejects.toMatchObject({
      code: "invalid_response"
    } satisfies Partial<QqMusicCatalogProviderError>);
    await expect(failedProvider.search({ query: "Main Artist" })).rejects.toMatchObject(
      {
        code: "http"
      } satisfies Partial<QqMusicCatalogProviderError>
    );
  });

  it("converts an aborted request into an understandable timeout", async () => {
    vi.useFakeTimers();
    const fetchFn = vi.fn<typeof fetch>(
      (_input, init) =>
        new Promise((_, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError"))
          );
        })
    );
    const provider = createQqMusicCatalogProvider({
      baseUrl: "https://metadata.example.test",
      fetchFn,
      timeoutMs: 1
    });

    const pending = provider.search({ query: "Main Artist" });
    const expectation = expect(pending).rejects.toMatchObject({ code: "timeout" });
    await vi.advanceTimersByTimeAsync(1);

    await expectation;
    vi.useRealTimers();
  });
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
