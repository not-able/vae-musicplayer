import type { UserCatalogChanges } from "../../types";

export interface LocalCatalogRepository {
  load(): Promise<UserCatalogChanges>;
  save(changes: UserCatalogChanges): Promise<void>;
  clear(): Promise<void>;
}

export type CatalogRepositoryErrorCode =
  | "storage_unavailable"
  | "read_failed"
  | "invalid_json"
  | "invalid_data"
  | "unsupported_schema"
  | "write_failed"
  | "clear_failed";

export class CatalogRepositoryError extends Error {
  readonly code: CatalogRepositoryErrorCode;

  constructor(code: CatalogRepositoryErrorCode, message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "CatalogRepositoryError";
    this.code = code;
  }
}
