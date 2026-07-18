import type { ReactNode } from "react";

interface PageShellProps {
  children: ReactNode;
}

export function PageShell({ children }: PageShellProps) {
  return (
    <div className="page-shell">
      <a className="skip-link" href="#main-content">
        跳到主要内容
      </a>
      <header className="app-header">
        <div>
          <h1>音乐播放编排器</h1>
          <p className="copyright-note">
            仅播放你主动选择或授权访问的本地音频；本项目不提供音频、歌词或封面。
          </p>
        </div>
      </header>

      {children}
    </div>
  );
}
