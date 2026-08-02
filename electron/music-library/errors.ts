export type MusicLibraryErrorCode =
  | "directory_missing"
  | "directory_unreadable"
  | "invalid_request"
  | "registry_read_failed"
  | "registry_write_failed"
  | "scan_failed"
  | "selection_failed"
  | "unknown_directory"
  | "untrusted_sender";

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

  return new MusicLibraryError(
    "scan_failed",
    "本地音乐目录操作失败，请检查目录状态后重试。"
  );
}
