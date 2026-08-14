import { describe, expect, it } from "vitest";

import { xuSongOfficialCatalog } from "../data/catalog/xuSongOfficialCatalog";
import { createEmptyUserCatalogChanges } from "../features/catalog/catalogMutations";
import {
  mergeXuSongCanonicalCatalogChanges,
  prepareXuSongCanonicalCatalogChanges,
  XU_SONG_CANONICAL_REFERENCE_PROVIDER
} from "../features/catalog/xuSongCatalogCompatibility";
import type { UserCatalogChanges } from "../types";

describe("canonical Xu Song catalog compatibility", () => {
  it("marks one exact legacy verified import without deleting IDs and hides its duplicate baseline", () => {
    const changes = createLegacyImportChanges("legacy_a");
    const original = structuredClone(changes);
    const legacyAlbumId = changes.addedAlbums[0]?.id;
    const legacyTrackId = changes.addedTracks[0]?.id;
    const prepared = prepareXuSongCanonicalCatalogChanges(changes);
    const merged = mergeXuSongCanonicalCatalogChanges(xuSongOfficialCatalog, prepared);

    expect(changes).toEqual(original);
    expect(prepared).not.toBe(changes);
    expect(prepared.addedAlbums[0]?.id).toBe(legacyAlbumId);
    expect(prepared.addedTracks[0]?.id).toBe(legacyTrackId);
    expect(prepared.externalReferences).toContainEqual({
      localEntityId: legacyAlbumId,
      reference: {
        providerId: XU_SONG_CANONICAL_REFERENCE_PROVIDER,
        entityType: "album",
        externalId: "album_xusong_zidingyi"
      }
    });
    expect(merged.albums.filter((album) => album.title === "自定义")).toEqual([
      expect.objectContaining({ id: legacyAlbumId })
    ]);
    expect(merged.tracks.some((track) => track.id === legacyTrackId)).toBe(true);
    expect(merged.tracks).toHaveLength(xuSongOfficialCatalog.tracks.length);
  });

  it("keeps the source marker through later user edits so legacy binding IDs remain valid", () => {
    const prepared = prepareXuSongCanonicalCatalogChanges(
      createLegacyImportChanges("legacy_edit")
    );
    const legacyAlbum = prepared.addedAlbums[0];
    const legacyTrackId = prepared.addedTracks[0]?.id;

    if (!legacyAlbum || !legacyTrackId) {
      throw new Error("Expected a complete legacy import fixture.");
    }

    const edited: UserCatalogChanges = {
      ...prepared,
      addedAlbums: [{ ...legacyAlbum, title: "自定义（我的版本）" }]
    };
    const merged = mergeXuSongCanonicalCatalogChanges(xuSongOfficialCatalog, edited);

    expect(merged.albums.some((album) => album.id === legacyAlbum.id)).toBe(true);
    expect(merged.albums.some((album) => album.id === "album_xusong_zidingyi")).toBe(
      false
    );
    expect(merged.tracks.some((track) => track.id === legacyTrackId)).toBe(true);
  });

  it("does not guess when two legacy imports match or a user album only shares the title", () => {
    const firstImport = createLegacyImportChanges("legacy_one");
    const secondImport = createLegacyImportChanges("legacy_two");
    const ambiguous: UserCatalogChanges = {
      ...firstImport,
      addedAlbums: [...firstImport.addedAlbums, ...secondImport.addedAlbums],
      addedTracks: [...firstImport.addedTracks, ...secondImport.addedTracks]
    };
    const manualSameTitle: UserCatalogChanges = {
      ...createEmptyUserCatalogChanges(),
      addedAlbums: [
        {
          id: "album_user_same_title",
          artistId: "artist_vae",
          title: "自定义",
          type: "other",
          sortOrder: 12,
          trackIds: []
        }
      ]
    };

    expect(prepareXuSongCanonicalCatalogChanges(ambiguous)).toBe(ambiguous);
    expect(prepareXuSongCanonicalCatalogChanges(manualSameTitle)).toBe(manualSameTitle);
    expect(
      mergeXuSongCanonicalCatalogChanges(xuSongOfficialCatalog, manualSameTitle).albums
    ).toHaveLength(xuSongOfficialCatalog.albums.length + 1);
  });

  it("drops obsolete placeholder deletions without discarding independent user content", () => {
    const changes: UserCatalogChanges = {
      ...createEmptyUserCatalogChanges(),
      addedAlbums: [
        {
          id: "album_user_preserved",
          artistId: "artist_vae",
          title: "用户专辑",
          type: "other",
          sortOrder: 20,
          trackIds: ["track_user_preserved"]
        }
      ],
      addedTracks: [
        {
          id: "track_user_preserved",
          artistId: "artist_vae",
          albumId: "album_user_preserved",
          title: "用户歌曲",
          trackNumber: 1
        }
      ],
      deletedDefaultAlbumIds: ["album_sample_001"],
      deletedDefaultTrackIds: ["track_sample_003"]
    };
    const prepared = prepareXuSongCanonicalCatalogChanges(changes);
    const merged = mergeXuSongCanonicalCatalogChanges(xuSongOfficialCatalog, prepared);

    expect(prepared.deletedDefaultAlbumIds).toEqual([]);
    expect(prepared.deletedDefaultTrackIds).toEqual([]);
    expect(merged.albums.some((album) => album.id === "album_user_preserved")).toBe(
      true
    );
    expect(merged.tracks.some((track) => track.id === "track_user_preserved")).toBe(
      true
    );
    expect(merged.albums.some((album) => album.id.startsWith("album_sample_"))).toBe(
      false
    );
  });

  it("materializes edited placeholder entities only when needed to preserve user changes", () => {
    const changes: UserCatalogChanges = {
      ...createEmptyUserCatalogChanges(),
      addedTracks: [
        {
          id: "track_user_on_legacy_album",
          artistId: "artist_vae",
          albumId: "album_sample_001",
          title: "用户补充歌曲",
          trackNumber: 3
        }
      ],
      albumOverrides: {
        album_sample_001: { title: "用户修改的旧专辑" }
      },
      trackOverrides: {
        track_sample_001: { title: "用户修改的旧歌曲" }
      },
      albumTrackIdAdditions: {
        album_sample_001: ["track_user_on_legacy_album"]
      }
    };
    const prepared = prepareXuSongCanonicalCatalogChanges(changes);
    const merged = mergeXuSongCanonicalCatalogChanges(xuSongOfficialCatalog, prepared);
    const materializedAlbum = merged.albums.find(
      (album) => album.id === "album_sample_001"
    );

    expect(prepared.albumOverrides).toEqual({});
    expect(prepared.trackOverrides).toEqual({});
    expect(prepared.albumTrackIdAdditions).toEqual({});
    expect(materializedAlbum).toMatchObject({
      title: "用户修改的旧专辑",
      trackIds: ["track_sample_001", "track_sample_002", "track_user_on_legacy_album"]
    });
    expect(merged.tracks.find((track) => track.id === "track_sample_001")?.title).toBe(
      "用户修改的旧歌曲"
    );
    expect(
      merged.tracks.some((track) => track.id === "track_user_on_legacy_album")
    ).toBe(true);
  });
});

function createLegacyImportChanges(suffix: string): UserCatalogChanges {
  const canonicalAlbum = xuSongOfficialCatalog.albums[0];
  if (!canonicalAlbum) {
    throw new Error("Canonical catalog fixture is incomplete.");
  }

  const canonicalTracks = canonicalAlbum.trackIds.map((trackId) => {
    const track = xuSongOfficialCatalog.tracks.find((item) => item.id === trackId);
    if (!track) {
      throw new Error(`Missing canonical track: ${trackId}.`);
    }
    return track;
  });
  const legacyAlbumId = `catalog_user_${suffix}_album`;
  const legacyTrackIds = canonicalTracks.map(
    (_, index) => `catalog_user_${suffix}_track_${index + 1}`
  );

  return {
    ...createEmptyUserCatalogChanges(),
    addedAlbums: [
      {
        id: legacyAlbumId,
        artistId: canonicalAlbum.artistId,
        title: canonicalAlbum.title,
        type: "album",
        sortOrder: 12,
        trackIds: legacyTrackIds
      }
    ],
    addedTracks: canonicalTracks.map((track, index) => ({
      id: legacyTrackIds[index] as string,
      artistId: track.artistId,
      albumId: legacyAlbumId,
      title: track.title,
      trackNumber: track.trackNumber
    }))
  };
}
