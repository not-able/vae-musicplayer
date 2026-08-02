import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  isLocalAudioTrackId,
  type LocalAudioTrackId
} from "../../src/types/localAudioBinding";
import { MUSIC_DIRECTORY_REGISTRY_FILE_NAME } from "./directoryRegistry";
import { LOCAL_AUDIO_BINDING_STORE_FILE_NAME } from "./jsonLocalAudioBindingRepository";
import { createDesktopMusicLibraryService } from "./musicLibraryServiceFactory";
import type { DesktopMusicDirectoryScanResult } from "./types";

const OWNER_ID = 41;
const TRACK_ID = "track_sample_001";
const CANDIDATE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BINDING_ID = "11111111-1111-4111-8111-111111111111";
const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((directoryPath) => rm(directoryPath, { recursive: true, force: true }))
  );
});

function trackId(value: string): LocalAudioTrackId {
  if (!isLocalAudioTrackId(value)) {
    throw new Error(`Invalid test track ID: ${value}`);
  }

  return value;
}

function createScanResult(directoryId: string): DesktopMusicDirectoryScanResult {
  return {
    directoryId,
    scannedAt: "2026-08-02T00:00:00.000Z",
    totalFileCount: 1,
    supportedFileCount: 1,
    ignoredFileCount: 0,
    errorCount: 0,
    candidates: [
      {
        sourceRef: {
          directoryId,
          relativePath: "album/sample.mp3"
        },
        fileName: "sample.mp3",
        relativePath: "album/sample.mp3",
        fileExtension: "mp3",
        fileSize: 2048,
        modifiedAt: 1_765_000_000_000,
        trackTitle: "Sample Track",
        parseStatus: "parsed",
        issues: []
      }
    ],
    errors: []
  };
}

describe("desktop music library service factory", () => {
  it("persists Main-created bindings while candidate sessions expire on restart", async () => {
    const userDataPath = await mkdtemp(
      path.join(tmpdir(), "music-service-factory-test-")
    );
    temporaryRoots.push(userDataPath);
    const musicDirectory = path.join(userDataPath, "selected-music");
    await mkdir(musicDirectory);
    const service = createDesktopMusicLibraryService({
      userDataPath,
      selectDirectoryPath: async () => musicDirectory,
      scanDirectory: async ({ directoryId }) => createScanResult(directoryId),
      candidateIdFactory: () => CANDIDATE_ID,
      bindingIdFactory: () => BINDING_ID,
      clock: () => new Date("2026-08-02T00:00:00.000Z")
    });
    const selectedDirectory = await service.selectDirectory();
    if (selectedDirectory === null) {
      throw new Error("Expected directory selection to succeed.");
    }
    const preview = await service.scanDirectory(
      OWNER_ID,
      selectedDirectory.directoryId
    );
    const candidate = preview.candidates[0];
    if (!candidate) {
      throw new Error("Expected a scanned candidate.");
    }
    const summary = await service.bindCandidateToTrack(OWNER_ID, {
      candidateId: candidate.candidateId,
      trackId: trackId(TRACK_ID)
    });

    const bindingStorePath = path.join(
      userDataPath,
      LOCAL_AUDIO_BINDING_STORE_FILE_NAME
    );
    const bindingStoreContent = await readFile(bindingStorePath, "utf8");
    expect(JSON.parse(bindingStoreContent)).toMatchObject({
      schemaVersion: 1,
      bindings: [
        {
          bindingId: BINDING_ID,
          trackId: TRACK_ID,
          source: {
            type: "desktop-file",
            directoryId: selectedDirectory.directoryId,
            relativePath: "album/sample.mp3"
          }
        }
      ]
    });
    expect(bindingStoreContent).not.toContain(musicDirectory);
    await expect(
      readFile(path.join(userDataPath, MUSIC_DIRECTORY_REGISTRY_FILE_NAME), "utf8")
    ).resolves.toContain(selectedDirectory.directoryId);

    const restartedService = createDesktopMusicLibraryService({
      userDataPath,
      selectDirectoryPath: async () => null
    });
    await expect(restartedService.listLocalAudioBindings()).resolves.toEqual([summary]);
    await expect(
      restartedService.bindCandidateToTrack(OWNER_ID, {
        candidateId: candidate.candidateId,
        trackId: trackId("track_after_restart")
      })
    ).rejects.toMatchObject({ code: "candidate_unavailable" });
  });
});
