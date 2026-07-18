import { useMemo, useRef, useState, type ChangeEvent } from "react";

import type { CatalogData, EntityId, LocalAudioFileRecord } from "../../types";
import type {
  CatalogDirectoryImportAlbumDraft,
  CatalogDirectoryImportResult,
  CatalogLibraryStatus
} from "../catalog/useCatalogLibrary";
import { LOCAL_AUDIO_FILE_ACCEPT } from "./localAudioFile";
import {
  buildLocalDirectoryImportPlan,
  getDefaultDirectoryImportSelection
} from "./localDirectoryImportPlan";
import {
  normalizeDirectoryCandidateKey,
  scanLocalDirectory
} from "./localDirectoryScanner";
import {
  matchLocalDirectoryCandidates,
  type LocalTrackMatch
} from "./localTrackMatcher";
import type {
  LocalAudioBatchBindingResult,
  LocalAudioLibraryStatus,
  LocalAudioBindingRequest
} from "./useLocalAudioLibrary";

interface LocalDirectoryImportProps {
  catalog: CatalogData;
  catalogStatus: CatalogLibraryStatus;
  audioBindingsByTrackId: ReadonlyMap<EntityId, LocalAudioFileRecord>;
  audioStatus: LocalAudioLibraryStatus;
  isCatalogSaving: boolean;
  onImportCatalogDrafts: (
    drafts: readonly CatalogDirectoryImportAlbumDraft[]
  ) => Promise<CatalogDirectoryImportResult>;
  onBindAudioFiles: (
    requests: readonly LocalAudioBindingRequest[]
  ) => Promise<LocalAudioBatchBindingResult>;
}

type DirectoryInputElement = HTMLInputElement;

interface ImportSummary {
  createdAlbumCount: number;
  createdTrackCount: number;
  skippedDraftTrackCount: number;
  catalogError?: string;
  bindingResult?: LocalAudioBatchBindingResult;
}

export function LocalDirectoryImport({
  catalog,
  catalogStatus,
  audioBindingsByTrackId,
  audioStatus,
  isCatalogSaving,
  onImportCatalogDrafts,
  onBindAudioFiles
}: LocalDirectoryImportProps) {
  const directoryInputRef = useRef<DirectoryInputElement>(null);
  const [files, setFiles] = useState<readonly File[]>([]);
  const [defaultArtistName, setDefaultArtistName] = useState(
    () => catalog.artists[0]?.name ?? ""
  );
  const [selectedCandidateIndexes, setSelectedCandidateIndexes] = useState<
    ReadonlySet<number>
  >(() => new Set());
  const [targetTrackIdByCandidateIndex, setTargetTrackIdByCandidateIndex] = useState<
    ReadonlyMap<number, EntityId>
  >(() => new Map());
  const [selectedNewAlbumKeys, setSelectedNewAlbumKeys] = useState<ReadonlySet<string>>(
    () => new Set()
  );
  const [isSaving, setIsSaving] = useState(false);
  const [selectionError, setSelectionError] = useState<string>();
  const [summary, setSummary] = useState<ImportSummary>();

  const knownArtistNames = useMemo(
    () => catalog.artists.flatMap((artist) => [artist.name, ...(artist.aliases ?? [])]),
    [catalog.artists]
  );
  const defaultArtistId = useMemo(
    () => findExistingArtistId(catalog, defaultArtistName),
    [catalog, defaultArtistName]
  );
  const scan = useMemo(
    () =>
      scanLocalDirectory(files, {
        defaultArtistName,
        knownArtistNames
      }),
    [defaultArtistName, files, knownArtistNames]
  );
  const matchResult = useMemo(
    () =>
      matchLocalDirectoryCandidates({
        catalog,
        candidates: scan.candidates,
        audioBindingsByTrackId
      }),
    [audioBindingsByTrackId, catalog, scan.candidates]
  );

  const plan = useMemo(
    () =>
      buildLocalDirectoryImportPlan({
        catalog,
        matches: matchResult.matches,
        audioBindingsByTrackId,
        defaultArtistId,
        selection: {
          selectedCandidateIndexes,
          targetTrackIdByCandidateIndex,
          selectedNewAlbumKeys
        }
      }),
    [
      audioBindingsByTrackId,
      catalog,
      defaultArtistId,
      matchResult.matches,
      selectedCandidateIndexes,
      selectedNewAlbumKeys,
      targetTrackIdByCandidateIndex
    ]
  );
  const tracksById = useMemo(
    () => new Map(catalog.tracks.map((track) => [track.id, track])),
    [catalog.tracks]
  );
  const totalCandidateSize = scan.candidates.reduce(
    (size, candidate) => size + candidate.file.size,
    0
  );
  const canWrite =
    catalogStatus === "ready" && audioStatus === "ready" && !isCatalogSaving;
  const canConfirm = canWrite && !isSaving && !summary && plan.selectedFileCount > 0;

  function setDirectoryInput(input: DirectoryInputElement | null) {
    directoryInputRef.current = input;

    if (!input) {
      return;
    }

    input.setAttribute("webkitdirectory", "");
    input.setAttribute("directory", "");
    input.multiple = true;
    if ("webkitdirectory" in input) {
      input.webkitdirectory = true;
    }
  }

  function handleDirectorySelection(event: ChangeEvent<HTMLInputElement>) {
    const nextFiles = Array.from(event.currentTarget.files ?? []);

    setFiles(nextFiles);
    resetSelection(nextFiles, defaultArtistName);
    setSelectionError(undefined);
    setSummary(undefined);
    event.currentTarget.value = "";
  }

  function handleDefaultArtistNameChange(nextArtistName: string) {
    setDefaultArtistName(nextArtistName);
    resetSelection(files, nextArtistName);
    setSelectionError(undefined);
    setSummary(undefined);
  }

  function resetSelection(nextFiles: readonly File[], nextArtistName: string) {
    const nextScan = scanLocalDirectory(nextFiles, {
      defaultArtistName: nextArtistName,
      knownArtistNames
    });
    const defaults = getDefaultDirectoryImportSelection(
      matchLocalDirectoryCandidates({
        catalog,
        candidates: nextScan.candidates,
        audioBindingsByTrackId
      }).matches
    );

    setSelectedCandidateIndexes(defaults.selectedCandidateIndexes);
    setTargetTrackIdByCandidateIndex(defaults.targetTrackIdByCandidateIndex);
    setSelectedNewAlbumKeys(defaults.selectedNewAlbumKeys);
  }

  function clearPreview() {
    if (isSaving) {
      return;
    }

    setFiles([]);
    setSelectedCandidateIndexes(new Set());
    setTargetTrackIdByCandidateIndex(new Map());
    setSelectedNewAlbumKeys(new Set());
    setSelectionError(undefined);
    setSummary(undefined);
  }

  function toggleCandidate(candidateIndex: number, checked: boolean) {
    setSelectedCandidateIndexes((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(candidateIndex);
      } else {
        next.delete(candidateIndex);
      }
      return next;
    });
    setSelectionError(undefined);
    setSummary(undefined);
  }

  function selectTrackTarget(candidateIndex: number, trackId: EntityId) {
    setTargetTrackIdByCandidateIndex((current) => {
      const next = new Map(current);
      if (trackId) {
        next.set(candidateIndex, trackId);
      } else {
        next.delete(candidateIndex);
      }
      return next;
    });
    setSelectionError(undefined);
    setSummary(undefined);
  }

  function toggleNewAlbum(key: string, checked: boolean) {
    setSelectedNewAlbumKeys((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(key);
      } else {
        next.delete(key);
      }
      return next;
    });
    setSelectionError(undefined);
    setSummary(undefined);
  }

  async function confirmImport() {
    if (!canConfirm) {
      return;
    }
    if (plan.issues.length > 0) {
      setSelectionError(plan.issues.join(" "));
      return;
    }

    setIsSaving(true);
    setSelectionError(undefined);
    setSummary(undefined);

    try {
      let createdAlbumCount = 0;
      let createdTrackCount = 0;
      let skippedDraftTrackCount = 0;
      let catalogError: string | undefined;
      let newAlbumBindingRequests: LocalAudioBindingRequest[] = [];

      if (plan.selectedAlbumDrafts.length > 0) {
        const catalogResult = await onImportCatalogDrafts(plan.selectedAlbumDrafts);

        if (catalogResult.ok) {
          createdAlbumCount = plan.selectedAlbumDrafts.length;
          createdTrackCount = plan.selectedAlbumDrafts.reduce(
            (count, draft) => count + draft.tracks.length,
            0
          );
          newAlbumBindingRequests = plan.selectedAlbumDrafts.flatMap((draft) =>
            draft.tracks.flatMap((track) => {
              const trackId = catalogResult.trackIdsBySourceId.get(track.sourceId);
              return trackId ? [{ trackId, file: track.file }] : [];
            })
          );
        } else {
          catalogError = catalogResult.errorMessage;
          skippedDraftTrackCount = plan.selectedAlbumDrafts.reduce(
            (count, draft) => count + draft.tracks.length,
            0
          );
        }
      }

      const bindingRequests = [
        ...plan.bindingRequests.map(({ trackId, file }) => ({ trackId, file })),
        ...newAlbumBindingRequests
      ];
      const bindingResult =
        bindingRequests.length > 0
          ? await onBindAudioFiles(bindingRequests)
          : undefined;

      setSummary({
        createdAlbumCount,
        createdTrackCount,
        skippedDraftTrackCount,
        ...(catalogError ? { catalogError } : {}),
        ...(bindingResult ? { bindingResult } : {})
      });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="directory-import" aria-labelledby="directory-import-heading">
      <div className="directory-import-heading">
        <div>
          <p className="eyebrow">本地文件</p>
          <h2 id="directory-import-heading">导入本地音乐目录</h2>
          <p className="helper-text">
            先预览再保存。只会保存你确认的本地文件绑定；不会上传、复制或分发音频。
          </p>
        </div>
      </div>

      <div className="directory-import-controls">
        <label className="catalog-editor-field" htmlFor="directory-import-artist">
          本次默认歌手
          <input
            id="directory-import-artist"
            value={defaultArtistName}
            onChange={(event) => handleDefaultArtistNameChange(event.target.value)}
            disabled={isSaving}
            aria-invalid={!defaultArtistId}
            aria-describedby="directory-import-artist-help"
          />
        </label>
        <p id="directory-import-artist-help" className="helper-text">
          {!defaultArtistId
            ? "未唯一匹配当前目录艺人：仍可绑定已有歌曲，但不会创建新专辑。"
            : "新专辑会归属到当前目录中唯一匹配的艺人。"}
        </p>
        <label className="audio-file-picker directory-import-picker">
          选择音乐目录
          <input
            ref={setDirectoryInput}
            type="file"
            accept={LOCAL_AUDIO_FILE_ACCEPT}
            onChange={handleDirectorySelection}
            disabled={isSaving || !canWrite}
            aria-label="选择本地音乐目录"
          />
        </label>
        {!canWrite ? (
          <p className="directory-import-warning" role="status">
            目录或本地音频存储尚未准备好，暂不能导入。
          </p>
        ) : null}
      </div>

      {files.length === 0 ? (
        <p className="directory-import-empty" role="status">
          选择单张专辑目录或音乐库根目录后，将按每个文件的直接父目录识别候选专辑。
        </p>
      ) : (
        <div className="directory-import-preview" aria-busy={isSaving}>
          <p className="directory-import-summary" aria-live="polite">
            已读取 {scan.totalFileCount} 个文件；支持 {scan.candidates.length}{" "}
            个音频，忽略 {scan.ignoredFiles.length} 个，需检查 {scan.errors.length}{" "}
            项。候选音频共 {formatFileSize(totalCandidateSize)}；已选择{" "}
            {plan.selectedFileCount} 个、
            {formatFileSize(plan.selectedFileSize)}。
          </p>

          {plan.albumGroups.length > 0 ? (
            <fieldset className="directory-import-drafts">
              <legend>新专辑草稿（均需明确确认）</legend>
              {plan.albumGroups.map((group) => (
                <label key={group.key} className="directory-import-draft">
                  <input
                    type="checkbox"
                    checked={selectedNewAlbumKeys.has(group.key)}
                    disabled={isSaving || !group.available}
                    onChange={(event) =>
                      toggleNewAlbum(group.key, event.target.checked)
                    }
                  />
                  <span>
                    创建“{group.title}”及其中 {group.candidateIndexes.length} 首本地歌曲
                    {group.available
                      ? "（按稳定路径排序生成仅用于展示的曲序）"
                      : `（${getAlbumGroupUnavailableReason(group.unavailableReason)}）`}
                  </span>
                </label>
              ))}
            </fieldset>
          ) : null}

          <div className="directory-import-table-wrap">
            <table className="directory-import-table">
              <caption>文件匹配预览。仅精确且未绑定的匹配会默认勾选。</caption>
              <thead>
                <tr>
                  <th scope="col">导入</th>
                  <th scope="col">文件 / 候选专辑</th>
                  <th scope="col">匹配结果</th>
                  <th scope="col">目标歌曲</th>
                </tr>
              </thead>
              <tbody>
                {matchResult.matches.map((match) => {
                  const targetOptions = match.matchingTrackIds.map((trackId) => ({
                    trackId,
                    title: tracksById.get(trackId)?.title ?? trackId
                  }));
                  const targetTrackId = targetTrackIdByCandidateIndex.get(
                    match.candidateIndex
                  );
                  const canSelect = isSelectableMatch(match);

                  return (
                    <tr key={match.candidateIndex}>
                      <td>
                        {canSelect ? (
                          <input
                            type="checkbox"
                            checked={selectedCandidateIndexes.has(match.candidateIndex)}
                            disabled={
                              isSaving ||
                              (match.status === "conflict" && !targetTrackId)
                            }
                            onChange={(event) =>
                              toggleCandidate(
                                match.candidateIndex,
                                event.target.checked
                              )
                            }
                            aria-label={`导入文件 ${match.candidate.fileName}`}
                          />
                        ) : (
                          <span aria-label="不可直接导入">—</span>
                        )}
                      </td>
                      <td>
                        <strong>{match.candidate.fileName}</strong>
                        <span>
                          {match.candidate.relativePath ?? "缺少安全目录路径"}
                        </span>
                        <span>候选专辑：{match.candidate.albumTitle ?? "未识别"}</span>
                      </td>
                      <td>
                        <strong>{getMatchStatusLabel(match)}</strong>
                        <span>{getMatchReasonLabel(match)}</span>
                      </td>
                      <td>
                        {match.status === "conflict" ? (
                          <label>
                            <span className="visually-hidden">
                              选择冲突文件的目标歌曲
                            </span>
                            <select
                              value={targetTrackId ?? ""}
                              disabled={isSaving}
                              onChange={(event) =>
                                selectTrackTarget(
                                  match.candidateIndex,
                                  event.target.value
                                )
                              }
                            >
                              <option value="">请选择目标歌曲</option>
                              {targetOptions.map((option) => (
                                <option key={option.trackId} value={option.trackId}>
                                  {option.title}
                                </option>
                              ))}
                            </select>
                          </label>
                        ) : targetTrackId && canSelect ? (
                          <span>
                            {tracksById.get(targetTrackId)?.title ?? targetTrackId}
                          </span>
                        ) : (
                          <span>{getUnavailableMatchMessage(match)}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {scan.errors.length > 0 ? (
            <p className="directory-import-warning">
              有 {scan.errors.length}{" "}
              项扫描问题；这些文件不会写入，请修改命名或改用单曲绑定。
            </p>
          ) : null}
          {plan.issues.length > 0 ? (
            <p className="directory-import-warning">{plan.issues.join(" ")}</p>
          ) : null}
          {selectionError ? (
            <p className="directory-import-error" role="alert">
              {selectionError}
            </p>
          ) : null}
          <div className="directory-import-actions">
            <button
              type="button"
              className="text-button"
              onClick={clearPreview}
              disabled={isSaving}
            >
              取消预览
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => void confirmImport()}
              disabled={!canConfirm}
            >
              {isSaving ? "正在保存…" : `确认导入 ${plan.selectedFileCount} 个文件`}
            </button>
          </div>

          {summary ? <ImportResult summary={summary} /> : null}
        </div>
      )}
    </section>
  );
}

function ImportResult({ summary }: { summary: ImportSummary }) {
  const boundCount = summary.bindingResult?.boundTrackIds.length ?? 0;
  const failed = summary.bindingResult?.failed ?? [];

  return (
    <div
      className="directory-import-result"
      role="status"
      aria-live="polite"
      tabIndex={-1}
    >
      <strong>导入结果</strong>
      <p>
        新建专辑 {summary.createdAlbumCount} 张、新建歌曲 {summary.createdTrackCount}{" "}
        首；成功保存音频 {boundCount} 个、失败 {failed.length} 个。
        {summary.skippedDraftTrackCount > 0
          ? ` 有 ${summary.skippedDraftTrackCount} 首新专辑草稿歌曲因目录保存失败而未写入音频。`
          : ""}
      </p>
      {summary.catalogError ? <p>目录保存失败：{summary.catalogError}</p> : null}
      {failed.length > 0 ? (
        <ul>
          {failed.map((failure) => (
            <li key={`${failure.trackId}:${failure.fileName}`}>
              {failure.fileName}：{failure.reason}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function findExistingArtistId(
  catalog: CatalogData,
  artistName: string
): EntityId | undefined {
  const artistKey = normalizeDirectoryCandidateKey(artistName);
  if (!artistKey) {
    return undefined;
  }

  const matchedArtists = catalog.artists.filter((artist) =>
    [artist.name, ...(artist.aliases ?? [])].some(
      (name) => normalizeDirectoryCandidateKey(name) === artistKey
    )
  );

  return matchedArtists.length === 1 ? matchedArtists[0]?.id : undefined;
}

function isSelectableMatch(match: LocalTrackMatch): boolean {
  return (
    match.status === "exact" ||
    match.status === "candidate" ||
    match.status === "conflict"
  );
}

function getMatchStatusLabel(match: LocalTrackMatch): string {
  switch (match.status) {
    case "exact":
      return "精确匹配";
    case "candidate":
      return "候选匹配";
    case "conflict":
      return "存在冲突";
    case "already_bound":
      return "已有绑定";
    case "unmatched":
      return "未匹配";
    case "needs_review":
      return "需要检查";
  }
}

function getMatchReasonLabel(match: LocalTrackMatch): string {
  const reason = match.reasons[0];

  switch (reason) {
    case "exact_normalized_title":
      return "规范化歌名唯一命中";
    case "narrowed_by_catalog_metadata":
      return "已按专辑或歌手缩小范围，需确认";
    case "ambiguous_track_title":
      return "同名歌曲不止一个，请选择目标";
    case "duplicate_candidate_track":
      return "多个文件指向同一歌曲，请手动处理";
    case "already_bound":
      return "为避免覆盖，批量导入不会替换已有文件";
    case "no_exact_title":
      return "可作为明确确认的新专辑草稿处理";
    case "scanner_needs_review":
      return "文件名或目录路径需要人工检查";
    case "artist_mismatch":
      return "歌手信息与目录不一致";
    case "album_mismatch":
      return "专辑名称不一致，需人工确认";
    default:
      return "需要人工确认";
  }
}

function getUnavailableMatchMessage(match: LocalTrackMatch): string {
  if (match.status === "already_bound") {
    return "保留现有绑定";
  }
  if (match.status === "unmatched") {
    return "可在上方新专辑草稿中确认";
  }
  return "不写入";
}

function getAlbumGroupUnavailableReason(
  reason: "default_artist_unavailable" | "existing_album_with_same_title" | undefined
): string {
  switch (reason) {
    case "default_artist_unavailable":
      return "默认歌手未匹配当前目录，不能创建";
    case "existing_album_with_same_title":
      return "当前歌手已有同名专辑，不自动重复创建";
    default:
      return "当前不可创建";
  }
}

function formatFileSize(size: number): string {
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
