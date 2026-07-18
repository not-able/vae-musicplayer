import { useCallback, useEffect, useRef, useState } from "react";

import type { EntityId, LocalAudioFileRecord } from "../../types";
import {
  createLocalAudioFileRecord,
  getLocalAudioFileValidationError
} from "./localAudioFile";
import type { LocalAudioFileRepository } from "./localAudioRepository";

export type LocalAudioLibraryStatus = "loading" | "ready" | "error";

export interface LocalAudioBindingRequest {
  trackId: EntityId;
  file: File;
}

export interface LocalAudioBatchBindingFailure {
  trackId: EntityId;
  fileName: string;
  reason: string;
}

export interface LocalAudioBatchBindingResult {
  boundTrackIds: readonly EntityId[];
  failed: readonly LocalAudioBatchBindingFailure[];
}

export interface LocalAudioLibrary {
  bindingsByTrackId: ReadonlyMap<EntityId, LocalAudioFileRecord>;
  bindingRevisionsByTrackId: ReadonlyMap<EntityId, number>;
  pendingTrackIds: ReadonlySet<EntityId>;
  status: LocalAudioLibraryStatus;
  errorMessage?: string;
  bindAudioFile: (trackId: EntityId, file: File) => Promise<boolean>;
  bindAudioFiles: (
    requests: readonly LocalAudioBindingRequest[]
  ) => Promise<LocalAudioBatchBindingResult>;
  unbindAudioFile: (trackId: EntityId) => Promise<boolean>;
  forgetAudioBindings: (trackIds: readonly EntityId[]) => void;
}

export function useLocalAudioLibrary(
  repository: LocalAudioFileRepository
): LocalAudioLibrary {
  const [bindingsByTrackId, setBindingsByTrackId] = useState<
    ReadonlyMap<EntityId, LocalAudioFileRecord>
  >(() => new Map());
  const [bindingRevisionsByTrackId, setBindingRevisionsByTrackId] = useState<
    ReadonlyMap<EntityId, number>
  >(() => new Map());
  const [pendingTrackIds, setPendingTrackIds] = useState<ReadonlySet<EntityId>>(
    () => new Set()
  );
  const [status, setStatus] = useState<LocalAudioLibraryStatus>("loading");
  const [errorMessage, setErrorMessage] = useState<string>();
  const bindingsByTrackIdRef = useRef<ReadonlyMap<EntityId, LocalAudioFileRecord>>(
    new Map()
  );
  const claimedTrackIdsRef = useRef<Set<EntityId>>(new Set());

  useEffect(() => {
    let isActive = true;

    void repository
      .list()
      .then((records) => {
        if (!isActive) {
          return;
        }

        const nextBindings = new Map(records.map((record) => [record.trackId, record]));
        bindingsByTrackIdRef.current = nextBindings;
        setBindingsByTrackId(nextBindings);
        setBindingRevisionsByTrackId(
          new Map(records.map((record) => [record.trackId, 1]))
        );
        setStatus("ready");
      })
      .catch(() => {
        if (!isActive) {
          return;
        }

        setStatus("error");
        setErrorMessage("无法读取本地音频映射，请检查浏览器是否允许使用 IndexedDB。");
      });

    return () => {
      isActive = false;
    };
  }, [repository]);

  const bindAudioFile = useCallback(
    async (trackId: EntityId, file: File): Promise<boolean> => {
      const validationError = getLocalAudioFileValidationError(file);

      if (validationError) {
        setErrorMessage(validationError);
        return false;
      }
      if (claimedTrackIdsRef.current.has(trackId)) {
        setErrorMessage("该歌曲正在更新本地音频，请等待当前操作完成。");
        return false;
      }

      claimedTrackIdsRef.current.add(trackId);
      setPendingTrackIds((currentIds) => addId(currentIds, trackId));
      setErrorMessage(undefined);

      try {
        const record = createLocalAudioFileRecord(
          trackId,
          file,
          new Date().toISOString()
        );

        await repository.save(record);
        const nextBindings = new Map(bindingsByTrackIdRef.current);
        nextBindings.set(trackId, record);
        bindingsByTrackIdRef.current = nextBindings;
        setBindingsByTrackId((currentBindings) => {
          const nextBindings = new Map(currentBindings);
          nextBindings.set(trackId, record);
          return nextBindings;
        });
        setBindingRevisionsByTrackId((currentRevisions) =>
          incrementBindingRevision(currentRevisions, trackId)
        );
        return true;
      } catch (error) {
        setErrorMessage(getStorageWriteErrorMessage(error));
        return false;
      } finally {
        claimedTrackIdsRef.current.delete(trackId);
        setPendingTrackIds((currentIds) => removeId(currentIds, trackId));
      }
    },
    [repository]
  );

  const bindAudioFiles = useCallback(
    async (
      requests: readonly LocalAudioBindingRequest[]
    ): Promise<LocalAudioBatchBindingResult> => {
      const failed: LocalAudioBatchBindingFailure[] = [];
      const requestsByTrackId = new Map<EntityId, LocalAudioBindingRequest>();
      const duplicateTrackIds = new Set<EntityId>();

      for (const request of requests) {
        const validationError = getLocalAudioFileValidationError(request.file);

        if (validationError) {
          failed.push({
            trackId: request.trackId,
            fileName: request.file.name,
            reason: validationError
          });
          continue;
        }
        if (
          bindingsByTrackIdRef.current.has(request.trackId) ||
          claimedTrackIdsRef.current.has(request.trackId)
        ) {
          failed.push({
            trackId: request.trackId,
            fileName: request.file.name,
            reason: "该歌曲已有本地音频绑定，批量导入不会覆盖它。"
          });
          continue;
        }
        if (requestsByTrackId.has(request.trackId)) {
          duplicateTrackIds.add(request.trackId);
          failed.push({
            trackId: request.trackId,
            fileName: request.file.name,
            reason: "同一首歌曲不能同时绑定多个文件。"
          });
          continue;
        }

        requestsByTrackId.set(request.trackId, request);
      }

      for (const trackId of duplicateTrackIds) {
        const firstRequest = requestsByTrackId.get(trackId);

        if (firstRequest) {
          failed.push({
            trackId,
            fileName: firstRequest.file.name,
            reason: "同一首歌曲不能同时绑定多个文件。"
          });
          requestsByTrackId.delete(trackId);
        }
      }

      const validRequests = [...requestsByTrackId.values()];
      if (validRequests.length === 0) {
        if (failed.length > 0) {
          setErrorMessage("部分本地音频未保存，请查看导入结果。");
        }
        return { boundTrackIds: [], failed };
      }

      for (const request of validRequests) {
        claimedTrackIdsRef.current.add(request.trackId);
      }
      setPendingTrackIds((currentIds) => {
        const nextIds = new Set(currentIds);
        for (const request of validRequests) {
          nextIds.add(request.trackId);
        }
        return nextIds;
      });
      setErrorMessage(undefined);

      const savedRecords: LocalAudioFileRecord[] = [];

      try {
        for (const request of validRequests) {
          const record = createLocalAudioFileRecord(
            request.trackId,
            request.file,
            new Date().toISOString()
          );

          try {
            await repository.save(record);
            savedRecords.push(record);
          } catch (error) {
            failed.push({
              trackId: request.trackId,
              fileName: request.file.name,
              reason: getStorageWriteErrorMessage(error)
            });
          }
        }

        if (savedRecords.length > 0) {
          const nextBindings = new Map(bindingsByTrackIdRef.current);
          for (const record of savedRecords) {
            nextBindings.set(record.trackId, record);
          }
          bindingsByTrackIdRef.current = nextBindings;
          setBindingsByTrackId((currentBindings) => {
            const nextBindings = new Map(currentBindings);
            for (const record of savedRecords) {
              nextBindings.set(record.trackId, record);
            }
            return nextBindings;
          });
          setBindingRevisionsByTrackId((currentRevisions) => {
            let nextRevisions = currentRevisions;
            for (const record of savedRecords) {
              nextRevisions = incrementBindingRevision(nextRevisions, record.trackId);
            }
            return nextRevisions;
          });
        }
        if (failed.length > 0) {
          setErrorMessage("部分本地音频未保存，请查看导入结果。");
        }

        return {
          boundTrackIds: savedRecords.map((record) => record.trackId),
          failed
        };
      } finally {
        setPendingTrackIds((currentIds) => {
          const nextIds = new Set(currentIds);
          for (const request of validRequests) {
            nextIds.delete(request.trackId);
          }
          return nextIds;
        });
        for (const request of validRequests) {
          claimedTrackIdsRef.current.delete(request.trackId);
        }
      }
    },
    [repository]
  );

  const unbindAudioFile = useCallback(
    async (trackId: EntityId): Promise<boolean> => {
      if (claimedTrackIdsRef.current.has(trackId)) {
        setErrorMessage("该歌曲正在更新本地音频，请等待当前操作完成。");
        return false;
      }

      claimedTrackIdsRef.current.add(trackId);
      setPendingTrackIds((currentIds) => addId(currentIds, trackId));
      setErrorMessage(undefined);

      try {
        await repository.remove(trackId);
        const nextBindings = new Map(bindingsByTrackIdRef.current);
        nextBindings.delete(trackId);
        bindingsByTrackIdRef.current = nextBindings;
        setBindingsByTrackId((currentBindings) => {
          const nextBindings = new Map(currentBindings);
          nextBindings.delete(trackId);
          return nextBindings;
        });
        setBindingRevisionsByTrackId((currentRevisions) =>
          incrementBindingRevision(currentRevisions, trackId)
        );
        return true;
      } catch (error) {
        setErrorMessage(getStorageWriteErrorMessage(error));
        return false;
      } finally {
        claimedTrackIdsRef.current.delete(trackId);
        setPendingTrackIds((currentIds) => removeId(currentIds, trackId));
      }
    },
    [repository]
  );

  const forgetAudioBindings = useCallback((trackIds: readonly EntityId[]) => {
    if (trackIds.length === 0) {
      return;
    }

    setBindingsByTrackId((currentBindings) => {
      const nextBindings = new Map(currentBindings);

      for (const trackId of trackIds) {
        nextBindings.delete(trackId);
      }

      return nextBindings;
    });
    const nextBindings = new Map(bindingsByTrackIdRef.current);
    for (const trackId of trackIds) {
      nextBindings.delete(trackId);
    }
    bindingsByTrackIdRef.current = nextBindings;
    setBindingRevisionsByTrackId((currentRevisions) => {
      let nextRevisions = currentRevisions;

      for (const trackId of trackIds) {
        nextRevisions = incrementBindingRevision(nextRevisions, trackId);
      }

      return nextRevisions;
    });
  }, []);

  return {
    bindingsByTrackId,
    bindingRevisionsByTrackId,
    pendingTrackIds,
    status,
    errorMessage,
    bindAudioFile,
    bindAudioFiles,
    unbindAudioFile,
    forgetAudioBindings
  };
}

function incrementBindingRevision(
  revisions: ReadonlyMap<EntityId, number>,
  trackId: EntityId
): ReadonlyMap<EntityId, number> {
  const nextRevisions = new Map(revisions);
  nextRevisions.set(trackId, (nextRevisions.get(trackId) ?? 0) + 1);
  return nextRevisions;
}

function addId(ids: ReadonlySet<EntityId>, id: EntityId): ReadonlySet<EntityId> {
  const nextIds = new Set(ids);
  nextIds.add(id);
  return nextIds;
}

function removeId(ids: ReadonlySet<EntityId>, id: EntityId): ReadonlySet<EntityId> {
  const nextIds = new Set(ids);
  nextIds.delete(id);
  return nextIds;
}

function getStorageWriteErrorMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === "QuotaExceededError") {
    return "本地存储空间不足，无法保存这个音频文件。";
  }

  return "无法保存本地音频文件，请检查浏览器存储权限和剩余空间。";
}
