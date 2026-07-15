import { useCallback, useReducer, useRef } from "react";

import { appReducer, createAppState } from "./appReducer";
import { PageShell } from "../components/PageShell";
import { mockCatalog } from "../data/catalog/mockCatalog";
import { CatalogOverview } from "../features/catalog/CatalogOverview";
import type { LocalAudioFileRepository } from "../features/local-library/localAudioRepository";
import { useLocalAudioLibrary } from "../features/local-library/useLocalAudioLibrary";
import { PlayerBar } from "../features/player/PlayerBar";
import type { PlayerAction } from "../features/player/playerReducer";
import { useLocalAudioPlayback } from "../features/player/useLocalAudioPlayback";
import { TemporaryPlaylistPanel } from "../features/playlist/TemporaryPlaylistPanel";
import { indexedDbLocalAudioRepository } from "../infra/storage/indexedDbLocalAudioRepository";
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

interface AppProps {
  localAudioRepository?: LocalAudioFileRepository;
}

export function App({
  localAudioRepository = indexedDbLocalAudioRepository
}: AppProps) {
  const [{ playlist, player }, dispatch] = useReducer(
    appReducer,
    undefined,
    createInitialState
  );
  const audioRef = useRef<HTMLAudioElement>(null);
  const localAudioLibrary = useLocalAudioLibrary(localAudioRepository);
  const dispatchPlayer = useCallback(
    (action: PlayerAction) => dispatch({ type: "player", action }),
    []
  );
  const localAudioPlayback = useLocalAudioPlayback({
    state: player,
    bindingsByTrackId: localAudioLibrary.bindingsByTrackId,
    libraryStatus: localAudioLibrary.status,
    dispatchPlayer,
    audioRef
  });
  const currentAudioBinding = player.currentEntry
    ? localAudioLibrary.bindingsByTrackId.get(player.currentEntry.trackId)
    : undefined;
  const playTargetEntry =
    player.status === "ended" ? player.playSequence[0] : player.currentEntry;
  const canPlayTarget = Boolean(
    playTargetEntry &&
    localAudioLibrary.status === "ready" &&
    localAudioLibrary.bindingsByTrackId.has(playTargetEntry.trackId)
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
            audioBindings={localAudioLibrary.bindingsByTrackId}
            pendingAudioTrackIds={localAudioLibrary.pendingTrackIds}
            audioLibraryStatus={localAudioLibrary.status}
            audioLibraryError={localAudioLibrary.errorMessage}
            onAddTrack={addTrack}
            onAddAlbum={addAlbum}
            onBindAudio={localAudioLibrary.bindAudioFile}
            onUnbindAudio={localAudioLibrary.unbindAudioFile}
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
        currentAudioFileName={currentAudioBinding?.fileName}
        isCurrentAudioBound={Boolean(currentAudioBinding)}
        canPlayTarget={canPlayTarget}
        audioLibraryStatus={localAudioLibrary.status}
        playbackError={localAudioPlayback.errorMessage}
        onPlay={localAudioPlayback.requestPlay}
        onPause={localAudioPlayback.requestPause}
        onNext={() => {
          localAudioPlayback.clearError();
          dispatchPlayer({ type: "next" });
        }}
        onPrevious={() => {
          localAudioPlayback.clearError();
          dispatchPlayer({ type: "previous" });
        }}
        onRestart={localAudioPlayback.requestRestart}
      />
      <audio
        className="local-audio-element"
        ref={audioRef}
        preload="metadata"
        aria-hidden="true"
        onEnded={localAudioPlayback.handleAudioEnded}
        onError={localAudioPlayback.handleAudioError}
      />
    </PageShell>
  );
}
