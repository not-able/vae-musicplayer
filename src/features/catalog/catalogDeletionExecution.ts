import type { LocalAudioFileRepository } from "../local-library/localAudioRepository";
import {
  saveTemporaryPlaylistInRepositoryOrder,
  type TemporaryPlaylistRepository
} from "../playlist/playlistRepository";
import type { LocalCatalogRepository } from "./localCatalogRepository";
import {
  CATALOG_DELETION_INTENT_SCHEMA_VERSION,
  type CatalogDeletionIntent,
  type CatalogDeletionIntentRepository
} from "./catalogDeletionRepository";
import type { CatalogDeletionPlan } from "./catalogDeletion";

export interface CatalogDeletionStores {
  catalogRepository: LocalCatalogRepository;
  playlistRepository: TemporaryPlaylistRepository;
  audioRepository: LocalAudioFileRepository;
  intentRepository: CatalogDeletionIntentRepository;
}

export async function startCatalogDeletion(
  stores: CatalogDeletionStores,
  plan: CatalogDeletionPlan,
  intentId: string,
  createdAt: string
): Promise<CatalogDeletionIntent> {
  const intent: CatalogDeletionIntent = {
    schemaVersion: CATALOG_DELETION_INTENT_SCHEMA_VERSION,
    id: intentId,
    createdAt,
    trackIds: [...plan.trackIds],
    nextCatalogChanges: plan.nextCatalogChanges,
    nextPlaylist: plan.nextPlaylist
  };

  await stores.intentRepository.save(intent);
  await completeCatalogDeletion(stores, intent);

  return intent;
}

export async function completeCatalogDeletion(
  stores: CatalogDeletionStores,
  intent: CatalogDeletionIntent
): Promise<void> {
  await stores.catalogRepository.save(intent.nextCatalogChanges);
  await saveTemporaryPlaylistInRepositoryOrder(
    stores.playlistRepository,
    intent.nextPlaylist
  );

  for (const trackId of intent.trackIds) {
    await stores.audioRepository.remove(trackId);
  }

  await stores.intentRepository.clear();
}
