import type {
  LocalAudioBinding,
  LocalAudioBindingId,
  LocalAudioTrackId
} from "../../types/localAudioBinding";

/**
 * Stores portable binding metadata only. Resolving or reading the referenced file
 * remains the responsibility of a platform adapter.
 */
export interface LocalAudioBindingRepository {
  /** Returns bindings ordered by createdAt and then bindingId. */
  list(): Promise<readonly LocalAudioBinding[]>;
  findByBindingId(
    bindingId: LocalAudioBindingId
  ): Promise<LocalAudioBinding | undefined>;
  findByTrackId(trackId: LocalAudioTrackId): Promise<LocalAudioBinding | undefined>;
  /**
   * Upserts one binding per track without changing caller-owned timestamps.
   * A new binding ID for a track replaces that track's previous binding. Reusing
   * an existing binding ID for another track is a conflict.
   */
  save(binding: LocalAudioBinding): Promise<void>;
  removeByBindingId(bindingId: LocalAudioBindingId): Promise<boolean>;
  removeByTrackId(trackId: LocalAudioTrackId): Promise<boolean>;
}

export class LocalAudioBindingValidationError extends TypeError {
  readonly code = "LOCAL_AUDIO_BINDING_INVALID";

  constructor(message = "Local audio binding is invalid.") {
    super(message);
    this.name = "LocalAudioBindingValidationError";
  }
}

export type LocalAudioBindingConflictReason =
  | "binding-id-track-mismatch"
  | "duplicate-initial-binding-id"
  | "duplicate-initial-track-id";

export class LocalAudioBindingConflictError extends Error {
  readonly code = "LOCAL_AUDIO_BINDING_CONFLICT";

  constructor(
    readonly reason: LocalAudioBindingConflictReason,
    message: string
  ) {
    super(message);
    this.name = "LocalAudioBindingConflictError";
  }
}
