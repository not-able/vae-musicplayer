import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

import { mockCatalog } from "../data/catalog/mockCatalog";
import { CatalogOverview } from "../features/catalog/CatalogOverview";
import {
  getAlbumTracks,
  getReleaseYear,
  getSortedAlbums
} from "../features/catalog/catalog";
import type { Album, CatalogData } from "../types";

describe("catalog helpers", () => {
  it("sorts albums by their maintained sort order without mutating catalog data", () => {
    const reversedCatalog: CatalogData = {
      ...mockCatalog,
      albums: [...mockCatalog.albums].reverse()
    };
    const originalIds = reversedCatalog.albums.map((album) => album.id);

    expect(getSortedAlbums(reversedCatalog).map((album) => album.id)).toEqual([
      "album_sample_001",
      "album_sample_002"
    ]);
    expect(reversedCatalog.albums.map((album) => album.id)).toEqual(originalIds);
  });

  it("returns only referenced tracks for the selected album in disc and track order", () => {
    const album: Album = {
      ...mockCatalog.albums[0],
      trackIds: [
        "track_sample_002",
        "track_missing",
        "track_sample_003",
        "track_sample_001"
      ]
    };

    expect(getAlbumTracks(mockCatalog, album).map((track) => track.id)).toEqual([
      "track_sample_001",
      "track_sample_002"
    ]);
  });

  it("reads a release year only from a supported date value", () => {
    expect(getReleaseYear("2000-01-01")).toBe("2000");
    expect(getReleaseYear("2000")).toBe("2000");
    expect(getReleaseYear("待核对")).toBeUndefined();
    expect(getReleaseYear()).toBeUndefined();
  });
});

describe("mock catalog integrity", () => {
  it("uses unique IDs and valid artist, album, and track references", () => {
    const artistIds = mockCatalog.artists.map((artist) => artist.id);
    const albumIds = mockCatalog.albums.map((album) => album.id);
    const trackIds = mockCatalog.tracks.map((track) => track.id);
    const artistIdSet = new Set(artistIds);
    const albumIdSet = new Set(albumIds);
    const trackIdSet = new Set(trackIds);

    expect(artistIdSet.size).toBe(artistIds.length);
    expect(albumIdSet.size).toBe(albumIds.length);
    expect(trackIdSet.size).toBe(trackIds.length);

    for (const album of mockCatalog.albums) {
      expect(artistIdSet.has(album.artistId)).toBe(true);

      for (const trackId of album.trackIds) {
        const track = mockCatalog.tracks.find((item) => item.id === trackId);

        expect(trackIdSet.has(trackId)).toBe(true);
        expect(track?.albumId).toBe(album.id);
      }
    }

    for (const track of mockCatalog.tracks) {
      expect(artistIdSet.has(track.artistId)).toBe(true);
      expect(albumIdSet.has(track.albumId)).toBe(true);
    }
  });
});

describe("catalog browsing", () => {
  it("shows the selected album and its tracks after an album click", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const onAddTrack = vi.fn();
    const onAddAlbum = vi.fn();
    const onBindAudio = vi.fn().mockResolvedValue(true);
    const onUnbindAudio = vi.fn().mockResolvedValue(true);

    await act(async () => {
      root.render(
        createElement(CatalogOverview, {
          catalog: mockCatalog,
          audioBindings: new Map(),
          pendingAudioTrackIds: new Set<string>(),
          audioLibraryStatus: "ready",
          onAddTrack,
          onAddAlbum,
          onBindAudio,
          onUnbindAudio
        })
      );
    });

    const secondAlbumButton = Array.from(
      container.querySelectorAll<HTMLButtonElement>(".album-list-button")
    ).find((button) => button.textContent?.includes("示例专辑 B"));

    expect(secondAlbumButton).toBeDefined();

    await act(async () => {
      secondAlbumButton?.click();
    });

    expect(container.querySelector("#album-detail-heading")?.textContent).toBe(
      "示例专辑 B"
    );
    expect(container.querySelector(".album-track-list")?.textContent).toContain(
      "示例歌曲三"
    );
    expect(container.querySelector(".album-track-list")?.textContent).not.toContain(
      "示例歌曲一"
    );

    await act(async () => {
      container.querySelector<HTMLButtonElement>(".add-album-button")?.click();
      container.querySelector<HTMLButtonElement>(".add-track-button")?.click();
    });

    expect(onAddAlbum).toHaveBeenCalledWith("album_sample_002");
    expect(onAddTrack).toHaveBeenCalledWith("track_sample_003");

    await act(async () => {
      root.unmount();
    });
  });
});
