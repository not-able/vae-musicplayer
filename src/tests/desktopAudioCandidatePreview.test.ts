import { describe, expect, it } from "vitest";

import type {
  DesktopMusicDirectoryScanResult,
  SelectedMusicDirectory
} from "../../electron/music-library/types";
import {
  buildDesktopAudioScanPreview,
  getDesktopLibraryErrorMessage,
  toDesktopMusicDirectoryOption
} from "../features/local-library/desktopAudioCandidatePreview";

const DIRECTORY_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function createScanResult(
  overrides: Partial<DesktopMusicDirectoryScanResult> = {}
): DesktopMusicDirectoryScanResult {
  return {
    directoryId: DIRECTORY_ID,
    scannedAt: "2026-08-02T00:00:00.000Z",
    totalFileCount: 2,
    supportedFileCount: 1,
    ignoredFileCount: 1,
    errorCount: 1,
    candidates: [
      {
        sourceRef: {
          directoryId: DIRECTORY_ID,
          relativePath: "album/sample.mp3"
        },
        fileName: "sample.mp3",
        relativePath: "album/sample.mp3",
        fileExtension: "mp3",
        fileSize: 1024,
        modifiedAt: 1_765_000_000_000,
        albumTitle: "Sample Album",
        artistName: "Sample Artist",
        trackTitle: "Sample Track",
        parseStatus: "needs_review",
        issues: ["ambiguous_compact_hyphen"]
      }
    ],
    errors: [
      {
        relativePath: "album/broken.flac",
        code: "read_file_status_failed",
        message: "无法读取文件状态。"
      }
    ],
    ...overrides
  };
}

describe("desktop audio candidate preview model", () => {
  it("maps scan DTOs to serializable preview-only fields", () => {
    const preview = buildDesktopAudioScanPreview(createScanResult());

    expect(preview.candidates).toEqual([
      {
        candidateKey: "album/sample.mp3",
        fileName: "sample.mp3",
        relativePath: "album/sample.mp3",
        fileExtension: "mp3",
        fileSize: 1024,
        modifiedAt: 1_765_000_000_000,
        albumTitle: "Sample Album",
        artistName: "Sample Artist",
        trackTitle: "Sample Track",
        parseStatus: "needs_review",
        issues: ["ambiguous_compact_hyphen"]
      }
    ]);
    expect(preview.candidates[0]).not.toHaveProperty("bindingId");
    expect(preview.candidates[0]).not.toHaveProperty("sourceRef");
    expect(() => JSON.stringify(preview)).not.toThrow();
  });

  it("drops display paths when mapping authorized directory options", () => {
    const directory: SelectedMusicDirectory = {
      directoryId: DIRECTORY_ID,
      displayName: "音乐库",
      displayPath: "C:\\Users\\example\\Music",
      selectedAt: "2026-08-02T00:00:00.000Z",
      availability: "available"
    };

    const option = toDesktopMusicDirectoryOption(directory);

    expect(option).toEqual({
      directoryId: DIRECTORY_ID,
      displayName: "音乐库",
      selectedAt: "2026-08-02T00:00:00.000Z",
      availability: "available"
    });
    expect(option).not.toHaveProperty("displayPath");
  });

  it.each([
    "C:\\Music\\sample.mp3",
    "../sample.mp3",
    "/music/sample.mp3",
    "album\\sample.mp3"
  ])("rejects unsafe candidate path %s", (relativePath) => {
    const result = createScanResult({
      candidates: [
        {
          ...createScanResult().candidates[0],
          sourceRef: { directoryId: DIRECTORY_ID, relativePath },
          relativePath
        }
      ]
    });

    expect(() => buildDesktopAudioScanPreview(result)).toThrow(TypeError);
  });

  it("rejects mismatched directory references and inconsistent counts", () => {
    const wrongDirectoryResult = createScanResult({
      candidates: [
        {
          ...createScanResult().candidates[0],
          sourceRef: {
            directoryId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            relativePath: "album/sample.mp3"
          }
        }
      ]
    });

    expect(() => buildDesktopAudioScanPreview(wrongDirectoryResult)).toThrow(TypeError);
    expect(() =>
      buildDesktopAudioScanPreview(createScanResult({ supportedFileCount: 2 }))
    ).toThrow(TypeError);
  });

  it("rejects unrecognized candidate issue values", () => {
    const result = createScanResult({
      candidates: [
        {
          ...createScanResult().candidates[0],
          issues: ["C:\\private\\music"]
        }
      ]
    });

    expect(() => buildDesktopAudioScanPreview(result)).toThrow(TypeError);
  });

  it("maps scan issue codes to fixed messages without echoing raw details", () => {
    const preview = buildDesktopAudioScanPreview(
      createScanResult({
        errors: [
          {
            relativePath: "album/broken.flac",
            code: "read_file_status_failed",
            message: "C:\\private\\music\\album\\broken.flac"
          }
        ]
      })
    );

    expect(preview.errors[0]?.message).toBe("无法读取该文件状态，已跳过并继续扫描。");
    expect(JSON.stringify(preview)).not.toContain("C:\\private\\music");
  });

  it("maps only known public error codes and never echoes raw messages", () => {
    const rawError = new Error(
      "[directory_missing] D:\\private\\music no longer exists"
    );

    expect(getDesktopLibraryErrorMessage(rawError, "scan")).toBe(
      "所选音乐目录已失效，请重新选择或刷新目录列表。"
    );
    expect(
      getDesktopLibraryErrorMessage(
        new Error("D:\\private\\unexpected failure"),
        "scan"
      )
    ).toBe("无法扫描音乐目录。");
  });
});
