import type { PlaylistLibrary } from "../../types";
import { createPlaylistLibrary } from "./playlistLibrary";
import type { TemporaryPlaylistRepository } from "./playlistRepository";

export interface PlaylistLibraryRepository {
  load(): Promise<PlaylistLibrary | null>;
  save(library: PlaylistLibrary): Promise<void>;
  clear(): Promise<void>;
}

const repositoryWriteTails = new WeakMap<PlaylistLibraryRepository, Promise<void>>();
const legacyRepositoryAdapters = new WeakMap<
  TemporaryPlaylistRepository,
  PlaylistLibraryRepository
>();

export function savePlaylistLibraryInRepositoryOrder(
  repository: PlaylistLibraryRepository,
  library: PlaylistLibrary
): Promise<void> {
  const previousWrite = repositoryWriteTails.get(repository) ?? Promise.resolve();
  const currentWrite = previousWrite.then(() => repository.save(library));

  repositoryWriteTails.set(
    repository,
    currentWrite.catch(() => undefined)
  );

  return currentWrite;
}

export async function waitForPlaylistLibraryRepositoryWrites(
  repository: PlaylistLibraryRepository
): Promise<void> {
  await repositoryWriteTails.get(repository);
}

// This adapter keeps the former injected repository usable in tests and embedders.
// The production App always uses the versioned playlist-library repository directly.
export function createLegacyTemporaryPlaylistRepositoryAdapter(
  repository: TemporaryPlaylistRepository
): PlaylistLibraryRepository {
  const existingAdapter = legacyRepositoryAdapters.get(repository);

  if (existingAdapter) {
    return existingAdapter;
  }

  const adapter: PlaylistLibraryRepository = {
    async load() {
      const playlist = await repository.load();

      return playlist ? createPlaylistLibrary({ temporaryPlaylist: playlist }) : null;
    },
    async save(library) {
      await repository.save(library.temporaryPlaylist);
    },
    async clear() {
      await repository.clear();
    }
  };

  legacyRepositoryAdapters.set(repository, adapter);

  return adapter;
}
