import { useCallback, useReducer, useRef } from "react";

import { appReducer, createAppState } from "./appReducer";
import { PageShell } from "../components/PageShell";
import { mockCatalog } from "../data/catalog/mockCatalog";
import { CatalogOverview } from "../features/catalog/CatalogOverview";
import { XuSongCatalogImport } from "../features/catalog/VerifiedXuSongCatalogImport";
import { getAlbumTracks } from "../features/catalog/catalog";
import type { CatalogEntityIdFactory } from "../features/catalog/catalogMutations";
import type {
  CatalogDeletionIntent,
  CatalogDeletionIntentRepository
} from "../features/catalog/catalogDeletionRepository";
import type { LocalCatalogRepository } from "../features/catalog/localCatalogRepository";
import { useCatalogDeletion } from "../features/catalog/useCatalogDeletion";
import { useCatalogLibrary } from "../features/catalog/useCatalogLibrary";
import type { LocalAudioFileRepository } from "../features/local-library/localAudioRepository";
import { LocalDirectoryImport } from "../features/local-library/LocalDirectoryImport";
import { useLocalAudioLibrary } from "../features/local-library/useLocalAudioLibrary";
import { PlayerBar } from "../features/player/PlayerBar";
import type { PlayerAction } from "../features/player/playerReducer";
import { useLocalAudioPlayback } from "../features/player/useLocalAudioPlayback";
import { TemporaryPlaylistPanel } from "../features/playlist/TemporaryPlaylistPanel";
import type { TemporaryPlaylistAction } from "../features/playlist/playlistReducer";
import type { TemporaryPlaylistRepository } from "../features/playlist/playlistRepository";
import { usePersistedPlaylist } from "../features/playlist/usePersistedPlaylist";
import { indexedDbLocalAudioRepository } from "../infra/storage/indexedDbLocalAudioRepository";
import { localStorageCatalogRepository } from "../infra/storage/localStorageCatalogRepository";
import { localStorageCatalogDeletionIntentRepository } from "../infra/storage/localStorageCatalogDeletionIntentRepository";
import { localStoragePlaylistRepository } from "../infra/storage/localStoragePlaylistRepository";
import { localStoragePlayerSettingsRepository } from "../infra/storage/localStoragePlayerSettingsRepository";
import type { EntityId, PlaySequenceEntry, TemporaryPlaylist } from "../types";
import type { PlayerSettingsRepository } from "../features/player/playerSettingsRepository";
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

function createAudioElementKey(
  entry: PlaySequenceEntry | undefined,
  playbackRevision: number,
  bindingRevision: number
): string {
  if (!entry) {
    return ["empty", playbackRevision, bindingRevision].join(":");
  }

  return [
    entry.queueItemId,
    entry.trackId,
    entry.repeatIndex,
    playbackRevision,
    bindingRevision
  ].join(":");
}

interface AppProps {
  catalogRepository?: LocalCatalogRepository;
  catalogEntityIdFactory?: CatalogEntityIdFactory;
  localAudioRepository?: LocalAudioFileRepository;
  playlistRepository?: TemporaryPlaylistRepository;
  playerSettingsRepository?: PlayerSettingsRepository;
  deletionIntentRepository?: CatalogDeletionIntentRepository;
  playlistItemIdFactory?: () => EntityId;
}

export function App({
  catalogRepository = localStorageCatalogRepository,
  catalogEntityIdFactory,
  localAudioRepository = indexedDbLocalAudioRepository,
  playlistRepository = localStoragePlaylistRepository,
  playerSettingsRepository = localStoragePlayerSettingsRepository,
  deletionIntentRepository = localStorageCatalogDeletionIntentRepository,
  playlistItemIdFactory = createPlaylistItemId
}: AppProps) {
  const [{ playlist, player }, dispatch] = useReducer(
    appReducer,
    undefined,
    createInitialState
  );
  const audioRef = useRef<HTMLAudioElement>(null);
  const catalogLibrary = useCatalogLibrary(
    mockCatalog,
    catalogRepository,
    catalogEntityIdFactory
  );
  const catalog = catalogLibrary.catalog;
  const hydratePlaylist = useCallback(
    (restoredPlaylist: TemporaryPlaylist) =>
      dispatch({ type: "hydrate-playlist", playlist: restoredPlaylist }),
    []
  );
  const playlistPersistence = usePersistedPlaylist({
    playlist,
    tracks: catalog.tracks,
    catalogStatus: catalogLibrary.status,
    repository: playlistRepository,
    onHydrate: hydratePlaylist
  });
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
    audioRef,
    settingsRepository: playerSettingsRepository
  });
  const handleCatalogDeletionCommit = useCallback(
    (intent: CatalogDeletionIntent) => {
      catalogLibrary.applyPersistedChanges(intent.nextCatalogChanges);
      localAudioLibrary.forgetAudioBindings(intent.trackIds);
      dispatch({
        type: "replace-playlist-after-catalog-deletion",
        playlist: intent.nextPlaylist,
        removedTrackIds: intent.trackIds
      });
    },
    [catalogLibrary, localAudioLibrary]
  );
  const pauseAffectedPlayback = useCallback(
    (trackIds: readonly EntityId[]) => {
      if (player.currentEntry && trackIds.includes(player.currentEntry.trackId)) {
        localAudioPlayback.stopAndRelease();
      }
    },
    [localAudioPlayback, player.currentEntry]
  );
  const catalogDeletion = useCatalogDeletion({
    defaultCatalog: mockCatalog,
    catalogChanges: catalogLibrary.changes,
    catalogStatus: catalogLibrary.status,
    playlist,
    playlistIsReady: playlistPersistence.status === "ready",
    playlistRepository,
    audioBindings: localAudioLibrary.bindingsByTrackId,
    audioStatus: localAudioLibrary.status,
    audioRepository: localAudioRepository,
    catalogRepository,
    intentRepository: deletionIntentRepository,
    onBeforeDelete: pauseAffectedPlayback,
    onCommitted: handleCatalogDeletionCommit
  });
  const currentAudioBinding = player.currentEntry
    ? localAudioLibrary.bindingsByTrackId.get(player.currentEntry.trackId)
    : undefined;
  const playTargetEntry =
    player.status === "ended" ? player.playSequence[0] : player.currentEntry;
  const playTargetRevision =
    player.status === "ended" ? player.playbackRevision + 1 : player.playbackRevision;
  const playTargetBindingRevision = playTargetEntry
    ? (localAudioLibrary.bindingRevisionsByTrackId.get(playTargetEntry.trackId) ?? 0)
    : 0;
  const audioElementKey = createAudioElementKey(
    playTargetEntry ?? undefined,
    playTargetRevision,
    playTargetBindingRevision
  );
  const canPlayTarget = Boolean(
    playTargetEntry &&
    localAudioLibrary.status === "ready" &&
    localAudioLibrary.bindingsByTrackId.has(playTargetEntry.trackId)
  );

  function dispatchPlaylist(action: TemporaryPlaylistAction) {
    if (!playlistPersistence.canMutate) {
      return;
    }

    dispatch({ type: "playlist", action });
  }

  function addTrack(trackId: EntityId) {
    if (!playlistPersistence.canMutate) {
      return;
    }

    const trackExists = catalog.tracks.some((track) => track.id === trackId);

    if (!trackExists) {
      return;
    }

    dispatchPlaylist({
      type: "add-track",
      trackId,
      itemId: playlistItemIdFactory(),
      addedAt: new Date().toISOString()
    });
  }

  function addAlbum(albumId: EntityId) {
    if (!playlistPersistence.canMutate) {
      return;
    }

    const album = catalog.albums.find((item) => item.id === albumId);

    if (!album) {
      return;
    }

    const trackIds = getAlbumTracks(catalog, album).map((track) => track.id);

    dispatchPlaylist({
      type: "add-album",
      album: {
        ...album,
        trackIds
      },
      itemIds: trackIds.map(() => playlistItemIdFactory()),
      addedAt: new Date().toISOString()
    });
  }

  return (
    <PageShell>
      <main className="app-layout">
        <section className="workspace" aria-labelledby="catalog-heading">
          <XuSongCatalogImport
            catalog={catalog}
            catalogStatus={catalogLibrary.status}
            isCatalogSaving={
              catalogLibrary.isSavingAlbum ||
              catalogLibrary.isSavingTrack ||
              catalogDeletion.isDeleting ||
              catalogDeletion.isRecovering
            }
            onImport={catalogLibrary.importDirectoryCatalogDrafts}
          />
          <LocalDirectoryImport
            catalog={catalog}
            catalogStatus={catalogLibrary.status}
            audioBindingsByTrackId={localAudioLibrary.bindingsByTrackId}
            audioStatus={localAudioLibrary.status}
            isCatalogSaving={
              catalogLibrary.isSavingAlbum ||
              catalogLibrary.isSavingTrack ||
              catalogDeletion.isDeleting ||
              catalogDeletion.isRecovering
            }
            onImportCatalogDrafts={catalogLibrary.importDirectoryCatalogDrafts}
            onBindAudioFiles={localAudioLibrary.bindAudioFiles}
          />
          <CatalogOverview
            catalog={catalog}
            catalogLibraryStatus={catalogLibrary.status}
            catalogLibraryError={catalogLibrary.errorMessage}
            isSavingAlbum={
              catalogLibrary.isSavingAlbum ||
              catalogDeletion.isDeleting ||
              catalogDeletion.isRecovering
            }
            isSavingTrack={
              catalogLibrary.isSavingTrack ||
              catalogDeletion.isDeleting ||
              catalogDeletion.isRecovering
            }
            resettableAlbumIds={catalogLibrary.resettableAlbumIds}
            resettableTrackIds={catalogLibrary.resettableTrackIds}
            audioBindings={localAudioLibrary.bindingsByTrackId}
            pendingAudioTrackIds={localAudioLibrary.pendingTrackIds}
            audioLibraryStatus={localAudioLibrary.status}
            audioLibraryError={localAudioLibrary.errorMessage}
            onAddTrack={addTrack}
            onAddAlbum={addAlbum}
            onCreateAlbum={catalogLibrary.createAlbum}
            onCreateTrack={catalogLibrary.createTrack}
            onUpdateAlbum={catalogLibrary.updateAlbum}
            onUpdateTrack={catalogLibrary.updateTrack}
            onResetAlbum={catalogLibrary.resetAlbum}
            onResetTrack={catalogLibrary.resetTrack}
            canDelete={
              catalogDeletion.canDelete &&
              !catalogLibrary.isSavingAlbum &&
              !catalogLibrary.isSavingTrack
            }
            isDeleting={catalogDeletion.isDeleting}
            deletionError={catalogDeletion.errorMessage}
            onPreviewDeletion={catalogDeletion.previewDeletion}
            onDeleteCatalogTarget={catalogDeletion.deleteTarget}
            onBindAudio={localAudioLibrary.bindAudioFile}
            onUnbindAudio={localAudioLibrary.unbindAudioFile}
          />
        </section>

        <aside className="queue-panel" aria-labelledby="playlist-heading">
          <TemporaryPlaylistPanel
            playlist={playlist}
            tracks={catalog.tracks}
            canMutate={playlistPersistence.canMutate}
            persistenceStatus={playlistPersistence.status}
            persistenceLoadingMessage={playlistPersistence.loadingMessage}
            persistenceNotice={playlistPersistence.noticeMessage}
            persistenceError={playlistPersistence.errorMessage}
            onRepeatCountChange={(itemId, repeatCount) =>
              dispatchPlaylist({
                type: "set-repeat-count",
                itemId,
                repeatCount,
                updatedAt: new Date().toISOString()
              })
            }
            onRemove={(itemId) =>
              dispatchPlaylist({
                type: "remove-item",
                itemId,
                updatedAt: new Date().toISOString()
              })
            }
            onClear={() =>
              dispatchPlaylist({
                type: "clear",
                updatedAt: new Date().toISOString()
              })
            }
            onMove={(itemId, toIndex) =>
              dispatchPlaylist({
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

      <PlayerBar
        state={player}
        tracks={catalog.tracks}
        currentAudioFileName={currentAudioBinding?.fileName}
        isCurrentAudioBound={Boolean(currentAudioBinding)}
        canPlayTarget={canPlayTarget}
        audioLibraryStatus={localAudioLibrary.status}
        playbackError={localAudioPlayback.errorMessage}
        settingsError={localAudioPlayback.settingsError}
        playerSettings={localAudioPlayback.settings}
        playerSettingsStatus={localAudioPlayback.settingsStatus}
        playbackProgress={localAudioPlayback.progress}
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
        onSeek={localAudioPlayback.requestSeek}
        onVolumeChange={localAudioPlayback.setVolume}
        onToggleMuted={localAudioPlayback.toggleMuted}
      />
      <audio
        key={audioElementKey}
        className="local-audio-element"
        ref={audioRef}
        preload="metadata"
        aria-hidden="true"
        onError={localAudioPlayback.handleAudioError}
      />
    </PageShell>
  );
}
