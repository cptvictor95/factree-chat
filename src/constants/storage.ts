/**
 * LocalStorage keys and default values used across the app.
 * Centralized so we can change or namespace them in one place.
 */

export const STORAGE_KEYS = {
  /** SpacetimeDB auth token (set by main.tsx from connection) */
  authToken: (host: string, dbName: string) => `${host}/${dbName}/auth_token`,
  /** User volume 0–100 */
  volume: 'factree-fm-volume',
  /** Audio-only mode when 'true' */
  videoOff: 'factree-fm-video-off',
  /** Display name fallback when DB has no name (e.g. after wipe) */
  username: 'factree-fm-username',
} as const;

export const DEFAULTS = {
  volume: 50,
} as const;
