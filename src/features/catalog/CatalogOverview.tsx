import { useMemo, useState, type ChangeEvent, type DragEvent } from "react";

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
import { getAlbumTracks, getReleaseYear, getSortedAlbums } from "./catalog";
import type { CatalogLibraryStatus } from "./useCatalogLibrary";

interface CatalogOverviewProps {
  catalog: CatalogData;
  catalogLibraryStatus: CatalogLibraryStatus;
  catalogLibraryError?: string;
  audioBindings: ReadonlyMap<EntityId, LocalAudioFileRecord>;
  pendingAudioTrackIds: ReadonlySet<EntityId>;
  audioLibraryStatus: LocalAudioLibraryStatus;
  audioLibraryError?: string;
  onAddTrack: (trackId: EntityId) => void;
  onAddAlbum: (albumId: EntityId) => void;
  onBindAudio: (trackId: EntityId, file: File) => Promise<boolean>;
  onUnbindAudio: (trackId: EntityId) => Promise<boolean>;
}

const albumTypeLabels: Record<AlbumType, string> = {
  album: "专辑",
  ep: "EP",
  single_collection: "单曲合集",
  other: "其他发行"
};

export function CatalogOverview({
  catalog,
  catalogLibraryStatus,
  catalogLibraryError,
  audioBindings,
  pendingAudioTrackIds,
  audioLibraryStatus,
  audioLibraryError,
  onAddTrack,
  onAddAlbum,
  onBindAudio,
  onUnbindAudio
}: CatalogOverviewProps) {
  const albums = useMemo(() => getSortedAlbums(catalog), [catalog]);
  const [albumSelection, setAlbumSelection] = useState(() => ({
    catalog,
    albumId: albums[0]?.id
  }));
  const [draggingAlbumId, setDraggingAlbumId] = useState<EntityId>();
  const [draggingTrackId, setDraggingTrackId] = useState<EntityId>();
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
  }

  function startAlbumDrag(event: DragEvent<HTMLButtonElement>, albumId: EntityId) {
    writeAlbumDragData(event.dataTransfer, albumId);
    setDraggingAlbumId(albumId);
  }

  function startTrackDrag(event: DragEvent<HTMLDivElement>, trackId: EntityId) {
    writeTrackDragData(event.dataTransfer, trackId);
    setDraggingTrackId(trackId);
  }

  if (!selectedAlbum) {
    return (
      <section className="catalog-empty" aria-labelledby="catalog-heading">
        <p className="eyebrow">Catalog</p>
        <h2 id="catalog-heading">专辑目录</h2>
        <p className="muted">尚未维护专辑数据。</p>
        <CatalogLibraryNotice
          status={catalogLibraryStatus}
          errorMessage={catalogLibraryError}
        />
      </section>
    );
  }

  return (
    <div className="catalog">
      <div className="section-heading catalog-heading">
        <div>
          <p className="eyebrow">Catalog</p>
          <h2 id="catalog-heading">专辑目录</h2>
        </div>
        <span className="pill">{catalog.schemaVersion} 版元数据</span>
      </div>

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
      </div>

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
                    aria-current={isSelected ? "true" : undefined}
                    onClick={() =>
                      setAlbumSelection({
                        catalog,
                        albumId: album.id
                      })
                    }
                    onDragStart={(event) => startAlbumDrag(event, album.id)}
                    onDragEnd={() => setDraggingAlbumId(undefined)}
                  >
                    <span className="album-monogram" aria-hidden="true">
                      {album.title.slice(0, 1)}
                    </span>
                    <span className="album-list-copy">
                      <strong>{album.title}</strong>
                      <span>
                        {getReleaseYear(album.releaseDate) ?? "年份待维护"}
                        <span aria-hidden="true"> · </span>
                        {tracks.length} 首
                      </span>
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
          onAddTrack={onAddTrack}
          onAddAlbum={onAddAlbum}
          onBindAudio={onBindAudio}
          onUnbindAudio={onUnbindAudio}
          onTrackDragStart={startTrackDrag}
          onTrackDragEnd={() => setDraggingTrackId(undefined)}
        />
      </div>
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
  onAddTrack: (trackId: EntityId) => void;
  onAddAlbum: (albumId: EntityId) => void;
  onBindAudio: (trackId: EntityId, file: File) => Promise<boolean>;
  onUnbindAudio: (trackId: EntityId) => Promise<boolean>;
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
  onAddTrack,
  onAddAlbum,
  onBindAudio,
  onUnbindAudio,
  onTrackDragStart,
  onTrackDragEnd
}: AlbumDetailProps) {
  const tracks = getAlbumTracks(catalog, album);
  const releaseYear = getReleaseYear(album.releaseDate);

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
            {releaseYear && <span>{releaseYear} 年</span>}
            <span>{tracks.length} 首歌曲</span>
          </p>
        </div>
        <button
          className="secondary-button add-album-button"
          type="button"
          onClick={() => onAddAlbum(album.id)}
        >
          整张加入
        </button>
      </header>

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
              onAdd={() => onAddTrack(track.id)}
              onBindAudio={(file) => onBindAudio(track.id, file)}
              onUnbindAudio={() => onUnbindAudio(track.id)}
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

interface TrackRowProps {
  track: Track;
  album: Album;
  audioBinding?: LocalAudioFileRecord;
  audioLibraryStatus: LocalAudioLibraryStatus;
  isAudioPending: boolean;
  isDragging: boolean;
  onAdd: () => void;
  onBindAudio: (file: File) => Promise<boolean>;
  onUnbindAudio: () => Promise<boolean>;
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
  onAdd,
  onBindAudio,
  onUnbindAudio,
  onDragStart,
  onDragEnd
}: TrackRowProps) {
  const hasTrackNumber = Number.isInteger(track.trackNumber);
  const isAudioLibraryReady = audioLibraryStatus === "ready";
  const bindingStatusLabel = getBindingStatusLabel(audioLibraryStatus, audioBinding);

  function handleAudioFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";

    if (file) {
      void onBindAudio(file);
    }
  }

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
        <label
          className={`audio-file-picker ${
            !isAudioLibraryReady || isAudioPending ? "is-disabled" : ""
          }`}
        >
          <span>{isAudioPending ? "处理中…" : audioBinding ? "更换" : "绑定音频"}</span>
          <input
            className="visually-hidden"
            type="file"
            accept={LOCAL_AUDIO_FILE_ACCEPT}
            disabled={!isAudioLibraryReady || isAudioPending}
            aria-label={`为${track.title}选择本地音频文件`}
            onChange={handleAudioFileChange}
          />
        </label>
        {audioBinding && (
          <button
            className="text-button unbind-audio-button"
            type="button"
            disabled={isAudioPending}
            aria-label={`解除${track.title}的本地音频绑定`}
            onClick={() => void onUnbindAudio()}
          >
            解绑
          </button>
        )}
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
    return `已绑定：${binding.fileName}`;
  }

  return "未绑定音频文件";
}
