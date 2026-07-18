import {
  useEffect,
  useId,
  useRef,
  useState,
  type DragEvent as ReactDragEvent
} from "react";
import { createPortal } from "react-dom";

import type {
  EntityId,
  PlaybackSource,
  PlaylistDocument,
  PlaylistSelection,
  TemporaryPlaylist,
  Track
} from "../../types";
import {
  hasAlbumDragData,
  hasPlaylistItemDragData,
  hasTrackDragData,
  readAlbumDragData,
  readPlaylistItemDragData,
  readTrackDragData,
  writePlaylistItemDragData
} from "../../utils/albumDrag";
import {
  expandPlaylistToPlaySequence,
  MAX_REPEAT_COUNT,
  moveItem,
  parseRepeatCountInput,
  type RepeatCountInputResult
} from "../../utils/playlist";
import { findQueueInsertionIndex } from "./queueDrag";

interface TemporaryPlaylistPanelProps {
  playlist: TemporaryPlaylist;
  tracks: Track[];
  canMutate: boolean;
  persistenceStatus: "loading" | "ready" | "error";
  persistenceLoadingMessage?: string;
  persistenceNotice?: string;
  persistenceError?: string;
  selectedPlaylist: PlaylistSelection;
  savedPlaylists: readonly PlaylistDocument[];
  playbackSource: PlaybackSource | null;
  onSelectPlaylist: (selection: PlaylistSelection) => void;
  onCreateSavedPlaylist: (name: string) => void;
  onRenameSavedPlaylist: (playlistId: EntityId, name: string) => void;
  onDeleteSavedPlaylist: (playlistId: EntityId) => void;
  onPlayItem: (itemId: EntityId) => void;
  onRepeatCountChange: (itemId: EntityId, repeatCount: number) => void;
  onRemove: (itemId: EntityId) => void;
  onClear: () => void;
  onMove: (itemId: EntityId, toIndex: number) => void;
  onAddTrack: (trackId: EntityId) => void;
  onAddAlbum: (albumId: EntityId) => void;
}

type CatalogDragKind = "album" | "track";

export function TemporaryPlaylistPanel({
  playlist,
  tracks,
  canMutate,
  persistenceStatus,
  persistenceLoadingMessage,
  persistenceNotice,
  persistenceError,
  selectedPlaylist,
  savedPlaylists,
  playbackSource,
  onSelectPlaylist,
  onCreateSavedPlaylist,
  onRenameSavedPlaylist,
  onDeleteSavedPlaylist,
  onPlayItem,
  onRepeatCountChange,
  onRemove,
  onClear,
  onMove,
  onAddTrack,
  onAddAlbum
}: TemporaryPlaylistPanelProps) {
  const [catalogDragKindOver, setCatalogDragKindOver] = useState<CatalogDragKind>();
  const [draggingQueueItemId, setDraggingQueueItemId] = useState<EntityId>();
  const [queuePreviewToIndex, setQueuePreviewToIndex] = useState<number>();
  const [isQueueDragOutside, setIsQueueDragOutside] = useState(false);
  const [openQueueMenuItemId, setOpenQueueMenuItemId] = useState<EntityId>();
  const [openSavedPlaylistMenuId, setOpenSavedPlaylistMenuId] = useState<EntityId>();
  const [playlistNameDialog, setPlaylistNameDialog] = useState<
    | { kind: "create"; initialName: string; returnFocusTarget: HTMLElement | null }
    | {
        kind: "rename";
        playlistId: EntityId;
        initialName: string;
        returnFocusTarget: HTMLElement | null;
      }
  >();
  const catalogDragEnterDepth = useRef(0);
  const draggingQueueItemIdRef = useRef<EntityId | undefined>(undefined);
  const panelRef = useRef<HTMLDivElement>(null);
  const queueListRef = useRef<HTMLDivElement>(null);
  const previousItemCount = useRef(playlist.itemIds.length);
  const tracksById = new Map(tracks.map((track) => [track.id, track]));
  const playSequence = expandPlaylistToPlaySequence(playlist);
  const queueOrderPreview = createQueueOrderPreview(
    playlist.itemIds,
    draggingQueueItemId,
    queuePreviewToIndex
  );
  const queuePreviewOrderById = queueOrderPreview
    ? new Map(queueOrderPreview.map((itemId, index) => [itemId, index]))
    : undefined;

  useEffect(() => {
    function resetDragState() {
      catalogDragEnterDepth.current = 0;
      draggingQueueItemIdRef.current = undefined;
      setCatalogDragKindOver(undefined);
      setDraggingQueueItemId(undefined);
      setQueuePreviewToIndex(undefined);
      setIsQueueDragOutside(false);
    }

    window.addEventListener("dragend", resetDragState);

    return () => window.removeEventListener("dragend", resetDragState);
  }, []);

  useEffect(() => {
    function isInsidePlaylist(target: EventTarget | null) {
      return target instanceof Node && Boolean(panelRef.current?.contains(target));
    }

    function handleDocumentDragOver(event: globalThis.DragEvent) {
      const { dataTransfer } = event;

      if (!canMutate || !dataTransfer || !hasPlaylistItemDragData(dataTransfer)) {
        return;
      }

      event.preventDefault();
      dataTransfer.dropEffect = "move";

      if (isInsidePlaylist(event.target)) {
        setIsQueueDragOutside(false);
      } else {
        setIsQueueDragOutside(true);
        setQueuePreviewToIndex(undefined);
      }
    }

    function handleDocumentDrop(event: globalThis.DragEvent) {
      const { dataTransfer } = event;

      if (
        !canMutate ||
        !dataTransfer ||
        !hasPlaylistItemDragData(dataTransfer) ||
        isInsidePlaylist(event.target)
      ) {
        return;
      }

      const itemId = readPlaylistItemDragData(dataTransfer);

      event.preventDefault();
      draggingQueueItemIdRef.current = undefined;
      setDraggingQueueItemId(undefined);
      setQueuePreviewToIndex(undefined);
      setIsQueueDragOutside(false);

      if (itemId && playlist.itemsById[itemId]) {
        onRemove(itemId);
      }
    }

    document.addEventListener("dragenter", handleDocumentDragOver, true);
    document.addEventListener("dragover", handleDocumentDragOver, true);
    document.addEventListener("drop", handleDocumentDrop);

    return () => {
      document.removeEventListener("dragenter", handleDocumentDragOver, true);
      document.removeEventListener("dragover", handleDocumentDragOver, true);
      document.removeEventListener("drop", handleDocumentDrop);
    };
  }, [canMutate, onRemove, playlist.itemsById]);

  useEffect(() => {
    if (playlist.itemIds.length > previousItemCount.current) {
      const queueList = queueListRef.current;

      if (queueList) {
        queueList.scrollTop = queueList.scrollHeight;
      }
    }

    previousItemCount.current = playlist.itemIds.length;
  }, [playlist.itemIds.length]);

  function resetCatalogDragState() {
    catalogDragEnterDepth.current = 0;
    setCatalogDragKindOver(undefined);
  }

  function resetQueueDragState() {
    draggingQueueItemIdRef.current = undefined;
    setDraggingQueueItemId(undefined);
    setQueuePreviewToIndex(undefined);
    setIsQueueDragOutside(false);
  }

  function submitPlaylistName(name: string) {
    if (!playlistNameDialog) {
      return;
    }

    if (playlistNameDialog.kind === "create") {
      onCreateSavedPlaylist(name);
    } else {
      onRenameSavedPlaylist(playlistNameDialog.playlistId, name);
    }

    setPlaylistNameDialog(undefined);
  }

  function openPlaylistNameDialog(
    nextDialog:
      | { kind: "create"; initialName: string }
      | { kind: "rename"; playlistId: EntityId; initialName: string },
    returnFocusTarget: HTMLElement | null
  ) {
    setPlaylistNameDialog({ ...nextDialog, returnFocusTarget });
  }

  function handleDragEnter(event: ReactDragEvent<HTMLDivElement>) {
    if (!canMutate) {
      return;
    }

    const dragKind = getCatalogDragKind(event.dataTransfer);

    if (!dragKind) {
      return;
    }

    event.preventDefault();
    catalogDragEnterDepth.current += 1;
    setCatalogDragKindOver(dragKind);
  }

  function handleDragOver(event: ReactDragEvent<HTMLDivElement>) {
    if (!canMutate) {
      return;
    }

    const dragKind = getCatalogDragKind(event.dataTransfer);

    if (dragKind) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
      return;
    }

    if (hasPlaylistItemDragData(event.dataTransfer)) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      setIsQueueDragOutside(false);

      const sourceItemId = draggingQueueItemIdRef.current;
      const toIndex = getQueueDropIndex(event.clientY, sourceItemId);

      if (toIndex !== undefined) {
        setQueuePreviewToIndex((currentIndex) =>
          currentIndex === toIndex ? currentIndex : toIndex
        );
      }
    }
  }

  function handleDragLeave(event: ReactDragEvent<HTMLDivElement>) {
    if (!canMutate) {
      return;
    }

    if (!getCatalogDragKind(event.dataTransfer)) {
      return;
    }

    catalogDragEnterDepth.current = Math.max(0, catalogDragEnterDepth.current - 1);

    if (catalogDragEnterDepth.current === 0) {
      setCatalogDragKindOver(undefined);
    }
  }

  function handleDrop(event: ReactDragEvent<HTMLDivElement>) {
    if (!canMutate) {
      return;
    }

    const dragKind = getCatalogDragKind(event.dataTransfer);

    if (dragKind) {
      const entityId =
        dragKind === "album"
          ? readAlbumDragData(event.dataTransfer)
          : readTrackDragData(event.dataTransfer);

      event.preventDefault();
      resetCatalogDragState();

      if (entityId) {
        if (dragKind === "album") {
          onAddAlbum(entityId);
        } else {
          onAddTrack(entityId);
        }
      }

      return;
    }

    if (!hasPlaylistItemDragData(event.dataTransfer)) {
      return;
    }

    const itemId = readPlaylistItemDragData(event.dataTransfer);
    const toIndex = getQueueDropIndex(event.clientY, itemId);

    event.preventDefault();
    resetQueueDragState();

    if (itemId && toIndex !== undefined && playlist.itemsById[itemId]) {
      onMove(itemId, toIndex);
    }
  }

  function handleQueueItemDragStart(
    event: ReactDragEvent<HTMLDivElement>,
    itemId: EntityId
  ) {
    if (!canMutate) {
      event.preventDefault();
      return;
    }

    writePlaylistItemDragData(event.dataTransfer, itemId);
    setOpenQueueMenuItemId(undefined);
    draggingQueueItemIdRef.current = itemId;
    setDraggingQueueItemId(itemId);
    setQueuePreviewToIndex(undefined);
    setIsQueueDragOutside(false);
  }

  function getQueueDropIndex(
    pointerY: number,
    sourceItemId: EntityId | undefined
  ): number | undefined {
    const queueList = queueListRef.current;

    if (!queueList || !sourceItemId || !playlist.itemsById[sourceItemId]) {
      return undefined;
    }

    const itemMidpoints = Array.from(
      queueList.querySelectorAll<HTMLElement>("[data-queue-item-id]")
    )
      .filter((item) => item.dataset.queueItemId !== sourceItemId)
      .map((item) => {
        const bounds = item.getBoundingClientRect();
        return bounds.top + bounds.height / 2;
      })
      .sort((first, second) => first - second);

    return findQueueInsertionIndex(pointerY, itemMidpoints);
  }

  const panelClassName = [
    "playlist-panel",
    catalogDragKindOver && "is-catalog-drag-over",
    isQueueDragOutside && "is-queue-drag-outside"
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={panelClassName}
      ref={panelRef}
      aria-label={`${playlist.name}放置区域`}
      aria-busy={persistenceStatus === "loading" || undefined}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {catalogDragKindOver && (
        <div className="album-drop-feedback" role="status" aria-live="polite">
          <span aria-hidden="true">+</span>
          <strong>
            {catalogDragKindOver === "album"
              ? "松开以加入整张专辑"
              : "松开以加入这首歌曲"}
          </strong>
        </div>
      )}
      {isQueueDragOutside && (
        <div className="queue-remove-feedback" role="status" aria-live="polite">
          <span aria-hidden="true">×</span>
          <strong>在歌单外松开以移除歌曲</strong>
        </div>
      )}
      <div className="section-heading playlist-heading">
        <div>
          <p className="eyebrow">Queue</p>
          <h2 id="playlist-heading">{playlist.name}</h2>
          <p className="playlist-drag-help" id="playlist-drag-help">
            拖动歌曲可排序，拖到歌单外可移除
          </p>
          {persistenceStatus === "loading" && persistenceLoadingMessage && (
            <p className="playlist-persistence-message is-loading" role="status">
              {persistenceLoadingMessage}
            </p>
          )}
          {persistenceNotice && (
            <p className="playlist-persistence-message is-notice" role="status">
              {persistenceNotice}
            </p>
          )}
          {persistenceError && (
            <p className="playlist-persistence-message is-error" role="status">
              {persistenceError}
            </p>
          )}
        </div>
        <div className="playlist-heading-actions">
          <span className="pill" aria-live="polite">
            {playlist.itemIds.length} 首 · {playSequence.length} 次
          </span>
          <button
            className="text-button danger-button"
            type="button"
            disabled={!canMutate || playlist.itemIds.length === 0}
            onClick={onClear}
          >
            清空
          </button>
        </div>
      </div>

      <div className="playlist-content-layout">
        <div className="playlist-queue-content">
          {playlist.itemIds.length > 0 ? (
            <div
              className="queue-list"
              ref={queueListRef}
              role="list"
              aria-label={`${playlist.name}歌曲`}
              aria-describedby="playlist-drag-help"
              tabIndex={0}
            >
              {playlist.itemIds.map((itemId, index) => {
                const item = playlist.itemsById[itemId];

                if (!item) {
                  return null;
                }

                const track = tracksById.get(item.trackId);
                const isPreviewSource =
                  Boolean(queueOrderPreview) && draggingQueueItemId === itemId;
                const queueItemClassName = [
                  "queue-item",
                  draggingQueueItemId === itemId && "is-dragging",
                  isPreviewSource && "is-preview-source"
                ]
                  .filter(Boolean)
                  .join(" ");

                return (
                  <article
                    className={queueItemClassName}
                    key={itemId}
                    data-queue-item-id={itemId}
                    role="listitem"
                    aria-hidden={isPreviewSource || undefined}
                    style={
                      queuePreviewOrderById
                        ? { order: queuePreviewOrderById.get(itemId) }
                        : undefined
                    }
                  >
                    <div className="queue-item-main">
                      <div
                        className="queue-item-copy"
                        draggable={canMutate}
                        title={`拖动${track?.title ?? "歌曲"}调整顺序或移出歌单`}
                        onDragStart={(event) => handleQueueItemDragStart(event, itemId)}
                        onDragEnd={resetQueueDragState}
                      >
                        <span className="queue-drag-handle" aria-hidden="true">
                          ⠿
                        </span>
                        <h3>{track?.title ?? "未知歌曲"}</h3>
                      </div>

                      <span
                        className="queue-repeat-count"
                        aria-label={`播放 ${item.repeatCount} 次`}
                      >
                        ×{item.repeatCount}
                      </span>

                      <button
                        className="icon-button quick-play-button"
                        type="button"
                        aria-label={`播放${track?.title ?? "歌曲"}`}
                        title="播放"
                        onClick={() => onPlayItem(itemId)}
                      >
                        ▶
                      </button>

                      <QueueItemActionsMenu
                        itemId={itemId}
                        trackTitle={track?.title ?? "歌曲"}
                        repeatCount={item.repeatCount}
                        isOpen={canMutate && openQueueMenuItemId === itemId}
                        isDisabled={!canMutate}
                        isFirst={index === 0}
                        isLast={index === playlist.itemIds.length - 1}
                        onOpenChange={(isOpen) =>
                          setOpenQueueMenuItemId(isOpen ? itemId : undefined)
                        }
                        onRepeatCountChange={onRepeatCountChange}
                        onMoveToTop={() => onMove(itemId, 0)}
                        onMoveUp={() => onMove(itemId, index - 1)}
                        onMoveDown={() => onMove(itemId, index + 1)}
                        onRemove={() => onRemove(itemId)}
                      />
                    </div>
                  </article>
                );
              })}
              {queueOrderPreview && draggingQueueItemId && queuePreviewOrderById && (
                <article
                  className="queue-item queue-item-order-ghost"
                  role="listitem"
                  aria-label={`排序预览：${getPlaylistItemTitle(
                    draggingQueueItemId,
                    playlist,
                    tracksById
                  )}将位于第${queuePreviewOrderById.get(draggingQueueItemId)! + 1}首`}
                  style={{ order: queuePreviewOrderById.get(draggingQueueItemId) }}
                >
                  <div className="queue-item-copy">
                    <span className="queue-drag-handle" aria-hidden="true">
                      ⠿
                    </span>
                    <h3>
                      {getPlaylistItemTitle(draggingQueueItemId, playlist, tracksById)}
                    </h3>
                  </div>
                  <p className="queue-item-order-ghost-note">
                    松开后排在第 {queuePreviewOrderById.get(draggingQueueItemId)! + 1}{" "}
                    首
                  </p>
                </article>
              )}
            </div>
          ) : (
            <div className="queue-empty">
              <strong>{playlist.name}为空</strong>
              <p>从专辑目录加入单曲或整张专辑。</p>
            </div>
          )}
        </div>
        <PlaylistLibraryRail
          selectedPlaylist={selectedPlaylist}
          savedPlaylists={savedPlaylists}
          playbackSource={playbackSource}
          canMutate={canMutate}
          openMenuPlaylistId={openSavedPlaylistMenuId}
          onOpenMenuChange={(playlistId) => setOpenSavedPlaylistMenuId(playlistId)}
          onSelectPlaylist={onSelectPlaylist}
          onCreate={(trigger) =>
            openPlaylistNameDialog({ kind: "create", initialName: "" }, trigger)
          }
          onRename={(savedPlaylist, trigger) =>
            openPlaylistNameDialog(
              {
                kind: "rename",
                playlistId: savedPlaylist.id,
                initialName: savedPlaylist.name
              },
              trigger
            )
          }
          onDelete={onDeleteSavedPlaylist}
        />
      </div>
      {playlistNameDialog && (
        <PlaylistNameDialog
          mode={playlistNameDialog.kind}
          initialName={playlistNameDialog.initialName}
          returnFocusTarget={playlistNameDialog.returnFocusTarget}
          onClose={() => setPlaylistNameDialog(undefined)}
          onSubmit={submitPlaylistName}
        />
      )}
    </div>
  );
}

interface PlaylistLibraryRailProps {
  selectedPlaylist: PlaylistSelection;
  savedPlaylists: readonly PlaylistDocument[];
  playbackSource: PlaybackSource | null;
  canMutate: boolean;
  openMenuPlaylistId?: EntityId;
  onOpenMenuChange: (playlistId: EntityId | undefined) => void;
  onSelectPlaylist: (selection: PlaylistSelection) => void;
  onCreate: (trigger: HTMLButtonElement) => void;
  onRename: (playlist: PlaylistDocument, trigger: HTMLElement | null) => void;
  onDelete: (playlistId: EntityId) => void;
}

function PlaylistLibraryRail({
  selectedPlaylist,
  savedPlaylists,
  playbackSource,
  canMutate,
  openMenuPlaylistId,
  onOpenMenuChange,
  onSelectPlaylist,
  onCreate,
  onRename,
  onDelete
}: PlaylistLibraryRailProps) {
  const temporaryTileRef = useRef<HTMLButtonElement>(null);
  const temporaryIsSelected = selectedPlaylist.kind === "temporary";
  const temporaryIsPlaying = playbackSource?.kind === "temporary-playlist";

  function deleteSavedPlaylist(playlistId: EntityId) {
    const wasSelected =
      selectedPlaylist.kind === "saved" && selectedPlaylist.playlistId === playlistId;

    onDelete(playlistId);

    if (wasSelected) {
      queueMicrotask(() => temporaryTileRef.current?.focus());
    }
  }

  return (
    <nav className="playlist-library-rail" aria-label="歌单收藏">
      <button
        className="playlist-library-tile playlist-library-create"
        type="button"
        disabled={!canMutate}
        aria-label="新建已保存歌单"
        title="新建已保存歌单"
        onClick={(event) => onCreate(event.currentTarget)}
      >
        <span aria-hidden="true">＋</span>
      </button>
      <button
        className={getPlaylistTileClassName(
          temporaryIsSelected,
          temporaryIsPlaying,
          true
        )}
        ref={temporaryTileRef}
        type="button"
        aria-current={temporaryIsSelected ? "true" : undefined}
        aria-label="打开临时歌单"
        title="临时歌单"
        onClick={() => onSelectPlaylist({ kind: "temporary" })}
      >
        <span aria-hidden="true">临</span>
        {temporaryIsPlaying && <span className="playlist-playing-marker">▶</span>}
      </button>
      {savedPlaylists.map((savedPlaylist) => {
        const isSelected =
          selectedPlaylist.kind === "saved" &&
          selectedPlaylist.playlistId === savedPlaylist.id;
        const isPlaying =
          playbackSource?.kind === "saved-playlist" &&
          playbackSource.playlistId === savedPlaylist.id;

        return (
          <div className="playlist-library-saved-tile" key={savedPlaylist.id}>
            <button
              className={getPlaylistTileClassName(isSelected, isPlaying)}
              type="button"
              aria-current={isSelected ? "true" : undefined}
              aria-label={`打开已保存歌单：${savedPlaylist.name}`}
              title={savedPlaylist.name}
              onClick={() =>
                onSelectPlaylist({ kind: "saved", playlistId: savedPlaylist.id })
              }
            >
              <span aria-hidden="true">{getPlaylistTileLabel(savedPlaylist.name)}</span>
              {isPlaying && <span className="playlist-playing-marker">▶</span>}
            </button>
            <SavedPlaylistActionsMenu
              playlist={savedPlaylist}
              isOpen={openMenuPlaylistId === savedPlaylist.id}
              isDisabled={!canMutate}
              onOpenChange={(isOpen) =>
                onOpenMenuChange(isOpen ? savedPlaylist.id : undefined)
              }
              onRename={(trigger) => onRename(savedPlaylist, trigger)}
              onDelete={() => deleteSavedPlaylist(savedPlaylist.id)}
            />
          </div>
        );
      })}
    </nav>
  );
}

function getPlaylistTileClassName(
  isSelected: boolean,
  isPlaying: boolean,
  isTemporary = false
): string {
  return [
    "playlist-library-tile",
    isTemporary && "is-temporary",
    isSelected && "is-selected",
    isPlaying && "is-playing"
  ]
    .filter(Boolean)
    .join(" ");
}

function getPlaylistTileLabel(name: string): string {
  return Array.from(name.trim()).slice(0, 2).join("") || "歌单";
}

interface SavedPlaylistActionsMenuProps {
  playlist: PlaylistDocument;
  isOpen: boolean;
  isDisabled: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onRename: (trigger: HTMLElement | null) => void;
  onDelete: () => void;
}

interface SavedPlaylistMenuPosition {
  top: number;
  left: number;
  openAbove: boolean;
}

function SavedPlaylistActionsMenu({
  playlist,
  isOpen,
  isDisabled,
  onOpenChange,
  onRename,
  onDelete
}: SavedPlaylistActionsMenuProps) {
  const popoverId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<SavedPlaylistMenuPosition>();

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function closeForViewportChange() {
      onOpenChange(false);
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

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("scroll", closeForViewportChange, true);
    window.addEventListener("resize", closeForViewportChange);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("scroll", closeForViewportChange, true);
      window.removeEventListener("resize", closeForViewportChange);
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

    setPosition(getSavedPlaylistMenuPosition(anchorBounds));
    onOpenChange(true);
  }

  function runAction(action: (trigger: HTMLElement | null) => void) {
    onOpenChange(false);
    action(triggerRef.current);
  }

  return (
    <>
      <button
        className="icon-button saved-playlist-menu-trigger"
        ref={triggerRef}
        type="button"
        disabled={isDisabled}
        aria-label={`打开${playlist.name}的更多操作`}
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
            className="saved-playlist-menu-popover"
            id={popoverId}
            ref={popoverRef}
            role="dialog"
            aria-label={`${playlist.name}的歌单操作`}
            style={{
              top: position.top,
              left: position.left,
              transform: position.openAbove ? "translateY(-100%)" : undefined
            }}
          >
            <button type="button" onClick={() => runAction(onRename)}>
              重命名
            </button>
            <button
              className="saved-playlist-menu-delete"
              type="button"
              onClick={() => runAction(onDelete)}
            >
              删除
            </button>
          </div>,
          document.body
        )}
    </>
  );
}

function getSavedPlaylistMenuPosition(
  anchorBounds: DOMRect
): SavedPlaylistMenuPosition {
  const viewportPadding = 8;
  const menuGap = 6;
  const menuWidth = 148;
  const estimatedMenuHeight = 82;
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

interface PlaylistNameDialogProps {
  mode: "create" | "rename";
  initialName: string;
  returnFocusTarget: HTMLElement | null;
  onClose: () => void;
  onSubmit: (name: string) => void;
}

function PlaylistNameDialog({
  mode,
  initialName,
  returnFocusTarget,
  onClose,
  onSubmit
}: PlaylistNameDialogProps) {
  const titleId = useId();
  const inputId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(initialName);
  const [errorMessage, setErrorMessage] = useState<string>();
  const title = mode === "create" ? "保存当前歌单" : "重命名已保存歌单";

  useEffect(() => {
    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 0);

    function handleDocumentKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    }

    document.addEventListener("keydown", handleDocumentKeyDown);

    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", handleDocumentKeyDown);
      returnFocusTarget?.focus();
    };
  }, [onClose, returnFocusTarget]);

  function submit() {
    const normalizedName = name.trim();

    if (normalizedName.length === 0) {
      setErrorMessage("请输入歌单名称。");
      return;
    }

    onSubmit(normalizedName);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLElement>) {
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

  return createPortal(
    <div
      className="playlist-name-dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section
        className="playlist-name-dialog"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={handleKeyDown}
      >
        <div className="playlist-name-dialog-heading">
          <div>
            <p className="eyebrow">歌单收藏</p>
            <h3 id={titleId}>{title}</h3>
          </div>
          <button
            className="icon-button"
            type="button"
            aria-label={`关闭${title}`}
            title="关闭"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <label className="playlist-name-field" htmlFor={inputId}>
          歌单名称
          <input
            id={inputId}
            ref={inputRef}
            type="text"
            value={name}
            maxLength={48}
            autoComplete="off"
            aria-invalid={Boolean(errorMessage)}
            aria-describedby={errorMessage ? `${inputId}-error` : undefined}
            onChange={(event) => {
              setName(event.currentTarget.value);
              setErrorMessage(undefined);
            }}
          />
        </label>
        {errorMessage && (
          <p className="playlist-name-error" id={`${inputId}-error`} role="alert">
            {errorMessage}
          </p>
        )}
        <div className="playlist-name-dialog-actions">
          <button className="text-button" type="button" onClick={onClose}>
            取消
          </button>
          <button className="primary-button" type="button" onClick={submit}>
            确认
          </button>
        </div>
      </section>
    </div>,
    document.body
  );
}

function getFocusableElements(container: HTMLElement | null): HTMLElement[] {
  if (!container) {
    return [];
  }

  return Array.from(
    container.querySelectorAll<HTMLElement>(
      "button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex='-1'])"
    )
  ).filter((element) => !element.hasAttribute("hidden"));
}

interface RepeatCountControlProps {
  itemId: EntityId;
  trackTitle: string;
  repeatCount: number;
  onRepeatCountChange: (itemId: EntityId, repeatCount: number) => void;
}

interface QueueItemActionsMenuProps extends RepeatCountControlProps {
  isOpen: boolean;
  isDisabled: boolean;
  isFirst: boolean;
  isLast: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onMoveToTop: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
}

interface QueueMenuPosition {
  top: number;
  left: number;
  openAbove: boolean;
}

function QueueItemActionsMenu({
  itemId,
  trackTitle,
  repeatCount,
  isOpen,
  isDisabled,
  isFirst,
  isLast,
  onOpenChange,
  onRepeatCountChange,
  onMoveToTop,
  onMoveUp,
  onMoveDown,
  onRemove
}: QueueItemActionsMenuProps) {
  const popoverId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<QueueMenuPosition>();

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

    setPosition(getQueueMenuPosition(anchorBounds));
    onOpenChange(true);
  }

  function runAction(action: () => void) {
    onOpenChange(false);
    action();
  }

  return (
    <>
      <button
        className="icon-button queue-menu-trigger"
        ref={triggerRef}
        type="button"
        disabled={isDisabled}
        aria-label={`打开${trackTitle}的更多操作`}
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
            className="queue-item-menu-popover"
            id={popoverId}
            ref={popoverRef}
            role="dialog"
            aria-label={`${trackTitle}的歌单项设置`}
            style={{
              top: position.top,
              left: position.left,
              transform: position.openAbove ? "translateY(-100%)" : undefined
            }}
          >
            <RepeatCountControl
              itemId={itemId}
              trackTitle={trackTitle}
              repeatCount={repeatCount}
              onRepeatCountChange={onRepeatCountChange}
            />
            <div className="queue-menu-actions" aria-label="调整歌曲位置">
              <button
                type="button"
                disabled={isFirst}
                aria-label={`置顶${trackTitle}`}
                onClick={() => runAction(onMoveToTop)}
              >
                置顶
              </button>
              <button
                type="button"
                disabled={isFirst}
                aria-label={`上移${trackTitle}`}
                onClick={() => runAction(onMoveUp)}
              >
                上移
              </button>
              <button
                type="button"
                disabled={isLast}
                aria-label={`下移${trackTitle}`}
                onClick={() => runAction(onMoveDown)}
              >
                下移
              </button>
              <button
                className="queue-menu-remove"
                type="button"
                aria-label={`删除${trackTitle}`}
                onClick={() => runAction(onRemove)}
              >
                移除
              </button>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}

function getQueueMenuPosition(anchorBounds: DOMRect): QueueMenuPosition {
  const viewportPadding = 8;
  const menuGap = 6;
  const menuWidth = 220;
  const estimatedMenuHeight = 180;
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

function RepeatCountControl({
  itemId,
  trackTitle,
  repeatCount,
  onRepeatCountChange
}: RepeatCountControlProps) {
  const inputId = useId();
  const errorId = `${inputId}-error`;
  const [invalidDraft, setInvalidDraft] = useState<
    | {
        value: string;
        validationError: RepeatCountInputResult & { isValid: false };
      }
    | undefined
  >();
  const draftValue = invalidDraft?.value ?? String(repeatCount);
  const validationError = invalidDraft?.validationError;

  function commitRepeatCount(nextRepeatCount: number) {
    setInvalidDraft(undefined);
    onRepeatCountChange(itemId, nextRepeatCount);
  }

  function handleInputChange(value: string) {
    const result = parseRepeatCountInput(value);

    if (!result.isValid) {
      setInvalidDraft({ value, validationError: result });
      return;
    }

    setInvalidDraft(undefined);
    onRepeatCountChange(itemId, result.value);
  }

  function resetDraft() {
    setInvalidDraft(undefined);
  }

  return (
    <div className="repeat-control">
      <label className="repeat-label" htmlFor={inputId}>
        播放次数
      </label>
      <span className="repeat-stepper">
        <button
          type="button"
          aria-label={`减少${trackTitle}的播放次数`}
          disabled={repeatCount <= 1}
          onClick={() => commitRepeatCount(repeatCount - 1)}
        >
          −
        </button>
        <input
          id={inputId}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="off"
          spellCheck={false}
          aria-label={`${trackTitle}的播放次数`}
          aria-describedby={validationError ? errorId : undefined}
          aria-invalid={Boolean(validationError)}
          value={draftValue}
          onChange={(event) => handleInputChange(event.currentTarget.value)}
          onBlur={resetDraft}
        />
        <button
          type="button"
          aria-label={`增加${trackTitle}的播放次数`}
          disabled={repeatCount >= MAX_REPEAT_COUNT}
          onClick={() => commitRepeatCount(repeatCount + 1)}
        >
          +
        </button>
      </span>
      <span className="repeat-unit" aria-hidden="true">
        次
      </span>
      {validationError && (
        <p className="repeat-count-error" id={errorId} role="status">
          {getRepeatCountErrorMessage(validationError.reason, repeatCount)}
        </p>
      )}
    </div>
  );
}

function getRepeatCountErrorMessage(
  reason: Extract<RepeatCountInputResult, { isValid: false }>["reason"],
  currentRepeatCount: number
): string {
  const currentValueMessage = `当前仍按 ${currentRepeatCount} 次播放。`;

  switch (reason) {
    case "required":
      return `请输入播放次数，${currentValueMessage}`;
    case "not-positive-integer":
      return `播放次数需要是正整数，${currentValueMessage}`;
    case "exceeds-maximum":
      return `播放次数最多为 ${MAX_REPEAT_COUNT}，${currentValueMessage}`;
  }
}

function getCatalogDragKind(dataTransfer: DataTransfer): CatalogDragKind | undefined {
  if (hasAlbumDragData(dataTransfer)) {
    return "album";
  }

  if (hasTrackDragData(dataTransfer)) {
    return "track";
  }

  return undefined;
}

function createQueueOrderPreview(
  itemIds: EntityId[],
  sourceItemId: EntityId | undefined,
  toIndex: number | undefined
): EntityId[] | undefined {
  if (sourceItemId === undefined || toIndex === undefined) {
    return undefined;
  }

  const fromIndex = itemIds.indexOf(sourceItemId);

  if (fromIndex === -1 || toIndex < 0 || toIndex >= itemIds.length) {
    return undefined;
  }

  return moveItem(itemIds, fromIndex, toIndex);
}

function getPlaylistItemTitle(
  itemId: EntityId,
  playlist: TemporaryPlaylist,
  tracksById: ReadonlyMap<EntityId, Track>
): string {
  const trackId = playlist.itemsById[itemId]?.trackId;

  return (trackId && tracksById.get(trackId)?.title) || "未知歌曲";
}
