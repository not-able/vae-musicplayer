import { act, createElement, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

import type { LocalAudioFileRepository } from "../features/local-library/localAudioRepository";
import {
  useLocalAudioLibrary,
  type LocalAudioBatchBindingResult
} from "../features/local-library/useLocalAudioLibrary";

function BatchProbe({
  repository,
  onResult
}: {
  repository: LocalAudioFileRepository;
  onResult: (result: LocalAudioBatchBindingResult) => void;
}) {
  const library = useLocalAudioLibrary(repository);
  const didRequest = useRef(false);

  useEffect(() => {
    if (library.status !== "ready" || didRequest.current) {
      return;
    }
    didRequest.current = true;

    const firstFile = new File(["self-created test bytes"], "first.mp3", {
      type: "audio/mpeg"
    });
    const secondFile = new File(["self-created test bytes"], "second.flac", {
      type: "audio/flac"
    });

    void library
      .bindAudioFiles([
        { trackId: "track_duplicate", file: firstFile },
        { trackId: "track_duplicate", file: secondFile }
      ])
      .then(onResult);
  }, [library, onResult]);

  return null;
}

function ConcurrentBindingProbe({
  repository,
  onResult
}: {
  repository: LocalAudioFileRepository;
  onResult: (result: {
    singleBindingSucceeded: boolean;
    batch: LocalAudioBatchBindingResult;
  }) => void;
}) {
  const library = useLocalAudioLibrary(repository);
  const didRequest = useRef(false);

  useEffect(() => {
    if (library.status !== "ready" || didRequest.current) {
      return;
    }
    didRequest.current = true;

    const file = new File(["self-created test bytes"], "single.mp3", {
      type: "audio/mpeg"
    });

    void Promise.all([
      library.bindAudioFile("track_busy", file),
      library.bindAudioFiles([{ trackId: "track_busy", file }])
    ]).then(([singleBindingSucceeded, batch]) =>
      onResult({ singleBindingSucceeded, batch })
    );
  }, [library, onResult]);

  return null;
}

describe("local audio batch binding", () => {
  it("rejects every duplicate target before writing any file", async () => {
    const repository = {
      list: vi.fn(async () => []),
      save: vi.fn(async () => undefined),
      remove: vi.fn(async () => undefined)
    } satisfies LocalAudioFileRepository;
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    let resolveResult!: (result: LocalAudioBatchBindingResult) => void;
    const resultPromise = new Promise<LocalAudioBatchBindingResult>((resolve) => {
      resolveResult = resolve;
    });

    await act(async () => {
      root.render(
        createElement(BatchProbe, {
          repository,
          onResult: resolveResult
        })
      );
    });
    const result = await resultPromise;

    expect(repository.save).not.toHaveBeenCalled();
    expect(result.boundTrackIds).toEqual([]);
    expect(result.failed).toHaveLength(2);

    await act(async () => root.unmount());
    container.remove();
  });

  it("does not let a batch overwrite a simultaneous single-file binding", async () => {
    let resolveSave!: () => void;
    const savePromise = new Promise<void>((resolve) => {
      resolveSave = resolve;
    });
    const repository = {
      list: vi.fn(async () => []),
      save: vi.fn(async () => savePromise),
      remove: vi.fn(async () => undefined)
    } satisfies LocalAudioFileRepository;
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    let resolveResult!: (result: {
      singleBindingSucceeded: boolean;
      batch: LocalAudioBatchBindingResult;
    }) => void;
    const resultPromise = new Promise<{
      singleBindingSucceeded: boolean;
      batch: LocalAudioBatchBindingResult;
    }>((resolve) => {
      resolveResult = resolve;
    });

    await act(async () => {
      root.render(
        createElement(ConcurrentBindingProbe, {
          repository,
          onResult: resolveResult
        })
      );
    });

    expect(repository.save).toHaveBeenCalledTimes(1);
    resolveSave();
    const result = await resultPromise;

    expect(result.singleBindingSucceeded).toBe(true);
    expect(result.batch.boundTrackIds).toEqual([]);
    expect(result.batch.failed).toHaveLength(1);
    expect(repository.save).toHaveBeenCalledTimes(1);

    await act(async () => root.unmount());
    container.remove();
  });
});
