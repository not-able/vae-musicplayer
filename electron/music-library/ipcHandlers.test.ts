import { describe, expect, it, vi } from "vitest";

import {
  isDesktopAudioCandidateId,
  type DesktopLocalAudioBindingSummary
} from "./types";
import { MusicLibraryError } from "./errors";
import { createMusicLibraryIpcHandlers } from "./ipcHandlers";
import { LocalAudioBindingStoreError } from "./jsonLocalAudioBindingRepository";
import type { DesktopMusicLibraryService } from "./musicLibraryService";

const TRUSTED_SENDER = { webContentsId: 41, url: "trusted-renderer" } as const;
const OTHER_SENDER = { webContentsId: 42, url: "trusted-renderer" } as const;
const UNTRUSTED_SENDER = {
  webContentsId: 99,
  url: "https://untrusted.example/"
} as const;
const DIRECTORY_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CANDIDATE_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const BINDING_ID = "11111111-1111-4111-8111-111111111111";
const NEXT_BINDING_ID = "22222222-2222-4222-8222-222222222222";
const TRACK_ID = "track_sample_001";

function createBindingSummary(bindingId = BINDING_ID): DesktopLocalAudioBindingSummary {
  return {
    bindingId: bindingId as DesktopLocalAudioBindingSummary["bindingId"],
    trackId: TRACK_ID as DesktopLocalAudioBindingSummary["trackId"],
    fileName: "sample.mp3",
    fileSize: 2048,
    modifiedAt: 1_765_000_000_000,
    availability: "unknown",
    createdAt: "2026-08-02T00:00:00.000Z",
    updatedAt: "2026-08-02T00:00:00.000Z"
  };
}

function createServiceMock(
  overrides: Partial<Record<keyof DesktopMusicLibraryService, unknown>> = {}
): DesktopMusicLibraryService {
  return {
    selectDirectory: vi.fn(async () => null),
    listDirectories: vi.fn(async () => []),
    scanDirectory: vi.fn(async () => ({
      scannedAt: "2026-08-02T00:00:00.000Z",
      totalFileCount: 1,
      supportedFileCount: 1,
      ignoredFileCount: 0,
      errorCount: 0,
      candidates: [
        {
          candidateId: CANDIDATE_ID,
          fileName: "sample.mp3",
          fileExtension: "mp3",
          fileSize: 2048,
          modifiedAt: 1_765_000_000_000,
          parseStatus: "parsed",
          issues: []
        }
      ],
      errors: []
    })),
    forgetDirectory: vi.fn(async () => undefined),
    invalidateCandidatesForOwner: vi.fn(),
    listLocalAudioBindings: vi.fn(async () => []),
    findLocalAudioBindingByBindingId: vi.fn(async () => undefined),
    findLocalAudioBindingByTrackId: vi.fn(async () => undefined),
    bindCandidateToTrack: vi.fn(async () => createBindingSummary()),
    unbindTrack: vi.fn(async () => createBindingSummary()),
    ...overrides
  } as unknown as DesktopMusicLibraryService;
}

function createHandlers(service: DesktopMusicLibraryService) {
  return createMusicLibraryIpcHandlers(
    service,
    (senderUrl) => senderUrl === TRUSTED_SENDER.url
  );
}

describe("music library IPC handlers", () => {
  it("routes directory scans with the webContents owner and returns safe previews", async () => {
    const service = createServiceMock();
    const handlers = createHandlers(service);

    const result = await handlers.scanDirectory(TRUSTED_SENDER, [
      { directoryId: DIRECTORY_ID }
    ]);

    expect(service.scanDirectory).toHaveBeenCalledWith(
      TRUSTED_SENDER.webContentsId,
      DIRECTORY_ID
    );
    expect(result).toMatchObject({
      ok: true,
      value: { candidates: [{ candidateId: CANDIDATE_ID }] }
    });
    expect(JSON.stringify(result)).not.toContain("relativePath");
    expect(JSON.stringify(result)).not.toContain("sourceRef");
    expect(JSON.stringify(result)).not.toContain(DIRECTORY_ID);
  });

  it("rejects untrusted senders before invoking directory or binding services", async () => {
    const service = createServiceMock();
    const handlers = createHandlers(service);

    await expect(handlers.listDirectories(UNTRUSTED_SENDER, [])).resolves.toEqual({
      ok: false,
      error: {
        code: "untrusted_sender",
        message: "已拒绝来自非受信 Renderer 的本地音乐库请求。"
      }
    });
    await expect(
      handlers.bindCandidateToTrack(UNTRUSTED_SENDER, [
        { candidateId: CANDIDATE_ID, trackId: TRACK_ID }
      ])
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "untrusted_sender" }
    });
    expect(service.listDirectories).not.toHaveBeenCalled();
    expect(service.bindCandidateToTrack).not.toHaveBeenCalled();
  });

  it("accepts only candidate and track IDs for binding commands", async () => {
    const service = createServiceMock();
    const handlers = createHandlers(service);
    if (!isDesktopAudioCandidateId(CANDIDATE_ID)) {
      throw new Error("Invalid test candidate ID.");
    }

    await expect(
      handlers.bindCandidateToTrack(TRUSTED_SENDER, [
        { candidateId: CANDIDATE_ID, trackId: TRACK_ID }
      ])
    ).resolves.toEqual({ ok: true, value: createBindingSummary() });
    expect(service.bindCandidateToTrack).toHaveBeenCalledWith(
      TRUSTED_SENDER.webContentsId,
      { candidateId: CANDIDATE_ID, trackId: TRACK_ID }
    );

    const unsafeRequests = [
      {
        candidateId: CANDIDATE_ID,
        trackId: TRACK_ID,
        relativePath: "album/sample.mp3"
      },
      {
        candidateId: CANDIDATE_ID,
        trackId: TRACK_ID,
        sourceRef: {
          type: "desktop-file",
          directoryId: DIRECTORY_ID,
          relativePath: "album/sample.mp3"
        }
      },
      {
        candidateId: CANDIDATE_ID,
        trackId: TRACK_ID,
        binding: { fileName: "C:\\private\\sample.mp3" }
      }
    ];

    for (const request of unsafeRequests) {
      await expect(
        handlers.bindCandidateToTrack(TRUSTED_SENDER, [request])
      ).resolves.toMatchObject({
        ok: false,
        error: { code: "invalid_request" }
      });
    }
    expect(service.bindCandidateToTrack).toHaveBeenCalledTimes(1);
  });

  it("passes explicit replacement and versioned unbind requests unchanged", async () => {
    const service = createServiceMock({
      bindCandidateToTrack: vi.fn(async () => createBindingSummary(NEXT_BINDING_ID))
    });
    const handlers = createHandlers(service);
    const replaceRequest = {
      candidateId: CANDIDATE_ID,
      trackId: TRACK_ID,
      expectedExistingBindingId: BINDING_ID
    };
    const unbindRequest = {
      trackId: TRACK_ID,
      expectedBindingId: NEXT_BINDING_ID
    };

    await expect(
      handlers.bindCandidateToTrack(TRUSTED_SENDER, [replaceRequest])
    ).resolves.toEqual({
      ok: true,
      value: createBindingSummary(NEXT_BINDING_ID)
    });
    await expect(
      handlers.unbindTrack(TRUSTED_SENDER, [unbindRequest])
    ).resolves.toEqual({ ok: true, value: createBindingSummary() });
    expect(service.bindCandidateToTrack).toHaveBeenCalledWith(
      TRUSTED_SENDER.webContentsId,
      replaceRequest
    );
    expect(service.unbindTrack).toHaveBeenCalledWith(unbindRequest);
  });

  it("rejects malformed IDs and extra unbind fields", async () => {
    const service = createServiceMock();
    const handlers = createHandlers(service);

    await expect(
      handlers.bindCandidateToTrack(TRUSTED_SENDER, [
        { candidateId: "../escape", trackId: TRACK_ID }
      ])
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "invalid_request" }
    });
    await expect(
      handlers.unbindTrack(TRUSTED_SENDER, [
        {
          trackId: TRACK_ID,
          expectedBindingId: BINDING_ID,
          path: "C:\\private\\sample.mp3"
        }
      ])
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "invalid_request" }
    });
    expect(service.bindCandidateToTrack).not.toHaveBeenCalled();
    expect(service.unbindTrack).not.toHaveBeenCalled();
  });

  it("does not let another webContents resolve a candidate", async () => {
    const service = createServiceMock({
      bindCandidateToTrack: vi.fn(async (ownerId: number) => {
        if (ownerId !== TRUSTED_SENDER.webContentsId) {
          throw new MusicLibraryError(
            "candidate_unavailable",
            "扫描候选已失效，请重新扫描音乐目录。"
          );
        }
        return createBindingSummary();
      })
    });
    const handlers = createHandlers(service);

    await expect(
      handlers.bindCandidateToTrack(OTHER_SENDER, [
        { candidateId: CANDIDATE_ID, trackId: TRACK_ID }
      ])
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "candidate_unavailable" }
    });
  });

  it("maps repository failures to stable errors without leaking paths", async () => {
    const service = createServiceMock({
      bindCandidateToTrack: vi.fn(async () => {
        throw new LocalAudioBindingStoreError(
          "LOCAL_AUDIO_BINDING_STORE_WRITE_FAILED",
          "D:\\private\\local-audio-bindings.json failed"
        );
      })
    });
    const handlers = createHandlers(service);

    const result = await handlers.bindCandidateToTrack(TRUSTED_SENDER, [
      { candidateId: CANDIDATE_ID, trackId: TRACK_ID }
    ]);

    expect(result).toEqual({
      ok: false,
      error: {
        code: "binding_store_write_failed",
        message: "无法保存本地音频绑定数据。"
      }
    });
    expect(JSON.stringify(result)).not.toContain("D:\\private");
  });
});
