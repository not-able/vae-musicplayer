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
  handleProgressChange: () => void;
}

const SOURCE_ENDED_LISTENER_OPTIONS = { passive: true } as const;

export interface LocalAudioPlaybackControls {
  errorMessage?: string;
  progress: LocalAudioPlaybackProgress;
  requestPlay: () => void;
  requestPause: () => void;
  requestRestart: () => void;
  requestSeek: (timeSeconds: number) => void;
  stopAndRelease: () => void;
  handleAudioError: () => void;
  clearError: () => void;
}

export interface LocalAudioPlaybackProgress {
  currentTimeSeconds: number;
  durationSeconds?: number;
}

const EMPTY_PLAYBACK_PROGRESS: LocalAudioPlaybackProgress = {
  currentTimeSeconds: 0
};

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
  const [progress, setProgress] = useState<LocalAudioPlaybackProgress>(
    EMPTY_PLAYBACK_PROGRESS
  );

  const updateProgress = useCallback((audio: HTMLAudioElement) => {
    const nextProgress = getPlaybackProgress(audio);

    setProgress((previousProgress) =>
      isSamePlaybackProgress(previousProgress, nextProgress)
        ? previousProgress
        : nextProgress
    );
  }, []);

  const resetProgress = useCallback(() => {
    setProgress((previousProgress) =>
      isSamePlaybackProgress(previousProgress, EMPTY_PLAYBACK_PROGRESS)
        ? previousProgress
        : EMPTY_PLAYBACK_PROGRESS
    );
  }, []);

  const releasePreparedSource = useCallback(() => {
    const preparedSource = preparedSourceRef.current;

    if (!preparedSource) {
      resetProgress();
      return;
    }

    preparedSourceRef.current = undefined;
    preparedSource.audio.removeEventListener("ended", preparedSource.handleEnded);
    for (const eventName of MEDIA_PROGRESS_EVENTS) {
      preparedSource.audio.removeEventListener(
        eventName,
        preparedSource.handleProgressChange
      );
    }
    preparedSource.audio.pause();
    preparedSource.audio.removeAttribute("src");
    preparedSource.audio.load();
    URL.revokeObjectURL(preparedSource.objectUrl);
    resetProgress();
  }, [resetProgress]);

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
      const handleProgressChange = () => {
        if (preparedSourceRef.current?.sourceToken !== sourceToken) {
          return;
        }

        updateProgress(audio);
      };

      sourceTokenSequenceRef.current = sourceToken;
      preparedSourceRef.current = {
        sourceKey,
        sourceToken,
        objectUrl,
        record,
        audio,
        handleEnded,
        handleProgressChange
      };
      audio.addEventListener("ended", handleEnded, SOURCE_ENDED_LISTENER_OPTIONS);
      for (const eventName of MEDIA_PROGRESS_EVENTS) {
        audio.addEventListener(eventName, handleProgressChange);
      }
      resetProgress();

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
    [audioRef, dispatchPlayer, releasePreparedSource, resetProgress, updateProgress]
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

  const requestSeek = useCallback(
    (timeSeconds: number) => {
      const preparedSource = preparedSourceRef.current;
      const durationSeconds = preparedSource?.audio.duration;

      if (
        !preparedSource ||
        !Number.isFinite(timeSeconds) ||
        !isValidDuration(durationSeconds)
      ) {
        return;
      }

      const nextTime = Math.min(Math.max(0, timeSeconds), durationSeconds);

      try {
        preparedSource.audio.currentTime = nextTime;
        updateProgress(preparedSource.audio);
      } catch {
        setErrorMessage("无法定位当前音频，请重新绑定兼容的文件。");
      }
    },
    [updateProgress]
  );

  const stopAndRelease = useCallback(() => {
    releasePreparedSource();
    dispatchPlayer({ type: "pause" });
  }, [dispatchPlayer, releasePreparedSource]);

  const handleAudioError = useCallback(() => {
    if (!preparedSourceRef.current) {
      return;
    }

    setErrorMessage("音频文件无法播放，请重新绑定兼容的文件。");
    releasePreparedSource();
    dispatchPlayer({ type: "pause" });
  }, [dispatchPlayer, releasePreparedSource]);

  return {
    errorMessage,
    progress,
    requestPlay,
    requestPause,
    requestRestart,
    requestSeek,
    stopAndRelease,
    handleAudioError,
    clearError: () => setErrorMessage(undefined)
  };
}

const MEDIA_PROGRESS_EVENTS = [
  "loadedmetadata",
  "durationchange",
  "timeupdate",
  "seeking",
  "seeked"
] as const;

function getPlaybackProgress(audio: HTMLAudioElement): LocalAudioPlaybackProgress {
  const durationSeconds = audio.duration;

  if (!isValidDuration(durationSeconds)) {
    return EMPTY_PLAYBACK_PROGRESS;
  }

  const currentTimeSeconds = Number.isFinite(audio.currentTime)
    ? Math.min(Math.max(0, audio.currentTime), durationSeconds)
    : 0;

  return { currentTimeSeconds, durationSeconds };
}

function isSamePlaybackProgress(
  first: LocalAudioPlaybackProgress,
  second: LocalAudioPlaybackProgress
): boolean {
  return (
    first.currentTimeSeconds === second.currentTimeSeconds &&
    first.durationSeconds === second.durationSeconds
  );
}

function isValidDuration(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
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
