import type { Album, TemporaryPlaylist, Track } from "../../types";
import { expandPlaylistToPlaySequence } from "../../utils/playlist";

interface TemporaryPlaylistPanelProps {
  playlist: TemporaryPlaylist;
  tracks: Track[];
  albums: Album[];
}

export function TemporaryPlaylistPanel({
  playlist,
  tracks,
  albums
}: TemporaryPlaylistPanelProps) {
  const tracksById = new Map(tracks.map((track) => [track.id, track]));
  const albumsById = new Map(albums.map((album) => [album.id, album]));
  const playSequence = expandPlaylistToPlaySequence(playlist);

  return (
    <div className="playlist-panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Queue</p>
          <h2 id="playlist-heading">{playlist.name}</h2>
        </div>
        <span className="pill">{playSequence.length} 次播放</span>
      </div>

      <div className="queue-list">
        {playlist.itemIds.map((itemId, index) => {
          const item = playlist.itemsById[itemId];
          const track = item ? tracksById.get(item.trackId) : undefined;
          const album = track ? albumsById.get(track.albumId) : undefined;

          return (
            <article className="queue-item" key={itemId}>
              <span className="queue-index">{index + 1}</span>
              <div>
                <h3>{track?.title ?? "未知歌曲"}</h3>
                <p className="muted">{album?.title ?? "未知专辑"}</p>
              </div>
              <span className="play-count">
                {item?.playCount ?? 1}
                <small>次</small>
              </span>
            </article>
          );
        })}
      </div>

      <p className="helper-text">
        拖拽排序、修改播放次数和本地音频绑定将在后续任务中实现。
      </p>
    </div>
  );
}
