import type {
  DesktopAudioCandidateId,
  DesktopLocalAudioBindingSummary
} from "../../../electron/music-library/types";
import type { CatalogData } from "../../types";
import {
  isLocalAudioBindingId,
  isLocalAudioTrackId,
  type LocalAudioBindingId,
  type LocalAudioTrackId
} from "../../types/localAudioBinding";
import type { DesktopAudioCandidatePreview } from "./desktopAudioCandidatePreview";

export interface DesktopCatalogTrackOption {
  readonly trackId: LocalAudioTrackId;
  readonly title: string;
  readonly artistName: string;
  readonly albumTitle: string;
}

export type DesktopBindingOperation = "bind" | "list" | "unbind";

export type DesktopBindingErrorKind =
  "candidate-unavailable" | "conflict" | "directory-unavailable" | "generic";

export interface DesktopBindingErrorFeedback {
  readonly kind: DesktopBindingErrorKind;
  readonly message: string;
}

export function buildDesktopCatalogTrackOptions(
  catalog: CatalogData
): readonly DesktopCatalogTrackOption[] {
  const artistsById = new Map(
    catalog.artists.map((artist) => [artist.id, artist.name] as const)
  );
  const albumsById = new Map(
    catalog.albums.map((album) => [album.id, album.title] as const)
  );

  return catalog.tracks.flatMap((track) => {
    const artistName = artistsById.get(track.artistId);
    const albumTitle = albumsById.get(track.albumId);

    if (
      !isLocalAudioTrackId(track.id) ||
      !isSafeText(track.title) ||
      !isSafeText(artistName) ||
      !isSafeText(albumTitle)
    ) {
      return [];
    }

    return [
      {
        trackId: track.id,
        title: track.title,
        artistName,
        albumTitle
      }
    ];
  });
}

export function searchDesktopCatalogTracks(
  tracks: readonly DesktopCatalogTrackOption[],
  query: string
): readonly DesktopCatalogTrackOption[] {
  const normalizedQuery = normalizeSearchText(query.trim());

  if (!normalizedQuery) {
    return tracks;
  }

  return tracks.filter((track) =>
    [track.title, track.artistName, track.albumTitle].some((value) =>
      normalizeSearchText(value).includes(normalizedQuery)
    )
  );
}

export function parseDesktopBindingSummaries(
  value: unknown
): readonly DesktopLocalAudioBindingSummary[] {
  if (!Array.isArray(value)) {
    throw new TypeError("Desktop binding summaries are invalid.");
  }

  const summaries = value.map(parseDesktopBindingSummary);
  const bindingIds = new Set<LocalAudioBindingId>();
  const trackIds = new Set<LocalAudioTrackId>();

  for (const summary of summaries) {
    if (bindingIds.has(summary.bindingId) || trackIds.has(summary.trackId)) {
      throw new TypeError("Desktop binding summaries contain duplicate IDs.");
    }

    bindingIds.add(summary.bindingId);
    trackIds.add(summary.trackId);
  }

  return summaries;
}

export function associateCandidatesWithBindings(
  candidates: readonly DesktopAudioCandidatePreview[],
  summaries: readonly DesktopLocalAudioBindingSummary[],
  bindingHintByCandidateId: ReadonlyMap<DesktopAudioCandidateId, LocalAudioBindingId>
): ReadonlyMap<DesktopAudioCandidateId, DesktopLocalAudioBindingSummary> {
  const result = new Map<DesktopAudioCandidateId, DesktopLocalAudioBindingSummary>();
  const summariesById = new Map(
    summaries.map((summary) => [summary.bindingId, summary] as const)
  );

  for (const candidate of candidates) {
    const hintedBindingId = bindingHintByCandidateId.get(candidate.candidateId);
    const hintedSummary = hintedBindingId
      ? summariesById.get(hintedBindingId)
      : undefined;

    if (hintedSummary && hasMatchingDisplayMetadata(candidate, hintedSummary)) {
      result.set(candidate.candidateId, hintedSummary);
    }
  }

  const candidatesByFingerprint = groupByFingerprint(
    candidates,
    getCandidateFingerprint
  );
  const summariesWithFingerprint = summaries.filter(
    (summary) => summary.fileSize !== undefined && summary.modifiedAt !== undefined
  );
  const summariesByFingerprint = groupByFingerprint(
    summariesWithFingerprint,
    getBindingFingerprint
  );

  for (const [fingerprint, matchingCandidates] of candidatesByFingerprint) {
    const matchingSummaries = summariesByFingerprint.get(fingerprint);

    if (matchingCandidates.length !== 1 || matchingSummaries?.length !== 1) {
      continue;
    }

    const candidate = matchingCandidates[0];
    const summary = matchingSummaries[0];
    if (candidate && summary && !result.has(candidate.candidateId)) {
      result.set(candidate.candidateId, summary);
    }
  }

  return result;
}

export function getDesktopBindingErrorFeedback(
  error: unknown,
  operation: DesktopBindingOperation
): DesktopBindingErrorFeedback {
  const code = getPublicErrorCode(error);

  switch (code) {
    case "binding_conflict":
      return {
        kind: "conflict",
        message: "绑定状态已经发生变化，请重新确认。"
      };
    case "candidate_unavailable":
      return {
        kind: "candidate-unavailable",
        message: "这个扫描候选已经失效，请重新扫描目录后再绑定。"
      };
    case "directory_missing":
    case "directory_unreadable":
    case "unknown_directory":
      return {
        kind: "directory-unavailable",
        message: "音乐目录已经失效，请刷新目录状态或重新选择目录。"
      };
    case "binding_store_corrupt":
    case "binding_store_read_failed":
    case "binding_store_schema_unsupported":
      return {
        kind: "generic",
        message: "无法读取本地音频绑定状态，请稍后重试。"
      };
    case "binding_store_write_failed":
      return {
        kind: "generic",
        message: "无法保存本地音频绑定，请稍后重试。"
      };
    case "binding_invalid":
    case "invalid_request":
    case "untrusted_sender":
      return {
        kind: "generic",
        message: "本地音频绑定请求未能通过安全校验，请刷新页面后重试。"
      };
    default:
      return {
        kind: "generic",
        message:
          operation === "list"
            ? "无法读取本地音频绑定状态，请稍后重试。"
            : operation === "unbind"
              ? "无法解除本地音频绑定，请稍后重试。"
              : "无法保存本地音频绑定，请稍后重试。"
      };
  }
}

function parseDesktopBindingSummary(value: unknown): DesktopLocalAudioBindingSummary {
  if (
    !isPlainRecord(value) ||
    !hasOnlyKeys(value, [
      "bindingId",
      "trackId",
      "fileName",
      "fileSize",
      "modifiedAt",
      "availability",
      "createdAt",
      "updatedAt"
    ]) ||
    !hasRequiredKeys(value, [
      "bindingId",
      "trackId",
      "fileName",
      "availability",
      "createdAt",
      "updatedAt"
    ]) ||
    !isLocalAudioBindingId(value.bindingId) ||
    !isLocalAudioTrackId(value.trackId) ||
    !isSafeFileName(value.fileName) ||
    !isOptionalFileSize(value.fileSize) ||
    !isOptionalTimestamp(value.modifiedAt) ||
    !isAvailability(value.availability) ||
    !isIsoDateString(value.createdAt) ||
    !isIsoDateString(value.updatedAt)
  ) {
    throw new TypeError("Desktop binding summary is invalid.");
  }

  return {
    bindingId: value.bindingId,
    trackId: value.trackId,
    fileName: value.fileName,
    ...(value.fileSize !== undefined ? { fileSize: value.fileSize } : {}),
    ...(value.modifiedAt !== undefined ? { modifiedAt: value.modifiedAt } : {}),
    availability: value.availability,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt
  };
}

function hasMatchingDisplayMetadata(
  candidate: DesktopAudioCandidatePreview,
  summary: DesktopLocalAudioBindingSummary
): boolean {
  return (
    candidate.fileName === summary.fileName &&
    candidate.fileSize === summary.fileSize &&
    candidate.modifiedAt === summary.modifiedAt
  );
}

function getCandidateFingerprint(candidate: DesktopAudioCandidatePreview): string {
  return createFingerprint(
    candidate.fileName,
    candidate.fileSize,
    candidate.modifiedAt
  );
}

function getBindingFingerprint(summary: DesktopLocalAudioBindingSummary): string {
  return createFingerprint(summary.fileName, summary.fileSize, summary.modifiedAt);
}

function createFingerprint(
  fileName: string,
  fileSize: number | undefined,
  modifiedAt: number | undefined
): string {
  return JSON.stringify([fileName, fileSize, modifiedAt]);
}

function groupByFingerprint<T>(
  values: readonly T[],
  getFingerprint: (value: T) => string
): Map<string, T[]> {
  const result = new Map<string, T[]>();

  for (const value of values) {
    const fingerprint = getFingerprint(value);
    const current = result.get(fingerprint) ?? [];
    current.push(value);
    result.set(fingerprint, current);
  }

  return result;
}

function getPublicErrorCode(error: unknown): string | undefined {
  return error instanceof Error ? /^\[([a-z_]+)\]/.exec(error.message)?.[1] : undefined;
}

function normalizeSearchText(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("zh-CN");
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[]
): boolean {
  const allowed = new Set(allowedKeys);
  return Reflect.ownKeys(value).every(
    (key) => typeof key === "string" && allowed.has(key)
  );
}

function hasRequiredKeys(
  value: Record<string, unknown>,
  requiredKeys: readonly string[]
): boolean {
  return requiredKeys.every((key) => Object.hasOwn(value, key));
}

function isSafeText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && !value.includes("\0");
}

function isSafeFileName(value: unknown): value is string {
  return (
    isSafeText(value) &&
    !value.includes("/") &&
    !value.includes("\\") &&
    !value.includes(":")
  );
}

function isOptionalFileSize(value: unknown): value is number | undefined {
  return (
    value === undefined ||
    (typeof value === "number" && Number.isSafeInteger(value) && value >= 0)
  );
}

function isOptionalTimestamp(value: unknown): value is number | undefined {
  return (
    value === undefined ||
    (typeof value === "number" && Number.isFinite(value) && value >= 0)
  );
}

function isAvailability(
  value: unknown
): value is DesktopLocalAudioBindingSummary["availability"] {
  return (
    value === "available" ||
    value === "missing" ||
    value === "permission-required" ||
    value === "changed" ||
    value === "unknown"
  );
}

function isIsoDateString(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}
