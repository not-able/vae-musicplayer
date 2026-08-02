export type MusicDirectoryAvailability = "available" | "missing" | "unreadable";

export interface SelectedMusicDirectory {
  directoryId: string;
  displayName: string;
  displayPath: string;
  selectedAt: string;
  availability: MusicDirectoryAvailability;
}

export interface ScanMusicDirectoryRequest {
  directoryId: string;
}

export type DesktopAudioFileExtension =
  "mp3" | "flac" | "m4a" | "aac" | "ogg" | "opus" | "wav";

export interface DesktopScannedAudioFile {
  sourceRef: {
    directoryId: string;
    relativePath: string;
  };
  fileName: string;
  relativePath: string;
  fileExtension: DesktopAudioFileExtension;
  fileSize: number;
  modifiedAt: number;
  albumTitle?: string;
  artistName?: string;
  trackTitle?: string;
  parseStatus: "parsed" | "needs_review";
  issues: readonly string[];
}

export type DesktopDirectoryScanErrorCode =
  "path_escape_blocked" | "read_directory_failed" | "read_file_status_failed";

export interface DesktopDirectoryScanError {
  relativePath?: string;
  code: DesktopDirectoryScanErrorCode;
  message: string;
}

export interface DesktopMusicDirectoryScanResult {
  directoryId: string;
  scannedAt: string;
  totalFileCount: number;
  supportedFileCount: number;
  ignoredFileCount: number;
  errorCount: number;
  candidates: readonly DesktopScannedAudioFile[];
  errors: readonly DesktopDirectoryScanError[];
}

export interface DesktopMusicLibraryApi {
  selectDirectory(): Promise<SelectedMusicDirectory | null>;
  listDirectories(): Promise<readonly SelectedMusicDirectory[]>;
  scanDirectory(
    request: ScanMusicDirectoryRequest
  ): Promise<DesktopMusicDirectoryScanResult>;
  forgetDirectory(directoryId: string): Promise<void>;
}

export interface DesktopIpcErrorPayload {
  code: string;
  message: string;
}

export type DesktopIpcResult<T> =
  { ok: true; value: T } | { ok: false; error: DesktopIpcErrorPayload };

const DIRECTORY_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidMusicDirectoryId(value: unknown): value is string {
  return typeof value === "string" && DIRECTORY_ID_PATTERN.test(value);
}
