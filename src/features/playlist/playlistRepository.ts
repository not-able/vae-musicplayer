import type { TemporaryPlaylist } from "../../types";

export interface TemporaryPlaylistRepository {
  load(): Promise<TemporaryPlaylist | null>;
  save(playlist: TemporaryPlaylist): Promise<void>;
  clear(): Promise<void>;
}

export type PlaylistRepositoryErrorCode =
  | "storage_unavailable"
  | "read_failed"
  | "invalid_json"
  | "invalid_data"
  | "unsupported_schema"
  | "write_failed"
  | "clear_failed";

export class PlaylistRepositoryError extends Error {
  readonly code: PlaylistRepositoryErrorCode;

  constructor(code: PlaylistRepositoryErrorCode, message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "PlaylistRepositoryError";
    this.code = code;
  }
}
