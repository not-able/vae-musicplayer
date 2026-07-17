import { useEffect, useRef, useState } from "react";

import type { EntityId, PlaylistItem, TemporaryPlaylist, Track } from "../../types";
import type { TemporaryPlaylistRepository } from "./playlistRepository";

type CatalogStatus = "loading" | "ready" | "error";

type PlaylistPersistenceSession =
  | {
      repository: TemporaryPlaylistRepository;
      sourceId: number;
      phase: "awaiting-catalog";
      loadedPlaylist: TemporaryPlaylist | null;
      baselinePlaylist: TemporaryPlaylist;
      resetToEmptyWhenNoSnapshot: boolean;
    }
  | {
      repository: TemporaryPlaylistRepository;
      sourceId: number;
      phase: "hydrating";
      expectedPlaylist: TemporaryPlaylist;
      shouldSaveReconciledPlaylist: boolean;
      noticeMessage?: string;
    }
  | {
      repository: TemporaryPlaylistRepository;
      sourceId: number;
      phase: "ready";
      noticeMessage?: string;
      saveErrorMessage?: string;
    }
  | {
      repository: TemporaryPlaylistRepository;
      sourceId: number;
      phase: "error";
      errorMessage: string;
    };

interface UsePersistedPlaylistOptions {
  playlist: TemporaryPlaylist;
  tracks: readonly Track[];
  catalogStatus: CatalogStatus;
  repository: TemporaryPlaylistRepository;
  onHydrate: (playlist: TemporaryPlaylist) => void;
}

export interface PersistedPlaylistState {
  status: "loading" | "ready" | "error";
  canMutate: boolean;
  loadingMessage?: string;
  noticeMessage?: string;
  errorMessage?: string;
}

export interface ReconciledPlaylist {
  playlist: TemporaryPlaylist;
  removedItemCount: number;
}

interface PlaylistSaveQueue {
  sourceId: number;
  enqueue: (playlist: TemporaryPlaylist) => void;
  deactivate: () => void;
  isActive: () => boolean;
}

interface HandledPlaylist {
  sourceId: number;
  playlist: TemporaryPlaylist;
}

export function usePersistedPlaylist({
  playlist,
  tracks,
  catalogStatus,
  repository,
  onHydrate
}: UsePersistedPlaylistOptions): PersistedPlaylistState {
  const [session, setSession] = useState<PlaylistPersistenceSession>();
  const latestPlaylist = useRef(playlist);
  const initialPlaylist = useRef(playlist);
  const previousRepository = useRef(repository);
  const sourceSequence = useRef(0);
  const saveQueue = useRef<PlaylistSaveQueue | undefined>(undefined);
  const initializationSourceId = useRef<number | undefined>(undefined);
  const hydratedSourceId = useRef<number | undefined>(undefined);
  const handledPlaylist = useRef<HandledPlaylist | undefined>(undefined);

  useEffect(() => {
    latestPlaylist.current = playlist;
  }, [playlist]);

  useEffect(() => {
    const repositoryChanged = previousRepository.current !== repository;

    previousRepository.current = repository;
    sourceSequence.current += 1;
    const sourceId = sourceSequence.current;
    const queue = createPlaylistSaveQueue(sourceId, repository, (saveSucceeded) => {
      setSession((currentSession) => {
        if (currentSession?.sourceId !== sourceId || currentSession.phase !== "ready") {
          return currentSession;
        }

        return {
          ...currentSession,
          saveErrorMessage: saveSucceeded
            ? undefined
            : "临时歌单保存失败，本次页面中的更改仍然保留。"
        };
      });
    });

    saveQueue.current?.deactivate();
    saveQueue.current = queue;

    void loadPlaylistAfterPendingWrites(repository)
      .then((loadedPlaylist) => {
        if (!queue.isActive()) {
          return;
        }

        setSession({
          repository,
          sourceId,
          phase: "awaiting-catalog",
          loadedPlaylist,
          baselinePlaylist: latestPlaylist.current,
          resetToEmptyWhenNoSnapshot: loadedPlaylist === null && repositoryChanged
        });
      })
      .catch(() => {
        if (!queue.isActive()) {
          return;
        }

        queue.deactivate();
        handledPlaylist.current = {
          sourceId,
          playlist: latestPlaylist.current
        };
        setSession({
          repository,
          sourceId,
          phase: "error",
          errorMessage: "无法恢复临时歌单；为避免覆盖原有数据，本次更改不会自动保存。"
        });
      });

    return () => {
      queue.deactivate();
    };
  }, [repository]);

  const activeSession = session?.repository === repository ? session : undefined;

  useEffect(() => {
    if (
      !activeSession ||
      activeSession.phase !== "awaiting-catalog" ||
      catalogStatus === "loading" ||
      initializationSourceId.current === activeSession.sourceId
    ) {
      return;
    }

    initializationSourceId.current = activeSession.sourceId;
    const queue = saveQueue.current;

    if (!queue || queue.sourceId !== activeSession.sourceId) {
      return;
    }

    void Promise.resolve().then(() => {
      if (!queue.isActive()) {
        return;
      }

      if (catalogStatus === "error") {
        queue.deactivate();
        handledPlaylist.current = {
          sourceId: activeSession.sourceId,
          playlist: latestPlaylist.current
        };
        setSession({
          repository,
          sourceId: activeSession.sourceId,
          phase: "error",
          errorMessage:
            "用户目录未能完整加载，临时歌单未恢复；为避免误删或覆盖，当前更改不会自动保存。"
        });
        return;
      }

      if (activeSession.loadedPlaylist === null) {
        if (activeSession.resetToEmptyWhenNoSnapshot) {
          setSession({
            repository,
            sourceId: activeSession.sourceId,
            phase: "hydrating",
            expectedPlaylist: initialPlaylist.current,
            shouldSaveReconciledPlaylist: false
          });
          onHydrate(initialPlaylist.current);
          return;
        }

        const currentPlaylist = latestPlaylist.current;

        handledPlaylist.current = {
          sourceId: activeSession.sourceId,
          playlist: currentPlaylist
        };
        setSession({
          repository,
          sourceId: activeSession.sourceId,
          phase: "ready"
        });

        if (currentPlaylist !== activeSession.baselinePlaylist) {
          queue.enqueue(currentPlaylist);
        }
        return;
      }

      const reconciled = reconcilePlaylistWithCatalog(
        activeSession.loadedPlaylist,
        tracks
      );

      setSession({
        repository,
        sourceId: activeSession.sourceId,
        phase: "hydrating",
        expectedPlaylist: reconciled.playlist,
        shouldSaveReconciledPlaylist: reconciled.removedItemCount > 0,
        ...(reconciled.removedItemCount > 0
          ? {
              noticeMessage: `已从临时歌单移除 ${reconciled.removedItemCount} 个目录中已不存在的歌曲项。`
            }
          : {})
      });
      onHydrate(reconciled.playlist);
    });
  }, [activeSession, catalogStatus, onHydrate, repository, tracks]);

  useEffect(() => {
    if (
      !activeSession ||
      activeSession.phase !== "hydrating" ||
      playlist !== activeSession.expectedPlaylist ||
      hydratedSourceId.current === activeSession.sourceId
    ) {
      return;
    }

    hydratedSourceId.current = activeSession.sourceId;
    const queue = saveQueue.current;

    if (!queue || queue.sourceId !== activeSession.sourceId) {
      return;
    }

    void Promise.resolve().then(() => {
      if (!queue.isActive()) {
        return;
      }

      handledPlaylist.current = {
        sourceId: activeSession.sourceId,
        playlist
      };
      setSession({
        repository,
        sourceId: activeSession.sourceId,
        phase: "ready",
        ...(activeSession.noticeMessage
          ? { noticeMessage: activeSession.noticeMessage }
          : {})
      });

      if (activeSession.shouldSaveReconciledPlaylist) {
        queue.enqueue(playlist);
      }
    });
  }, [activeSession, playlist, repository]);

  useEffect(() => {
    if (!activeSession || activeSession.phase !== "ready") {
      return;
    }

    const lastHandledPlaylist = handledPlaylist.current;

    if (
      lastHandledPlaylist?.sourceId === activeSession.sourceId &&
      lastHandledPlaylist.playlist === playlist
    ) {
      return;
    }

    const queue = saveQueue.current;

    if (!queue || queue.sourceId !== activeSession.sourceId || !queue.isActive()) {
      return;
    }

    handledPlaylist.current = {
      sourceId: activeSession.sourceId,
      playlist
    };
    queue.enqueue(playlist);
  }, [activeSession, playlist]);

  if (!activeSession) {
    return {
      status: "loading",
      canMutate: false,
      loadingMessage: "正在读取已保存的临时歌单。"
    };
  }

  if (activeSession.phase === "error") {
    return {
      status: "error",
      canMutate: true,
      errorMessage: activeSession.errorMessage
    };
  }

  if (activeSession.phase === "ready") {
    return {
      status: "ready",
      canMutate: true,
      ...(activeSession.noticeMessage
        ? { noticeMessage: activeSession.noticeMessage }
        : {}),
      ...(activeSession.saveErrorMessage
        ? { errorMessage: activeSession.saveErrorMessage }
        : {})
    };
  }

  return {
    status: "loading",
    canMutate:
      activeSession.phase === "awaiting-catalog" &&
      activeSession.loadedPlaylist === null &&
      !activeSession.resetToEmptyWhenNoSnapshot,
    loadingMessage:
      activeSession.phase === "awaiting-catalog" &&
      activeSession.loadedPlaylist === null &&
      !activeSession.resetToEmptyWhenNoSnapshot
        ? "正在等待目录加载完成，临时歌单更改将在之后自动保存。"
        : "正在等待目录加载完成，以安全恢复临时歌单。",
    ...(activeSession.phase === "hydrating" && activeSession.noticeMessage
      ? { noticeMessage: activeSession.noticeMessage }
      : {})
  };
}

export function reconcilePlaylistWithCatalog(
  playlist: TemporaryPlaylist,
  tracks: readonly Track[]
): ReconciledPlaylist {
  const validTrackIds = new Set(tracks.map((track) => track.id));
  const validItemIds = playlist.itemIds.filter((itemId) => {
    const item = playlist.itemsById[itemId];

    return Boolean(item && validTrackIds.has(item.trackId));
  });
  const removedItemCount = playlist.itemIds.length - validItemIds.length;

  if (removedItemCount === 0) {
    return { playlist, removedItemCount };
  }

  const itemsById: Record<EntityId, PlaylistItem> = {};

  for (const itemId of validItemIds) {
    const item = playlist.itemsById[itemId];

    if (item) {
      itemsById[itemId] = item;
    }
  }

  return {
    playlist: {
      ...playlist,
      itemIds: validItemIds,
      itemsById
    },
    removedItemCount
  };
}

function createPlaylistSaveQueue(
  sourceId: number,
  repository: TemporaryPlaylistRepository,
  onResult: (saveSucceeded: boolean) => void
): PlaylistSaveQueue {
  let acceptsNewSaves = true;
  let reportsResults = true;
  let saveInProgress = false;
  let pendingPlaylist: TemporaryPlaylist | undefined;

  async function drain(): Promise<void> {
    while (pendingPlaylist) {
      const playlist = pendingPlaylist;

      pendingPlaylist = undefined;

      try {
        await savePlaylistInRepositoryOrder(repository, playlist);

        if (reportsResults) {
          onResult(true);
        }
      } catch {
        if (reportsResults) {
          onResult(false);
        }
      }
    }

    saveInProgress = false;
  }

  return {
    sourceId,
    enqueue(playlist) {
      if (!acceptsNewSaves) {
        return;
      }

      pendingPlaylist = playlist;

      if (!saveInProgress) {
        saveInProgress = true;
        void drain();
      }
    },
    deactivate() {
      acceptsNewSaves = false;
      reportsResults = false;

      if (pendingPlaylist) {
        const finalPlaylist = pendingPlaylist;

        pendingPlaylist = undefined;
        void savePlaylistInRepositoryOrder(repository, finalPlaylist).catch(
          () => undefined
        );
      }
    },
    isActive() {
      return acceptsNewSaves;
    }
  };
}

const repositoryWriteTails = new WeakMap<TemporaryPlaylistRepository, Promise<void>>();

function savePlaylistInRepositoryOrder(
  repository: TemporaryPlaylistRepository,
  playlist: TemporaryPlaylist
): Promise<void> {
  const previousWrite = repositoryWriteTails.get(repository) ?? Promise.resolve();
  const currentWrite = previousWrite.then(() => repository.save(playlist));

  repositoryWriteTails.set(
    repository,
    currentWrite.catch(() => undefined)
  );

  return currentWrite;
}

async function loadPlaylistAfterPendingWrites(
  repository: TemporaryPlaylistRepository
): Promise<TemporaryPlaylist | null> {
  await repositoryWriteTails.get(repository);

  return repository.load();
}
