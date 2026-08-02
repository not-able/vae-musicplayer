import { describe, expect, it } from "vitest";

import type { DesktopScannedAudioFile } from "../../electron/music-library/types";
import {
  createDesktopAudioSourceRef,
  isDesktopAudioSourceRef,
  isLocalAudioBindingId,
  isLocalAudioBindingSerializable,
  isLocalAudioDirectoryId,
  isLocalAudioSourceId,
  isLocalAudioSourceRef,
  isLocalAudioTrackId,
  normalizeLocalAudioRelativePath,
  type LocalAudioBinding,
  type LocalAudioBindingId,
  type LocalAudioDirectoryId
} from "../types/localAudioBinding";

const BINDING_ID = "11111111-1111-4111-8111-111111111111";
const DIRECTORY_ID = "22222222-2222-4222-8222-222222222222";

function createSerializableBinding(source: unknown): Record<string, unknown> {
  return {
    bindingId: BINDING_ID,
    trackId: "track_sample_001",
    source,
    fileName: "有何不可.mp3",
    fileSize: 1024,
    modifiedAt: 1_765_000_000_000.5,
    availability: "available",
    createdAt: "2026-08-02T00:00:00.000Z",
    updatedAt: "2026-08-02T00:00:00.000Z"
  };
}

describe("portable local audio binding model", () => {
  it("creates a valid desktop source from an opaque directory ID", () => {
    const source = createDesktopAudioSourceRef({
      directoryId: DIRECTORY_ID,
      relativePath: "许嵩/自定义/有何不可.mp3"
    });

    expect(source).toEqual({
      type: "desktop-file",
      directoryId: DIRECTORY_ID,
      relativePath: "许嵩/自定义/有何不可.mp3"
    });
    expect(isDesktopAudioSourceRef(source)).toBe(true);
  });

  it("normalizes Windows separators to portable separators", () => {
    expect(normalizeLocalAudioRelativePath("许嵩\\自定义\\有何不可.mp3")).toBe(
      "许嵩/自定义/有何不可.mp3"
    );
  });

  it("rejects POSIX, drive-letter and UNC absolute paths", () => {
    expect(normalizeLocalAudioRelativePath("/music/song.mp3")).toBeUndefined();
    expect(normalizeLocalAudioRelativePath("C:\\Music\\song.mp3")).toBeUndefined();
    expect(
      normalizeLocalAudioRelativePath("\\\\server\\music\\song.mp3")
    ).toBeUndefined();
    expect(() =>
      createDesktopAudioSourceRef({
        directoryId: DIRECTORY_ID,
        relativePath: "C:\\Music\\song.mp3"
      })
    ).toThrow(TypeError);
  });

  it("rejects parent-directory escape segments", () => {
    expect(normalizeLocalAudioRelativePath("专辑/../song.mp3")).toBeUndefined();
    expect(normalizeLocalAudioRelativePath("..\\song.mp3")).toBeUndefined();
  });

  it("rejects empty and whitespace-only relative paths", () => {
    expect(normalizeLocalAudioRelativePath("")).toBeUndefined();
    expect(normalizeLocalAudioRelativePath("   ")).toBeUndefined();
    expect(normalizeLocalAudioRelativePath("专辑/   /song.mp3")).toBeUndefined();
  });

  it("narrows each source variant through its discriminator", () => {
    const webCopy = { type: "web-file-copy", sourceId: "local_audio_copy_001" };
    const webHandle = {
      type: "web-file-handle",
      sourceId: "local_audio_handle_001"
    };
    const desktop = createDesktopAudioSourceRef({
      directoryId: DIRECTORY_ID,
      relativePath: "专辑/song.mp3"
    });

    expect(isLocalAudioSourceRef(webCopy)).toBe(true);
    expect(isLocalAudioSourceRef(webHandle)).toBe(true);
    expect(isLocalAudioSourceRef(desktop)).toBe(true);
    expect(isDesktopAudioSourceRef(webCopy)).toBe(false);
    expect(isLocalAudioSourceRef({ type: "web-file-copy", sourceId: "" })).toBe(false);
  });

  it("keeps binding, track and directory identifier rules explicit", () => {
    type BindingIdIsDirectoryId = LocalAudioBindingId extends LocalAudioDirectoryId
      ? true
      : false;
    const bindingIdIsDirectoryId: BindingIdIsDirectoryId = false;

    expect(bindingIdIsDirectoryId).toBe(false);
    expect(isLocalAudioBindingId(BINDING_ID)).toBe(true);
    expect(isLocalAudioDirectoryId(DIRECTORY_ID)).toBe(true);
    expect(isLocalAudioBindingId("local_audio_track_sample_001")).toBe(false);
    expect(isLocalAudioTrackId("track_sample_001")).toBe(true);
    expect(isLocalAudioSourceId("local_audio_copy_001")).toBe(true);
  });

  it("round-trips a binding through JSON without platform objects", () => {
    const binding = createSerializableBinding(
      createDesktopAudioSourceRef({
        directoryId: DIRECTORY_ID,
        relativePath: "许嵩/自定义/有何不可.mp3"
      })
    );
    const serialized = JSON.stringify(binding);
    const restored: unknown = JSON.parse(serialized);

    expect(serialized).not.toContain("FileSystemFileHandle");
    expect(isLocalAudioBindingSerializable(restored)).toBe(true);
    expect(
      isLocalAudioBindingSerializable({
        ...binding,
        file: { platformObject: true }
      })
    ).toBe(false);
  });

  it("keeps a scan candidate distinct from a confirmed binding", () => {
    type CandidateIsBinding = DesktopScannedAudioFile extends LocalAudioBinding
      ? true
      : false;
    const candidateIsBinding: CandidateIsBinding = false;
    const candidate: DesktopScannedAudioFile = {
      sourceRef: {
        directoryId: DIRECTORY_ID,
        relativePath: "许嵩/自定义/有何不可.mp3"
      },
      fileName: "有何不可.mp3",
      relativePath: "许嵩/自定义/有何不可.mp3",
      fileExtension: "mp3",
      fileSize: 1024,
      modifiedAt: 1_765_000_000_000.5,
      parseStatus: "parsed",
      issues: []
    };

    expect(candidateIsBinding).toBe(false);
    expect(candidate).not.toHaveProperty("bindingId");
    expect(isLocalAudioBindingSerializable(candidate)).toBe(false);
  });
});
