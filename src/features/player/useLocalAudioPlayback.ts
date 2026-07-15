import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

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
  token: string;
  objectUrl: string;
  file: File;
}

export interface LocalAudioPlaybackControls {
  errorMessage?: string;
  requestPlay: () => void;
  requestPause: () => void;
  requestRestart: () => void;
  handleAudioEnded: () => void;
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
  const [errorMessage, setErrorMessage] = useState<string>();

  const releasePreparedSource = useCallback((audio: HTMLAudioElement) => {
    const preparedSource = preparedSourceRef.current;

    if (!preparedSource) {
      return;
    }

    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    URL.revokeObjectURL(preparedSource.objectUrl);
    preparedSourceRef.current = undefined;
  }, []);

  const prepareSource = useCallback(
    (
      entry: PlaySequenceEntry,
      file: File,
      playbackRevision: number
    ): string | undefined => {
      const audio = audioRef.current;

      if (!audio) {
        return undefined;
      }

      const token = createSourceToken(entry, playbackRevision);
      const preparedSource = preparedSourceRef.current;

      if (preparedSource?.token === token && preparedSource.file === file) {
        return token;
      }

      releasePreparedSource(audio);

      const objectUrl = URL.createObjectURL(file);
      audio.src = objectUrl;
      audio.currentTime = 0;
      audio.load();
      preparedSourceRef.current = { token, objectUrl, file };

      return token;
    },
    [audioRef, releasePreparedSource]
  );

  const beginPlayback = useCallback(
    (expectedSourceToken: string) => {
      const audio = audioRef.current;

      if (!audio) {
        return;
      }

      void audio.play().catch((error: unknown) => {
        if (preparedSourceRef.current?.token !== expectedSourceToken) {
          return;
        }

        setErrorMessage(getPlaybackErrorMessage(error));
        dispatchPlayer({ type: "pause" });
      });
    },
    [audioRef, dispatchPlayer]
  );

  useEffect(() => {
    const audio = audioRef.current;

    if (!audio) {
      return;
    }

    const currentEntry = state.currentEntry;
    const currentRecord = currentEntry
      ? bindingsByTrackId.get(currentEntry.trackId)
      : undefined;

    if (!currentEntry || !currentRecord) {
      releasePreparedSource(audio);

      if (currentEntry && libraryStatus === "ready" && state.status === "playing") {
        dispatchPlayer({ type: "pause" });
      }

      return;
    }

    try {
      const sourceToken = prepareSource(
        currentEntry,
        currentRecord.file,
        state.playbackRevision
      );

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
    state.currentEntry,
    state.playbackRevision,
    state.status
  ]);

  useEffect(() => {
    const audio = audioRef.current;

    return () => {
      if (audio) {
        releasePreparedSource(audio);
      }
    };
  }, [audioRef, releasePreparedSource]);

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
      const sourceToken = prepareSource(targetEntry, targetRecord.file, targetRevision);

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
        currentRecord.file,
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

  const handleAudioEnded = useCallback(() => {
    setErrorMessage(undefined);
    dispatchPlayer({ type: "playback-ended" });
  }, [dispatchPlayer]);

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
    handleAudioEnded,
    handleAudioError,
    clearError: () => setErrorMessage(undefined)
  };
}

function createSourceToken(entry: PlaySequenceEntry, playbackRevision: number): string {
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
