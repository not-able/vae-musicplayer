import {
  isLocalAudioDirectoryId,
  type LocalAudioBinding,
  type LocalAudioBindingId,
  type LocalAudioTrackId
} from "../../src/types/localAudioBinding";

export type DesktopMusicLibraryErrorCode =
  | "binding_conflict"
  | "binding_invalid"
  | "binding_store_corrupt"
  | "binding_store_read_failed"
  | "binding_store_schema_unsupported"
  | "binding_store_write_failed"
  | "directory_missing"
  | "directory_unreadable"
  | "invalid_request"
  | "registry_read_failed"
  | "registry_write_failed"
  | "scan_failed"
  | "selection_failed"
  | "unknown_directory"
  | "untrusted_sender";

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

export interface LocalAudioBindingIdRequest {
  readonly bindingId: LocalAudioBindingId;
}

export interface LocalAudioTrackIdRequest {
  readonly trackId: LocalAudioTrackId;
}

export interface SaveLocalAudioBindingRequest {
  readonly binding: LocalAudioBinding;
}

export interface DesktopLocalAudioBindingApi {
  list(): Promise<readonly LocalAudioBinding[]>;
  findByBindingId(
    request: LocalAudioBindingIdRequest
  ): Promise<LocalAudioBinding | undefined>;
  findByTrackId(
    request: LocalAudioTrackIdRequest
  ): Promise<LocalAudioBinding | undefined>;
  save(request: SaveLocalAudioBindingRequest): Promise<void>;
  removeByBindingId(request: LocalAudioBindingIdRequest): Promise<boolean>;
  removeByTrackId(request: LocalAudioTrackIdRequest): Promise<boolean>;
}

export interface DesktopMusicLibraryApi {
  readonly bindings: DesktopLocalAudioBindingApi;
  selectDirectory(): Promise<SelectedMusicDirectory | null>;
  listDirectories(): Promise<readonly SelectedMusicDirectory[]>;
  scanDirectory(
    request: ScanMusicDirectoryRequest
  ): Promise<DesktopMusicDirectoryScanResult>;
  forgetDirectory(directoryId: string): Promise<void>;
}

export interface DesktopIpcErrorPayload {
  code: DesktopMusicLibraryErrorCode;
  message: string;
}

export type DesktopIpcResult<T> =
  { ok: true; value: T } | { ok: false; error: DesktopIpcErrorPayload };

export function isValidMusicDirectoryId(value: unknown): value is string {
  return isLocalAudioDirectoryId(value);
}
