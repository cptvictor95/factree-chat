export interface YouTubeSearchResult {
  videoId: string;
  title: string;
  thumbnailUrl: string;
}

export interface YouTubeSearchResponse {
  results: YouTubeSearchResult[];
}

export async function searchYouTube(query: string): Promise<YouTubeSearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const url = new URL('/api/search', window.location.origin);
  url.searchParams.set('q', trimmed);

  const response = await fetch(url.toString());
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: string;
      hint?: string;
    };
    const message = body?.error ?? `Search failed (${response.status})`;
    const withHint = body?.hint ? `${message} — ${body.hint}` : message;
    throw new Error(withHint);
  }

  const data = (await response.json()) as YouTubeSearchResponse;
  return data.results ?? [];
}
