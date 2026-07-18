import { describe, expect, it } from "vitest";

import {
  createLocalAudioFileHandleRecord,
  createLocalAudioFileRecord,
  getLocalAudioFile,
  getLocalAudioFileValidationError
} from "../features/local-library/localAudioFile";

describe("local audio files", () => {
  it("accepts audio MIME types and known audio extensions", () => {
    const typedAudio = new File(["test"], "sample.bin", {
      type: "audio/mpeg"
    });
    const extensionOnlyAudio = new File(["test"], "sample.FLAC");

    expect(getLocalAudioFileValidationError(typedAudio)).toBeUndefined();
    expect(getLocalAudioFileValidationError(extensionOnlyAudio)).toBeUndefined();
  });

  it("rejects files that do not look like local audio", () => {
    const textFile = new File(["test"], "notes.txt", {
      type: "text/plain"
    });

    expect(getLocalAudioFileValidationError(textFile)).toBe(
      "请选择常见格式的本地音频文件。"
    );
  });

  it("creates a stable track mapping without storing an absolute path", () => {
    const file = new File(["self-created test bytes"], "sample.mp3", {
      type: "audio/mpeg",
      lastModified: 1_721_000_000_000
    });
    const record = createLocalAudioFileRecord(
      "track_sample_001",
      file,
      "2026-07-15T00:00:00.000Z"
    );

    expect(record).toEqual({
      id: "local_audio_track_sample_001",
      trackId: "track_sample_001",
      fileName: "sample.mp3",
      fileType: "audio/mpeg",
      fileSize: file.size,
      status: "available",
      updatedAt: "2026-07-15T00:00:00.000Z",
      storageMethod: "file-copy",
      file
    });
    expect(record).not.toHaveProperty("path");
  });

  it("creates a handle mapping without retaining a browser file copy", async () => {
    const file = new File(["self-created test bytes"], "sample.flac", {
      type: "audio/flac"
    });
    const fileHandle = {
      kind: "file",
      name: file.name,
      getFile: async () => file,
      isSameEntry: async () => true,
      queryPermission: async () => "granted",
      requestPermission: async () => "granted"
    } as unknown as FileSystemFileHandle;
    const record = createLocalAudioFileHandleRecord(
      "track_sample_002",
      file,
      fileHandle,
      "2026-07-18T00:00:00.000Z"
    );

    expect(record).toMatchObject({
      trackId: "track_sample_002",
      fileName: "sample.flac",
      storageMethod: "file-handle",
      fileHandle
    });
    expect(record).not.toHaveProperty("file");
    await expect(getLocalAudioFile(record)).resolves.toBe(file);
  });
});
