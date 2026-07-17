import { useCallback, useEffect, useRef, useState } from "react";

import type {
  AlbumType,
  CatalogData,
  EntityId,
  ISODateString,
  UserCatalogChanges
} from "../../types";
import { mergeCatalogChanges } from "./catalogMerge";
import { addAlbumToUserCatalog, type CatalogEntityIdFactory } from "./catalogMutations";
import type { LocalCatalogRepository } from "./localCatalogRepository";

export type CatalogLibraryStatus = "loading" | "ready" | "error";

export interface CatalogAlbumDraft {
  title: string;
  type: AlbumType;
  releaseDate?: ISODateString;
}

export type CatalogAlbumCreationResult =
  | { ok: true; albumId: EntityId }
  | {
      ok: false;
      code: "not_ready" | "busy" | "invalid_catalog" | "save_failed";
      errorMessage: string;
    };

export interface CatalogLibrary {
  catalog: CatalogData;
  status: CatalogLibraryStatus;
  errorMessage?: string;
  isSavingAlbum: boolean;
  createAlbum: (draft: CatalogAlbumDraft) => Promise<CatalogAlbumCreationResult>;
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

export function useCatalogLibrary(
  defaultCatalog: CatalogData,
  repository: LocalCatalogRepository,
  idFactory: CatalogEntityIdFactory = createDefaultCatalogAlbumId
): CatalogLibrary {
  const [loadResult, setLoadResult] = useState<CatalogLoadResult>();
  const [isSavingAlbum, setIsSavingAlbum] = useState(false);
  const saveInProgress = useRef(false);

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

  const createAlbum = useCallback(
    async (draft: CatalogAlbumDraft): Promise<CatalogAlbumCreationResult> => {
      if (saveInProgress.current) {
        return {
          ok: false,
          code: "busy",
          errorMessage: "正在保存上一张专辑，请稍后再试。"
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
      const releaseDate = draft.releaseDate?.trim();
      const sourceToken = activeResult.sourceToken;
      const currentChanges = activeResult.state.changes;
      const currentCatalog = activeResult.state.catalog;

      saveInProgress.current = true;
      setIsSavingAlbum(true);

      try {
        const sortOrder =
          currentCatalog.albums.reduce(
            (highestOrder, album) => Math.max(highestOrder, album.sortOrder),
            0
          ) + 1;
        const nextChanges = addAlbumToUserCatalog(
          defaultCatalog,
          currentChanges,
          {
            artistId: artist.id,
            title,
            type: draft.type,
            ...(releaseDate ? { releaseDate } : {}),
            sortOrder
          },
          idFactory
        );
        const createdAlbum =
          nextChanges.addedAlbums[nextChanges.addedAlbums.length - 1];
        const nextCatalog = mergeCatalogChanges(defaultCatalog, nextChanges);

        if (!createdAlbum) {
          throw new Error("Catalog mutation did not create an album.");
        }

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
          albumId: createdAlbum.id
        };
      } catch {
        return {
          ok: false,
          code: "save_failed",
          errorMessage: "保存新专辑失败，请检查浏览器存储权限后重试。"
        };
      } finally {
        saveInProgress.current = false;
        setIsSavingAlbum(false);
      }
    },
    [activeResult, defaultCatalog, idFactory, repository]
  );

  if (activeResult) {
    return {
      catalog: activeResult.state.catalog,
      status: activeResult.state.status,
      ...(activeResult.state.status === "error"
        ? { errorMessage: activeResult.state.errorMessage }
        : {}),
      isSavingAlbum,
      createAlbum
    };
  }

  return {
    catalog: defaultCatalog,
    status: "loading",
    isSavingAlbum,
    createAlbum
  };
}

function createDefaultCatalogAlbumId(): EntityId {
  return `album_user_${globalThis.crypto.randomUUID()}`;
}
