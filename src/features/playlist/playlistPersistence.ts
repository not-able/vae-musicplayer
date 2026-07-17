import {
  TEMPORARY_PLAYLIST_SCHEMA_VERSION,
  type EntityId,
  type PlaylistItemSource,
  type StoredTemporaryPlaylist,
  type StoredTemporaryPlaylistItem,
  type TemporaryPlaylist
} from "../../types";

export type PlaylistPersistenceErrorCode = "invalid_data" | "unsupported_schema";

export class PlaylistPersistenceError extends Error {
  readonly code: PlaylistPersistenceErrorCode;

  constructor(code: PlaylistPersistenceErrorCode, message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "PlaylistPersistenceError";
    this.code = code;
  }
}

const storedPlaylistKeys = [
  "schemaVersion",
  "id",
  "name",
  "itemIds",
  "items",
  "createdAt",
  "updatedAt"
] as const;

const storedPlaylistItemKeys = [
  "id",
  "trackId",
  "repeatCount",
  "source",
  "sourceAlbumId",
  "addedAt"
] as const;

const playlistItemSources = new Set<PlaylistItemSource>(["single", "album", "manual"]);

// Version 1 keeps this bound stable even if the runtime domain changes later.
const STORED_REPEAT_COUNT_MAX_V1 = 99;

export function serializeTemporaryPlaylist(
  playlist: TemporaryPlaylist
): StoredTemporaryPlaylist {
  try {
    const itemIds = decodeEntityIdArray(playlist.itemIds, "临时歌单 itemIds");
    const itemsById = decodePlainRecord(playlist.itemsById, "临时歌单 itemsById");
    const itemKeys = readStringKeys(itemsById, "临时歌单 itemsById");

    assertUniqueIds(itemIds, "临时歌单 itemIds");
    assertSameIdSet(itemIds, itemKeys, "临时歌单 itemIds 与 itemsById");

    const items = itemIds.map((itemId, index) => {
      const item = decodePlainRecord(itemsById[itemId], `临时歌单 itemsById.${itemId}`);
      const storedItem: Record<string, unknown> = {
        id: item.id,
        trackId: item.trackId,
        repeatCount: item.repeatCount,
        source: item.source,
        addedAt: item.addedAt
      };

      if (hasOwn(item, "sourceAlbumId") && item.sourceAlbumId !== undefined) {
        storedItem.sourceAlbumId = item.sourceAlbumId;
      }

      const decodedItem = decodeStoredPlaylistItem(
        storedItem,
        `临时歌单 items[${index}]`
      );

      if (decodedItem.id !== itemId) {
        throw invalidData(
          `临时歌单 itemsById.${itemId}.id 必须与引用它的队列项 ID 一致。`
        );
      }

      return decodedItem;
    });

    return decodeStoredTemporaryPlaylist({
      schemaVersion: TEMPORARY_PLAYLIST_SCHEMA_VERSION,
      id: playlist.id,
      name: playlist.name,
      itemIds,
      items,
      createdAt: playlist.createdAt,
      updatedAt: playlist.updatedAt
    });
  } catch (error: unknown) {
    throw normalizePersistenceError(error, "临时歌单无法安全序列化。");
  }
}

export function parseStoredTemporaryPlaylist(value: unknown): TemporaryPlaylist {
  try {
    const storedPlaylist = decodeStoredTemporaryPlaylist(value);
    const itemsById = Object.fromEntries(
      storedPlaylist.items.map((item) => [
        item.id,
        {
          ...item,
          // Playback progress is runtime-only and must not resume after a reload.
          playedCount: 0
        }
      ])
    );

    return {
      id: storedPlaylist.id,
      name: storedPlaylist.name,
      itemIds: [...storedPlaylist.itemIds],
      itemsById,
      createdAt: storedPlaylist.createdAt,
      updatedAt: storedPlaylist.updatedAt
    };
  } catch (error: unknown) {
    throw normalizePersistenceError(error, "临时歌单存储快照结构无效。");
  }
}

function decodeStoredTemporaryPlaylist(value: unknown): StoredTemporaryPlaylist {
  const record = decodePlainRecord(value, "临时歌单存储快照");
  const schemaVersion = readRequired(record, "schemaVersion", "临时歌单存储快照");

  if (
    typeof schemaVersion !== "number" ||
    !Number.isSafeInteger(schemaVersion) ||
    schemaVersion <= 0
  ) {
    throw invalidData("临时歌单 schemaVersion 必须是正安全整数。");
  }

  if (schemaVersion !== TEMPORARY_PLAYLIST_SCHEMA_VERSION) {
    throw new PlaylistPersistenceError(
      "unsupported_schema",
      `不支持的临时歌单 schemaVersion：${schemaVersion}。`
    );
  }

  assertOnlyKeys(record, storedPlaylistKeys, "临时歌单存储快照");

  const itemIds = decodeEntityIdArray(
    readRequired(record, "itemIds", "临时歌单存储快照"),
    "临时歌单存储快照 itemIds"
  );
  const items = decodeArray(
    readRequired(record, "items", "临时歌单存储快照"),
    "临时歌单存储快照 items",
    decodeStoredPlaylistItem
  );
  const storedItemIds = items.map((item) => item.id);

  assertUniqueIds(itemIds, "临时歌单存储快照 itemIds");
  assertUniqueIds(storedItemIds, "临时歌单存储快照 items");
  assertSameIdSet(itemIds, storedItemIds, "临时歌单存储快照 itemIds 与 items");

  return {
    schemaVersion: TEMPORARY_PLAYLIST_SCHEMA_VERSION,
    id: decodeEntityId(
      readRequired(record, "id", "临时歌单存储快照"),
      "临时歌单存储快照 id"
    ),
    name: decodeString(
      readRequired(record, "name", "临时歌单存储快照"),
      "临时歌单存储快照 name"
    ),
    itemIds,
    items,
    createdAt: decodeIsoDateString(
      readRequired(record, "createdAt", "临时歌单存储快照"),
      "临时歌单存储快照 createdAt"
    ),
    updatedAt: decodeIsoDateString(
      readRequired(record, "updatedAt", "临时歌单存储快照"),
      "临时歌单存储快照 updatedAt"
    )
  };
}

function decodeStoredPlaylistItem(
  value: unknown,
  path: string
): StoredTemporaryPlaylistItem {
  const record = decodePlainRecord(value, path);
  assertOnlyKeys(record, storedPlaylistItemKeys, path);

  const repeatCount = readRequired(record, "repeatCount", path);

  if (
    typeof repeatCount !== "number" ||
    !Number.isSafeInteger(repeatCount) ||
    repeatCount < 1 ||
    repeatCount > STORED_REPEAT_COUNT_MAX_V1
  ) {
    throw invalidData(`${path}.repeatCount 必须是支持范围内的正整数。`);
  }

  const item: StoredTemporaryPlaylistItem = {
    id: decodeEntityId(readRequired(record, "id", path), `${path}.id`),
    trackId: decodeEntityId(readRequired(record, "trackId", path), `${path}.trackId`),
    repeatCount,
    source: decodePlaylistItemSource(
      readRequired(record, "source", path),
      `${path}.source`
    ),
    addedAt: decodeIsoDateString(
      readRequired(record, "addedAt", path),
      `${path}.addedAt`
    )
  };

  if (hasOwn(record, "sourceAlbumId")) {
    item.sourceAlbumId = decodeEntityId(record.sourceAlbumId, `${path}.sourceAlbumId`);
  }

  return item;
}

function decodeArray<T>(
  value: unknown,
  path: string,
  decodeItem: (item: unknown, itemPath: string) => T
): T[] {
  assertDenseArray(value, path);

  return value.map((item, index) => decodeItem(item, `${path}[${index}]`));
}

function decodeEntityIdArray(value: unknown, path: string): EntityId[] {
  return decodeArray(value, path, decodeEntityId);
}

function decodePlainRecord(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw invalidData(`${path} 必须是对象。`);
  }

  const prototype = Object.getPrototypeOf(value);

  if (prototype !== Object.prototype && prototype !== null) {
    throw invalidData(`${path} 必须是普通对象。`);
  }

  return value as Record<string, unknown>;
}

function assertOnlyKeys(
  record: Record<string, unknown>,
  allowedKeys: readonly string[],
  path: string
): void {
  const allowed = new Set(allowedKeys);

  for (const key of Reflect.ownKeys(record)) {
    if (typeof key !== "string" || !allowed.has(key)) {
      throw invalidData(`${path} 包含不支持的字段：${String(key)}。`);
    }
  }
}

function assertDenseArray(value: unknown, path: string): asserts value is unknown[] {
  if (!Array.isArray(value)) {
    throw invalidData(`${path} 必须是数组。`);
  }

  for (let index = 0; index < value.length; index += 1) {
    if (!hasOwn(value, index)) {
      throw invalidData(`${path} 不能包含空缺项。`);
    }
  }

  for (const key of Reflect.ownKeys(value)) {
    if (key === "length") {
      continue;
    }

    const index = typeof key === "string" ? Number(key) : Number.NaN;
    const isArrayIndex =
      Number.isInteger(index) &&
      index >= 0 &&
      index < value.length &&
      String(index) === key;

    if (!isArrayIndex) {
      throw invalidData(`${path} 包含不支持的数组属性：${String(key)}。`);
    }
  }
}

function readRequired(
  record: Record<string, unknown>,
  key: string,
  path: string
): unknown {
  if (!hasOwn(record, key)) {
    throw invalidData(`${path} 缺少字段：${key}。`);
  }

  return record[key];
}

function readStringKeys(record: Record<string, unknown>, path: string): string[] {
  return Reflect.ownKeys(record).map((key) => {
    if (typeof key !== "string") {
      throw invalidData(`${path} 不能包含 symbol 键。`);
    }

    return key;
  });
}

function decodeEntityId(value: unknown, path: string): EntityId {
  return decodeNonEmptyString(value, path);
}

function decodeString(value: unknown, path: string): string {
  if (typeof value !== "string") {
    throw invalidData(`${path} 必须是字符串。`);
  }

  return value;
}

function decodeNonEmptyString(value: unknown, path: string): string {
  const decodedValue = decodeString(value, path);

  if (decodedValue.trim().length === 0) {
    throw invalidData(`${path} 必须是非空字符串。`);
  }

  return decodedValue;
}

function decodeIsoDateString(value: unknown, path: string): string {
  if (
    typeof value !== "string" ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  ) {
    throw invalidData(`${path} 必须是规范的 ISO 时间字符串。`);
  }

  return value;
}

function decodePlaylistItemSource(value: unknown, path: string): PlaylistItemSource {
  if (
    typeof value !== "string" ||
    !playlistItemSources.has(value as PlaylistItemSource)
  ) {
    throw invalidData(`${path} 不是支持的队列项来源。`);
  }

  return value as PlaylistItemSource;
}

function assertUniqueIds(ids: readonly EntityId[], path: string): void {
  if (new Set(ids).size !== ids.length) {
    throw invalidData(`${path} 不能包含重复队列项 ID。`);
  }
}

function assertSameIdSet(
  referencedIds: readonly EntityId[],
  storedIds: readonly EntityId[],
  path: string
): void {
  if (
    referencedIds.length !== storedIds.length ||
    referencedIds.some((itemId) => !storedIds.includes(itemId))
  ) {
    throw invalidData(`${path} 必须包含完全一致的队列项 ID。`);
  }
}

function hasOwn(value: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function invalidData(message: string, cause?: unknown): PlaylistPersistenceError {
  return new PlaylistPersistenceError("invalid_data", message, cause);
}

function normalizePersistenceError(
  error: unknown,
  message: string
): PlaylistPersistenceError {
  return error instanceof PlaylistPersistenceError
    ? error
    : invalidData(message, error);
}
