import type { Album, CatalogData, Track } from "../../types";

export function getSortedAlbums(catalog: CatalogData): Album[] {
  return [...catalog.albums].sort(
    (left, right) =>
      left.sortOrder - right.sortOrder || left.title.localeCompare(right.title)
  );
}

export function getAlbumTracks(catalog: CatalogData, album: Album): Track[] {
  const tracksById = new Map(catalog.tracks.map((track) => [track.id, track]));
  const albumOrder = new Map(album.trackIds.map((trackId, index) => [trackId, index]));

  return album.trackIds
    .map((trackId) => tracksById.get(trackId))
    .filter(
      (track): track is Track => track !== undefined && track.albumId === album.id
    )
    .sort((left, right) => {
      const trackDifference =
        (left.trackNumber ?? Number.MAX_SAFE_INTEGER) -
        (right.trackNumber ?? Number.MAX_SAFE_INTEGER);

      return (
        trackDifference ||
        (albumOrder.get(left.id) ?? 0) - (albumOrder.get(right.id) ?? 0)
      );
    });
}
