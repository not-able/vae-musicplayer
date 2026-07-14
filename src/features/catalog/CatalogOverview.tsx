import { useState, type DragEvent } from "react";

import type { Album, AlbumType, CatalogData, EntityId, Track } from "../../types";
import { writeAlbumDragData } from "../../utils/albumDrag";
import { getAlbumTracks, getReleaseYear, getSortedAlbums } from "./catalog";

interface CatalogOverviewProps {
  catalog: CatalogData;
  onAddTrack: (trackId: EntityId) => void;
  onAddAlbum: (albumId: EntityId) => void;
}

const albumTypeLabels: Record<AlbumType, string> = {
  album: "专辑",
  ep: "EP",
  single_collection: "单曲合集",
  other: "其他发行"
};

export function CatalogOverview({
  catalog,
  onAddTrack,
  onAddAlbum
}: CatalogOverviewProps) {
  const albums = getSortedAlbums(catalog);
  const [selectedAlbumId, setSelectedAlbumId] = useState(() => albums[0]?.id);
  const [draggingAlbumId, setDraggingAlbumId] = useState<EntityId>();
  const selectedAlbum =
    albums.find((album) => album.id === selectedAlbumId) ?? albums[0];

  function startAlbumDrag(event: DragEvent<HTMLButtonElement>, albumId: EntityId) {
    writeAlbumDragData(event.dataTransfer, albumId);
    setDraggingAlbumId(albumId);
  }

  if (!selectedAlbum) {
    return (
      <section className="catalog-empty" aria-labelledby="catalog-heading">
        <p className="eyebrow">Catalog</p>
        <h2 id="catalog-heading">专辑目录</h2>
        <p className="muted">尚未维护专辑数据。</p>
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
                    onClick={() => setSelectedAlbumId(album.id)}
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
          onAddTrack={onAddTrack}
          onAddAlbum={onAddAlbum}
        />
      </div>
    </div>
  );
}

interface AlbumDetailProps {
  album: Album;
  catalog: CatalogData;
  onAddTrack: (trackId: EntityId) => void;
  onAddAlbum: (albumId: EntityId) => void;
}

function AlbumDetail({ album, catalog, onAddTrack, onAddAlbum }: AlbumDetailProps) {
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
              onAdd={() => onAddTrack(track.id)}
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
  onAdd: () => void;
}

function TrackRow({ track, album, onAdd }: TrackRowProps) {
  const hasTrackNumber = Number.isInteger(track.trackNumber);

  return (
    <li>
      <span
        className="track-number"
        aria-label={hasTrackNumber ? `音轨序号 ${track.trackNumber}` : "音轨序号待维护"}
      >
        {hasTrackNumber ? String(track.trackNumber).padStart(2, "0") : "--"}
      </span>
      <div className="track-copy">
        <strong>{track.title}</strong>
        <span>{album.title}</span>
      </div>
      <div className="track-actions">
        <span className="binding-status">未绑定音频</span>
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
