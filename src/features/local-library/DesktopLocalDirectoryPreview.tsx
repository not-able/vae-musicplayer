import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  DesktopAudioCandidateId,
  DesktopLocalAudioBindingSummary
} from "../../../electron/music-library/types";
import type { CatalogData } from "../../types";
import type {
  LocalAudioBindingId,
  LocalAudioTrackId
} from "../../types/localAudioBinding";
import type { CatalogLibraryStatus } from "../catalog/useCatalogLibrary";
import {
  DesktopAudioBindingDialog,
  type DesktopBindingDialogSession
} from "./DesktopAudioBindingDialog";
import {
  buildDesktopAudioScanPreview,
  getDesktopLibraryErrorMessage,
  toDesktopMusicDirectoryOption,
  type DesktopAudioScanPreview,
  type DesktopMusicDirectoryOption
} from "./desktopAudioCandidatePreview";
import {
  associateCandidatesWithBindings,
  buildDesktopCatalogTrackOptions,
  getDesktopBindingErrorFeedback,
  parseDesktopBindingSummaries,
  type DesktopCatalogTrackOption
} from "./desktopAudioBindingUi";
import type { DesktopDirectoryScanApi } from "./desktopDirectoryScanApi";
import { getLocalDirectoryScanErrorMessage } from "./localDirectoryEntryScanner";

interface DesktopLocalDirectoryPreviewProps {
  readonly api: DesktopDirectoryScanApi;
  readonly catalog: CatalogData;
  readonly catalogStatus: CatalogLibraryStatus;
}

type BindingLoadStatus = "error" | "loading" | "ready";

interface CandidateActionMessage {
  readonly candidateId?: DesktopAudioCandidateId;
  readonly message: string;
  readonly tone: "error" | "success";
}

interface OpenBindingDialog extends DesktopBindingDialogSession {
  readonly candidateId: DesktopAudioCandidateId;
}

export function DesktopLocalDirectoryPreview({
  api,
  catalog,
  catalogStatus
}: DesktopLocalDirectoryPreviewProps) {
  const [directories, setDirectories] = useState<
    readonly DesktopMusicDirectoryOption[]
  >([]);
  const [selectedDirectoryId, setSelectedDirectoryId] = useState("");
  const [preview, setPreview] = useState<DesktopAudioScanPreview>();
  const [bindingSummaries, setBindingSummaries] = useState<
    readonly DesktopLocalAudioBindingSummary[]
  >([]);
  const [bindingHintByCandidateId, setBindingHintByCandidateId] = useState<
    ReadonlyMap<DesktopAudioCandidateId, LocalAudioBindingId>
  >(() => new Map());
  const [bindingLoadStatus, setBindingLoadStatus] =
    useState<BindingLoadStatus>("loading");
  const [isLoadingDirectories, setIsLoadingDirectories] = useState(true);
  const [isSelectingDirectory, setIsSelectingDirectory] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [isSubmittingBinding, setIsSubmittingBinding] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>();
  const [candidateActionMessage, setCandidateActionMessage] =
    useState<CandidateActionMessage>();
  const [openBindingDialog, setOpenBindingDialog] = useState<OpenBindingDialog>();
  const bindingSubmissionInProgressRef = useRef(false);

  const loadDirectories = useCallback(async () => {
    setIsLoadingDirectories(true);
    setErrorMessage(undefined);

    try {
      const nextDirectories = (await api.listDirectories()).map(
        toDesktopMusicDirectoryOption
      );
      setDirectories(nextDirectories);
      setSelectedDirectoryId((current) =>
        nextDirectories.some((directory) => directory.directoryId === current)
          ? current
          : (nextDirectories.find((directory) => directory.availability === "available")
              ?.directoryId ??
            nextDirectories[0]?.directoryId ??
            "")
      );
    } catch (error: unknown) {
      setDirectories([]);
      setSelectedDirectoryId("");
      setPreview(undefined);
      setOpenBindingDialog(undefined);
      setErrorMessage(getDesktopLibraryErrorMessage(error, "list"));
    } finally {
      setIsLoadingDirectories(false);
    }
  }, [api]);

  const loadBindingSummaries = useCallback(
    async (showLoading = true) => {
      if (showLoading) {
        setBindingLoadStatus("loading");
      }

      try {
        const nextSummaries = parseDesktopBindingSummaries(await api.bindings.list());
        setBindingSummaries(nextSummaries);
        setBindingLoadStatus("ready");
        return nextSummaries;
      } catch (error: unknown) {
        setBindingSummaries([]);
        setBindingLoadStatus("error");
        setCandidateActionMessage({
          tone: "error",
          message: getDesktopBindingErrorFeedback(error, "list").message
        });
        return undefined;
      }
    },
    [api]
  );

  useEffect(() => {
    const loadTimer = window.setTimeout(() => void loadDirectories(), 0);
    return () => window.clearTimeout(loadTimer);
  }, [loadDirectories]);

  useEffect(() => {
    const loadTimer = window.setTimeout(() => void loadBindingSummaries(), 0);
    return () => window.clearTimeout(loadTimer);
  }, [loadBindingSummaries]);

  const selectedDirectory = useMemo(
    () =>
      directories.find((directory) => directory.directoryId === selectedDirectoryId),
    [directories, selectedDirectoryId]
  );
  const trackOptions = useMemo(
    () => buildDesktopCatalogTrackOptions(catalog),
    [catalog]
  );
  const trackById = useMemo(
    () => new Map(trackOptions.map((track) => [track.trackId, track] as const)),
    [trackOptions]
  );
  const bindingByTrackId = useMemo(
    () =>
      new Map(bindingSummaries.map((summary) => [summary.trackId, summary] as const)),
    [bindingSummaries]
  );
  const candidateBindingById = useMemo(
    () =>
      associateCandidatesWithBindings(
        preview?.candidates ?? [],
        bindingSummaries,
        bindingHintByCandidateId
      ),
    [bindingHintByCandidateId, bindingSummaries, preview?.candidates]
  );
  const dialogCandidate = preview?.candidates.find(
    (candidate) => candidate.candidateId === openBindingDialog?.candidateId
  );
  const isBusy = isLoadingDirectories || isSelectingDirectory || isScanning;
  const canScan = !isBusy && selectedDirectory?.availability === "available";
  const canManageBindings =
    bindingLoadStatus === "ready" &&
    catalogStatus === "ready" &&
    selectedDirectory?.availability === "available" &&
    !isBusy &&
    !isSubmittingBinding;

  async function selectDirectory() {
    if (isBusy) {
      return;
    }

    setIsSelectingDirectory(true);
    setErrorMessage(undefined);
    closeCandidateUi();

    try {
      const selected = await api.selectDirectory();
      if (selected === null) {
        return;
      }

      const option = toDesktopMusicDirectoryOption(selected);
      setDirectories((current) => [
        ...current.filter((directory) => directory.directoryId !== option.directoryId),
        option
      ]);
      setSelectedDirectoryId(option.directoryId);
      setPreview(undefined);
    } catch (error: unknown) {
      setErrorMessage(getDesktopLibraryErrorMessage(error, "select"));
    } finally {
      setIsSelectingDirectory(false);
    }
  }

  async function scanDirectory() {
    if (!canScan || !selectedDirectory) {
      return;
    }

    setIsScanning(true);
    setPreview(undefined);
    setErrorMessage(undefined);
    closeCandidateUi();

    try {
      const result = await api.scanDirectory({
        directoryId: selectedDirectory.directoryId
      });
      setPreview(buildDesktopAudioScanPreview(result));
    } catch (error: unknown) {
      setErrorMessage(getDesktopLibraryErrorMessage(error, "scan"));
    } finally {
      setIsScanning(false);
    }
  }

  function closeCandidateUi() {
    setOpenBindingDialog(undefined);
    setCandidateActionMessage(undefined);
    setBindingHintByCandidateId(new Map());
  }

  function clearPreview() {
    if (isSubmittingBinding) {
      return;
    }

    setPreview(undefined);
    closeCandidateUi();
  }

  function openCandidateDialog(
    candidateId: DesktopAudioCandidateId,
    mode: OpenBindingDialog["mode"],
    returnFocusTo: HTMLButtonElement
  ) {
    if (!canManageBindings) {
      return;
    }

    setCandidateActionMessage(undefined);
    setOpenBindingDialog({ candidateId, mode, returnFocusTo });
  }

  async function bindCandidate(
    track: DesktopCatalogTrackOption,
    expectedTargetBinding: DesktopLocalAudioBindingSummary | undefined
  ) {
    if (
      !openBindingDialog ||
      !dialogCandidate ||
      !canManageBindings ||
      bindingSubmissionInProgressRef.current
    ) {
      return;
    }

    const candidateId = dialogCandidate.candidateId;
    const previousCandidateBinding = candidateBindingById.get(candidateId);
    let failureOperation: "bind" | "unbind" = "bind";
    bindingSubmissionInProgressRef.current = true;
    setIsSubmittingBinding(true);
    setCandidateActionMessage(undefined);

    try {
      const savedBinding = parseDesktopBindingSummaries([
        await api.bindings.bindCandidateToTrack({
          candidateId,
          trackId: track.trackId,
          ...(expectedTargetBinding
            ? { expectedExistingBindingId: expectedTargetBinding.bindingId }
            : {})
        })
      ])[0];

      if (!savedBinding) {
        throw new TypeError("Desktop binding result is missing.");
      }

      setBindingHintByCandidateId(
        new Map([[candidateId, savedBinding.bindingId] as const])
      );

      if (
        previousCandidateBinding &&
        previousCandidateBinding.trackId !== savedBinding.trackId
      ) {
        failureOperation = "unbind";
        parseDesktopBindingSummaries([
          await api.bindings.unbindTrack({
            trackId: previousCandidateBinding.trackId,
            expectedBindingId: previousCandidateBinding.bindingId
          })
        ]);
      }

      setOpenBindingDialog(undefined);
      await loadBindingSummaries(false);
      setCandidateActionMessage({
        candidateId,
        tone: "success",
        message: `已绑定到《${track.title}》。`
      });
    } catch (error: unknown) {
      await handleBindingFailure(error, failureOperation, candidateId);
    } finally {
      bindingSubmissionInProgressRef.current = false;
      setIsSubmittingBinding(false);
    }
  }

  async function unbindCandidate(binding: DesktopLocalAudioBindingSummary) {
    if (
      !openBindingDialog ||
      !dialogCandidate ||
      !canManageBindings ||
      bindingSubmissionInProgressRef.current
    ) {
      return;
    }

    const candidateId = dialogCandidate.candidateId;
    bindingSubmissionInProgressRef.current = true;
    setIsSubmittingBinding(true);
    setCandidateActionMessage(undefined);

    try {
      parseDesktopBindingSummaries([
        await api.bindings.unbindTrack({
          trackId: binding.trackId,
          expectedBindingId: binding.bindingId
        })
      ]);
      setBindingHintByCandidateId((current) => {
        const next = new Map(current);
        next.delete(candidateId);
        return next;
      });
      setOpenBindingDialog(undefined);
      await loadBindingSummaries(false);
      setCandidateActionMessage({
        candidateId,
        tone: "success",
        message: "已解除绑定；磁盘文件和曲库内容均未删除。"
      });
    } catch (error: unknown) {
      await handleBindingFailure(error, "unbind", candidateId);
    } finally {
      bindingSubmissionInProgressRef.current = false;
      setIsSubmittingBinding(false);
    }
  }

  async function handleBindingFailure(
    error: unknown,
    operation: "bind" | "unbind",
    candidateId: DesktopAudioCandidateId
  ) {
    const feedback = getDesktopBindingErrorFeedback(error, operation);

    setOpenBindingDialog(undefined);
    if (feedback.kind === "conflict") {
      await loadBindingSummaries(false);
    }
    if (feedback.kind === "directory-unavailable") {
      await loadDirectories();
    }
    setCandidateActionMessage({
      candidateId,
      tone: "error",
      message: feedback.message
    });
  }

  return (
    <section className="directory-import" aria-label="桌面音乐目录扫描预览">
      <div className="directory-import-heading">
        <p className="helper-text">
          扫描只生成临时候选；只有你选择现有曲目并确认后，应用才会保存绑定。
        </p>
      </div>

      <div className="directory-import-controls desktop-directory-controls">
        <label className="catalog-editor-field" htmlFor="desktop-music-directory">
          已授权目录
          <select
            id="desktop-music-directory"
            value={selectedDirectoryId}
            disabled={isBusy || directories.length === 0}
            onChange={(event) => {
              setSelectedDirectoryId(event.target.value);
              setPreview(undefined);
              setErrorMessage(undefined);
              closeCandidateUi();
            }}
          >
            {directories.length === 0 ? <option value="">暂无已授权目录</option> : null}
            {directories.map((directory) => (
              <option key={directory.directoryId} value={directory.directoryId}>
                {directory.displayName}（
                {getDirectoryAvailabilityLabel(directory.availability)}）
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="text-button"
          disabled={isBusy}
          onClick={() => void selectDirectory()}
        >
          {isSelectingDirectory ? "正在选择…" : "选择音乐目录"}
        </button>
        <button
          type="button"
          className="text-button"
          disabled={isBusy}
          onClick={() => void loadDirectories()}
        >
          {isLoadingDirectories ? "正在刷新…" : "刷新目录"}
        </button>
        <button
          type="button"
          className="secondary-button"
          disabled={!canScan}
          onClick={() => void scanDirectory()}
        >
          {isScanning ? "正在扫描…" : "扫描所选目录"}
        </button>
      </div>

      {selectedDirectory && selectedDirectory.availability !== "available" ? (
        <p className="directory-import-warning" role="status">
          所选目录当前{getDirectoryAvailabilityLabel(selectedDirectory.availability)}，
          请恢复目录后刷新，或重新选择目录。
        </p>
      ) : null}
      {errorMessage ? (
        <p className="directory-import-error" role="alert">
          {errorMessage}
        </p>
      ) : null}

      {bindingLoadStatus === "loading" ? (
        <p className="directory-import-empty" role="status">
          正在读取现有绑定状态…
        </p>
      ) : null}
      {bindingLoadStatus === "error" ? (
        <div className="desktop-binding-load-error" role="alert">
          <span>绑定状态暂时不可用；刷新成功前不会提交绑定操作。</span>
          <button
            type="button"
            className="text-button"
            onClick={() => void loadBindingSummaries()}
          >
            刷新绑定状态
          </button>
        </div>
      ) : null}
      {catalogStatus !== "ready" ? (
        <p className="directory-import-warning" role="status">
          曲目目录尚未准备好，暂时不能选择绑定曲目。
        </p>
      ) : null}
      {candidateActionMessage && !candidateActionMessage.candidateId ? (
        <p
          className={
            candidateActionMessage.tone === "error"
              ? "directory-import-error"
              : "directory-import-result"
          }
          role={candidateActionMessage.tone === "error" ? "alert" : "status"}
        >
          {candidateActionMessage.message}
        </p>
      ) : null}

      {preview ? (
        <DesktopScanPreviewTable
          preview={preview}
          canManageBindings={canManageBindings}
          bindingByCandidateId={candidateBindingById}
          trackById={trackById}
          actionMessage={candidateActionMessage}
          onOpenBindingDialog={openCandidateDialog}
          onClear={clearPreview}
        />
      ) : (
        <p className="directory-import-empty" role="status">
          {isLoadingDirectories
            ? "正在读取已授权目录…"
            : isSelectingDirectory
              ? "正在等待目录选择…"
              : isScanning
                ? "正在读取候选文件…"
                : "选择或刷新已授权目录，然后扫描以生成仅存在于当前页面的预览。"}
        </p>
      )}

      {openBindingDialog && dialogCandidate ? (
        <DesktopAudioBindingDialog
          session={openBindingDialog}
          candidate={dialogCandidate}
          currentCandidateBinding={candidateBindingById.get(
            dialogCandidate.candidateId
          )}
          tracks={trackOptions}
          bindingByTrackId={bindingByTrackId}
          isSubmitting={isSubmittingBinding}
          onBind={(track, expectedTargetBinding) =>
            void bindCandidate(track, expectedTargetBinding)
          }
          onUnbind={(binding) => void unbindCandidate(binding)}
          onClose={() => setOpenBindingDialog(undefined)}
        />
      ) : null}
    </section>
  );
}

function DesktopScanPreviewTable({
  preview,
  canManageBindings,
  bindingByCandidateId,
  trackById,
  actionMessage,
  onOpenBindingDialog,
  onClear
}: {
  readonly preview: DesktopAudioScanPreview;
  readonly canManageBindings: boolean;
  readonly bindingByCandidateId: ReadonlyMap<
    DesktopAudioCandidateId,
    DesktopLocalAudioBindingSummary
  >;
  readonly trackById: ReadonlyMap<LocalAudioTrackId, DesktopCatalogTrackOption>;
  readonly actionMessage?: CandidateActionMessage;
  readonly onOpenBindingDialog: (
    candidateId: DesktopAudioCandidateId,
    mode: OpenBindingDialog["mode"],
    returnFocusTo: HTMLButtonElement
  ) => void;
  readonly onClear: () => void;
}) {
  return (
    <div className="directory-import-preview">
      <p className="directory-import-summary" aria-live="polite">
        已读取 {preview.totalFileCount} 个文件；支持 {preview.supportedFileCount}{" "}
        个音频，忽略 {preview.ignoredFileCount} 个，扫描问题 {preview.errorCount} 项。
      </p>

      {preview.candidates.length === 0 ? (
        <p className="directory-import-empty" role="status">
          当前目录没有可预览的受支持音频文件。
        </p>
      ) : (
        <div className="directory-import-table-wrap">
          <table className="directory-import-table desktop-directory-table">
            <caption>桌面扫描候选；每项都需要明确选择现有曲目并确认绑定。</caption>
            <thead>
              <tr>
                <th scope="col">文件</th>
                <th scope="col">大小 / 修改时间</th>
                <th scope="col">解析提示</th>
                <th scope="col">状态 / 问题</th>
                <th scope="col">曲目绑定</th>
              </tr>
            </thead>
            <tbody>
              {preview.candidates.map((candidate) => {
                const binding = bindingByCandidateId.get(candidate.candidateId);
                const boundTrack = binding ? trackById.get(binding.trackId) : undefined;
                const rowMessage =
                  actionMessage?.candidateId === candidate.candidateId
                    ? actionMessage
                    : undefined;

                return (
                  <tr key={candidate.candidateId}>
                    <td>
                      <strong>{candidate.fileName}</strong>
                      <span>{candidate.fileExtension.toUpperCase()}</span>
                    </td>
                    <td>
                      <strong>{formatFileSize(candidate.fileSize)}</strong>
                      <span>{formatModifiedAt(candidate.modifiedAt)}</span>
                    </td>
                    <td>
                      <strong>{candidate.trackTitle ?? "曲名未识别"}</strong>
                      <span>专辑：{candidate.albumTitle ?? "未识别"}</span>
                      <span>歌手：{candidate.artistName ?? "未识别"}</span>
                    </td>
                    <td>
                      <strong>
                        {candidate.parseStatus === "parsed" ? "已解析" : "需要检查"}
                      </strong>
                      <span>
                        {candidate.issues.length > 0
                          ? candidate.issues
                              .map(getLocalDirectoryScanErrorMessage)
                              .join("；")
                          : "无扫描问题"}
                      </span>
                    </td>
                    <td className="desktop-binding-cell">
                      {binding ? (
                        <>
                          <strong>
                            已绑定：{boundTrack?.title ?? "曲目已不在目录中"}
                          </strong>
                          <span>
                            {boundTrack
                              ? `${boundTrack.artistName} · ${boundTrack.albumTitle}`
                              : "可以更换曲目或解除这个旧绑定。"}
                          </span>
                          <div className="desktop-binding-row-actions">
                            <button
                              type="button"
                              className="text-button"
                              disabled={!canManageBindings}
                              onClick={(event) =>
                                onOpenBindingDialog(
                                  candidate.candidateId,
                                  "select",
                                  event.currentTarget
                                )
                              }
                            >
                              更换曲目
                            </button>
                            <button
                              type="button"
                              className="text-button danger-button"
                              disabled={!canManageBindings}
                              onClick={(event) =>
                                onOpenBindingDialog(
                                  candidate.candidateId,
                                  "unbind",
                                  event.currentTarget
                                )
                              }
                            >
                              解除绑定
                            </button>
                          </div>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="secondary-button"
                          disabled={!canManageBindings}
                          onClick={(event) =>
                            onOpenBindingDialog(
                              candidate.candidateId,
                              "select",
                              event.currentTarget
                            )
                          }
                        >
                          绑定曲目
                        </button>
                      )}
                      {rowMessage ? (
                        <span
                          className={
                            rowMessage.tone === "error"
                              ? "desktop-binding-row-error"
                              : "desktop-binding-row-success"
                          }
                          role={rowMessage.tone === "error" ? "alert" : "status"}
                        >
                          {rowMessage.message}
                        </span>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {preview.errors.length > 0 ? (
        <div className="directory-import-warning" role="status">
          <strong>扫描问题</strong>
          <ul className="desktop-directory-error-list">
            {preview.errors.map((issue, index) => (
              <li key={`${issue.code}:${index}`}>{issue.message}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="directory-import-actions">
        <button type="button" className="text-button" onClick={onClear}>
          清除预览
        </button>
      </div>
    </div>
  );
}

function getDirectoryAvailabilityLabel(
  availability: DesktopMusicDirectoryOption["availability"]
): string {
  switch (availability) {
    case "available":
      return "可用";
    case "missing":
      return "已丢失";
    case "unreadable":
      return "不可读取";
  }
}

function formatModifiedAt(modifiedAt: number): string {
  return new Date(modifiedAt).toLocaleString("zh-CN", { hour12: false });
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
