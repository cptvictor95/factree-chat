import { useState } from 'react';
import type { JSX } from 'react';
import { useReducer } from 'spacetimedb/react';
import { reducers } from '../../module_bindings';
import { parseVideoId, fetchVideoMetadata } from '../../utils/youtube';

export function AddToQueueForm(): JSX.Element {
  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addToQueue = useReducer(reducers.addToQueue);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    setError(null);

    const videoId = parseVideoId(url);
    if (!videoId) {
      setError('Paste a valid YouTube URL or video ID');
      return;
    }

    setIsLoading(true);
    try {
      const { title, thumbnailUrl } = await fetchVideoMetadata(videoId);
      await addToQueue({ videoId, title, thumbnailUrl });
      setUrl('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add video');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form className="add-to-queue-form" onSubmit={handleSubmit}>
      <input
        type="text"
        className="add-to-queue-input"
        placeholder="Paste a YouTube URL..."
        value={url}
        onChange={e => setUrl(e.target.value)}
        disabled={isLoading}
        aria-label="YouTube URL input"
      />
      <button
        type="submit"
        className="add-to-queue-btn"
        disabled={isLoading || !url.trim()}
        aria-label="Add to queue"
      >
        {isLoading ? '...' : '+ Add'}
      </button>
      {error && <p className="add-to-queue-error">{error}</p>}
    </form>
  );
}
