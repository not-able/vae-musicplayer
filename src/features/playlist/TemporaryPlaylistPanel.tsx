import { useEffect, useRef, useState, type DragEvent } from "react";

import type { EntityId, TemporaryPlaylist, Track } from "../../types";
import { hasAlbumDragData, readAlbumDragData } from "../../utils/albumDrag";
import { expandPlaylistToPlaySequence, MAX_REPEAT_COUNT } from "../../utils/playlist";

interface TemporaryPlaylistPanelProps {
  playlist: TemporaryPlaylist;
  tracks: Track[];
  onRepeatCountChange: (itemId: EntityId, repeatCount: number) => void;
  onRemove: (itemId: EntityId) => void;
  onClear: () => void;
  onMove: (itemId: EntityId, toIndex: number) => void;
  onAddAlbum: (albumId: EntityId) => void;
}

export function TemporaryPlaylistPanel({
  playlist,
  tracks,
  onRepeatCountChange,
  onRemove,
  onClear,
  onMove,
  onAddAlbum
}: TemporaryPlaylistPanelProps) {
  const [isAlbumDragOver, setIsAlbumDragOver] = useState(false);
  const dragEnterDepth = useRef(0);
  const queueListRef = useRef<HTMLDivElement>(null);
  const previousItemCount = useRef(playlist.itemIds.length);
  const tracksById = new Map(tracks.map((track) => [track.id, track]));
  const playSequence = expandPlaylistToPlaySequence(playlist);

  useEffect(() => {
    function resetAlbumDragState() {
      dragEnterDepth.current = 0;
      setIsAlbumDragOver(false);
    }

    window.addEventListener("dragend", resetAlbumDragState);

    return () => window.removeEventListener("dragend", resetAlbumDragState);
  }, []);

  useEffect(() => {
    if (playlist.itemIds.length > previousItemCount.current) {
      const queueList = queueListRef.current;

      if (queueList) {
        queueList.scrollTop = queueList.scrollHeight;
      }
    }

    previousItemCount.current = playlist.itemIds.length;
  }, [playlist.itemIds.length]);

  function handleDragEnter(event: DragEvent<HTMLDivElement>) {
    if (!hasAlbumDragData(event.dataTransfer)) {
      return;
    }

    event.preventDefault();
    dragEnterDepth.current += 1;
    setIsAlbumDragOver(true);
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    if (!hasAlbumDragData(event.dataTransfer)) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    if (!hasAlbumDragData(event.dataTransfer)) {
      return;
    }

    dragEnterDepth.current = Math.max(0, dragEnterDepth.current - 1);

    if (dragEnterDepth.current === 0) {
      setIsAlbumDragOver(false);
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    if (!hasAlbumDragData(event.dataTransfer)) {
      return;
    }

    const albumId = readAlbumDragData(event.dataTransfer);

    event.preventDefault();
    dragEnterDepth.current = 0;
    setIsAlbumDragOver(false);

    if (albumId) {
      onAddAlbum(albumId);
    }
  }

  return (
    <div
      className={
        isAlbumDragOver ? "playlist-panel is-album-drag-over" : "playlist-panel"
      }
      aria-label="临时歌单放置区域"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isAlbumDragOver && (
        <div className="album-drop-feedback" role="status" aria-live="polite">
          <span aria-hidden="true">+</span>
          <strong>松开以加入整张专辑</strong>
        </div>
      )}
      <div className="section-heading playlist-heading">
        <div>
          <p className="eyebrow">Queue</p>
          <h2 id="playlist-heading">{playlist.name}</h2>
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
          tabIndex={0}
        >
          {playlist.itemIds.map((itemId, index) => {
            const item = playlist.itemsById[itemId];

            if (!item) {
              return null;
            }

            const track = tracksById.get(item.trackId);
            return (
              <article className="queue-item" key={itemId} role="listitem">
                <div className="queue-item-copy">
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
