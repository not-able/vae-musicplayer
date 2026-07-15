import { describe, expect, it } from "vitest";

import {
  createLocalAudioFileRecord,
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
      file
    });
    expect(record).not.toHaveProperty("path");
  });
});
