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

type SnapshotVideoRecord = VideoRecord & {
  status: string | null;
  post_date: string | null;
  youtube_published_at: string | null;
  youtube_views: number | string | null;
  youtube_likes: number | string | null;
  youtube_comments: number | string | null;
  youtube_synced_at: string | null;
  tags: string | null;
  deleted_at: string | null;
};

type GoalRecord = {
  goal_key: string | null;
  target_value: number | string | null;
};

const SNAPSHOT_FIRST_MONTH = "2026-08";
const VIDEO_TAGS = [
  "横動画",
  "選手解説",
  "用語解説",
  "競艇場解説",
  "ネット競艇",
  "レース映像",
] as const;
const METRIC_GOAL_KEYS = [
  "subscribers",
  "highest_views",
  "posts",
  "monthly_views",
  "average_views",
  "likes",
] as const;
const TAG_GOAL_KEYS: Record<(typeof VIDEO_TAGS)[number], string> = {
  "横動画": "tag_horizontal",
  "選手解説": "tag_player",
  "用語解説": "tag_terms",
  "競艇場解説": "tag_venue",
  "ネット競艇": "tag_online",
  "レース映像": "tag_race",
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

function requestPublishableKey(request: Request): string {
  const apiKey = String(request.headers.get("apikey") || "").trim();
  if (apiKey) return apiKey;
  return String(request.headers.get("Authorization") || "")
    .replace(/^Bearer\s+/i, "")
    .trim();
}

function getJstDateParts(value: Date | string): Record<string, string> | null {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
}

function currentJstMonthKey(now = new Date()): string {
  const parts = getJstDateParts(now);
  if (!parts) throw new Error("JSTの現在月を判定できませんでした。");
  return `${parts.year}-${parts.month}`;
}

function shiftMonthKey(monthKey: string, offset: number): string {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!match || !Number.isInteger(offset)) return "";
  const absoluteMonth = Number(match[1]) * 12 + Number(match[2]) - 1 + offset;
  const year = Math.floor(absoluteMonth / 12);
  const month = absoluteMonth - year * 12 + 1;
  return `${year}-${String(month).padStart(2, "0")}`;
}

function videoMonthKey(video: SnapshotVideoRecord): string {
  if (video.youtube_published_at) {
    const parts = getJstDateParts(video.youtube_published_at);
    if (parts) return `${parts.year}-${parts.month}`;
  }
  return /^\d{4}-\d{2}-\d{2}$/.test(video.post_date || "")
    ? String(video.post_date).slice(0, 7)
    : "";
}

function parseTags(value: string | null): string[] {
  return String(value || "")
    .split(/[、,\n]/)
    .map((tag) => tag.trim())
    .filter((tag) => VIDEO_TAGS.includes(tag as (typeof VIDEO_TAGS)[number]))
    .filter((tag, index, tags) => tags.indexOf(tag) === index);
}

function safeCount(value: number | string | null | undefined): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : 0;
}

function targetValue(goals: GoalRecord[], key: string): number | null {
  const goal = goals.find((item) => item.goal_key === key);
  const value = Number(goal?.target_value);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : null;
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
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const publishableKey = getPublishableKey();
    const youtubeApiKey = Deno.env.get("YOUTUBE_API_KEY") || "";

    if (!supabaseUrl || !serviceRoleKey || !publishableKey) {
      return jsonResponse({ error: "Supabaseの環境変数を確認してください。" }, 500);
    }
    if (!youtubeApiKey) {
      return jsonResponse({ error: "Edge FunctionのSecretにYOUTUBE_API_KEYを設定してください。" }, 500);
    }
    if (requestPublishableKey(request) !== publishableKey) {
      return jsonResponse({ error: "呼び出し元を確認できませんでした。" }, 401);
    }

    const currentMonth = currentJstMonthKey();
    const snapshotMonth = shiftMonthKey(currentMonth, -1);
    if (!snapshotMonth || snapshotMonth < SNAPSHOT_FIRST_MONTH) {
      return jsonResponse({
        finalized: false,
        skipped: "snapshot_start_month_not_reached",
        snapshotMonth,
      });
    }

    const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: existing, error: existingError } = await serviceClient
      .from("monthly_achievement_snapshots")
      .select("month_key,finalized_at")
      .eq("month_key", snapshotMonth)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing) {
      return jsonResponse({
        finalized: false,
        skipped: "already_finalized",
        snapshotMonth,
        finalizedAt: existing.finalized_at,
      });
    }

    const { data: videoRows, error: videosError } = await serviceClient
      .from("videos")
      .select(
        "id,title,status,post_date,youtube_url,youtube_video_id," +
        "youtube_views,youtube_likes,youtube_comments,youtube_published_at," +
        "youtube_synced_at,tags,deleted_at",
      )
      .eq("status", "投稿済み")
      .is("deleted_at", null);
    if (videosError) throw videosError;

    const videos = (videoRows || []) as SnapshotVideoRecord[];
    const prepared = videos.flatMap((record) => {
      const youtubeVideoId =
        extractYouTubeVideoId(record.youtube_url) || sanitizeVideoId(record.youtube_video_id);
      if (
        !youtubeVideoId &&
        videoMonthKey(record) === snapshotMonth &&
        (String(record.youtube_url || "").trim() || String(record.youtube_video_id || "").trim())
      ) {
        throw new Error(`${record.title || "名称未設定"}のYouTube URLを解析できませんでした。`);
      }
      return youtubeVideoId ? [{ record, youtubeVideoId }] : [];
    });
    const youtubeIds = [...new Set(prepared.map((item) => item.youtubeVideoId))];
    const youtubeVideos = youtubeIds.length
      ? await fetchYouTubeVideos(youtubeIds, youtubeApiKey)
      : new Map();
    const syncedAt = new Date().toISOString();
    const channelIds = new Set<string>();

    for (const item of prepared) {
      const youtubeVideo = youtubeVideos.get(item.youtubeVideoId);
      if (!youtubeVideo) {
        if (videoMonthKey(item.record) === snapshotMonth) {
          throw new Error(`${item.record.title || "名称未設定"}のYouTube最新値を取得できませんでした。`);
        }
        continue;
      }

      const updatePayload = {
        youtube_video_id: item.youtubeVideoId,
        youtube_views: parseCount(youtubeVideo.statistics?.viewCount),
        youtube_likes: parseCount(youtubeVideo.statistics?.likeCount),
        youtube_comments: parseCount(youtubeVideo.statistics?.commentCount),
        youtube_published_at: youtubeVideo.snippet?.publishedAt || null,
        youtube_synced_at: syncedAt,
      };
      const { error: updateError } = await serviceClient
        .from("videos")
        .update(updatePayload)
        .eq("id", item.record.id);
      if (updateError) throw updateError;

      Object.assign(item.record, updatePayload);
      const channelId = String(youtubeVideo.snippet?.channelId || "").trim();
      if (channelId) channelIds.add(channelId);
    }

    const { data: storedChannels, error: storedChannelsError } = await serviceClient
      .from("channel_stats")
      .select("channel_id")
      .order("synced_at", { ascending: false });
    if (storedChannelsError) throw storedChannelsError;
    for (const channel of storedChannels || []) {
      const channelId = String(channel.channel_id || "").trim();
      if (channelId) channelIds.add(channelId);
    }

    const youtubeChannels = channelIds.size
      ? await fetchYouTubeChannels([...channelIds], youtubeApiKey)
      : [];
    const channelStats = youtubeChannels.flatMap((channel) => {
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
    if (channelStats.length !== channelIds.size) {
      throw new Error("YouTubeチャンネル最新値を取得できませんでした。");
    }
    if (channelStats.length) {
      const { error: channelError } = await serviceClient
        .from("channel_stats")
        .upsert(channelStats, { onConflict: "channel_id" });
      if (channelError) throw channelError;
    }

    const monthVideos = videos.filter((video) => videoMonthKey(video) === snapshotMonth);
    const tagCounts = Object.fromEntries(VIDEO_TAGS.map((tag) => [tag, 0]));
    for (const video of monthVideos) {
      for (const tag of parseTags(video.tags)) {
        tagCounts[tag] += 1;
      }
    }

    const monthlyViews = monthVideos.reduce(
      (total, video) => total + safeCount(video.youtube_views),
      0,
    );
    const likes = monthVideos.reduce(
      (total, video) => total + safeCount(video.youtube_likes),
      0,
    );
    const highestViews = monthVideos.reduce(
      (highest, video) => Math.max(highest, safeCount(video.youtube_views)),
      0,
    );

    const { data: goalRows, error: goalsError } = await serviceClient
      .from("goals")
      .select("goal_key,target_value")
      .eq("goal_scope", "monthly")
      .eq("goal_month", snapshotMonth)
      .is("deleted_at", null);
    if (goalsError) throw goalsError;
    const goals = (goalRows || []) as GoalRecord[];
    const metricTargets = Object.fromEntries(
      METRIC_GOAL_KEYS.map((key) => [key, targetValue(goals, key)]),
    );
    const tagTargets = Object.fromEntries(
      VIDEO_TAGS.map((tag) => [TAG_GOAL_KEYS[tag], targetValue(goals, TAG_GOAL_KEYS[tag])]),
    );

    const snapshot = {
      month_key: snapshotMonth,
      subscriber_count: channelStats[0]?.subscriber_count ?? null,
      highest_views: highestViews,
      post_count: monthVideos.length,
      monthly_views: monthlyViews,
      average_views: monthVideos.length ? Math.round(monthlyViews / monthVideos.length) : 0,
      likes,
      tag_counts: tagCounts,
      metric_targets: metricTargets,
      tag_targets: tagTargets,
      is_finalized: true,
      finalized_at: syncedAt,
      source_synced_at: prepared.length || channelStats.length ? syncedAt : null,
      schema_version: 1,
    };

    const { error: insertError } = await serviceClient
      .from("monthly_achievement_snapshots")
      .insert(snapshot);
    if (insertError && insertError.code !== "23505") throw insertError;

    return jsonResponse({
      finalized: !insertError,
      skipped: insertError ? "already_finalized" : null,
      snapshotMonth,
      finalizedAt: syncedAt,
      syncedVideos: prepared.length,
      postCount: monthVideos.length,
    });
  } catch (error) {
    console.error(error);
    return jsonResponse({
      error: error instanceof Error
        ? error.message
        : "月間実績の確定中にエラーが発生しました。",
    }, 500);
  }
});
