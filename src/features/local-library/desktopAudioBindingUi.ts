import type { DesktopAudioCandidateId } from "../../../electron/music-library/types";
import type { CatalogData } from "../../types";
import {
  isLocalAudioTrackId,
  type LocalAudioTrackId
} from "../../types/localAudioBinding";
import {
  parseLocalAudioBindingSummaries,
  type LocalAudioBindingKey,
  type LocalAudioBindingSummary
} from "./localAudioBindingService";
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
): readonly LocalAudioBindingSummary[] {
  return parseLocalAudioBindingSummaries(value);
}

export function associateCandidatesWithBindings(
  candidates: readonly DesktopAudioCandidatePreview[],
  summaries: readonly LocalAudioBindingSummary[],
  bindingHintByCandidateId: ReadonlyMap<DesktopAudioCandidateId, LocalAudioBindingKey>
): ReadonlyMap<DesktopAudioCandidateId, LocalAudioBindingSummary> {
  const result = new Map<DesktopAudioCandidateId, LocalAudioBindingSummary>();
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
    case "directory_unavailable":
    case "unknown_directory":
      return {
        kind: "directory-unavailable",
        message: "音乐目录已经失效，请刷新目录状态或重新选择目录。"
      };
    case "binding_store_corrupt":
    case "binding_store_read_failed":
    case "binding_store_schema_unsupported":
    case "read_failed":
      return {
        kind: "generic",
        message: "无法读取本地音频绑定状态，请稍后重试。"
      };
    case "binding_store_write_failed":
    case "write_failed":
      return {
        kind: "generic",
        message: "无法保存本地音频绑定，请稍后重试。"
      };
    case "binding_invalid":
    case "invalid_request":
    case "security_rejected":
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

function hasMatchingDisplayMetadata(
  candidate: DesktopAudioCandidatePreview,
  summary: LocalAudioBindingSummary
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

function getBindingFingerprint(summary: LocalAudioBindingSummary): string {
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
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return error.code;
  }

  return error instanceof Error ? /^\[([a-z_]+)\]/.exec(error.message)?.[1] : undefined;
}

function normalizeSearchText(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("zh-CN");
}

function isSafeText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && !value.includes("\0");
}
