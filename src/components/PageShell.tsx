import type { ReactNode } from "react";

interface PageShellProps {
  children: ReactNode;
}

export function PageShell({ children }: PageShellProps) {
  return (
    <div className="page-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">本地优先 / 开源 / 播放编排</p>
          <h1>许嵩音乐播放编排器</h1>
        </div>
        <p className="copyright-note">
          不内置未经授权的音频、歌词或封面；优先播放用户本地合法音源。
        </p>
      </header>

      {children}
    </div>
  );
}
