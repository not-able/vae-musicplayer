import type { Track } from "../../types";
import type { LocalAudioLibraryStatus } from "../local-library/useLocalAudioLibrary";
import type { PlayerState, PlayerStatus } from "./playerReducer";

interface PlayerBarProps {
  state: PlayerState;
  tracks: readonly Track[];
  currentAudioFileName?: string;
  isCurrentAudioBound: boolean;
  canPlayTarget: boolean;
  audioLibraryStatus: LocalAudioLibraryStatus;
  playbackError?: string;
  onPlay: () => void;
  onPause: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onRestart: () => void;
}

export function PlayerBar({
  state,
  tracks,
  currentAudioFileName,
  isCurrentAudioBound,
  canPlayTarget,
  audioLibraryStatus,
  playbackError,
  onPlay,
  onPause,
  onNext,
  onPrevious,
  onRestart
}: PlayerBarProps) {
  const currentTrack = tracks.find((track) => track.id === state.currentEntry?.trackId);
  const isEmpty = state.status === "empty";
  const isPlaying = state.status === "playing";
  const playButtonLabel = state.status === "ended" ? "重新播放" : "播放";
  const audioStatusLabel = getAudioStatusLabel({
    isEmpty,
    isCurrentAudioBound,
    currentAudioFileName,
    audioLibraryStatus
  });
  const playerStatusLabel =
    playbackError ??
    (!isEmpty && audioLibraryStatus === "ready" && !isCurrentAudioBound
      ? "未绑定音频文件"
      : getPlayerStatusLabel(state.status));

  return (
    <footer className="player-bar" aria-label="本地音频播放器">
      <div className="player-now-playing">
        <p className="eyebrow">Local Player</p>
        <strong>
          {isEmpty ? "播放队列为空" : (currentTrack?.title ?? "未知歌曲")}
        </strong>
        <p className="player-sequence-meta">
          {state.currentEntry && state.currentIndex !== null
            ? `播放序列 ${state.currentIndex + 1} / ${state.playSequence.length} · 本项第 ${state.currentEntry.repeatIndex} / ${state.currentEntry.repeatTotal} 次`
            : "请先将歌曲加入临时歌单"}
        </p>
        {!isEmpty && (
          <p
            className={`player-audio-binding ${
              isCurrentAudioBound ? "is-bound" : "is-unbound"
            }`}
            title={audioStatusLabel}
          >
            {audioStatusLabel}
          </p>
        )}
      </div>

      <div className="player-actions" aria-label="本地音频播放器控制">
        <button
          type="button"
          disabled={isEmpty || !isCurrentAudioBound}
          aria-label="上一首"
          onClick={onPrevious}
        >
          上一首
        </button>
        <button
          type="button"
          disabled={isEmpty}
          aria-label="从头播放"
          onClick={onRestart}
        >
          从头播放
        </button>
        <button
          className="primary-player-action"
          type="button"
          disabled={isEmpty || (!isPlaying && !canPlayTarget)}
          aria-label={isPlaying ? "暂停" : playButtonLabel}
          onClick={isPlaying ? onPause : onPlay}
        >
          {isPlaying ? "暂停" : playButtonLabel}
        </button>
        <button type="button" disabled={isEmpty} aria-label="下一首" onClick={onNext}>
          下一首
        </button>
      </div>

      <p className={`player-status is-${state.status}`} aria-live="polite">
        <span aria-hidden="true" />
        <span>{playerStatusLabel}</span>
      </p>
    </footer>
  );
}

interface AudioStatusLabelInput {
  isEmpty: boolean;
  isCurrentAudioBound: boolean;
  currentAudioFileName?: string;
  audioLibraryStatus: LocalAudioLibraryStatus;
}

function getAudioStatusLabel({
  isEmpty,
  isCurrentAudioBound,
  currentAudioFileName,
  audioLibraryStatus
}: AudioStatusLabelInput): string {
  if (isEmpty) {
    return "";
  }

  if (audioLibraryStatus === "loading") {
    return "正在读取本地音频映射";
  }

  if (audioLibraryStatus === "error") {
    return "本地音频映射不可用";
  }

  if (!isCurrentAudioBound) {
    return "未绑定音频文件";
  }

  return currentAudioFileName ? `已绑定：${currentAudioFileName}` : "已绑定本地音频";
}

function getPlayerStatusLabel(status: PlayerStatus): string {
  switch (status) {
    case "empty":
      return "等待播放队列";
    case "paused":
      return "已暂停";
    case "playing":
      return "正在播放";
    case "ended":
      return "播放队列已结束";
  }
}
