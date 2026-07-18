import { createPlaylistLibrary } from "../../features/playlist/playlistLibrary";
import {
  parseStoredPlaylistLibrary,
  serializePlaylistLibrary
} from "../../features/playlist/playlistLibraryPersistence";
import {
  PlaylistPersistenceError,
  parseStoredTemporaryPlaylist
} from "../../features/playlist/playlistPersistence";
import { PlaylistRepositoryError } from "../../features/playlist/playlistRepository";
import type { PlaylistLibraryRepository } from "../../features/playlist/playlistLibraryRepository";
import { LOCAL_TEMPORARY_PLAYLIST_STORAGE_KEY } from "./localStoragePlaylistRepository";

export const LOCAL_PLAYLIST_LIBRARY_STORAGE_KEY = "vae-music:playlist-library:v1";

// Concurrent tabs intentionally use localStorage's last-write-wins behavior in this MVP.
type StorageProvider = () => Storage | undefined;
type StorageSource = Storage | StorageProvider;

export function createLocalStoragePlaylistLibraryRepository(
  storageSource: StorageSource = getBrowserLocalStorage
): PlaylistLibraryRepository {
  return {
    async load() {
      const storage = resolveStorage(storageSource, "读取");
      const serializedLibrary = readStorageValue(
        storage,
        LOCAL_PLAYLIST_LIBRARY_STORAGE_KEY,
        "歌单库"
      );

      if (serializedLibrary !== null) {
        return parsePlaylistLibraryValue(serializedLibrary);
      }

      const serializedLegacyPlaylist = readStorageValue(
        storage,
        LOCAL_TEMPORARY_PLAYLIST_STORAGE_KEY,
        "旧版临时歌单"
      );

      if (serializedLegacyPlaylist === null) {
        return null;
      }

      return createPlaylistLibrary({
        temporaryPlaylist: parseLegacyTemporaryPlaylistValue(serializedLegacyPlaylist)
      });
    },

    async save(library) {
      let serializedLibrary: string;

      try {
        const snapshot = serializePlaylistLibrary(library);
        const serialized = JSON.stringify(snapshot);

        if (serialized === undefined) {
          throw new Error("JSON serialization returned undefined.");
        }

        serializedLibrary = serialized;
      } catch (cause: unknown) {
        throw toRepositoryValidationError(cause);
      }

      const storage = resolveStorage(storageSource, "保存");

      try {
        storage.setItem(LOCAL_PLAYLIST_LIBRARY_STORAGE_KEY, serializedLibrary);
      } catch (cause: unknown) {
        throw new PlaylistRepositoryError(
          "write_failed",
          "保存歌单库本地数据失败。",
          cause
        );
      }
    },

    async clear() {
      const storage = resolveStorage(storageSource, "清除");

      try {
        storage.removeItem(LOCAL_PLAYLIST_LIBRARY_STORAGE_KEY);
      } catch (cause: unknown) {
        throw new PlaylistRepositoryError(
          "clear_failed",
          "清除歌单库本地数据失败。",
          cause
        );
      }
    }
  };
}

export const localStoragePlaylistLibraryRepository =
  createLocalStoragePlaylistLibraryRepository();

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
      `${operation}歌单库时无法访问浏览器本地存储。`,
      cause
    );
  }

  if (storage === undefined) {
    throw new PlaylistRepositoryError(
      "storage_unavailable",
      `${operation}歌单库时浏览器未提供本地存储。`
    );
  }

  return storage;
}

function readStorageValue(storage: Storage, key: string, label: string): string | null {
  try {
    return storage.getItem(key);
  } catch (cause: unknown) {
    throw new PlaylistRepositoryError(
      "read_failed",
      `读取${label}本地数据失败。`,
      cause
    );
  }
}

function parsePlaylistLibraryValue(serializedLibrary: string) {
  try {
    return parseStoredPlaylistLibrary(JSON.parse(serializedLibrary));
  } catch (cause: unknown) {
    if (cause instanceof SyntaxError) {
      throw new PlaylistRepositoryError(
        "invalid_json",
        "歌单库本地数据不是有效的 JSON。",
        cause
      );
    }

    throw toRepositoryValidationError(cause);
  }
}

function parseLegacyTemporaryPlaylistValue(serializedLegacyPlaylist: string) {
  try {
    return parseStoredTemporaryPlaylist(JSON.parse(serializedLegacyPlaylist));
  } catch (cause: unknown) {
    if (cause instanceof SyntaxError) {
      throw new PlaylistRepositoryError(
        "invalid_json",
        "旧版临时歌单本地数据不是有效的 JSON。",
        cause
      );
    }

    throw toRepositoryValidationError(cause);
  }
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
    "歌单库数据无法安全序列化或恢复。",
    cause
  );
}
