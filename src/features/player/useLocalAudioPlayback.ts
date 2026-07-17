import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from "react";

import type { EntityId, LocalAudioFileRecord, PlaySequenceEntry } from "../../types";
import type { LocalAudioLibraryStatus } from "../local-library/useLocalAudioLibrary";
import type { PlayerAction, PlayerState } from "./playerReducer";

interface UseLocalAudioPlaybackOptions {
  state: PlayerState;
  bindingsByTrackId: ReadonlyMap<EntityId, LocalAudioFileRecord>;
  libraryStatus: LocalAudioLibraryStatus;
  dispatchPlayer: (action: PlayerAction) => void;
  audioRef: RefObject<HTMLAudioElement | null>;
}

interface PreparedAudioSource {
  sourceKey: string;
  sourceToken: number;
  objectUrl: string;
  record: LocalAudioFileRecord;
  audio: HTMLAudioElement;
  handleEnded: () => void;
}

const SOURCE_ENDED_LISTENER_OPTIONS = { passive: true } as const;

export interface LocalAudioPlaybackControls {
  errorMessage?: string;
  requestPlay: () => void;
  requestPause: () => void;
  requestRestart: () => void;
  handleAudioError: () => void;
  clearError: () => void;
}

export function useLocalAudioPlayback({
  state,
  bindingsByTrackId,
  libraryStatus,
  dispatchPlayer,
  audioRef
}: UseLocalAudioPlaybackOptions): LocalAudioPlaybackControls {
  const preparedSourceRef = useRef<PreparedAudioSource | undefined>(undefined);
  const sourceTokenSequenceRef = useRef(0);
  const [errorMessage, setErrorMessage] = useState<string>();

  const releasePreparedSource = useCallback(() => {
    const preparedSource = preparedSourceRef.current;

    if (!preparedSource) {
      return;
    }

    preparedSourceRef.current = undefined;
    preparedSource.audio.removeEventListener("ended", preparedSource.handleEnded);
    preparedSource.audio.pause();
    preparedSource.audio.removeAttribute("src");
    preparedSource.audio.load();
    URL.revokeObjectURL(preparedSource.objectUrl);
  }, []);

  const prepareSource = useCallback(
    (
      entry: PlaySequenceEntry,
      record: LocalAudioFileRecord,
      playbackRevision: number
    ): number | undefined => {
      const audio = audioRef.current;

      if (!audio) {
        return undefined;
      }

      const sourceKey = createSourceKey(entry, playbackRevision);
      const preparedSource = preparedSourceRef.current;

      if (
        preparedSource?.sourceKey === sourceKey &&
        preparedSource.record === record &&
        preparedSource.audio === audio
      ) {
        return preparedSource.sourceToken;
      }

      releasePreparedSource();

      const objectUrl = URL.createObjectURL(record.file);
      const sourceToken = sourceTokenSequenceRef.current + 1;
      const handleEnded = () => {
        if (preparedSourceRef.current?.sourceToken !== sourceToken) {
          return;
        }

        setErrorMessage(undefined);
        dispatchPlayer({ type: "playback-ended", playbackRevision });
      };

      sourceTokenSequenceRef.current = sourceToken;
      preparedSourceRef.current = {
        sourceKey,
        sourceToken,
        objectUrl,
        record,
        audio,
        handleEnded
      };
      audio.addEventListener("ended", handleEnded, SOURCE_ENDED_LISTENER_OPTIONS);

      try {
        audio.src = objectUrl;
        audio.currentTime = 0;
        audio.load();
      } catch (error) {
        releasePreparedSource();
        throw error;
      }

      return sourceToken;
    },
    [audioRef, dispatchPlayer, releasePreparedSource]
  );

  const beginPlayback = useCallback(
    (expectedSourceToken: number) => {
      const audio = audioRef.current;

      if (!audio) {
        return;
      }

      void audio.play().catch((error: unknown) => {
        if (preparedSourceRef.current?.sourceToken !== expectedSourceToken) {
          return;
        }

        setErrorMessage(getPlaybackErrorMessage(error));
        dispatchPlayer({ type: "pause" });
      });
    },
    [audioRef, dispatchPlayer]
  );

  useLayoutEffect(() => {
    const audio = audioRef.current;

    if (!audio) {
      return;
    }

    const targetEntry = getPlayTargetEntry(state);
    const targetRevision =
      state.status === "ended" ? state.playbackRevision + 1 : state.playbackRevision;
    const targetRecord = targetEntry
      ? bindingsByTrackId.get(targetEntry.trackId)
      : undefined;

    if (!targetEntry || !targetRecord) {
      releasePreparedSource();

      if (targetEntry && libraryStatus === "ready" && state.status === "playing") {
        dispatchPlayer({ type: "pause" });
      }

      return;
    }

    try {
      const sourceToken = prepareSource(targetEntry, targetRecord, targetRevision);

      if (state.status === "playing" && sourceToken) {
        beginPlayback(sourceToken);
      } else {
        audio.pause();
      }
    } catch {
      queueMicrotask(() => setErrorMessage("无法读取本地音频文件，请重新绑定。"));
      dispatchPlayer({ type: "pause" });
    }
  }, [
    beginPlayback,
    audioRef,
    bindingsByTrackId,
    dispatchPlayer,
    libraryStatus,
    prepareSource,
    releasePreparedSource,
    state
  ]);

  useLayoutEffect(() => {
    return () => {
      releasePreparedSource();
    };
  }, [releasePreparedSource]);

  const requestPlay = useCallback(() => {
    if (libraryStatus === "loading") {
      setErrorMessage("正在读取本地音频映射，请稍候。");
      return;
    }

    if (libraryStatus === "error") {
      setErrorMessage("本地音频映射不可用，暂时无法播放。");
      return;
    }

    const targetEntry = getPlayTargetEntry(state);
    const targetRecord = targetEntry
      ? bindingsByTrackId.get(targetEntry.trackId)
      : undefined;

    if (!targetEntry) {
      return;
    }

    if (!targetRecord) {
      setErrorMessage("未绑定音频文件");
      return;
    }

    try {
      const targetRevision =
        state.status === "ended" ? state.playbackRevision + 1 : state.playbackRevision;
      const sourceToken = prepareSource(targetEntry, targetRecord, targetRevision);

      if (!sourceToken) {
        setErrorMessage("播放器尚未准备完成，请重试。");
        return;
      }

      setErrorMessage(undefined);
      beginPlayback(sourceToken);
      dispatchPlayer({ type: "play" });
    } catch {
      setErrorMessage("无法读取本地音频文件，请重新绑定。");
    }
  }, [
    beginPlayback,
    bindingsByTrackId,
    dispatchPlayer,
    libraryStatus,
    prepareSource,
    state
  ]);

  const requestPause = useCallback(() => {
    audioRef.current?.pause();
    dispatchPlayer({ type: "pause" });
  }, [audioRef, dispatchPlayer]);

  const requestRestart = useCallback(() => {
    const currentEntry = state.currentEntry;
    const currentRecord = currentEntry
      ? bindingsByTrackId.get(currentEntry.trackId)
      : undefined;

    if (!currentEntry) {
      return;
    }

    if (!currentRecord) {
      setErrorMessage("未绑定音频文件");
      return;
    }

    try {
      const sourceToken = prepareSource(
        currentEntry,
        currentRecord,
        state.playbackRevision + 1
      );

      setErrorMessage(undefined);

      if (state.status === "playing" && sourceToken) {
        beginPlayback(sourceToken);
      }

      dispatchPlayer({ type: "restart-current" });
    } catch {
      setErrorMessage("无法读取本地音频文件，请重新绑定。");
    }
  }, [beginPlayback, bindingsByTrackId, dispatchPlayer, prepareSource, state]);

  const handleAudioError = useCallback(() => {
    if (!preparedSourceRef.current) {
      return;
    }

    setErrorMessage("音频文件无法播放，请重新绑定兼容的文件。");
    dispatchPlayer({ type: "pause" });
  }, [dispatchPlayer]);

  return {
    errorMessage,
    requestPlay,
    requestPause,
    requestRestart,
    handleAudioError,
    clearError: () => setErrorMessage(undefined)
  };
}

function createSourceKey(entry: PlaySequenceEntry, playbackRevision: number): string {
  return [entry.queueItemId, entry.trackId, entry.repeatIndex, playbackRevision].join(
    ":"
  );
}

function getPlayTargetEntry(state: PlayerState): PlaySequenceEntry | undefined {
  if (state.status === "ended") {
    return state.playSequence[0];
  }

  return state.currentEntry ?? undefined;
}

function getPlaybackErrorMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === "NotAllowedError") {
    return "浏览器阻止了自动播放，请再次点击播放。";
  }

  return "音频文件无法播放，请重新绑定兼容的文件。";
}
