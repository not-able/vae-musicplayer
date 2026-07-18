import { useCallback, useEffect, useRef, useState } from "react";

import type { AlbumType, CatalogData, EntityId, UserCatalogChanges } from "../../types";
import { mergeCatalogChanges } from "./catalogMerge";
import {
  addAlbumToUserCatalog,
  addTrackToUserCatalog,
  patchAlbumInUserCatalog,
  patchTrackInUserCatalog,
  resetAlbumInUserCatalog,
  resetTrackInUserCatalog,
  type CatalogAlbumPatch,
  type CatalogEntityIdFactory
} from "./catalogMutations";
import { isPositiveSafeInteger } from "./catalogValidation";
import {
  releaseCatalogWriteLock,
  tryAcquireCatalogWriteLock
} from "./catalogWriteLock";
import type { LocalCatalogRepository } from "./localCatalogRepository";

const albumTypes = new Set<AlbumType>(["album", "ep", "single_collection", "other"]);

export type CatalogLibraryStatus = "loading" | "ready" | "error";

export interface CatalogAlbumDraft {
  title: string;
  type: AlbumType;
}

export interface CatalogTrackDraft {
  title: string;
  trackNumber: number;
}

export interface CatalogAlbumUpdateDraft {
  title: string;
  type: AlbumType;
}

export interface CatalogTrackUpdateDraft {
  title: string;
  trackNumber: number | null;
}

export interface CatalogDirectoryImportTrackDraft {
  sourceId: string;
  title: string;
  trackNumber: number;
}

export interface CatalogDirectoryImportAlbumDraft {
  title: string;
  artistId: EntityId;
  tracks: readonly CatalogDirectoryImportTrackDraft[];
}

type CatalogMutationFailure = {
  ok: false;
  code: "not_ready" | "busy" | "invalid_input" | "invalid_catalog" | "save_failed";
  errorMessage: string;
};

export type CatalogAlbumCreationResult =
  { ok: true; albumId: EntityId } | CatalogMutationFailure;

export type CatalogTrackCreationResult =
  { ok: true; trackId: EntityId } | CatalogMutationFailure;

export type CatalogMutationResult = { ok: true } | CatalogMutationFailure;

export type CatalogDirectoryImportResult =
  | { ok: true; trackIdsBySourceId: ReadonlyMap<string, EntityId> }
  | CatalogMutationFailure;

export interface CatalogLibrary {
  catalog: CatalogData;
  changes?: UserCatalogChanges;
  status: CatalogLibraryStatus;
  errorMessage?: string;
  isSavingAlbum: boolean;
  isSavingTrack: boolean;
  resettableAlbumIds: ReadonlySet<EntityId>;
  resettableTrackIds: ReadonlySet<EntityId>;
  createAlbum: (draft: CatalogAlbumDraft) => Promise<CatalogAlbumCreationResult>;
  createTrack: (
    albumId: EntityId,
    draft: CatalogTrackDraft
  ) => Promise<CatalogTrackCreationResult>;
  updateAlbum: (
    albumId: EntityId,
    draft: CatalogAlbumUpdateDraft
  ) => Promise<CatalogMutationResult>;
  updateTrack: (
    trackId: EntityId,
    draft: CatalogTrackUpdateDraft
  ) => Promise<CatalogMutationResult>;
  resetAlbum: (albumId: EntityId) => Promise<CatalogMutationResult>;
  resetTrack: (trackId: EntityId) => Promise<CatalogMutationResult>;
  importDirectoryCatalogDrafts: (
    drafts: readonly CatalogDirectoryImportAlbumDraft[]
  ) => Promise<CatalogDirectoryImportResult>;
  applyPersistedChanges: (changes: UserCatalogChanges) => void;
}

interface CatalogSourceToken {
  active: boolean;
}

type CatalogLibraryState =
  | {
      catalog: CatalogData;
      status: "ready";
      changes: UserCatalogChanges;
    }
  | {
      catalog: CatalogData;
      status: "error";
      errorMessage: string;
    };

interface CatalogLoadResult {
  defaultCatalog: CatalogData;
  repository: LocalCatalogRepository;
  sourceToken: CatalogSourceToken;
  state: CatalogLibraryState;
}

type CatalogSaveOperation = "album" | "track" | "directory_import";

type CatalogSaveResult =
  | {
      ok: true;
      changes: UserCatalogChanges;
    }
  | CatalogMutationFailure;

export function useCatalogLibrary(
  defaultCatalog: CatalogData,
  repository: LocalCatalogRepository,
  idFactory?: CatalogEntityIdFactory
): CatalogLibrary {
  const [loadResult, setLoadResult] = useState<CatalogLoadResult>();
  const [saveOperation, setSaveOperation] = useState<CatalogSaveOperation>();
  const saveInProgress = useRef(false);
  const directoryImportWriteOwner = useRef(
    `directory_import_${globalThis.crypto.randomUUID()}`
  );

  useEffect(() => {
    const sourceToken: CatalogSourceToken = { active: true };

    async function loadCatalog(): Promise<void> {
      try {
        const changes = await repository.load();
        const catalog = mergeCatalogChanges(defaultCatalog, changes);

        if (sourceToken.active) {
          setLoadResult({
            defaultCatalog,
            repository,
            sourceToken,
            state: {
              catalog,
              status: "ready",
              changes
            }
          });
        }
      } catch {
        if (sourceToken.active) {
          setLoadResult({
            defaultCatalog,
            repository,
            sourceToken,
            state: {
              catalog: defaultCatalog,
              status: "error",
              errorMessage: "无法读取用户目录，已继续使用内置目录。"
            }
          });
        }
      }
    }

    void loadCatalog();

    return () => {
      sourceToken.active = false;
    };
  }, [defaultCatalog, repository]);

  const activeResult =
    loadResult?.defaultCatalog === defaultCatalog &&
    loadResult.repository === repository
      ? loadResult
      : undefined;

  const saveChanges = useCallback(
    async (
      operation: CatalogSaveOperation,
      sourceToken: CatalogSourceToken,
      currentChanges: UserCatalogChanges,
      mutate: () => UserCatalogChanges,
      errorMessage: string
    ): Promise<CatalogSaveResult> => {
      saveInProgress.current = true;
      setSaveOperation(operation);

      try {
        const nextChanges = mutate();

        if (nextChanges === currentChanges) {
          return {
            ok: true,
            changes: currentChanges
          };
        }

        const nextCatalog = mergeCatalogChanges(defaultCatalog, nextChanges);
        await repository.save(nextChanges);

        if (!sourceToken.active) {
          return {
            ok: false,
            code: "not_ready",
            errorMessage: "目录来源已经变化，请在加载完成后重试。"
          };
        }

        setLoadResult((currentResult) => {
          if (
            currentResult?.sourceToken !== sourceToken ||
            currentResult.state.status !== "ready" ||
            currentResult.state.changes !== currentChanges
          ) {
            return currentResult;
          }

          return {
            defaultCatalog,
            repository,
            sourceToken,
            state: {
              catalog: nextCatalog,
              status: "ready",
              changes: nextChanges
            }
          };
        });

        return {
          ok: true,
          changes: nextChanges
        };
      } catch {
        return {
          ok: false,
          code: "save_failed",
          errorMessage
        };
      } finally {
        saveInProgress.current = false;
        setSaveOperation(undefined);
      }
    },
    [defaultCatalog, repository]
  );

  const createAlbum = useCallback(
    async (draft: CatalogAlbumDraft): Promise<CatalogAlbumCreationResult> => {
      if (saveInProgress.current) {
        return {
          ok: false,
          code: "busy",
          errorMessage: "正在保存其他目录修改，请稍后再试。"
        };
      }

      if (activeResult?.state.status !== "ready") {
        return {
          ok: false,
          code: "not_ready",
          errorMessage: "用户目录尚未准备好，请稍后再试。"
        };
      }

      const artist = activeResult.state.catalog.artists[0];
      if (!artist) {
        return {
          ok: false,
          code: "invalid_catalog",
          errorMessage: "当前目录没有可用艺人，无法新增专辑。"
        };
      }

      const title = draft.title.trim();
      const sourceToken = activeResult.sourceToken;
      const currentChanges = activeResult.state.changes;
      const currentCatalog = activeResult.state.catalog;

      if (title.length === 0 || !albumTypes.has(draft.type)) {
        return {
          ok: false,
          code: "invalid_input",
          errorMessage: "专辑名或类型无效，请检查后重试。"
        };
      }
      const sortOrder =
        currentCatalog.albums.reduce(
          (highestOrder, album) => Math.max(highestOrder, album.sortOrder),
          0
        ) + 1;
      let createdAlbumId: EntityId | undefined;
      const result = await saveChanges(
        "album",
        sourceToken,
        currentChanges,
        () => {
          const nextChanges = addAlbumToUserCatalog(
            defaultCatalog,
            currentChanges,
            {
              artistId: artist.id,
              title,
              type: draft.type,
              sortOrder
            },
            idFactory ?? createDefaultCatalogAlbumId
          );
          const createdAlbum =
            nextChanges.addedAlbums[nextChanges.addedAlbums.length - 1];

          if (!createdAlbum) {
            throw new Error("Catalog mutation did not create an album.");
          }

          createdAlbumId = createdAlbum.id;
          return nextChanges;
        },
        "保存新专辑失败，请检查浏览器存储权限后重试。"
      );

      if (!result.ok) {
        return result;
      }
      if (!createdAlbumId) {
        return {
          ok: false,
          code: "save_failed",
          errorMessage: "保存新专辑失败，请检查浏览器存储权限后重试。"
        };
      }

      return {
        ok: true,
        albumId: createdAlbumId
      };
    },
    [activeResult, defaultCatalog, idFactory, saveChanges]
  );

  const createTrack = useCallback(
    async (
      albumId: EntityId,
      draft: CatalogTrackDraft
    ): Promise<CatalogTrackCreationResult> => {
      if (saveInProgress.current) {
        return {
          ok: false,
          code: "busy",
          errorMessage: "正在保存其他目录修改，请稍后再试。"
        };
      }

      if (activeResult?.state.status !== "ready") {
        return {
          ok: false,
          code: "not_ready",
          errorMessage: "用户目录尚未准备好，请稍后再试。"
        };
      }

      const title = draft.title.trim();

      if (title.length === 0 || !isPositiveSafeInteger(draft.trackNumber)) {
        return {
          ok: false,
          code: "invalid_input",
          errorMessage: "歌曲名或曲序无效，请检查后重试。"
        };
      }

      const targetAlbum = activeResult.state.catalog.albums.find(
        (album) => album.id === albumId
      );
      const targetArtist = targetAlbum
        ? activeResult.state.catalog.artists.find(
            (artist) => artist.id === targetAlbum.artistId
          )
        : undefined;

      if (!targetAlbum || !targetArtist) {
        return {
          ok: false,
          code: "invalid_catalog",
          errorMessage: "目标专辑或艺人已不可用，请重新选择专辑。"
        };
      }

      const sourceToken = activeResult.sourceToken;
      const currentChanges = activeResult.state.changes;
      let createdTrackId: EntityId | undefined;
      const result = await saveChanges(
        "track",
        sourceToken,
        currentChanges,
        () => {
          const nextChanges = addTrackToUserCatalog(
            defaultCatalog,
            currentChanges,
            {
              artistId: targetAlbum.artistId,
              albumId: targetAlbum.id,
              title,
              trackNumber: draft.trackNumber
            },
            idFactory ?? createDefaultCatalogTrackId
          );
          const createdTrack =
            nextChanges.addedTracks[nextChanges.addedTracks.length - 1];

          if (!createdTrack) {
            throw new Error("Catalog mutation did not create a track.");
          }

          createdTrackId = createdTrack.id;
          return nextChanges;
        },
        "保存新歌曲失败，请检查浏览器存储权限后重试。"
      );

      if (!result.ok) {
        return result;
      }
      if (!createdTrackId) {
        return {
          ok: false,
          code: "save_failed",
          errorMessage: "保存新歌曲失败，请检查浏览器存储权限后重试。"
        };
      }

      return {
        ok: true,
        trackId: createdTrackId
      };
    },
    [activeResult, defaultCatalog, idFactory, saveChanges]
  );

  const importDirectoryCatalogDrafts = useCallback(
    async (
      drafts: readonly CatalogDirectoryImportAlbumDraft[]
    ): Promise<CatalogDirectoryImportResult> => {
      if (saveInProgress.current) {
        return {
          ok: false,
          code: "busy",
          errorMessage: "正在保存其他目录修改，请稍后再试。"
        };
      }
      if (activeResult?.state.status !== "ready") {
        return {
          ok: false,
          code: "not_ready",
          errorMessage: "用户目录尚未准备好，请稍后再试。"
        };
      }
      const writeOwner = directoryImportWriteOwner.current;
      if (!tryAcquireCatalogWriteLock(writeOwner)) {
        return {
          ok: false,
          code: "busy",
          errorMessage: "目录删除或其他目录导入正在保存，请稍后再试。"
        };
      }

      try {
        const validationError = getDirectoryImportValidationError(
          activeResult.state.catalog,
          drafts
        );
        if (validationError) {
          return {
            ok: false,
            code: "invalid_input",
            errorMessage: validationError
          };
        }
        if (drafts.length === 0) {
          return { ok: true, trackIdsBySourceId: new Map() };
        }

        const sourceToken = activeResult.sourceToken;
        const currentChanges = activeResult.state.changes;
        const currentCatalog = activeResult.state.catalog;
        const highestSortOrder = currentCatalog.albums.reduce(
          (highestOrder, album) => Math.max(highestOrder, album.sortOrder),
          0
        );
        const trackIdsBySourceId = new Map<string, EntityId>();
        const entityIdFactory = idFactory ?? createDefaultCatalogImportId;
        const result = await saveChanges(
          "directory_import",
          sourceToken,
          currentChanges,
          () => {
            let nextChanges = currentChanges;

            for (const [albumIndex, draft] of drafts.entries()) {
              nextChanges = addAlbumToUserCatalog(
                defaultCatalog,
                nextChanges,
                {
                  artistId: draft.artistId,
                  title: draft.title.trim(),
                  type: "album",
                  sortOrder: highestSortOrder + albumIndex + 1
                },
                entityIdFactory
              );
              const albumId = nextChanges.addedAlbums.at(-1)?.id;

              if (!albumId) {
                throw new Error("Directory import did not create an album.");
              }

              for (const trackDraft of draft.tracks) {
                nextChanges = addTrackToUserCatalog(
                  defaultCatalog,
                  nextChanges,
                  {
                    artistId: draft.artistId,
                    albumId,
                    title: trackDraft.title.trim(),
                    trackNumber: trackDraft.trackNumber
                  },
                  entityIdFactory
                );
                const trackId = nextChanges.addedTracks.at(-1)?.id;

                if (!trackId) {
                  throw new Error("Directory import did not create a track.");
                }
                trackIdsBySourceId.set(trackDraft.sourceId, trackId);
              }
            }

            return nextChanges;
          },
          "保存目录导入的专辑信息失败，请检查浏览器存储权限后重试。"
        );

        if (!result.ok) {
          return result;
        }

        return { ok: true, trackIdsBySourceId };
      } finally {
        releaseCatalogWriteLock(writeOwner);
      }
    },
    [activeResult, defaultCatalog, idFactory, saveChanges]
  );

  const updateAlbum = useCallback(
    async (
      albumId: EntityId,
      draft: CatalogAlbumUpdateDraft
    ): Promise<CatalogMutationResult> => {
      if (saveInProgress.current) {
        return {
          ok: false,
          code: "busy",
          errorMessage: "正在保存其他目录修改，请稍后再试。"
        };
      }
      if (activeResult?.state.status !== "ready") {
        return {
          ok: false,
          code: "not_ready",
          errorMessage: "用户目录尚未准备好，请稍后再试。"
        };
      }

      const targetAlbum = activeResult.state.catalog.albums.find(
        (album) => album.id === albumId
      );
      const title = draft.title.trim();

      if (!targetAlbum) {
        return {
          ok: false,
          code: "invalid_catalog",
          errorMessage: "目标专辑已不可用，请重新选择专辑。"
        };
      }
      if (title.length === 0 || !albumTypes.has(draft.type)) {
        return {
          ok: false,
          code: "invalid_input",
          errorMessage: "专辑名或类型无效，请检查后重试。"
        };
      }

      const sourceToken = activeResult.sourceToken;
      const currentChanges = activeResult.state.changes;
      const patch: CatalogAlbumPatch = {
        title,
        type: draft.type
      };
      const result = await saveChanges(
        "album",
        sourceToken,
        currentChanges,
        () => patchAlbumInUserCatalog(defaultCatalog, currentChanges, albumId, patch),
        "保存专辑修改失败，请检查浏览器存储权限后重试。"
      );

      return result.ok ? { ok: true } : result;
    },
    [activeResult, defaultCatalog, saveChanges]
  );

  const updateTrack = useCallback(
    async (
      trackId: EntityId,
      draft: CatalogTrackUpdateDraft
    ): Promise<CatalogMutationResult> => {
      if (saveInProgress.current) {
        return {
          ok: false,
          code: "busy",
          errorMessage: "正在保存其他目录修改，请稍后再试。"
        };
      }
      if (activeResult?.state.status !== "ready") {
        return {
          ok: false,
          code: "not_ready",
          errorMessage: "用户目录尚未准备好，请稍后再试。"
        };
      }

      const targetTrack = activeResult.state.catalog.tracks.find(
        (track) => track.id === trackId
      );
      const title = draft.title.trim();

      if (!targetTrack) {
        return {
          ok: false,
          code: "invalid_catalog",
          errorMessage: "目标歌曲已不可用，请重新选择歌曲。"
        };
      }
      if (
        title.length === 0 ||
        (draft.trackNumber !== null && !isPositiveSafeInteger(draft.trackNumber))
      ) {
        return {
          ok: false,
          code: "invalid_input",
          errorMessage: "歌曲名或曲序无效，请检查后重试。"
        };
      }

      const sourceToken = activeResult.sourceToken;
      const currentChanges = activeResult.state.changes;
      const result = await saveChanges(
        "track",
        sourceToken,
        currentChanges,
        () =>
          patchTrackInUserCatalog(defaultCatalog, currentChanges, trackId, {
            title,
            trackNumber: draft.trackNumber
          }),
        "保存歌曲修改失败，请检查浏览器存储权限后重试。"
      );

      return result.ok ? { ok: true } : result;
    },
    [activeResult, defaultCatalog, saveChanges]
  );

  const resetAlbum = useCallback(
    async (albumId: EntityId): Promise<CatalogMutationResult> => {
      if (saveInProgress.current) {
        return {
          ok: false,
          code: "busy",
          errorMessage: "正在保存其他目录修改，请稍后再试。"
        };
      }
      if (activeResult?.state.status !== "ready") {
        return {
          ok: false,
          code: "not_ready",
          errorMessage: "用户目录尚未准备好，请稍后再试。"
        };
      }
      if (!defaultCatalog.albums.some((album) => album.id === albumId)) {
        return {
          ok: false,
          code: "invalid_catalog",
          errorMessage: "用户新增专辑没有可恢复的内置默认值。"
        };
      }

      const sourceToken = activeResult.sourceToken;
      const currentChanges = activeResult.state.changes;
      const result = await saveChanges(
        "album",
        sourceToken,
        currentChanges,
        () => resetAlbumInUserCatalog(defaultCatalog, currentChanges, albumId),
        "恢复专辑默认值失败，请检查浏览器存储权限后重试。"
      );

      return result.ok ? { ok: true } : result;
    },
    [activeResult, defaultCatalog, saveChanges]
  );

  const resetTrack = useCallback(
    async (trackId: EntityId): Promise<CatalogMutationResult> => {
      if (saveInProgress.current) {
        return {
          ok: false,
          code: "busy",
          errorMessage: "正在保存其他目录修改，请稍后再试。"
        };
      }
      if (activeResult?.state.status !== "ready") {
        return {
          ok: false,
          code: "not_ready",
          errorMessage: "用户目录尚未准备好，请稍后再试。"
        };
      }
      if (!defaultCatalog.tracks.some((track) => track.id === trackId)) {
        return {
          ok: false,
          code: "invalid_catalog",
          errorMessage: "用户新增歌曲没有可恢复的内置默认值。"
        };
      }

      const sourceToken = activeResult.sourceToken;
      const currentChanges = activeResult.state.changes;
      const result = await saveChanges(
        "track",
        sourceToken,
        currentChanges,
        () => resetTrackInUserCatalog(defaultCatalog, currentChanges, trackId),
        "恢复歌曲默认值失败，请检查浏览器存储权限后重试。"
      );

      return result.ok ? { ok: true } : result;
    },
    [activeResult, defaultCatalog, saveChanges]
  );

  const applyPersistedChanges = useCallback(
    (changes: UserCatalogChanges) => {
      if (activeResult?.state.status !== "ready") {
        return;
      }

      const nextCatalog = mergeCatalogChanges(defaultCatalog, changes);
      const sourceToken = activeResult.sourceToken;

      setLoadResult((currentResult) => {
        if (
          currentResult?.sourceToken !== sourceToken ||
          currentResult.state.status !== "ready"
        ) {
          return currentResult;
        }

        return {
          defaultCatalog,
          repository,
          sourceToken,
          state: {
            catalog: nextCatalog,
            status: "ready",
            changes
          }
        };
      });
    },
    [activeResult, defaultCatalog, repository]
  );

  if (activeResult) {
    const resettableAlbumIds =
      activeResult.state.status === "ready"
        ? getResettableEntityIds(
            defaultCatalog.albums.map((album) => album.id),
            activeResult.state.changes.albumOverrides
          )
        : new Set<EntityId>();
    const resettableTrackIds =
      activeResult.state.status === "ready"
        ? getResettableEntityIds(
            defaultCatalog.tracks.map((track) => track.id),
            activeResult.state.changes.trackOverrides
          )
        : new Set<EntityId>();

    return {
      catalog: activeResult.state.catalog,
      ...(activeResult.state.status === "ready"
        ? { changes: activeResult.state.changes }
        : {}),
      status: activeResult.state.status,
      ...(activeResult.state.status === "error"
        ? { errorMessage: activeResult.state.errorMessage }
        : {}),
      isSavingAlbum: saveOperation === "album" || saveOperation === "directory_import",
      isSavingTrack: saveOperation === "track" || saveOperation === "directory_import",
      resettableAlbumIds,
      resettableTrackIds,
      createAlbum,
      createTrack,
      updateAlbum,
      updateTrack,
      resetAlbum,
      resetTrack,
      importDirectoryCatalogDrafts,
      applyPersistedChanges
    };
  }

  return {
    catalog: defaultCatalog,
    status: "loading",
    isSavingAlbum: saveOperation === "album" || saveOperation === "directory_import",
    isSavingTrack: saveOperation === "track" || saveOperation === "directory_import",
    resettableAlbumIds: new Set<EntityId>(),
    resettableTrackIds: new Set<EntityId>(),
    createAlbum,
    createTrack,
    updateAlbum,
    updateTrack,
    resetAlbum,
    resetTrack,
    importDirectoryCatalogDrafts,
    applyPersistedChanges
  };
}

function getResettableEntityIds<T>(
  defaultEntityIds: readonly EntityId[],
  overrides: Partial<Record<EntityId, T>>
): ReadonlySet<EntityId> {
  return new Set(
    defaultEntityIds.filter(
      (entityId) => Object.keys(overrides[entityId] ?? {}).length > 0
    )
  );
}

function createDefaultCatalogAlbumId(): EntityId {
  return `album_user_${globalThis.crypto.randomUUID()}`;
}

function createDefaultCatalogTrackId(): EntityId {
  return `track_user_${globalThis.crypto.randomUUID()}`;
}

function createDefaultCatalogImportId(): EntityId {
  return `catalog_user_${globalThis.crypto.randomUUID()}`;
}

function getDirectoryImportValidationError(
  catalog: CatalogData,
  drafts: readonly CatalogDirectoryImportAlbumDraft[]
): string | undefined {
  const sourceIds = new Set<string>();
  const importedAlbumKeys = new Set<string>();

  for (const draft of drafts) {
    const title = draft.title.trim();
    if (!title || draft.tracks.length === 0) {
      return "新专辑草稿必须包含专辑名和至少一首歌曲。";
    }
    if (!catalog.artists.some((artist) => artist.id === draft.artistId)) {
      return "默认歌手不在当前目录中，不能创建新专辑。";
    }

    const albumKey = `${draft.artistId}:${title.normalize("NFKC").toLowerCase()}`;
    if (importedAlbumKeys.has(albumKey)) {
      return "同名新专辑草稿不能重复导入。";
    }
    if (
      catalog.albums.some(
        (album) =>
          album.artistId === draft.artistId &&
          album.title.normalize("NFKC").toLowerCase() ===
            title.normalize("NFKC").toLowerCase()
      )
    ) {
      return "当前目录已有同名专辑，请改用目录编辑功能补充歌曲。";
    }
    importedAlbumKeys.add(albumKey);

    for (const track of draft.tracks) {
      if (
        !track.sourceId ||
        !track.title.trim() ||
        !isPositiveSafeInteger(track.trackNumber)
      ) {
        return "新专辑歌曲草稿缺少必要信息。";
      }
      if (sourceIds.has(track.sourceId)) {
        return "同一个本地文件不能重复导入。";
      }
      sourceIds.add(track.sourceId);
    }
  }

  return undefined;
}
