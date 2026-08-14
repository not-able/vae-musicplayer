import type { ISODateString } from "../../types";
import {
  isLocalAudioTrackId,
  type LocalAudioAvailability,
  type LocalAudioTrackId
} from "../../types/localAudioBinding";

declare const localAudioBindingKeyBrand: unique symbol;
declare const localAudioCandidateIdBrand: unique symbol;

/**
 * A platform-neutral identifier for a persisted binding. Web legacy records and
 * portable Electron bindings use different ID formats, so callers must treat it
 * as an opaque comparison key.
 */
export type LocalAudioBindingKey = string & {
  readonly [localAudioBindingKeyBrand]: "LocalAudioBindingKey";
};

/**
 * An ephemeral, opaque candidate capability. The owning adapter resolves it to
 * platform state; callers cannot derive a file reference from this value.
 */
export type LocalAudioCandidateId = string & {
  readonly [localAudioCandidateIdBrand]: "LocalAudioCandidateId";
};

export interface LocalAudioBindingSummary {
  readonly bindingId: LocalAudioBindingKey;
  readonly trackId: LocalAudioTrackId;
  readonly fileName: string;
  readonly fileSize?: number;
  readonly modifiedAt?: number;
  readonly availability: LocalAudioAvailability;
  readonly createdAt?: ISODateString;
  readonly updatedAt: ISODateString;
}

export type LocalAudioBindingServiceErrorCode =
  | "binding_conflict"
  | "binding_not_found"
  | "candidate_unavailable"
  | "directory_unavailable"
  | "invalid_request"
  | "permission_required"
  | "read_failed"
  | "security_rejected"
  | "unknown"
  | "write_failed";

export interface LocalAudioBindingServiceError {
  readonly code: LocalAudioBindingServiceErrorCode;
  readonly message: string;
  readonly retryable: boolean;
}

export type LocalAudioBindingServiceResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: LocalAudioBindingServiceError };

export interface FindLocalAudioBindingByIdRequest {
  readonly bindingId: LocalAudioBindingKey;
}

export interface FindLocalAudioBindingByTrackRequest {
  readonly trackId: LocalAudioTrackId;
}

export interface BindLocalAudioCandidateRequest {
  readonly candidateId: LocalAudioCandidateId;
  readonly trackId: LocalAudioTrackId;
  readonly expectedExistingBindingId?: LocalAudioBindingKey;
}

export interface UnbindLocalAudioTrackRequest {
  readonly trackId: LocalAudioTrackId;
  readonly expectedBindingId: LocalAudioBindingKey;
}

/**
 * Shared binding semantics only. Platform source objects, paths, Electron APIs,
 * and playable resources belong to adapters and are deliberately absent here.
 */
export interface LocalAudioBindingService {
  listBindings(): Promise<
    LocalAudioBindingServiceResult<readonly LocalAudioBindingSummary[]>
  >;
  findBindingById(
    request: FindLocalAudioBindingByIdRequest
  ): Promise<LocalAudioBindingServiceResult<LocalAudioBindingSummary | undefined>>;
  findBindingByTrack(
    request: FindLocalAudioBindingByTrackRequest
  ): Promise<LocalAudioBindingServiceResult<LocalAudioBindingSummary | undefined>>;
  bindCandidate(
    request: BindLocalAudioCandidateRequest
  ): Promise<LocalAudioBindingServiceResult<LocalAudioBindingSummary>>;
  unbindTrack(
    request: UnbindLocalAudioTrackRequest
  ): Promise<LocalAudioBindingServiceResult<LocalAudioBindingSummary>>;
}

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BINDING_KEY_PATTERN = /^[a-z0-9][a-z0-9._:-]{0,255}$/i;

export function isLocalAudioBindingKey(value: unknown): value is LocalAudioBindingKey {
  return typeof value === "string" && BINDING_KEY_PATTERN.test(value);
}

export function isLocalAudioCandidateId(
  value: unknown
): value is LocalAudioCandidateId {
  return typeof value === "string" && UUID_V4_PATTERN.test(value);
}

export function parseLocalAudioBindingSummaries(
  value: unknown
): readonly LocalAudioBindingSummary[] {
  if (!Array.isArray(value)) {
    throw new TypeError("Local audio binding summaries are invalid.");
  }

  const summaries = value.map(parseLocalAudioBindingSummary);
  const bindingIds = new Set<LocalAudioBindingKey>();
  const trackIds = new Set<LocalAudioTrackId>();

  for (const summary of summaries) {
    if (bindingIds.has(summary.bindingId) || trackIds.has(summary.trackId)) {
      throw new TypeError("Local audio binding summaries contain duplicate IDs.");
    }

    bindingIds.add(summary.bindingId);
    trackIds.add(summary.trackId);
  }

  return summaries;
}

export function localAudioBindingSuccess<T>(
  value: T
): LocalAudioBindingServiceResult<T> {
  return { ok: true, value };
}

export function localAudioBindingFailure<T = never>(
  code: LocalAudioBindingServiceErrorCode,
  message: string,
  retryable: boolean
): LocalAudioBindingServiceResult<T> {
  return {
    ok: false,
    error: { code, message, retryable }
  };
}

function parseLocalAudioBindingSummary(value: unknown): LocalAudioBindingSummary {
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
      "updatedAt"
    ]) ||
    !isLocalAudioBindingKey(value.bindingId) ||
    !isLocalAudioTrackId(value.trackId) ||
    !isSafeFileName(value.fileName) ||
    !isOptionalFileSize(value.fileSize) ||
    !isOptionalTimestamp(value.modifiedAt) ||
    !isAvailability(value.availability) ||
    !isOptionalIsoDateString(value.createdAt) ||
    !isIsoDateString(value.updatedAt)
  ) {
    throw new TypeError("Local audio binding summary is invalid.");
  }

  return {
    bindingId: value.bindingId,
    trackId: value.trackId,
    fileName: value.fileName,
    ...(value.fileSize !== undefined ? { fileSize: value.fileSize } : {}),
    ...(value.modifiedAt !== undefined ? { modifiedAt: value.modifiedAt } : {}),
    availability: value.availability,
    ...(value.createdAt !== undefined ? { createdAt: value.createdAt } : {}),
    updatedAt: value.updatedAt
  };
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

function isSafeFileName(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    !value.includes("\0") &&
    !value.includes("/") &&
    !value.includes("\\")
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

function isAvailability(value: unknown): value is LocalAudioAvailability {
  return (
    value === "available" ||
    value === "missing" ||
    value === "permission-required" ||
    value === "changed" ||
    value === "unknown"
  );
}

function isIsoDateString(value: unknown): value is ISODateString {
  if (typeof value !== "string") {
    return false;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

function isOptionalIsoDateString(value: unknown): value is ISODateString | undefined {
  return value === undefined || isIsoDateString(value);
}
