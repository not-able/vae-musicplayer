import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  createDesktopAudioSourceRef,
  isLocalAudioBindingId,
  isLocalAudioDirectoryId,
  isLocalAudioTrackId,
  type LocalAudioBinding,
  type LocalAudioBindingId,
  type LocalAudioDirectoryId,
  type LocalAudioTrackId
} from "../../src/types/localAudioBinding";
import { MUSIC_DIRECTORY_REGISTRY_FILE_NAME } from "./directoryRegistry";
import { LOCAL_AUDIO_BINDING_STORE_FILE_NAME } from "./jsonLocalAudioBindingRepository";
import { createDesktopMusicLibraryService } from "./musicLibraryServiceFactory";

const BINDING_ID = "11111111-1111-4111-8111-111111111111";
const TRACK_ID = "track_sample_001";
const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((directoryPath) => rm(directoryPath, { recursive: true, force: true }))
  );
});

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
    availability: "unknown",
    createdAt: "2026-08-02T00:00:00.000Z",
    updatedAt: "2026-08-02T00:00:00.000Z"
  };
}

describe("desktop music library service factory", () => {
  it("injects userData paths and restores the same binding store after restart", async () => {
    const userDataPath = await mkdtemp(
      path.join(tmpdir(), "music-service-factory-test-")
    );
    temporaryRoots.push(userDataPath);
    const musicDirectory = path.join(userDataPath, "selected-music");
    await mkdir(musicDirectory);
    const service = createDesktopMusicLibraryService({
      userDataPath,
      selectDirectoryPath: async () => musicDirectory
    });
    const selectedDirectory = await service.selectDirectory();
    if (selectedDirectory === null) {
      throw new Error("Expected directory selection to succeed.");
    }
    const binding = createBinding(selectedDirectory.directoryId);

    await service.saveLocalAudioBinding(binding);

    const bindingStorePath = path.join(
      userDataPath,
      LOCAL_AUDIO_BINDING_STORE_FILE_NAME
    );
    const bindingStoreContent = await readFile(bindingStorePath, "utf8");
    expect(JSON.parse(bindingStoreContent)).toMatchObject({
      schemaVersion: 1,
      bindings: [binding]
    });
    expect(bindingStoreContent).not.toContain(musicDirectory);
    await expect(
      readFile(path.join(userDataPath, MUSIC_DIRECTORY_REGISTRY_FILE_NAME), "utf8")
    ).resolves.toContain(selectedDirectory.directoryId);

    const restartedService = createDesktopMusicLibraryService({
      userDataPath,
      selectDirectoryPath: async () => null
    });
    await expect(restartedService.listLocalAudioBindings()).resolves.toEqual([binding]);
  });
});
