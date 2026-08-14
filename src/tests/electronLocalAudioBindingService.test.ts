import { describe, expect, it, vi } from "vitest";

import type {
  DesktopLocalAudioBindingApi,
  DesktopLocalAudioBindingSummary
} from "../../electron/music-library/types";
import { createElectronLocalAudioBindingService } from "../features/local-library/electronLocalAudioBindingService";
import type {
  LocalAudioBindingKey,
  LocalAudioCandidateId
} from "../features/local-library/localAudioBindingService";
import type {
  LocalAudioBindingId,
  LocalAudioTrackId
} from "../types/localAudioBinding";

const CANDIDATE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" as LocalAudioCandidateId;
const BINDING_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" as LocalAudioBindingId;
const TRACK_ID = "track_sample_001" as LocalAudioTrackId;

function createSummary(
  overrides: Partial<DesktopLocalAudioBindingSummary> = {}
): DesktopLocalAudioBindingSummary {
  return {
    bindingId: BINDING_ID,
    trackId: TRACK_ID,
    fileName: "sample.mp3",
    fileSize: 2048,
    modifiedAt: 1_765_000_000_000,
    availability: "unknown",
    createdAt: "2026-08-14T00:00:00.000Z",
    updatedAt: "2026-08-14T00:00:00.000Z",
    ...overrides
  };
}

function createApi(
  overrides: Partial<DesktopLocalAudioBindingApi> = {}
): DesktopLocalAudioBindingApi {
  return {
    list: vi.fn(async () => [createSummary()]),
    findByBindingId: vi.fn(async () => createSummary()),
    findByTrackId: vi.fn(async () => createSummary()),
    bindCandidateToTrack: vi.fn(async () => createSummary()),
    unbindTrack: vi.fn(async () => createSummary()),
    ...overrides
  };
}

describe("Electron local audio binding service adapter", () => {
  it("maps the fixed Preload API to source-free shared summaries", async () => {
    const api = createApi();
    const service = createElectronLocalAudioBindingService(api);

    const result = await service.listBindings();

    expect(result).toMatchObject({
      ok: true,
      value: [{ bindingId: BINDING_ID, trackId: TRACK_ID, fileName: "sample.mp3" }]
    });
    expect(JSON.stringify(result)).not.toContain("sourceRef");
    expect(JSON.stringify(result)).not.toContain("relativePath");
  });

  it("forwards only candidate, track, and expected binding IDs", async () => {
    const api = createApi();
    const service = createElectronLocalAudioBindingService(api);

    const result = await service.bindCandidate({
      candidateId: CANDIDATE_ID,
      trackId: TRACK_ID,
      expectedExistingBindingId: BINDING_ID as unknown as LocalAudioBindingKey
    });

    expect(result).toMatchObject({ ok: true });
    expect(api.bindCandidateToTrack).toHaveBeenCalledWith({
      candidateId: CANDIDATE_ID,
      trackId: TRACK_ID,
      expectedExistingBindingId: BINDING_ID
    });
    expect(api.bindCandidateToTrack).not.toHaveBeenCalledWith(
      expect.objectContaining({ sourceRef: expect.anything() })
    );
  });

  it("preserves expected-ID protection for unbind", async () => {
    const api = createApi();
    const service = createElectronLocalAudioBindingService(api);

    const result = await service.unbindTrack({
      trackId: TRACK_ID,
      expectedBindingId: BINDING_ID as unknown as LocalAudioBindingKey
    });

    expect(result).toMatchObject({ ok: true });
    expect(api.unbindTrack).toHaveBeenCalledWith({
      trackId: TRACK_ID,
      expectedBindingId: BINDING_ID
    });
  });

  it("maps conflicts and expired candidates to structured, sanitized errors", async () => {
    const conflictApi = createApi({
      bindCandidateToTrack: vi.fn(async () => {
        throw new Error("[binding_conflict] C:\\private\\bindings.json");
      })
    });
    const expiredApi = createApi({
      bindCandidateToTrack: vi.fn(async () => {
        throw new Error("[candidate_unavailable] internal stack");
      })
    });

    const request = { candidateId: CANDIDATE_ID, trackId: TRACK_ID };
    const conflict =
      await createElectronLocalAudioBindingService(conflictApi).bindCandidate(request);
    const expired =
      await createElectronLocalAudioBindingService(expiredApi).bindCandidate(request);

    expect(conflict).toMatchObject({
      ok: false,
      error: { code: "binding_conflict", retryable: true }
    });
    expect(expired).toMatchObject({
      ok: false,
      error: { code: "candidate_unavailable", retryable: true }
    });
    expect(JSON.stringify(conflict)).not.toContain("private");
    expect(JSON.stringify(expired)).not.toContain("stack");
  });

  it("rejects non-Electron binding IDs before invoking Preload", async () => {
    const api = createApi();
    const service = createElectronLocalAudioBindingService(api);

    const result = await service.unbindTrack({
      trackId: TRACK_ID,
      expectedBindingId:
        "local_audio_track_sample_001:2026-08-14T00:00:00.000Z" as LocalAudioBindingKey
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "invalid_request", retryable: false }
    });
    expect(api.unbindTrack).not.toHaveBeenCalled();
  });

  it("maps raw repository failures without exposing their messages", async () => {
    const api = createApi({
      list: vi.fn(async () => {
        throw new Error("C:\\Users\\private\\bindings.json");
      })
    });

    const result = await createElectronLocalAudioBindingService(api).listBindings();

    expect(result).toEqual({
      ok: false,
      error: {
        code: "read_failed",
        message: "无法读取本地音频绑定状态，请稍后重试。",
        retryable: true
      }
    });
  });
});
