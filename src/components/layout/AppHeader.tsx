import type { JSX } from 'react';

export interface AppHeaderProps {
  onlineCount: number;
}

export function AppHeader({ onlineCount }: AppHeaderProps): JSX.Element {
  return (
    <header className="app-header">
      <img src="/logo.svg" alt="factree.fm" className="app-logo" width="140" height="31" />
      <span className="app-online-count">
        <span className="app-online-dot" aria-hidden="true" />
        {onlineCount} {onlineCount === 1 ? 'person' : 'people'} listening
      </span>
    </header>
  );
}
