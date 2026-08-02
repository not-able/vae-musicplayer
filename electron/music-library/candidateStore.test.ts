import { describe, expect, it } from "vitest";

import { DesktopAudioCandidateStore } from "./candidateStore";
import type { DesktopMusicDirectoryScanResult } from "./types";

const OWNER_ID = 41;
const DIRECTORY_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CANDIDATE_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function createRawScanResult(): DesktopMusicDirectoryScanResult {
  return {
    directoryId: DIRECTORY_ID,
    scannedAt: "2026-08-02T00:00:00.000Z",
    totalFileCount: 2,
    supportedFileCount: 1,
    ignoredFileCount: 0,
    errorCount: 1,
    candidates: [
      {
        sourceRef: {
          directoryId: DIRECTORY_ID,
          relativePath: "private-album/sample.mp3"
        },
        fileName: "sample.mp3",
        relativePath: "private-album/sample.mp3",
        fileExtension: "mp3",
        fileSize: 2048,
        modifiedAt: 1_765_000_000_000,
        trackTitle: "Sample Track",
        parseStatus: "parsed",
        issues: []
      }
    ],
    errors: [
      {
        relativePath: "private-album/broken.mp3",
        code: "read_file_status_failed",
        message: "D:\\private\\music\\broken.mp3"
      }
    ]
  };
}

describe("DesktopAudioCandidateStore", () => {
  it("keeps trusted paths in Main while publishing opaque safe previews", () => {
    const store = new DesktopAudioCandidateStore({
      candidateIdFactory: () => CANDIDATE_ID
    });
    const token = store.beginScan(OWNER_ID, DIRECTORY_ID);
    const preview = store.publishScan(token, createRawScanResult());
    const candidate = preview.candidates[0];
    if (!candidate) {
      throw new Error("Expected a published candidate.");
    }

    expect(candidate.candidateId).toBe(CANDIDATE_ID);
    expect(candidate).not.toHaveProperty("relativePath");
    expect(candidate).not.toHaveProperty("sourceRef");
    expect(preview).not.toHaveProperty("directoryId");
    expect(preview.errors).toEqual([
      {
        code: "read_file_status_failed",
        message: "无法读取该文件状态，已跳过并继续扫描。"
      }
    ]);
    expect(JSON.stringify(preview)).not.toContain("private-album");
    expect(JSON.stringify(preview)).not.toContain("D:\\private");

    expect(store.resolveCandidate(OWNER_ID, candidate.candidateId)).toMatchObject({
      source: {
        type: "desktop-file",
        directoryId: DIRECTORY_ID,
        relativePath: "private-album/sample.mp3"
      }
    });
  });

  it("rejects path-like or reused candidate IDs instead of reviving old scans", () => {
    const unsafeStore = new DesktopAudioCandidateStore({
      candidateIdFactory: () => "private-album/sample.mp3"
    });
    expect(() =>
      unsafeStore.publishScan(
        unsafeStore.beginScan(OWNER_ID, DIRECTORY_ID),
        createRawScanResult()
      )
    ).toThrowError(expect.objectContaining({ code: "scan_failed" }));

    const reusedIdStore = new DesktopAudioCandidateStore({
      candidateIdFactory: () => CANDIDATE_ID
    });
    reusedIdStore.publishScan(
      reusedIdStore.beginScan(OWNER_ID, DIRECTORY_ID),
      createRawScanResult()
    );
    expect(() =>
      reusedIdStore.publishScan(
        reusedIdStore.beginScan(OWNER_ID, DIRECTORY_ID),
        createRawScanResult()
      )
    ).toThrowError(expect.objectContaining({ code: "scan_failed" }));
  });
});
