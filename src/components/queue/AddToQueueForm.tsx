import { useState, useCallback } from 'react';
import type { JSX } from 'react';
import { useReducer } from 'spacetimedb/react';
import { reducers } from '@/module_bindings';
import { parseVideoId, fetchVideoMetadata } from '@/utils/youtube';
import { searchYouTube, type YouTubeSearchResult } from '@/utils/youtubeSearch';

type AddMode = 'url' | 'search';

export function AddToQueueForm(): JSX.Element {
  const [mode, setMode] = useState<AddMode>('url');
  const [url, setUrl] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<YouTubeSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addToQueue = useReducer(reducers.addToQueue);

  const handleSearchSubmit = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    const trimmed = searchQuery.trim();
    if (!trimmed) {
      setSearchResults([]);
      setSearchError(null);
      return;
    }
    setSearchError(null);
    setSearchLoading(true);
    try {
      const results = await searchYouTube(trimmed);
      setSearchResults(results);
    } catch (err) {
      setSearchResults([]);
      setSearchError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setSearchLoading(false);
    }
  };

  const handleSubmitUrl = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    setError(null);

    const videoId = parseVideoId(url);
    if (!videoId) {
      setError('Paste a valid YouTube URL or video ID');
      return;
    }

    setIsAdding(true);
    try {
      const { title, thumbnailUrl } = await fetchVideoMetadata(videoId);
      await addToQueue({ videoId, title, thumbnailUrl });
      setUrl('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add video');
    } finally {
      setIsAdding(false);
    }
  };

  const handleAddSearchResult = useCallback(
    async (result: YouTubeSearchResult): Promise<void> => {
      setError(null);
      setIsAdding(true);
      try {
        await addToQueue({
          videoId: result.videoId,
          title: result.title,
          thumbnailUrl:
            result.thumbnailUrl || `https://i.ytimg.com/vi/${result.videoId}/mqdefault.jpg`,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to add video');
      } finally {
        setIsAdding(false);
      }
    },
    [addToQueue]
  );

  return (
    <div className="add-to-queue">
      <div className="add-to-queue-mode" role="tablist" aria-label="Add by URL or search">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'url'}
          className={`add-to-queue-mode-btn${mode === 'url' ? ' add-to-queue-mode-btn--active' : ''}`}
          onClick={() => setMode('url')}
        >
          Link
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'search'}
          className={`add-to-queue-mode-btn${mode === 'search' ? ' add-to-queue-mode-btn--active' : ''}`}
          onClick={() => setMode('search')}
        >
          Search
        </button>
      </div>

      {mode === 'url' && (
        <form className="add-to-queue-form" onSubmit={handleSubmitUrl}>
          <input
            type="text"
            className="add-to-queue-input"
            placeholder="Paste a YouTube URL..."
            value={url}
            onChange={e => setUrl(e.target.value)}
            disabled={isAdding}
            aria-label="YouTube URL input"
          />
          <button
            type="submit"
            className="add-to-queue-btn"
            disabled={isAdding || !url.trim()}
            aria-label="Add to queue"
          >
            {isAdding ? '...' : '+ Add'}
          </button>
        </form>
      )}

      {mode === 'search' && (
        <div className="add-to-queue-search">
          <form className="add-to-queue-form" onSubmit={handleSearchSubmit}>
            <input
              type="search"
              className="add-to-queue-input add-to-queue-search-input"
              placeholder="Search for a song or video..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              disabled={isAdding || searchLoading}
              aria-label="Search YouTube"
              autoComplete="off"
            />
            <button
              type="submit"
              className="add-to-queue-btn"
              disabled={isAdding || searchLoading || !searchQuery.trim()}
              aria-label="Search"
            >
              {searchLoading ? '...' : 'Search'}
            </button>
          </form>
          {searchLoading && (
            <p className="add-to-queue-search-status" aria-live="polite">
              Searching…
            </p>
          )}
          {searchError && !searchLoading && (
            <p className="add-to-queue-error" role="alert">
              {searchError}
            </p>
          )}
          {searchResults.length > 0 && !searchLoading && (
            <ul className="add-to-queue-results" role="list">
              {searchResults.map(result => (
                <li key={result.videoId} className="add-to-queue-result-item">
                  <img
                    src={
                      result.thumbnailUrl ||
                      `https://i.ytimg.com/vi/${result.videoId}/mqdefault.jpg`
                    }
                    alt=""
                    className="add-to-queue-result-thumb"
                  />
                  <span className="add-to-queue-result-title" title={result.title}>
                    {result.title}
                  </span>
                  <button
                    type="button"
                    className="add-to-queue-result-add"
                    onClick={() => handleAddSearchResult(result)}
                    disabled={isAdding}
                    aria-label={`Add ${result.title} to queue`}
                  >
                    + Add
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {error && (
        <p className="add-to-queue-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
