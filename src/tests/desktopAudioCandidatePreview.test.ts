import { describe, expect, it } from "vitest";

import type {
  DesktopMusicDirectoryScanPreviewResult,
  DesktopMusicDirectorySummary
} from "../../electron/music-library/types";
import {
  buildDesktopAudioScanPreview,
  getDesktopLibraryErrorMessage,
  toDesktopMusicDirectoryOption
} from "../features/local-library/desktopAudioCandidatePreview";

const DIRECTORY_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CANDIDATE_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function createScanPreview(
  overrides: Partial<DesktopMusicDirectoryScanPreviewResult> = {}
): DesktopMusicDirectoryScanPreviewResult {
  return {
    scannedAt: "2026-08-02T00:00:00.000Z",
    totalFileCount: 2,
    supportedFileCount: 1,
    ignoredFileCount: 1,
    errorCount: 1,
    candidates: [
      {
        candidateId:
          CANDIDATE_ID as DesktopMusicDirectoryScanPreviewResult["candidates"][number]["candidateId"],
        fileName: "sample.mp3",
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
        code: "read_file_status_failed",
        message: "无法读取文件状态。"
      }
    ],
    ...overrides
  };
}

describe("desktop audio candidate preview model", () => {
  it("maps only opaque candidate IDs and serializable display metadata", () => {
    const preview = buildDesktopAudioScanPreview(createScanPreview());

    expect(preview.candidates).toEqual([
      {
        candidateId: CANDIDATE_ID,
        fileName: "sample.mp3",
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
    expect(preview).not.toHaveProperty("directoryId");
    expect(preview.candidates[0]).not.toHaveProperty("bindingId");
    expect(preview.candidates[0]).not.toHaveProperty("sourceRef");
    expect(preview.candidates[0]).not.toHaveProperty("relativePath");
    expect(() => JSON.stringify(preview)).not.toThrow();
  });

  it("accepts only safe directory summaries without display paths", () => {
    const directory: DesktopMusicDirectorySummary = {
      directoryId: DIRECTORY_ID,
      displayName: "音乐库",
      selectedAt: "2026-08-02T00:00:00.000Z",
      availability: "available"
    };

    expect(toDesktopMusicDirectoryOption(directory)).toEqual(directory);
    expect(() =>
      toDesktopMusicDirectoryOption({
        ...directory,
        displayPath: "C:\\Users\\example\\Music"
      } as DesktopMusicDirectorySummary)
    ).toThrow(TypeError);
    expect(() =>
      toDesktopMusicDirectoryOption({
        ...directory,
        displayName: "C:\\Users\\example\\Music"
      })
    ).toThrow(TypeError);
  });

  it("rejects preview candidates containing path or source fields", () => {
    for (const unsafeField of [
      { relativePath: "album/sample.mp3" },
      { directoryId: DIRECTORY_ID },
      {
        sourceRef: {
          type: "desktop-file",
          directoryId: DIRECTORY_ID,
          relativePath: "album/sample.mp3"
        }
      }
    ]) {
      const result = createScanPreview({
        candidates: [
          {
            ...createScanPreview().candidates[0],
            ...unsafeField
          }
        ]
      });

      expect(() => buildDesktopAudioScanPreview(result)).toThrow(TypeError);
    }
  });

  it("rejects malformed or duplicate candidate IDs", () => {
    expect(() =>
      buildDesktopAudioScanPreview(
        createScanPreview({
          candidates: [
            {
              ...createScanPreview().candidates[0],
              candidateId:
                "../escape" as unknown as DesktopMusicDirectoryScanPreviewResult["candidates"][number]["candidateId"]
            }
          ]
        })
      )
    ).toThrow(TypeError);

    const candidate = createScanPreview().candidates[0];
    expect(() =>
      buildDesktopAudioScanPreview(
        createScanPreview({
          totalFileCount: 2,
          supportedFileCount: 2,
          ignoredFileCount: 0,
          candidates: [candidate, { ...candidate }]
        })
      )
    ).toThrow(TypeError);
  });

  it("rejects unrecognized candidate issue values", () => {
    const result = createScanPreview({
      candidates: [
        {
          ...createScanPreview().candidates[0],
          issues: [
            "C:\\private\\music" as unknown as DesktopMusicDirectoryScanPreviewResult["candidates"][number]["issues"][number]
          ]
        }
      ]
    });

    expect(() => buildDesktopAudioScanPreview(result)).toThrow(TypeError);
  });

  it("maps scan issue codes to fixed messages without echoing raw details", () => {
    const preview = buildDesktopAudioScanPreview(
      createScanPreview({
        errors: [
          {
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
