import type { ReactNode } from "react";

interface PageShellProps {
  children: ReactNode;
}

export function PageShell({ children }: PageShellProps) {
  return (
    <div className="page-shell">
      <header className="app-header">
        <div>
          <h1>音乐播放编排器</h1>
        </div>
      </header>

      {children}
    </div>
  );
}
