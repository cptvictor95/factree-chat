import { useEffect, useRef } from 'react';

// Minimal silent WAV (100ms) so we don't need to host a file. Muted and looped
// to signal "media is playing" and reduce the chance the browser pauses our tab
// when the user switches apps (especially on Android PWA).
// Minimal valid silent WAV (44-byte header + minimal data chunk)
const SILENT_WAV_DATA_URL =
  'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';

/**
 * Plays a muted, looping silent audio track while the app is "playing".
 * Some mobile browsers are less aggressive about pausing media when at least
 * one media element is active. This is a best-effort workaround; results vary
 * by OS and browser (Android PWA often benefits, iOS may still pause).
 */
export function useBackgroundAudioKeepAlive(isActive: boolean): void {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!isActive) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
        audioRef.current = null;
      }
      return;
    }

    const audio = new Audio(SILENT_WAV_DATA_URL);
    audio.muted = true;
    audio.loop = true;
    audio.volume = 0;
    audioRef.current = audio;

    const play = (): void => {
      audio.play().catch(() => {
        // Autoplay may be blocked; keep-alive is best-effort
      });
    };

    play();

    return () => {
      audio.pause();
      audio.src = '';
      audioRef.current = null;
    };
  }, [isActive]);
}
