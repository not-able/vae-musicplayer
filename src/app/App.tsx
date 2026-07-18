import { useCallback, useMemo, useReducer, useRef } from "react";

import { appReducer, createAppState } from "./appReducer";
import { PageShell } from "../components/PageShell";
import { mockCatalog } from "../data/catalog/mockCatalog";
import { CatalogOverview } from "../features/catalog/CatalogOverview";
import { CatalogImportTools } from "../features/catalog/CatalogImportTools";
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
import { useLocalAudioLibrary } from "../features/local-library/useLocalAudioLibrary";
import { PlayerBar } from "../features/player/PlayerBar";
import type { PlayerAction } from "../features/player/playerReducer";
import { useLocalAudioPlayback } from "../features/player/useLocalAudioPlayback";
import { TemporaryPlaylistPanel } from "../features/playlist/TemporaryPlaylistPanel";
import type { TemporaryPlaylistAction } from "../features/playlist/playlistReducer";
import type { PlaylistLibraryRepository } from "../features/playlist/playlistLibraryRepository";
import { createLegacyTemporaryPlaylistRepositoryAdapter } from "../features/playlist/playlistLibraryRepository";
import type { TemporaryPlaylistRepository } from "../features/playlist/playlistRepository";
import { usePersistedPlaylistLibrary } from "../features/playlist/usePersistedPlaylistLibrary";
import { indexedDbLocalAudioRepository } from "../infra/storage/indexedDbLocalAudioRepository";
import { localStorageCatalogRepository } from "../infra/storage/localStorageCatalogRepository";
import { localStorageCatalogDeletionIntentRepository } from "../infra/storage/localStorageCatalogDeletionIntentRepository";
import { localStoragePlaylistLibraryRepository } from "../infra/storage/localStoragePlaylistLibraryRepository";
import { localStoragePlayerSettingsRepository } from "../infra/storage/localStoragePlayerSettingsRepository";
import type { EntityId, PlaySequenceEntry, PlaylistLibrary } from "../types";
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

function createSavedPlaylistId(): string {
  return `playlist_saved_${crypto.randomUUID()}`;
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
  playlistLibraryRepository?: PlaylistLibraryRepository;
  playlistRepository?: TemporaryPlaylistRepository;
  playerSettingsRepository?: PlayerSettingsRepository;
  deletionIntentRepository?: CatalogDeletionIntentRepository;
  playlistItemIdFactory?: () => EntityId;
  savedPlaylistIdFactory?: () => EntityId;
}

export function App({
  catalogRepository = localStorageCatalogRepository,
  catalogEntityIdFactory,
  localAudioRepository = indexedDbLocalAudioRepository,
  playlistLibraryRepository = localStoragePlaylistLibraryRepository,
  playlistRepository,
  playerSettingsRepository = localStoragePlayerSettingsRepository,
  deletionIntentRepository = localStorageCatalogDeletionIntentRepository,
  playlistItemIdFactory = createPlaylistItemId,
  savedPlaylistIdFactory = createSavedPlaylistId
}: AppProps) {
  const [
    { playlist, playlistLibrary, selectedPlaylist, player, playbackSource },
    dispatch
  ] = useReducer(appReducer, undefined, createInitialState);
  const audioRef = useRef<HTMLAudioElement>(null);
  const persistedPlaylistLibraryRepository = useMemo(
    () =>
      playlistRepository
        ? createLegacyTemporaryPlaylistRepositoryAdapter(playlistRepository)
        : playlistLibraryRepository,
    [playlistLibraryRepository, playlistRepository]
  );
  const catalogLibrary = useCatalogLibrary(
    mockCatalog,
    catalogRepository,
    catalogEntityIdFactory
  );
  const catalog = catalogLibrary.catalog;
  const hydratePlaylistLibrary = useCallback(
    (restoredLibrary: PlaylistLibrary) =>
      dispatch({ type: "hydrate-playlist-library", library: restoredLibrary }),
    []
  );
  const playlistPersistence = usePersistedPlaylistLibrary({
    library: playlistLibrary,
    tracks: catalog.tracks,
    catalogStatus: catalogLibrary.status,
    repository: persistedPlaylistLibraryRepository,
    onHydrate: hydratePlaylistLibrary
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
        type: "replace-playlist-library-after-catalog-deletion",
        library: intent.nextPlaylistLibrary,
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
    playlistLibrary,
    playlistIsReady: playlistPersistence.status === "ready",
    playlistRepository: persistedPlaylistLibraryRepository,
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
    localAudioLibrary.bindingsByTrackId.get(playTargetEntry.trackId)?.status ===
      "available"
  );

  const canStartCurrentPlaylist = playlist.itemIds.length > 0;

  function requestPlayerPlay() {
    if (player.status === "empty") {
      if (canStartCurrentPlaylist) {
        dispatch({ type: "start-playback-from-selection", autoplay: true });
      }
      return;
    }

    localAudioPlayback.requestPlay();
  }

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

  function createSavedPlaylist(name: string) {
    if (!playlistPersistence.canMutate) {
      return;
    }

    dispatch({
      type: "create-saved-playlist",
      playlistId: savedPlaylistIdFactory(),
      name,
      createdAt: new Date().toISOString()
    });
  }

  function renameSavedPlaylist(playlistId: EntityId, name: string) {
    if (!playlistPersistence.canMutate) {
      return;
    }

    dispatch({
      type: "rename-saved-playlist",
      playlistId,
      name,
      updatedAt: new Date().toISOString()
    });
  }

  function deleteSavedPlaylist(playlistId: EntityId) {
    if (!playlistPersistence.canMutate) {
      return;
    }

    dispatch({ type: "delete-saved-playlist", playlistId });
  }

  function playCatalogTrack(trackId: EntityId) {
    if (!catalog.tracks.some((track) => track.id === trackId)) {
      return;
    }

    localAudioPlayback.clearError();
    dispatch({ type: "start-single-track-preview", trackId, autoplay: true });
  }

  function playPlaylistItem(itemId: EntityId) {
    if (!playlist.itemsById[itemId]) {
      return;
    }

    localAudioPlayback.clearError();
    dispatch({
      type: "start-playback-from-selection",
      startItemId: itemId,
      autoplay: true
    });
  }

  return (
    <PageShell>
      <main className="app-layout" id="main-content" tabIndex={-1}>
        <section className="workspace" aria-labelledby="catalog-heading">
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
            playlistTargetLabel="当前歌单"
            onAddTrack={addTrack}
            onAddAlbum={addAlbum}
            onPlayTrack={playCatalogTrack}
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
            importTools={
              <CatalogImportTools
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
            }
            onBindAudio={localAudioLibrary.bindAudioFile}
            onRequestAudioAccess={localAudioLibrary.requestAudioAccess}
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
            selectedPlaylist={selectedPlaylist}
            savedPlaylists={playlistLibrary.savedPlaylistIds.flatMap((playlistId) => {
              const savedPlaylist = playlistLibrary.savedPlaylistsById[playlistId];

              return savedPlaylist ? [savedPlaylist] : [];
            })}
            playbackSource={playbackSource}
            onSelectPlaylist={(selection) =>
              dispatch({ type: "select-playlist", selection })
            }
            onCreateSavedPlaylist={createSavedPlaylist}
            onRenameSavedPlaylist={renameSavedPlaylist}
            onDeleteSavedPlaylist={deleteSavedPlaylist}
            onPlayItem={playPlaylistItem}
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
        currentAudioBindingStatus={currentAudioBinding?.status}
        isCurrentAudioBound={Boolean(currentAudioBinding)}
        canPlayTarget={canPlayTarget}
        canStartCurrentPlaylist={canStartCurrentPlaylist}
        audioLibraryStatus={localAudioLibrary.status}
        playbackError={localAudioPlayback.errorMessage}
        settingsError={localAudioPlayback.settingsError}
        playerSettings={localAudioPlayback.settings}
        playerSettingsStatus={localAudioPlayback.settingsStatus}
        playbackProgress={localAudioPlayback.progress}
        onPlay={requestPlayerPlay}
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
