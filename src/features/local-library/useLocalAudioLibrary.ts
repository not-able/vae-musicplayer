import { useCallback, useEffect, useState } from "react";

import type { EntityId, LocalAudioFileRecord } from "../../types";
import {
  createLocalAudioFileRecord,
  getLocalAudioFileValidationError
} from "./localAudioFile";
import type { LocalAudioFileRepository } from "./localAudioRepository";

export type LocalAudioLibraryStatus = "loading" | "ready" | "error";

export interface LocalAudioLibrary {
  bindingsByTrackId: ReadonlyMap<EntityId, LocalAudioFileRecord>;
  bindingRevisionsByTrackId: ReadonlyMap<EntityId, number>;
  pendingTrackIds: ReadonlySet<EntityId>;
  status: LocalAudioLibraryStatus;
  errorMessage?: string;
  bindAudioFile: (trackId: EntityId, file: File) => Promise<boolean>;
  unbindAudioFile: (trackId: EntityId) => Promise<boolean>;
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

  useEffect(() => {
    let isActive = true;

    void repository
      .list()
      .then((records) => {
        if (!isActive) {
          return;
        }

        setBindingsByTrackId(
          new Map(records.map((record) => [record.trackId, record]))
        );
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

      setPendingTrackIds((currentIds) => addId(currentIds, trackId));
      setErrorMessage(undefined);

      try {
        const record = createLocalAudioFileRecord(
          trackId,
          file,
          new Date().toISOString()
        );

        await repository.save(record);
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
        setPendingTrackIds((currentIds) => removeId(currentIds, trackId));
      }
    },
    [repository]
  );

  const unbindAudioFile = useCallback(
    async (trackId: EntityId): Promise<boolean> => {
      setPendingTrackIds((currentIds) => addId(currentIds, trackId));
      setErrorMessage(undefined);

      try {
        await repository.remove(trackId);
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
        setPendingTrackIds((currentIds) => removeId(currentIds, trackId));
      }
    },
    [repository]
  );

  return {
    bindingsByTrackId,
    bindingRevisionsByTrackId,
    pendingTrackIds,
    status,
    errorMessage,
    bindAudioFile,
    unbindAudioFile
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
