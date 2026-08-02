import { describe, expect, it } from "vitest";

import {
  LocalAudioBindingConflictError,
  LocalAudioBindingValidationError
} from "../../src/features/local-library/localAudioBindingRepository";
import { toMusicLibraryError } from "./errors";
import { LocalAudioBindingStoreError } from "./jsonLocalAudioBindingRepository";

describe("music library public binding errors", () => {
  it("maps repository validation and conflict failures to stable codes", () => {
    expect(toMusicLibraryError(new LocalAudioBindingValidationError())).toMatchObject({
      code: "binding_invalid",
      message: "本地音频绑定数据无效。"
    });
    expect(
      toMusicLibraryError(
        new LocalAudioBindingConflictError(
          "binding-id-track-mismatch",
          "internal conflict details"
        )
      )
    ).toMatchObject({
      code: "binding_conflict",
      message: "该音频绑定与现有曲目绑定冲突。"
    });
  });

  it.each([
    ["LOCAL_AUDIO_BINDING_STORE_CORRUPT", "binding_store_corrupt"],
    ["LOCAL_AUDIO_BINDING_STORE_BACKUP_FAILED", "binding_store_corrupt"],
    ["LOCAL_AUDIO_BINDING_STORE_READ_FAILED", "binding_store_read_failed"],
    [
      "LOCAL_AUDIO_BINDING_STORE_UNSUPPORTED_SCHEMA",
      "binding_store_schema_unsupported"
    ],
    ["LOCAL_AUDIO_BINDING_STORE_WRITE_FAILED", "binding_store_write_failed"]
  ] as const)("maps %s without leaking storage paths", (internalCode, publicCode) => {
    const internalError = new LocalAudioBindingStoreError(
      internalCode,
      "Internal failure at D:\\private\\bindings.json",
      { backupPath: "D:\\private\\bindings.corrupt.bak" }
    );

    const publicError = toMusicLibraryError(internalError);

    expect(publicError.code).toBe(publicCode);
    expect(publicError.message).not.toContain("D:\\private");
    expect(publicError).not.toHaveProperty("backupPath");
  });
});
