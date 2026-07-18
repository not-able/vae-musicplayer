import {
  USER_CATALOG_CHANGES_SCHEMA_VERSION,
  type Album,
  type AlbumFieldOverrides,
  type AlbumType,
  type EntityId,
  type Track,
  type TrackFieldOverrides,
  type UserCatalogChanges
} from "../../types";
import {
  CatalogRepositoryError,
  type LocalCatalogRepository
} from "../../features/catalog/localCatalogRepository";
import { createEmptyUserCatalogChanges } from "../../features/catalog/catalogMutations";

export const LOCAL_CATALOG_STORAGE_KEY = "vae-music:user-catalog-changes:v1";

type StorageProvider = () => Storage | undefined;
type StorageSource = Storage | StorageProvider;

const albumTypes = new Set<AlbumType>(["album", "ep", "single_collection", "other"]);

const userCatalogChangeKeys = [
  "schemaVersion",
  "addedAlbums",
  "addedTracks",
  "albumOverrides",
  "trackOverrides",
  "albumTrackIdAdditions",
  "deletedDefaultAlbumIds",
  "deletedDefaultTrackIds",
  "hiddenDefaultAlbumIds",
  "hiddenDefaultTrackIds"
] as const;

// v1 once persisted these fields. They remain accepted only so old records can
// be normalized without discarding unrelated catalog changes.
const legacyAlbumKeys = ["releaseDate"] as const;
const legacyTrackKeys = ["discNumber", "version", "releaseDate"] as const;

const albumKeys = [
  "id",
  "artistId",
  "title",
  "type",
  ...legacyAlbumKeys,
  "sortOrder",
  "trackIds",
  "note"
] as const;

const trackKeys = [
  "id",
  "artistId",
  "albumId",
  "title",
  ...legacyTrackKeys,
  "trackNumber",
  "durationSeconds",
  "note"
] as const;

const albumOverrideKeys = [
  "title",
  "type",
  ...legacyAlbumKeys,
  "sortOrder",
  "note"
] as const;

const trackOverrideKeys = [
  "title",
  ...legacyTrackKeys,
  "trackNumber",
  "durationSeconds",
  "note"
] as const;

export function createLocalStorageCatalogRepository(
  storageSource: StorageSource = getBrowserLocalStorage
): LocalCatalogRepository {
  return {
    async load() {
      const storage = resolveStorage(storageSource, "读取");
      let serializedChanges: string | null;

      try {
        serializedChanges = storage.getItem(LOCAL_CATALOG_STORAGE_KEY);
      } catch (cause: unknown) {
        throw new CatalogRepositoryError(
          "read_failed",
          "读取用户目录本地数据失败。",
          cause
        );
      }

      if (serializedChanges === null) {
        return createEmptyUserCatalogChanges();
      }

      let parsedChanges: unknown;
      try {
        parsedChanges = JSON.parse(serializedChanges);
      } catch (cause: unknown) {
        throw new CatalogRepositoryError(
          "invalid_json",
          "用户目录本地数据不是有效的 JSON。",
          cause
        );
      }

      return parseUserCatalogChanges(parsedChanges);
    },

    async save(changes) {
      const normalizedChanges = parseUserCatalogChanges(changes);
      let serializedChanges: string;

      try {
        const serialized = JSON.stringify(normalizedChanges);

        if (serialized === undefined) {
          throw new Error("JSON serialization returned undefined.");
        }
        serializedChanges = serialized;
      } catch (cause: unknown) {
        throw new CatalogRepositoryError(
          "invalid_data",
          "用户目录数据无法安全序列化。",
          cause
        );
      }

      const storage = resolveStorage(storageSource, "保存");
      try {
        storage.setItem(LOCAL_CATALOG_STORAGE_KEY, serializedChanges);
      } catch (cause: unknown) {
        throw new CatalogRepositoryError(
          "write_failed",
          "保存用户目录本地数据失败。",
          cause
        );
      }
    },

    async clear() {
      const storage = resolveStorage(storageSource, "清除");

      try {
        storage.removeItem(LOCAL_CATALOG_STORAGE_KEY);
      } catch (cause: unknown) {
        throw new CatalogRepositoryError(
          "clear_failed",
          "清除用户目录本地数据失败。",
          cause
        );
      }
    }
  };
}

export const localStorageCatalogRepository = createLocalStorageCatalogRepository();

function getBrowserLocalStorage(): Storage | undefined {
  return globalThis.localStorage;
}

function resolveStorage(storageSource: StorageSource, operation: string): Storage {
  let storage: Storage | undefined;

  try {
    storage = typeof storageSource === "function" ? storageSource() : storageSource;
  } catch (cause: unknown) {
    throw new CatalogRepositoryError(
      "storage_unavailable",
      `${operation}用户目录时无法访问浏览器本地存储。`,
      cause
    );
  }

  if (storage === undefined) {
    throw new CatalogRepositoryError(
      "storage_unavailable",
      `${operation}用户目录时浏览器未提供本地存储。`
    );
  }

  return storage;
}

export function parseUserCatalogChanges(value: unknown): UserCatalogChanges {
  try {
    const record = decodePlainRecord(value, "用户目录数据");
    const schemaVersion = readRequired(record, "schemaVersion", "用户目录数据");

    if (typeof schemaVersion !== "number") {
      throw invalidData("用户目录 schemaVersion 必须是数字。");
    }
    if (schemaVersion !== USER_CATALOG_CHANGES_SCHEMA_VERSION) {
      throw new CatalogRepositoryError(
        "unsupported_schema",
        `不支持的用户目录 schemaVersion：${schemaVersion}。`
      );
    }

    return decodeUserCatalogChangesV1(record);
  } catch (error: unknown) {
    if (error instanceof CatalogRepositoryError) {
      throw error;
    }

    throw new CatalogRepositoryError(
      "invalid_data",
      "用户目录本地数据结构无效。",
      error
    );
  }
}

function decodeUserCatalogChangesV1(
  record: Record<string, unknown>
): UserCatalogChanges {
  assertOnlyKeys(record, userCatalogChangeKeys, "用户目录数据");

  return {
    schemaVersion: USER_CATALOG_CHANGES_SCHEMA_VERSION,
    addedAlbums: decodeArray(
      readRequired(record, "addedAlbums", "用户目录数据"),
      "用户目录 addedAlbums",
      decodeAlbum
    ),
    addedTracks: decodeArray(
      readRequired(record, "addedTracks", "用户目录数据"),
      "用户目录 addedTracks",
      decodeTrack
    ),
    albumOverrides: decodeRecord(
      readRequired(record, "albumOverrides", "用户目录数据"),
      "用户目录 albumOverrides",
      decodeAlbumOverrides
    ),
    trackOverrides: decodeRecord(
      readRequired(record, "trackOverrides", "用户目录数据"),
      "用户目录 trackOverrides",
      decodeTrackOverrides
    ),
    albumTrackIdAdditions: decodeRecord(
      readRequired(record, "albumTrackIdAdditions", "用户目录数据"),
      "用户目录 albumTrackIdAdditions",
      (trackIds, path) => decodeStringArray(trackIds, path)
    ),
    deletedDefaultAlbumIds: decodeDeletedDefaultIds(record, "album"),
    deletedDefaultTrackIds: decodeDeletedDefaultIds(record, "track")
  };
}

function decodeDeletedDefaultIds(
  record: Record<string, unknown>,
  entityName: "album" | "track"
): string[] {
  const deletedKey = `deletedDefault${capitalize(entityName)}Ids`;
  const legacyHiddenKey = `hiddenDefault${capitalize(entityName)}Ids`;

  if (hasOwn(record, deletedKey) && hasOwn(record, legacyHiddenKey)) {
    throw invalidData(`用户目录不能同时包含 ${deletedKey} 与 ${legacyHiddenKey}。`);
  }
  if (hasOwn(record, deletedKey)) {
    return decodeStringArray(record[deletedKey], `用户目录 ${deletedKey}`);
  }
  if (hasOwn(record, legacyHiddenKey)) {
    return decodeStringArray(record[legacyHiddenKey], `用户目录 ${legacyHiddenKey}`);
  }

  return [];
}

function capitalize(value: string): string {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}

function decodeAlbum(value: unknown, path: string): Album {
  const record = decodePlainRecord(value, path);
  assertOnlyKeys(record, albumKeys, path);

  const album: Album = {
    id: decodeString(readRequired(record, "id", path), `${path}.id`),
    artistId: decodeString(readRequired(record, "artistId", path), `${path}.artistId`),
    title: decodeString(readRequired(record, "title", path), `${path}.title`),
    type: decodeAlbumType(readRequired(record, "type", path), `${path}.type`),
    sortOrder: decodeNumber(
      readRequired(record, "sortOrder", path),
      `${path}.sortOrder`
    ),
    trackIds: decodeStringArray(
      readRequired(record, "trackIds", path),
      `${path}.trackIds`
    )
  };

  if (hasOwn(record, "note")) {
    album.note = decodeString(record.note, `${path}.note`);
  }

  return album;
}

function decodeTrack(value: unknown, path: string): Track {
  const record = decodePlainRecord(value, path);
  assertOnlyKeys(record, trackKeys, path);

  const track: Track = {
    id: decodeString(readRequired(record, "id", path), `${path}.id`),
    artistId: decodeString(readRequired(record, "artistId", path), `${path}.artistId`),
    albumId: decodeString(readRequired(record, "albumId", path), `${path}.albumId`),
    title: decodeString(readRequired(record, "title", path), `${path}.title`)
  };

  assignOptionalNumber(record, track, "trackNumber", path);
  assignOptionalNumber(record, track, "durationSeconds", path);
  assignOptionalString(record, track, "note", path);

  return track;
}

function decodeAlbumOverrides(value: unknown, path: string): AlbumFieldOverrides {
  const record = decodePlainRecord(value, path);
  assertOnlyKeys(record, albumOverrideKeys, path);
  const overrides: AlbumFieldOverrides = {};

  if (hasOwn(record, "title")) {
    overrides.title = decodeString(record.title, `${path}.title`);
  }
  if (hasOwn(record, "type")) {
    overrides.type = decodeAlbumType(record.type, `${path}.type`);
  }
  if (hasOwn(record, "sortOrder")) {
    overrides.sortOrder = decodeNumber(record.sortOrder, `${path}.sortOrder`);
  }
  if (hasOwn(record, "note")) {
    overrides.note = decodeNullableString(record.note, `${path}.note`);
  }

  return overrides;
}

function decodeTrackOverrides(value: unknown, path: string): TrackFieldOverrides {
  const record = decodePlainRecord(value, path);
  assertOnlyKeys(record, trackOverrideKeys, path);
  const overrides: TrackFieldOverrides = {};

  if (hasOwn(record, "title")) {
    overrides.title = decodeString(record.title, `${path}.title`);
  }
  if (hasOwn(record, "trackNumber")) {
    overrides.trackNumber = decodeNullableNumber(
      record.trackNumber,
      `${path}.trackNumber`
    );
  }
  if (hasOwn(record, "durationSeconds")) {
    overrides.durationSeconds = decodeNullableNumber(
      record.durationSeconds,
      `${path}.durationSeconds`
    );
  }
  if (hasOwn(record, "note")) {
    overrides.note = decodeNullableString(record.note, `${path}.note`);
  }

  return overrides;
}

function assignOptionalNumber(
  record: Record<string, unknown>,
  track: Track,
  key: "trackNumber" | "durationSeconds",
  path: string
): void {
  if (hasOwn(record, key)) {
    track[key] = decodeNumber(record[key], `${path}.${key}`);
  }
}

function assignOptionalString(
  record: Record<string, unknown>,
  track: Track,
  key: "note",
  path: string
): void {
  if (hasOwn(record, key)) {
    track[key] = decodeString(record[key], `${path}.${key}`);
  }
}

function decodeArray<T>(
  value: unknown,
  path: string,
  decodeItem: (item: unknown, itemPath: string) => T
): T[] {
  assertDenseArray(value, path);

  return value.map((item, index) => decodeItem(item, `${path}[${index}]`));
}

function decodeStringArray(value: unknown, path: string): string[] {
  return decodeArray(value, path, decodeString);
}

function decodeRecord<T>(
  value: unknown,
  path: string,
  decodeValue: (item: unknown, itemPath: string) => T
): Partial<Record<EntityId, T>> {
  const source = decodePlainRecord(value, path);
  const result: Partial<Record<EntityId, T>> = {};

  for (const key of Reflect.ownKeys(source)) {
    if (typeof key !== "string") {
      throw invalidData(`${path} 不能包含 symbol 键。`);
    }

    Object.defineProperty(result, key, {
      configurable: true,
      enumerable: true,
      value: decodeValue(source[key], `${path}.${key}`),
      writable: true
    });
  }

  return result;
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

function decodeString(value: unknown, path: string): string {
  if (typeof value !== "string") {
    throw invalidData(`${path} 必须是字符串。`);
  }

  return value;
}

function decodeNullableString(value: unknown, path: string): string | null {
  return value === null ? null : decodeString(value, path);
}

function decodeNumber(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || Object.is(value, -0)) {
    throw invalidData(`${path} 必须是可安全 JSON 往返的有限数字。`);
  }

  return value;
}

function decodeNullableNumber(value: unknown, path: string): number | null {
  return value === null ? null : decodeNumber(value, path);
}

function decodeAlbumType(value: unknown, path: string): AlbumType {
  if (typeof value !== "string" || !albumTypes.has(value as AlbumType)) {
    throw invalidData(`${path} 不是支持的专辑类型。`);
  }

  return value as AlbumType;
}

function hasOwn(value: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function invalidData(message: string): CatalogRepositoryError {
  return new CatalogRepositoryError("invalid_data", message);
}
