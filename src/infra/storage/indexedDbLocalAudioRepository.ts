import type { EntityId, LocalAudioFileRecord } from "../../types";
import type { LocalAudioFileRepository } from "../../features/local-library/localAudioRepository";

const DATABASE_NAME = "vae-music-local-library";
const DATABASE_VERSION = 1;
const AUDIO_FILE_STORE = "local-audio-files";

type IndexedDbFactoryProvider = () => IDBFactory | undefined;

export function createIndexedDbLocalAudioRepository(
  getIndexedDbFactory: IndexedDbFactoryProvider = getBrowserIndexedDbFactory
): LocalAudioFileRepository {
  let databasePromise: Promise<IDBDatabase> | undefined;

  async function getDatabase(): Promise<IDBDatabase> {
    if (!databasePromise) {
      const factory = getIndexedDbFactory();

      if (!factory) {
        throw new Error("当前浏览器未提供 IndexedDB。");
      }

      databasePromise = openDatabase(factory)
        .then((database) => {
          database.onversionchange = () => {
            database.close();
            databasePromise = undefined;
          };

          return database;
        })
        .catch((error: unknown) => {
          databasePromise = undefined;
          throw error;
        });
    }

    return databasePromise;
  }

  return {
    async list() {
      const database = await getDatabase();
      const transaction = database.transaction(AUDIO_FILE_STORE, "readonly");
      const request = transaction.objectStore(AUDIO_FILE_STORE).getAll() as IDBRequest<
        LocalAudioFileRecord[]
      >;

      return requestToPromise(request);
    },
    async save(record) {
      const database = await getDatabase();

      await runWriteTransaction(database, (store) => store.put(record));
    },
    async remove(trackId: EntityId) {
      const database = await getDatabase();

      await runWriteTransaction(database, (store) => store.delete(trackId));
    }
  };
}

export const indexedDbLocalAudioRepository = createIndexedDbLocalAudioRepository();

function getBrowserIndexedDbFactory(): IDBFactory | undefined {
  try {
    return globalThis.indexedDB;
  } catch {
    return undefined;
  }
}

function openDatabase(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;

      if (!database.objectStoreNames.contains(AUDIO_FILE_STORE)) {
        database.createObjectStore(AUDIO_FILE_STORE, { keyPath: "trackId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("无法打开 IndexedDB。"));
    request.onblocked = () => reject(new Error("IndexedDB 升级被其他页面阻塞。"));
  });
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB 读取失败。"));
  });
}

function runWriteTransaction(
  database: IDBDatabase,
  write: (store: IDBObjectStore) => IDBRequest
): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(AUDIO_FILE_STORE, "readwrite");

    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("IndexedDB 写入失败。"));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("IndexedDB 写入已取消。"));

    write(transaction.objectStore(AUDIO_FILE_STORE));
  });
}
