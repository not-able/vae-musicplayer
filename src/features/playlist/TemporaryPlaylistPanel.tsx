import {
  useEffect,
  useId,
  useRef,
  useState,
  type DragEvent as ReactDragEvent
} from "react";
import { createPortal } from "react-dom";

import type { EntityId, TemporaryPlaylist, Track } from "../../types";
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
      aria-label="临时歌单放置区域"
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

      {playlist.itemIds.length > 0 ? (
        <div
          className="queue-list"
          ref={queueListRef}
          role="list"
          aria-label="临时歌单歌曲"
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
                松开后排在第 {queuePreviewOrderById.get(draggingQueueItemId)! + 1} 首
              </p>
            </article>
          )}
        </div>
      ) : (
        <div className="queue-empty">
          <strong>临时歌单为空</strong>
          <p>从专辑目录加入单曲或整张专辑。</p>
        </div>
      )}
    </div>
  );
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
