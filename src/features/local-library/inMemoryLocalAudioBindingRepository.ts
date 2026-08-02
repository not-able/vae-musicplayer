import {
  isLocalAudioBindingSerializable,
  type LocalAudioBinding,
  type LocalAudioBindingId,
  type LocalAudioTrackId
} from "../../types/localAudioBinding";
import {
  LocalAudioBindingConflictError,
  LocalAudioBindingValidationError,
  type LocalAudioBindingRepository
} from "./localAudioBindingRepository";

export class InMemoryLocalAudioBindingRepository
  implements LocalAudioBindingRepository
{
  private readonly bindingsById = new Map<LocalAudioBindingId, LocalAudioBinding>();
  private readonly bindingIdsByTrackId = new Map<
    LocalAudioTrackId,
    LocalAudioBindingId
  >();

  constructor(initialBindings: readonly LocalAudioBinding[] = []) {
    initialBindings.forEach(assertValidBinding);

    for (const binding of initialBindings) {
      if (this.bindingsById.has(binding.bindingId)) {
        throw new LocalAudioBindingConflictError(
          "duplicate-initial-binding-id",
          `Initial bindings contain duplicate binding ID: ${binding.bindingId}`
        );
      }

      if (this.bindingIdsByTrackId.has(binding.trackId)) {
        throw new LocalAudioBindingConflictError(
          "duplicate-initial-track-id",
          `Initial bindings contain more than one binding for track: ${binding.trackId}`
        );
      }

      this.store(binding);
    }
  }

  async list(): Promise<readonly LocalAudioBinding[]> {
    return [...this.bindingsById.values()]
      .sort(compareBindings)
      .map(cloneBinding);
  }

  async findByBindingId(
    bindingId: LocalAudioBindingId
  ): Promise<LocalAudioBinding | undefined> {
    const binding = this.bindingsById.get(bindingId);
    return binding ? cloneBinding(binding) : undefined;
  }

  async findByTrackId(
    trackId: LocalAudioTrackId
  ): Promise<LocalAudioBinding | undefined> {
    const bindingId = this.bindingIdsByTrackId.get(trackId);
    const binding = bindingId ? this.bindingsById.get(bindingId) : undefined;
    return binding ? cloneBinding(binding) : undefined;
  }

  async save(binding: LocalAudioBinding): Promise<void> {
    assertValidBinding(binding);

    const bindingWithSameId = this.bindingsById.get(binding.bindingId);

    if (bindingWithSameId && bindingWithSameId.trackId !== binding.trackId) {
      throw new LocalAudioBindingConflictError(
        "binding-id-track-mismatch",
        `Binding ID ${binding.bindingId} already belongs to track ${bindingWithSameId.trackId}.`
      );
    }

    const previousBindingId = this.bindingIdsByTrackId.get(binding.trackId);

    if (previousBindingId && previousBindingId !== binding.bindingId) {
      this.bindingsById.delete(previousBindingId);
    }

    this.store(binding);
  }

  async removeByBindingId(bindingId: LocalAudioBindingId): Promise<boolean> {
    const binding = this.bindingsById.get(bindingId);

    if (!binding) {
      return false;
    }

    this.bindingsById.delete(bindingId);
    this.bindingIdsByTrackId.delete(binding.trackId);
    return true;
  }

  async removeByTrackId(trackId: LocalAudioTrackId): Promise<boolean> {
    const bindingId = this.bindingIdsByTrackId.get(trackId);

    if (!bindingId) {
      return false;
    }

    this.bindingIdsByTrackId.delete(trackId);
    this.bindingsById.delete(bindingId);
    return true;
  }

  private store(binding: LocalAudioBinding): void {
    const storedBinding = cloneBinding(binding);
    this.bindingsById.set(storedBinding.bindingId, storedBinding);
    this.bindingIdsByTrackId.set(storedBinding.trackId, storedBinding.bindingId);
  }
}

function assertValidBinding(binding: unknown): asserts binding is LocalAudioBinding {
  if (!isLocalAudioBindingSerializable(binding)) {
    throw new LocalAudioBindingValidationError();
  }
}

function cloneBinding(binding: LocalAudioBinding): LocalAudioBinding {
  return {
    ...binding,
    source: { ...binding.source }
  };
}

function compareBindings(left: LocalAudioBinding, right: LocalAudioBinding): number {
  return (
    left.createdAt.localeCompare(right.createdAt) ||
    left.bindingId.localeCompare(right.bindingId)
  );
}
