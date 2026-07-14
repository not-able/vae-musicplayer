import { useEffect, useRef, useState, type DragEvent as ReactDragEvent } from "react";

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
  moveItem
} from "../../utils/playlist";
import { findQueueInsertionIndex } from "./queueDrag";

interface TemporaryPlaylistPanelProps {
  playlist: TemporaryPlaylist;
  tracks: Track[];
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

      if (!dataTransfer || !hasPlaylistItemDragData(dataTransfer)) {
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
  }, [onRemove, playlist.itemsById]);

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
    const dragKind = getCatalogDragKind(event.dataTransfer);

    if (!dragKind) {
      return;
    }

    event.preventDefault();
    catalogDragEnterDepth.current += 1;
    setCatalogDragKindOver(dragKind);
  }

  function handleDragOver(event: ReactDragEvent<HTMLDivElement>) {
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
    if (!getCatalogDragKind(event.dataTransfer)) {
      return;
    }

    catalogDragEnterDepth.current = Math.max(0, catalogDragEnterDepth.current - 1);

    if (catalogDragEnterDepth.current === 0) {
      setCatalogDragKindOver(undefined);
    }
  }

  function handleDrop(event: ReactDragEvent<HTMLDivElement>) {
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
    writePlaylistItemDragData(event.dataTransfer, itemId);
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
        </div>
        <div className="playlist-heading-actions">
          <span className="pill" aria-live="polite">
            {playlist.itemIds.length} 首 · {playSequence.length} 次
          </span>
          <button
            className="text-button danger-button"
            type="button"
            disabled={playlist.itemIds.length === 0}
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
                <div
                  className="queue-item-copy"
                  draggable
                  title={`拖动${track?.title ?? "歌曲"}调整顺序或移出歌单`}
                  onDragStart={(event) => handleQueueItemDragStart(event, itemId)}
                  onDragEnd={resetQueueDragState}
                >
                  <span className="queue-drag-handle" aria-hidden="true">
                    ⠿
                  </span>
                  <h3>{track?.title ?? "未知歌曲"}</h3>
                </div>

                <div className="queue-item-controls">
                  <div className="repeat-control">
                    <span className="repeat-stepper">
                      <button
                        type="button"
                        aria-label={`减少${track?.title ?? "歌曲"}的播放次数`}
                        disabled={item.repeatCount <= 1}
                        onClick={() =>
                          onRepeatCountChange(itemId, item.repeatCount - 1)
                        }
                      >
                        −
                      </button>
                      <input
                        type="number"
                        min="1"
                        max={MAX_REPEAT_COUNT}
                        inputMode="numeric"
                        aria-label={`${track?.title ?? "歌曲"}的播放次数`}
                        value={item.repeatCount}
                        onChange={(event) =>
                          onRepeatCountChange(itemId, Number(event.currentTarget.value))
                        }
                      />
                      <button
                        type="button"
                        aria-label={`增加${track?.title ?? "歌曲"}的播放次数`}
                        disabled={item.repeatCount >= MAX_REPEAT_COUNT}
                        onClick={() =>
                          onRepeatCountChange(itemId, item.repeatCount + 1)
                        }
                      >
                        +
                      </button>
                    </span>
                  </div>

                  <div className="queue-item-actions">
                    <div className="queue-order-actions" aria-label="调整播放顺序">
                      <button
                        className="icon-button"
                        type="button"
                        aria-label={`上移${track?.title ?? "歌曲"}`}
                        title="上移"
                        disabled={index === 0}
                        onClick={() => onMove(itemId, index - 1)}
                      >
                        ↑
                      </button>
                      <button
                        className="icon-button"
                        type="button"
                        aria-label={`下移${track?.title ?? "歌曲"}`}
                        title="下移"
                        disabled={index === playlist.itemIds.length - 1}
                        onClick={() => onMove(itemId, index + 1)}
                      >
                        ↓
                      </button>
                    </div>
                    <button
                      className="icon-button remove-button"
                      type="button"
                      aria-label={`删除${track?.title ?? "未知歌曲"}`}
                      title="从临时歌单删除"
                      onClick={() => onRemove(itemId)}
                    >
                      ×
                    </button>
                  </div>
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
