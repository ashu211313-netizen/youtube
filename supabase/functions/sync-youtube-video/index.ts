import { createClient } from "npm:@supabase/supabase-js@^2.95.0";
import { corsHeaders } from "npm:@supabase/supabase-js@^2.95.0/cors";
import {
  extractYouTubeVideoId,
  fetchYouTubeChannels,
  fetchYouTubeVideos,
  parseCount,
  sanitizeVideoId,
  type VideoRecord,
} from "../_shared/youtube.ts";

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
      .select("id,title,youtube_url,youtube_video_id")
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
    const updated: Array<{ recordId: string; youtubeVideoId: string }> = [];
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

      const updatePayload: Record<string, unknown> = {
        youtube_video_id: item.youtubeVideoId,
        youtube_views: currentViews,
        youtube_likes: parseCount(youtubeVideo.statistics?.likeCount),
        youtube_comments: parseCount(youtubeVideo.statistics?.commentCount),
        youtube_published_at: publishedAt,
        youtube_synced_at: syncedAt,
      };

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
      });
    }

    let channelStats: Array<Record<string, unknown>> = [];
    if (channelIds.size) {
      try {
        const channels = await fetchYouTubeChannels([...channelIds], youtubeApiKey);
        const nextChannelStats = channels.flatMap((channel) => {
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

        if (nextChannelStats.length !== channelIds.size) {
          failed.push({
            recordId: "channel-stats",
            title: "チャンネル統計",
            reason: "一部のチャンネル統計を取得できませんでした。",
          });
        }

        if (nextChannelStats.length) {
          const { error: channelError } = await supabase
            .from("channel_stats")
            .upsert(nextChannelStats, { onConflict: "channel_id" });
          if (channelError) throw channelError;
          channelStats = nextChannelStats;
        }
      } catch (error) {
        failed.push({
          recordId: "channel-stats",
          title: "チャンネル統計",
          reason: error instanceof Error
            ? error.message
            : "チャンネル統計を更新できませんでした。",
        });
      }
    }

    return jsonResponse({
      updated,
      failed,
      channelStats,
      syncedAt: updated.length || channelStats.length ? syncedAt : null,
    });
  } catch (error) {
    console.error(error);
    return jsonResponse({
      error: error instanceof Error
        ? error.message
        : "YouTube情報の更新中にエラーが発生しました。",
    }, 500);
  }
});
