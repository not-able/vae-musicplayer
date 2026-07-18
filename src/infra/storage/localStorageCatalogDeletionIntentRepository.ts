import {
  CATALOG_DELETION_INTENT_SCHEMA_VERSION,
  type CatalogDeletionIntent,
  type CatalogDeletionIntentRepository
} from "../../features/catalog/catalogDeletionRepository";
import {
  parseStoredTemporaryPlaylist,
  serializeTemporaryPlaylist
} from "../../features/playlist/playlistPersistence";
import { parseUserCatalogChanges } from "./localStorageCatalogRepository";

export const LOCAL_CATALOG_DELETION_INTENT_STORAGE_KEY =
  "vae-music:catalog-deletion-intent:v1";

type StorageProvider = () => Storage | undefined;
type StorageSource = Storage | StorageProvider;

export function createLocalStorageCatalogDeletionIntentRepository(
  storageSource: StorageSource = getBrowserLocalStorage
): CatalogDeletionIntentRepository {
  return {
    async load() {
      const storage = resolveStorage(storageSource);
      const serialized = storage.getItem(LOCAL_CATALOG_DELETION_INTENT_STORAGE_KEY);

      if (serialized === null) {
        return null;
      }

      return parseCatalogDeletionIntent(JSON.parse(serialized));
    },

    async save(intent) {
      const normalizedIntent = parseCatalogDeletionIntent({
        ...intent,
        nextPlaylist: serializeTemporaryPlaylist(intent.nextPlaylist)
      });
      const serialized = JSON.stringify({
        ...normalizedIntent,
        nextPlaylist: serializeTemporaryPlaylist(normalizedIntent.nextPlaylist)
      });

      if (serialized === undefined) {
        throw new Error("删除恢复记录无法序列化。");
      }

      const storage = resolveStorage(storageSource);
      storage.setItem(LOCAL_CATALOG_DELETION_INTENT_STORAGE_KEY, serialized);
    },

    async clear() {
      const storage = resolveStorage(storageSource);
      storage.removeItem(LOCAL_CATALOG_DELETION_INTENT_STORAGE_KEY);
    }
  };
}

export const localStorageCatalogDeletionIntentRepository =
  createLocalStorageCatalogDeletionIntentRepository();

export function parseCatalogDeletionIntent(value: unknown): CatalogDeletionIntent {
  const record = parsePlainRecord(value, "删除恢复记录");
  assertOnlyKeys(
    record,
    [
      "schemaVersion",
      "id",
      "createdAt",
      "trackIds",
      "nextCatalogChanges",
      "nextPlaylist"
    ],
    "删除恢复记录"
  );

  if (record.schemaVersion !== CATALOG_DELETION_INTENT_SCHEMA_VERSION) {
    throw new Error("删除恢复记录的版本不受支持。");
  }

  return {
    schemaVersion: CATALOG_DELETION_INTENT_SCHEMA_VERSION,
    id: parseNonBlankString(record.id, "删除恢复记录 id"),
    createdAt: parseNonBlankString(record.createdAt, "删除恢复记录 createdAt"),
    trackIds: parseEntityIdArray(record.trackIds, "删除恢复记录 trackIds"),
    nextCatalogChanges: parseUserCatalogChanges(record.nextCatalogChanges),
    nextPlaylist: parseStoredTemporaryPlaylist(record.nextPlaylist)
  };
}

function getBrowserLocalStorage(): Storage | undefined {
  return globalThis.localStorage;
}

function resolveStorage(storageSource: StorageSource): Storage {
  const storage = typeof storageSource === "function" ? storageSource() : storageSource;

  if (!storage) {
    throw new Error("浏览器未提供本地存储，无法恢复目录删除。");
  }

  return storage;
}

function parsePlainRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label}必须是对象。`);
  }

  const prototype = Object.getPrototypeOf(value);

  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error(`${label}必须是普通对象。`);
  }

  return value as Record<string, unknown>;
}

function assertOnlyKeys(
  record: Record<string, unknown>,
  allowedKeys: readonly string[],
  label: string
): void {
  const allowed = new Set(allowedKeys);

  for (const key of Reflect.ownKeys(record)) {
    if (typeof key !== "string" || !allowed.has(key)) {
      throw new Error(`${label}包含不支持的字段。`);
    }
  }
}

function parseEntityIdArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label}必须是数组。`);
  }

  const ids = value.map((item) => parseNonBlankString(item, label));

  if (new Set(ids).size !== ids.length) {
    throw new Error(`${label}不能包含重复 ID。`);
  }

  return ids;
}

function parseNonBlankString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label}必须是非空字符串。`);
  }

  return value;
}
