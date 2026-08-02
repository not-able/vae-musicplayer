import type {
  DesktopAudioFileExtension,
  DesktopDirectoryScanErrorCode,
  DesktopMusicDirectoryScanResult,
  DesktopScannedAudioFile,
  MusicDirectoryAvailability,
  SelectedMusicDirectory
} from "../../../electron/music-library/types";
import {
  isLocalAudioDirectoryId,
  isLocalAudioRelativePath
} from "../../types/localAudioBinding";
import {
  isLocalDirectoryCandidateIssueCode,
  type LocalDirectoryCandidateIssueCode
} from "./localDirectoryEntryScanner";

export interface DesktopMusicDirectoryOption {
  readonly directoryId: string;
  readonly displayName: string;
  readonly selectedAt: string;
  readonly availability: MusicDirectoryAvailability;
}

export interface DesktopAudioCandidatePreview {
  readonly candidateKey: string;
  readonly fileName: string;
  readonly relativePath: string;
  readonly fileExtension: DesktopAudioFileExtension;
  readonly fileSize: number;
  readonly modifiedAt: number;
  readonly albumTitle?: string;
  readonly artistName?: string;
  readonly trackTitle?: string;
  readonly parseStatus: "parsed" | "needs_review";
  readonly issues: readonly LocalDirectoryCandidateIssueCode[];
}

export interface DesktopAudioScanIssuePreview {
  readonly relativePath?: string;
  readonly code: DesktopDirectoryScanErrorCode;
  readonly message: string;
}

export interface DesktopAudioScanPreview {
  readonly directoryId: string;
  readonly scannedAt: string;
  readonly totalFileCount: number;
  readonly supportedFileCount: number;
  readonly ignoredFileCount: number;
  readonly errorCount: number;
  readonly candidates: readonly DesktopAudioCandidatePreview[];
  readonly errors: readonly DesktopAudioScanIssuePreview[];
}

export type DesktopLibraryOperation = "list" | "scan" | "select";

export function toDesktopMusicDirectoryOption(
  directory: SelectedMusicDirectory
): DesktopMusicDirectoryOption {
  if (
    !isLocalAudioDirectoryId(directory.directoryId) ||
    directory.displayName.trim().length === 0 ||
    !isIsoDateString(directory.selectedAt)
  ) {
    throw new TypeError("Desktop music directory data is invalid.");
  }

  return {
    directoryId: directory.directoryId,
    displayName: directory.displayName,
    selectedAt: directory.selectedAt,
    availability: directory.availability
  };
}

export function buildDesktopAudioScanPreview(
  result: DesktopMusicDirectoryScanResult
): DesktopAudioScanPreview {
  if (
    !isLocalAudioDirectoryId(result.directoryId) ||
    !isIsoDateString(result.scannedAt) ||
    !isNonNegativeSafeInteger(result.totalFileCount) ||
    !isNonNegativeSafeInteger(result.supportedFileCount) ||
    !isNonNegativeSafeInteger(result.ignoredFileCount) ||
    !isNonNegativeSafeInteger(result.errorCount)
  ) {
    throw new TypeError("Desktop music directory scan summary is invalid.");
  }

  const candidates = result.candidates.map((candidate) =>
    toCandidatePreview(candidate, result.directoryId)
  );
  const errors = result.errors.map(toScanIssuePreview);

  if (
    candidates.length !== result.supportedFileCount ||
    errors.length !== result.errorCount
  ) {
    throw new TypeError("Desktop music directory scan counts are inconsistent.");
  }

  return {
    directoryId: result.directoryId,
    scannedAt: result.scannedAt,
    totalFileCount: result.totalFileCount,
    supportedFileCount: result.supportedFileCount,
    ignoredFileCount: result.ignoredFileCount,
    errorCount: result.errorCount,
    candidates,
    errors
  };
}

export function getDesktopLibraryErrorMessage(
  error: unknown,
  operation: DesktopLibraryOperation
): string {
  const code = getPublicErrorCode(error);

  switch (code) {
    case "directory_missing":
    case "unknown_directory":
      return "所选音乐目录已失效，请重新选择或刷新目录列表。";
    case "directory_unreadable":
      return "所选音乐目录当前不可读取，请检查目录权限后重试。";
    case "selection_failed":
      return "无法打开音乐目录选择器，请稍后重试。";
    case "untrusted_sender":
      return "桌面页面未通过安全校验，目录操作已被拒绝。";
    case "invalid_request":
      return "目录操作请求无效，请刷新页面后重试。";
    case "scan_failed":
      return "扫描音乐目录失败，请检查目录状态后重试。";
    default:
      return operation === "list"
        ? "无法读取已授权音乐目录。"
        : operation === "select"
          ? "无法选择音乐目录。"
          : "无法扫描音乐目录。";
  }
}

function toCandidatePreview(
  candidate: DesktopScannedAudioFile,
  directoryId: string
): DesktopAudioCandidatePreview {
  if (
    candidate.sourceRef.directoryId !== directoryId ||
    candidate.sourceRef.relativePath !== candidate.relativePath ||
    !isLocalAudioRelativePath(candidate.relativePath) ||
    candidate.fileName.trim().length === 0 ||
    candidate.fileName.includes("\0") ||
    !isNonNegativeSafeInteger(candidate.fileSize) ||
    !Number.isFinite(candidate.modifiedAt) ||
    candidate.modifiedAt < 0 ||
    !isDesktopAudioFileExtension(candidate.fileExtension) ||
    !isCandidateParseStatus(candidate.parseStatus) ||
    !candidate.issues.every(isLocalDirectoryCandidateIssueCode)
  ) {
    throw new TypeError("Desktop scanned audio candidate is invalid.");
  }

  return {
    candidateKey: candidate.relativePath,
    fileName: candidate.fileName,
    relativePath: candidate.relativePath,
    fileExtension: candidate.fileExtension,
    fileSize: candidate.fileSize,
    modifiedAt: candidate.modifiedAt,
    ...(candidate.albumTitle ? { albumTitle: candidate.albumTitle } : {}),
    ...(candidate.artistName ? { artistName: candidate.artistName } : {}),
    ...(candidate.trackTitle ? { trackTitle: candidate.trackTitle } : {}),
    parseStatus: candidate.parseStatus,
    issues: [...candidate.issues]
  };
}

function toScanIssuePreview(
  issue: DesktopMusicDirectoryScanResult["errors"][number]
): DesktopAudioScanIssuePreview {
  if (
    (issue.relativePath !== undefined &&
      !isLocalAudioRelativePath(issue.relativePath)) ||
    !isDesktopDirectoryScanErrorCode(issue.code)
  ) {
    throw new TypeError("Desktop music directory scan issue is invalid.");
  }

  return {
    ...(issue.relativePath ? { relativePath: issue.relativePath } : {}),
    code: issue.code,
    message: getScanIssueMessage(issue.code)
  };
}

function getPublicErrorCode(error: unknown): string | undefined {
  if (!(error instanceof Error)) {
    return undefined;
  }

  return /^\[([a-z_]+)\]/.exec(error.message)?.[1];
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isIsoDateString(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

function isDesktopAudioFileExtension(
  value: unknown
): value is DesktopAudioFileExtension {
  return (
    value === "mp3" ||
    value === "flac" ||
    value === "m4a" ||
    value === "aac" ||
    value === "ogg" ||
    value === "opus" ||
    value === "wav"
  );
}

function isCandidateParseStatus(
  value: unknown
): value is DesktopAudioCandidatePreview["parseStatus"] {
  return value === "parsed" || value === "needs_review";
}

function isDesktopDirectoryScanErrorCode(
  value: unknown
): value is DesktopDirectoryScanErrorCode {
  return (
    value === "path_escape_blocked" ||
    value === "read_directory_failed" ||
    value === "read_file_status_failed"
  );
}

function getScanIssueMessage(code: DesktopDirectoryScanErrorCode): string {
  switch (code) {
    case "path_escape_blocked":
      return "已阻止目录条目越过授权根目录。";
    case "read_directory_failed":
      return "无法读取该目录，已跳过并继续扫描。";
    case "read_file_status_failed":
      return "无法读取该文件状态，已跳过并继续扫描。";
  }
}
