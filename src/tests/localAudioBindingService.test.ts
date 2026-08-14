import { describe, expect, it, vi } from "vitest";

import {
  isLocalAudioBindingKey,
  parseLocalAudioBindingSummaries,
  type LocalAudioBindingKey,
  type LocalAudioCandidateId
} from "../features/local-library/localAudioBindingService";
import type { LocalAudioFileRepository } from "../features/local-library/localAudioRepository";
import { createWebLocalAudioBindingService } from "../features/local-library/webLocalAudioBindingService";
import type { LocalAudioFileRecord } from "../types";
import type { LocalAudioTrackId } from "../types/localAudioBinding";
import { createLocalAudioFileRecord } from "../features/local-library/localAudioFile";

const TRACK_ID = "track_sample_001" as LocalAudioTrackId;
const OTHER_TRACK_ID = "track_sample_002" as LocalAudioTrackId;
const CANDIDATE_IDS = [
  "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
] as const;

function createMemoryRepository(initial: readonly LocalAudioFileRecord[] = []) {
  const records = new Map(initial.map((record) => [record.trackId, record]));
  const repository: LocalAudioFileRepository = {
    list: vi.fn(async () => [...records.values()]),
    save: vi.fn(async (record) => {
      records.set(record.trackId, record);
    }),
    remove: vi.fn(async (trackId) => {
      records.delete(trackId);
    })
  };

  return { repository, records };
}

function createCandidateIdFactory() {
  let index = 0;
  return () => CANDIDATE_IDS[index++] ?? crypto.randomUUID();
}

describe("local audio binding service contract", () => {
  it("accepts only serializable, source-free binding summaries", () => {
    const summary = {
      bindingId: "local_audio_track_sample_001:2026-08-14T00:00:00.000Z",
      trackId: TRACK_ID,
      fileName: "sample.mp3",
      fileSize: 4,
      modifiedAt: 123,
      availability: "available",
      createdAt: "2026-08-14T00:00:00.000Z",
      updatedAt: "2026-08-14T00:00:00.000Z"
    };

    expect(
      parseLocalAudioBindingSummaries(JSON.parse(JSON.stringify([summary])))
    ).toEqual([summary]);
    expect(() =>
      parseLocalAudioBindingSummaries([
        { ...summary, sourceRef: { directoryId: "private", relativePath: "a.mp3" } }
      ])
    ).toThrow(TypeError);
    expect(() =>
      parseLocalAudioBindingSummaries([
        { ...summary, fileName: "C:\\private\\sample.mp3" }
      ])
    ).toThrow(TypeError);
  });

  it("binds a Web candidate while keeping File inside the Web adapter result seam", async () => {
    const { repository, records } = createMemoryRepository();
    const service = createWebLocalAudioBindingService(repository, {
      createCandidateId: createCandidateIdFactory(),
      now: () => "2026-08-14T00:00:00.000Z"
    });
    const file = new File(["test"], "sample.mp3", {
      type: "audio/mpeg",
      lastModified: 123
    });

    const mutation = await service.bindBrowserAudioFile({ trackId: TRACK_ID, file });

    expect(mutation.result).toMatchObject({
      ok: true,
      value: {
        trackId: TRACK_ID,
        fileName: "sample.mp3",
        availability: "available"
      }
    });
    expect(JSON.stringify(mutation.result)).not.toContain('file"');
    expect(JSON.stringify(mutation.result)).not.toContain("source");
    expect(mutation.legacyRecord).toMatchObject({
      storageMethod: "file-copy",
      file
    });
    expect(records.get(TRACK_ID)).toBe(mutation.legacyRecord);
  });

  it("requires the current binding key for replacement and changes the key", async () => {
    const { repository } = createMemoryRepository();
    const service = createWebLocalAudioBindingService(repository, {
      createCandidateId: createCandidateIdFactory(),
      now: () => "2026-08-14T00:00:00.000Z"
    });
    const first = await service.bindBrowserAudioFile({
      trackId: TRACK_ID,
      file: new File(["one"], "first.mp3", { type: "audio/mpeg" })
    });
    if (!first.result.ok) {
      throw new Error("Expected initial Web binding to succeed.");
    }

    const missingExpected = await service.bindBrowserAudioFile({
      trackId: TRACK_ID,
      file: new File(["two"], "second.mp3", { type: "audio/mpeg" })
    });
    expect(missingExpected.result).toMatchObject({
      ok: false,
      error: { code: "binding_conflict" }
    });

    const replaced = await service.bindBrowserAudioFile({
      trackId: TRACK_ID,
      file: new File(["two"], "second.mp3", { type: "audio/mpeg" }),
      expectedExistingBindingId: first.result.value.bindingId
    });
    expect(replaced.result).toMatchObject({ ok: true });
    if (!replaced.result.ok) {
      throw new Error("Expected Web replacement to succeed.");
    }
    expect(replaced.result.value.bindingId).not.toBe(first.result.value.bindingId);
  });

  it("serializes concurrent Web mutations so only one new binding wins", async () => {
    const { repository, records } = createMemoryRepository();
    const service = createWebLocalAudioBindingService(repository, {
      createCandidateId: createCandidateIdFactory(),
      now: () => "2026-08-14T00:00:00.000Z"
    });
    const firstCandidate = service.registerBrowserFileCandidate(
      new File(["one"], "first.mp3", { type: "audio/mpeg" })
    );
    const secondCandidate = service.registerBrowserFileCandidate(
      new File(["two"], "second.mp3", { type: "audio/mpeg" })
    );
    if (!firstCandidate.ok || !secondCandidate.ok) {
      throw new Error("Expected Web candidates to be registered.");
    }

    const [first, second] = await Promise.all([
      service.bindCandidate({
        candidateId: firstCandidate.value.candidateId,
        trackId: TRACK_ID
      }),
      service.bindCandidate({
        candidateId: secondCandidate.value.candidateId,
        trackId: TRACK_ID
      })
    ]);

    expect(first).toMatchObject({ ok: true });
    expect(second).toMatchObject({
      ok: false,
      error: { code: "binding_conflict" }
    });
    expect(records.get(TRACK_ID)?.fileName).toBe("first.mp3");
  });

  it("prevents a stale Web unbind from removing a newer replacement", async () => {
    const { repository, records } = createMemoryRepository();
    const timestamps = ["2026-08-14T00:00:00.000Z", "2026-08-14T00:00:01.000Z"];
    const service = createWebLocalAudioBindingService(repository, {
      createCandidateId: createCandidateIdFactory(),
      now: () => timestamps.shift() ?? "2026-08-14T00:00:02.000Z"
    });
    const first = await service.bindBrowserAudioFile({
      trackId: TRACK_ID,
      file: new File(["one"], "first.mp3", { type: "audio/mpeg" })
    });
    if (!first.result.ok) {
      throw new Error("Expected initial Web binding to succeed.");
    }
    const replacement = await service.bindBrowserAudioFile({
      trackId: TRACK_ID,
      file: new File(["two"], "second.mp3", { type: "audio/mpeg" }),
      expectedExistingBindingId: first.result.value.bindingId
    });
    if (!replacement.result.ok) {
      throw new Error("Expected Web replacement to succeed.");
    }

    const staleUnbind = await service.unbindTrack({
      trackId: TRACK_ID,
      expectedBindingId: first.result.value.bindingId
    });

    expect(staleUnbind).toMatchObject({
      ok: false,
      error: { code: "binding_conflict" }
    });
    expect(records.get(TRACK_ID)?.fileName).toBe("second.mp3");

    const currentUnbind = await service.unbindTrack({
      trackId: TRACK_ID,
      expectedBindingId: replacement.result.value.bindingId
    });
    expect(currentUnbind).toMatchObject({ ok: true });
    expect(records.has(TRACK_ID)).toBe(false);
  });

  it("rejects unknown candidates and invalid IDs without touching the repository", async () => {
    const { repository } = createMemoryRepository();
    const service = createWebLocalAudioBindingService(repository);

    const unknown = await service.bindCandidate({
      candidateId: CANDIDATE_IDS[0] as LocalAudioCandidateId,
      trackId: OTHER_TRACK_ID
    });
    const invalidLookup = await service.findBindingById({
      bindingId: "not a safe id" as LocalAudioBindingKey
    });

    expect(unknown).toMatchObject({
      ok: false,
      error: { code: "candidate_unavailable" }
    });
    expect(invalidLookup).toMatchObject({
      ok: false,
      error: { code: "invalid_request" }
    });
    expect(repository.save).not.toHaveBeenCalled();
  });

  it("keeps legacy file handles in the existing Repository without serializing them", async () => {
    const { repository, records } = createMemoryRepository();
    const service = createWebLocalAudioBindingService(repository, {
      createCandidateId: createCandidateIdFactory(),
      now: () => "2026-08-14T00:00:00.000Z"
    });
    const file = new File(["test"], "sample.flac", { type: "audio/flac" });
    const fileHandle = {
      kind: "file",
      name: file.name,
      getFile: async () => file,
      isSameEntry: async () => true,
      queryPermission: async () => "granted",
      requestPermission: async () => "granted"
    } as unknown as FileSystemFileHandle;

    const mutation = await service.bindBrowserAudioFile({
      trackId: TRACK_ID,
      file,
      fileHandle
    });

    expect(mutation.result).toMatchObject({ ok: true });
    expect(records.get(TRACK_ID)).toMatchObject({
      storageMethod: "file-handle",
      fileHandle
    });
    expect(JSON.stringify(mutation.result)).not.toContain("fileHandle");
  });

  it("reads existing IndexedDB-shaped records without migrating or rewriting them", async () => {
    const file = new File(["legacy"], "legacy.mp3", { type: "audio/mpeg" });
    const legacyRecord = createLocalAudioFileRecord(
      TRACK_ID,
      file,
      "2026-08-13T00:00:00.000Z"
    );
    const { repository } = createMemoryRepository([legacyRecord]);
    const service = createWebLocalAudioBindingService(repository);

    const result = await service.listBindings();

    expect(result).toMatchObject({
      ok: true,
      value: [
        {
          bindingId: "local_audio_track_sample_001:2026-08-13T00:00:00.000Z",
          trackId: TRACK_ID,
          fileName: "legacy.mp3"
        }
      ]
    });
    expect(repository.save).not.toHaveBeenCalled();
    expect(repository.remove).not.toHaveBeenCalled();
  });

  it("creates opaque, valid service binding keys", () => {
    expect(
      isLocalAudioBindingKey("local_audio_track_sample_001:2026-08-14T00:00:00.000Z")
    ).toBe(true);
    expect(isLocalAudioBindingKey("C:\\private\\sample.mp3")).toBe(false);
  });
});
