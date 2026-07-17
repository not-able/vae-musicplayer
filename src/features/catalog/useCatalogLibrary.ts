import { useEffect, useState } from "react";

import type { CatalogData } from "../../types";
import { mergeCatalogChanges } from "./catalogMerge";
import type { LocalCatalogRepository } from "./localCatalogRepository";

export type CatalogLibraryStatus = "loading" | "ready" | "error";

export interface CatalogLibrary {
  catalog: CatalogData;
  status: CatalogLibraryStatus;
  errorMessage?: string;
}

interface CatalogLoadResult {
  defaultCatalog: CatalogData;
  repository: LocalCatalogRepository;
  library: CatalogLibrary;
}

export function useCatalogLibrary(
  defaultCatalog: CatalogData,
  repository: LocalCatalogRepository
): CatalogLibrary {
  const [loadResult, setLoadResult] = useState<CatalogLoadResult>();

  useEffect(() => {
    let isActive = true;

    async function loadCatalog(): Promise<void> {
      try {
        const changes = await repository.load();
        const catalog = mergeCatalogChanges(defaultCatalog, changes);

        if (isActive) {
          setLoadResult({
            defaultCatalog,
            repository,
            library: {
              catalog,
              status: "ready"
            }
          });
        }
      } catch {
        if (isActive) {
          setLoadResult({
            defaultCatalog,
            repository,
            library: {
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
      isActive = false;
    };
  }, [defaultCatalog, repository]);

  if (
    loadResult?.defaultCatalog === defaultCatalog &&
    loadResult.repository === repository
  ) {
    return loadResult.library;
  }

  return {
    catalog: defaultCatalog,
    status: "loading"
  };
}
