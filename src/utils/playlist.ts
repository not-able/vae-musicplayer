import type { PlaySequenceEntry, TemporaryPlaylist } from "../types";

export const DEFAULT_PLAY_COUNT = 1;
export const MAX_PLAY_COUNT = 99;

export function normalizePlayCount(value: number): number {
  if (!Number.isInteger(value) || value < DEFAULT_PLAY_COUNT) {
    return DEFAULT_PLAY_COUNT;
  }

  return Math.min(value, MAX_PLAY_COUNT);
}

export function expandPlaylistToPlaySequence(
  playlist: TemporaryPlaylist
): PlaySequenceEntry[] {
  return playlist.itemIds.flatMap((queueItemId) => {
    const item = playlist.itemsById[queueItemId];

    if (!item) {
      return [];
    }

    const repeatTotal = normalizePlayCount(item.playCount);

    return Array.from({ length: repeatTotal }, (_, index) => ({
      queueItemId,
      trackId: item.trackId,
      repeatIndex: index + 1,
      repeatTotal
    }));
  });
}

export function moveItem<T>(items: T[], fromIndex: number, toIndex: number): T[] {
  if (
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= items.length ||
    toIndex >= items.length ||
    fromIndex === toIndex
  ) {
    return [...items];
  }

  const nextItems = [...items];
  const [movedItem] = nextItems.splice(fromIndex, 1);
  nextItems.splice(toIndex, 0, movedItem);

  return nextItems;
}
