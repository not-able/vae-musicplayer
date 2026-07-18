import {
  DEFAULT_PLAYER_SETTINGS,
  PLAYER_SETTINGS_SCHEMA_VERSION,
  PlayerSettingsRepositoryError,
  normalizePlayerSettings,
  type PlayerSettings,
  type PlayerSettingsRepository
} from "../../features/player/playerSettingsRepository";

export const LOCAL_PLAYER_SETTINGS_STORAGE_KEY = "vae-music:player-settings:v1";

type StorageProvider = () => Storage | undefined;
type StorageSource = Storage | StorageProvider;

interface StoredPlayerSettings extends PlayerSettings {
  schemaVersion: typeof PLAYER_SETTINGS_SCHEMA_VERSION;
}

export function createLocalStoragePlayerSettingsRepository(
  storageSource: StorageSource = getBrowserLocalStorage
): PlayerSettingsRepository {
  return {
    async load() {
      const storage = resolveStorage(storageSource, "读取");
      let serializedSettings: string | null;

      try {
        serializedSettings = storage.getItem(LOCAL_PLAYER_SETTINGS_STORAGE_KEY);
      } catch (cause: unknown) {
        throw new PlayerSettingsRepositoryError(
          "read_failed",
          "读取播放器设置失败。",
          cause
        );
      }

      if (serializedSettings === null) {
        return DEFAULT_PLAYER_SETTINGS;
      }

      try {
        return parseStoredPlayerSettings(JSON.parse(serializedSettings));
      } catch {
        return DEFAULT_PLAYER_SETTINGS;
      }
    },

    async save(settings) {
      const normalizedSettings = normalizePlayerSettings(settings);
      const snapshot: StoredPlayerSettings = {
        schemaVersion: PLAYER_SETTINGS_SCHEMA_VERSION,
        ...normalizedSettings
      };
      let serializedSettings: string;

      try {
        const serialized = JSON.stringify(snapshot);

        if (serialized === undefined) {
          throw new Error("JSON serialization returned undefined.");
        }

        serializedSettings = serialized;
      } catch (cause: unknown) {
        throw new PlayerSettingsRepositoryError(
          "invalid_data",
          "播放器设置无法安全序列化。",
          cause
        );
      }

      const storage = resolveStorage(storageSource, "保存");

      try {
        storage.setItem(LOCAL_PLAYER_SETTINGS_STORAGE_KEY, serializedSettings);
      } catch (cause: unknown) {
        throw new PlayerSettingsRepositoryError(
          "write_failed",
          "保存播放器设置失败。",
          cause
        );
      }
    }
  };
}

export const localStoragePlayerSettingsRepository =
  createLocalStoragePlayerSettingsRepository();

function parseStoredPlayerSettings(value: unknown): PlayerSettings {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new PlayerSettingsRepositoryError("invalid_data", "播放器设置结构无效。");
  }

  const record = value as Record<string, unknown>;

  if (record.schemaVersion !== PLAYER_SETTINGS_SCHEMA_VERSION) {
    throw new PlayerSettingsRepositoryError("invalid_data", "播放器设置版本不受支持。");
  }

  return normalizePlayerSettings(record);
}

function getBrowserLocalStorage(): Storage | undefined {
  return globalThis.localStorage;
}

function resolveStorage(storageSource: StorageSource, operation: string): Storage {
  let storage: Storage | undefined;

  try {
    storage = typeof storageSource === "function" ? storageSource() : storageSource;
  } catch (cause: unknown) {
    throw new PlayerSettingsRepositoryError(
      "storage_unavailable",
      `${operation}播放器设置时无法访问浏览器本地存储。`,
      cause
    );
  }

  if (storage === undefined) {
    throw new PlayerSettingsRepositoryError(
      "storage_unavailable",
      `${operation}播放器设置时浏览器未提供本地存储。`
    );
  }

  return storage;
}
