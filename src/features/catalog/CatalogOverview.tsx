import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type ReactNode
} from "react";
import { createPortal } from "react-dom";

import type {
  Album,
  AlbumType,
  CatalogData,
  EntityId,
  LocalAudioFileRecord,
  Track
} from "../../types";
import { LOCAL_AUDIO_FILE_ACCEPT } from "../local-library/localAudioFile";
import type { LocalAudioLibraryStatus } from "../local-library/useLocalAudioLibrary";
import { writeAlbumDragData, writeTrackDragData } from "../../utils/albumDrag";
import { getAlbumTracks, getSortedAlbums } from "./catalog";
import { CatalogEditor, CatalogTrackEditor } from "./CatalogEditor";
import type {
  CatalogAlbumCreationResult,
  CatalogAlbumDraft,
  CatalogAlbumUpdateDraft,
  CatalogLibraryStatus,
  CatalogMutationResult,
  CatalogTrackCreationResult,
  CatalogTrackDraft,
  CatalogTrackUpdateDraft
} from "./useCatalogLibrary";
import type { CatalogDeletionPreview, CatalogDeletionTarget } from "./catalogDeletion";
import type { CatalogDeletionResult } from "./useCatalogDeletion";

interface CatalogOverviewProps {
  catalog: CatalogData;
  catalogLibraryStatus: CatalogLibraryStatus;
  catalogLibraryError?: string;
  isSavingAlbum: boolean;
  isSavingTrack: boolean;
  resettableAlbumIds: ReadonlySet<EntityId>;
  resettableTrackIds: ReadonlySet<EntityId>;
  audioBindings: ReadonlyMap<EntityId, LocalAudioFileRecord>;
  pendingAudioTrackIds: ReadonlySet<EntityId>;
  audioLibraryStatus: LocalAudioLibraryStatus;
  audioLibraryError?: string;
  onAddTrack: (trackId: EntityId) => void;
  onAddAlbum: (albumId: EntityId) => void;
  onCreateAlbum: (draft: CatalogAlbumDraft) => Promise<CatalogAlbumCreationResult>;
  onCreateTrack: (
    albumId: EntityId,
    draft: CatalogTrackDraft
  ) => Promise<CatalogTrackCreationResult>;
  onUpdateAlbum: (
    albumId: EntityId,
    draft: CatalogAlbumUpdateDraft
  ) => Promise<CatalogMutationResult>;
  onUpdateTrack: (
    trackId: EntityId,
    draft: CatalogTrackUpdateDraft
  ) => Promise<CatalogMutationResult>;
  onResetAlbum: (albumId: EntityId) => Promise<CatalogMutationResult>;
  onResetTrack: (trackId: EntityId) => Promise<CatalogMutationResult>;
  onBindAudio: (trackId: EntityId, file: File) => Promise<boolean>;
  onRequestAudioAccess?: (trackId: EntityId) => Promise<boolean>;
  onUnbindAudio: (trackId: EntityId) => Promise<boolean>;
  canDelete?: boolean;
  isDeleting?: boolean;
  deletionError?: string;
  onPreviewDeletion?: (
    target: CatalogDeletionTarget
  ) => CatalogDeletionPreview | undefined;
  onDeleteCatalogTarget?: (
    target: CatalogDeletionTarget
  ) => Promise<CatalogDeletionResult>;
  importTools?: ReactNode;
}

const albumTypeLabels: Record<AlbumType, string> = {
  album: "专辑",
  ep: "EP",
  single_collection: "单曲合集",
  other: "其他发行"
};

type CatalogEditorTarget =
  | { kind: "create-album" }
  | { kind: "create-track"; albumId: EntityId }
  | { kind: "edit-album"; albumId: EntityId }
  | { kind: "edit-track"; albumId: EntityId; trackId: EntityId };

export function CatalogOverview({
  catalog,
  catalogLibraryStatus,
  catalogLibraryError,
  isSavingAlbum,
  isSavingTrack,
  resettableAlbumIds,
  resettableTrackIds,
  audioBindings,
  pendingAudioTrackIds,
  audioLibraryStatus,
  audioLibraryError,
  onAddTrack,
  onAddAlbum,
  onCreateAlbum,
  onCreateTrack,
  onUpdateAlbum,
  onUpdateTrack,
  onResetAlbum,
  onResetTrack,
  onBindAudio,
  onRequestAudioAccess = async () => false,
  onUnbindAudio,
  canDelete = false,
  isDeleting = false,
  deletionError,
  onPreviewDeletion,
  onDeleteCatalogTarget,
  importTools
}: CatalogOverviewProps) {
  const albums = useMemo(() => getSortedAlbums(catalog), [catalog]);
  const [albumSelection, setAlbumSelection] = useState(() => ({
    catalog,
    albumId: albums[0]?.id
  }));
  const [draggingAlbumId, setDraggingAlbumId] = useState<EntityId>();
  const [draggingTrackId, setDraggingTrackId] = useState<EntityId>();
  const [editorTarget, setEditorTarget] = useState<CatalogEditorTarget>();
  const [pendingDeletion, setPendingDeletion] = useState<CatalogDeletionPreview>();
  const [deletionDialogError, setDeletionDialogError] = useState<string>();
  const selectedAlbumId =
    albumSelection.catalog === catalog ||
    albums.some((album) => album.id === albumSelection.albumId)
      ? albumSelection.albumId
      : albums[0]?.id;
  const selectedAlbum =
    albums.find((album) => album.id === selectedAlbumId) ?? albums[0];

  if (albumSelection.catalog !== catalog) {
    setAlbumSelection({
      catalog,
      albumId: selectedAlbum?.id
    });

    const targetAlbumId =
      editorTarget && editorTarget.kind !== "create-album"
        ? editorTarget.albumId
        : undefined;
    const targetTrackExists =
      editorTarget?.kind !== "edit-track" ||
      catalog.tracks.some(
        (track) =>
          track.id === editorTarget.trackId && track.albumId === editorTarget.albumId
      );

    if (
      (targetAlbumId && !catalog.albums.some((album) => album.id === targetAlbumId)) ||
      !targetTrackExists
    ) {
      setEditorTarget(undefined);
    }
  }

  function startAlbumDrag(event: DragEvent<HTMLButtonElement>, albumId: EntityId) {
    writeAlbumDragData(event.dataTransfer, albumId);
    setDraggingAlbumId(albumId);
  }

  function startTrackDrag(event: DragEvent<HTMLDivElement>, trackId: EntityId) {
    writeTrackDragData(event.dataTransfer, trackId);
    setDraggingTrackId(trackId);
  }

  function handleAlbumCreated(albumId: EntityId): void {
    setAlbumSelection({
      catalog,
      albumId
    });
    setEditorTarget(undefined);
  }

  function selectAlbum(albumId: EntityId): void {
    setAlbumSelection({
      catalog,
      albumId
    });
    setEditorTarget(undefined);
  }

  function requestDeletion(target: CatalogDeletionTarget): void {
    const preview = onPreviewDeletion?.(target);

    if (!preview) {
      return;
    }

    setDeletionDialogError(undefined);
    setPendingDeletion(preview);
  }

  async function confirmDeletion(): Promise<void> {
    if (!pendingDeletion || !onDeleteCatalogTarget) {
      return;
    }

    const result = await onDeleteCatalogTarget(pendingDeletion.target);

    if (result.ok) {
      setPendingDeletion(undefined);
      setDeletionDialogError(undefined);
      return;
    }

    setDeletionDialogError(result.errorMessage ?? "目录删除失败，请稍后重试。");
  }

  return (
    <div className="catalog">
      <div className="section-heading catalog-heading">
        <div>
          <p className="eyebrow">Catalog</p>
          <h2 id="catalog-heading">专辑目录</h2>
        </div>
        <div className="catalog-heading-actions">
          {importTools}
          <button
            className="secondary-button"
            type="button"
            aria-expanded={editorTarget?.kind === "create-album"}
            disabled={
              editorTarget !== undefined ||
              isSavingAlbum ||
              isSavingTrack ||
              catalogLibraryStatus !== "ready" ||
              catalog.artists.length === 0
            }
            onClick={() => setEditorTarget({ kind: "create-album" })}
          >
            新增专辑
          </button>
          <span className="pill">{catalog.schemaVersion} 版元数据</span>
        </div>
      </div>

      {editorTarget?.kind === "create-album" && (
        <CatalogEditor
          mode="create"
          artistName={catalog.artists[0]?.name ?? "项目艺人不可用"}
          isSaving={isSavingAlbum}
          onCancel={() => setEditorTarget(undefined)}
          onSubmit={onCreateAlbum}
          onCreated={handleAlbumCreated}
        />
      )}

      <div className="local-audio-notice">
        <p>音频文件仅保存在当前浏览器的本地存储中，不会上传。</p>
        <CatalogLibraryNotice
          status={catalogLibraryStatus}
          errorMessage={catalogLibraryError}
        />
        {audioLibraryError && (
          <p className="local-audio-error" role="status">
            {audioLibraryError}
          </p>
        )}
        {deletionError && (
          <p className="local-audio-error catalog-library-error" role="status">
            {deletionError}
          </p>
        )}
      </div>

      {selectedAlbum ? (
        <div className="catalog-browser">
          <nav className="album-directory" aria-labelledby="album-list-heading">
            <div className="directory-heading">
              <h3 id="album-list-heading">全部专辑</h3>
              <span>{albums.length} 张</span>
            </div>

            <ul className="album-list">
              {albums.map((album) => {
                const tracks = getAlbumTracks(catalog, album);
                const isSelected = album.id === selectedAlbum.id;

                return (
                  <li
                    className={
                      draggingAlbumId === album.id
                        ? "album-list-item is-dragging"
                        : "album-list-item"
                    }
                    key={album.id}
                  >
                    <button
                      className="album-list-button"
                      type="button"
                      draggable
                      disabled={isSavingAlbum || isSavingTrack}
                      aria-current={isSelected ? "true" : undefined}
                      onClick={() => selectAlbum(album.id)}
                      onDragStart={(event) => startAlbumDrag(event, album.id)}
                      onDragEnd={() => setDraggingAlbumId(undefined)}
                    >
                      <span className="album-monogram" aria-hidden="true">
                        {album.title.slice(0, 1)}
                      </span>
                      <span className="album-list-copy">
                        <strong>{album.title}</strong>
                        <span>{tracks.length} 首</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>

          <AlbumDetail
            album={selectedAlbum}
            catalog={catalog}
            audioBindings={audioBindings}
            pendingAudioTrackIds={pendingAudioTrackIds}
            audioLibraryStatus={audioLibraryStatus}
            draggingTrackId={draggingTrackId}
            catalogLibraryStatus={catalogLibraryStatus}
            isSavingAlbum={isSavingAlbum}
            isSavingTrack={isSavingTrack}
            editorTarget={editorTarget}
            canOpenEditor={
              editorTarget === undefined &&
              !isSavingAlbum &&
              !isSavingTrack &&
              catalogLibraryStatus === "ready" &&
              catalog.artists.some((artist) => artist.id === selectedAlbum.artistId)
            }
            canResetAlbum={resettableAlbumIds.has(selectedAlbum.id)}
            resettableTrackIds={resettableTrackIds}
            onAddTrack={onAddTrack}
            onAddAlbum={onAddAlbum}
            onOpenAlbumEditor={() =>
              setEditorTarget({
                kind: "edit-album",
                albumId: selectedAlbum.id
              })
            }
            onOpenCreateTrack={() =>
              setEditorTarget({
                kind: "create-track",
                albumId: selectedAlbum.id
              })
            }
            onOpenTrackEditor={(trackId) =>
              setEditorTarget({
                kind: "edit-track",
                albumId: selectedAlbum.id,
                trackId
              })
            }
            onCloseEditor={() => setEditorTarget(undefined)}
            onCreateTrack={(draft) => onCreateTrack(selectedAlbum.id, draft)}
            onUpdateAlbum={(draft) => onUpdateAlbum(selectedAlbum.id, draft)}
            onUpdateTrack={onUpdateTrack}
            onResetAlbum={() => onResetAlbum(selectedAlbum.id)}
            onResetTrack={onResetTrack}
            onSaved={() => setEditorTarget(undefined)}
            onBindAudio={onBindAudio}
            onRequestAudioAccess={onRequestAudioAccess}
            onUnbindAudio={onUnbindAudio}
            canDelete={canDelete && !isDeleting}
            onRequestDeletion={requestDeletion}
            onTrackDragStart={startTrackDrag}
            onTrackDragEnd={() => setDraggingTrackId(undefined)}
          />
        </div>
      ) : (
        <div className="catalog-empty">
          <p className="muted">尚未维护专辑数据，可以先新增一张空专辑。</p>
        </div>
      )}

      {pendingDeletion && (
        <CatalogDeletionDialog
          preview={pendingDeletion}
          isDeleting={isDeleting}
          errorMessage={deletionDialogError}
          onCancel={() => {
            if (!isDeleting) {
              setPendingDeletion(undefined);
              setDeletionDialogError(undefined);
            }
          }}
          onConfirm={() => void confirmDeletion()}
        />
      )}
    </div>
  );
}

interface CatalogLibraryNoticeProps {
  status: CatalogLibraryStatus;
  errorMessage?: string;
}

function CatalogLibraryNotice({ status, errorMessage }: CatalogLibraryNoticeProps) {
  if (status === "error" && errorMessage) {
    return (
      <p className="local-audio-error catalog-library-error" role="status">
        {errorMessage}
      </p>
    );
  }

  if (status === "loading") {
    return (
      <p className="catalog-library-status" role="status">
        正在读取用户目录，当前先显示内置目录。
      </p>
    );
  }

  return null;
}

interface AlbumDetailProps {
  album: Album;
  catalog: CatalogData;
  audioBindings: ReadonlyMap<EntityId, LocalAudioFileRecord>;
  pendingAudioTrackIds: ReadonlySet<EntityId>;
  audioLibraryStatus: LocalAudioLibraryStatus;
  draggingTrackId?: EntityId;
  catalogLibraryStatus: CatalogLibraryStatus;
  isSavingAlbum: boolean;
  isSavingTrack: boolean;
  editorTarget?: CatalogEditorTarget;
  canOpenEditor: boolean;
  canResetAlbum: boolean;
  resettableTrackIds: ReadonlySet<EntityId>;
  onAddTrack: (trackId: EntityId) => void;
  onAddAlbum: (albumId: EntityId) => void;
  onOpenAlbumEditor: () => void;
  onOpenCreateTrack: () => void;
  onOpenTrackEditor: (trackId: EntityId) => void;
  onCloseEditor: () => void;
  onCreateTrack: (draft: CatalogTrackDraft) => Promise<CatalogTrackCreationResult>;
  onUpdateAlbum: (draft: CatalogAlbumUpdateDraft) => Promise<CatalogMutationResult>;
  onUpdateTrack: (
    trackId: EntityId,
    draft: CatalogTrackUpdateDraft
  ) => Promise<CatalogMutationResult>;
  onResetAlbum: () => Promise<CatalogMutationResult>;
  onResetTrack: (trackId: EntityId) => Promise<CatalogMutationResult>;
  onSaved: () => void;
  onBindAudio: (trackId: EntityId, file: File) => Promise<boolean>;
  onRequestAudioAccess: (trackId: EntityId) => Promise<boolean>;
  onUnbindAudio: (trackId: EntityId) => Promise<boolean>;
  canDelete: boolean;
  onRequestDeletion: (target: CatalogDeletionTarget) => void;
  onTrackDragStart: (event: DragEvent<HTMLDivElement>, trackId: EntityId) => void;
  onTrackDragEnd: () => void;
}

function AlbumDetail({
  album,
  catalog,
  audioBindings,
  pendingAudioTrackIds,
  audioLibraryStatus,
  draggingTrackId,
  catalogLibraryStatus,
  isSavingAlbum,
  isSavingTrack,
  editorTarget,
  canOpenEditor,
  canResetAlbum,
  resettableTrackIds,
  onAddTrack,
  onAddAlbum,
  onOpenAlbumEditor,
  onOpenCreateTrack,
  onOpenTrackEditor,
  onCloseEditor,
  onCreateTrack,
  onUpdateAlbum,
  onUpdateTrack,
  onResetAlbum,
  onResetTrack,
  onSaved,
  onBindAudio,
  onRequestAudioAccess,
  onUnbindAudio,
  canDelete,
  onRequestDeletion,
  onTrackDragStart,
  onTrackDragEnd
}: AlbumDetailProps) {
  const tracks = getAlbumTracks(catalog, album);
  const artist = catalog.artists.find((item) => item.id === album.artistId);
  const [openActionsAlbumId, setOpenActionsAlbumId] = useState<EntityId>();
  const isAlbumEditorOpen =
    editorTarget?.kind === "edit-album" && editorTarget.albumId === album.id;
  const isTrackCreatorOpen =
    editorTarget?.kind === "create-track" && editorTarget.albumId === album.id;
  const editedTrack =
    editorTarget?.kind === "edit-track" && editorTarget.albumId === album.id
      ? tracks.find((track) => track.id === editorTarget.trackId)
      : undefined;

  return (
    <section className="album-detail" aria-labelledby="album-detail-heading">
      <header className="album-detail-header">
        <div className="album-detail-monogram" aria-hidden="true">
          {album.title.slice(0, 1)}
        </div>
        <div className="album-detail-copy">
          <p className="eyebrow">{albumTypeLabels[album.type]}</p>
          <h3 id="album-detail-heading">{album.title}</h3>
          <p className="album-meta">
            <span>{tracks.length} 首歌曲</span>
          </p>
        </div>
        <div className="album-detail-actions">
          <button
            className="secondary-button add-album-button"
            type="button"
            onClick={() => onAddAlbum(album.id)}
          >
            整张加入
          </button>
          <AlbumActionsMenu
            albumId={album.id}
            albumTitle={album.title}
            isOpen={openActionsAlbumId === album.id}
            isDisabled={catalogLibraryStatus !== "ready" && !canDelete}
            canEdit={canOpenEditor && catalogLibraryStatus === "ready"}
            canDelete={canDelete}
            onOpenChange={(isOpen) =>
              setOpenActionsAlbumId(isOpen ? album.id : undefined)
            }
            onEdit={onOpenAlbumEditor}
            onAddTrack={onOpenCreateTrack}
            onDelete={() => onRequestDeletion({ kind: "album", id: album.id })}
          />
        </div>
      </header>

      {isAlbumEditorOpen && artist && (
        <CatalogEditor
          key={`edit-album-${album.id}`}
          mode="edit"
          album={album}
          artistName={artist.name}
          isSaving={isSavingAlbum}
          onCancel={onCloseEditor}
          onSubmit={onUpdateAlbum}
          onSaved={onSaved}
          {...(canResetAlbum ? { onReset: onResetAlbum } : {})}
        />
      )}

      {isTrackCreatorOpen && artist && (
        <CatalogTrackEditor
          key={`create-track-${album.id}`}
          mode="create"
          albumTitle={album.title}
          artistName={artist.name}
          isSaving={isSavingTrack}
          onCancel={onCloseEditor}
          onSubmit={onCreateTrack}
          onCreated={onSaved}
        />
      )}

      {editedTrack && artist && (
        <CatalogTrackEditor
          key={`edit-track-${editedTrack.id}`}
          mode="edit"
          track={editedTrack}
          albumTitle={album.title}
          artistName={artist.name}
          isSaving={isSavingTrack}
          onCancel={onCloseEditor}
          onSubmit={(draft) => onUpdateTrack(editedTrack.id, draft)}
          onSaved={onSaved}
          {...(resettableTrackIds.has(editedTrack.id)
            ? { onReset: () => onResetTrack(editedTrack.id) }
            : {})}
        />
      )}

      {album.note && <p className="album-note">{album.note}</p>}

      {tracks.length > 0 ? (
        <ol className="album-track-list">
          {tracks.map((track) => (
            <TrackRow
              key={track.id}
              track={track}
              album={album}
              audioBinding={audioBindings.get(track.id)}
              audioLibraryStatus={audioLibraryStatus}
              isAudioPending={pendingAudioTrackIds.has(track.id)}
              isDragging={track.id === draggingTrackId}
              canEdit={canOpenEditor}
              onEdit={() => onOpenTrackEditor(track.id)}
              onAdd={() => onAddTrack(track.id)}
              onBindAudio={(file) => onBindAudio(track.id, file)}
              onRequestAudioAccess={() => onRequestAudioAccess(track.id)}
              onUnbindAudio={() => onUnbindAudio(track.id)}
              canDelete={canDelete}
              onRequestDeletion={() =>
                onRequestDeletion({ kind: "track", id: track.id })
              }
              onDragStart={(event) => onTrackDragStart(event, track.id)}
              onDragEnd={onTrackDragEnd}
            />
          ))}
        </ol>
      ) : (
        <p className="catalog-empty-message">这张专辑尚未维护歌曲数据。</p>
      )}
    </section>
  );
}

interface AlbumActionsMenuProps {
  albumId: EntityId;
  albumTitle: string;
  isOpen: boolean;
  isDisabled: boolean;
  canEdit: boolean;
  canDelete: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onEdit: () => void;
  onAddTrack: () => void;
  onDelete: () => void;
}

interface AlbumMenuPosition {
  top: number;
  left: number;
  openAbove: boolean;
}

function AlbumActionsMenu({
  albumId,
  albumTitle,
  isOpen,
  isDisabled,
  canEdit,
  canDelete,
  onOpenChange,
  onEdit,
  onAddTrack,
  onDelete
}: AlbumActionsMenuProps) {
  const popoverId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<AlbumMenuPosition>();

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (
        event.target instanceof Node &&
        !triggerRef.current?.contains(event.target) &&
        !popoverRef.current?.contains(event.target)
      ) {
        onOpenChange(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onOpenChange(false);
        triggerRef.current?.focus();
      }
    }

    function handleViewportChange() {
      onOpenChange(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("scroll", handleViewportChange, true);
    window.addEventListener("resize", handleViewportChange);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("scroll", handleViewportChange, true);
      window.removeEventListener("resize", handleViewportChange);
    };
  }, [isOpen, onOpenChange]);

  function toggleMenu() {
    if (isOpen) {
      onOpenChange(false);
      return;
    }

    const anchorBounds = triggerRef.current?.getBoundingClientRect();
    if (!anchorBounds) {
      return;
    }

    setPosition(getAlbumMenuPosition(anchorBounds));
    onOpenChange(true);
  }

  function runAction(action: () => void) {
    onOpenChange(false);
    action();
  }

  return (
    <>
      <button
        className="icon-button album-menu-trigger"
        ref={triggerRef}
        type="button"
        disabled={isDisabled}
        aria-label={`打开${albumTitle}的更多操作`}
        aria-controls={popoverId}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        title="更多操作"
        onClick={toggleMenu}
      >
        ⋯
      </button>

      {isOpen &&
        position &&
        createPortal(
          <div
            className="album-actions-menu-popover"
            id={popoverId}
            ref={popoverRef}
            role="dialog"
            aria-label={`${albumTitle}的专辑操作`}
            data-album-id={albumId}
            style={{
              top: position.top,
              left: position.left,
              transform: position.openAbove ? "translateY(-100%)" : undefined
            }}
          >
            <div className="album-menu-actions">
              <button
                type="button"
                disabled={!canEdit}
                onClick={() => runAction(onEdit)}
              >
                编辑专辑
              </button>
              <button
                type="button"
                disabled={!canEdit}
                onClick={() => runAction(onAddTrack)}
              >
                添加歌曲
              </button>
              {canDelete && (
                <button
                  className="album-menu-delete"
                  type="button"
                  aria-label={`从目录删除专辑${albumTitle}`}
                  onClick={() => runAction(onDelete)}
                >
                  删除专辑
                </button>
              )}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}

function getAlbumMenuPosition(anchorBounds: DOMRect): AlbumMenuPosition {
  const viewportPadding = 8;
  const menuGap = 6;
  const menuWidth = 180;
  const estimatedMenuHeight = 126;
  const availableBelow = window.innerHeight - anchorBounds.bottom;
  const openAbove =
    availableBelow < estimatedMenuHeight + viewportPadding &&
    anchorBounds.top >= estimatedMenuHeight + viewportPadding;
  const maximumLeft = Math.max(
    viewportPadding,
    window.innerWidth - menuWidth - viewportPadding
  );

  return {
    top: openAbove ? anchorBounds.top - menuGap : anchorBounds.bottom + menuGap,
    left: Math.min(
      Math.max(viewportPadding, anchorBounds.right - menuWidth),
      maximumLeft
    ),
    openAbove
  };
}

interface TrackRowProps {
  track: Track;
  album: Album;
  audioBinding?: LocalAudioFileRecord;
  audioLibraryStatus: LocalAudioLibraryStatus;
  isAudioPending: boolean;
  isDragging: boolean;
  canEdit: boolean;
  onEdit: () => void;
  onAdd: () => void;
  onBindAudio: (file: File) => Promise<boolean>;
  onRequestAudioAccess: () => Promise<boolean>;
  onUnbindAudio: () => Promise<boolean>;
  canDelete: boolean;
  onRequestDeletion: () => void;
  onDragStart: (event: DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
}

function TrackRow({
  track,
  album,
  audioBinding,
  audioLibraryStatus,
  isAudioPending,
  isDragging,
  canEdit,
  onEdit,
  onAdd,
  onBindAudio,
  onRequestAudioAccess,
  onUnbindAudio,
  canDelete,
  onRequestDeletion,
  onDragStart,
  onDragEnd
}: TrackRowProps) {
  const hasTrackNumber = Number.isInteger(track.trackNumber);
  const bindingStatusLabel = getBindingStatusLabel(audioLibraryStatus, audioBinding);
  const [isActionsMenuOpen, setIsActionsMenuOpen] = useState(false);

  return (
    <li className={isDragging ? "is-dragging" : undefined}>
      <div
        className="track-drag-source"
        draggable
        title={`拖动${track.title}到临时歌单`}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      >
        <span className="track-drag-handle" aria-hidden="true">
          ⠿
        </span>
        <span
          className="track-number"
          aria-label={
            hasTrackNumber ? `音轨序号 ${track.trackNumber}` : "音轨序号待维护"
          }
        >
          {hasTrackNumber ? String(track.trackNumber).padStart(2, "0") : "--"}
        </span>
        <div className="track-copy">
          <strong>{track.title}</strong>
          <span>{album.title}</span>
        </div>
      </div>
      <div className="track-actions">
        <span
          className={`binding-status ${audioBinding ? "is-bound" : "is-unbound"}`}
          title={bindingStatusLabel}
        >
          {bindingStatusLabel}
        </span>
        <TrackActionsMenu
          trackTitle={track.title}
          audioBinding={audioBinding}
          audioLibraryStatus={audioLibraryStatus}
          isAudioPending={isAudioPending}
          canEdit={canEdit}
          canDelete={canDelete}
          isOpen={isActionsMenuOpen}
          onOpenChange={setIsActionsMenuOpen}
          onEdit={onEdit}
          onBindAudio={onBindAudio}
          onRequestAudioAccess={onRequestAudioAccess}
          onUnbindAudio={onUnbindAudio}
          onRequestDeletion={onRequestDeletion}
        />
        <button
          className="icon-button add-track-button"
          type="button"
          aria-label={`将${track.title}加入临时歌单`}
          title="加入临时歌单"
          onClick={onAdd}
        >
          +
        </button>
      </div>
    </li>
  );
}

interface TrackActionsMenuProps {
  trackTitle: string;
  audioBinding?: LocalAudioFileRecord;
  audioLibraryStatus: LocalAudioLibraryStatus;
  isAudioPending: boolean;
  canEdit: boolean;
  canDelete: boolean;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onEdit: () => void;
  onBindAudio: (file: File) => Promise<boolean>;
  onRequestAudioAccess: () => Promise<boolean>;
  onUnbindAudio: () => Promise<boolean>;
  onRequestDeletion: () => void;
}

interface TrackMenuPosition {
  top: number;
  left: number;
  openAbove: boolean;
}

function TrackActionsMenu({
  trackTitle,
  audioBinding,
  audioLibraryStatus,
  isAudioPending,
  canEdit,
  canDelete,
  isOpen,
  onOpenChange,
  onEdit,
  onBindAudio,
  onRequestAudioAccess,
  onUnbindAudio,
  onRequestDeletion
}: TrackActionsMenuProps) {
  const popoverId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<TrackMenuPosition>();
  const isAudioLibraryReady = audioLibraryStatus === "ready";
  const needsAudioAccess =
    audioBinding?.storageMethod === "file-handle" &&
    audioBinding.status === "permission_required";

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (
        event.target instanceof Node &&
        !triggerRef.current?.contains(event.target) &&
        !popoverRef.current?.contains(event.target)
      ) {
        onOpenChange(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onOpenChange(false);
        triggerRef.current?.focus();
      }
    }

    function handleViewportChange() {
      onOpenChange(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("scroll", handleViewportChange, true);
    window.addEventListener("resize", handleViewportChange);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("scroll", handleViewportChange, true);
      window.removeEventListener("resize", handleViewportChange);
    };
  }, [isOpen, onOpenChange]);

  function toggleMenu() {
    if (isOpen) {
      onOpenChange(false);
      return;
    }

    const anchorBounds = triggerRef.current?.getBoundingClientRect();
    if (!anchorBounds) {
      return;
    }

    setPosition(getTrackMenuPosition(anchorBounds));
    onOpenChange(true);
  }

  function runAction(action: () => void) {
    onOpenChange(false);
    action();
  }

  function handleAudioFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";

    if (!file) {
      return;
    }

    onOpenChange(false);
    void onBindAudio(file);
  }

  return (
    <>
      <button
        className="icon-button track-menu-trigger"
        ref={triggerRef}
        type="button"
        aria-label={`打开目录歌曲${trackTitle}的更多操作`}
        aria-controls={popoverId}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        title="更多操作"
        onClick={toggleMenu}
      >
        ⋯
      </button>

      {isOpen &&
        position &&
        createPortal(
          <div
            className="track-actions-menu-popover"
            id={popoverId}
            ref={popoverRef}
            role="dialog"
            aria-label={`${trackTitle}的目录歌曲操作`}
            style={{
              top: position.top,
              left: position.left,
              transform: position.openAbove ? "translateY(-100%)" : undefined
            }}
          >
            <div className="track-menu-actions">
              <button
                type="button"
                disabled={!canEdit}
                aria-label={`编辑${trackTitle}的元数据`}
                onClick={() => runAction(onEdit)}
              >
                编辑元数据
              </button>
              <label
                className={`audio-file-picker ${
                  !isAudioLibraryReady || isAudioPending ? "is-disabled" : ""
                }`}
              >
                <span>
                  {isAudioPending
                    ? "处理中…"
                    : audioBinding
                      ? "更换本地音频"
                      : "绑定本地音频"}
                </span>
                <input
                  className="visually-hidden"
                  type="file"
                  accept={LOCAL_AUDIO_FILE_ACCEPT}
                  disabled={!isAudioLibraryReady || isAudioPending}
                  aria-label={`为${trackTitle}选择本地音频文件`}
                  onChange={handleAudioFileChange}
                />
              </label>
              {needsAudioAccess ? (
                <button
                  type="button"
                  disabled={isAudioPending}
                  aria-label={`重新授权读取${trackTitle}的原文件`}
                  onClick={() => runAction(() => void onRequestAudioAccess())}
                >
                  重新授权
                </button>
              ) : null}
              {audioBinding ? (
                <button
                  type="button"
                  disabled={isAudioPending}
                  aria-label={`解除${trackTitle}的本地音频绑定`}
                  onClick={() => runAction(() => void onUnbindAudio())}
                >
                  解绑本地音频
                </button>
              ) : null}
              {canDelete ? (
                <button
                  className="track-menu-delete"
                  type="button"
                  aria-label={`从目录删除歌曲${trackTitle}`}
                  onClick={() => runAction(onRequestDeletion)}
                >
                  删除歌曲
                </button>
              ) : null}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}

function getTrackMenuPosition(anchorBounds: DOMRect): TrackMenuPosition {
  const viewportPadding = 8;
  const menuGap = 6;
  const menuWidth = 210;
  const estimatedMenuHeight = 230;
  const availableBelow = window.innerHeight - anchorBounds.bottom;
  const openAbove =
    availableBelow < estimatedMenuHeight + viewportPadding &&
    anchorBounds.top >= estimatedMenuHeight + viewportPadding;
  const maximumLeft = Math.max(
    viewportPadding,
    window.innerWidth - menuWidth - viewportPadding
  );

  return {
    top: openAbove ? anchorBounds.top - menuGap : anchorBounds.bottom + menuGap,
    left: Math.min(
      Math.max(viewportPadding, anchorBounds.right - menuWidth),
      maximumLeft
    ),
    openAbove
  };
}

interface CatalogDeletionDialogProps {
  preview: CatalogDeletionPreview;
  isDeleting: boolean;
  errorMessage?: string;
  onCancel: () => void;
  onConfirm: () => void;
}

function CatalogDeletionDialog({
  preview,
  isDeleting,
  errorMessage,
  onCancel,
  onConfirm
}: CatalogDeletionDialogProps) {
  return (
    <section className="catalog-deletion-dialog" role="dialog" aria-modal="true">
      <h3>删除确认</h3>
      <p>
        即将删除“{preview.targetTitle}”。此操作会移除浏览器中的相关歌单项和
        本地音频绑定，无法撤销。
      </p>
      <ul>
        <li>{preview.trackCount} 首歌曲</li>
        <li>{preview.playlistItemCount} 个临时歌单项（含重复项）</li>
        <li>{preview.audioBindingCount} 个本地音频绑定</li>
      </ul>
      {errorMessage && (
        <p className="catalog-editor-save-error" role="alert">
          {errorMessage}
        </p>
      )}
      <div className="catalog-editor-actions">
        <button
          className="text-button"
          type="button"
          disabled={isDeleting}
          onClick={onCancel}
        >
          取消
        </button>
        <button
          className="secondary-button"
          type="button"
          disabled={isDeleting}
          onClick={onConfirm}
        >
          {isDeleting ? "处理中…" : "确认删除"}
        </button>
      </div>
    </section>
  );
}

function getBindingStatusLabel(
  status: LocalAudioLibraryStatus,
  binding: LocalAudioFileRecord | undefined
): string {
  if (status === "loading") {
    return "正在读取音频映射";
  }

  if (status === "error") {
    return "本地音频映射不可用";
  }

  if (binding) {
    if (binding.status === "permission_required") {
      return `需要重新授权：${binding.fileName}`;
    }
    if (binding.status === "missing") {
      return `原文件不可用：${binding.fileName}`;
    }
    if (binding.storageMethod === "file-handle") {
      return `已引用原文件：${binding.fileName}`;
    }
    return `已绑定：${binding.fileName}`;
  }

  return "未绑定音频文件";
}
