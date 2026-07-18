import type { PlaylistLibrary } from "../../types";

export interface PlaylistLibraryRepository {
  load(): Promise<PlaylistLibrary | null>;
  save(library: PlaylistLibrary): Promise<void>;
  clear(): Promise<void>;
}
