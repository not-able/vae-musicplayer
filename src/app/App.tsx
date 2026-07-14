import { useReducer } from "react";

import { PageShell } from "../components/PageShell";
import { mockCatalog } from "../data/catalog/mockCatalog";
import { CatalogOverview } from "../features/catalog/CatalogOverview";
import { PlayerBar } from "../features/player/PlayerBar";
import { TemporaryPlaylistPanel } from "../features/playlist/TemporaryPlaylistPanel";
import { temporaryPlaylistReducer } from "../features/playlist/playlistReducer";
import type { EntityId } from "../types";
import { createTemporaryPlaylist } from "../utils/playlist";

function createInitialPlaylist() {
  const createdAt = new Date().toISOString();

  return createTemporaryPlaylist({
    id: "playlist_temp_current",
    name: "临时歌单",
    createdAt
  });
}

function createPlaylistItemId(): string {
  return `queue_item_${crypto.randomUUID()}`;
}

export function App() {
  const [playlist, dispatch] = useReducer(
    temporaryPlaylistReducer,
    undefined,
    createInitialPlaylist
  );

  function addTrack(trackId: EntityId) {
    const trackExists = mockCatalog.tracks.some((track) => track.id === trackId);

    if (!trackExists) {
      return;
    }

    dispatch({
      type: "add-track",
      trackId,
      itemId: createPlaylistItemId(),
      addedAt: new Date().toISOString()
    });
  }

  function addAlbum(albumId: EntityId) {
    const album = mockCatalog.albums.find((item) => item.id === albumId);

    if (!album) {
      return;
    }

    dispatch({
      type: "add-album",
      album,
      itemIds: album.trackIds.map(() => createPlaylistItemId()),
      addedAt: new Date().toISOString()
    });
  }

  return (
    <PageShell>
      <main className="app-layout">
        <section className="workspace" aria-labelledby="catalog-heading">
          <CatalogOverview
            catalog={mockCatalog}
            onAddTrack={addTrack}
            onAddAlbum={addAlbum}
          />
        </section>

        <aside className="queue-panel" aria-labelledby="playlist-heading">
          <TemporaryPlaylistPanel
            playlist={playlist}
            tracks={mockCatalog.tracks}
            onRepeatCountChange={(itemId, repeatCount) =>
              dispatch({
                type: "set-repeat-count",
                itemId,
                repeatCount,
                updatedAt: new Date().toISOString()
              })
            }
            onRemove={(itemId) =>
              dispatch({
                type: "remove-item",
                itemId,
                updatedAt: new Date().toISOString()
              })
            }
            onClear={() =>
              dispatch({
                type: "clear",
                updatedAt: new Date().toISOString()
              })
            }
            onMove={(itemId, toIndex) =>
              dispatch({
                type: "move-item",
                itemId,
                toIndex,
                updatedAt: new Date().toISOString()
              })
            }
            onAddTrack={addTrack}
            onAddAlbum={addAlbum}
          />
        </aside>
      </main>

      <PlayerBar />
    </PageShell>
  );
}
