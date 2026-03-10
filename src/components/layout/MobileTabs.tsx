import type { JSX } from 'react';
import type { MobileTab } from '@/types';

export interface MobileTabsProps {
  activeTab: MobileTab;
  onTabChange: (tab: MobileTab) => void;
  queueCount: number;
}

export function MobileTabs({ activeTab, onTabChange, queueCount }: MobileTabsProps): JSX.Element {
  return (
    <nav className="app-mobile-tabs" aria-label="View">
      <button
        type="button"
        className={`app-tab-btn${activeTab === 'queue' ? ' app-tab-btn--active' : ''}`}
        onClick={() => onTabChange('queue')}
      >
        Up Next
        {queueCount > 0 && <span className="app-tab-badge">{queueCount}</span>}
      </button>
      <button
        type="button"
        className={`app-tab-btn${activeTab === 'chat' ? ' app-tab-btn--active' : ''}`}
        onClick={() => onTabChange('chat')}
      >
        Chat
      </button>
    </nav>
  );
}
