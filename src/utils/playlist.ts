import type {
  Album,
  EntityId,
  ISODateString,
  PlaylistItem,
  PlaylistItemSource,
  PlaySequenceEntry,
  TemporaryPlaylist
} from "../types";

export const DEFAULT_REPEAT_COUNT = 1;
export const MAX_REPEAT_COUNT = 99;

export type RepeatCountInputResult =
  | { isValid: true; value: number }
  | {
      isValid: false;
      reason: "required" | "not-positive-integer" | "exceeds-maximum";
    };

interface CreateTemporaryPlaylistInput {
  id: EntityId;
  name?: string;
  createdAt: ISODateString;
}

interface AddTrackToPlaylistInput {
  trackId: EntityId;
  itemId: EntityId;
  addedAt: ISODateString;
  source?: PlaylistItemSource;
  sourceAlbumId?: EntityId;
}

interface AddAlbumToPlaylistInput {
  album: Album;
  itemIds: EntityId[];
  addedAt: ISODateString;
}

export function createTemporaryPlaylist({
  id,
  name = "临时歌单",
  createdAt
}: CreateTemporaryPlaylistInput): TemporaryPlaylist {
  return {
    id,
    name,
    itemIds: [],
    itemsById: {},
    createdAt,
    updatedAt: createdAt
  };
}

export function isValidRepeatCount(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= DEFAULT_REPEAT_COUNT &&
    value <= MAX_REPEAT_COUNT
  );
}

export function parseRepeatCountInput(value: string): RepeatCountInputResult {
  const trimmedValue = value.trim();

  if (trimmedValue.length === 0) {
    return { isValid: false, reason: "required" };
  }

  if (!/^\d+$/.test(trimmedValue)) {
    return { isValid: false, reason: "not-positive-integer" };
  }

  const repeatCount = Number(trimmedValue);

  if (!Number.isSafeInteger(repeatCount) || repeatCount < DEFAULT_REPEAT_COUNT) {
    return { isValid: false, reason: "not-positive-integer" };
  }

  if (repeatCount > MAX_REPEAT_COUNT) {
    return { isValid: false, reason: "exceeds-maximum" };
  }

  return { isValid: true, value: repeatCount };
}

export function normalizeRepeatCount(value: unknown): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < DEFAULT_REPEAT_COUNT
  ) {
    return DEFAULT_REPEAT_COUNT;
  }

  return Math.min(value, MAX_REPEAT_COUNT);
}

export function addTrackToPlaylist(
  playlist: TemporaryPlaylist,
  {
    trackId,
    itemId,
    addedAt,
    source = "single",
    sourceAlbumId
  }: AddTrackToPlaylistInput
): TemporaryPlaylist {
  const item: PlaylistItem = {
    id: itemId,
    trackId,
    repeatCount: DEFAULT_REPEAT_COUNT,
    playedCount: 0,
    source,
    sourceAlbumId,
    addedAt
  };

  return appendPlaylistItems(playlist, [item], addedAt);
}

export function addAlbumToPlaylist(
  playlist: TemporaryPlaylist,
  { album, itemIds, addedAt }: AddAlbumToPlaylistInput
): TemporaryPlaylist {
  if (itemIds.length !== album.trackIds.length) {
    throw new Error("Each album track requires one playlist item ID.");
  }

  const items = album.trackIds.map<PlaylistItem>((trackId, index) => ({
    id: itemIds[index],
    trackId,
    repeatCount: DEFAULT_REPEAT_COUNT,
    playedCount: 0,
    source: "album",
    sourceAlbumId: album.id,
    addedAt
  }));

  return appendPlaylistItems(playlist, items, addedAt);
}

export function updatePlaylistItemRepeatCount(
  playlist: TemporaryPlaylist,
  itemId: EntityId,
  repeatCount: number,
  updatedAt: ISODateString
): TemporaryPlaylist {
  const item = playlist.itemsById[itemId];

  if (!item) {
    return playlist;
  }

  if (!isValidRepeatCount(repeatCount) || item.repeatCount === repeatCount) {
    return playlist;
  }

  return {
    ...playlist,
    itemsById: {
      ...playlist.itemsById,
      [itemId]: {
        ...item,
        repeatCount
      }
    },
    updatedAt
  };
}

export function removePlaylistItem(
  playlist: TemporaryPlaylist,
  itemId: EntityId,
  updatedAt: ISODateString
): TemporaryPlaylist {
  if (!playlist.itemsById[itemId]) {
    return playlist;
  }

  return {
    ...playlist,
    itemIds: playlist.itemIds.filter((currentItemId) => currentItemId !== itemId),
    itemsById: Object.fromEntries(
      Object.entries(playlist.itemsById).filter(
        ([currentItemId]) => currentItemId !== itemId
      )
    ),
    updatedAt
  };
}

export function clearTemporaryPlaylist(
  playlist: TemporaryPlaylist,
  updatedAt: ISODateString
): TemporaryPlaylist {
  if (playlist.itemIds.length === 0) {
    return playlist;
  }

  return {
    ...playlist,
    itemIds: [],
    itemsById: {},
    updatedAt
  };
}

export function movePlaylistItem(
  playlist: TemporaryPlaylist,
  itemId: EntityId,
  toIndex: number,
  updatedAt: ISODateString
): TemporaryPlaylist {
  const fromIndex = playlist.itemIds.indexOf(itemId);

  if (
    fromIndex === -1 ||
    toIndex < 0 ||
    toIndex >= playlist.itemIds.length ||
    fromIndex === toIndex
  ) {
    return playlist;
  }

  return {
    ...playlist,
    itemIds: moveItem(playlist.itemIds, fromIndex, toIndex),
    updatedAt
  };
}

export function expandPlaylistToPlaySequence(
  playlist: TemporaryPlaylist
): PlaySequenceEntry[] {
  return playlist.itemIds.flatMap((queueItemId) => {
    const item = playlist.itemsById[queueItemId];

    if (!item) {
      return [];
    }

    const repeatTotal = normalizeRepeatCount(item.repeatCount);

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

function appendPlaylistItems(
  playlist: TemporaryPlaylist,
  items: PlaylistItem[],
  updatedAt: ISODateString
): TemporaryPlaylist {
  if (items.length === 0) {
    return playlist;
  }

  const newItemIds = items.map((item) => item.id);
  const hasDuplicateItemId =
    new Set(newItemIds).size !== newItemIds.length ||
    newItemIds.some((itemId) => playlist.itemsById[itemId]);

  if (hasDuplicateItemId) {
    throw new Error("Playlist item IDs must be unique.");
  }

  return {
    ...playlist,
    itemIds: [...playlist.itemIds, ...newItemIds],
    itemsById: {
      ...playlist.itemsById,
      ...Object.fromEntries(items.map((item) => [item.id, item]))
    },
    updatedAt
  };
}
