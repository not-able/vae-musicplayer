import { useCallback, useEffect, useRef, useState } from "react";

import type {
  CatalogData,
  EntityId,
  LocalAudioFileRecord,
  TemporaryPlaylist,
  UserCatalogChanges
} from "../../types";
import type { LocalAudioFileRepository } from "../local-library/localAudioRepository";
import type { LocalAudioLibraryStatus } from "../local-library/useLocalAudioLibrary";
import type { TemporaryPlaylistRepository } from "../playlist/playlistRepository";
import {
  createCatalogDeletionPlan,
  type CatalogDeletionPreview,
  type CatalogDeletionTarget
} from "./catalogDeletion";
import {
  completeCatalogDeletion,
  startCatalogDeletion
} from "./catalogDeletionExecution";
import type {
  CatalogDeletionIntent,
  CatalogDeletionIntentRepository
} from "./catalogDeletionRepository";
import type { LocalCatalogRepository } from "./localCatalogRepository";
import {
  isCatalogWriteLocked,
  releaseCatalogWriteLock,
  tryAcquireCatalogWriteLock
} from "./catalogWriteLock";

type CatalogStatus = "loading" | "ready" | "error";

export interface CatalogDeletionResult {
  ok: boolean;
  errorMessage?: string;
}

export interface CatalogDeletionController {
  canDelete: boolean;
  isDeleting: boolean;
  isRecovering: boolean;
  errorMessage?: string;
  previewDeletion: (
    target: CatalogDeletionTarget
  ) => CatalogDeletionPreview | undefined;
  deleteTarget: (target: CatalogDeletionTarget) => Promise<CatalogDeletionResult>;
}

interface UseCatalogDeletionOptions {
  defaultCatalog: CatalogData;
  catalogChanges?: UserCatalogChanges;
  catalogStatus: CatalogStatus;
  playlist: TemporaryPlaylist;
  playlistIsReady: boolean;
  playlistRepository: TemporaryPlaylistRepository;
  audioBindings: ReadonlyMap<EntityId, LocalAudioFileRecord>;
  audioStatus: LocalAudioLibraryStatus;
  audioRepository: LocalAudioFileRepository;
  catalogRepository: LocalCatalogRepository;
  intentRepository: CatalogDeletionIntentRepository;
  onBeforeDelete: (trackIds: readonly EntityId[]) => void;
  onCommitted: (intent: CatalogDeletionIntent) => void;
}

export function useCatalogDeletion({
  defaultCatalog,
  catalogChanges,
  catalogStatus,
  playlist,
  playlistIsReady,
  playlistRepository,
  audioBindings,
  audioStatus,
  audioRepository,
  catalogRepository,
  intentRepository,
  onBeforeDelete,
  onCommitted
}: UseCatalogDeletionOptions): CatalogDeletionController {
  const [phase, setPhase] = useState<"idle" | "recovering" | "deleting" | "error">(
    "idle"
  );
  const [errorMessage, setErrorMessage] = useState<string>();
  const [recoveredIntentRepository, setRecoveredIntentRepository] = useState<
    CatalogDeletionIntentRepository | undefined
  >(undefined);
  const checkedIntentRepository = useRef<CatalogDeletionIntentRepository | undefined>(
    undefined
  );
  const mutationInProgress = useRef(false);
  const deletionWriteOwner = useRef(
    `catalog_deletion_${globalThis.crypto.randomUUID()}`
  );
  const onCommittedRef = useRef(onCommitted);
  const isOperational =
    catalogStatus === "ready" &&
    catalogChanges !== undefined &&
    playlistIsReady &&
    audioStatus === "ready";

  useEffect(() => {
    onCommittedRef.current = onCommitted;
  }, [onCommitted]);

  useEffect(() => {
    if (!isOperational || checkedIntentRepository.current === intentRepository) {
      return;
    }

    let active = true;
    checkedIntentRepository.current = intentRepository;

    void intentRepository
      .load()
      .then(async (intent) => {
        if (!intent) {
          return;
        }

        const writeOwner = deletionWriteOwner.current;
        if (!tryAcquireCatalogWriteLock(writeOwner)) {
          throw new Error("Catalog recovery is blocked by another write.");
        }

        mutationInProgress.current = true;
        if (active) {
          setPhase("recovering");
          setErrorMessage(undefined);
          setRecoveredIntentRepository(undefined);
        }

        try {
          await completeCatalogDeletion(
            {
              catalogRepository,
              playlistRepository,
              audioRepository,
              intentRepository
            },
            intent
          );

          if (active) {
            onCommittedRef.current(intent);
          }
        } finally {
          mutationInProgress.current = false;
          releaseCatalogWriteLock(writeOwner);
        }
      })
      .then(() => {
        if (active) {
          setPhase("idle");
          setRecoveredIntentRepository(intentRepository);
        }
      })
      .catch(() => {
        if (active) {
          setPhase("error");
          setErrorMessage(
            "上次目录删除尚未完成。为避免留下不一致的数据，请刷新页面后重试恢复。"
          );
        }
      });

    return () => {
      active = false;
    };
  }, [
    audioRepository,
    catalogRepository,
    intentRepository,
    isOperational,
    playlistRepository
  ]);

  const previewDeletion = useCallback(
    (target: CatalogDeletionTarget): CatalogDeletionPreview | undefined => {
      if (!catalogChanges) {
        return undefined;
      }

      try {
        return createCatalogDeletionPlan({
          defaultCatalog,
          changes: catalogChanges,
          playlist,
          audioBindings,
          target,
          updatedAt: new Date().toISOString()
        });
      } catch {
        return undefined;
      }
    },
    [audioBindings, catalogChanges, defaultCatalog, playlist]
  );

  const deleteTarget = useCallback(
    async (target: CatalogDeletionTarget): Promise<CatalogDeletionResult> => {
      if (
        !isOperational ||
        phase !== "idle" ||
        mutationInProgress.current ||
        !catalogChanges
      ) {
        return {
          ok: false,
          errorMessage: "目录、歌单或本地音频尚未准备好，暂时不能安全删除。"
        };
      }

      const writeOwner = deletionWriteOwner.current;
      if (!tryAcquireCatalogWriteLock(writeOwner)) {
        return {
          ok: false,
          errorMessage: "目录导入或其他目录删除正在保存，请稍后再试。"
        };
      }

      let plan;
      try {
        plan = createCatalogDeletionPlan({
          defaultCatalog,
          changes: catalogChanges,
          playlist,
          audioBindings,
          target,
          updatedAt: new Date().toISOString()
        });
      } catch {
        releaseCatalogWriteLock(writeOwner);
        return {
          ok: false,
          errorMessage: "要删除的目录记录已不存在，请刷新后重试。"
        };
      }

      mutationInProgress.current = true;
      setPhase("deleting");
      setErrorMessage(undefined);
      onBeforeDelete(plan.trackIds);

      try {
        const intent = await startCatalogDeletion(
          {
            catalogRepository,
            playlistRepository,
            audioRepository,
            intentRepository
          },
          plan,
          `catalog_deletion_${globalThis.crypto.randomUUID()}`,
          new Date().toISOString()
        );

        onCommitted(intent);
        setPhase("idle");
        return { ok: true };
      } catch {
        const nextErrorMessage =
          "目录删除未能完整保存；如果恢复记录已写入，刷新页面后会继续完成或提示恢复失败。";

        setPhase("error");
        setErrorMessage(nextErrorMessage);
        return { ok: false, errorMessage: nextErrorMessage };
      } finally {
        mutationInProgress.current = false;
        releaseCatalogWriteLock(writeOwner);
      }
    },
    [
      audioBindings,
      audioRepository,
      catalogChanges,
      catalogRepository,
      defaultCatalog,
      intentRepository,
      isOperational,
      onBeforeDelete,
      onCommitted,
      phase,
      playlist,
      playlistRepository
    ]
  );

  return {
    canDelete:
      isOperational &&
      phase === "idle" &&
      recoveredIntentRepository === intentRepository &&
      !isCatalogWriteLocked(),
    isDeleting: phase === "deleting",
    isRecovering: phase === "recovering",
    ...(errorMessage ? { errorMessage } : {}),
    previewDeletion,
    deleteTarget
  };
}
