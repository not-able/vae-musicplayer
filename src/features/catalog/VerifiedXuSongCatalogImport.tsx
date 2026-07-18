import { useMemo, useState } from "react";

import type { CatalogData } from "../../types";
import type {
  CatalogDirectoryImportAlbumDraft,
  CatalogDirectoryImportResult,
  CatalogLibraryStatus
} from "./useCatalogLibrary";
import { createXuSongCatalogImportPlan } from "./xuSongCatalogImport";

interface XuSongCatalogImportProps {
  catalog: CatalogData;
  catalogStatus: CatalogLibraryStatus;
  isCatalogSaving: boolean;
  onImport: (
    drafts: readonly CatalogDirectoryImportAlbumDraft[]
  ) => Promise<CatalogDirectoryImportResult>;
}

export function XuSongCatalogImport({
  catalog,
  catalogStatus,
  isCatalogSaving,
  onImport
}: XuSongCatalogImportProps) {
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [notice, setNotice] = useState<string>();
  const plan = useMemo(() => createXuSongCatalogImportPlan(catalog), [catalog]);
  const isReady = catalogStatus === "ready" && plan.status === "ready";
  const trackCount =
    plan.status === "ready"
      ? plan.drafts.reduce((total, draft) => total + draft.tracks.length, 0)
      : 0;

  async function handleImport(): Promise<void> {
    if (plan.status !== "ready" || plan.drafts.length === 0) {
      return;
    }

    setIsImporting(true);
    setNotice(undefined);
    const result = await onImport(plan.drafts);
    setIsImporting(false);

    if (!result.ok) {
      setNotice(result.errorMessage);
      return;
    }

    setNotice(`已新增 ${plan.drafts.length} 张专辑和 ${trackCount} 首歌曲。`);
    setIsPreviewOpen(false);
  }

  return (
    <section
      className="verified-catalog-import"
      aria-labelledby="verified-catalog-heading"
    >
      <div>
        <h2 id="verified-catalog-heading">导入已核对的许嵩目录</h2>
        <p>
          可预览后一次性新增正式专辑类发行与曲目。此操作不下载、不绑定音频，也不会删除现有目录或覆盖同名专辑。
        </p>
      </div>

      {plan.status === "unavailable" ? (
        <p className="verified-catalog-import-error" role="alert">
          {plan.errorMessage}
        </p>
      ) : (
        <>
          <p className="verified-catalog-import-summary" aria-live="polite">
            {plan.drafts.length === 0
              ? "全部已在当前目录中，无需新增。"
              : `可新增 ${plan.drafts.length} 张专辑、${trackCount} 首歌曲。`}
            {plan.skippedAlbumTitles.length > 0
              ? ` 已跳过同名专辑：${plan.skippedAlbumTitles.join("、")}。`
              : ""}
          </p>

          {isPreviewOpen ? (
            <div className="verified-catalog-import-preview" aria-busy={isImporting}>
              <ul>
                {plan.drafts.map((draft) => (
                  <li key={draft.title}>
                    <strong>{draft.title}</strong>
                    <span>{draft.tracks.length} 首歌曲</span>
                  </li>
                ))}
              </ul>
              <div className="verified-catalog-import-actions">
                <button
                  type="button"
                  className="secondary-button"
                  disabled={isImporting}
                  onClick={() => setIsPreviewOpen(false)}
                >
                  取消
                </button>
                <button
                  type="button"
                  className="primary-button"
                  disabled={
                    !isReady ||
                    isCatalogSaving ||
                    isImporting ||
                    plan.drafts.length === 0
                  }
                  onClick={() => void handleImport()}
                >
                  {isImporting
                    ? "正在导入目录…"
                    : `确认新增 ${plan.drafts.length} 张专辑`}
                </button>
              </div>
            </div>
          ) : (
            <div className="verified-catalog-import-actions">
              <button
                type="button"
                className="secondary-button"
                disabled={!isReady || isCatalogSaving || plan.drafts.length === 0}
                onClick={() => setIsPreviewOpen(true)}
              >
                预览待导入目录
              </button>
            </div>
          )}
        </>
      )}

      {notice ? (
        <p className="verified-catalog-import-notice" role="status">
          {notice}
        </p>
      ) : null}
    </section>
  );
}
