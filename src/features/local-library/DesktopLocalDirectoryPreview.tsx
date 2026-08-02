import { useCallback, useEffect, useMemo, useState } from "react";

import {
  buildDesktopAudioScanPreview,
  getDesktopLibraryErrorMessage,
  toDesktopMusicDirectoryOption,
  type DesktopAudioScanPreview,
  type DesktopMusicDirectoryOption
} from "./desktopAudioCandidatePreview";
import type { DesktopDirectoryScanApi } from "./desktopDirectoryScanApi";
import { getLocalDirectoryScanErrorMessage } from "./localDirectoryEntryScanner";

interface DesktopLocalDirectoryPreviewProps {
  readonly api: DesktopDirectoryScanApi;
}

export function DesktopLocalDirectoryPreview({
  api
}: DesktopLocalDirectoryPreviewProps) {
  const [directories, setDirectories] = useState<
    readonly DesktopMusicDirectoryOption[]
  >([]);
  const [selectedDirectoryId, setSelectedDirectoryId] = useState("");
  const [preview, setPreview] = useState<DesktopAudioScanPreview>();
  const [isLoadingDirectories, setIsLoadingDirectories] = useState(true);
  const [isSelectingDirectory, setIsSelectingDirectory] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>();

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
      setErrorMessage(getDesktopLibraryErrorMessage(error, "list"));
    } finally {
      setIsLoadingDirectories(false);
    }
  }, [api]);

  useEffect(() => {
    const loadTimer = window.setTimeout(() => void loadDirectories(), 0);
    return () => window.clearTimeout(loadTimer);
  }, [loadDirectories]);

  const selectedDirectory = useMemo(
    () =>
      directories.find((directory) => directory.directoryId === selectedDirectoryId),
    [directories, selectedDirectoryId]
  );
  const isBusy = isLoadingDirectories || isSelectingDirectory || isScanning;
  const canScan = !isBusy && selectedDirectory?.availability === "available";

  async function selectDirectory() {
    if (isBusy) {
      return;
    }

    setIsSelectingDirectory(true);
    setErrorMessage(undefined);

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

  return (
    <section className="directory-import" aria-label="桌面音乐目录扫描预览">
      <div className="directory-import-heading">
        <p className="helper-text">
          本阶段只预览扫描候选，不会自动匹配歌曲、创建绑定或读取音频内容。
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

      {preview ? (
        <DesktopScanPreviewTable
          preview={preview}
          onClear={() => setPreview(undefined)}
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
    </section>
  );
}

function DesktopScanPreviewTable({
  preview,
  onClear
}: {
  readonly preview: DesktopAudioScanPreview;
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
            <caption>桌面扫描候选预览；此处不会创建或保存音频绑定。</caption>
            <thead>
              <tr>
                <th scope="col">文件</th>
                <th scope="col">大小 / 修改时间</th>
                <th scope="col">解析提示</th>
                <th scope="col">状态 / 问题</th>
              </tr>
            </thead>
            <tbody>
              {preview.candidates.map((candidate) => (
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
                </tr>
              ))}
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
