import { describe, expect, it } from "vitest";

import { InMemoryLocalAudioBindingRepository } from "../features/local-library/inMemoryLocalAudioBindingRepository";
import {
  LocalAudioBindingConflictError,
  LocalAudioBindingValidationError
} from "../features/local-library/localAudioBindingRepository";
import {
  isLocalAudioBindingId,
  isLocalAudioSourceId,
  isLocalAudioTrackId,
  type LocalAudioBinding,
  type LocalAudioBindingId,
  type LocalAudioSourceId,
  type LocalAudioTrackId
} from "../types/localAudioBinding";

const BINDING_ID_A = "11111111-1111-4111-8111-111111111111";
const BINDING_ID_B = "22222222-2222-4222-8222-222222222222";
const BINDING_ID_C = "33333333-3333-4333-8333-333333333333";
const TRACK_ID_A = "track_sample_001";
const TRACK_ID_B = "track_sample_002";

function bindingId(value: string): LocalAudioBindingId {
  if (!isLocalAudioBindingId(value)) {
    throw new Error(`Invalid test binding ID: ${value}`);
  }

  return value;
}

function trackId(value: string): LocalAudioTrackId {
  if (!isLocalAudioTrackId(value)) {
    throw new Error(`Invalid test track ID: ${value}`);
  }

  return value;
}

function sourceId(value: string): LocalAudioSourceId {
  if (!isLocalAudioSourceId(value)) {
    throw new Error(`Invalid test source ID: ${value}`);
  }

  return value;
}

function createBinding(
  overrides: Partial<LocalAudioBinding> = {}
): LocalAudioBinding {
  return {
    bindingId: bindingId(BINDING_ID_A),
    trackId: trackId(TRACK_ID_A),
    source: {
      type: "web-file-copy",
      sourceId: sourceId("local_audio_copy_001")
    },
    fileName: "sample.mp3",
    fileSize: 1024,
    modifiedAt: 1_765_000_000_000,
    availability: "available",
    createdAt: "2026-08-02T00:00:00.000Z",
    updatedAt: "2026-08-02T00:00:00.000Z",
    ...overrides
  };
}

describe("InMemoryLocalAudioBindingRepository", () => {
  it("starts empty", async () => {
    const repository = new InMemoryLocalAudioBindingRepository();

    await expect(repository.list()).resolves.toEqual([]);
  });

  it("accepts valid initial bindings", async () => {
    const initialBinding = createBinding();
    const repository = new InMemoryLocalAudioBindingRepository([initialBinding]);

    await expect(repository.list()).resolves.toEqual([initialBinding]);
  });

  it("saves and finds a binding by binding ID", async () => {
    const repository = new InMemoryLocalAudioBindingRepository();
    const binding = createBinding();

    await repository.save(binding);

    await expect(repository.findByBindingId(binding.bindingId)).resolves.toEqual(
      binding
    );
  });

  it("finds a binding by track ID", async () => {
    const repository = new InMemoryLocalAudioBindingRepository();
    const binding = createBinding();

    await repository.save(binding);

    await expect(repository.findByTrackId(binding.trackId)).resolves.toEqual(binding);
  });

  it("updates the same binding on the same track without changing timestamps", async () => {
    const repository = new InMemoryLocalAudioBindingRepository();
    const initialBinding = createBinding();
    const updatedBinding = createBinding({
      fileName: "updated.mp3",
      availability: "changed",
      createdAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-02-01T00:00:00.000Z"
    });

    await repository.save(initialBinding);
    await repository.save(updatedBinding);

    await expect(
      repository.findByBindingId(updatedBinding.bindingId)
    ).resolves.toEqual(updatedBinding);
  });

  it("replaces a track's old binding when a new binding ID is saved", async () => {
    const repository = new InMemoryLocalAudioBindingRepository();
    const oldBinding = createBinding();
    const newBinding = createBinding({
      bindingId: bindingId(BINDING_ID_B),
      fileName: "replacement.mp3"
    });

    await repository.save(oldBinding);
    await repository.save(newBinding);

    await expect(repository.findByBindingId(oldBinding.bindingId)).resolves.toBeUndefined();
    await expect(repository.findByTrackId(oldBinding.trackId)).resolves.toEqual(
      newBinding
    );
    await expect(repository.list()).resolves.toEqual([newBinding]);
  });

  it("rejects reusing a binding ID for another track without changing state", async () => {
    const repository = new InMemoryLocalAudioBindingRepository();
    const existingBinding = createBinding();
    const conflictingBinding = createBinding({
      trackId: trackId(TRACK_ID_B),
      fileName: "conflict.mp3"
    });

    await repository.save(existingBinding);

    await expect(repository.save(conflictingBinding)).rejects.toMatchObject({
      code: "LOCAL_AUDIO_BINDING_CONFLICT",
      reason: "binding-id-track-mismatch"
    });
    await expect(repository.list()).resolves.toEqual([existingBinding]);
    await expect(
      repository.findByTrackId(conflictingBinding.trackId)
    ).resolves.toBeUndefined();
  });

  it("removes a binding by binding ID and clears its track lookup", async () => {
    const repository = new InMemoryLocalAudioBindingRepository();
    const binding = createBinding();
    await repository.save(binding);

    await expect(repository.removeByBindingId(binding.bindingId)).resolves.toBe(true);
    await expect(repository.findByBindingId(binding.bindingId)).resolves.toBeUndefined();
    await expect(repository.findByTrackId(binding.trackId)).resolves.toBeUndefined();
  });

  it("removes a binding by track ID and clears its binding lookup", async () => {
    const repository = new InMemoryLocalAudioBindingRepository();
    const binding = createBinding();
    await repository.save(binding);

    await expect(repository.removeByTrackId(binding.trackId)).resolves.toBe(true);
    await expect(repository.findByBindingId(binding.bindingId)).resolves.toBeUndefined();
    await expect(repository.findByTrackId(binding.trackId)).resolves.toBeUndefined();
  });

  it("returns false when removing identifiers that do not exist", async () => {
    const repository = new InMemoryLocalAudioBindingRepository();

    await expect(
      repository.removeByBindingId(bindingId(BINDING_ID_C))
    ).resolves.toBe(false);
    await expect(repository.removeByTrackId(trackId(TRACK_ID_B))).resolves.toBe(
      false
    );
  });

  it("lists bindings by createdAt and then bindingId", async () => {
    const later = createBinding({
      bindingId: bindingId(BINDING_ID_A),
      trackId: trackId("track_later"),
      createdAt: "2026-08-03T00:00:00.000Z"
    });
    const sameTimeSecond = createBinding({
      bindingId: bindingId(BINDING_ID_C),
      trackId: trackId("track_same_time_second"),
      createdAt: "2026-08-01T00:00:00.000Z"
    });
    const sameTimeFirst = createBinding({
      bindingId: bindingId(BINDING_ID_B),
      trackId: trackId("track_same_time_first"),
      createdAt: "2026-08-01T00:00:00.000Z"
    });
    const repository = new InMemoryLocalAudioBindingRepository([
      later,
      sameTimeSecond,
      sameTimeFirst
    ]);

    const listed = await repository.list();

    expect(listed.map((binding) => binding.bindingId)).toEqual([
      sameTimeFirst.bindingId,
      sameTimeSecond.bindingId,
      later.bindingId
    ]);
  });

  it("copies save input before storing it", async () => {
    const repository = new InMemoryLocalAudioBindingRepository();
    const binding = createBinding();
    await repository.save(binding);

    const mutableInput = binding as unknown as {
      fileName: string;
      source: { sourceId: string };
    };
    mutableInput.fileName = "mutated.mp3";
    mutableInput.source.sourceId = "mutated_source";

    await expect(repository.findByBindingId(binding.bindingId)).resolves.toMatchObject({
      fileName: "sample.mp3",
      source: { sourceId: "local_audio_copy_001" }
    });
  });

  it("copies initial bindings before storing them", async () => {
    const binding = createBinding();
    const repository = new InMemoryLocalAudioBindingRepository([binding]);

    const mutableInput = binding as unknown as { fileName: string };
    mutableInput.fileName = "mutated.mp3";

    await expect(repository.findByBindingId(binding.bindingId)).resolves.toMatchObject({
      fileName: "sample.mp3"
    });
  });

  it("returns defensive copies from list", async () => {
    const repository = new InMemoryLocalAudioBindingRepository();
    const binding = createBinding();
    await repository.save(binding);

    const listed = await repository.list();
    const mutableList = listed as LocalAudioBinding[];
    const mutableBinding = mutableList[0] as unknown as {
      fileName: string;
      source: { sourceId: string };
    };
    mutableBinding.fileName = "mutated.mp3";
    mutableBinding.source.sourceId = "mutated_source";
    mutableList.length = 0;

    await expect(repository.list()).resolves.toEqual([binding]);
  });

  it("returns defensive copies from individual lookups", async () => {
    const repository = new InMemoryLocalAudioBindingRepository();
    const binding = createBinding();
    await repository.save(binding);

    const found = await repository.findByTrackId(binding.trackId);
    const mutableFound = found as unknown as {
      fileName: string;
      source: { sourceId: string };
    };
    mutableFound.fileName = "mutated.mp3";
    mutableFound.source.sourceId = "mutated_source";

    await expect(repository.findByTrackId(binding.trackId)).resolves.toEqual(binding);
  });

  it("rejects duplicate binding IDs in initial data", () => {
    const duplicate = createBinding({ fileName: "duplicate.mp3" });

    expect(
      () => new InMemoryLocalAudioBindingRepository([createBinding(), duplicate])
    ).toThrowError(LocalAudioBindingConflictError);

    try {
      new InMemoryLocalAudioBindingRepository([createBinding(), duplicate]);
    } catch (error: unknown) {
      expect(error).toMatchObject({ reason: "duplicate-initial-binding-id" });
    }
  });

  it("rejects duplicate track IDs in initial data", () => {
    const duplicateTrack = createBinding({
      bindingId: bindingId(BINDING_ID_B)
    });

    expect(
      () =>
        new InMemoryLocalAudioBindingRepository([createBinding(), duplicateTrack])
    ).toThrowError(LocalAudioBindingConflictError);

    try {
      new InMemoryLocalAudioBindingRepository([createBinding(), duplicateTrack]);
    } catch (error: unknown) {
      expect(error).toMatchObject({ reason: "duplicate-initial-track-id" });
    }
  });

  it("rejects invalid binding metadata with a validation error", async () => {
    const repository = new InMemoryLocalAudioBindingRepository();
    const invalidBinding = {
      ...createBinding(),
      fileName: ""
    } as unknown as LocalAudioBinding;

    await expect(repository.save(invalidBinding)).rejects.toBeInstanceOf(
      LocalAudioBindingValidationError
    );
  });

  it("validates initial bindings with the same rules as save", () => {
    const invalidBinding = {
      ...createBinding(),
      availability: "unverified"
    } as unknown as LocalAudioBinding;

    expect(
      () => new InMemoryLocalAudioBindingRepository([invalidBinding])
    ).toThrowError(LocalAudioBindingValidationError);
  });

  it("keeps repository instances isolated", async () => {
    const firstRepository = new InMemoryLocalAudioBindingRepository();
    const secondRepository = new InMemoryLocalAudioBindingRepository();
    await firstRepository.save(createBinding());

    await expect(firstRepository.list()).resolves.toHaveLength(1);
    await expect(secondRepository.list()).resolves.toEqual([]);
  });
});
