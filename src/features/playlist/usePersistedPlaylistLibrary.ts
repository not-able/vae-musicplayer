import { useEffect, useRef, useState } from "react";

import type {
  EntityId,
  PlaylistDocument,
  PlaylistItem,
  PlaylistLibrary,
  Track
} from "../../types";
import {
  savePlaylistLibraryInRepositoryOrder,
  waitForPlaylistLibraryRepositoryWrites,
  type PlaylistLibraryRepository
} from "./playlistLibraryRepository";

type CatalogStatus = "loading" | "ready" | "error";

type PlaylistLibraryPersistenceSession =
  | {
      repository: PlaylistLibraryRepository;
      sourceId: number;
      phase: "awaiting-catalog";
      loadedLibrary: PlaylistLibrary;
    }
  | {
      repository: PlaylistLibraryRepository;
      sourceId: number;
      phase: "hydrating";
      expectedLibrary: PlaylistLibrary;
      shouldSaveReconciledLibrary: boolean;
      noticeMessage?: string;
    }
  | {
      repository: PlaylistLibraryRepository;
      sourceId: number;
      phase: "ready";
      noticeMessage?: string;
      saveErrorMessage?: string;
    }
  | {
      repository: PlaylistLibraryRepository;
      sourceId: number;
      phase: "error";
      errorMessage: string;
    };

interface UsePersistedPlaylistLibraryOptions {
  library: PlaylistLibrary;
  tracks: readonly Track[];
  catalogStatus: CatalogStatus;
  repository: PlaylistLibraryRepository;
  onHydrate: (library: PlaylistLibrary) => void;
}

export interface PersistedPlaylistLibraryState {
  status: "loading" | "ready" | "error";
  canMutate: boolean;
  loadingMessage?: string;
  noticeMessage?: string;
  errorMessage?: string;
}

export interface ReconciledPlaylistLibrary {
  library: PlaylistLibrary;
  removedItemCount: number;
}

interface HandledLibrary {
  sourceId: number;
  library: PlaylistLibrary;
}

export function usePersistedPlaylistLibrary({
  library,
  tracks,
  catalogStatus,
  repository,
  onHydrate
}: UsePersistedPlaylistLibraryOptions): PersistedPlaylistLibraryState {
  const [session, setSession] = useState<PlaylistLibraryPersistenceSession>();
  const latestLibrary = useRef(library);
  const initialLibrary = useRef(library);
  const sourceSequence = useRef(0);
  const handledLibrary = useRef<HandledLibrary | undefined>(undefined);
  const previousRepository = useRef(repository);
  const latestOnHydrate = useRef(onHydrate);

  useEffect(() => {
    latestLibrary.current = library;
  }, [library]);

  useEffect(() => {
    latestOnHydrate.current = onHydrate;
  }, [onHydrate]);

  useEffect(() => {
    const repositoryChanged = previousRepository.current !== repository;

    previousRepository.current = repository;
    sourceSequence.current += 1;
    const sourceId = sourceSequence.current;
    let active = true;

    void loadPlaylistLibraryAfterPendingWrites(repository)
      .then((loadedLibrary) => {
        if (!active) {
          return;
        }

        if (loadedLibrary === null) {
          const expectedLibrary = repositoryChanged
            ? initialLibrary.current
            : latestLibrary.current;

          if (!repositoryChanged) {
            handledLibrary.current = { sourceId, library: expectedLibrary };
            setSession({ repository, sourceId, phase: "ready" });
            return;
          }

          setSession({
            repository,
            sourceId,
            phase: "hydrating",
            expectedLibrary,
            shouldSaveReconciledLibrary: false
          });
          latestOnHydrate.current(expectedLibrary);
          return;
        }

        setSession({
          repository,
          sourceId,
          phase: "awaiting-catalog",
          loadedLibrary
        });
      })
      .catch(() => {
        if (!active) {
          return;
        }

        handledLibrary.current = { sourceId, library: latestLibrary.current };
        setSession({
          repository,
          sourceId,
          phase: "error",
          errorMessage: "无法恢复歌单库；为避免覆盖原有数据，本次更改不会自动保存。"
        });
      });

    return () => {
      active = false;
    };
  }, [repository]);

  const activeSession = session?.repository === repository ? session : undefined;

  useEffect(() => {
    if (
      !activeSession ||
      activeSession.phase !== "awaiting-catalog" ||
      catalogStatus === "loading"
    ) {
      return;
    }

    void Promise.resolve().then(() => {
      if (catalogStatus === "error") {
        handledLibrary.current = {
          sourceId: activeSession.sourceId,
          library: latestLibrary.current
        };
        setSession({
          repository,
          sourceId: activeSession.sourceId,
          phase: "error",
          errorMessage:
            "用户目录未能完整加载，歌单库未恢复；为避免误删或覆盖，当前更改不会自动保存。"
        });
        return;
      }

      const reconciled = reconcilePlaylistLibraryWithCatalog(
        activeSession.loadedLibrary,
        tracks
      );

      setSession({
        repository,
        sourceId: activeSession.sourceId,
        phase: "hydrating",
        expectedLibrary: reconciled.library,
        shouldSaveReconciledLibrary: reconciled.removedItemCount > 0,
        ...(reconciled.removedItemCount > 0
          ? {
              noticeMessage: `已从歌单库移除 ${reconciled.removedItemCount} 个目录中已不存在的歌曲项。`
            }
          : {})
      });
      onHydrate(reconciled.library);
    });
  }, [activeSession, catalogStatus, onHydrate, repository, tracks]);

  useEffect(() => {
    if (
      !activeSession ||
      activeSession.phase !== "hydrating" ||
      library !== activeSession.expectedLibrary
    ) {
      return;
    }

    void Promise.resolve().then(() => {
      handledLibrary.current = { sourceId: activeSession.sourceId, library };
      setSession({
        repository,
        sourceId: activeSession.sourceId,
        phase: "ready",
        ...(activeSession.noticeMessage
          ? { noticeMessage: activeSession.noticeMessage }
          : {})
      });

      if (activeSession.shouldSaveReconciledLibrary) {
        void savePlaylistLibraryInRepositoryOrder(repository, library).catch(() => {
          setSession((currentSession) =>
            currentSession?.repository === repository &&
            currentSession.phase === "ready"
              ? {
                  ...currentSession,
                  saveErrorMessage: "歌单库保存失败，本次页面中的更改仍然保留。"
                }
              : currentSession
          );
        });
      }
    });
  }, [activeSession, library, repository]);

  useEffect(() => {
    if (!activeSession || activeSession.phase !== "ready") {
      return;
    }

    const lastHandledLibrary = handledLibrary.current;

    if (
      lastHandledLibrary?.sourceId === activeSession.sourceId &&
      lastHandledLibrary.library === library
    ) {
      return;
    }

    handledLibrary.current = { sourceId: activeSession.sourceId, library };
    void savePlaylistLibraryInRepositoryOrder(repository, library)
      .then(() => {
        setSession((currentSession) =>
          currentSession?.repository === repository && currentSession.phase === "ready"
            ? { ...currentSession, saveErrorMessage: undefined }
            : currentSession
        );
      })
      .catch(() => {
        setSession((currentSession) =>
          currentSession?.repository === repository && currentSession.phase === "ready"
            ? {
                ...currentSession,
                saveErrorMessage: "歌单库保存失败，本次页面中的更改仍然保留。"
              }
            : currentSession
        );
      });
  }, [activeSession, library, repository]);

  if (
    !activeSession ||
    activeSession.phase === "awaiting-catalog" ||
    activeSession.phase === "hydrating"
  ) {
    return {
      status: "loading",
      canMutate: false,
      loadingMessage: "正在读取已保存的歌单库。"
    };
  }

  if (activeSession.phase === "error") {
    return {
      status: "error",
      canMutate: true,
      errorMessage: activeSession.errorMessage
    };
  }

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

export function reconcilePlaylistLibraryWithCatalog(
  library: PlaylistLibrary,
  tracks: readonly Track[]
): ReconciledPlaylistLibrary {
  const validTrackIds = new Set(tracks.map((track) => track.id));
  const temporaryResult = reconcilePlaylistDocument(
    library.temporaryPlaylist,
    validTrackIds
  );
  let removedItemCount = temporaryResult.removedItemCount;
  let savedLibraryChanged = false;
  const savedPlaylistsById: Record<EntityId, PlaylistDocument> = {};

  for (const savedPlaylistId of library.savedPlaylistIds) {
    const savedPlaylist = library.savedPlaylistsById[savedPlaylistId];

    if (!savedPlaylist) {
      throw new Error(`Saved playlist ${savedPlaylistId} is missing.`);
    }

    const result = reconcilePlaylistDocument(savedPlaylist, validTrackIds);
    savedPlaylistsById[savedPlaylistId] = result.playlist;
    removedItemCount += result.removedItemCount;
    savedLibraryChanged ||= result.playlist !== savedPlaylist;
  }

  if (temporaryResult.playlist === library.temporaryPlaylist && !savedLibraryChanged) {
    return { library, removedItemCount: 0 };
  }

  return {
    library: {
      ...library,
      temporaryPlaylist: temporaryResult.playlist,
      savedPlaylistsById
    },
    removedItemCount
  };
}

function reconcilePlaylistDocument(
  playlist: PlaylistDocument,
  validTrackIds: ReadonlySet<EntityId>
): { playlist: PlaylistDocument; removedItemCount: number } {
  const itemIds = playlist.itemIds.filter((itemId) => {
    const item = playlist.itemsById[itemId];

    return item !== undefined && validTrackIds.has(item.trackId);
  });
  const removedItemCount = playlist.itemIds.length - itemIds.length;

  if (removedItemCount === 0) {
    return { playlist, removedItemCount };
  }

  const itemsById: Record<EntityId, PlaylistItem> = {};

  for (const itemId of itemIds) {
    const item = playlist.itemsById[itemId];

    if (item) {
      itemsById[itemId] = item;
    }
  }

  return {
    playlist: { ...playlist, itemIds, itemsById },
    removedItemCount
  };
}

async function loadPlaylistLibraryAfterPendingWrites(
  repository: PlaylistLibraryRepository
): Promise<PlaylistLibrary | null> {
  await waitForPlaylistLibraryRepositoryWrites(repository);

  return repository.load();
}
