import { createClient } from "npm:@supabase/supabase-js@^2.95.0";
import { corsHeaders } from "npm:@supabase/supabase-js@^2.95.0/cors";

type VideoRecord = {
  id: string | number;
  title: string | null;
  youtube_url: string | null;
  youtube_video_id: string | null;
  views_24?: number | null;
  youtube_24h_captured_at?: string | null;
};

type YouTubeVideo = {
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

type YouTubeChannel = {
  id?: string;
  snippet?: { title?: string };
  statistics?: {
    subscriberCount?: string;
    viewCount?: string;
    videoCount?: string;
  };
};

const jsonHeaders = {
  ...corsHeaders,
  "Content-Type": "application/json; charset=utf-8",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

function getPublishableKey(): string {
  const modernKeys = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
  if (modernKeys) {
    try {
      const parsed = JSON.parse(modernKeys) as Record<string, string>;
      const firstKey = parsed.default || Object.values(parsed).find(Boolean);
      if (firstKey) return firstKey;
    } catch {
      // legacy key fallback below
    }
  }
  return Deno.env.get("SUPABASE_ANON_KEY") || "";
}

function sanitizeVideoId(value: string | null | undefined): string | null {
  const candidate = String(value || "").trim();
  return /^[A-Za-z0-9_-]{11}$/.test(candidate) ? candidate : null;
}

function extractYouTubeVideoId(value: string | null): string | null {
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

function parseCount(value: string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

async function fetchYouTubeVideos(
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

async function fetchYouTubeChannels(
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

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "POSTリクエストだけ利用できます。" }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const publishableKey = getPublishableKey();
    const youtubeApiKey = Deno.env.get("YOUTUBE_API_KEY") || "";
    const authorization = request.headers.get("Authorization") || "";

    if (!supabaseUrl || !publishableKey) {
      return jsonResponse({ error: "Supabaseの環境変数を確認してください。" }, 500);
    }
    if (!youtubeApiKey) {
      return jsonResponse({ error: "Edge FunctionのSecretにYOUTUBE_API_KEYを設定してください。" }, 500);
    }
    if (!authorization) {
      return jsonResponse({ error: "ログイン情報を確認できませんでした。" }, 401);
    }

    const supabase = createClient(supabaseUrl, publishableKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return jsonResponse({ error: "ログインの有効期限を確認してください。" }, 401);
    }

    const body = await request.json();
    const recordIds = [...new Set(
      (Array.isArray(body?.videoRecordIds) ? body.videoRecordIds : [])
        .map((id: unknown) => String(id || "").trim())
        .filter(Boolean),
    )];

    if (!recordIds.length) {
      return jsonResponse({ error: "更新する動画が指定されていません。" }, 400);
    }
    if (recordIds.length > 200) {
      return jsonResponse({ error: "1回に更新できる動画は200件までです。" }, 400);
    }

    const { data: records, error: recordsError } = await supabase
      .from("videos")
      .select("id,title,youtube_url,youtube_video_id,views_24,youtube_24h_captured_at")
      .in("id", recordIds);
    if (recordsError) throw recordsError;

    const videoRecords = (records || []) as VideoRecord[];
    const failed: Array<{ recordId: string; title: string; reason: string }> = [];
    const prepared = videoRecords.flatMap((record) => {
      const youtubeVideoId =
        extractYouTubeVideoId(record.youtube_url) || sanitizeVideoId(record.youtube_video_id);
      if (!youtubeVideoId) {
        failed.push({
          recordId: String(record.id),
          title: record.title || "名称未設定",
          reason: "YouTube URLから動画IDを取得できませんでした。",
        });
        return [];
      }
      return [{ record, youtubeVideoId }];
    });

    const uniqueYouTubeIds = [...new Set(prepared.map((item) => item.youtubeVideoId))];
    if (!uniqueYouTubeIds.length) return jsonResponse({ updated: [], failed });

    const youtubeVideos = await fetchYouTubeVideos(uniqueYouTubeIds, youtubeApiKey);
    const syncedAt = new Date().toISOString();
    const updated: Array<{ recordId: string; youtubeVideoId: string; captured24h: boolean }> = [];
    const channelIds = new Set<string>();

    for (const item of prepared) {
      const youtubeVideo = youtubeVideos.get(item.youtubeVideoId);
      if (!youtubeVideo) {
        failed.push({
          recordId: String(item.record.id),
          title: item.record.title || "名称未設定",
          reason: "YouTube上で動画を確認できませんでした。URLまたは公開状態を確認してください。",
        });
        continue;
      }

      const currentViews = parseCount(youtubeVideo.statistics?.viewCount);
      const publishedAt = youtubeVideo.snippet?.publishedAt || null;
      const publishedTime = publishedAt ? new Date(publishedAt).getTime() : NaN;
      const shouldCapture24h =
        !item.record.youtube_24h_captured_at &&
        Number(item.record.views_24 || 0) <= 0 &&
        Number.isFinite(publishedTime) &&
        Date.now() >= publishedTime + 24 * 60 * 60 * 1000 &&
        currentViews !== null;

      const updatePayload: Record<string, unknown> = {
        youtube_video_id: item.youtubeVideoId,
        youtube_views: currentViews,
        youtube_likes: parseCount(youtubeVideo.statistics?.likeCount),
        youtube_comments: parseCount(youtubeVideo.statistics?.commentCount),
        youtube_published_at: publishedAt,
        youtube_synced_at: syncedAt,
      };

      if (shouldCapture24h) {
        updatePayload.views_24 = currentViews;
        updatePayload.youtube_24h_captured_at = syncedAt;
      }

      const { error: updateError } = await supabase
        .from("videos")
        .update(updatePayload)
        .eq("id", item.record.id);

      if (updateError) {
        failed.push({
          recordId: String(item.record.id),
          title: item.record.title || "名称未設定",
          reason: updateError.message,
        });
        continue;
      }

      const channelId = String(youtubeVideo.snippet?.channelId || "").trim();
      if (channelId) channelIds.add(channelId);

      updated.push({
        recordId: String(item.record.id),
        youtubeVideoId: item.youtubeVideoId,
        captured24h: shouldCapture24h,
      });
    }

    let channelStats: Array<Record<string, unknown>> = [];
    if (channelIds.size) {
      const channels = await fetchYouTubeChannels([...channelIds], youtubeApiKey);
      channelStats = channels.flatMap((channel) => {
        const channelId = String(channel.id || "").trim();
        if (!channelId) return [];
        return [{
          channel_id: channelId,
          channel_title: channel.snippet?.title || "",
          subscriber_count: parseCount(channel.statistics?.subscriberCount),
          total_view_count: parseCount(channel.statistics?.viewCount),
          video_count: parseCount(channel.statistics?.videoCount),
          synced_at: syncedAt,
        }];
      });

      if (channelStats.length) {
        const { error: channelError } = await supabase
          .from("channel_stats")
          .upsert(channelStats, { onConflict: "channel_id" });
        if (channelError) throw channelError;
      }
    }

    return jsonResponse({ updated, failed, channelStats, syncedAt });
  } catch (error) {
    console.error(error);
    return jsonResponse({
      error: error instanceof Error
        ? error.message
        : "YouTube情報の更新中にエラーが発生しました。",
    }, 500);
  }
});
