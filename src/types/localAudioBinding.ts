import type { ISODateString } from "./catalog";

declare const localAudioBindingIdBrand: unique symbol;
declare const localAudioDirectoryIdBrand: unique symbol;
declare const localAudioSourceIdBrand: unique symbol;
declare const localAudioTrackIdBrand: unique symbol;
declare const localAudioRelativePathBrand: unique symbol;

export type LocalAudioBindingId = string & {
  readonly [localAudioBindingIdBrand]: "LocalAudioBindingId";
};

export type LocalAudioDirectoryId = string & {
  readonly [localAudioDirectoryIdBrand]: "LocalAudioDirectoryId";
};

export type LocalAudioSourceId = string & {
  readonly [localAudioSourceIdBrand]: "LocalAudioSourceId";
};

export type LocalAudioTrackId = string & {
  readonly [localAudioTrackIdBrand]: "LocalAudioTrackId";
};

export type LocalAudioRelativePath = string & {
  readonly [localAudioRelativePathBrand]: "LocalAudioRelativePath";
};

export interface WebFileCopyAudioSourceRef {
  readonly type: "web-file-copy";
  readonly sourceId: LocalAudioSourceId;
}

export interface WebFileHandleAudioSourceRef {
  readonly type: "web-file-handle";
  readonly sourceId: LocalAudioSourceId;
}

export interface DesktopFileAudioSourceRef {
  readonly type: "desktop-file";
  readonly directoryId: LocalAudioDirectoryId;
  readonly relativePath: LocalAudioRelativePath;
}

export type LocalAudioSourceRef =
  WebFileCopyAudioSourceRef | WebFileHandleAudioSourceRef | DesktopFileAudioSourceRef;

export type LocalAudioAvailability =
  "available" | "missing" | "permission-required" | "changed" | "unknown";

export interface LocalAudioBinding {
  readonly bindingId: LocalAudioBindingId;
  readonly trackId: LocalAudioTrackId;
  readonly source: LocalAudioSourceRef;
  readonly fileName: string;
  readonly fileSize?: number;
  readonly modifiedAt?: number;
  readonly availability: LocalAudioAvailability;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STABLE_ID_PATTERN = /^[a-z0-9][a-z0-9._:-]{0,255}$/i;
const LOCAL_AUDIO_AVAILABILITIES: ReadonlySet<string> = new Set([
  "available",
  "missing",
  "permission-required",
  "changed",
  "unknown"
]);

export function isLocalAudioBindingId(value: unknown): value is LocalAudioBindingId {
  return typeof value === "string" && UUID_V4_PATTERN.test(value);
}

export function isLocalAudioDirectoryId(
  value: unknown
): value is LocalAudioDirectoryId {
  return typeof value === "string" && UUID_V4_PATTERN.test(value);
}

export function isLocalAudioSourceId(value: unknown): value is LocalAudioSourceId {
  return typeof value === "string" && STABLE_ID_PATTERN.test(value);
}

export function isLocalAudioTrackId(value: unknown): value is LocalAudioTrackId {
  return typeof value === "string" && STABLE_ID_PATTERN.test(value);
}

export function normalizeLocalAudioRelativePath(
  value: unknown
): LocalAudioRelativePath | undefined {
  if (typeof value !== "string" || value.trim().length === 0 || value.includes("\0")) {
    return undefined;
  }

  if (/^[a-z]:/i.test(value) || value.startsWith("/") || value.startsWith("\\\\")) {
    return undefined;
  }

  const normalizedPath = value.replace(/\\/g, "/");
  const segments = normalizedPath.split("/");

  if (
    segments.some(
      (segment) =>
        segment.length === 0 ||
        segment.trim().length === 0 ||
        segment === "." ||
        segment === ".."
    )
  ) {
    return undefined;
  }

  return normalizedPath as LocalAudioRelativePath;
}

export function isLocalAudioRelativePath(
  value: unknown
): value is LocalAudioRelativePath {
  return (
    typeof value === "string" &&
    !value.includes("\\") &&
    normalizeLocalAudioRelativePath(value) === value
  );
}

export function createDesktopAudioSourceRef({
  directoryId,
  relativePath
}: {
  directoryId: unknown;
  relativePath: unknown;
}): DesktopFileAudioSourceRef {
  if (!isLocalAudioDirectoryId(directoryId)) {
    throw new TypeError("Desktop audio source requires a valid directory ID.");
  }

  const normalizedRelativePath = normalizeLocalAudioRelativePath(relativePath);

  if (!normalizedRelativePath) {
    throw new TypeError("Desktop audio source requires a safe relative path.");
  }

  return {
    type: "desktop-file",
    directoryId,
    relativePath: normalizedRelativePath
  };
}

export function isDesktopAudioSourceRef(
  value: unknown
): value is DesktopFileAudioSourceRef {
  return (
    isPlainRecord(value) &&
    hasExactlyKeys(value, ["type", "directoryId", "relativePath"]) &&
    value.type === "desktop-file" &&
    isLocalAudioDirectoryId(value.directoryId) &&
    isLocalAudioRelativePath(value.relativePath)
  );
}

export function isLocalAudioSourceRef(value: unknown): value is LocalAudioSourceRef {
  if (!isPlainRecord(value) || typeof value.type !== "string") {
    return false;
  }

  if (value.type === "desktop-file") {
    return isDesktopAudioSourceRef(value);
  }

  return (
    (value.type === "web-file-copy" || value.type === "web-file-handle") &&
    hasExactlyKeys(value, ["type", "sourceId"]) &&
    isLocalAudioSourceId(value.sourceId)
  );
}

export function isLocalAudioBindingSerializable(
  value: unknown
): value is LocalAudioBinding {
  if (
    !isPlainRecord(value) ||
    !hasOnlyKeys(value, [
      "bindingId",
      "trackId",
      "source",
      "fileName",
      "fileSize",
      "modifiedAt",
      "availability",
      "createdAt",
      "updatedAt"
    ])
  ) {
    return false;
  }

  return (
    isLocalAudioBindingId(value.bindingId) &&
    isLocalAudioTrackId(value.trackId) &&
    isLocalAudioSourceRef(value.source) &&
    isNonEmptyText(value.fileName) &&
    isOptionalFileSize(value.fileSize) &&
    isOptionalTimestamp(value.modifiedAt) &&
    typeof value.availability === "string" &&
    LOCAL_AUDIO_AVAILABILITIES.has(value.availability) &&
    isIsoDateString(value.createdAt) &&
    isIsoDateString(value.updatedAt)
  );
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

function isNonEmptyText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && !value.includes("\0");
}

function isOptionalFileSize(value: unknown): boolean {
  return (
    value === undefined ||
    (typeof value === "number" && Number.isSafeInteger(value) && value >= 0)
  );
}

function isOptionalTimestamp(value: unknown): boolean {
  return (
    value === undefined ||
    (typeof value === "number" && Number.isFinite(value) && value >= 0)
  );
}

function isIsoDateString(value: unknown): value is ISODateString {
  if (typeof value !== "string") {
    return false;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}
