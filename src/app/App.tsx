import { PageShell } from "../components/PageShell";
import { mockCatalog } from "../data/catalog/mockCatalog";
import { CatalogOverview } from "../features/catalog/CatalogOverview";
import { PlayerBar } from "../features/player/PlayerBar";
import { TemporaryPlaylistPanel } from "../features/playlist/TemporaryPlaylistPanel";
import type { TemporaryPlaylist } from "../types";

const now = new Date().toISOString();

const mockTemporaryPlaylist: TemporaryPlaylist = {
  id: "playlist_temp_current",
  name: "临时歌单",
  itemIds: ["queue_item_sample_001", "queue_item_sample_002"],
  itemsById: {
    queue_item_sample_001: {
      id: "queue_item_sample_001",
      trackId: "track_sample_001",
      playCount: 1,
      playedCount: 0,
      source: "album",
      sourceAlbumId: "album_sample_001",
      addedAt: now
    },
    queue_item_sample_002: {
      id: "queue_item_sample_002",
      trackId: "track_sample_002",
      playCount: 2,
      playedCount: 0,
      source: "single",
      addedAt: now
    }
  },
  createdAt: now,
  updatedAt: now
};

export function App() {
  return (
    <PageShell>
      <main className="app-layout">
        <section className="workspace" aria-labelledby="catalog-heading">
          <CatalogOverview catalog={mockCatalog} />
        </section>

        <aside className="queue-panel" aria-labelledby="playlist-heading">
          <TemporaryPlaylistPanel
            playlist={mockTemporaryPlaylist}
            tracks={mockCatalog.tracks}
            albums={mockCatalog.albums}
          />
        </aside>
      </main>

      <PlayerBar />
    </PageShell>
  );
}
