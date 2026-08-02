import {
  LocalAudioBindingConflictError,
  LocalAudioBindingValidationError
} from "../../src/features/local-library/localAudioBindingRepository";
import { LocalAudioBindingStoreError } from "./jsonLocalAudioBindingRepository";
import type { DesktopMusicLibraryErrorCode } from "./types";

export type MusicLibraryErrorCode = DesktopMusicLibraryErrorCode;

export class MusicLibraryError extends Error {
  readonly code: MusicLibraryErrorCode;

  constructor(code: MusicLibraryErrorCode, message: string) {
    super(message);
    this.name = "MusicLibraryError";
    this.code = code;
  }
}

export function toMusicLibraryError(error: unknown): MusicLibraryError {
  if (error instanceof MusicLibraryError) {
    return error;
  }

  if (error instanceof LocalAudioBindingConflictError) {
    return new MusicLibraryError("binding_conflict", "该音频绑定与现有曲目绑定冲突。");
  }

  if (error instanceof LocalAudioBindingValidationError) {
    return new MusicLibraryError("binding_invalid", "本地音频绑定数据无效。");
  }

  if (error instanceof LocalAudioBindingStoreError) {
    return mapBindingStoreError(error);
  }

  return new MusicLibraryError(
    "scan_failed",
    "本地音乐目录操作失败，请检查目录状态后重试。"
  );
}

function mapBindingStoreError(error: LocalAudioBindingStoreError): MusicLibraryError {
  switch (error.code) {
    case "LOCAL_AUDIO_BINDING_STORE_BACKUP_FAILED":
    case "LOCAL_AUDIO_BINDING_STORE_CORRUPT":
      return new MusicLibraryError(
        "binding_store_corrupt",
        "本地音频绑定数据已损坏，无法继续读取。"
      );
    case "LOCAL_AUDIO_BINDING_STORE_READ_FAILED":
      return new MusicLibraryError(
        "binding_store_read_failed",
        "无法读取本地音频绑定数据。"
      );
    case "LOCAL_AUDIO_BINDING_STORE_UNSUPPORTED_SCHEMA":
      return new MusicLibraryError(
        "binding_store_schema_unsupported",
        "本地音频绑定数据版本不受支持。"
      );
    case "LOCAL_AUDIO_BINDING_STORE_WRITE_FAILED":
      return new MusicLibraryError(
        "binding_store_write_failed",
        "无法保存本地音频绑定数据。"
      );
  }
}
