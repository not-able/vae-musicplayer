import type { CSSProperties } from "react";

import type { AudioMappingStatus, Track } from "../../types";
import type { LocalAudioLibraryStatus } from "../local-library/useLocalAudioLibrary";
import type { PlayerState, PlayerStatus } from "./playerReducer";
import type { PlayerSettings } from "./playerSettingsRepository";
import type {
  LocalAudioPlaybackProgress,
  PlayerSettingsStatus
} from "./useLocalAudioPlayback";

interface PlayerBarProps {
  state: PlayerState;
  tracks: readonly Track[];
  currentAudioFileName?: string;
  currentAudioBindingStatus?: AudioMappingStatus;
  isCurrentAudioBound: boolean;
  canPlayTarget: boolean;
  canStartCurrentPlaylist?: boolean;
  audioLibraryStatus: LocalAudioLibraryStatus;
  playbackError?: string;
  settingsError?: string;
  playerSettings: PlayerSettings;
  playerSettingsStatus: PlayerSettingsStatus;
  playbackProgress: LocalAudioPlaybackProgress;
  onPlay: () => void;
  onPause: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onRestart: () => void;
  onSeek: (timeSeconds: number) => void;
  onVolumeChange: (volume: number) => void;
  onToggleMuted: () => void;
}

export function PlayerBar({
  state,
  tracks,
  currentAudioFileName,
  currentAudioBindingStatus,
  isCurrentAudioBound,
  canPlayTarget,
  canStartCurrentPlaylist = false,
  audioLibraryStatus,
  playbackError,
  settingsError,
  playerSettings,
  playerSettingsStatus,
  playbackProgress,
  onPlay,
  onPause,
  onNext,
  onPrevious,
  onRestart,
  onSeek,
  onVolumeChange,
  onToggleMuted
}: PlayerBarProps) {
  const currentTrack = tracks.find((track) => track.id === state.currentEntry?.trackId);
  const isEmpty = state.status === "empty";
  const isPlaying = state.status === "playing";
  const playButtonLabel = state.status === "ended" ? "重新播放" : "播放";
  const audioStatusLabel = getAudioStatusLabel({
    isEmpty,
    isCurrentAudioBound,
    currentAudioFileName,
    currentAudioBindingStatus,
    audioLibraryStatus
  });
  const playerStatusLabel =
    playbackError ??
    settingsError ??
    (!isEmpty && audioLibraryStatus === "ready" && !isCurrentAudioBound
      ? "未绑定音频文件"
      : getPlayerStatusLabel(state.status));
  const isSeekable =
    isCurrentAudioBound &&
    typeof playbackProgress.durationSeconds === "number" &&
    playbackProgress.durationSeconds > 0;
  const durationSeconds = playbackProgress.durationSeconds ?? 0;
  const currentTimeSeconds = isSeekable
    ? Math.min(playbackProgress.currentTimeSeconds, durationSeconds)
    : 0;
  const progressTimeLabel = isSeekable
    ? `${formatPlaybackTime(currentTimeSeconds)} / ${formatPlaybackTime(durationSeconds)}`
    : "--:-- / --:--";
  const progressStyle = {
    "--player-progress-percentage": isSeekable
      ? `${(currentTimeSeconds / durationSeconds) * 100}%`
      : "0%"
  } as CSSProperties;

  return (
    <footer className="player-bar" aria-label="本地音频播放器">
      <div className="player-now-playing">
        <p className="eyebrow">本地播放器</p>
        <strong>
          {isEmpty ? "播放队列为空" : (currentTrack?.title ?? "未知歌曲")}
        </strong>
        <p className="player-sequence-meta">
          {state.currentEntry && state.currentIndex !== null
            ? `播放序列 ${state.currentIndex + 1} / ${state.playSequence.length} · 本项第 ${state.currentEntry.repeatIndex} / ${state.currentEntry.repeatTotal} 次`
            : "请先将歌曲加入当前歌单"}
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
          disabled={isEmpty ? !canStartCurrentPlaylist : !isPlaying && !canPlayTarget}
          aria-label={isPlaying ? "暂停" : playButtonLabel}
          onClick={isPlaying ? onPause : onPlay}
        >
          {isPlaying ? "暂停" : playButtonLabel}
        </button>
        <button type="button" disabled={isEmpty} aria-label="下一首" onClick={onNext}>
          下一首
        </button>
      </div>

      <section className="player-progress" aria-label="播放进度" style={progressStyle}>
        <label className="player-progress-label" htmlFor="player-progress-range">
          播放进度
        </label>
        <span className="player-progress-current" aria-hidden="true">
          {isSeekable ? formatPlaybackTime(currentTimeSeconds) : "--:--"}
        </span>
        <input
          id="player-progress-range"
          type="range"
          min="0"
          max={durationSeconds}
          step="0.1"
          value={currentTimeSeconds}
          disabled={!isSeekable}
          aria-label="播放进度"
          aria-valuetext={isSeekable ? progressTimeLabel : "当前音频尚未加载有效时长"}
          onChange={(event) => onSeek(Number(event.currentTarget.value))}
        />
        <span className="player-progress-duration" aria-hidden="true">
          {isSeekable ? formatPlaybackTime(durationSeconds) : "--:--"}
        </span>
      </section>

      <section className="player-volume" aria-label="音量控制">
        <button
          className="icon-button player-mute-button"
          type="button"
          disabled={playerSettingsStatus === "loading"}
          aria-label={playerSettings.muted ? "取消静音" : "静音"}
          title={playerSettings.muted ? "取消静音" : "静音"}
          onClick={onToggleMuted}
        >
          {playerSettings.muted ? "🔇" : "🔊"}
        </button>
        <label className="player-volume-label" htmlFor="player-volume-range">
          音量
        </label>
        <input
          id="player-volume-range"
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={playerSettings.volume}
          disabled={playerSettingsStatus === "loading"}
          aria-label="音量"
          aria-valuetext={`音量 ${Math.round(playerSettings.volume * 100)}%`}
          onChange={(event) => onVolumeChange(Number(event.currentTarget.value))}
        />
        <output>{Math.round(playerSettings.volume * 100)}%</output>
      </section>

      <p className={`player-status is-${state.status}`} aria-live="polite">
        <span aria-hidden="true" />
        <span>{playerStatusLabel}</span>
      </p>
    </footer>
  );
}

function formatPlaybackTime(timeSeconds: number): string {
  const wholeSeconds = Math.max(0, Math.floor(timeSeconds));
  const minutes = Math.floor(wholeSeconds / 60);
  const seconds = wholeSeconds % 60;

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

interface AudioStatusLabelInput {
  isEmpty: boolean;
  isCurrentAudioBound: boolean;
  currentAudioFileName?: string;
  currentAudioBindingStatus?: AudioMappingStatus;
  audioLibraryStatus: LocalAudioLibraryStatus;
}

function getAudioStatusLabel({
  isEmpty,
  isCurrentAudioBound,
  currentAudioFileName,
  currentAudioBindingStatus,
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

  if (currentAudioBindingStatus === "permission_required") {
    return currentAudioFileName
      ? `需要重新授权：${currentAudioFileName}`
      : "本地原文件需要重新授权";
  }

  if (currentAudioBindingStatus === "missing") {
    return currentAudioFileName
      ? `原文件不可用：${currentAudioFileName}`
      : "本地原文件不可用";
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
