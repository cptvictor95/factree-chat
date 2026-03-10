interface OEmbedResponse {
  title: string;
  thumbnail_url: string;
  author_name: string;
}

interface VideoMetadata {
  title: string;
  thumbnailUrl: string;
}

export function parseVideoId(url: string): string | null {
  const trimmed = url.trim();

  // youtu.be/VIDEO_ID
  const shortMatch = trimmed.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
  if (shortMatch) return shortMatch[1];

  // youtube.com/watch?v=VIDEO_ID or youtube.com/watch?v=VIDEO_ID&...
  const watchMatch = trimmed.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
  if (watchMatch) return watchMatch[1];

  // youtube.com/embed/VIDEO_ID or youtube.com/v/VIDEO_ID
  const embedMatch = trimmed.match(/(?:embed|v)\/([a-zA-Z0-9_-]{11})/);
  if (embedMatch) return embedMatch[1];

  // Plain 11-character video ID
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;

  return null;
}

export async function fetchVideoMetadata(videoId: string): Promise<VideoMetadata> {
  const url = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Could not fetch video metadata (${response.status}). The video may be private or unavailable.`);
  }

  const data = (await response.json()) as OEmbedResponse;

  return {
    title: data.title,
    thumbnailUrl: data.thumbnail_url,
  };
}
