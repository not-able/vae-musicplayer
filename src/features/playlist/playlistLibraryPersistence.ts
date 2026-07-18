import {
  PLAYLIST_LIBRARY_SCHEMA_VERSION,
  type EntityId,
  type PlaylistDocument,
  type PlaylistLibrary,
  type StoredPlaylistLibrary,
  type StoredTemporaryPlaylist
} from "../../types";
import {
  PlaylistPersistenceError,
  parseStoredTemporaryPlaylist,
  serializeTemporaryPlaylist
} from "./playlistPersistence";

const storedPlaylistLibraryKeys = [
  "schemaVersion",
  "temporaryPlaylist",
  "savedPlaylistIds",
  "savedPlaylistsById"
] as const;

export function serializePlaylistLibrary(
  library: PlaylistLibrary
): StoredPlaylistLibrary {
  try {
    assertUniqueIds(library.savedPlaylistIds, "歌单库 savedPlaylistIds");
    assertSameIdSet(
      library.savedPlaylistIds,
      readStringKeys(library.savedPlaylistsById, "歌单库 savedPlaylistsById"),
      "歌单库 savedPlaylistIds 与 savedPlaylistsById"
    );

    const temporaryPlaylist = serializeTemporaryPlaylist(library.temporaryPlaylist);
    const savedPlaylistsById: Record<EntityId, StoredTemporaryPlaylist> = {};

    for (const savedPlaylistId of library.savedPlaylistIds) {
      if (savedPlaylistId === temporaryPlaylist.id) {
        throw invalidData("已保存歌单 ID 不能与临时歌单 ID 相同。");
      }

      const savedPlaylist = library.savedPlaylistsById[savedPlaylistId];

      if (!savedPlaylist) {
        throw invalidData(`歌单库缺少已保存歌单：${savedPlaylistId}。`);
      }

      assertRequiredSavedPlaylistName(savedPlaylist.name, savedPlaylistId);

      const serializedPlaylist = serializeTemporaryPlaylist(savedPlaylist);

      if (serializedPlaylist.id !== savedPlaylistId) {
        throw invalidData(
          `已保存歌单 ${savedPlaylistId} 的文档 ID 必须与索引 ID 一致。`
        );
      }

      savedPlaylistsById[savedPlaylistId] = serializedPlaylist;
    }

    return {
      schemaVersion: PLAYLIST_LIBRARY_SCHEMA_VERSION,
      temporaryPlaylist,
      savedPlaylistIds: [...library.savedPlaylistIds],
      savedPlaylistsById
    };
  } catch (error: unknown) {
    throw normalizePersistenceError(error, "歌单库无法安全序列化。");
  }
}

export function parseStoredPlaylistLibrary(value: unknown): PlaylistLibrary {
  try {
    const record = decodePlainRecord(value, "歌单库存储快照");
    const schemaVersion = readRequired(record, "schemaVersion", "歌单库存储快照");

    if (
      typeof schemaVersion !== "number" ||
      !Number.isSafeInteger(schemaVersion) ||
      schemaVersion <= 0
    ) {
      throw invalidData("歌单库 schemaVersion 必须是正安全整数。");
    }

    if (schemaVersion !== PLAYLIST_LIBRARY_SCHEMA_VERSION) {
      throw new PlaylistPersistenceError(
        "unsupported_schema",
        `不支持的歌单库 schemaVersion：${schemaVersion}。`
      );
    }

    assertOnlyKeys(record, storedPlaylistLibraryKeys, "歌单库存储快照");

    const temporaryPlaylist = parseStoredTemporaryPlaylist(
      readRequired(record, "temporaryPlaylist", "歌单库存储快照")
    );
    const savedPlaylistIds = decodeEntityIdArray(
      readRequired(record, "savedPlaylistIds", "歌单库存储快照"),
      "歌单库存储快照 savedPlaylistIds"
    );
    const savedPlaylistsRecord = decodePlainRecord(
      readRequired(record, "savedPlaylistsById", "歌单库存储快照"),
      "歌单库存储快照 savedPlaylistsById"
    );
    const savedPlaylistKeys = readStringKeys(
      savedPlaylistsRecord,
      "歌单库存储快照 savedPlaylistsById"
    );

    assertUniqueIds(savedPlaylistIds, "歌单库存储快照 savedPlaylistIds");
    assertSameIdSet(
      savedPlaylistIds,
      savedPlaylistKeys,
      "歌单库存储快照 savedPlaylistIds 与 savedPlaylistsById"
    );

    const savedPlaylistsById: Record<EntityId, PlaylistDocument> = {};

    for (const savedPlaylistId of savedPlaylistIds) {
      if (savedPlaylistId === temporaryPlaylist.id) {
        throw invalidData("已保存歌单 ID 不能与临时歌单 ID 相同。");
      }

      const savedPlaylist = parseStoredTemporaryPlaylist(
        savedPlaylistsRecord[savedPlaylistId]
      );

      if (savedPlaylist.id !== savedPlaylistId) {
        throw invalidData(
          `已保存歌单 ${savedPlaylistId} 的文档 ID 必须与索引 ID 一致。`
        );
      }

      assertRequiredSavedPlaylistName(savedPlaylist.name, savedPlaylistId);
      savedPlaylistsById[savedPlaylistId] = savedPlaylist;
    }

    return {
      temporaryPlaylist,
      savedPlaylistIds,
      savedPlaylistsById
    };
  } catch (error: unknown) {
    throw normalizePersistenceError(error, "歌单库存储快照结构无效。");
  }
}

function assertRequiredSavedPlaylistName(name: string, playlistId: EntityId): void {
  if (name.trim().length === 0) {
    throw invalidData(`已保存歌单 ${playlistId} 的名称不能为空。`);
  }
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

function decodeEntityIdArray(value: unknown, path: string): EntityId[] {
  if (!Array.isArray(value)) {
    throw invalidData(`${path} 必须是数组。`);
  }

  return value.map((item, index) => decodeEntityId(item, `${path}[${index}]`));
}

function decodeEntityId(value: unknown, path: string): EntityId {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw invalidData(`${path} 必须是非空字符串。`);
  }

  return value;
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

function assertUniqueIds(ids: readonly EntityId[], path: string): void {
  if (new Set(ids).size !== ids.length) {
    throw invalidData(`${path} 不能包含重复歌单 ID。`);
  }
}

function assertSameIdSet(
  referencedIds: readonly EntityId[],
  storedIds: readonly EntityId[],
  path: string
): void {
  if (
    referencedIds.length !== storedIds.length ||
    referencedIds.some((playlistId) => !storedIds.includes(playlistId))
  ) {
    throw invalidData(`${path} 必须包含完全一致的歌单 ID。`);
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
