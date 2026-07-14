import { useReducer } from "react";

import { appReducer, createAppState } from "./appReducer";
import { PageShell } from "../components/PageShell";
import { mockCatalog } from "../data/catalog/mockCatalog";
import { CatalogOverview } from "../features/catalog/CatalogOverview";
import { PlayerBar } from "../features/player/PlayerBar";
import { TemporaryPlaylistPanel } from "../features/playlist/TemporaryPlaylistPanel";
import type { EntityId } from "../types";
import { createTemporaryPlaylist } from "../utils/playlist";

function createInitialState() {
  const createdAt = new Date().toISOString();

  return createAppState(
    createTemporaryPlaylist({
      id: "playlist_temp_current",
      name: "临时歌单",
      createdAt
    })
  );
}

function createPlaylistItemId(): string {
  return `queue_item_${crypto.randomUUID()}`;
}

export function App() {
  const [{ playlist, player }, dispatch] = useReducer(
    appReducer,
    undefined,
    createInitialState
  );

  function addTrack(trackId: EntityId) {
    const trackExists = mockCatalog.tracks.some((track) => track.id === trackId);

    if (!trackExists) {
      return;
    }

    dispatch({
      type: "playlist",
      action: {
        type: "add-track",
        trackId,
        itemId: createPlaylistItemId(),
        addedAt: new Date().toISOString()
      }
    });
  }

  function addAlbum(albumId: EntityId) {
    const album = mockCatalog.albums.find((item) => item.id === albumId);

    if (!album) {
      return;
    }

    dispatch({
      type: "playlist",
      action: {
        type: "add-album",
        album,
        itemIds: album.trackIds.map(() => createPlaylistItemId()),
        addedAt: new Date().toISOString()
      }
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
                type: "playlist",
                action: {
                  type: "set-repeat-count",
                  itemId,
                  repeatCount,
                  updatedAt: new Date().toISOString()
                }
              })
            }
            onRemove={(itemId) =>
              dispatch({
                type: "playlist",
                action: {
                  type: "remove-item",
                  itemId,
                  updatedAt: new Date().toISOString()
                }
              })
            }
            onClear={() =>
              dispatch({
                type: "playlist",
                action: {
                  type: "clear",
                  updatedAt: new Date().toISOString()
                }
              })
            }
            onMove={(itemId, toIndex) =>
              dispatch({
                type: "playlist",
                action: {
                  type: "move-item",
                  itemId,
                  toIndex,
                  updatedAt: new Date().toISOString()
                }
              })
            }
            onAddTrack={addTrack}
            onAddAlbum={addAlbum}
          />
        </aside>
      </main>

      <PlayerBar
        state={player}
        tracks={mockCatalog.tracks}
        onPlay={() => dispatch({ type: "player", action: { type: "play" } })}
        onPause={() => dispatch({ type: "player", action: { type: "pause" } })}
        onNext={() => dispatch({ type: "player", action: { type: "next" } })}
        onPrevious={() => dispatch({ type: "player", action: { type: "previous" } })}
        onRestart={() =>
          dispatch({ type: "player", action: { type: "restart-current" } })
        }
        onPlaybackEnded={() =>
          dispatch({ type: "player", action: { type: "playback-ended" } })
        }
      />
    </PageShell>
  );
}
