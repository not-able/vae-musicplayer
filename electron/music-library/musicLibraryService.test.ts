import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { InMemoryLocalAudioBindingRepository } from "../../src/features/local-library/inMemoryLocalAudioBindingRepository";
import {
  createDesktopAudioSourceRef,
  isLocalAudioBindingId,
  isLocalAudioTrackId,
  type LocalAudioBindingId,
  type LocalAudioTrackId
} from "../../src/types/localAudioBinding";
import { DesktopAudioCandidateStore } from "./candidateStore";
import { MusicDirectoryRegistry } from "./directoryRegistry";
import { DesktopMusicLibraryService } from "./musicLibraryService";
import type { DesktopMusicDirectoryScanResult } from "./types";

const OWNER_ID = 41;
const OTHER_OWNER_ID = 42;
const TRACK_ID = "track_sample_001";
const FIRST_CANDIDATE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SECOND_CANDIDATE_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const THIRD_CANDIDATE_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const FIRST_BINDING_ID = "11111111-1111-4111-8111-111111111111";
const SECOND_BINDING_ID = "22222222-2222-4222-8222-222222222222";
const LEGACY_BINDING_ID = "33333333-3333-4333-8333-333333333333";
const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((directoryPath) => rm(directoryPath, { recursive: true, force: true }))
  );
});

interface TestContext {
  readonly bindingRepository: InMemoryLocalAudioBindingRepository;
  readonly directoryId: string;
  readonly service: DesktopMusicLibraryService;
}

async function createTestContext(): Promise<TestContext> {
  const root = await mkdtemp(path.join(tmpdir(), "music-service-test-"));
  temporaryRoots.push(root);
  const musicDirectory = path.join(root, "music");
  await mkdir(musicDirectory);
  const registry = new MusicDirectoryRegistry({
    filePath: path.join(root, "registry.json")
  });
  const registeredDirectory = await registry.registerDirectory(musicDirectory);
  const bindingRepository = new InMemoryLocalAudioBindingRepository();
  const candidateIds = [FIRST_CANDIDATE_ID, SECOND_CANDIDATE_ID, THIRD_CANDIDATE_ID];
  const bindingIds = [FIRST_BINDING_ID, SECOND_BINDING_ID];
  let scanNumber = 0;
  const service = new DesktopMusicLibraryService({
    registry,
    bindingRepository,
    selectDirectoryPath: async () => musicDirectory,
    scanDirectory: async ({ directoryId }) => {
      scanNumber += 1;
      return createRawScanResult(directoryId, `sample-${scanNumber}.mp3`);
    },
    candidateStore: new DesktopAudioCandidateStore({
      candidateIdFactory: () => candidateIds.shift() ?? crypto.randomUUID()
    }),
    bindingIdFactory: () => bindingIds.shift() ?? crypto.randomUUID(),
    clock: () => new Date("2026-08-02T00:00:00.000Z")
  });

  return {
    bindingRepository,
    directoryId: registeredDirectory.directoryId,
    service
  };
}

function createRawScanResult(
  directoryId: string,
  fileName: string
): DesktopMusicDirectoryScanResult {
  const relativePath = `private-album/${fileName}`;
  return {
    directoryId,
    scannedAt: "2026-08-02T00:00:00.000Z",
    totalFileCount: 1,
    supportedFileCount: 1,
    ignoredFileCount: 0,
    errorCount: 0,
    candidates: [
      {
        sourceRef: { directoryId, relativePath },
        fileName,
        relativePath,
        fileExtension: "mp3",
        fileSize: 2048,
        modifiedAt: 1_765_000_000_000,
        albumTitle: "Private Album",
        trackTitle: "Sample Track",
        parseStatus: "parsed",
        issues: []
      }
    ],
    errors: []
  };
}

function trackId(value = TRACK_ID): LocalAudioTrackId {
  if (!isLocalAudioTrackId(value)) {
    throw new Error(`Invalid test track ID: ${value}`);
  }

  return value;
}

function bindingId(value: string): LocalAudioBindingId {
  if (!isLocalAudioBindingId(value)) {
    throw new Error(`Invalid test binding ID: ${value}`);
  }

  return value;
}

describe("DesktopMusicLibraryService secure candidate bindings", () => {
  it("binds a valid candidate using only Main-owned source and metadata", async () => {
    const { bindingRepository, directoryId, service } = await createTestContext();
    const preview = await service.scanDirectory(OWNER_ID, directoryId);
    const candidate = preview.candidates[0];
    if (!candidate) {
      throw new Error("Expected a scanned candidate.");
    }

    expect(candidate.candidateId).toBe(FIRST_CANDIDATE_ID);
    expect(candidate.candidateId).not.toContain("private-album");
    expect(candidate).not.toHaveProperty("directoryId");
    expect(candidate).not.toHaveProperty("relativePath");
    expect(candidate).not.toHaveProperty("sourceRef");
    expect(preview).not.toHaveProperty("directoryId");

    const summary = await service.bindCandidateToTrack(OWNER_ID, {
      candidateId: candidate.candidateId,
      trackId: trackId()
    });
    const storedBinding = await bindingRepository.findByTrackId(trackId());

    expect(summary).toMatchObject({
      bindingId: FIRST_BINDING_ID,
      trackId: TRACK_ID,
      fileName: "sample-1.mp3",
      fileSize: 2048,
      modifiedAt: 1_765_000_000_000
    });
    expect(summary).not.toHaveProperty("source");
    expect(storedBinding).toMatchObject({
      source: {
        type: "desktop-file",
        directoryId,
        relativePath: "private-album/sample-1.mp3"
      },
      fileName: "sample-1.mp3"
    });
  });

  it("rejects unknown candidates and candidates owned by another webContents", async () => {
    const { directoryId, service } = await createTestContext();
    const preview = await service.scanDirectory(OWNER_ID, directoryId);
    const candidate = preview.candidates[0];
    if (!candidate) {
      throw new Error("Expected a scanned candidate.");
    }

    await expect(
      service.bindCandidateToTrack(OTHER_OWNER_ID, {
        candidateId: candidate.candidateId,
        trackId: trackId()
      })
    ).rejects.toMatchObject({ code: "candidate_unavailable" });
    await expect(
      service.bindCandidateToTrack(OWNER_ID, {
        candidateId: FIRST_BINDING_ID as typeof candidate.candidateId,
        trackId: trackId()
      })
    ).rejects.toMatchObject({ code: "candidate_unavailable" });
  });

  it("invalidates the previous generation when the directory is rescanned", async () => {
    const { directoryId, service } = await createTestContext();
    const firstPreview = await service.scanDirectory(OWNER_ID, directoryId);
    const secondPreview = await service.scanDirectory(OWNER_ID, directoryId);
    const firstCandidate = firstPreview.candidates[0];
    const secondCandidate = secondPreview.candidates[0];
    if (!firstCandidate || !secondCandidate) {
      throw new Error("Expected scanned candidates.");
    }

    expect(secondCandidate.candidateId).not.toBe(firstCandidate.candidateId);
    await expect(
      service.bindCandidateToTrack(OWNER_ID, {
        candidateId: firstCandidate.candidateId,
        trackId: trackId()
      })
    ).rejects.toMatchObject({ code: "candidate_unavailable" });
    await expect(
      service.bindCandidateToTrack(OWNER_ID, {
        candidateId: secondCandidate.candidateId,
        trackId: trackId()
      })
    ).resolves.toMatchObject({ bindingId: FIRST_BINDING_ID });
  });

  it("invalidates candidates after their directory is forgotten", async () => {
    const { directoryId, service } = await createTestContext();
    const preview = await service.scanDirectory(OWNER_ID, directoryId);
    const candidate = preview.candidates[0];
    if (!candidate) {
      throw new Error("Expected a scanned candidate.");
    }

    await service.forgetDirectory(directoryId);
    await expect(
      service.bindCandidateToTrack(OWNER_ID, {
        candidateId: candidate.candidateId,
        trackId: trackId()
      })
    ).rejects.toMatchObject({ code: "candidate_unavailable" });
  });

  it("replaces only when the expected existing binding ID matches", async () => {
    const { bindingRepository, directoryId, service } = await createTestContext();
    const firstPreview = await service.scanDirectory(OWNER_ID, directoryId);
    const firstCandidate = firstPreview.candidates[0];
    if (!firstCandidate) {
      throw new Error("Expected a scanned candidate.");
    }
    const firstBinding = await service.bindCandidateToTrack(OWNER_ID, {
      candidateId: firstCandidate.candidateId,
      trackId: trackId()
    });
    const secondPreview = await service.scanDirectory(OWNER_ID, directoryId);
    const secondCandidate = secondPreview.candidates[0];
    if (!secondCandidate) {
      throw new Error("Expected a replacement candidate.");
    }

    await expect(
      service.bindCandidateToTrack(OWNER_ID, {
        candidateId: secondCandidate.candidateId,
        trackId: trackId()
      })
    ).rejects.toMatchObject({ code: "binding_conflict" });
    await expect(
      service.bindCandidateToTrack(OWNER_ID, {
        candidateId: secondCandidate.candidateId,
        trackId: trackId(),
        expectedExistingBindingId: bindingId(THIRD_CANDIDATE_ID)
      })
    ).rejects.toMatchObject({ code: "binding_conflict" });

    const replacement = await service.bindCandidateToTrack(OWNER_ID, {
      candidateId: secondCandidate.candidateId,
      trackId: trackId(),
      expectedExistingBindingId: firstBinding.bindingId
    });

    expect(replacement.bindingId).toBe(SECOND_BINDING_ID);
    expect(replacement.fileName).toBe("sample-2.mp3");
    await expect(bindingRepository.list()).resolves.toHaveLength(1);
    await expect(bindingRepository.findByTrackId(trackId())).resolves.toMatchObject({
      bindingId: SECOND_BINDING_ID
    });
  });

  it("requires the current binding ID before unbinding and rejects stale requests", async () => {
    const { bindingRepository, directoryId, service } = await createTestContext();
    const firstCandidate = (await service.scanDirectory(OWNER_ID, directoryId))
      .candidates[0];
    if (!firstCandidate) {
      throw new Error("Expected a scanned candidate.");
    }
    const firstBinding = await service.bindCandidateToTrack(OWNER_ID, {
      candidateId: firstCandidate.candidateId,
      trackId: trackId()
    });
    const secondCandidate = (await service.scanDirectory(OWNER_ID, directoryId))
      .candidates[0];
    if (!secondCandidate) {
      throw new Error("Expected a replacement candidate.");
    }
    const secondBinding = await service.bindCandidateToTrack(OWNER_ID, {
      candidateId: secondCandidate.candidateId,
      trackId: trackId(),
      expectedExistingBindingId: firstBinding.bindingId
    });

    await expect(
      service.unbindTrack({
        trackId: trackId(),
        expectedBindingId: firstBinding.bindingId
      })
    ).rejects.toMatchObject({ code: "binding_conflict" });
    await expect(bindingRepository.findByTrackId(trackId())).resolves.toMatchObject({
      bindingId: secondBinding.bindingId
    });
    await expect(
      service.unbindTrack({
        trackId: trackId(),
        expectedBindingId: secondBinding.bindingId
      })
    ).resolves.toEqual(secondBinding);
    await expect(bindingRepository.findByTrackId(trackId())).resolves.toBeUndefined();
  });

  it("returns source-free summaries and masks path-like legacy file names", async () => {
    const { bindingRepository, directoryId, service } = await createTestContext();
    await bindingRepository.save({
      bindingId: bindingId(LEGACY_BINDING_ID),
      trackId: trackId(),
      source: createDesktopAudioSourceRef({
        directoryId,
        relativePath: "album/sample.mp3"
      }),
      fileName: "C:\\private\\sample.mp3",
      availability: "unknown",
      createdAt: "2026-08-02T00:00:00.000Z",
      updatedAt: "2026-08-02T00:00:00.000Z"
    });

    const summaries = await service.listLocalAudioBindings();

    expect(summaries).toEqual([
      {
        bindingId: LEGACY_BINDING_ID,
        trackId: TRACK_ID,
        fileName: "本地音频文件",
        availability: "unknown",
        createdAt: "2026-08-02T00:00:00.000Z",
        updatedAt: "2026-08-02T00:00:00.000Z"
      }
    ]);
    expect(JSON.stringify(summaries)).not.toContain("source");
    expect(JSON.stringify(summaries)).not.toContain("C:\\private");
  });
});
