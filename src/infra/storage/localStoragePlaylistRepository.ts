import {
  PlaylistPersistenceError,
  parseStoredTemporaryPlaylist,
  serializeTemporaryPlaylist
} from "../../features/playlist/playlistPersistence";
import {
  PlaylistRepositoryError,
  type TemporaryPlaylistRepository
} from "../../features/playlist/playlistRepository";

export const LOCAL_TEMPORARY_PLAYLIST_STORAGE_KEY = "vae-music:temporary-playlist:v1";

// Concurrent tabs intentionally use localStorage's last-write-wins behavior in this MVP.
type StorageProvider = () => Storage | undefined;
type StorageSource = Storage | StorageProvider;

export function createLocalStoragePlaylistRepository(
  storageSource: StorageSource = getBrowserLocalStorage
): TemporaryPlaylistRepository {
  return {
    async load() {
      const storage = resolveStorage(storageSource, "读取");
      let serializedPlaylist: string | null;

      try {
        serializedPlaylist = storage.getItem(LOCAL_TEMPORARY_PLAYLIST_STORAGE_KEY);
      } catch (cause: unknown) {
        throw new PlaylistRepositoryError(
          "read_failed",
          "读取临时歌单本地数据失败。",
          cause
        );
      }

      if (serializedPlaylist === null) {
        return null;
      }

      let parsedSnapshot: unknown;

      try {
        parsedSnapshot = JSON.parse(serializedPlaylist);
      } catch (cause: unknown) {
        throw new PlaylistRepositoryError(
          "invalid_json",
          "临时歌单本地数据不是有效的 JSON。",
          cause
        );
      }

      try {
        return parseStoredTemporaryPlaylist(parsedSnapshot);
      } catch (cause: unknown) {
        throw toRepositoryValidationError(cause);
      }
    },

    async save(playlist) {
      let serializedPlaylist: string;

      try {
        const snapshot = serializeTemporaryPlaylist(playlist);
        const serialized = JSON.stringify(snapshot);

        if (serialized === undefined) {
          throw new Error("JSON serialization returned undefined.");
        }

        serializedPlaylist = serialized;
      } catch (cause: unknown) {
        throw toRepositoryValidationError(cause);
      }

      const storage = resolveStorage(storageSource, "保存");

      try {
        storage.setItem(LOCAL_TEMPORARY_PLAYLIST_STORAGE_KEY, serializedPlaylist);
      } catch (cause: unknown) {
        throw new PlaylistRepositoryError(
          "write_failed",
          "保存临时歌单本地数据失败。",
          cause
        );
      }
    },

    async clear() {
      const storage = resolveStorage(storageSource, "清除");

      try {
        storage.removeItem(LOCAL_TEMPORARY_PLAYLIST_STORAGE_KEY);
      } catch (cause: unknown) {
        throw new PlaylistRepositoryError(
          "clear_failed",
          "清除临时歌单本地数据失败。",
          cause
        );
      }
    }
  };
}

export const localStoragePlaylistRepository = createLocalStoragePlaylistRepository();

function getBrowserLocalStorage(): Storage | undefined {
  return globalThis.localStorage;
}

function resolveStorage(storageSource: StorageSource, operation: string): Storage {
  let storage: Storage | undefined;

  try {
    storage = typeof storageSource === "function" ? storageSource() : storageSource;
  } catch (cause: unknown) {
    throw new PlaylistRepositoryError(
      "storage_unavailable",
      `${operation}临时歌单时无法访问浏览器本地存储。`,
      cause
    );
  }

  if (storage === undefined) {
    throw new PlaylistRepositoryError(
      "storage_unavailable",
      `${operation}临时歌单时浏览器未提供本地存储。`
    );
  }

  return storage;
}

function toRepositoryValidationError(cause: unknown): PlaylistRepositoryError {
  if (cause instanceof PlaylistRepositoryError) {
    return cause;
  }

  if (cause instanceof PlaylistPersistenceError) {
    return new PlaylistRepositoryError(cause.code, cause.message, cause);
  }

  return new PlaylistRepositoryError(
    "invalid_data",
    "临时歌单数据无法安全序列化或恢复。",
    cause
  );
}
