import { randomUUID } from "node:crypto";

import {
  createDesktopAudioSourceRef,
  type DesktopFileAudioSourceRef
} from "../../src/types/localAudioBinding";
import { isLocalDirectoryCandidateIssueCode } from "../../src/features/local-library/localDirectoryEntryScanner";
import { MusicLibraryError } from "./errors";
import {
  isDesktopAudioCandidateId,
  isValidMusicDirectoryId,
  type DesktopAudioCandidateId,
  type DesktopAudioFileExtension,
  type DesktopDirectoryScanErrorCode,
  type DesktopMusicDirectoryScanPreviewResult,
  type DesktopMusicDirectoryScanResult,
  type DesktopScannedAudioCandidatePreview
} from "./types";

const MAX_CANDIDATE_ID_ATTEMPTS = 32;

export interface DesktopAudioCandidateStoreOptions {
  readonly candidateIdFactory?: () => string;
}

export interface DesktopAudioCandidateScanToken {
  readonly ownerId: number;
  readonly directoryId: string;
  readonly generation: number;
}

export interface TrustedDesktopAudioCandidate {
  readonly candidateId: DesktopAudioCandidateId;
  readonly ownerId: number;
  readonly generation: number;
  readonly source: DesktopFileAudioSourceRef;
  readonly fileName: string;
  readonly fileSize: number;
  readonly modifiedAt: number;
}

interface CandidateSession {
  readonly directoryId: string;
  readonly generation: number;
  readonly candidates: Map<DesktopAudioCandidateId, TrustedDesktopAudioCandidate>;
}

export class DesktopAudioCandidateStore {
  private readonly candidateIdFactory: () => string;
  private readonly sessionsByOwner = new Map<number, CandidateSession>();
  private readonly generationByOwner = new Map<number, number>();
  private readonly issuedCandidateIds = new Set<DesktopAudioCandidateId>();

  constructor(options: DesktopAudioCandidateStoreOptions = {}) {
    this.candidateIdFactory = options.candidateIdFactory ?? randomUUID;
  }

  beginScan(ownerId: number, directoryId: string): DesktopAudioCandidateScanToken {
    assertOwnerId(ownerId);
    if (!isValidMusicDirectoryId(directoryId)) {
      throw new MusicLibraryError("invalid_request", "本地音乐目录标识无效。");
    }

    this.invalidateOwner(ownerId);
    this.invalidateDirectory(directoryId);
    const generation = (this.generationByOwner.get(ownerId) ?? 0) + 1;
    this.generationByOwner.set(ownerId, generation);
    this.sessionsByOwner.set(ownerId, {
      directoryId,
      generation,
      candidates: new Map()
    });

    return { ownerId, directoryId, generation };
  }

  publishScan(
    token: DesktopAudioCandidateScanToken,
    result: DesktopMusicDirectoryScanResult
  ): DesktopMusicDirectoryScanPreviewResult {
    const session = this.getCurrentSession(token);
    validateTrustedScanResult(result, token.directoryId);

    const records = result.candidates.map((candidate) => {
      const candidateId = this.createCandidateId();
      const source = createDesktopAudioSourceRef(candidate.sourceRef);
      const trustedCandidate: TrustedDesktopAudioCandidate = {
        candidateId,
        ownerId: token.ownerId,
        generation: token.generation,
        source,
        fileName: candidate.fileName,
        fileSize: candidate.fileSize,
        modifiedAt: candidate.modifiedAt
      };

      return {
        trustedCandidate,
        preview: toCandidatePreview(candidateId, candidate)
      };
    });

    for (const { trustedCandidate } of records) {
      session.candidates.set(trustedCandidate.candidateId, trustedCandidate);
    }

    return {
      scannedAt: result.scannedAt,
      totalFileCount: result.totalFileCount,
      supportedFileCount: result.supportedFileCount,
      ignoredFileCount: result.ignoredFileCount,
      errorCount: result.errorCount,
      candidates: records.map(({ preview }) => preview),
      errors: result.errors.map((issue) => ({
        code: issue.code,
        message: getScanIssueMessage(issue.code)
      }))
    };
  }

  abortScan(token: DesktopAudioCandidateScanToken): void {
    const session = this.sessionsByOwner.get(token.ownerId);
    if (session && isSameSession(session, token)) {
      this.sessionsByOwner.delete(token.ownerId);
    }
  }

  resolveCandidate(
    ownerId: number,
    candidateId: DesktopAudioCandidateId
  ): TrustedDesktopAudioCandidate {
    assertOwnerId(ownerId);
    const candidate = this.sessionsByOwner.get(ownerId)?.candidates.get(candidateId);

    if (!candidate) {
      throwCandidateUnavailable();
    }

    return candidate;
  }

  invalidateOwner(ownerId: number): void {
    this.sessionsByOwner.delete(ownerId);
  }

  invalidateDirectory(directoryId: string): void {
    for (const [ownerId, session] of this.sessionsByOwner) {
      if (session.directoryId === directoryId) {
        this.sessionsByOwner.delete(ownerId);
      }
    }
  }

  private getCurrentSession(token: DesktopAudioCandidateScanToken): CandidateSession {
    const session = this.sessionsByOwner.get(token.ownerId);
    if (!session || !isSameSession(session, token)) {
      throwCandidateUnavailable();
    }

    return session;
  }

  private createCandidateId(): DesktopAudioCandidateId {
    for (let attempt = 0; attempt < MAX_CANDIDATE_ID_ATTEMPTS; attempt += 1) {
      const candidateId = this.candidateIdFactory();
      if (
        isDesktopAudioCandidateId(candidateId) &&
        !this.issuedCandidateIds.has(candidateId)
      ) {
        this.issuedCandidateIds.add(candidateId);
        return candidateId;
      }
    }

    throw new MusicLibraryError("scan_failed", "无法为扫描候选创建安全的临时标识。");
  }
}

function validateTrustedScanResult(
  result: DesktopMusicDirectoryScanResult,
  directoryId: string
): void {
  if (
    result.directoryId !== directoryId ||
    !isIsoDateString(result.scannedAt) ||
    !isNonNegativeSafeInteger(result.totalFileCount) ||
    !isNonNegativeSafeInteger(result.supportedFileCount) ||
    !isNonNegativeSafeInteger(result.ignoredFileCount) ||
    !isNonNegativeSafeInteger(result.errorCount) ||
    result.candidates.length !== result.supportedFileCount ||
    result.errors.length !== result.errorCount ||
    !result.candidates.every((candidate) =>
      isTrustedScannedCandidate(candidate, directoryId)
    ) ||
    !result.errors.every((issue) => isScanErrorCode(issue.code))
  ) {
    throw new MusicLibraryError("scan_failed", "本地音乐目录扫描结果无效。");
  }
}

function isTrustedScannedCandidate(
  candidate: DesktopMusicDirectoryScanResult["candidates"][number],
  directoryId: string
): boolean {
  return (
    candidate.sourceRef.directoryId === directoryId &&
    candidate.sourceRef.relativePath === candidate.relativePath &&
    isSafeFileName(candidate.fileName) &&
    isAudioFileExtension(candidate.fileExtension) &&
    isNonNegativeSafeInteger(candidate.fileSize) &&
    typeof candidate.modifiedAt === "number" &&
    Number.isFinite(candidate.modifiedAt) &&
    candidate.modifiedAt >= 0 &&
    (candidate.parseStatus === "parsed" || candidate.parseStatus === "needs_review") &&
    candidate.issues.every(isLocalDirectoryCandidateIssueCode)
  );
}

function toCandidatePreview(
  candidateId: DesktopAudioCandidateId,
  candidate: DesktopMusicDirectoryScanResult["candidates"][number]
): DesktopScannedAudioCandidatePreview {
  return {
    candidateId,
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

function isSameSession(
  session: CandidateSession,
  token: DesktopAudioCandidateScanToken
): boolean {
  return (
    session.generation === token.generation && session.directoryId === token.directoryId
  );
}

function assertOwnerId(ownerId: number): void {
  if (!Number.isSafeInteger(ownerId) || ownerId <= 0) {
    throw new MusicLibraryError("invalid_request", "Renderer 标识无效。");
  }
}

function throwCandidateUnavailable(): never {
  throw new MusicLibraryError(
    "candidate_unavailable",
    "扫描候选已失效，请重新扫描音乐目录。"
  );
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

function isAudioFileExtension(value: unknown): value is DesktopAudioFileExtension {
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

function isScanErrorCode(value: unknown): value is DesktopDirectoryScanErrorCode {
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
