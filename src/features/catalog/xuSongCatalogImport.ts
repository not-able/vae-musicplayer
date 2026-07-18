import { xuSongOfficialCatalog } from "../../data/catalog/xuSongOfficialCatalog";
import type { CatalogData, EntityId } from "../../types";
import type { CatalogDirectoryImportAlbumDraft } from "./useCatalogLibrary";

export type XuSongCatalogImportPlan =
  | {
      status: "ready";
      artistId: EntityId;
      drafts: readonly CatalogDirectoryImportAlbumDraft[];
      skippedAlbumTitles: readonly string[];
    }
  | {
      status: "unavailable";
      errorMessage: string;
    };

export function createXuSongCatalogImportPlan(
  catalog: CatalogData
): XuSongCatalogImportPlan {
  const sourceArtist = xuSongOfficialCatalog.artists[0];
  if (!sourceArtist) {
    return {
      status: "unavailable",
      errorMessage: "内置许嵩目录数据不完整，无法开始导入。"
    };
  }

  const matchingArtists = catalog.artists.filter(
    (artist) => normalizeName(artist.name) === normalizeName(sourceArtist.name)
  );
  if (matchingArtists.length !== 1) {
    return {
      status: "unavailable",
      errorMessage:
        matchingArtists.length === 0
          ? "当前目录中没有“许嵩”艺人，无法确定导入目标。"
          : "当前目录中有多个“许嵩”艺人，无法安全确定导入目标。"
    };
  }

  const artist = matchingArtists[0];
  const existingAlbumTitles = new Set(
    catalog.albums
      .filter((album) => album.artistId === artist.id)
      .map((album) => normalizeName(album.title))
  );
  const skippedAlbumTitles: string[] = [];
  const drafts: CatalogDirectoryImportAlbumDraft[] = [];

  for (const album of xuSongOfficialCatalog.albums) {
    if (existingAlbumTitles.has(normalizeName(album.title))) {
      skippedAlbumTitles.push(album.title);
      continue;
    }

    const tracks = xuSongOfficialCatalog.tracks
      .filter((track) => track.albumId === album.id)
      .sort((left, right) => (left.trackNumber ?? 0) - (right.trackNumber ?? 0))
      .map((track, index) => ({
        sourceId: `xusong-official:${track.id}`,
        title: track.title,
        trackNumber: track.trackNumber ?? index + 1
      }));

    drafts.push({
      artistId: artist.id,
      title: album.title,
      tracks
    });
  }

  return {
    status: "ready",
    artistId: artist.id,
    drafts,
    skippedAlbumTitles
  };
}

function normalizeName(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim().toLocaleLowerCase();
}
