import type {
  EntityId,
  ISODateString,
  PlaylistLibrary,
  UserCatalogChanges
} from "../../types";

export const CATALOG_DELETION_INTENT_SCHEMA_VERSION = 2 as const;

export interface CatalogDeletionIntent {
  schemaVersion: typeof CATALOG_DELETION_INTENT_SCHEMA_VERSION;
  id: EntityId;
  createdAt: ISODateString;
  trackIds: EntityId[];
  nextCatalogChanges: UserCatalogChanges;
  nextPlaylistLibrary: PlaylistLibrary;
}

export interface CatalogDeletionIntentRepository {
  load(): Promise<CatalogDeletionIntent | null>;
  save(intent: CatalogDeletionIntent): Promise<void>;
  clear(): Promise<void>;
}
