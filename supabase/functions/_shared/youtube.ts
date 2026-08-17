export type VideoRecord = {
  id: string | number;
  title: string | null;
  youtube_url: string | null;
  youtube_video_id: string | null;
};

export type YouTubeVideo = {
  id?: string;
  snippet?: {
    publishedAt?: string;
    channelId?: string;
    channelTitle?: string;
  };
  statistics?: {
    viewCount?: string;
    likeCount?: string;
    commentCount?: string;
  };
};

export type YouTubeChannel = {
  id?: string;
  snippet?: { title?: string };
  statistics?: {
    subscriberCount?: string;
    viewCount?: string;
    videoCount?: string;
  };
};

export function sanitizeVideoId(value: string | null | undefined): string | null {
  const candidate = String(value || "").trim();
  return /^[A-Za-z0-9_-]{11}$/.test(candidate) ? candidate : null;
}

export function extractYouTubeVideoId(value: string | null): string | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const directId = sanitizeVideoId(raw);
  if (directId) return directId;

  try {
    const normalized = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const url = new URL(normalized);
    const host = url.hostname.toLowerCase().replace(/^www\./, "").replace(/^m\./, "");

    if (host === "youtu.be") {
      return sanitizeVideoId(url.pathname.split("/").filter(Boolean)[0]);
    }

    if (
      host === "youtube.com" ||
      host.endsWith(".youtube.com") ||
      host === "youtube-nocookie.com" ||
      host.endsWith(".youtube-nocookie.com")
    ) {
      const queryId = sanitizeVideoId(url.searchParams.get("v"));
      if (queryId) return queryId;

      const segments = url.pathname.split("/").filter(Boolean);
      if (["shorts", "embed", "live", "v"].includes(segments[0] || "")) {
        return sanitizeVideoId(segments[1]);
      }
    }
  } catch {
    return null;
  }

  return null;
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

export function parseCount(value: string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function fetchYouTubeVideos(
  videoIds: string[],
  apiKey: string,
): Promise<Map<string, YouTubeVideo>> {
  const result = new Map<string, YouTubeVideo>();

  for (const videoIdChunk of chunk(videoIds, 50)) {
    const params = new URLSearchParams({
      part: "snippet,statistics",
      id: videoIdChunk.join(","),
      key: apiKey,
      fields:
        "items(id,snippet(publishedAt,channelId,channelTitle)," +
        "statistics(viewCount,likeCount,commentCount))",
    });

    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?${params.toString()}`,
      { headers: { Accept: "application/json" } },
    );
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(String(
        payload?.error?.message ||
        "YouTube Data APIから動画情報を取得できませんでした。"
      ));
    }

    for (const item of (Array.isArray(payload?.items) ? payload.items : []) as YouTubeVideo[]) {
      const id = sanitizeVideoId(item.id);
      if (id) result.set(id, item);
    }
  }

  return result;
}

export async function fetchYouTubeChannels(
  channelIds: string[],
  apiKey: string,
): Promise<YouTubeChannel[]> {
  const result: YouTubeChannel[] = [];
  for (const channelIdChunk of chunk(channelIds, 50)) {
    const params = new URLSearchParams({
      part: "snippet,statistics",
      id: channelIdChunk.join(","),
      key: apiKey,
      fields: "items(id,snippet(title),statistics(subscriberCount,viewCount,videoCount))",
    });
    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/channels?${params.toString()}`,
      { headers: { Accept: "application/json" } },
    );
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(String(
        payload?.error?.message ||
        "YouTube Data APIからチャンネル情報を取得できませんでした。"
      ));
    }
    result.push(...((Array.isArray(payload?.items) ? payload.items : []) as YouTubeChannel[]));
  }
  return result;
}
