import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { InMemoryLocalAudioBindingRepository } from "../../src/features/local-library/inMemoryLocalAudioBindingRepository";
import type { LocalAudioBindingRepository } from "../../src/features/local-library/localAudioBindingRepository";
import {
  isLocalAudioBindingSerializable,
  type LocalAudioBinding,
  type LocalAudioBindingId,
  type LocalAudioTrackId
} from "../../src/types/localAudioBinding";

export const LOCAL_AUDIO_BINDING_STORE_SCHEMA_VERSION = 1 as const;
export const LOCAL_AUDIO_BINDING_STORE_FILE_NAME = "local-audio-bindings.json";

interface PersistedLocalAudioBindingStore {
  readonly schemaVersion: typeof LOCAL_AUDIO_BINDING_STORE_SCHEMA_VERSION;
  readonly bindings: readonly LocalAudioBinding[];
}

export interface LocalAudioBindingStoreFileSystem {
  readFile(filePath: string, encoding: "utf8"): Promise<string>;
  mkdir(directoryPath: string, options: { recursive: true }): Promise<unknown>;
  writeFile(filePath: string, content: string, encoding: "utf8"): Promise<void>;
  rename(sourcePath: string, destinationPath: string): Promise<void>;
  rm(filePath: string, options: { force: true }): Promise<void>;
}

export interface JsonLocalAudioBindingRepositoryOptions {
  readonly filePath: string;
  readonly fileSystem?: LocalAudioBindingStoreFileSystem;
  readonly uniqueIdFactory?: () => string;
}

export type LocalAudioBindingStoreErrorCode =
  | "LOCAL_AUDIO_BINDING_STORE_BACKUP_FAILED"
  | "LOCAL_AUDIO_BINDING_STORE_CORRUPT"
  | "LOCAL_AUDIO_BINDING_STORE_READ_FAILED"
  | "LOCAL_AUDIO_BINDING_STORE_UNSUPPORTED_SCHEMA"
  | "LOCAL_AUDIO_BINDING_STORE_WRITE_FAILED";

export class LocalAudioBindingStoreError extends Error {
  constructor(
    readonly code: LocalAudioBindingStoreErrorCode,
    message: string,
    options: ErrorOptions & {
      readonly backupPath?: string;
      readonly schemaVersion?: unknown;
    } = {}
  ) {
    super(message, { cause: options.cause });
    this.name = "LocalAudioBindingStoreError";
    this.backupPath = options.backupPath;
    this.schemaVersion = options.schemaVersion;
  }

  readonly backupPath?: string;
  readonly schemaVersion?: unknown;
}

const nodeFileSystem: LocalAudioBindingStoreFileSystem = {
  readFile,
  mkdir,
  writeFile,
  rename,
  rm
};

export class JsonLocalAudioBindingRepository implements LocalAudioBindingRepository {
  private readonly filePath: string;
  private readonly fileSystem: LocalAudioBindingStoreFileSystem;
  private readonly uniqueIdFactory: () => string;
  private repository: InMemoryLocalAudioBindingRepository | null = null;
  private loadPromise: Promise<InMemoryLocalAudioBindingRepository> | null = null;
  private mutationTail: Promise<void> = Promise.resolve();

  constructor(options: JsonLocalAudioBindingRepositoryOptions) {
    if (options.filePath.trim().length === 0) {
      throw new TypeError("Local audio binding store path must not be empty.");
    }

    this.filePath = options.filePath;
    this.fileSystem = options.fileSystem ?? nodeFileSystem;
    this.uniqueIdFactory = options.uniqueIdFactory ?? randomUUID;
  }

  async list(): Promise<readonly LocalAudioBinding[]> {
    return this.runRead((repository) => repository.list());
  }

  async findByBindingId(
    bindingId: LocalAudioBindingId
  ): Promise<LocalAudioBinding | undefined> {
    return this.runRead((repository) => repository.findByBindingId(bindingId));
  }

  async findByTrackId(
    trackId: LocalAudioTrackId
  ): Promise<LocalAudioBinding | undefined> {
    return this.runRead((repository) => repository.findByTrackId(trackId));
  }

  async save(binding: LocalAudioBinding): Promise<void> {
    await this.runMutation(async (candidate) => {
      await candidate.save(binding);
      return { changed: true, result: undefined };
    });
  }

  async removeByBindingId(bindingId: LocalAudioBindingId): Promise<boolean> {
    return this.runMutation(async (candidate) => {
      const removed = await candidate.removeByBindingId(bindingId);
      return { changed: removed, result: removed };
    });
  }

  async removeByTrackId(trackId: LocalAudioTrackId): Promise<boolean> {
    return this.runMutation(async (candidate) => {
      const removed = await candidate.removeByTrackId(trackId);
      return { changed: removed, result: removed };
    });
  }

  private async runRead<T>(
    operation: (repository: InMemoryLocalAudioBindingRepository) => Promise<T>
  ): Promise<T> {
    await this.mutationTail;
    return operation(await this.load());
  }

  private runMutation<T>(
    operation: (
      candidate: InMemoryLocalAudioBindingRepository
    ) => Promise<{ readonly changed: boolean; readonly result: T }>
  ): Promise<T> {
    const result = this.mutationTail.then(async () => {
      const currentRepository = await this.load();
      const candidate = new InMemoryLocalAudioBindingRepository(
        await currentRepository.list()
      );
      const mutation = await operation(candidate);

      if (!mutation.changed) {
        return mutation.result;
      }

      await this.persist(await candidate.list());
      this.repository = candidate;
      return mutation.result;
    });

    this.mutationTail = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }

  private load(): Promise<InMemoryLocalAudioBindingRepository> {
    if (this.repository) {
      return Promise.resolve(this.repository);
    }

    this.loadPromise ??= this.readStore().then((repository) => {
      this.repository = repository;
      return repository;
    });
    return this.loadPromise;
  }

  private async readStore(): Promise<InMemoryLocalAudioBindingRepository> {
    let content: string;

    try {
      content = await this.fileSystem.readFile(this.filePath, "utf8");
    } catch (error: unknown) {
      if (getFileSystemErrorCode(error) === "ENOENT") {
        return new InMemoryLocalAudioBindingRepository();
      }

      throw new LocalAudioBindingStoreError(
        "LOCAL_AUDIO_BINDING_STORE_READ_FAILED",
        "Unable to read the local audio binding store.",
        { cause: error }
      );
    }

    let parsed: unknown;

    try {
      parsed = JSON.parse(content);
    } catch (error: unknown) {
      return this.rejectCorruptStore(error);
    }

    if (
      isRecord(parsed) &&
      Object.hasOwn(parsed, "schemaVersion") &&
      parsed.schemaVersion !== LOCAL_AUDIO_BINDING_STORE_SCHEMA_VERSION
    ) {
      throw new LocalAudioBindingStoreError(
        "LOCAL_AUDIO_BINDING_STORE_UNSUPPORTED_SCHEMA",
        `Unsupported local audio binding store schema: ${String(parsed.schemaVersion)}.`,
        { schemaVersion: parsed.schemaVersion }
      );
    }

    try {
      const store = parsePersistedStore(parsed);
      return new InMemoryLocalAudioBindingRepository(store.bindings);
    } catch (error: unknown) {
      return this.rejectCorruptStore(error);
    }
  }

  private async rejectCorruptStore(
    cause: unknown
  ): Promise<InMemoryLocalAudioBindingRepository> {
    const backupPath = `${this.filePath}.corrupt-${this.uniqueIdFactory()}.bak`;

    try {
      await this.fileSystem.rename(this.filePath, backupPath);
    } catch (error: unknown) {
      throw new LocalAudioBindingStoreError(
        "LOCAL_AUDIO_BINDING_STORE_BACKUP_FAILED",
        "The local audio binding store is corrupt and could not be preserved as a backup.",
        { backupPath, cause: error }
      );
    }

    throw new LocalAudioBindingStoreError(
      "LOCAL_AUDIO_BINDING_STORE_CORRUPT",
      "The local audio binding store is corrupt and was moved to a backup.",
      { backupPath, cause }
    );
  }

  private async persist(bindings: readonly LocalAudioBinding[]): Promise<void> {
    const parentDirectory = path.dirname(this.filePath);
    const temporaryPath = path.join(
      parentDirectory,
      `${path.basename(this.filePath)}.${this.uniqueIdFactory()}.tmp`
    );
    const store: PersistedLocalAudioBindingStore = {
      schemaVersion: LOCAL_AUDIO_BINDING_STORE_SCHEMA_VERSION,
      bindings
    };

    try {
      await this.fileSystem.mkdir(parentDirectory, { recursive: true });
      await this.fileSystem.writeFile(
        temporaryPath,
        `${JSON.stringify(store, null, 2)}\n`,
        "utf8"
      );
      await this.fileSystem.rename(temporaryPath, this.filePath);
    } catch (error: unknown) {
      let cleanupError: unknown;

      try {
        await this.fileSystem.rm(temporaryPath, { force: true });
      } catch (errorDuringCleanup: unknown) {
        cleanupError = errorDuringCleanup;
      }

      throw new LocalAudioBindingStoreError(
        "LOCAL_AUDIO_BINDING_STORE_WRITE_FAILED",
        cleanupError === undefined
          ? "Unable to save the local audio binding store."
          : "Unable to save the local audio binding store or clean up its temporary file.",
        {
          cause:
            cleanupError === undefined
              ? error
              : new AggregateError(
                  [error, cleanupError],
                  "Binding store write and cleanup both failed."
                )
        }
      );
    }
  }
}

function parsePersistedStore(value: unknown): PersistedLocalAudioBindingStore {
  if (
    !isRecord(value) ||
    !hasExactlyKeys(value, ["schemaVersion", "bindings"]) ||
    value.schemaVersion !== LOCAL_AUDIO_BINDING_STORE_SCHEMA_VERSION ||
    !Array.isArray(value.bindings) ||
    !value.bindings.every(isLocalAudioBindingSerializable)
  ) {
    throw new TypeError("Local audio binding store data is invalid.");
  }

  return {
    schemaVersion: LOCAL_AUDIO_BINDING_STORE_SCHEMA_VERSION,
    bindings: value.bindings
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactlyKeys(
  value: Record<string, unknown>,
  expectedKeys: readonly string[]
): boolean {
  const expectedKeySet = new Set(expectedKeys);
  const keys = Reflect.ownKeys(value);
  return (
    keys.length === expectedKeys.length &&
    keys.every((key) => typeof key === "string" && expectedKeySet.has(key))
  );
}

function getFileSystemErrorCode(error: unknown): string | undefined {
  return isRecord(error) && typeof error.code === "string" ? error.code : undefined;
}
