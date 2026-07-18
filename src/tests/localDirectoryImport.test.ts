import { describe, expect, it } from "vitest";

import {
  buildLocalDirectoryImportPlan,
  getDefaultDirectoryImportSelection
} from "../features/local-library/localDirectoryImportPlan";
import { scanLocalDirectory } from "../features/local-library/localDirectoryScanner";
import { matchLocalDirectoryCandidates } from "../features/local-library/localTrackMatcher";
import type { CatalogData } from "../types";

function createDirectoryFile(relativePath: string): File {
  const file = new File(
    ["self-created test bytes"],
    relativePath.split("/").at(-1) ?? ""
  );
  Object.defineProperty(file, "webkitRelativePath", { value: relativePath });
  return file;
}

function createCatalog(): CatalogData {
  return {
    schemaVersion: 1,
    artists: [{ id: "artist_main", name: "Main Artist" }],
    albums: [
      {
        id: "album_known",
        artistId: "artist_main",
        title: "Known Album",
        type: "album",
        sortOrder: 1,
        trackIds: ["track_exact", "track_duplicate_a", "track_duplicate_b"]
      }
    ],
    tracks: [
      {
        id: "track_exact",
        artistId: "artist_main",
        albumId: "album_known",
        title: "Exact Song",
        trackNumber: 1
      },
      {
        id: "track_duplicate_a",
        artistId: "artist_main",
        albumId: "album_known",
        title: "Duplicate Song",
        trackNumber: 2
      },
      {
        id: "track_duplicate_b",
        artistId: "artist_main",
        albumId: "album_known",
        title: "Duplicate Song",
        trackNumber: 3
      }
    ]
  };
}

describe("local directory import plan", () => {
  it("defaults only to an exact unbound match", () => {
    const catalog = createCatalog();
    const matches = matchLocalDirectoryCandidates({
      catalog,
      candidates: scanLocalDirectory([
        createDirectoryFile("Known Album/Exact Song.mp3"),
        createDirectoryFile("Known Album/Duplicate Song.flac")
      ]).candidates,
      audioBindingsByTrackId: new Map()
    }).matches;

    expect(
      getDefaultDirectoryImportSelection(matches).selectedCandidateIndexes
    ).toEqual(new Set([0]));
  });

  it("rejects manually selected files that repeat the same target", () => {
    const catalog = createCatalog();
    const matches = matchLocalDirectoryCandidates({
      catalog,
      candidates: scanLocalDirectory([
        createDirectoryFile("Known Album/Exact Song.mp3"),
        createDirectoryFile("Known Album/Exact Song.flac")
      ]).candidates,
      audioBindingsByTrackId: new Map()
    }).matches;

    const plan = buildLocalDirectoryImportPlan({
      catalog,
      matches,
      audioBindingsByTrackId: new Map(),
      defaultArtistId: "artist_main",
      selection: {
        selectedCandidateIndexes: new Set([0, 1]),
        targetTrackIdByCandidateIndex: new Map([
          [0, "track_exact"],
          [1, "track_exact"]
        ]),
        selectedNewAlbumKeys: new Set()
      }
    });

    expect(plan.bindingRequests).toHaveLength(1);
    expect(plan.issues).toHaveLength(1);
  });

  it("creates explicitly selected new albums in stable path order", () => {
    const catalog = createCatalog();
    const matches = matchLocalDirectoryCandidates({
      catalog,
      candidates: scanLocalDirectory([
        createDirectoryFile("New Album/Z Song.mp3"),
        createDirectoryFile("New Album/A Song.flac")
      ]).candidates,
      audioBindingsByTrackId: new Map()
    }).matches;
    const plan = buildLocalDirectoryImportPlan({
      catalog,
      matches,
      audioBindingsByTrackId: new Map(),
      defaultArtistId: "artist_main",
      selection: {
        selectedCandidateIndexes: new Set(),
        targetTrackIdByCandidateIndex: new Map(),
        selectedNewAlbumKeys: new Set(["new_album:new album"])
      }
    });

    expect(plan.selectedAlbumDrafts[0]).toMatchObject({
      title: "New Album",
      artistId: "artist_main",
      tracks: [
        { title: "A Song", trackNumber: 1 },
        { title: "Z Song", trackNumber: 2 }
      ]
    });
    expect(plan.selectedFileCount).toBe(2);
  });

  it("does not create new albums without an existing artist or over a same-title album", () => {
    const catalog = createCatalog();
    const unmatchedMatches = matchLocalDirectoryCandidates({
      catalog,
      candidates: scanLocalDirectory([createDirectoryFile("New Album/New Song.mp3")])
        .candidates,
      audioBindingsByTrackId: new Map()
    }).matches;
    const existingAlbumMatches = matchLocalDirectoryCandidates({
      catalog,
      candidates: scanLocalDirectory([createDirectoryFile("Known Album/New Song.mp3")])
        .candidates,
      audioBindingsByTrackId: new Map()
    }).matches;

    const missingArtistPlan = buildLocalDirectoryImportPlan({
      catalog,
      matches: unmatchedMatches,
      audioBindingsByTrackId: new Map(),
      selection: {
        selectedCandidateIndexes: new Set(),
        targetTrackIdByCandidateIndex: new Map(),
        selectedNewAlbumKeys: new Set(["new_album:new album"])
      }
    });
    const existingAlbumPlan = buildLocalDirectoryImportPlan({
      catalog,
      matches: existingAlbumMatches,
      audioBindingsByTrackId: new Map(),
      defaultArtistId: "artist_main",
      selection: {
        selectedCandidateIndexes: new Set(),
        targetTrackIdByCandidateIndex: new Map(),
        selectedNewAlbumKeys: new Set(["new_album:known album"])
      }
    });

    expect(missingArtistPlan.albumGroups[0]).toMatchObject({
      available: false,
      unavailableReason: "default_artist_unavailable"
    });
    expect(existingAlbumPlan.albumGroups[0]).toMatchObject({
      available: false,
      unavailableReason: "existing_album_with_same_title"
    });
  });
});
