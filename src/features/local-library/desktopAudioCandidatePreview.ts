import type {
  DesktopAudioCandidateId,
  DesktopAudioFileExtension,
  DesktopDirectoryScanErrorCode,
  DesktopMusicDirectoryScanPreviewResult,
  DesktopMusicDirectorySummary,
  MusicDirectoryAvailability
} from "../../../electron/music-library/types";
import { isDesktopAudioCandidateId } from "../../../electron/music-library/types";
import { isLocalAudioDirectoryId } from "../../types/localAudioBinding";
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

export interface DesktopAudioScanIssuePreview {
  readonly code: DesktopDirectoryScanErrorCode;
  readonly message: string;
}

export interface DesktopAudioScanPreview {
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
  directory: DesktopMusicDirectorySummary
): DesktopMusicDirectoryOption {
  if (
    !isPlainRecord(directory) ||
    !hasExactlyKeys(directory, [
      "directoryId",
      "displayName",
      "selectedAt",
      "availability"
    ]) ||
    !isLocalAudioDirectoryId(directory.directoryId) ||
    !isSafeDisplayName(directory.displayName) ||
    !isIsoDateString(directory.selectedAt) ||
    !isDirectoryAvailability(directory.availability)
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
  result: DesktopMusicDirectoryScanPreviewResult
): DesktopAudioScanPreview {
  if (
    !isPlainRecord(result) ||
    !hasExactlyKeys(result, [
      "scannedAt",
      "totalFileCount",
      "supportedFileCount",
      "ignoredFileCount",
      "errorCount",
      "candidates",
      "errors"
    ]) ||
    !isIsoDateString(result.scannedAt) ||
    !isNonNegativeSafeInteger(result.totalFileCount) ||
    !isNonNegativeSafeInteger(result.supportedFileCount) ||
    !isNonNegativeSafeInteger(result.ignoredFileCount) ||
    !isNonNegativeSafeInteger(result.errorCount)
  ) {
    throw new TypeError("Desktop music directory scan summary is invalid.");
  }

  const candidates = result.candidates.map(toCandidatePreview);
  const errors = result.errors.map(toScanIssuePreview);
  const candidateIds = new Set(candidates.map(({ candidateId }) => candidateId));

  if (
    candidates.length !== result.supportedFileCount ||
    errors.length !== result.errorCount ||
    candidateIds.size !== candidates.length
  ) {
    throw new TypeError("Desktop music directory scan counts are inconsistent.");
  }

  return {
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
  candidate: DesktopMusicDirectoryScanPreviewResult["candidates"][number]
): DesktopAudioCandidatePreview {
  if (
    !isPlainRecord(candidate) ||
    !hasOnlyKeys(candidate, [
      "candidateId",
      "fileName",
      "fileExtension",
      "fileSize",
      "modifiedAt",
      "albumTitle",
      "artistName",
      "trackTitle",
      "parseStatus",
      "issues"
    ]) ||
    !isDesktopAudioCandidateId(candidate.candidateId) ||
    !isSafeFileName(candidate.fileName) ||
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
    candidateId: candidate.candidateId,
    fileName: candidate.fileName,
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
  issue: DesktopMusicDirectoryScanPreviewResult["errors"][number]
): DesktopAudioScanIssuePreview {
  if (
    !isPlainRecord(issue) ||
    !hasExactlyKeys(issue, ["code", "message"]) ||
    !isDesktopDirectoryScanErrorCode(issue.code)
  ) {
    throw new TypeError("Desktop music directory scan issue is invalid.");
  }

  return {
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

function isDirectoryAvailability(value: unknown): value is MusicDirectoryAvailability {
  return value === "available" || value === "missing" || value === "unreadable";
}

function isSafeFileName(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    !value.includes("\0") &&
    !value.includes("/") &&
    !value.includes("\\")
  );
}

function isSafeDisplayName(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    !value.includes("\0") &&
    !value.includes("/") &&
    !value.includes("\\")
  );
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

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactlyKeys(
  value: Record<string, unknown>,
  expectedKeys: readonly string[]
): boolean {
  const keys = Reflect.ownKeys(value);
  return keys.length === expectedKeys.length && hasOnlyKeys(value, expectedKeys);
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[]
): boolean {
  const allowedKeySet = new Set(allowedKeys);
  return Reflect.ownKeys(value).every(
    (key) => typeof key === "string" && allowedKeySet.has(key)
  );
}
