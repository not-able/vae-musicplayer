import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { InMemoryLocalAudioBindingRepository } from "../../src/features/local-library/inMemoryLocalAudioBindingRepository";
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
import { MusicDirectoryRegistry } from "./directoryRegistry";
import { DesktopMusicLibraryService } from "./musicLibraryService";

const BINDING_ID = "11111111-1111-4111-8111-111111111111";
const TRACK_ID = "track_sample_001";
const UNKNOWN_DIRECTORY_ID = "55555555-5555-4555-8555-555555555555";
const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((directoryPath) => rm(directoryPath, { recursive: true, force: true }))
  );
});

async function createTestContext() {
  const root = await mkdtemp(path.join(tmpdir(), "music-service-test-"));
  temporaryRoots.push(root);
  const musicDirectory = path.join(root, "music");
  await mkdir(musicDirectory);
  const registry = new MusicDirectoryRegistry({
    filePath: path.join(root, "registry.json")
  });
  const selectedDirectory = await registry.registerDirectory(musicDirectory);
  const bindingRepository = new InMemoryLocalAudioBindingRepository();
  const service = new DesktopMusicLibraryService({
    registry,
    bindingRepository,
    selectDirectoryPath: async () => musicDirectory
  });

  return { bindingRepository, selectedDirectory, service };
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

function createBinding(directoryIdValue: string): LocalAudioBinding {
  return {
    bindingId: bindingId(BINDING_ID),
    trackId: trackId(TRACK_ID),
    source: createDesktopAudioSourceRef({
      directoryId: directoryId(directoryIdValue),
      relativePath: "album/sample.mp3"
    }),
    fileName: "sample.mp3",
    fileSize: 1024,
    modifiedAt: 1_765_000_000_000,
    availability: "unknown",
    createdAt: "2026-08-02T00:00:00.000Z",
    updatedAt: "2026-08-02T00:00:00.000Z"
  };
}

describe("DesktopMusicLibraryService local audio bindings", () => {
  it("delegates binding CRUD while preserving repository semantics", async () => {
    const { selectedDirectory, service } = await createTestContext();
    const binding = createBinding(selectedDirectory.directoryId);

    await service.saveLocalAudioBinding(binding);

    await expect(service.listLocalAudioBindings()).resolves.toEqual([binding]);
    await expect(
      service.findLocalAudioBindingByBindingId(binding.bindingId)
    ).resolves.toEqual(binding);
    await expect(
      service.findLocalAudioBindingByTrackId(binding.trackId)
    ).resolves.toEqual(binding);
    await expect(
      service.removeLocalAudioBindingByTrackId(binding.trackId)
    ).resolves.toBe(true);
    await expect(service.listLocalAudioBindings()).resolves.toEqual([]);
  });

  it("rejects platform-incompatible web sources before repository writes", async () => {
    const { bindingRepository, selectedDirectory, service } = await createTestContext();
    const binding: LocalAudioBinding = {
      ...createBinding(selectedDirectory.directoryId),
      source: {
        type: "web-file-handle",
        sourceId: sourceId("local_audio_handle_001")
      }
    };

    await expect(service.saveLocalAudioBinding(binding)).rejects.toMatchObject({
      code: "binding_invalid"
    });
    await expect(bindingRepository.list()).resolves.toEqual([]);
  });

  it("rejects desktop bindings whose directory is not registered", async () => {
    const { bindingRepository, service } = await createTestContext();
    const binding = createBinding(UNKNOWN_DIRECTORY_ID);

    await expect(service.saveLocalAudioBinding(binding)).rejects.toMatchObject({
      code: "unknown_directory"
    });
    await expect(bindingRepository.list()).resolves.toEqual([]);
  });
});
