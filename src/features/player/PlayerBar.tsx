export function PlayerBar() {
  return (
    <footer className="player-bar" aria-label="播放器">
      <div>
        <p className="eyebrow">Player</p>
        <strong>尚未选择可播放音源</strong>
      </div>
      <div className="player-actions" aria-label="播放器控制占位">
        <button type="button" disabled>
          上一首
        </button>
        <button type="button" disabled>
          播放
        </button>
        <button type="button" disabled>
          下一首
        </button>
      </div>
      <p className="muted">当前版本只提供播放器状态骨架。</p>
    </footer>
  );
}
