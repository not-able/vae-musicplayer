import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { LocalAudioBindingConflictError } from "../../src/features/local-library/localAudioBindingRepository";
import {
  createDesktopAudioSourceRef,
  isLocalAudioBindingId,
  isLocalAudioDirectoryId,
  isLocalAudioSourceId,
  isLocalAudioTrackId,
  type LocalAudioBinding,
  type LocalAudioBindingId,
  type LocalAudioDirectoryId,
  type LocalAudioSourceId,
  type LocalAudioTrackId
} from "../../src/types/localAudioBinding";
import {
  JsonLocalAudioBindingRepository,
  LOCAL_AUDIO_BINDING_STORE_SCHEMA_VERSION,
  LocalAudioBindingStoreError,
  type LocalAudioBindingStoreFileSystem
} from "./jsonLocalAudioBindingRepository";

const BINDING_ID_A = "11111111-1111-4111-8111-111111111111";
const BINDING_ID_B = "22222222-2222-4222-8222-222222222222";
const TRACK_ID_A = "track_sample_001";
const TRACK_ID_B = "track_sample_002";
const DIRECTORY_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const temporaryRoots: string[] = [];

const actualFileSystem: LocalAudioBindingStoreFileSystem = {
  readFile,
  mkdir,
  writeFile,
  rename,
  rm
};

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((directoryPath) => rm(directoryPath, { recursive: true, force: true }))
  );
});

async function createStorePath(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "audio-binding-store-test-"));
  temporaryRoots.push(root);
  return path.join(root, "nested", "local-audio-bindings.json");
}

function bindingId(value: string): LocalAudioBindingId {
  if (!isLocalAudioBindingId(value)) {
    throw new Error(`Invalid test binding ID: ${value}`);
  }

  return value;
}

function trackId(value: string): LocalAudioTrackId {
  if (!isLocalAudioTrackId(value)) {
    throw new Error(`Invalid test track ID: ${value}`);
  }

  return value;
}

function sourceId(value: string): LocalAudioSourceId {
  if (!isLocalAudioSourceId(value)) {
    throw new Error(`Invalid test source ID: ${value}`);
  }

  return value;
}

function directoryId(value: string): LocalAudioDirectoryId {
  if (!isLocalAudioDirectoryId(value)) {
    throw new Error(`Invalid test directory ID: ${value}`);
  }

  return value;
}

function createBinding(overrides: Partial<LocalAudioBinding> = {}): LocalAudioBinding {
  return {
    bindingId: bindingId(BINDING_ID_A),
    trackId: trackId(TRACK_ID_A),
    source: {
      type: "web-file-copy",
      sourceId: sourceId("local_audio_copy_001")
    },
    fileName: "sample.mp3",
    fileSize: 1024,
    modifiedAt: 1_765_000_000_000,
    availability: "available",
    createdAt: "2026-08-02T00:00:00.000Z",
    updatedAt: "2026-08-02T00:00:00.000Z",
    ...overrides
  };
}

describe("JsonLocalAudioBindingRepository", () => {
  it("persists its versioned store and restores portable bindings", async () => {
    const filePath = await createStorePath();
    const earlierBinding = createBinding({
      bindingId: bindingId(BINDING_ID_B),
      trackId: trackId(TRACK_ID_B),
      source: createDesktopAudioSourceRef({
        directoryId: directoryId(DIRECTORY_ID),
        relativePath: "许嵩/示例.flac"
      }),
      fileName: "示例.flac",
      createdAt: "2026-08-01T00:00:00.000Z"
    });
    const laterBinding = createBinding();
    const repository = new JsonLocalAudioBindingRepository({ filePath });

    await repository.save(laterBinding);
    await repository.save(earlierBinding);

    const persisted: unknown = JSON.parse(await readFile(filePath, "utf8"));
    expect(persisted).toEqual({
      schemaVersion: LOCAL_AUDIO_BINDING_STORE_SCHEMA_VERSION,
      bindings: [earlierBinding, laterBinding]
    });

    const restartedRepository = new JsonLocalAudioBindingRepository({ filePath });
    await expect(restartedRepository.list()).resolves.toEqual([
      earlierBinding,
      laterBinding
    ]);
    await expect(
      restartedRepository.findByTrackId(earlierBinding.trackId)
    ).resolves.toEqual(earlierBinding);
  });

  it("keeps replacement and binding ID conflict semantics after restart", async () => {
    const filePath = await createStorePath();
    const original = createBinding();
    const replacement = createBinding({
      bindingId: bindingId(BINDING_ID_B),
      fileName: "replacement.mp3"
    });
    const repository = new JsonLocalAudioBindingRepository({ filePath });

    await repository.save(original);
    await repository.save(replacement);
    await expect(
      repository.save(
        createBinding({
          bindingId: replacement.bindingId,
          trackId: trackId(TRACK_ID_B)
        })
      )
    ).rejects.toBeInstanceOf(LocalAudioBindingConflictError);

    const restartedRepository = new JsonLocalAudioBindingRepository({ filePath });
    await expect(
      restartedRepository.findByBindingId(original.bindingId)
    ).resolves.toBeUndefined();
    await expect(restartedRepository.list()).resolves.toEqual([replacement]);
  });

  it("persists removals and avoids creating a file for no-op removals", async () => {
    const filePath = await createStorePath();
    const emptyRepository = new JsonLocalAudioBindingRepository({ filePath });

    await expect(emptyRepository.removeByTrackId(trackId(TRACK_ID_A))).resolves.toBe(
      false
    );
    await expect(readFile(filePath, "utf8")).rejects.toMatchObject({
      code: "ENOENT"
    });

    const binding = createBinding();
    await emptyRepository.save(binding);
    await expect(emptyRepository.removeByBindingId(binding.bindingId)).resolves.toBe(
      true
    );

    const restartedRepository = new JsonLocalAudioBindingRepository({ filePath });
    await expect(restartedRepository.list()).resolves.toEqual([]);
  });

  it("moves corrupt JSON to a backup and reports the backup path", async () => {
    const filePath = await createStorePath();
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, "{not valid JSON", "utf8");
    const repository = new JsonLocalAudioBindingRepository({
      filePath,
      uniqueIdFactory: () => "corrupt-json"
    });

    let thrownError: unknown;
    try {
      await repository.list();
    } catch (error: unknown) {
      thrownError = error;
    }

    expect(thrownError).toBeInstanceOf(LocalAudioBindingStoreError);
    expect(thrownError).toMatchObject({
      code: "LOCAL_AUDIO_BINDING_STORE_CORRUPT",
      backupPath: `${filePath}.corrupt-corrupt-json.bak`
    });
    await expect(readFile(filePath, "utf8")).rejects.toMatchObject({
      code: "ENOENT"
    });
    await expect(
      readFile(`${filePath}.corrupt-corrupt-json.bak`, "utf8")
    ).resolves.toBe("{not valid JSON");
  });

  it("backs up structurally invalid binding data instead of treating it as empty", async () => {
    const filePath = await createStorePath();
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(
      filePath,
      JSON.stringify({
        schemaVersion: LOCAL_AUDIO_BINDING_STORE_SCHEMA_VERSION,
        bindings: [{ ...createBinding(), fileName: "" }]
      }),
      "utf8"
    );
    const repository = new JsonLocalAudioBindingRepository({
      filePath,
      uniqueIdFactory: () => "invalid-binding"
    });

    await expect(repository.list()).rejects.toMatchObject({
      code: "LOCAL_AUDIO_BINDING_STORE_CORRUPT",
      backupPath: `${filePath}.corrupt-invalid-binding.bak`
    });
    await expect(
      readFile(`${filePath}.corrupt-invalid-binding.bak`, "utf8")
    ).resolves.toContain('"fileName":""');
  });

  it("rejects an unknown schema without moving or overwriting the store", async () => {
    const filePath = await createStorePath();
    const originalContent = `${JSON.stringify({
      schemaVersion: 99,
      bindings: []
    })}\n`;
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, originalContent, "utf8");
    const repository = new JsonLocalAudioBindingRepository({ filePath });

    await expect(repository.list()).rejects.toMatchObject({
      code: "LOCAL_AUDIO_BINDING_STORE_UNSUPPORTED_SCHEMA",
      schemaVersion: 99
    });
    await expect(readFile(filePath, "utf8")).resolves.toBe(originalContent);
    await expect(readdir(path.dirname(filePath))).resolves.toEqual([
      path.basename(filePath)
    ]);
  });

  it("preserves the original corrupt file when creating its backup fails", async () => {
    const filePath = await createStorePath();
    const originalContent = "{not valid JSON";
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, originalContent, "utf8");
    const failingFileSystem: LocalAudioBindingStoreFileSystem = {
      ...actualFileSystem,
      rename: async () => {
        throw Object.assign(new Error("simulated backup failure"), {
          code: "EACCES"
        });
      }
    };
    const repository = new JsonLocalAudioBindingRepository({
      filePath,
      fileSystem: failingFileSystem,
      uniqueIdFactory: () => "backup-failure"
    });

    await expect(repository.list()).rejects.toMatchObject({
      code: "LOCAL_AUDIO_BINDING_STORE_BACKUP_FAILED",
      backupPath: `${filePath}.corrupt-backup-failure.bak`
    });
    await expect(readFile(filePath, "utf8")).resolves.toBe(originalContent);
  });

  it("keeps memory and disk on the previous state when a write fails", async () => {
    const filePath = await createStorePath();
    const original = createBinding();
    const initialRepository = new JsonLocalAudioBindingRepository({ filePath });
    await initialRepository.save(original);
    const failingFileSystem: LocalAudioBindingStoreFileSystem = {
      ...actualFileSystem,
      writeFile: async () => {
        throw Object.assign(new Error("simulated write failure"), {
          code: "EACCES"
        });
      }
    };
    const repository = new JsonLocalAudioBindingRepository({
      filePath,
      fileSystem: failingFileSystem
    });
    const newBinding = createBinding({
      bindingId: bindingId(BINDING_ID_B),
      trackId: trackId(TRACK_ID_B)
    });

    await expect(repository.save(newBinding)).rejects.toMatchObject({
      code: "LOCAL_AUDIO_BINDING_STORE_WRITE_FAILED"
    });
    await expect(repository.list()).resolves.toEqual([original]);

    const restartedRepository = new JsonLocalAudioBindingRepository({ filePath });
    await expect(restartedRepository.list()).resolves.toEqual([original]);
  });

  it("serializes concurrent writes without losing bindings", async () => {
    const filePath = await createStorePath();
    let activeWrites = 0;
    let maximumActiveWrites = 0;
    const observingFileSystem: LocalAudioBindingStoreFileSystem = {
      ...actualFileSystem,
      writeFile: async (...args) => {
        activeWrites += 1;
        maximumActiveWrites = Math.max(maximumActiveWrites, activeWrites);

        try {
          await new Promise((resolve) => setTimeout(resolve, 10));
          await actualFileSystem.writeFile(...args);
        } finally {
          activeWrites -= 1;
        }
      }
    };
    const firstBinding = createBinding();
    const secondBinding = createBinding({
      bindingId: bindingId(BINDING_ID_B),
      trackId: trackId(TRACK_ID_B),
      source: {
        type: "web-file-handle",
        sourceId: sourceId("local_audio_handle_002")
      }
    });
    const repository = new JsonLocalAudioBindingRepository({
      filePath,
      fileSystem: observingFileSystem
    });

    await Promise.all([repository.save(firstBinding), repository.save(secondBinding)]);

    const restartedRepository = new JsonLocalAudioBindingRepository({ filePath });
    await expect(restartedRepository.list()).resolves.toEqual([
      firstBinding,
      secondBinding
    ]);
    expect(maximumActiveWrites).toBe(1);
  });
});
