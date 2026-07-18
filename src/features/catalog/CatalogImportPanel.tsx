import { useMemo, useState } from "react";

import type { CatalogData, EntityId } from "../../types";
import {
  createQqMusicCatalogProvider,
  QqMusicCatalogProviderError,
  type QqMusicCatalogProvider
} from "../../infra/catalog/qqMusicCatalogProvider";
import { createCatalogImportDraft, previewCatalogImport } from "./catalogImport";
import type { CatalogProviderAlbumCandidate } from "./catalogProvider";
import type {
  CatalogDirectoryImportAlbumDraft,
  CatalogDirectoryImportOptions,
  CatalogDirectoryImportResult,
  CatalogLibraryStatus
} from "./useCatalogLibrary";

interface CatalogImportPanelProps {
  catalog: CatalogData;
  catalogStatus: CatalogLibraryStatus;
  isCatalogSaving: boolean;
  initialBaseUrl?: string;
  providerFactory?: (baseUrl: string) => QqMusicCatalogProvider;
  onImport: (
    drafts: readonly CatalogDirectoryImportAlbumDraft[],
    options?: CatalogDirectoryImportOptions
  ) => Promise<CatalogDirectoryImportResult>;
}

type ImportPhase = "idle" | "testing" | "searching" | "loading-album" | "importing";

const defaultBaseUrl = import.meta.env.VITE_QQ_MUSIC_API_BASE_URL ?? "";

export function CatalogImportPanel({
  catalog,
  catalogStatus,
  isCatalogSaving,
  initialBaseUrl = defaultBaseUrl,
  providerFactory = (baseUrl) => createQqMusicCatalogProvider({ baseUrl }),
  onImport
}: CatalogImportPanelProps) {
  const [baseUrl, setBaseUrl] = useState(initialBaseUrl);
  const [query, setQuery] = useState("许嵩");
  const [phase, setPhase] = useState<ImportPhase>("idle");
  const [notice, setNotice] = useState<string>();
  const [error, setError] = useState<string>();
  const [candidates, setCandidates] = useState<
    readonly CatalogProviderAlbumCandidate[]
  >([]);
  const [selectedAlbum, setSelectedAlbum] = useState<CatalogProviderAlbumCandidate>();
  const [isConnected, setIsConnected] = useState(false);

  const preview = useMemo(() => {
    if (!selectedAlbum) {
      return undefined;
    }

    try {
      return previewCatalogImport(catalog, createCatalogImportDraft(selectedAlbum));
    } catch {
      return undefined;
    }
  }, [catalog, selectedAlbum]);
  const importedTrackCount = selectedAlbum?.tracks?.length ?? 0;
  const localArtistId = selectedAlbum
    ? findMatchingArtistId(catalog, selectedAlbum.artist.name)
    : undefined;
  const hasExistingConflict = Boolean(
    preview?.differences.some(
      (difference) =>
        difference.kind !== "artist" && difference.status === "possible_existing"
    )
  );

  function resetResult(): void {
    setCandidates([]);
    setSelectedAlbum(undefined);
  }

  function createProvider(): QqMusicCatalogProvider | undefined {
    try {
      return providerFactory(baseUrl);
    } catch (cause: unknown) {
      setError(formatProviderError(cause));
      return undefined;
    }
  }

  async function handleTestConnection(): Promise<void> {
    const provider = createProvider();
    if (!provider) {
      return;
    }

    setPhase("testing");
    setError(undefined);
    setNotice(undefined);
    resetResult();

    try {
      await provider.testConnection();
      setIsConnected(true);
      setNotice("连接成功。服务仅会在你继续搜索时请求元数据。");
    } catch (cause: unknown) {
      setIsConnected(false);
      setError(formatProviderError(cause));
    } finally {
      setPhase("idle");
    }
  }

  async function handleSearch(): Promise<void> {
    const provider = createProvider();
    if (!provider) {
      return;
    }
    if (!query.trim()) {
      setError("请输入歌手、专辑或歌曲关键词。");
      return;
    }

    setPhase("searching");
    setError(undefined);
    setNotice(undefined);
    resetResult();

    try {
      const result = await provider.search({ query, limit: 20 });
      const albums = result.candidates.filter(
        (candidate): candidate is CatalogProviderAlbumCandidate =>
          candidate.kind === "album"
      );
      setCandidates(albums);
      setNotice(
        albums.length === 0
          ? "没有可导入的专辑候选。请更换关键词，或检查上游服务。"
          : `找到 ${albums.length} 张专辑候选；选择后才会读取该专辑曲目。`
      );
    } catch (cause: unknown) {
      setError(formatProviderError(cause));
    } finally {
      setPhase("idle");
    }
  }

  async function handleSelectAlbum(
    candidate: CatalogProviderAlbumCandidate
  ): Promise<void> {
    const provider = createProvider();
    if (!provider) {
      return;
    }

    setPhase("loading-album");
    setError(undefined);
    setNotice(undefined);
    setSelectedAlbum(undefined);

    try {
      const album = await provider.getAlbum(candidate.reference);
      if (!album.tracks || album.tracks.length === 0) {
        setError("该专辑未返回可导入曲目，未写入本地目录。");
        return;
      }
      createCatalogImportDraft(album);
      setSelectedAlbum(album);
      setNotice("已生成本地差异预览；确认前不会修改目录。");
    } catch (cause: unknown) {
      setError(formatProviderError(cause));
    } finally {
      setPhase("idle");
    }
  }

  async function handleConfirmImport(): Promise<void> {
    if (!selectedAlbum || !localArtistId || !selectedAlbum.tracks?.length) {
      return;
    }

    const draft = createCatalogImportDraft(selectedAlbum);
    const albumSourceId = `provider-album:${draft.album.providerReference.externalId}`;
    const trackSourceIds = draft.album.tracks.map(
      (track) => `provider-track:${track.providerReference.externalId}`
    );
    const directoryDraft: CatalogDirectoryImportAlbumDraft = {
      sourceId: albumSourceId,
      artistId: localArtistId,
      title: draft.album.title,
      tracks: draft.album.tracks.map((track, index) => ({
        sourceId: trackSourceIds[index],
        title: track.title,
        trackNumber: track.trackNumber ?? index + 1
      }))
    };
    const options: CatalogDirectoryImportOptions = {
      providerReferences: [
        { localEntityId: localArtistId, reference: draft.artist.providerReference },
        { sourceId: albumSourceId, reference: draft.album.providerReference },
        ...draft.album.tracks.map((track, index) => ({
          sourceId: trackSourceIds[index],
          reference: track.providerReference
        }))
      ]
    };

    setPhase("importing");
    setError(undefined);
    setNotice(undefined);

    try {
      const result = await onImport([directoryDraft], options);
      if (!result.ok) {
        setError(result.errorMessage);
        return;
      }

      setNotice(
        `已新增《${draft.album.title}》和 ${draft.album.tracks.length} 首歌曲。`
      );
      setSelectedAlbum(undefined);
      setCandidates([]);
    } finally {
      setPhase("idle");
    }
  }

  const isBusy = phase !== "idle";
  const canConfirm =
    catalogStatus === "ready" &&
    !isCatalogSaving &&
    !isBusy &&
    Boolean(selectedAlbum && preview && localArtistId && importedTrackCount > 0) &&
    !hasExistingConflict;

  return (
    <section className="catalog-provider-import" aria-label="自托管 QQ 元数据导入">
      <div className="catalog-provider-import-heading">
        <p>
          可选的自托管元数据来源。默认关闭；不会请求或保存
          Cookie、歌词、封面、评论、下载链接或音频地址。
        </p>
      </div>

      <label className="field-label" htmlFor="qq-music-api-base-url">
        服务地址
      </label>
      <div className="catalog-provider-import-connection">
        <input
          id="qq-music-api-base-url"
          type="url"
          value={baseUrl}
          placeholder="https://你的自托管服务"
          autoComplete="off"
          disabled={isBusy}
          onChange={(event) => {
            setBaseUrl(event.target.value);
            setIsConnected(false);
          }}
        />
        <button
          type="button"
          className="secondary-button"
          disabled={isBusy || !baseUrl.trim()}
          onClick={() => void handleTestConnection()}
        >
          {phase === "testing" ? "正在测试…" : "测试连接"}
        </button>
      </div>

      <label className="field-label" htmlFor="qq-music-api-query">
        搜索关键词
      </label>
      <div className="catalog-provider-import-search">
        <input
          id="qq-music-api-query"
          type="search"
          value={query}
          disabled={isBusy || !baseUrl.trim()}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void handleSearch();
            }
          }}
        />
        <button
          type="button"
          className="primary-button"
          disabled={isBusy || !baseUrl.trim() || !query.trim()}
          onClick={() => void handleSearch()}
        >
          {phase === "searching" ? "正在查询…" : "查询专辑"}
        </button>
      </div>
      {!isConnected && baseUrl.trim() ? (
        <p className="catalog-provider-import-hint">
          可直接查询；建议先测试连接，以便区分服务、跨域和上游错误。
        </p>
      ) : null}

      {candidates.length > 0 ? (
        <ul className="catalog-provider-import-results" aria-label="专辑候选">
          {candidates.map((candidate) => (
            <li key={candidate.reference.externalId}>
              <div>
                <strong>{candidate.title}</strong>
                <span>{candidate.artist.name}</span>
              </div>
              <button
                type="button"
                className="secondary-button"
                disabled={isBusy}
                onClick={() => void handleSelectAlbum(candidate)}
              >
                {phase === "loading-album" ? "正在读取…" : "查看曲目"}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {selectedAlbum && preview ? (
        <div className="catalog-provider-import-preview" aria-busy={isBusy}>
          <div>
            <h3>《{selectedAlbum.title}》导入预览</h3>
            <p>
              歌手：{selectedAlbum.artist.name}；曲目：{importedTrackCount} 首。
              {localArtistId
                ? " 将匹配当前目录已有歌手。"
                : " 当前目录没有同名歌手，不能导入。"}
            </p>
          </div>
          <ul>
            {preview.differences.map((difference) => (
              <li key={`${difference.kind}:${difference.title}`}>
                <span>
                  {difference.kind === "artist"
                    ? "歌手"
                    : difference.kind === "album"
                      ? "专辑"
                      : "歌曲"}
                </span>
                <strong>{difference.title}</strong>
                <em>{difference.status === "new" ? "新增" : "疑似已存在"}</em>
              </li>
            ))}
          </ul>
          {hasExistingConflict ? (
            <p className="catalog-provider-import-warning" role="alert">
              当前目录已有同名记录或歌曲，已阻止导入以避免覆盖。请使用目录编辑功能人工核对。
            </p>
          ) : null}
          <div className="catalog-provider-import-actions">
            <button
              type="button"
              className="secondary-button"
              disabled={isBusy}
              onClick={() => setSelectedAlbum(undefined)}
            >
              取消预览
            </button>
            <button
              type="button"
              className="primary-button"
              disabled={!canConfirm}
              onClick={() => void handleConfirmImport()}
            >
              {phase === "importing"
                ? "正在写入目录…"
                : `确认导入 ${importedTrackCount} 首歌曲`}
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="catalog-provider-import-error" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="catalog-provider-import-notice" role="status">
          {notice}
        </p>
      ) : null}
    </section>
  );
}

function findMatchingArtistId(
  catalog: CatalogData,
  name: string
): EntityId | undefined {
  const normalizedName = normalizeCatalogName(name);
  return catalog.artists.find((artist) =>
    [artist.name, ...(artist.aliases ?? [])].some(
      (candidateName) => normalizeCatalogName(candidateName) === normalizedName
    )
  )?.id;
}

function normalizeCatalogName(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
}

function formatProviderError(cause: unknown): string {
  if (cause instanceof QqMusicCatalogProviderError) {
    return cause.message;
  }

  return "读取远程元数据失败，未修改本地目录。请稍后重试。";
}
