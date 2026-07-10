import type { Album, CatalogData, Track } from "../../types";

interface CatalogOverviewProps {
  catalog: CatalogData;
}

export function CatalogOverview({ catalog }: CatalogOverviewProps) {
  const tracksById = new Map(catalog.tracks.map((track) => [track.id, track]));
  const albums = [...catalog.albums].sort(
    (left, right) => left.sortOrder - right.sortOrder
  );

  return (
    <div className="catalog">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Catalog</p>
          <h2 id="catalog-heading">专辑目录</h2>
        </div>
        <span className="pill">{catalog.schemaVersion} 版元数据</span>
      </div>

      <div className="album-grid">
        {albums.map((album) => (
          <AlbumCard
            key={album.id}
            album={album}
            tracks={album.trackIds
              .map((trackId) => tracksById.get(trackId))
              .filter((track): track is Track => Boolean(track))}
          />
        ))}
      </div>
    </div>
  );
}

interface AlbumCardProps {
  album: Album;
  tracks: Track[];
}

function AlbumCard({ album, tracks }: AlbumCardProps) {
  return (
    <article className="album-card">
      <div className="album-cover-placeholder" aria-hidden="true">
        {album.title.slice(0, 1)}
      </div>

      <div className="album-content">
        <div>
          <p className="eyebrow">{album.type}</p>
          <h3>{album.title}</h3>
          <p className="muted">
            {album.releaseDate ?? "发行日期待维护"} · {tracks.length} 首占位歌曲
          </p>
        </div>

        <ol className="track-list">
          {tracks.map((track) => (
            <li key={track.id}>
              <span>{track.trackNumber}</span>
              <strong>{track.title}</strong>
            </li>
          ))}
        </ol>

        <button className="secondary-button" type="button" disabled>
          整张专辑加入临时歌单
        </button>
      </div>
    </article>
  );
}
