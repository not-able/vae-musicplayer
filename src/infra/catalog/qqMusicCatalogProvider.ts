import type {
  CatalogProvider,
  CatalogProviderAlbumCandidate,
  CatalogProviderArtistCandidate,
  CatalogProviderEntityReference,
  CatalogProviderSearchRequest,
  CatalogProviderSearchResult,
  CatalogProviderTrackCandidate
} from "../../features/catalog/catalogProvider";

export const QQ_MUSIC_CATALOG_PROVIDER_ID = "qq-music-api";

const defaultTimeoutMs = 10_000;

type QqMusicProviderErrorCode =
  | "invalid_configuration"
  | "timeout"
  | "network"
  | "cors"
  | "http"
  | "invalid_response";

export class QqMusicCatalogProviderError extends Error {
  readonly code: QqMusicProviderErrorCode;

  constructor(code: QqMusicProviderErrorCode, message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "QqMusicCatalogProviderError";
    this.code = code;
  }
}

export interface QqMusicCatalogProviderConfig {
  baseUrl: string;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
}

export interface QqMusicCatalogProvider extends CatalogProvider {
  testConnection(): Promise<void>;
}

/**
 * Creates an explicitly configured, metadata-only adapter for a self-hosted
 * qq-music-api service. It never calls cookie, lyric, artwork, comment,
 * download, or playable-media endpoints.
 */
export function createQqMusicCatalogProvider(
  config: QqMusicCatalogProviderConfig
): QqMusicCatalogProvider {
  const baseUrl = normalizeBaseUrl(config.baseUrl);
  const fetchFn = config.fetchFn ?? globalThis.fetch;
  const timeoutMs = normalizeTimeout(config.timeoutMs);

  if (!fetchFn) {
    throw new QqMusicCatalogProviderError(
      "invalid_configuration",
      "当前环境不支持网络请求，无法连接自托管元数据服务。"
    );
  }

  return {
    descriptor: {
      id: QQ_MUSIC_CATALOG_PROVIDER_ID,
      displayName: "自托管 QQ Music API（仅元数据）",
      capabilities: { search: true, albumDetails: true, trackDetails: true }
    },
    async testConnection() {
      const metadata = await requestJson(
        fetchFn,
        baseUrl,
        "/explorer/metadata",
        {},
        timeoutMs
      );
      const endpoints = readArrayAtPath(metadata, ["endpoints"]);

      if (!endpoints) {
        throw new QqMusicCatalogProviderError(
          "invalid_response",
          "服务可以访问，但未返回兼容的 Explorer 元数据。"
        );
      }
    },
    async search(
      request: CatalogProviderSearchRequest
    ): Promise<CatalogProviderSearchResult> {
      const query = request.query.normalize("NFKC").trim();
      if (!query) {
        throw new QqMusicCatalogProviderError(
          "invalid_response",
          "搜索关键词不能为空。"
        );
      }

      const response = await requestJson(
        fetchFn,
        baseUrl,
        "/getSearchByKey",
        {
          key: query,
          limit: String(clampLimit(request.limit)),
          page: "1",
          catZhida: "3",
          remoteplace: "album"
        },
        timeoutMs
      );
      const items = findArray(response, [
        ["data", "album", "list"],
        ["data", "data", "album", "list"],
        ["data", "body", "album", "list"],
        ["data", "song", "list"],
        ["data", "data", "song", "list"],
        ["data", "list"]
      ]);

      if (!items) {
        throw new QqMusicCatalogProviderError(
          "invalid_response",
          "搜索接口未返回可识别的候选列表。"
        );
      }

      const candidates = items.flatMap((item) => {
        const candidate = parseAlbumCandidate(item);
        return candidate ? [candidate] : [];
      });

      if (items.length > 0 && candidates.length === 0) {
        throw new QqMusicCatalogProviderError(
          "invalid_response",
          "搜索接口返回的候选缺少稳定专辑或歌手标识。"
        );
      }

      return { candidates };
    },
    async getArtistAlbums(artist) {
      assertProviderReference(artist.reference, "artist");
      const response = await requestJson(
        fetchFn,
        baseUrl,
        `/getSingerAlbum/${encodeURIComponent(artist.reference.externalId)}`,
        { limit: "100", page: "1" },
        timeoutMs
      );
      const items = findArray(response, [
        ["data", "list"],
        ["data", "album", "list"],
        ["data", "data", "list"]
      ]);

      if (!items) {
        throw new QqMusicCatalogProviderError(
          "invalid_response",
          "歌手专辑接口未返回可识别的专辑列表。"
        );
      }

      const albums = items.flatMap((item) => {
        const candidate = parseAlbumCandidate(item, artist);
        return candidate ? [candidate] : [];
      });

      if (items.length > 0 && albums.length === 0) {
        throw new QqMusicCatalogProviderError(
          "invalid_response",
          "歌手专辑接口返回的记录缺少稳定专辑标识。"
        );
      }

      return albums;
    },
    async getAlbum(reference) {
      assertProviderReference(reference, "album");
      const response = await requestJson(
        fetchFn,
        baseUrl,
        `/getAlbumInfo/${encodeURIComponent(reference.externalId)}`,
        {},
        timeoutMs
      );
      const album = parseAlbumDetails(response, reference);

      if (!album) {
        throw new QqMusicCatalogProviderError(
          "invalid_response",
          "专辑详情接口未返回可识别的专辑、歌手或曲目数据。"
        );
      }

      return album;
    },
    async getTrack(reference) {
      assertProviderReference(reference, "track");
      const response = await requestJson(
        fetchFn,
        baseUrl,
        `/getSongInfo/${encodeURIComponent(reference.externalId)}`,
        {},
        timeoutMs
      );
      const track = parseTrackDetails(response, reference);

      if (!track) {
        throw new QqMusicCatalogProviderError(
          "invalid_response",
          "歌曲详情接口未返回可识别的歌曲、歌手或专辑数据。"
        );
      }

      return track;
    }
  };
}

function normalizeBaseUrl(value: string): URL {
  const normalized = value.trim();

  if (!normalized) {
    throw new QqMusicCatalogProviderError(
      "invalid_configuration",
      "请先填写自托管 QQ Music API 服务地址。"
    );
  }

  try {
    const parsed = new URL(normalized);
    if (
      (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
      parsed.username ||
      parsed.password
    ) {
      throw new Error("Unsupported base URL.");
    }
    parsed.search = "";
    parsed.hash = "";
    parsed.pathname = parsed.pathname.replace(/\/$/, "");
    return parsed;
  } catch (cause: unknown) {
    throw new QqMusicCatalogProviderError(
      "invalid_configuration",
      "服务地址必须是未包含账号信息的 http(s) URL。",
      cause
    );
  }
}

function normalizeTimeout(value: number | undefined): number {
  if (value === undefined) {
    return defaultTimeoutMs;
  }
  if (!Number.isSafeInteger(value) || value < 1 || value > 60_000) {
    throw new QqMusicCatalogProviderError(
      "invalid_configuration",
      "元数据服务超时时间必须介于 1 到 60000 毫秒之间。"
    );
  }
  return value;
}

function clampLimit(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) {
    return 20;
  }
  return Math.max(1, Math.min(50, Math.floor(value)));
}

async function requestJson(
  fetchFn: typeof fetch,
  baseUrl: URL,
  path: string,
  query: Readonly<Record<string, string>>,
  timeoutMs: number
): Promise<unknown> {
  const basePath = baseUrl.pathname.replace(/\/+$/, "");
  const endpointPath = path.replace(/^\/+/, "");
  const url = new URL(`${basePath}/${endpointPath}`, baseUrl);
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }

  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchFn(url.toString(), {
      method: "GET",
      signal: controller.signal,
      headers: { Accept: "application/json" }
    });

    if (!response.ok) {
      throw new QqMusicCatalogProviderError(
        "http",
        `元数据服务返回 HTTP ${response.status}，请稍后重试或检查上游服务。`
      );
    }

    try {
      return await response.json();
    } catch (cause: unknown) {
      throw new QqMusicCatalogProviderError(
        "invalid_response",
        "元数据服务没有返回有效 JSON。",
        cause
      );
    }
  } catch (cause: unknown) {
    if (cause instanceof QqMusicCatalogProviderError) {
      throw cause;
    }
    if (controller.signal.aborted) {
      throw new QqMusicCatalogProviderError(
        "timeout",
        "连接元数据服务超时，请检查服务和网络后重试。",
        cause
      );
    }

    const isCrossOrigin =
      typeof window !== "undefined" && url.origin !== window.location.origin;
    throw new QqMusicCatalogProviderError(
      isCrossOrigin ? "cors" : "network",
      isCrossOrigin
        ? "浏览器未能访问跨域元数据服务，请检查该服务的 CORS 配置。"
        : "无法连接元数据服务，请确认服务已经启动。",
      cause
    );
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}

function parseAlbumCandidate(
  value: unknown,
  fallbackArtist?: CatalogProviderArtistCandidate
): CatalogProviderAlbumCandidate | undefined {
  const record = asRecord(value);
  if (!record) {
    return undefined;
  }
  const albumRecord =
    firstRecord(record, ["album", "albumInfo", "albuminfo"]) ?? record;
  const artist =
    parseArtist(firstRecord(record, ["singer", "artist"]) ?? record) ?? fallbackArtist;
  const externalId = readString(albumRecord, [
    "albumMID",
    "albumMid",
    "albummid",
    "mid",
    "id"
  ]);
  const title = readString(albumRecord, ["albumName", "albumname", "name", "title"]);

  if (!artist || !externalId || !title) {
    return undefined;
  }

  return {
    kind: "album",
    reference: createReference("album", externalId),
    title,
    artist,
    type: "album"
  };
}

function parseAlbumDetails(
  response: unknown,
  reference: CatalogProviderEntityReference<"album">
): CatalogProviderAlbumCandidate | undefined {
  const root = findRecord(response, [["data", "data"], ["data", "album"], ["data"]]);
  if (!root) {
    return undefined;
  }

  const artist = parseArtist(firstRecord(root, ["singer", "artist"]) ?? root);
  const title = readString(root, ["albumName", "albumname", "name", "title"]);
  const items = findArray(response, [
    ["data", "songlist"],
    ["data", "songList"],
    ["data", "list"],
    ["data", "data", "songlist"],
    ["data", "data", "list"]
  ]);

  if (!artist || !title || !items) {
    return undefined;
  }

  const tracks = items.flatMap((item, index) => {
    const track = parseTrackCandidate(item, artist, {
      reference,
      title,
      type: "album"
    });
    return track ? [{ ...track, trackNumber: track.trackNumber ?? index + 1 }] : [];
  });

  if (items.length > 0 && tracks.length === 0) {
    return undefined;
  }

  return {
    kind: "album",
    reference,
    title,
    artist,
    type: "album",
    tracks
  };
}

function parseTrackDetails(
  response: unknown,
  reference: CatalogProviderEntityReference<"track">
): CatalogProviderTrackCandidate | undefined {
  const root = findRecord(response, [
    ["data", "track_info"],
    ["data", "trackInfo"],
    ["data", "data"],
    ["data"]
  ]);
  return root ? parseTrackCandidate(root, undefined, undefined, reference) : undefined;
}

function parseTrackCandidate(
  value: unknown,
  fallbackArtist?: CatalogProviderArtistCandidate,
  fallbackAlbum?: Pick<CatalogProviderAlbumCandidate, "reference" | "title" | "type">,
  forcedReference?: CatalogProviderEntityReference<"track">
): CatalogProviderTrackCandidate | undefined {
  const record = asRecord(value);
  if (!record) {
    return undefined;
  }
  const artist =
    parseArtist(firstRecord(record, ["singer", "artist"]) ?? record) ?? fallbackArtist;
  const externalId =
    forcedReference?.externalId ??
    readString(record, ["songmid", "songMid", "mid", "id"]);
  const title = readString(record, ["songname", "songName", "name", "title"]);
  const albumRecord = firstRecord(record, ["album", "albumInfo", "albuminfo"]);
  const album =
    fallbackAlbum ?? (albumRecord ? parseAlbumSummary(albumRecord) : undefined);

  if (!artist || !externalId || !title) {
    return undefined;
  }

  const trackNumber = readPositiveInteger(record, [
    "index_album",
    "indexAlbum",
    "trackNumber",
    "tracknum"
  ]);
  const durationSeconds = readNonNegativeNumber(record, [
    "interval",
    "duration",
    "durationSeconds"
  ]);

  return {
    kind: "track",
    reference: forcedReference ?? createReference("track", externalId),
    title,
    artist,
    ...(album ? { album } : {}),
    ...(trackNumber === undefined ? {} : { trackNumber }),
    ...(durationSeconds === undefined ? {} : { durationSeconds })
  };
}

function parseAlbumSummary(
  value: Record<string, unknown>
): Pick<CatalogProviderAlbumCandidate, "reference" | "title" | "type"> | undefined {
  const externalId = readString(value, [
    "albumMID",
    "albumMid",
    "albummid",
    "mid",
    "id"
  ]);
  const title = readString(value, ["albumName", "albumname", "name", "title"]);

  return externalId && title
    ? { reference: createReference("album", externalId), title, type: "album" }
    : undefined;
}

function parseArtist(value: unknown): CatalogProviderArtistCandidate | undefined {
  const candidate = Array.isArray(value) ? value[0] : value;
  const record = asRecord(candidate);
  if (!record) {
    return undefined;
  }
  const externalId = readString(record, [
    "singerMID",
    "singerMid",
    "singermid",
    "mid",
    "id"
  ]);
  const name = readString(record, ["singerName", "singername", "name", "title"]);

  return externalId && name
    ? {
        kind: "artist",
        reference: createReference("artist", externalId),
        name
      }
    : undefined;
}

function createReference<TEntityType extends "artist" | "album" | "track">(
  entityType: TEntityType,
  externalId: string
): CatalogProviderEntityReference<TEntityType> {
  return { providerId: QQ_MUSIC_CATALOG_PROVIDER_ID, entityType, externalId };
}

function assertProviderReference(
  reference: { providerId: string; entityType: string; externalId: string },
  expectedEntityType: "artist" | "album" | "track"
): void {
  if (
    reference.providerId !== QQ_MUSIC_CATALOG_PROVIDER_ID ||
    reference.entityType !== expectedEntityType ||
    !reference.externalId.trim()
  ) {
    throw new QqMusicCatalogProviderError(
      "invalid_configuration",
      `无效的 ${
        expectedEntityType === "artist"
          ? "歌手"
          : expectedEntityType === "album"
            ? "专辑"
            : "歌曲"
      }外部引用。`
    );
  }
}

function findArray(
  value: unknown,
  paths: readonly (readonly string[])[]
): unknown[] | undefined {
  for (const path of paths) {
    const result = readArrayAtPath(value, path);
    if (result) {
      return result;
    }
  }
  return undefined;
}

function findRecord(
  value: unknown,
  paths: readonly (readonly string[])[]
): Record<string, unknown> | undefined {
  for (const path of paths) {
    const result = readRecordAtPath(value, path);
    if (result) {
      return result;
    }
  }
  return undefined;
}

function readArrayAtPath(
  value: unknown,
  path: readonly string[]
): unknown[] | undefined {
  const result = readAtPath(value, path);
  return Array.isArray(result) ? result : undefined;
}

function readRecordAtPath(
  value: unknown,
  path: readonly string[]
): Record<string, unknown> | undefined {
  return asRecord(readAtPath(value, path));
}

function readAtPath(value: unknown, path: readonly string[]): unknown {
  let current = value;
  for (const key of path) {
    const record = asRecord(current);
    if (!record || !(key in record)) {
      return undefined;
    }
    current = record[key];
  }
  return current;
}

function firstRecord(
  value: Record<string, unknown>,
  keys: readonly string[]
): Record<string, unknown> | undefined {
  for (const key of keys) {
    const candidate = value[key];
    if (Array.isArray(candidate)) {
      const first = asRecord(candidate[0]);
      if (first) {
        return first;
      }
      continue;
    }
    const record = asRecord(candidate);
    if (record) {
      return record;
    }
  }
  return undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function readString(
  record: Record<string, unknown>,
  keys: readonly string[]
): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }
  return undefined;
}

function readPositiveInteger(
  record: Record<string, unknown>,
  keys: readonly string[]
): number | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) {
      return value;
    }
  }
  return undefined;
}

function readNonNegativeNumber(
  record: Record<string, unknown>,
  keys: readonly string[]
): number | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
      return value;
    }
  }
  return undefined;
}
