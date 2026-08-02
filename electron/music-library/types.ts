import {
  isLocalAudioDirectoryId,
  type LocalAudioAvailability,
  type LocalAudioBindingId,
  type LocalAudioTrackId
} from "../../src/types/localAudioBinding";
import type { LocalDirectoryCandidateIssueCode } from "../../src/features/local-library/localDirectoryEntryScanner";

declare const desktopAudioCandidateIdBrand: unique symbol;
const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type DesktopAudioCandidateId = string & {
  readonly [desktopAudioCandidateIdBrand]: "DesktopAudioCandidateId";
};

export type DesktopMusicLibraryErrorCode =
  | "binding_conflict"
  | "binding_invalid"
  | "binding_store_corrupt"
  | "binding_store_read_failed"
  | "binding_store_schema_unsupported"
  | "binding_store_write_failed"
  | "candidate_unavailable"
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

export interface RegisteredMusicDirectory {
  directoryId: string;
  displayName: string;
  displayPath: string;
  selectedAt: string;
  availability: MusicDirectoryAvailability;
}

export interface DesktopMusicDirectorySummary {
  readonly directoryId: string;
  readonly displayName: string;
  readonly selectedAt: string;
  readonly availability: MusicDirectoryAvailability;
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
  issues: readonly LocalDirectoryCandidateIssueCode[];
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

export interface DesktopScannedAudioCandidatePreview {
  readonly candidateId: DesktopAudioCandidateId;
  readonly fileName: string;
  readonly fileExtension: DesktopAudioFileExtension;
  readonly fileSize: number;
  readonly modifiedAt: number;
  readonly albumTitle?: string;
  readonly artistName?: string;
  readonly trackTitle?: string;
  readonly parseStatus: "parsed" | "needs_review";
  readonly issues: readonly LocalDirectoryCandidateIssueCode[];
}

export interface DesktopDirectoryScanIssuePreview {
  readonly code: DesktopDirectoryScanErrorCode;
  readonly message: string;
}

export interface DesktopMusicDirectoryScanPreviewResult {
  readonly scannedAt: string;
  readonly totalFileCount: number;
  readonly supportedFileCount: number;
  readonly ignoredFileCount: number;
  readonly errorCount: number;
  readonly candidates: readonly DesktopScannedAudioCandidatePreview[];
  readonly errors: readonly DesktopDirectoryScanIssuePreview[];
}

export interface LocalAudioBindingIdRequest {
  readonly bindingId: LocalAudioBindingId;
}

export interface LocalAudioTrackIdRequest {
  readonly trackId: LocalAudioTrackId;
}

export interface BindCandidateToTrackRequest {
  readonly candidateId: DesktopAudioCandidateId;
  readonly trackId: LocalAudioTrackId;
  readonly expectedExistingBindingId?: LocalAudioBindingId;
}

export interface UnbindLocalAudioTrackRequest {
  readonly trackId: LocalAudioTrackId;
  readonly expectedBindingId: LocalAudioBindingId;
}

export interface DesktopLocalAudioBindingSummary {
  readonly bindingId: LocalAudioBindingId;
  readonly trackId: LocalAudioTrackId;
  readonly fileName: string;
  readonly fileSize?: number;
  readonly modifiedAt?: number;
  readonly availability: LocalAudioAvailability;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface DesktopLocalAudioBindingApi {
  list(): Promise<readonly DesktopLocalAudioBindingSummary[]>;
  findByBindingId(
    request: LocalAudioBindingIdRequest
  ): Promise<DesktopLocalAudioBindingSummary | undefined>;
  findByTrackId(
    request: LocalAudioTrackIdRequest
  ): Promise<DesktopLocalAudioBindingSummary | undefined>;
  bindCandidateToTrack(
    request: BindCandidateToTrackRequest
  ): Promise<DesktopLocalAudioBindingSummary>;
  unbindTrack(
    request: UnbindLocalAudioTrackRequest
  ): Promise<DesktopLocalAudioBindingSummary>;
}

export interface DesktopMusicLibraryApi {
  readonly bindings: DesktopLocalAudioBindingApi;
  selectDirectory(): Promise<DesktopMusicDirectorySummary | null>;
  listDirectories(): Promise<readonly DesktopMusicDirectorySummary[]>;
  scanDirectory(
    request: ScanMusicDirectoryRequest
  ): Promise<DesktopMusicDirectoryScanPreviewResult>;
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

export function isDesktopAudioCandidateId(
  value: unknown
): value is DesktopAudioCandidateId {
  return typeof value === "string" && UUID_V4_PATTERN.test(value);
}
