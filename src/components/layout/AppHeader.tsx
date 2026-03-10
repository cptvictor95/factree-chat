import type { JSX } from 'react';

export interface AppHeaderProps {
  onlineCount: number;
}

export function AppHeader({ onlineCount }: AppHeaderProps): JSX.Element {
  return (
    <header className="app-header">
      <span className="app-logo">factree.fm</span>
      <span className="app-online-count">
        <span className="app-online-dot" aria-hidden="true" />
        {onlineCount} {onlineCount === 1 ? 'person' : 'people'} listening
      </span>
    </header>
  );
}
