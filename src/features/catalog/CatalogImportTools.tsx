import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject
} from "react";

import type { CatalogData, EntityId, LocalAudioFileRecord } from "../../types";
import { DesktopLocalDirectoryPreview } from "../local-library/DesktopLocalDirectoryPreview";
import { getDesktopDirectoryScanApi } from "../local-library/desktopDirectoryScanApi";
import { LocalDirectoryImport } from "../local-library/LocalDirectoryImport";
import type {
  LocalAudioBatchBindingResult,
  LocalAudioBindingRequest,
  LocalAudioLibraryStatus
} from "../local-library/useLocalAudioLibrary";
import { CatalogImportPanel } from "./CatalogImportPanel";
import { XuSongCatalogImport } from "./VerifiedXuSongCatalogImport";
import type {
  CatalogDirectoryImportAlbumDraft,
  CatalogDirectoryImportResult,
  CatalogLibraryStatus
} from "./useCatalogLibrary";

type CatalogImportTool = "verified-catalog" | "qq-metadata" | "local-directory";

interface CatalogImportToolsProps {
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

export function CatalogImportTools({
  catalog,
  catalogStatus,
  audioBindingsByTrackId,
  audioStatus,
  isCatalogSaving,
  onImportCatalogDrafts,
  onBindAudioFiles
}: CatalogImportToolsProps) {
  const [openTool, setOpenTool] = useState<CatalogImportTool>();
  const desktopDirectoryScanApi = getDesktopDirectoryScanApi(globalThis);
  const verifiedCatalogTriggerRef = useRef<HTMLButtonElement>(null);
  const qqMetadataTriggerRef = useRef<HTMLButtonElement>(null);
  const localDirectoryTriggerRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <div className="catalog-import-tools" role="group" aria-label="目录导入工具">
        <span className="catalog-import-tools-label">导入工具</span>
        <button
          className="text-button"
          ref={qqMetadataTriggerRef}
          type="button"
          aria-expanded={openTool === "qq-metadata"}
          aria-controls="qq-metadata-import-dialog"
          onClick={() => setOpenTool("qq-metadata")}
        >
          导入远程元数据
        </button>
        <button
          className="text-button"
          ref={verifiedCatalogTriggerRef}
          type="button"
          aria-expanded={openTool === "verified-catalog"}
          aria-controls="verified-catalog-import-dialog"
          onClick={() => setOpenTool("verified-catalog")}
        >
          导入许嵩目录
        </button>
        <button
          className="text-button"
          ref={localDirectoryTriggerRef}
          type="button"
          aria-expanded={openTool === "local-directory"}
          aria-controls="local-directory-import-dialog"
          onClick={() => setOpenTool("local-directory")}
        >
          {desktopDirectoryScanApi ? "扫描本地音频" : "批量绑定音频"}
        </button>
      </div>

      <CatalogImportDialog
        id="verified-catalog-import-dialog"
        isOpen={openTool === "verified-catalog"}
        title="导入许嵩正式目录"
        triggerRef={verifiedCatalogTriggerRef}
        onClose={() => setOpenTool(undefined)}
      >
        <XuSongCatalogImport
          catalog={catalog}
          catalogStatus={catalogStatus}
          isCatalogSaving={isCatalogSaving}
          isEmbedded
          onImport={onImportCatalogDrafts}
        />
      </CatalogImportDialog>

      <CatalogImportDialog
        id="qq-metadata-import-dialog"
        isOpen={openTool === "qq-metadata"}
        title="导入自托管 QQ 元数据"
        triggerRef={qqMetadataTriggerRef}
        onClose={() => setOpenTool(undefined)}
      >
        <CatalogImportPanel
          catalog={catalog}
          catalogStatus={catalogStatus}
          isCatalogSaving={isCatalogSaving}
          onImport={onImportCatalogDrafts}
        />
      </CatalogImportDialog>

      <CatalogImportDialog
        id="local-directory-import-dialog"
        isOpen={openTool === "local-directory"}
        title={desktopDirectoryScanApi ? "扫描并绑定本地音频" : "批量绑定本地音频"}
        triggerRef={localDirectoryTriggerRef}
        onClose={() => setOpenTool(undefined)}
      >
        {desktopDirectoryScanApi ? (
          <DesktopLocalDirectoryPreview
            api={desktopDirectoryScanApi}
            catalog={catalog}
            catalogStatus={catalogStatus}
          />
        ) : (
          <LocalDirectoryImport
            catalog={catalog}
            catalogStatus={catalogStatus}
            audioBindingsByTrackId={audioBindingsByTrackId}
            audioStatus={audioStatus}
            isCatalogSaving={isCatalogSaving}
            isEmbedded
            onImportCatalogDrafts={onImportCatalogDrafts}
            onBindAudioFiles={onBindAudioFiles}
          />
        )}
      </CatalogImportDialog>
    </>
  );
}

interface CatalogImportDialogProps {
  id: string;
  isOpen: boolean;
  title: string;
  triggerRef: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  children: ReactNode;
}

function CatalogImportDialog({
  id,
  isOpen,
  title,
  triggerRef,
  onClose,
  children
}: CatalogImportDialogProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const titleId = `${id}-title`;

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const trigger = triggerRef.current;
    const focusTimer = window.setTimeout(() => closeButtonRef.current?.focus(), 0);

    return () => {
      window.clearTimeout(focusTimer);
      trigger?.focus();
    };
  }, [isOpen, triggerRef]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handleDocumentKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }

      event.preventDefault();
      onClose();
    }

    document.addEventListener("keydown", handleDocumentKeyDown);

    return () => document.removeEventListener("keydown", handleDocumentKeyDown);
  }, [isOpen, onClose]);

  function handleKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key !== "Tab") {
      return;
    }

    const focusableElements = getFocusableElements(dialogRef.current);
    const firstElement = focusableElements[0];
    const lastElement = focusableElements.at(-1);

    if (!firstElement || !lastElement) {
      event.preventDefault();
      return;
    }

    if (event.shiftKey && document.activeElement === firstElement) {
      event.preventDefault();
      lastElement.focus();
    } else if (!event.shiftKey && document.activeElement === lastElement) {
      event.preventDefault();
      firstElement.focus();
    }
  }

  return (
    <div
      className="catalog-import-dialog-backdrop"
      hidden={!isOpen}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section
        className="catalog-import-dialog"
        id={id}
        ref={dialogRef}
        role={isOpen ? "dialog" : undefined}
        aria-modal={isOpen ? "true" : undefined}
        aria-labelledby={isOpen ? titleId : undefined}
        onKeyDown={handleKeyDown}
      >
        <div className="catalog-import-dialog-heading">
          <div>
            <p className="eyebrow">导入工具</p>
            <h2 id={titleId}>{title}</h2>
          </div>
          <button
            className="icon-button"
            ref={closeButtonRef}
            type="button"
            aria-label={`关闭${title}`}
            title="关闭"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <div className="catalog-import-dialog-body">{children}</div>
      </section>
    </div>
  );
}

function getFocusableElements(container: HTMLElement | null): HTMLElement[] {
  if (!container) {
    return [];
  }

  return Array.from(
    container.querySelectorAll<HTMLElement>(
      "button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex='-1'])"
    )
  ).filter((element) => !element.hasAttribute("hidden"));
}
