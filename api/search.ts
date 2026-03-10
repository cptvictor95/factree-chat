import type { VercelRequest, VercelResponse } from '@vercel/node';

interface YouTubeSearchItem {
  id?: { videoId?: string };
  snippet?: {
    title?: string;
    thumbnails?: {
      default?: { url?: string };
      medium?: { url?: string };
      high?: { url?: string };
    };
  };
}

interface SearchResult {
  videoId: string;
  title: string;
  thumbnailUrl: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const q = typeof req.query.q === 'string' ? req.query.q : req.query.q?.[0];
  if (!q || q.trim().length === 0) {
    res.status(400).json({ error: 'Missing or empty query parameter: q' });
    return;
  }

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    res.status(503).json({
      error: 'Search not configured',
      hint: 'Set YOUTUBE_API_KEY in the project environment.',
    });
    return;
  }

  const url = new URL('https://www.googleapis.com/youtube/v3/search');
  url.searchParams.set('part', 'snippet');
  url.searchParams.set('type', 'video');
  url.searchParams.set('maxResults', '10');
  url.searchParams.set('q', q.trim());
  url.searchParams.set('key', apiKey);

  let response: Response;
  try {
    response = await fetch(url.toString());
  } catch (err) {
    console.error('YouTube API fetch error:', err);
    res.status(502).json({ error: 'Search request failed' });
    return;
  }

  if (!response.ok) {
    const text = await response.text();
    console.error('YouTube API error:', response.status, text);
    let message = 'Search failed';
    try {
      const json = JSON.parse(text) as { error?: { message?: string; code?: number } };
      const msg = json?.error?.message;
      if (msg) message = msg;
    } catch {
      // keep default message
    }
    res.status(502).json({ error: message });
    return;
  }

  const data = (await response.json()) as { items?: YouTubeSearchItem[] };
  const items = data.items ?? [];
  const results: SearchResult[] = items
    .filter((item): item is YouTubeSearchItem & { id: { videoId: string } } => !!item.id?.videoId)
    .map(item => ({
      videoId: item.id.videoId,
      title: item.snippet?.title ?? '',
      thumbnailUrl:
        item.snippet?.thumbnails?.medium?.url ??
        item.snippet?.thumbnails?.high?.url ??
        item.snippet?.thumbnails?.default?.url ??
        '',
    }));

  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
  res.status(200).json({ results });
}
