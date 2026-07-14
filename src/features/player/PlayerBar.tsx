import type { Track } from "../../types";
import type { PlayerState, PlayerStatus } from "./playerReducer";

interface PlayerBarProps {
  state: PlayerState;
  tracks: readonly Track[];
  onPlay: () => void;
  onPause: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onRestart: () => void;
  onPlaybackEnded: () => void;
}

export function PlayerBar({
  state,
  tracks,
  onPlay,
  onPause,
  onNext,
  onPrevious,
  onRestart,
  onPlaybackEnded
}: PlayerBarProps) {
  const currentTrack = tracks.find((track) => track.id === state.currentEntry?.trackId);
  const isEmpty = state.status === "empty";
  const isPlaying = state.status === "playing";
  const playButtonLabel = state.status === "ended" ? "重新播放" : "播放";

  return (
    <footer className="player-bar" aria-label="Mock 播放器">
      <div className="player-now-playing">
        <p className="eyebrow">Mock Player</p>
        <strong>
          {isEmpty ? "播放队列为空" : (currentTrack?.title ?? "未知歌曲")}
        </strong>
        <p className="player-sequence-meta">
          {state.currentEntry && state.currentIndex !== null
            ? `播放序列 ${state.currentIndex + 1} / ${state.playSequence.length} · 本项第 ${state.currentEntry.repeatIndex} / ${state.currentEntry.repeatTotal} 次`
            : "请先将歌曲加入临时歌单"}
        </p>
      </div>

      <div className="player-actions" aria-label="Mock 播放器控制">
        <button
          type="button"
          disabled={isEmpty}
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
          disabled={isEmpty}
          aria-label={isPlaying ? "暂停" : playButtonLabel}
          onClick={isPlaying ? onPause : onPlay}
        >
          {isPlaying ? "暂停" : playButtonLabel}
        </button>
        <button type="button" disabled={isEmpty} aria-label="下一首" onClick={onNext}>
          下一首
        </button>
        <button
          className="mock-ended-action"
          type="button"
          disabled={!isPlaying}
          aria-label="模拟当前歌曲播放结束"
          onClick={onPlaybackEnded}
        >
          模拟结束
        </button>
      </div>

      <p className={`player-status is-${state.status}`} aria-live="polite">
        <span aria-hidden="true" />
        <span>Mock · {getPlayerStatusLabel(state.status)}</span>
      </p>
    </footer>
  );
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
