// ============================================================
// Configuration / shared state
// ============================================================
const SUPABASE_URL = "https://jyxrrnfnypqaecfojsle.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_LZXPf3IuPOO5bKrakEH3bg_ZM85JePb";

if (!window.supabase?.createClient) {
  throw new Error("Supabaseライブラリを読み込めませんでした。");
}

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  }
);

const VIDEO_STATUSES = ["編集待ち", "投稿済み"];
const IDEA_STATUSES = ["アイデア", "実行済み"];
const IDEA_STATUS_LABELS = { アイデア: "アイデア", 実行済み: "企画ボード" };
const VIDEO_TAGS = [
  "横動画",
  "選手解説",
  "用語解説",
  "競艇場解説",
  "ネット競艇",
  "レース映像"
];
const ACHIEVEMENT_GOAL_SCOPE = "monthly";
const ACHIEVEMENT_GOAL_MAX = 2147483647;
const ACHIEVEMENT_HISTORY_START_MONTH = "2026-07";
const ACHIEVEMENT_METRIC_DEFINITIONS = [
  { key: "subscribers", label: "チャンネル登録者数", suffix: "人" },
  { key: "highest_views", label: "今月の最高再生数", suffix: "回" },
  { key: "posts", label: "投稿本数", suffix: "本" },
  { key: "monthly_views", label: "今月の再生数", suffix: "回" },
  { key: "average_views", label: "平均再生", suffix: "回" },
  { key: "likes", label: "高評価", suffix: "件" }
];
const ACHIEVEMENT_TAG_GOAL_KEYS = {
  "横動画": "tag_horizontal",
  "選手解説": "tag_player",
  "用語解説": "tag_terms",
  "競艇場解説": "tag_venue",
  "ネット競艇": "tag_online",
  "レース映像": "tag_race"
};
const IDEA_IMAGE_BUCKET = "idea-images";
const YOUTUBE_SYNC_FUNCTION = "sync-youtube-video";
const YOUTUBE_AUTO_SYNC_INTERVAL_MS = 60 * 60 * 1000;
const YOUTUBE_SYNC_STALE_MS = 55 * 60 * 1000;

function createEmptyDataState() {
  return {
    videos: [],
    ideas: [],
    ideaItems: [],
    achievementGoals: [],
    achievementSnapshots: [],
    monthlyPayments: [],
    notifications: [],
    channelStats: null,
    trash: []
  };
}

let data = createEmptyDataState();

let activeVideoFilter = "all";
let realtimeChannel = null;
let toastTimer = null;
let refreshTimer = null;
let selectedPostStatsMonth = "";
let selectedAchievementMonth = "";
let currentDetailVideoId = null;
let currentDetailIdeaId = null;
let currentDetailIdeaItemId = null;
let youtubeAutoSyncTimer = null;
let youtubeAutoSyncInFlight = false;
let lastYoutubeAutoSyncAttemptAt = 0;
let lockedPageScrollY = 0;
let isRestoringDialogState = false;

const elements = {
  authScreen: document.getElementById("authScreen"),
  appRoot: document.getElementById("appRoot"),
  mobileNav: document.getElementById("mobileNav"),
  loginForm: document.getElementById("loginForm"),
  loginEmail: document.getElementById("loginEmail"),
  loginPassword: document.getElementById("loginPassword"),
  loginButton: document.getElementById("loginButton"),
  loginMessage: document.getElementById("loginMessage"),
  loginUserLabel: document.getElementById("loginUserLabel"),
  logoutButton: document.getElementById("logoutButton"),
  syncStatus: document.getElementById("syncStatus"),
  toast: document.getElementById("toast"),
  formModal: document.getElementById("formModal"),
  formEyebrow: document.getElementById("formEyebrow"),
  formTitle: document.getElementById("formTitle"),
  dynamicForm: document.getElementById("dynamicForm"),
  formError: document.getElementById("formError"),
  videoDetailModal: document.getElementById("videoDetailModal"),
  videoDetailTitle: document.getElementById("videoDetailTitle"),
  videoDetailBody: document.getElementById("videoDetailBody"),
  youtubeSyncButton: document.getElementById("youtubeSyncButton"),
  syncAllYoutubeButton: document.getElementById("syncAllYoutubeButton"),
  dashboardYoutubeSyncButton: document.getElementById("dashboardYoutubeSyncButton"),
  detailEditButton: document.getElementById("detailEditButton"),
  detailDeleteButton: document.getElementById("detailDeleteButton"),
  ideaDetailModal: document.getElementById("ideaDetailModal"),
  ideaDetailTitle: document.getElementById("ideaDetailTitle"),
  ideaDetailBody: document.getElementById("ideaDetailBody"),
  ideaDetailEditButton: document.getElementById("ideaDetailEditButton"),
  ideaDetailDeleteButton: document.getElementById("ideaDetailDeleteButton"),
  ideaMoveToItemButton: document.getElementById("ideaMoveToItemButton"),
  ideaItemDetailModal: document.getElementById("ideaItemDetailModal"),
  ideaItemDetailTitle: document.getElementById("ideaItemDetailTitle"),
  ideaItemDetailBody: document.getElementById("ideaItemDetailBody"),
  ideaItemDetailActions: document.getElementById("ideaItemDetailActions"),
  ideaItemDetailEditButton: document.getElementById("ideaItemDetailEditButton"),
  ideaItemDetailDeleteButton: document.getElementById("ideaItemDetailDeleteButton"),
  ideaCompleteButton: document.getElementById("ideaCompleteButton"),
  notificationButton: document.getElementById("notificationButton"),
  notificationBadge: document.getElementById("notificationBadge"),
  notificationModal: document.getElementById("notificationModal"),
  notificationList: document.getElementById("notificationList"),
  trashButton: document.getElementById("trashButton"),
  trashModal: document.getElementById("trashModal"),
  trashList: document.getElementById("trashList"),
  postStatsButton: document.getElementById("postStatsButton"),
  postStatsModal: document.getElementById("postStatsModal"),
  postStatsMonthSelect: document.getElementById("postStatsMonthSelect"),
  postStatsSelectedMonthLabel: document.getElementById("postStatsSelectedMonthLabel"),
  postStatsMonthlyList: document.getElementById("postStatsMonthlyList"),
  postStatsMonthTotal: document.getElementById("postStatsMonthTotal"),
  postStatsMonthShorts: document.getElementById("postStatsMonthShorts"),
  postStatsMonthLong: document.getElementById("postStatsMonthLong"),
  postStatsAllTotal: document.getElementById("postStatsAllTotal"),
  postStatsAllShorts: document.getElementById("postStatsAllShorts"),
  postStatsAllLong: document.getElementById("postStatsAllLong"),
  postStatsOutstandingBalance: document.getElementById("postStatsOutstandingBalance"),
  postStatsUnpaidMonthCount: document.getElementById("postStatsUnpaidMonthCount"),
  postStatsRewardShortsFormula: document.getElementById("postStatsRewardShortsFormula"),
  postStatsRewardShortsAmount: document.getElementById("postStatsRewardShortsAmount"),
  postStatsRewardLongFormula: document.getElementById("postStatsRewardLongFormula"),
  postStatsRewardLongAmount: document.getElementById("postStatsRewardLongAmount"),
  postStatsRewardRaceFormula: document.getElementById("postStatsRewardRaceFormula"),
  postStatsRewardRaceAmount: document.getElementById("postStatsRewardRaceAmount"),
  postStatsRewardTotal: document.getElementById("postStatsRewardTotal"),
  postStatsPaymentStatusLabel: document.getElementById("postStatsPaymentStatusLabel"),
  dashboardMonthlyViews: document.getElementById("dashboardMonthlyViews"),
  dashboardMonthlyLikes: document.getElementById("dashboardMonthlyLikes"),
  dashboardMonthlyComments: document.getElementById("dashboardMonthlyComments"),
  dashboardMonthlyAverageViews: document.getElementById("dashboardMonthlyAverageViews"),
  dashboardMonthlySyncLabel: document.getElementById("dashboardMonthlySyncLabel"),
  dashboardTagSummary: document.getElementById("dashboardTagSummary"),
  achievementMonthLabel: document.getElementById("achievementMonthLabel"),
  achievementMonthSelect: document.getElementById("achievementMonthSelect"),
  achievementMonthStatus: document.getElementById("achievementMonthStatus"),
  achievementGoalButton: document.getElementById("achievementGoalButton"),
  achievementMetricGrid: document.getElementById("achievementMetricGrid"),
  achievementTagTitle: document.getElementById("achievementTagTitle"),
  achievementTagBreakdown: document.getElementById("achievementTagBreakdown"),
  achievementGoalModal: document.getElementById("achievementGoalModal"),
  achievementGoalForm: document.getElementById("achievementGoalForm"),
  achievementGoalMonthLabel: document.getElementById("achievementGoalMonthLabel"),
  achievementGoalFields: document.getElementById("achievementGoalFields"),
  achievementGoalError: document.getElementById("achievementGoalError"),
  achievementGoalSaveButton: document.getElementById("achievementGoalSaveButton")
};

// ============================================================
// UI helpers
// ============================================================
function getErrorMessage(error) {
  if (!error) {
    return "原因不明のエラーです。";
  }

  const parts = [error.message, error.details, error.hint]
    .filter(Boolean)
    .map(value => String(value).trim())
    .filter((value, index, array) => array.indexOf(value) === index);

  return parts.join(" / ") || String(error);
}

function showToast(message, type = "success") {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.className = `toast show${type === "error" ? " error" : ""}`;

  toastTimer = setTimeout(() => {
    elements.toast.className = "toast";
  }, type === "error" ? 5200 : 2800);
}

function setSyncStatus(text, status = "") {
  elements.syncStatus.textContent = text;
  elements.syncStatus.className = `sync-status${status ? ` ${status}` : ""}`;
}

function setLoading(button, loading, loadingText = "保存中...") {
  if (!button) {
    return;
  }

  if (loading) {
    button.dataset.originalText = button.textContent;
    button.disabled = true;
    button.textContent = loadingText;
    return;
  }

  button.disabled = false;
  button.textContent = button.dataset.originalText || button.textContent;
  delete button.dataset.originalText;
}

function todayString() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().split("T")[0];
}

function formatDate(date) {
  if (!date) {
    return "未設定";
  }

  const parsed = new Date(`${date}T00:00:00`);

  if (Number.isNaN(parsed.getTime())) {
    return "未設定";
  }

  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "short",
    day: "numeric"
  }).format(parsed);
}

function setupDate() {
  document.getElementById("todayLabel").textContent =
    new Intl.DateTimeFormat("ja-JP", {
      year: "numeric",
      month: "long",
      day: "numeric",
      weekday: "short"
    }).format(new Date());
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// ============================================================
// Common data / YouTube utilities
// ============================================================
function safeExternalUrl(value) {
  if (!value) {
    return "";
  }

  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function sameId(left, right) {
  return String(left ?? "") === String(right ?? "");
}

function findById(items, id) {
  return items.find(item => sameId(item.id, id)) || null;
}

function compareIdDesc(left, right) {
  return String(right?.id ?? "").localeCompare(
    String(left?.id ?? ""),
    "ja",
    { numeric: true }
  );
}

function compareCreatedAtDesc(left, right) {
  const createdCompare = String(right?.createdAt || "").localeCompare(
    String(left?.createdAt || "")
  );

  return createdCompare || compareIdDesc(left, right);
}

function comparePostedAtDesc(left, right) {
  const leftTime = getVideoPublishedTime(left);
  const rightTime = getVideoPublishedTime(right);

  if (leftTime && rightTime && leftTime !== rightTime) {
    return rightTime - leftTime;
  }

  if (leftTime !== rightTime) {
    return rightTime ? 1 : -1;
  }

  return compareCreatedAtDesc(left, right);
}

function compareDeletedAtDesc(left, right) {
  const deletedCompare = String(right?.deletedAt || "").localeCompare(
    String(left?.deletedAt || "")
  );

  return deletedCompare || compareCreatedAtDesc(left, right);
}

function compareMonthKeyDesc(left, right) {
  return String(right || "").localeCompare(String(left || ""));
}

function comparePaymentMonthDesc(left, right) {
  return compareMonthKeyDesc(left?.monthKey, right?.monthKey);
}

function sortCopy(items, comparator) {
  return [...(items || [])].sort(comparator);
}

function sortByCreatedAtDesc(items) {
  return sortCopy(items, compareCreatedAtDesc);
}

function sortByPostedAtDesc(items) {
  return sortCopy(items, comparePostedAtDesc);
}

function sortByDeletedAtDesc(items) {
  return sortCopy(items, compareDeletedAtDesc);
}

function sortMonthKeysDesc(items) {
  return sortCopy(items, compareMonthKeyDesc);
}

function sortPaymentsByMonthDesc(items) {
  return sortCopy(items, comparePaymentMonthDesc);
}

function sanitizeYouTubeVideoId(value) {
  const candidate = String(value || "").trim();
  return /^[A-Za-z0-9_-]{11}$/.test(candidate) ? candidate : "";
}

function extractYouTubeVideoId(value) {
  const raw = String(value || "").trim();

  if (!raw) {
    return "";
  }

  const directId = sanitizeYouTubeVideoId(raw);
  if (directId) {
    return directId;
  }

  try {
    const normalized = /^https?:\/\//i.test(raw)
      ? raw
      : `https://${raw}`;
    const url = new URL(normalized);
    const host = url.hostname
      .toLowerCase()
      .replace(/^www\./, "")
      .replace(/^m\./, "");

    if (host === "youtu.be") {
      return sanitizeYouTubeVideoId(
        url.pathname.split("/").filter(Boolean)[0]
      );
    }

    if (
      host === "youtube.com" ||
      host.endsWith(".youtube.com") ||
      host === "youtube-nocookie.com" ||
      host.endsWith(".youtube-nocookie.com")
    ) {
      const queryId = sanitizeYouTubeVideoId(
        url.searchParams.get("v")
      );

      if (queryId) {
        return queryId;
      }

      const segments = url.pathname.split("/").filter(Boolean);
      if (["shorts", "embed", "live", "v"].includes(segments[0] || "")) {
        return sanitizeYouTubeVideoId(segments[1]);
      }
    }
  } catch {
    return "";
  }

  return "";
}

function getYouTubeVideoId(video) {
  return (
    extractYouTubeVideoId(video?.youtubeUrl) ||
    sanitizeYouTubeVideoId(video?.youtubeVideoId)
  );
}

function getYouTubeThumbnailUrl(video) {
  const videoId = getYouTubeVideoId(video);
  return videoId
    ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
    : "";
}

function getYouTubeWatchUrl(video) {
  const existingUrl = safeExternalUrl(video?.youtubeUrl);
  if (existingUrl) {
    return existingUrl;
  }

  const videoId = getYouTubeVideoId(video);
  return videoId
    ? `https://www.youtube.com/watch?v=${videoId}`
    : "";
}

function formatYouTubeMetric(value, suffix = "") {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "未取得";
  }

  return `${Number(value).toLocaleString("ja-JP")}${suffix}`;
}

function formatNumber(value, fallback = "0") {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number.toLocaleString("ja-JP") : fallback;
}

function getLatestYouTubeSyncAt() {
  const timestamps = [
    data.channelStats?.syncedAt,
    ...data.videos.map(video => video.youtubeSyncedAt)
  ]
    .filter(Boolean)
    .map(value => new Date(value).getTime())
    .filter(Number.isFinite);

  return timestamps.length
    ? new Date(Math.max(...timestamps)).toISOString()
    : "";
}

function ideaStatusLabel(status) { return IDEA_STATUS_LABELS[status] || status || ""; }
function parseTags(value) {
  const source = Array.isArray(value) ? value : String(value || "").split(/[、,\n]/);
  return source.map(item => String(item).trim()).filter(Boolean).filter((item, index, array) => array.indexOf(item) === index).slice(0, 8);
}
function serializeTags(value) { return parseTags(value).join(", "); }
function parseVideoTags(value) {
  const source = Array.isArray(value) ? value : String(value || "").split(/[、,\n]/);
  return source
    .map(item => String(item).trim())
    .filter(tag => VIDEO_TAGS.includes(tag))
    .filter((tag, index, array) => array.indexOf(tag) === index);
}
function serializeVideoTags(value, legacyValue = "") {
  return [...parseVideoTags(value), ...getLegacyVideoTags(legacyValue)].join(", ");
}
function getLegacyVideoTags(value) {
  const source = Array.isArray(value) ? value : String(value || "").split(/[、,\n]/);
  return source
    .map(item => String(item).trim())
    .filter(Boolean)
    .filter(tag => !VIDEO_TAGS.includes(tag))
    .filter((tag, index, array) => array.indexOf(tag) === index);
}
function renderTagChips(tags) {
  const parsed = parseTags(tags);
  return parsed.length ? `<div class="tag-chip-row">${parsed.map(tag => `<span class="tag-chip">#${escapeHtml(tag)}</span>`).join("")}</div>` : "";
}
function isUploadableImage(file) { return file && typeof file === "object" && file.name && file.size > 0; }
function getFileExt(filename) {
  const ext = String(filename || "").split(".").pop().toLowerCase();
  return /^[a-z0-9]{2,8}$/.test(ext) ? ext : "jpg";
}
async function uploadIdeaImage(file, prefix = "idea") {
  if (!isUploadableImage(file)) return "";
  if (!String(file.type || "").startsWith("image/")) throw new Error("画像ファイルを選択してください。");
  const path = `${prefix}/${Date.now()}-${Math.random().toString(36).slice(2)}.${getFileExt(file.name)}`;
  const { error } = await supabaseClient.storage.from(IDEA_IMAGE_BUCKET).upload(path, file, { cacheControl: "3600", upsert: false, contentType: file.type || "image/jpeg" });
  if (error) throw error;
  const { data: publicData } = supabaseClient.storage.from(IDEA_IMAGE_BUCKET).getPublicUrl(path);
  return publicData?.publicUrl || "";
}
function renderIdeaImage(imageUrl, label = "添付画像") {
  const safeUrl = safeExternalUrl(imageUrl);
  return safeUrl ? `<figure class="idea-image-card"><img src="${escapeHtml(safeUrl)}" alt="${escapeHtml(label)}" loading="lazy" decoding="async" /></figure>` : "";
}
function getJstDateParts(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return null;

  return Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(date)
      .filter(part => part.type !== "literal")
      .map(part => [part.type, part.value])
  );
}

function currentMonthKey(now = new Date()) {
  const parts = getJstDateParts(now);
  return parts ? `${parts.year}-${parts.month}` : "";
}

function getYouTubeSyncCandidates() {
  return data.videos.filter(video =>
    video.status === "投稿済み" &&
    Boolean(getYouTubeVideoId(video))
  );
}

async function getFunctionInvokeErrorMessage(error) {
  if (!error) {
    return "Edge Functionの呼び出しに失敗しました。";
  }

  try {
    const context = error.context;

    if (context && typeof context.clone === "function") {
      const payload = await context.clone().json();
      const message =
        payload?.error ||
        payload?.message ||
        payload?.details;

      if (message) {
        return String(message);
      }
    }
  } catch {
    // JSON以外のエラーレスポンスは通常のmessageを使う
  }

  return getErrorMessage(error);
}

async function syncYouTubeVideos(
  videoRecordIds,
  triggerButton,
  { isBulk = false, silent = false } = {}
) {
  const ids = [...new Set(
    (videoRecordIds || [])
      .map(id => String(id || "").trim())
      .filter(Boolean)
  )];

  if (!ids.length) {
    if (!silent) {
      showToast(
        isBulk
          ? "YouTube URLが設定された投稿済み動画がありません。"
          : "更新する動画が見つかりませんでした。",
        "error"
      );
    }
    return { updated: [], failed: [] };
  }

  if (!silent) {
    setLoading(
      triggerButton,
      true,
      isBulk ? "一括更新中..." : "更新中..."
    );
    setSyncStatus("YouTube情報を更新中...");
  }

  try {
    const { data: result, error } =
      await supabaseClient.functions.invoke(
        YOUTUBE_SYNC_FUNCTION,
        { body: { videoRecordIds: ids } }
      );

    if (error) {
      throw new Error(await getFunctionInvokeErrorMessage(error));
    }

    const updated = Array.isArray(result?.updated) ? result.updated : [];
    const failed = Array.isArray(result?.failed) ? result.failed : [];

    await loadAllData({ silent: true });

    if (silent && failed.length) {
      setSyncStatus(
        updated.length ? "一部更新エラー" : "YouTube更新エラー",
        "error"
      );
    }

    if (!silent) {
      if (!updated.length && failed.length) {
        const firstFailure = failed[0]?.reason || "更新できませんでした。";
        throw new Error(
          failed.length === 1
            ? firstFailure
            : `${failed.length}件を更新できませんでした。${firstFailure}`
        );
      }

      if (failed.length) {
        showToast(`${updated.length}件更新・${failed.length}件失敗しました。`, "error");
        setSyncStatus("一部更新エラー", "error");
      } else {
        showToast(
          isBulk
            ? `${updated.length}件のYouTube情報を更新しました`
            : "YouTube情報を更新しました"
        );
        setSyncStatus("同期済み", "online");
      }
    }

    return { updated, failed };
  } catch (error) {
    console.error(error);
    setSyncStatus("YouTube更新エラー", "error");
    if (!silent) {
      const message = getErrorMessage(error);
      showToast(`YouTube情報を更新できませんでした：${message}`, "error");
    }
    return { updated: [], failed: [{ reason: getErrorMessage(error) }] };
  } finally {
    if (!silent) {
      setLoading(triggerButton, false);
    }
  }
}

function syncAllYouTubeVideos(triggerButton) {
  const candidates = getYouTubeSyncCandidates();
  return syncYouTubeVideos(
    candidates.map(video => video.id),
    triggerButton,
    { isBulk: true }
  );
}

function renderVideoTagChoices(tags) {
  const selected = new Set(parseVideoTags(tags));
  return `
    <fieldset class="video-tag-fieldset">
      <legend>動画タグ（複数選択可）</legend>
      <div class="video-tag-options">
        ${VIDEO_TAGS.map(tag => `
          <label class="video-tag-option">
            <input type="checkbox" name="tags" value="${tag}" ${selected.has(tag) ? "checked" : ""} />
            <span>${tag}</span>
          </label>
        `).join("")}
      </div>
    </fieldset>
  `;
}

function getVideoPublishedTime(video) {
  if (video?.youtubePublishedAt) {
    const youtubeTime = new Date(video.youtubePublishedAt).getTime();
    if (Number.isFinite(youtubeTime)) return youtubeTime;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(video?.postDate || "")) {
    const postTime = new Date(`${video.postDate}T00:00:00`).getTime();
    if (Number.isFinite(postTime)) return postTime;
  }

  return 0;
}

function getVideoPublishedDateKey(video) {
  if (video?.youtubePublishedAt) {
    const parts = getJstDateParts(video.youtubePublishedAt);
    if (parts) return `${parts.year}-${parts.month}-${parts.day}`;
  }

  return /^\d{4}-\d{2}-\d{2}$/.test(video?.postDate || "")
    ? video.postDate
    : "";
}

function getVideoMonthKey(video) {
  return getVideoPublishedDateKey(video).slice(0, 7);
}

function needsYouTubeAutoSync(video, now = Date.now()) {
  if (video?.status !== "投稿済み" || !getYouTubeVideoId(video)) {
    return false;
  }

  const syncedAt = video.youtubeSyncedAt
    ? new Date(video.youtubeSyncedAt).getTime()
    : 0;
  const isStale = !Number.isFinite(syncedAt) || now - syncedAt >= YOUTUBE_SYNC_STALE_MS;

  return isStale;
}

async function runAutoYouTubeSync({ force = false } = {}) {
  if (youtubeAutoSyncInFlight || document.visibilityState === "hidden") {
    return;
  }

  const now = Date.now();
  if (!force && now - lastYoutubeAutoSyncAttemptAt < 60 * 1000) {
    return;
  }

  const candidates = data.videos.filter(video =>
    force
      ? video.status === "投稿済み" && Boolean(getYouTubeVideoId(video))
      : needsYouTubeAutoSync(video, now)
  );

  if (!candidates.length) {
    return;
  }

  youtubeAutoSyncInFlight = true;
  lastYoutubeAutoSyncAttemptAt = now;
  try {
    await syncYouTubeVideos(
      candidates.map(video => video.id),
      null,
      { isBulk: true, silent: true }
    );
  } finally {
    youtubeAutoSyncInFlight = false;
  }
}

function startYouTubeAutoSync() {
  stopYouTubeAutoSync();
  window.setTimeout(() => void runAutoYouTubeSync(), 1400);
  youtubeAutoSyncTimer = window.setInterval(
    () => void runAutoYouTubeSync(),
    YOUTUBE_AUTO_SYNC_INTERVAL_MS
  );
}

function stopYouTubeAutoSync() {
  if (youtubeAutoSyncTimer) {
    window.clearInterval(youtubeAutoSyncTimer);
    youtubeAutoSyncTimer = null;
  }
  youtubeAutoSyncInFlight = false;
}

// ============================================================
// Dialog / PWA foreground handling
// ============================================================
function getOpenDialogs() {
  return [...document.querySelectorAll("dialog[open]")];
}

function syncDialogScrollLock() {
  const openDialogs = getOpenDialogs();
  const shouldLock = openDialogs.length > 0;

  if (shouldLock) {
    if (!document.body.classList.contains("modal-scroll-locked")) {
      lockedPageScrollY = window.scrollY || 0;
      document.body.dataset.lockedScrollY = String(lockedPageScrollY);
    } else {
      lockedPageScrollY = Number(
        document.body.dataset.lockedScrollY || lockedPageScrollY || 0
      );
    }

    document.documentElement.classList.add("modal-scroll-locked");
    document.body.classList.add("modal-scroll-locked");
    document.body.style.top = `-${lockedPageScrollY}px`;

    elements.appRoot?.setAttribute("aria-hidden", "true");
    elements.mobileNav?.setAttribute("aria-hidden", "true");

    openDialogs.forEach(dialog => {
      dialog.style.pointerEvents = "auto";
    });

    return;
  }

  if (!document.body.classList.contains("modal-scroll-locked")) {
    return;
  }

  const restoreY = Number(
    document.body.dataset.lockedScrollY || lockedPageScrollY || 0
  );

  document.documentElement.classList.remove("modal-scroll-locked");
  document.body.classList.remove("modal-scroll-locked");
  document.body.style.top = "";
  delete document.body.dataset.lockedScrollY;

  elements.appRoot?.removeAttribute("aria-hidden");
  elements.mobileNav?.removeAttribute("aria-hidden");

  window.scrollTo(0, restoreY);
}

function openManagedDialog(dialog) {
  if (!dialog || dialog.open) {
    syncDialogScrollLock();
    return;
  }

  dialog.showModal();

  requestAnimationFrame(() => {
    syncDialogScrollLock();
    dialog.focus({ preventScroll: true });
  });
}

function restoreDialogStateAfterResume() {
  const openDialogs = getOpenDialogs();

  if (!openDialogs.length) {
    syncDialogScrollLock();
    return;
  }

  if (isRestoringDialogState) {
    return;
  }

  isRestoringDialogState = true;

  requestAnimationFrame(() => {
    syncDialogScrollLock();

    const topDialog = openDialogs[openDialogs.length - 1];
    if (topDialog) {
      topDialog.style.pointerEvents = "auto";
      topDialog.focus({ preventScroll: true });
    }

    isRestoringDialogState = false;
  });
}

function showAuthScreen() {
  elements.authScreen.classList.remove("is-hidden");
  elements.appRoot.classList.add("is-hidden");
  elements.mobileNav.classList.add("is-hidden");
}

function showApplication(user) {
  elements.authScreen.classList.add("is-hidden");
  elements.appRoot.classList.remove("is-hidden");
  elements.mobileNav.classList.remove("is-hidden");
  elements.loginUserLabel.textContent = user?.email || "ログイン中";
}

function switchPage(pageId) {
  const targetPage = document.getElementById(pageId);

  if (!targetPage) {
    return;
  }

  document.querySelectorAll(".page").forEach(page => {
    page.classList.remove("active");
  });

  document.querySelectorAll("[data-page]").forEach(button => {
    button.classList.remove("active");
  });

  targetPage.classList.add("active");

  document.querySelectorAll(`[data-page="${pageId}"]`).forEach(button => {
    button.classList.add("active");
  });

  const titles = {
    dashboard: "ダッシュボード",
    videos: "動画管理",
    ideas: "企画管理",
    achievements: "実績"
  };

  document.getElementById("pageTitle").textContent =
    titles[pageId] || "チャンネル管理";

  window.scrollTo({ top: 0, behavior: "smooth" });
}

// ============================================================
// Supabase row mapping / data access
// ============================================================
function mapVideo(row) {
  return {
    id: row.id,
    title: row.title,
    type: row.video_type || "Shorts",
    status: row.status === "投稿済み" ? "投稿済み" : "編集待ち",
    postDate: row.post_date || "",
    youtubeUrl: row.youtube_url || "",
    youtubeVideoId: row.youtube_video_id || "",
    youtubeViews:
      row.youtube_views === null || row.youtube_views === undefined
        ? null
        : Number(row.youtube_views),
    youtubeLikes:
      row.youtube_likes === null || row.youtube_likes === undefined
        ? null
        : Number(row.youtube_likes),
    youtubeComments:
      row.youtube_comments === null || row.youtube_comments === undefined
        ? null
        : Number(row.youtube_comments),
    youtubePublishedAt: row.youtube_published_at || "",
    youtubeSyncedAt: row.youtube_synced_at || "",
    tags: row.tags || "",
    memo: row.memo || "",
    createdAt: row.created_at || "",
    deletedAt: row.deleted_at || ""
  };
}

function mapIdea(row) {
  return {
    id: row.id,
    title: row.title,
    status: row.status === "実行済み" ? "実行済み" : "アイデア",
    note: row.note || "",
    tags: row.tags || "",
    imageUrl: row.image_url || "",
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || "",
    deletedAt: row.deleted_at || ""
  };
}

function mapIdeaItem(row) {
  return {
    id: row.id,
    parentIdeaId: String(row.parent_idea_id || ""),
    title: row.title || "",
    note: row.note || "",
    status: row.status === "実行済み" ? "実行済み" : "アイデア",
    imageUrl: row.image_url || "",
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || ""
  };
}

function mapAchievementGoal(row) {
  const target = Number(row.target_value);
  return {
    id: row.id,
    key: row.goal_key || "",
    monthKey: row.goal_month || "",
    target: Number.isFinite(target) && target > 0 ? Math.floor(target) : null
  };
}

function mapAchievementSnapshot(row) {
  const metricTargets = row?.metric_targets && typeof row.metric_targets === "object"
    ? row.metric_targets
    : {};
  const tagTargets = row?.tag_targets && typeof row.tag_targets === "object"
    ? row.tag_targets
    : {};
  const tagCounts = row?.tag_counts && typeof row.tag_counts === "object"
    ? row.tag_counts
    : {};
  const toNumber = value => {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(0, number) : null;
  };
  const toTarget = value => {
    const number = toNumber(value);
    return number && number > 0 ? Math.floor(number) : null;
  };

  return {
    monthKey: row.month_key || "",
    metrics: {
      subscribers: toNumber(row.subscriber_count),
      highest_views: toNumber(row.highest_views),
      posts: toNumber(row.post_count) ?? 0,
      monthly_views: toNumber(row.monthly_views),
      average_views: toNumber(row.average_views),
      likes: toNumber(row.likes)
    },
    tagCounts: Object.fromEntries(
      VIDEO_TAGS.map(tag => [tag, toNumber(tagCounts[tag]) ?? 0])
    ),
    metricTargets: Object.fromEntries(
      ACHIEVEMENT_METRIC_DEFINITIONS.map(definition => [
        definition.key,
        toTarget(metricTargets[definition.key])
      ])
    ),
    tagTargets: Object.fromEntries(
      Object.values(ACHIEVEMENT_TAG_GOAL_KEYS).map(key => [key, toTarget(tagTargets[key])])
    ),
    finalizedAt: row.finalized_at || "",
    sourceSyncedAt: row.source_synced_at || "",
    schemaVersion: Number(row.schema_version || 1)
  };
}

function mapMonthlyPayment(row) {
  return {
    monthKey: row.month_key || "",
    isPaid: Boolean(row.is_paid)
  };
}

function mapNotification(row) {
  return {
    id: row.id,
    title: row.title || "",
    message: row.message || "",
    entityType: row.entity_type || "",
    entityId: row.entity_id || "",
    isRead: Boolean(row.is_read),
    createdAt: row.created_at || ""
  };
}

function mapChannelStats(row) {
  if (!row) return null;
  return {
    channelId: row.channel_id || "",
    channelTitle: row.channel_title || "",
    subscriberCount: row.subscriber_count == null ? null : Number(row.subscriber_count),
    totalViewCount: row.total_view_count == null ? null : Number(row.total_view_count),
    videoCount: row.video_count == null ? null : Number(row.video_count),
    syncedAt: row.synced_at || ""
  };
}

function entityLabel(type) {
  return ({ video: "動画", idea: "企画" })[type] || "項目";
}

function tableForType(type) {
  return ({ video: "videos", idea: "ideas" })[type] || "";
}


function getCurrentUserEmail() {
  return elements.loginUserLabel?.textContent?.replace("ログイン中：", "") || "";
}

async function addActivityLog(type, entityId, title, action, details = "") {
  const { error } = await supabaseClient.from("activity_logs").insert({
    entity_type: type,
    entity_id: entityId,
    entity_title: title,
    action,
    details,
    actor_email: getCurrentUserEmail()
  });
  if (error) console.error("操作ログ保存:", error);
}


function formatDateTime(value) {
  if (!value) return "日時不明";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit"
  }).format(date);
}


function refreshOpenDetailViews() {
  if (elements.videoDetailModal.open && currentDetailVideoId) {
    const video = findById(data.videos, currentDetailVideoId);
    video ? renderVideoDetail(video) : elements.videoDetailModal.close();
  }

  if (elements.ideaDetailModal.open && currentDetailIdeaId) {
    const idea = findById(data.ideas, currentDetailIdeaId);
    idea ? renderIdeaDetail(idea) : elements.ideaDetailModal.close();
  }

  if (elements.ideaItemDetailModal.open && currentDetailIdeaItemId) {
    const ideaItem = getIdeaItemById(currentDetailIdeaItemId);
    ideaItem
      ? renderIdeaItemDetail(ideaItem)
      : elements.ideaItemDetailModal.close();
  }

}

function selectNewestRows(tableName) {
  return supabaseClient
    .from(tableName)
    .select("*")
    .order("created_at", { ascending: false });
}

function isMissingSnapshotRelation(error) {
  const code = String(error?.code || "");
  return code === "42P01" || code === "PGRST205";
}

async function loadAllData({ silent = false } = {}) {
  if (!silent) {
    setSyncStatus("同期中");
  }

  const [
    videosResult,
    ideasResult,
    ideaItemsResult,
    achievementGoalsResult,
    achievementSnapshotsResult,
    monthlyPaymentsResult,
    notificationsResult,
    channelStatsResult
  ] = await Promise.all([
    selectNewestRows("videos"),
    selectNewestRows("ideas"),
    selectNewestRows("idea_items"),
    supabaseClient
      .from("goals")
      .select("*")
      .eq("goal_scope", ACHIEVEMENT_GOAL_SCOPE)
      .is("deleted_at", null)
      .order("goal_month", { ascending: false }),
    supabaseClient
      .from("monthly_achievement_snapshots")
      .select("*")
      .order("month_key", { ascending: false }),
    supabaseClient
      .from("monthly_payments")
      .select("*")
      .order("month_key", { ascending: false }),
    supabaseClient
      .from("notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200),
    supabaseClient
      .from("channel_stats")
      .select("*")
      .order("synced_at", { ascending: false })
      .limit(1)
      .maybeSingle()
  ]);

  const firstError =
    videosResult.error ||
    ideasResult.error ||
    ideaItemsResult.error ||
    achievementGoalsResult.error ||
    (isMissingSnapshotRelation(achievementSnapshotsResult.error)
      ? null
      : achievementSnapshotsResult.error) ||
    monthlyPaymentsResult.error ||
    notificationsResult.error ||
    channelStatsResult.error;

  if (firstError) {
    console.error(firstError);
    setSyncStatus("同期エラー", "error");
    if (!silent) {
      showToast(
        `読み込みに失敗しました：${getErrorMessage(firstError)}`,
        "error"
      );
    }
    return false;
  }

  const allVideos = (videosResult.data || []).map(mapVideo);
  const allIdeas = (ideasResult.data || []).map(mapIdea);
  const allIdeaItems = (ideaItemsResult.data || []).map(mapIdeaItem);

  data = {
    videos: sortByPostedAtDesc(
      allVideos.filter(item => !item.deletedAt)
    ),
    ideas: sortByCreatedAtDesc(
      allIdeas.filter(item => !item.deletedAt)
    ),
    ideaItems: sortByCreatedAtDesc(allIdeaItems),
    achievementGoals: (achievementGoalsResult.data || []).map(mapAchievementGoal),
    achievementSnapshots: (achievementSnapshotsResult.data || []).map(mapAchievementSnapshot),
    monthlyPayments: sortPaymentsByMonthDesc(
      (monthlyPaymentsResult.data || []).map(mapMonthlyPayment)
    ),
    notifications: sortByCreatedAtDesc(
      (notificationsResult.data || []).map(mapNotification)
    ),
    channelStats: mapChannelStats(channelStatsResult.data),
    trash: sortByDeletedAtDesc([
      ...allVideos
        .filter(item => item.deletedAt)
        .map(item => ({ ...item, entityType: "video" })),
      ...allIdeas
        .filter(item => item.deletedAt)
        .map(item => ({ ...item, entityType: "idea" }))
    ])
  };

  renderAll();
  renderNotifications();
  renderTrash();
  refreshOpenDetailViews();

  if (elements.postStatsModal.open) {
    renderPostStats();
  }

  setSyncStatus("同期済み", "online");
  return true;
}

// ============================================================
// Posting statistics / monthly payment
// ============================================================
function getPostedVideos() {
  return data.videos.filter(video =>
    video.status === "投稿済み" && Boolean(getVideoPublishedDateKey(video))
  );
}

function countAllPostsByType(videoType) {
  return getPostedVideos().filter(video => video.type === videoType).length;
}

function formatMonthLabel(monthKey) {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey || "");
  if (!match) return "月を選択";
  return `${Number(match[1])}年${Number(match[2])}月`;
}

function shiftMonthKey(monthKey, offset) {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey || "");
  const safeOffset = Number(offset);
  if (!match || !Number.isInteger(safeOffset)) return "";

  const absoluteMonth = Number(match[1]) * 12 + Number(match[2]) - 1 + safeOffset;
  const year = Math.floor(absoluteMonth / 12);
  const month = absoluteMonth - year * 12 + 1;
  return `${year}-${String(month).padStart(2, "0")}`;
}

function getMonthlyPostStats(monthKey) {
  const videos = getPostedVideos().filter(video =>
    getVideoMonthKey(video) === monthKey
  );
  const tagCounts = Object.fromEntries(VIDEO_TAGS.map(tag => [tag, 0]));

  videos.forEach(video => {
    parseVideoTags(video.tags).forEach(tag => {
      tagCounts[tag] += 1;
    });
  });

  return {
    monthKey,
    videos,
    total: videos.length,
    shorts: videos.filter(video => video.type === "Shorts").length,
    long: videos.filter(video => video.type === "横動画").length,
    tagCounts
  };
}

function getAvailablePostMonths() {
  const months = new Set([currentMonthKey()]);

  getPostedVideos().forEach(video => {
    const monthKey = getVideoMonthKey(video);
    if (monthKey) months.add(monthKey);
  });

  data.monthlyPayments.forEach(payment => {
    if (payment.monthKey) months.add(payment.monthKey);
  });

  return sortMonthKeysDesc([...months]);
}

function renderMonthSelectOptions(selectElement, months, selectedMonth) {
  selectElement.innerHTML = months.map(monthKey => `
    <option value="${monthKey}" ${monthKey === selectedMonth ? "selected" : ""}>
      ${formatMonthLabel(monthKey)}
    </option>
  `).join("");
}

function renderPostStatsMonthOptions(months) {
  if (!selectedPostStatsMonth || !months.includes(selectedPostStatsMonth)) {
    selectedPostStatsMonth = months.includes(currentMonthKey())
      ? currentMonthKey()
      : months[0];
  }

  renderMonthSelectOptions(
    elements.postStatsMonthSelect,
    months,
    selectedPostStatsMonth
  );
}

function formatYen(value) {
  return `¥${Math.max(0, Number(value || 0)).toLocaleString("ja-JP")}`;
}

function getVideoReward(video) {
  if (parseVideoTags(video?.tags).includes("レース映像")) return 0;
  if (video?.type === "Shorts") return 100;
  if (video?.type === "横動画") return 1000;
  return 0;
}

function calculateMonthlyReward(stats) {
  const videos = stats?.videos || [];
  const raceVideos = videos.filter(video =>
    parseVideoTags(video.tags).includes("レース映像")
  );
  const paidShorts = videos.filter(video =>
    video.type === "Shorts" && getVideoReward(video) === 100
  );
  const paidLong = videos.filter(video =>
    video.type === "横動画" && getVideoReward(video) === 1000
  );
  const shortsAmount = paidShorts.length * 100;
  const longAmount = paidLong.length * 1000;

  return {
    paidShortsCount: paidShorts.length,
    paidLongCount: paidLong.length,
    raceVideoCount: raceVideos.length,
    shortsAmount,
    longAmount,
    totalAmount: shortsAmount + longAmount
  };
}

function getMonthlyPayment(monthKey) {
  return data.monthlyPayments.find(
    payment => payment.monthKey === monthKey
  ) || {
    monthKey,
    isPaid: false
  };
}

function calculateOutstandingBalance(months) {
  return months.reduce((summary, monthKey) => {
    const stats = getMonthlyPostStats(monthKey);
    const reward = calculateMonthlyReward(stats);
    const payment = getMonthlyPayment(monthKey);

    if (!payment.isPaid && reward.totalAmount > 0) {
      summary.amount += reward.totalAmount;
      summary.monthCount += 1;
    }

    return summary;
  }, { amount: 0, monthCount: 0 });
}

function renderPostStatsMonthlyList(months) {
  elements.postStatsMonthlyList.innerHTML = months.length
    ? months.map(monthKey => {
        const stats = getMonthlyPostStats(monthKey);
        const reward = calculateMonthlyReward(stats);
        const payment = getMonthlyPayment(monthKey);
        const selectedClass =
          monthKey === selectedPostStatsMonth ? " is-selected" : "";
        const paymentClass = payment.isPaid ? " is-paid" : " is-unpaid";

        return `
          <article class="post-monthly-row${selectedClass}">
            <button
              type="button"
              class="post-monthly-main"
              data-post-stats-month="${monthKey}"
            >
              <strong>${formatMonthLabel(monthKey)}</strong>
              <span>Shorts <b>${stats.shorts}</b></span>
              <span>横動画 <b>${stats.long}</b></span>
              <span class="post-monthly-amount">${formatYen(reward.totalAmount)}</span>
            </button>

            <button
              type="button"
              class="monthly-payment-toggle${paymentClass}"
              data-toggle-payment-month="${monthKey}"
              aria-label="${formatMonthLabel(monthKey)}を${payment.isPaid ? "未払い" : "支払済み"}に変更"
            >
              ${payment.isPaid ? "支払済み" : "未払い"}
            </button>
          </article>
        `;
      }).join("")
    : `<div class="empty-state">投稿実績はまだありません</div>`;
}

function renderPostStats() {
  const posted = getPostedVideos();
  const months = getAvailablePostMonths();

  renderPostStatsMonthOptions(months);

  const selectedStats = getMonthlyPostStats(selectedPostStatsMonth);
  const selectedReward = calculateMonthlyReward(selectedStats);
  const selectedPayment = getMonthlyPayment(selectedPostStatsMonth);
  const outstanding = calculateOutstandingBalance(months);

  elements.postStatsSelectedMonthLabel.textContent =
    `${formatMonthLabel(selectedPostStatsMonth)}の投稿`;

  elements.postStatsMonthTotal.textContent = selectedStats.total;
  elements.postStatsMonthShorts.textContent = selectedStats.shorts;
  elements.postStatsMonthLong.textContent = selectedStats.long;

  elements.postStatsAllTotal.textContent = posted.length;
  elements.postStatsAllShorts.textContent = countAllPostsByType("Shorts");
  elements.postStatsAllLong.textContent = countAllPostsByType("横動画");

  elements.postStatsRewardShortsFormula.textContent =
    `${selectedReward.paidShortsCount}本 × 100円`;
  elements.postStatsRewardShortsAmount.textContent =
    formatYen(selectedReward.shortsAmount);

  elements.postStatsRewardLongFormula.textContent =
    `${selectedReward.paidLongCount}本 × 1,000円`;
  elements.postStatsRewardLongAmount.textContent =
    formatYen(selectedReward.longAmount);

  elements.postStatsRewardRaceFormula.textContent =
    `${selectedReward.raceVideoCount}本 × 0円`;
  elements.postStatsRewardRaceAmount.textContent = formatYen(0);

  elements.postStatsRewardTotal.textContent =
    formatYen(selectedReward.totalAmount);

  elements.postStatsPaymentStatusLabel.textContent =
    selectedPayment.isPaid ? "支払済み" : "未払い";

  elements.postStatsOutstandingBalance.textContent =
    formatYen(outstanding.amount);
  elements.postStatsUnpaidMonthCount.textContent =
    `未払い ${outstanding.monthCount}か月`;

  document.querySelectorAll("[data-set-payment-status]").forEach(button => {
    const buttonIsPaid = button.dataset.setPaymentStatus === "paid";
    button.classList.toggle("active", buttonIsPaid === selectedPayment.isPaid);
  });

  renderPostStatsMonthlyList(months);
}

async function setMonthlyPaymentStatus(monthKey, isPaid, triggerButton) {
  if (!/^\d{4}-\d{2}$/.test(monthKey || "")) {
    showToast("対象月が正しくありません。", "error");
    return;
  }

  setLoading(triggerButton, true, "保存中...");

  try {
    const now = new Date().toISOString();

    const { data: row, error } = await supabaseClient
      .from("monthly_payments")
      .upsert({
        month_key: monthKey,
        is_paid: Boolean(isPaid),
        paid_at: isPaid ? now : null,
        updated_at: now
      }, {
        onConflict: "month_key"
      })
      .select()
      .single();

    if (error) throw error;

    const mapped = mapMonthlyPayment(row);
    const existingIndex = data.monthlyPayments.findIndex(
      payment => payment.monthKey === monthKey
    );

    const nextMonthlyPayments = existingIndex >= 0
      ? data.monthlyPayments.map((payment, index) =>
          index === existingIndex ? mapped : payment
        )
      : [...data.monthlyPayments, mapped];

    data.monthlyPayments = sortPaymentsByMonthDesc(
      nextMonthlyPayments
    );

    renderPostStats();
    showToast(isPaid ? "支払済みに変更しました" : "未払いに変更しました");
  } catch (error) {
    console.error(error);
    showToast(`支払い状況を保存できませんでした：${getErrorMessage(error)}`, "error");
  } finally {
    setLoading(triggerButton, false);
  }
}

// ============================================================
// Screen rendering
// ============================================================
function formatAchievementPercentage(value) {
  const safeValue = Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
  const rounded = Math.round(safeValue * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function getAchievementProgress(currentValue, targetValue, currentAvailable = true) {
  const current = Number(currentValue);
  const target = Number(targetValue);

  if (!Number.isFinite(target) || target <= 0) {
    return { isSet: false, isAvailable: currentAvailable, percentage: null, width: 0 };
  }

  if (!currentAvailable || !Number.isFinite(current)) {
    return { isSet: true, isAvailable: false, percentage: null, width: 0 };
  }

  const percentage = Math.max(0, (Math.max(0, current) / target) * 100);
  return {
    isSet: true,
    isAvailable: true,
    percentage,
    width: Math.min(100, percentage)
  };
}

function renderMonthlyTagRows(tagCounts, { targets = null } = {}) {
  return VIDEO_TAGS.map(tag => {
    const count = Math.max(0, Number(tagCounts?.[tag] || 0));
    const hasTargets = targets !== null;
    const target = hasTargets ? targets?.[ACHIEVEMENT_TAG_GOAL_KEYS[tag]] : null;
    const progress = getAchievementProgress(count, target);
    const targetLabel = progress.isSet
      ? `目標 ${formatNumber(target)}本`
      : "目標未設定";
    const achievementLabel = progress.isSet
      ? `達成率 ${formatAchievementPercentage(progress.percentage)}%`
      : "達成率 —";

    return `
      <article class="monthly-tag-row${hasTargets ? " has-target" : ""}">
        <div><span>${tag}</span><strong>${count}本</strong></div>
        ${hasTargets ? `
          <div class="monthly-tag-target"><span>${targetLabel}</span><strong>${achievementLabel}</strong></div>
          <div class="progress monthly-tag-progress${progress.isSet ? "" : " is-unset"}" aria-label="${tag} ${targetLabel} ${achievementLabel}">
            <span style="width:${progress.width}%"></span>
          </div>
        ` : ""}
      </article>
    `;
  }).join("");
}

function renderDashboard() {
  const monthKey = currentMonthKey();
  const monthlyPostStats = getMonthlyPostStats(monthKey);
  document.getElementById("monthlyPosts").textContent = monthlyPostStats.total;
  document.getElementById("monthlyShorts").textContent = monthlyPostStats.shorts;
  document.getElementById("monthlyLongVideos").textContent = monthlyPostStats.long;
  document.getElementById("videoCount").textContent = data.videos.length;
  document.getElementById("editingWaitingCount").textContent =
    data.videos.filter(video => video.status === "編集待ち").length;
  document.getElementById("ideaCount").textContent =
    data.ideas.filter(idea => idea.status !== "実行済み").length;

  const monthlyPerformance = getMonthlyAchievementStats(monthKey);
  elements.dashboardMonthlyViews.textContent = formatNumber(monthlyPerformance.views);
  elements.dashboardMonthlyLikes.textContent = formatNumber(monthlyPerformance.likes);
  elements.dashboardMonthlyComments.textContent = formatNumber(monthlyPerformance.comments);
  elements.dashboardMonthlyAverageViews.textContent = formatNumber(monthlyPerformance.monthlyAverageViews);
  elements.dashboardTagSummary.innerHTML = renderMonthlyTagRows(monthlyPostStats.tagCounts);
  const latestYouTubeSyncAt = getLatestYouTubeSyncAt();
  elements.dashboardMonthlySyncLabel.textContent = latestYouTubeSyncAt
    ? `最終同期 ${formatDateTime(latestYouTubeSyncAt)}`
    : "YouTube未同期";
}


function getMonthlyPostedVideos(monthKey = currentMonthKey()) {
  return getMonthlyPostStats(monthKey).videos;
}

function sumVideoMetric(videos, key) {
  return (videos || []).reduce(
    (total, video) => total + Math.max(0, Number(video?.[key] || 0)),
    0
  );
}

function getAverageVideoViews(videos) {
  const monthlyVideos = videos || [];
  if (!monthlyVideos.length) return 0;
  return Math.round(sumVideoMetric(monthlyVideos, "youtubeViews") / monthlyVideos.length);
}

function getHighestVideoViews(videos) {
  return (videos || []).reduce(
    (highest, video) => {
      const value = Number(video?.youtubeViews);
      return Math.max(highest, Number.isFinite(value) ? Math.max(0, value) : 0);
    },
    0
  );
}

function getMonthlyAchievementStats(monthKey = currentMonthKey()) {
  const videos = getMonthlyPostedVideos(monthKey);
  const views = sumVideoMetric(videos, "youtubeViews");
  const likes = sumVideoMetric(videos, "youtubeLikes");
  const comments = sumVideoMetric(videos, "youtubeComments");
  const monthlyAverageViews = getAverageVideoViews(videos);
  const highestViews = getHighestVideoViews(videos);

  return {
    videos,
    posts: videos.length,
    views,
    likes,
    comments,
    monthlyAverageViews,
    highestViews
  };
}

function getPreviousMonthKey(monthKey) {
  return shiftMonthKey(monthKey, -1);
}

function getAvailableAchievementMonths() {
  const current = currentMonthKey();
  const months = [];
  let monthKey = ACHIEVEMENT_HISTORY_START_MONTH;

  while (monthKey && monthKey <= current && months.length < 240) {
    months.push(monthKey);
    monthKey = shiftMonthKey(monthKey, 1);
  }

  return months.reverse();
}

function normalizeAchievementMonthKey(monthKey) {
  const months = getAvailableAchievementMonths();
  return months.includes(monthKey) ? monthKey : currentMonthKey();
}

function renderAchievementMonthOptions() {
  selectedAchievementMonth = normalizeAchievementMonthKey(selectedAchievementMonth);
  renderMonthSelectOptions(
    elements.achievementMonthSelect,
    getAvailableAchievementMonths(),
    selectedAchievementMonth
  );
}

function getAchievementSnapshot(monthKey) {
  return data.achievementSnapshots.find(snapshot => snapshot.monthKey === monthKey) || null;
}

function getSnapshotTargets(snapshot) {
  if (!snapshot) return {};
  return {
    ...snapshot.metricTargets,
    ...snapshot.tagTargets
  };
}

function getAchievementMonthView(monthKey) {
  const isCurrentMonth = monthKey === currentMonthKey();
  const monthlyPostStats = getMonthlyPostStats(monthKey);
  const liveStats = getMonthlyAchievementStats(monthKey);
  const snapshot = isCurrentMonth ? null : getAchievementSnapshot(monthKey);

  if (isCurrentMonth) {
    return {
      isCurrentMonth,
      snapshot,
      values: {
        subscribers: data.channelStats?.subscriberCount ?? null,
        highest_views: liveStats.highestViews,
        posts: liveStats.posts,
        monthly_views: liveStats.views,
        average_views: liveStats.monthlyAverageViews,
        likes: liveStats.likes
      },
      available: {
        subscribers: data.channelStats?.subscriberCount != null,
        highest_views: true,
        posts: true,
        monthly_views: true,
        average_views: true,
        likes: true
      },
      tagCounts: monthlyPostStats.tagCounts,
      targets: getAchievementTargets(monthKey)
    };
  }

  if (snapshot) {
    return {
      isCurrentMonth,
      snapshot,
      values: snapshot.metrics,
      available: Object.fromEntries(
        ACHIEVEMENT_METRIC_DEFINITIONS.map(definition => [
          definition.key,
          snapshot.metrics[definition.key] != null
        ])
      ),
      tagCounts: snapshot.tagCounts,
      targets: getSnapshotTargets(snapshot)
    };
  }

  return {
    isCurrentMonth,
    snapshot: null,
    values: {
      subscribers: null,
      highest_views: null,
      posts: monthlyPostStats.total,
      monthly_views: null,
      average_views: null,
      likes: null
    },
    available: {
      subscribers: false,
      highest_views: false,
      posts: true,
      monthly_views: false,
      average_views: false,
      likes: false
    },
    tagCounts: monthlyPostStats.tagCounts,
    targets: getAchievementTargets(monthKey)
  };
}

function getMetricComparison(currentValue, previousValue) {
  const current = Math.max(0, Number(currentValue || 0));
  const previous = Number(previousValue);

  if (!Number.isFinite(previous) || previous <= 0) {
    return "比較データなし";
  }

  return `前月比 ${formatAchievementPercentage((current / previous) * 100)}%`;
}

function getAchievementTargets(monthKey = currentMonthKey()) {
  return Object.fromEntries(
    data.achievementGoals
      .filter(goal => goal.monthKey === monthKey && goal.key && goal.target)
      .map(goal => [goal.key, goal.target])
  );
}

function renderAchievementMetric({
  key,
  label,
  value,
  suffix,
  target,
  previousValue = null,
  currentAvailable = true,
  displayValue = ""
}) {
  const comparison = getMetricComparison(value, previousValue);
  const safeValue = Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
  const progress = getAchievementProgress(value, target, currentAvailable);
  const targetLabel = progress.isSet
    ? `目標 ${formatNumber(target)}${suffix}`
    : "目標未設定";
  const achievementLabel = !progress.isSet
    ? "達成率 —"
    : progress.isAvailable
      ? `達成率 ${formatAchievementPercentage(progress.percentage)}%`
      : "達成率 計算不可";
  const progressClass = !progress.isSet
    ? " is-unset"
    : progress.isAvailable
      ? ""
      : " is-unavailable";

  return `
    <article class="achievement-metric-card" data-achievement-metric="${key}">
      <div class="achievement-metric-head">
        <span>${label}</span>
        <strong>${displayValue || `${formatNumber(safeValue)}${suffix}`}</strong>
      </div>
      <div class="achievement-metric-goal"><span>${targetLabel}</span><strong>${achievementLabel}</strong></div>
      <div class="progress achievement-progress${progressClass}" aria-label="${label} ${targetLabel} ${achievementLabel}">
        <span style="width:${progress.width}%"></span>
      </div>
      <div class="achievement-metric-comparison">${comparison}</div>
    </article>
  `;
}

function getAchievementGoalDefinitions() {
  return [
    ...ACHIEVEMENT_METRIC_DEFINITIONS,
    ...VIDEO_TAGS.map(tag => ({
      key: ACHIEVEMENT_TAG_GOAL_KEYS[tag],
      label: tag,
      suffix: "本",
      isTag: true
    }))
  ];
}

function renderAchievementGoalFields(monthKey = currentMonthKey()) {
  const targets = getAchievementTargets(monthKey);
  const renderFields = definitions => definitions.map(definition => `
    <label>
      ${definition.label}
      <span class="achievement-goal-input-wrap">
        <input
          type="number"
          name="${definition.key}"
          value="${targets[definition.key] || ""}"
          min="0"
          max="${ACHIEVEMENT_GOAL_MAX}"
          step="1"
          inputmode="numeric"
          placeholder="未設定"
        />
        <small>${definition.suffix}</small>
      </span>
    </label>
  `).join("");

  elements.achievementGoalFields.innerHTML = `
    <fieldset class="achievement-goal-section">
      <legend>主要6指標</legend>
      <div class="achievement-goal-grid">${renderFields(ACHIEVEMENT_METRIC_DEFINITIONS)}</div>
    </fieldset>
    <fieldset class="achievement-goal-section">
      <legend>タグ別投稿本数</legend>
      <div class="achievement-goal-grid">${renderFields(getAchievementGoalDefinitions().filter(item => item.isTag))}</div>
    </fieldset>
  `;
}

function openAchievementGoalModal(requestedMonthKey = currentMonthKey()) {
  const monthKey = String(requestedMonthKey || "");
  if (monthKey !== currentMonthKey()) {
    showToast("過去月の目標は変更できません。", "error");
    return;
  }
  elements.achievementGoalForm.dataset.monthKey = monthKey;
  elements.achievementGoalMonthLabel.textContent = `${formatMonthLabel(monthKey)}の目標`;
  elements.achievementGoalError.textContent = "";
  renderAchievementGoalFields(monthKey);
  openManagedDialog(elements.achievementGoalModal);
}

function parseAchievementTargetValue(value, label) {
  const text = String(value ?? "").trim();
  if (!text) return 0;

  const number = Number(text);
  if (!Number.isFinite(number) || !Number.isInteger(number)) {
    throw new Error(`${label}は整数で入力してください。`);
  }
  if (number < 0) {
    throw new Error(`${label}に負数は設定できません。`);
  }
  if (number > ACHIEVEMENT_GOAL_MAX) {
    throw new Error(`${label}は${formatNumber(ACHIEVEMENT_GOAL_MAX)}以下で入力してください。`);
  }
  return number;
}

async function saveAchievementGoals(event) {
  event.preventDefault();
  const monthKey = String(elements.achievementGoalForm.dataset.monthKey || "");
  const formData = new FormData(elements.achievementGoalForm);
  const definitions = getAchievementGoalDefinitions();
  const updatedAt = new Date().toISOString();

  elements.achievementGoalError.textContent = "";

  try {
    if (monthKey !== currentMonthKey()) {
      throw new Error("過去月の目標は変更できません。");
    }

    const payload = definitions.map(definition => ({
      title: definition.label,
      current_value: 0,
      target_value: parseAchievementTargetValue(formData.get(definition.key), definition.label),
      deadline: null,
      achieved: false,
      achieved_date: null,
      goal_scope: ACHIEVEMENT_GOAL_SCOPE,
      goal_month: monthKey,
      goal_key: definition.key,
      deleted_at: null,
      updated_at: updatedAt
    }));

    setLoading(elements.achievementGoalSaveButton, true, "保存中...");
    setSyncStatus("月間目標を保存中...");

    const { error } = await supabaseClient
      .from("goals")
      .upsert(payload, { onConflict: "goal_scope,goal_month,goal_key" });

    if (error) throw error;

    elements.achievementGoalModal.close();
    await loadAllData({ silent: true });
    showToast(`${formatMonthLabel(monthKey)}の目標を保存しました`);
  } catch (error) {
    console.error(error);
    elements.achievementGoalError.textContent = getErrorMessage(error);
    setSyncStatus("保存エラー", "error");
  } finally {
    setLoading(elements.achievementGoalSaveButton, false);
  }
}

function renderAchievements() {
  if (!elements.achievementMonthLabel) return;

  renderAchievementMonthOptions();
  const monthKey = selectedAchievementMonth;
  const monthView = getAchievementMonthView(monthKey);
  const previousMonthKey = getPreviousMonthKey(monthKey);
  const previousMonthView = previousMonthKey >= ACHIEVEMENT_HISTORY_START_MONTH
    ? getAchievementMonthView(previousMonthKey)
    : null;
  const { isCurrentMonth, snapshot, values, available, tagCounts, targets } = monthView;
  const historicalValueLabel = "履歴データなし";
  const previousValue = key => previousMonthView?.available?.[key]
    ? previousMonthView.values[key]
    : null;

  elements.achievementMonthLabel.textContent = `${formatMonthLabel(monthKey)}の実績`;
  elements.achievementMonthStatus.textContent = isCurrentMonth
    ? "現在月・ライブ"
    : snapshot
      ? "確定済み・閲覧専用"
      : "履歴未保存・閲覧専用";
  elements.achievementMonthStatus.classList.toggle("is-finalized", !isCurrentMonth);
  elements.achievementMonthStatus.title = snapshot?.finalizedAt
    ? `確定日時 ${formatDateTime(snapshot.finalizedAt)}`
    : "";
  elements.achievementGoalButton.classList.toggle("is-hidden", !isCurrentMonth);
  elements.achievementGoalButton.textContent = Object.keys(targets).length
    ? "目標を編集"
    : "目標を設定";
  elements.achievementTagTitle.textContent = `${formatMonthLabel(monthKey)}のタグ別投稿本数`;
  elements.achievementMetricGrid.innerHTML = [
    {
      key: "subscribers",
      label: "チャンネル登録者数",
      value: values.subscribers,
      suffix: "人",
      target: targets.subscribers,
      previousValue: previousValue("subscribers"),
      currentAvailable: available.subscribers,
      displayValue: available.subscribers
        ? ""
        : isCurrentMonth ? "未取得" : historicalValueLabel
    },
    {
      key: "highest_views",
      label: isCurrentMonth ? "今月の最高再生数" : "その月の最高再生数",
      value: values.highest_views,
      suffix: "回",
      target: targets.highest_views,
      previousValue: previousValue("highest_views"),
      currentAvailable: available.highest_views,
      displayValue: available.highest_views ? "" : historicalValueLabel
    },
    {
      key: "posts",
      label: "投稿本数",
      value: values.posts,
      suffix: "本",
      target: targets.posts,
      previousValue: previousValue("posts"),
      currentAvailable: true
    },
    {
      key: "monthly_views",
      label: isCurrentMonth ? "今月の再生数" : "その月の再生数",
      value: values.monthly_views,
      suffix: "回",
      target: targets.monthly_views,
      previousValue: previousValue("monthly_views"),
      currentAvailable: available.monthly_views,
      displayValue: available.monthly_views ? "" : historicalValueLabel
    },
    {
      key: "average_views",
      label: "平均再生",
      value: values.average_views,
      suffix: "回",
      target: targets.average_views,
      previousValue: previousValue("average_views"),
      currentAvailable: available.average_views,
      displayValue: available.average_views ? "" : historicalValueLabel
    },
    {
      key: "likes",
      label: "高評価",
      value: values.likes,
      suffix: "件",
      target: targets.likes,
      previousValue: previousValue("likes"),
      currentAvailable: available.likes,
      displayValue: available.likes ? "" : historicalValueLabel
    }
  ].map(renderAchievementMetric).join("");
  elements.achievementTagBreakdown.innerHTML = renderMonthlyTagRows(
    tagCounts,
    { targets }
  );
}

function renderVideoFilterCounts() {
  const counts = {
    all: data.videos.length
  };

  VIDEO_STATUSES.forEach(status => {
    counts[status] = data.videos.filter(video => video.status === status).length;
  });

  document.querySelectorAll("[data-filter-count]").forEach(element => {
    element.textContent = counts[element.dataset.filterCount] ?? 0;
  });
}


function renderVideos() {
  const list = document.getElementById("videoList");
  renderVideoFilterCounts();

  const videos = activeVideoFilter === "all"
    ? data.videos
    : data.videos.filter(video => video.status === activeVideoFilter);

  if (!videos.length) {
    list.innerHTML = `<div class="card empty-state">該当する動画はありません</div>`;
    return;
  }

  list.innerHTML = videos.map(video => {
    const youtubeUrl = getYouTubeWatchUrl(video);
    const thumbnailUrl = getYouTubeThumbnailUrl(video);

    return `
      <article
        class="item-card video-card is-clickable"
        data-video-card-id="${video.id}"
        tabindex="0"
        role="button"
        aria-label="${escapeHtml(video.title)}の詳細を開く"
      >
        <div class="video-card-layout">
          <div class="video-thumbnail-shell${thumbnailUrl ? "" : " is-thumbnail-error"}">
            ${thumbnailUrl ? `
              <img
                class="video-thumbnail-image"
                data-video-thumbnail
                src="${escapeHtml(thumbnailUrl)}"
                alt="${escapeHtml(video.title)}のYouTubeサムネイル"
                loading="lazy"
                decoding="async"
              />
            ` : ""}
            <div class="video-thumbnail-fallback" aria-hidden="true">
              <span>▶</span>
              <small>サムネイル未取得</small>
            </div>
          </div>

          <div class="video-card-main">
            <div class="video-card-top">
              <select
                class="status-select"
                data-video-status-id="${video.id}"
                aria-label="${escapeHtml(video.title)}のステータス"
              >
                ${VIDEO_STATUSES.map(status => `
                  <option value="${status}" ${status === video.status ? "selected" : ""}>${status}</option>
                `).join("")}
              </select>
            </div>

            <h4>${escapeHtml(video.title)}</h4>

            <div class="video-card-metrics" aria-label="YouTube統計">
              <article>
                <span>再生</span>
                <strong>${formatYouTubeMetric(video.youtubeViews, "回")}</strong>
              </article>
              <article>
                <span>高評価</span>
                <strong>${formatYouTubeMetric(video.youtubeLikes, "件")}</strong>
              </article>
              <article>
                <span>コメント</span>
                <strong>${formatYouTubeMetric(video.youtubeComments, "件")}</strong>
              </article>
            </div>

            ${renderTagChips(video.tags)}

            <div class="meta video-card-meta">
              <span>${escapeHtml(video.type)}</span>
              <span>投稿日：${formatDate(getVideoPublishedDateKey(video))}</span>
              ${youtubeUrl ? `<a href="${escapeHtml(youtubeUrl)}" target="_blank" rel="noopener noreferrer">YouTubeを開く</a>` : ""}
            </div>

            ${video.memo ? `<p class="card-memo-preview">${escapeHtml(video.memo)}</p>` : ""}
          </div>
        </div>

        <div class="item-actions">
          <button type="button" class="small-action-btn" data-open-video-detail="${video.id}">詳細</button>
          <button type="button" class="small-action-btn" data-edit-type="video" data-edit-id="${video.id}">編集</button>
          <button type="button" class="delete-btn" data-delete-type="video" data-delete-id="${video.id}">削除</button>
        </div>
      </article>
    `;
  }).join("");
}

function getIdeaItemProgress(parentIdeaId) {
  const items = data.ideaItems.filter(
    item => String(item.parentIdeaId) === String(parentIdeaId)
  );

  return {
    total: items.length,
    completed: items.filter(item => item.status === "実行済み").length
  };
}

function renderIdeas() {
  const board = document.getElementById("ideaBoard");

  board.innerHTML = IDEA_STATUSES.map(status => {
    const items = data.ideas.filter(
      idea => idea.status === status
    );

    return `
      <section class="kanban-column">
        <h4>${ideaStatusLabel(status)} <span>(${items.length})</span></h4>

        ${items.map(idea => {
          const progress = getIdeaItemProgress(idea.id);
          const progressPercent = progress.total
            ? Math.round((progress.completed / progress.total) * 100)
            : 0;

          return `
            <article
              class="idea-card idea-list-card is-tappable"
              data-idea-card-id="${idea.id}"
              role="button"
              tabindex="0"
            >
              <div class="idea-list-main">
                <strong>${escapeHtml(idea.title)}</strong>
                <div class="idea-list-meta">
                  <span class="status idea-status-${idea.status === "実行済み" ? "board" : "draft"}">${escapeHtml(ideaStatusLabel(idea.status))}</span>
                  <span>追加 ${formatDate(idea.createdAt?.slice(0,10))}</span>
                </div>

                ${renderIdeaImage(idea.imageUrl, `${idea.title}の企画画像`)}
                ${renderTagChips(idea.tags)}
                ${progress.total ? `
                  <div class="idea-item-progress-summary">
                    <div>
                      <span>企画内アイデア</span>
                      <strong>${progress.completed} / ${progress.total} 実行済み</strong>
                    </div>
                    <div
                      class="idea-item-progress-bar"
                      aria-label="企画内アイデア ${progress.completed}件実行済み、全${progress.total}件"
                    >
                      <span style="width:${progressPercent}%"></span>
                    </div>
                  </div>
                ` : ""}
              </div>
              <span class="detail-chevron">›</span>
            </article>
          `;
        }).join("") || `<div class="empty-state">なし</div>`}
      </section>
    `;
  }).join("");
}

function renderNotifications() {
  const unread = data.notifications.filter(item => !item.isRead).length;
  elements.notificationBadge.textContent = unread > 99 ? "99+" : unread;
  elements.notificationBadge.classList.toggle("is-hidden", unread === 0);

  elements.notificationList.innerHTML = data.notifications.length
    ? data.notifications.map(item => `
      <article
        class="notification-item notification-target-item ${item.isRead ? "" : "unread"}"
        data-notification-id="${item.id}"
        data-open-notification-target="${item.id}"
        role="button"
        tabindex="0"
        aria-label="${escapeHtml(item.title)}の対象を開く"
      >
        <div class="notification-target-main">
          <strong>${escapeHtml(item.title)}</strong>
          <p>${escapeHtml(item.message)}</p>
          <span class="notification-time">${formatDateTime(item.createdAt)}</span>
        </div>
        <span class="detail-chevron" aria-hidden="true">›</span>
      </article>
    `).join("")
    : `<div class="empty-state">通知はありません</div>`;
}

async function markNotificationsReadOnOpen() {
  const unreadIds = data.notifications
    .filter(item => !item.isRead)
    .map(item => item.id);

  if (!unreadIds.length) {
    return;
  }

  const unreadKeySet = new Set(unreadIds.map(id => String(id)));
  data.notifications = data.notifications.map(item =>
    unreadKeySet.has(String(item.id))
      ? { ...item, isRead: true }
      : item
  );
  renderNotifications();

  const { error } = await supabaseClient
    .from("notifications")
    .update({ is_read: true })
    .in("id", unreadIds);

  if (error) {
    console.error(error);
    showToast(
      `通知を既読にできませんでした：${getErrorMessage(error)}`,
      "error"
    );
    await loadAllData({ silent: true });
  }
}

function openNotificationTarget(notificationId) {
  const notification = findById(data.notifications, notificationId);

  if (!notification) {
    showToast("通知が見つかりませんでした。", "error");
    return;
  }

  const openTarget = () => {
    if (notification.entityType === "video") {
      openVideoDetail(notification.entityId);
      return;
    }

    if (notification.entityType === "idea") {
      openIdeaDetail(notification.entityId);
      return;
    }

    if (notification.entityType === "goal") {
      showToast("この目標通知は過去のデータです。目標機能は終了しました。");
      return;
    }

    if (notification.entityType === "idea_item") {
      openIdeaItemDetail(notification.entityId);
      return;
    }

    showToast("この通知には開ける対象がありません。", "error");
  };

  if (elements.notificationModal.open) {
    elements.notificationModal.addEventListener(
      "close",
      () => requestAnimationFrame(openTarget),
      { once: true }
    );
    elements.notificationModal.close();
    return;
  }

  openTarget();
}

function renderTrash() {
  elements.trashList.innerHTML = data.trash.length
    ? data.trash.map(item => `
      <article class="trash-item">
        <strong>${escapeHtml(item.title)}</strong>
        <p>${entityLabel(item.entityType)}・削除 ${formatDateTime(item.deletedAt)}</p>
        <div class="trash-actions">
          <button type="button" class="secondary-btn" data-restore-type="${item.entityType}" data-restore-id="${item.id}">復元</button>
          <button type="button" class="danger-outline-btn" data-permanent-delete-type="${item.entityType}" data-permanent-delete-id="${item.id}">完全削除</button>
        </div>
      </article>
    `).join("")
    : `<div class="empty-state">ゴミ箱は空です</div>`;
}

function renderAll() {
  renderDashboard();
  renderVideos();
  renderIdeas();
  renderAchievements();
}

// ============================================================
// Forms / mutations
// ============================================================
function getEntity(type, id) {
  const keyMap = {
    video: "videos",
    idea: "ideas"
  };

  return findById(data[keyMap[type]] || [], id);
}

function formValue(value) {
  return escapeHtml(value ?? "");
}

function optionSelected(current, option) {
  return current === option ? "selected" : "";
}

function openForm(type, id = "") {

  const entity = id ? getEntity(type, id) : null;
  const isEdit = Boolean(entity);

  elements.formError.textContent = "";
  elements.formEyebrow.textContent = "";
  elements.dynamicForm.dataset.type = type;
  elements.dynamicForm.dataset.mode = isEdit ? "edit" : "create";
  elements.dynamicForm.dataset.id = entity?.id || "";

  if (type === "video") {
    const video = entity || {
      title: "",
      type: "Shorts",
      status: "編集待ち",
      postDate: "",
      youtubeUrl: "",
      tags: "",
      memo: ""
    };

    elements.formTitle.textContent = isEdit ? "動画を編集" : "動画を追加";
    elements.dynamicForm.innerHTML = `
      <div class="form-grid">
        <label>動画タイトル<input name="title" value="${formValue(video.title)}" required /></label>
        <label>動画形式
          <select name="type">
            <option ${optionSelected(video.type, "Shorts")}>Shorts</option>
            <option ${optionSelected(video.type, "横動画")}>横動画</option>
          </select>
        </label>
        <label>ステータス
          <select name="status">
            ${VIDEO_STATUSES.map(status => `<option ${optionSelected(video.status, status)}>${status}</option>`).join("")}
          </select>
        </label>
        <label>投稿日<input type="date" name="postDate" value="${formValue(video.postDate)}" /></label>
        <label>YouTube URL<input type="url" name="youtubeUrl" value="${formValue(video.youtubeUrl)}" placeholder="https://youtube.com/..." /></label>
        ${renderVideoTagChoices(video.tags)}
        <input type="hidden" name="legacyVideoTags" value="${formValue(serializeTags(getLegacyVideoTags(video.tags)))}" />
        <label>メモ<textarea name="memo">${formValue(video.memo)}</textarea></label>
      </div>
      <button class="form-submit" type="submit">${isEdit ? "変更を保存" : "追加する"}</button>
    `;
  } else if (type === "idea") {
    const idea = entity || { title: "", status: "アイデア", note: "", tags: "", imageUrl: "" };

    elements.formTitle.textContent = isEdit ? "企画を編集" : "企画を追加";
    elements.dynamicForm.innerHTML = `
      <div class="form-grid">
        <label>企画名<input name="title" value="${formValue(idea.title)}" required /></label>
        <label>ステータス
          <select name="status">
            ${IDEA_STATUSES.map(status => `<option value="${status}" ${optionSelected(idea.status, status)}>${ideaStatusLabel(status)}</option>`).join("")}
          </select>
        </label>
        <label>企画内容・メモ<textarea name="note">${formValue(idea.note)}</textarea></label>
        <label>タグ<input name="tags" value="${formValue(idea.tags)}" placeholder="選手紹介, 横動画 など" /></label>
        ${idea.imageUrl ? `<div class="current-image-preview"><span>現在の画像</span><img src="${escapeHtml(idea.imageUrl)}" alt="現在の企画画像" /></div>` : ""}
        <label>画像を添付<input type="file" name="imageFile" accept="image/*" /></label>
      </div>
      <button class="form-submit" type="submit">${isEdit ? "変更を保存" : "追加する"}</button>
    `;
  } else {
    return;
  }

  openManagedDialog(elements.formModal);
}

function getCompletedIdeaTargets(sourceIdeaId) {
  return sortByCreatedAtDesc(
    data.ideas.filter(idea =>
      idea.status === "実行済み" &&
      !sameId(idea.id, sourceIdeaId)
    )
  );
}

function openMoveIdeaToItemForm(sourceIdeaId) {
  const sourceIdea = findById(data.ideas, sourceIdeaId);

  if (!sourceIdea || sourceIdea.status !== "アイデア") {
    showToast("移動できる企画が見つかりませんでした。", "error");
    return;
  }

  const targets = getCompletedIdeaTargets(sourceIdea.id);

  if (!targets.length) {
    showToast(
      "移動先にできる企画ボードがありません。",
      "error"
    );
    return;
  }

  elements.formError.textContent = "";
  elements.formEyebrow.textContent = "";
  elements.formTitle.textContent = "企画内アイデアへ移動";
  elements.dynamicForm.dataset.type = "moveIdeaToItem";
  elements.dynamicForm.dataset.mode = "move";
  elements.dynamicForm.dataset.id = sourceIdea.id;

  elements.dynamicForm.innerHTML = `
    <div class="form-grid">
      <section class="move-idea-source">
        <span>移動する企画</span>
        <strong>${escapeHtml(sourceIdea.title)}</strong>
        ${sourceIdea.note ? `
          <p>${escapeHtml(sourceIdea.note)}</p>
        ` : ""}
      </section>

      <label>
        移動先の企画ボード
        <select name="targetIdeaId" required>
          ${targets.map(target => `
            <option value="${target.id}">
              ${escapeHtml(target.title)}
            </option>
          `).join("")}
        </select>
      </label>

      <p class="move-idea-note">
        移動すると、左側の元企画は削除され、
        選択した企画の「企画内アイデア」に追加されます。
      </p>
    </div>

    <button class="form-submit" type="submit">
      移動する
    </button>
  `;

  openManagedDialog(elements.formModal);
}

async function moveIdeaToItem(sourceIdeaId, targetIdeaId) {
  const sourceIdea = findById(data.ideas, sourceIdeaId);
  const targetIdea = findById(data.ideas, targetIdeaId);

  if (!sourceIdea || !targetIdea) {
    throw new Error("移動元または移動先が見つかりません。");
  }

  const confirmed = window.confirm(
    `「${sourceIdea.title}」を\n` +
    `「${targetIdea.title}」の企画内アイデアへ移動しますか？\n\n` +
    "移動後、左側の元企画は削除されます。"
  );

  if (!confirmed) {
    return null;
  }

  const { data: result, error } = await supabaseClient.rpc(
    "move_idea_to_completed_parent",
    {
      p_source_idea_id: String(sourceIdea.id),
      p_target_idea_id: String(targetIdea.id)
    }
  );

  if (error) throw error;

  await addActivityLog(
    "idea",
    targetIdea.id,
    targetIdea.title,
    "企画を企画内アイデアへ移動",
    sourceIdea.title
  );

  return {
    sourceIdea,
    targetIdea,
    result
  };
}

function validateTitle(value, label) {
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    throw new Error(`${label}を入力してください。`);
  }
  return trimmed;
}


async function saveVideo(values, mode, id) {
  const existing = mode === "edit" ? getEntity("video", id) : null;
  const youtubeUrl = values.youtubeUrl?.trim() || "";
  const youtubeUrlChanged =
    mode === "edit" &&
    String(existing?.youtubeUrl || "") !== youtubeUrl;

  const payload = {
    title: validateTitle(values.title, "動画タイトル"),
    video_type: values.type,
    status: values.status,
    post_date: values.postDate || null,
    youtube_url: youtubeUrl,
    tags: serializeVideoTags(values.tags, values.legacyVideoTags),
    memo: values.memo || "",
    updated_at: new Date().toISOString()
  };

  if (youtubeUrlChanged) {
    Object.assign(payload, {
      youtube_video_id: null,
      youtube_views: null,
      youtube_likes: null,
      youtube_comments: null,
      youtube_published_at: null,
      youtube_synced_at: null
    });
  }

  const query = mode === "edit"
    ? supabaseClient
        .from("videos")
        .update(payload)
        .eq("id", id)
        .select()
        .single()
    : supabaseClient
        .from("videos")
        .insert(payload)
        .select()
        .single();

  const { data: row, error } = await query;
  if (error) {
    throw error;
  }

  const action = mode === "edit" ? "動画を編集" : "動画を追加";
  const details = existing && existing.status !== values.status
    ? `${existing.status} → ${values.status}`
    : "";

  await addActivityLog(
    "video",
    row.id,
    row.title,
    action,
    details
  );

  return row;
}

async function saveIdea(values, mode, id) {
  const existing = mode === "edit" ? getEntity("idea", id) : null;
  const imageUrl = await uploadIdeaImage(values.imageFile, "ideas");
  const payload = {
    title: validateTitle(values.title, "企画名"),
    status: values.status,
    note: values.note || "",
    tags: serializeTags(values.tags),
    updated_at: new Date().toISOString()
  };
  if (imageUrl) payload.image_url = imageUrl;
  const query = mode === "edit"
    ? supabaseClient.from("ideas").update(payload).eq("id", id).select().single()
    : supabaseClient.from("ideas").insert(payload).select().single();
  const { data: row, error } = await query;
  if (error) throw error;
  const details = existing && existing.status !== values.status ? `${existing.status} → ${values.status}` : "";
  await addActivityLog("idea", row.id, row.title, mode === "edit" ? "企画を編集" : "企画を追加", details);
  return row;
}

async function handleSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const submitButton = form.querySelector('[type="submit"]');
  const { type, mode, id } = form.dataset;
  const formData = new FormData(form);
  const values = Object.fromEntries(formData.entries());
  if (type === "video") {
    values.tags = formData.getAll("tags");
  }

  elements.formError.textContent = "";
  setLoading(submitButton, true, mode === "edit" ? "変更を保存中..." : "保存中...");
  setSyncStatus("変更を保存中...");

  try {
    let moveResult = null;

    if (type === "video") await saveVideo(values, mode, id);
    else if (type === "idea") await saveIdea(values, mode, id);
    else if (type === "moveIdeaToItem") {
      moveResult = await moveIdeaToItem(id, values.targetIdeaId);

      if (!moveResult) {
        setSyncStatus("同期済み", "online");
        return;
      }
    } else {
      throw new Error("保存形式が不明です。");
    }

    elements.formModal.close();
    await loadAllData({ silent: true });

    showToast(
      moveResult
        ? `「${moveResult.targetIdea.title}」へ移動しました`
        : (mode === "edit" ? "変更を保存しました" : "追加しました")
    );
  } catch (error) {
    console.error(error);
    const message = getErrorMessage(error);
    elements.formError.textContent = `保存できませんでした：${message}`;
    showToast(`保存できませんでした：${message}`, "error");
    setSyncStatus("保存エラー", "error");
  } finally {
    setLoading(submitButton, false);
  }
}

async function deleteItem(type, id, triggerButton = null) {
  const table = tableForType(type);
  const entity = getEntity(type, id);
  if (!table || !entity) {
    showToast("削除対象が見つかりませんでした。", "error");
    return;
  }

  if (!window.confirm(`「${entity.title}」をゴミ箱へ移動しますか？`)) return;

  setLoading(triggerButton, true, "移動中...");
  try {
    const { error } = await supabaseClient
      .from(table)
      .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;

    await addActivityLog(type, id, entity.title, `${entityLabel(type)}をゴミ箱へ移動`);

    [elements.videoDetailModal, elements.ideaDetailModal]
      .forEach(modal => modal.open && modal.close());

    await loadAllData({ silent: true });
    showToast("ゴミ箱へ移動しました");
  } catch (error) {
    showToast(`移動できませんでした：${getErrorMessage(error)}`, "error");
  } finally {
    setLoading(triggerButton, false);
  }
}

async function restoreItem(type, id, button) {
  const table = tableForType(type);
  const item = data.trash.find(entry => entry.entityType === type && String(entry.id) === String(id));
  if (!table || !item) return;

  setLoading(button, true, "復元中...");
  const { error } = await supabaseClient.from(table)
    .update({ deleted_at: null, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) showToast(`復元できませんでした：${getErrorMessage(error)}`, "error");
  else {
    await addActivityLog(type, id, item.title, `${entityLabel(type)}を復元`);
    await loadAllData({ silent: true });
    showToast("復元しました");
  }
  setLoading(button, false);
}

async function permanentDeleteItem(type, id, button) {
  const table = tableForType(type);
  const item = data.trash.find(entry => entry.entityType === type && String(entry.id) === String(id));
  if (!table || !item) return;
  if (!window.confirm(`「${item.title}」を完全に削除しますか？\nこの操作は取り消せません。`)) return;

  setLoading(button, true, "削除中...");
  const { error } = await supabaseClient.from(table).delete().eq("id", id);
  if (error) showToast(`完全削除できませんでした：${getErrorMessage(error)}`, "error");
  else {
    await addActivityLog(type, id, item.title, `${entityLabel(type)}を完全削除`);
    await loadAllData({ silent: true });
    showToast("完全に削除しました");
  }
  setLoading(button, false);
}

async function updateVideoStatus(id, newStatus, selectElement) {
  const video = findById(data.videos, id);
  if (!video || video.status === newStatus) {
    return;
  }

  const previousStatus = video.status;
  selectElement.disabled = true;
  setSyncStatus("変更を保存中...");

  try {
    const payload = {
      status: newStatus,
      updated_at: new Date().toISOString()
    };

    if (newStatus === "投稿済み" && !video.postDate) {
      const useToday = window.confirm(
        "投稿日が未設定です。今日の日付を投稿日に設定しますか？\n\n「キャンセル」を選ぶと、投稿日を未設定のまま投稿済みにします。"
      );

      if (useToday) {
        payload.post_date = todayString();
      }
    }

    const { error } = await supabaseClient.from("videos").update(payload).eq("id", id);
    if (error) throw error;

    await addActivityLog("video", id, video.title, "動画ステータス変更", `${previousStatus} → ${newStatus}`);
    await loadAllData({ silent: true });
    showToast(`ステータスを「${newStatus}」に変更しました`);
  } catch (error) {
    console.error(error);
    selectElement.value = previousStatus;
    const message = getErrorMessage(error);
    showToast(`ステータスを変更できませんでした：${message}`, "error");
    setSyncStatus("保存エラー", "error");
    await loadAllData({ silent: true });
  } finally {
    selectElement.disabled = false;
  }
}

async function moveIdea(id, status, selectElement) {
  const idea = findById(data.ideas, id);
  const previousStatus = idea?.status;

  selectElement.disabled = true;
  setSyncStatus("変更を保存中...");

  try {
    const { error } = await supabaseClient
      .from("ideas")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", id);

    if (error) throw error;
    await loadAllData({ silent: true });
    showToast(`企画を「${status}」に変更しました`);
  } catch (error) {
    console.error(error);
    if (previousStatus) selectElement.value = previousStatus;
    const message = getErrorMessage(error);
    showToast(`変更できませんでした：${message}`, "error");
    setSyncStatus("保存エラー", "error");
    await loadAllData({ silent: true });
  } finally {
    selectElement.disabled = false;
  }
}


async function addIdeaItem(parentIdeaId, values, submitButton) {
  const parentIdea = findById(data.ideas, parentIdeaId);

  if (!parentIdea || parentIdea.status !== "実行済み") {
    showToast("実行済みの企画内でのみ追加できます。", "error");
    return;
  }

  setLoading(submitButton, true, "追加中...");

  try {
    const title = validateTitle(values.title, "アイデア名");
    const imageUrl = await uploadIdeaImage(values.imageFile, "idea-items");
    const insertPayload = { parent_idea_id: String(parentIdeaId), title, note: values.note || "", status: "アイデア", updated_at: new Date().toISOString() };
    if (imageUrl) insertPayload.image_url = imageUrl;

    const { data: row, error } = await supabaseClient
      .from("idea_items")
      .insert(insertPayload)
      .select()
      .single();

    if (error) throw error;

    await addActivityLog(
      "idea",
      parentIdea.id,
      parentIdea.title,
      "企画内アイデアを追加",
      row.title
    );

    await loadAllData({ silent: true });
    showToast("企画内アイデアを追加しました");
  } catch (error) {
    console.error(error);
    showToast(`追加できませんでした：${getErrorMessage(error)}`, "error");
  } finally {
    setLoading(submitButton, false);
  }
}

async function updateIdeaItem(itemId, values, submitButton) {
  const item = findById(data.ideaItems, itemId);

  if (!item) {
    showToast("企画内アイデアが見つかりませんでした。", "error");
    return;
  }

  const parentIdea = findById(data.ideas, item.parentIdeaId);

  setLoading(submitButton, true, "保存中...");

  try {
    const imageUrl = await uploadIdeaImage(values.imageFile, "idea-items");
    const payload = {
      title: validateTitle(values.title, "アイデア名"),
      note: values.note || "",
      status: IDEA_STATUSES.includes(values.status)
        ? values.status
        : "アイデア",
      updated_at: new Date().toISOString()
    };
    if (imageUrl) payload.image_url = imageUrl;

    const { error } = await supabaseClient
      .from("idea_items")
      .update(payload)
      .eq("id", itemId);

    if (error) throw error;

    if (parentIdea) {
      await addActivityLog(
        "idea",
        parentIdea.id,
        parentIdea.title,
        "企画内アイデアを更新",
        `${item.title} → ${payload.title}`
      );
    }

    await loadAllData({ silent: true });

    const updatedItem = getIdeaItemById(itemId);
    if (updatedItem && elements.ideaItemDetailModal.open) {
      currentDetailIdeaItemId = updatedItem.id;
      renderIdeaItemDetail(updatedItem);
    }

    showToast("企画内アイデアを更新しました");
  } catch (error) {
    console.error(error);
    showToast(`更新できませんでした：${getErrorMessage(error)}`, "error");
  } finally {
    setLoading(submitButton, false);
  }
}

async function updateIdeaItemStatus(itemId, status, triggerElement) {
  const item = findById(data.ideaItems, itemId);

  if (!item || !IDEA_STATUSES.includes(status)) {
    return;
  }

  if (item.status === status) {
    return;
  }

  const previousStatus = item.status;
  if (triggerElement) {
    triggerElement.disabled = true;
  }

  try {
    const { error } = await supabaseClient
      .from("idea_items")
      .update({
        status,
        updated_at: new Date().toISOString()
      })
      .eq("id", itemId);

    if (error) throw error;

    const parentIdea = findById(data.ideas, item.parentIdeaId);

    if (parentIdea) {
      await addActivityLog(
        "idea",
        parentIdea.id,
        parentIdea.title,
        "企画内アイデアのステータス変更",
        `${item.title}：${previousStatus} → ${status}`
      );
    }

    await loadAllData({ silent: true });
    showToast(`「${status}」に変更しました`);
  } catch (error) {
    console.error(error);

    if (triggerElement && "value" in triggerElement) {
      triggerElement.value = previousStatus;
    }

    showToast(`変更できませんでした：${getErrorMessage(error)}`, "error");
  } finally {
    if (triggerElement?.isConnected) {
      triggerElement.disabled = false;
    }
  }
}

async function deleteIdeaItem(itemId, button) {
  const item = findById(data.ideaItems, itemId);

  if (!item) {
    showToast("企画内アイデアが見つかりませんでした。", "error");
    return;
  }

  if (!window.confirm(`「${item.title}」を削除しますか？`)) {
    return;
  }

  setLoading(button, true, "削除中...");

  try {
    const { error } = await supabaseClient
      .from("idea_items")
      .delete()
      .eq("id", itemId);

    if (error) throw error;

    const parentIdea = findById(data.ideas, item.parentIdeaId);

    if (parentIdea) {
      await addActivityLog(
        "idea",
        parentIdea.id,
        parentIdea.title,
        "企画内アイデアを削除",
        item.title
      );
    }

    if (elements.ideaItemDetailModal.open) {
      elements.ideaItemDetailModal.close();
    }
    currentDetailIdeaItemId = null;

    await loadAllData({ silent: true });
    showToast("企画内アイデアを削除しました");
  } catch (error) {
    console.error(error);
    showToast(`削除できませんでした：${getErrorMessage(error)}`, "error");
  } finally {
    setLoading(button, false);
  }
}

async function completeIdea(id, button) {
  const idea = findById(data.ideas, id);
  if (!idea || idea.status === "実行済み") return;
  setLoading(button, true, "保存中...");
  const { error } = await supabaseClient.from("ideas")
    .update({ status: "実行済み", updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) showToast(`更新できませんでした：${getErrorMessage(error)}`, "error");
  else {
    await addActivityLog("idea", id, idea.title, "企画ボードへ移動", "アイデア → 企画ボード");
    elements.ideaDetailModal.close();
    await loadAllData({ silent: true });
    showToast("企画ボードへ移動しました");
  }
  setLoading(button, false);
}

// ============================================================
// Full-screen detail views
// ============================================================
function renderVideoDetail(video) {
  const youtubeUrl = getYouTubeWatchUrl(video);
  const thumbnailUrl = getYouTubeThumbnailUrl(video);

  elements.videoDetailTitle.textContent = video.title;
  elements.videoDetailBody.innerHTML = `
    <div class="youtube-thumbnail-card${thumbnailUrl ? "" : " is-thumbnail-error"}">
      ${thumbnailUrl ? `
        <img
          data-video-thumbnail
          src="${escapeHtml(thumbnailUrl)}"
          alt="${escapeHtml(video.title)}のYouTubeサムネイル"
          loading="lazy"
          decoding="async"
        />
      ` : ""}
      <div class="video-thumbnail-fallback" aria-hidden="true">
        <span>▶</span>
        <small>サムネイル未取得</small>
      </div>
      ${youtubeUrl ? `
        <a
          class="youtube-thumbnail-link"
          href="${escapeHtml(youtubeUrl)}"
          target="_blank"
          rel="noopener noreferrer"
        >YouTubeで開く</a>
      ` : ""}
    </div>

    <div class="detail-summary">
      <div class="detail-field"><span>ステータス</span><strong>${escapeHtml(video.status)}</strong></div>
      <div class="detail-field"><span>動画形式</span><strong>${escapeHtml(video.type)}</strong></div>
      <div class="detail-field"><span>投稿日</span><strong>${formatDate(getVideoPublishedDateKey(video))}</strong></div>
      <div class="detail-field"><span>YouTube</span><strong>${youtubeUrl ? `<a class="detail-link" href="${escapeHtml(youtubeUrl)}" target="_blank" rel="noopener noreferrer">動画を開く</a>` : "未設定"}</strong></div>
    </div>

    ${renderTagChips(video.tags)}

    <section class="detail-section youtube-detail-section">
      <div class="youtube-detail-heading">
        <h4>YouTube情報</h4>
        <span>${video.youtubeSyncedAt ? `最終同期 ${formatDateTime(video.youtubeSyncedAt)}` : "未同期"}</span>
      </div>

      <div class="youtube-metrics-grid">
        <article>
          <span>現在の再生回数</span>
          <strong>${formatYouTubeMetric(video.youtubeViews, "回")}</strong>
        </article>
        <article>
          <span>高評価数</span>
          <strong>${formatYouTubeMetric(video.youtubeLikes, "件")}</strong>
        </article>
        <article>
          <span>コメント数</span>
          <strong>${formatYouTubeMetric(video.youtubeComments, "件")}</strong>
        </article>
        <article>
          <span>公開日時</span>
          <strong>${video.youtubePublishedAt ? formatDateTime(video.youtubePublishedAt) : "未取得"}</strong>
        </article>
      </div>
    </section>

    <section class="detail-section">
      <h4>メモ</h4>
      <p>${video.memo ? escapeHtml(video.memo) : "メモはありません"}</p>
    </section>
  `;

  const canSyncYouTube = Boolean(getYouTubeVideoId(video));

  elements.youtubeSyncButton.dataset.youtubeSyncId = video.id;
  elements.youtubeSyncButton.disabled = !canSyncYouTube;
  elements.youtubeSyncButton.textContent = canSyncYouTube
    ? "YouTube情報を更新"
    : "YouTube URL未設定";

  elements.detailEditButton.dataset.editId = video.id;
  elements.detailDeleteButton.dataset.deleteId = video.id;
}

function openVideoDetail(id) {
  const video = findById(data.videos, id);
  if (!video) {
    showToast("動画が見つかりませんでした。", "error");
    return;
  }

  currentDetailVideoId = video.id;
  renderVideoDetail(video);
  openManagedDialog(elements.videoDetailModal);
}

function getIdeaItems(parentIdeaId) {
  return sortByCreatedAtDesc(
    data.ideaItems.filter(
      item => sameId(item.parentIdeaId, parentIdeaId)
    )
  );
}

function renderIdeaItemsSection(idea) {
  if (idea.status !== "実行済み") {
    return "";
  }

  const items = getIdeaItems(idea.id);

  return `
    <section class="nested-ideas-section">
      <div class="nested-ideas-head">
        <div>
          <h4>企画内アイデア</h4>
        </div>
        <strong>${items.length}件</strong>
      </div>

      <form class="nested-idea-add-form" data-idea-item-add-form="${idea.id}">
        <label>
          アイデア名
          <input
            type="text"
            name="title"
            maxlength="120"
            placeholder="新しいアイデアを入力"
            required
          />
        </label>

        <label>
          メモ
          <textarea
            name="note"
            rows="3"
            placeholder="必要な場合だけ入力"
          ></textarea>
        </label>
        <label>画像を添付<input type="file" name="imageFile" accept="image/*" /></label>

        <button type="submit" class="primary-btn">＋ アイデアを追加</button>
      </form>

      <div class="nested-idea-list">
        ${items.length ? items.map(item => `
          <article
            class="nested-idea-card nested-idea-list-card is-tappable"
            data-open-idea-item-detail="${item.id}"
            role="button"
            tabindex="0"
            aria-label="${escapeHtml(item.title)}の詳細を開く"
          >
            <div class="nested-idea-list-main">
              <strong>${escapeHtml(item.title)}</strong>
              <div class="nested-idea-list-meta">
                <div
                  class="idea-item-status-toggle"
                  role="group"
                  aria-label="${escapeHtml(item.title)}のステータス"
                >
                  ${IDEA_STATUSES.map(status => `
                    <button
                      type="button"
                      class="idea-item-status-choice${status === item.status ? " active" : ""}${status === "実行済み" ? " is-completed" : ""}"
                      data-idea-item-status-choice="${status}"
                      data-idea-item-id="${item.id}"
                      aria-pressed="${status === item.status ? "true" : "false"}"
                    >${status}</button>
                  `).join("")}
                </div>
                <span class="nested-idea-created-date">
                  追加 ${formatDate(item.createdAt?.slice(0, 10))}
                </span>
              </div>
              ${renderIdeaImage(item.imageUrl, `${item.title}の画像`)}
              ${item.note ? `
                <p class="nested-idea-note-preview">${escapeHtml(item.note)}</p>
              ` : ""}
            </div>
            <span class="detail-chevron" aria-hidden="true">›</span>
          </article>
        `).join("") : `
          <div class="empty-state nested-idea-empty">
            企画内アイデアはまだありません
          </div>
        `}
      </div>
    </section>
  `;
}

function getIdeaItemById(id) {
  return findById(data.ideaItems, id);
}

function renderIdeaItemDetail(item) {
  const parentIdea = findById(data.ideas, item.parentIdeaId);

  elements.ideaItemDetailTitle.textContent = item.title;
  elements.ideaItemDetailBody.innerHTML = `
    <div class="detail-summary">
      <div class="detail-field">
        <span>ステータス</span>
        <strong>${escapeHtml(item.status)}</strong>
      </div>
      <div class="detail-field">
        <span>所属企画</span>
        <strong>${escapeHtml(parentIdea?.title || "不明")}</strong>
      </div>
      <div class="detail-field">
        <span>作成日</span>
        <strong>${formatDate(item.createdAt?.slice(0, 10))}</strong>
      </div>
      <div class="detail-field">
        <span>更新日</span>
        <strong>${formatDate((item.updatedAt || item.createdAt)?.slice(0, 10))}</strong>
      </div>
    </div>

    <section class="detail-section">
      <h4>メモ</h4>
      <p>${item.note ? escapeHtml(item.note) : "メモはありません"}</p>
    </section>
  `;

  elements.ideaItemDetailActions.classList.remove("is-hidden");
  elements.ideaItemDetailEditButton.dataset.ideaItemDetailEdit = item.id;
  elements.ideaItemDetailDeleteButton.dataset.ideaItemDetailDelete = item.id;
}

function renderIdeaItemDetailEdit(item) {
  elements.ideaItemDetailTitle.textContent = "企画内アイデアを編集";
  elements.ideaItemDetailActions.classList.add("is-hidden");

  elements.ideaItemDetailBody.innerHTML = `
    <form
      class="idea-item-detail-edit-form"
      data-idea-item-detail-edit-form="${item.id}"
    >
      <label>
        アイデア名
        <input
          type="text"
          name="title"
          maxlength="120"
          value="${formValue(item.title)}"
          required
        />
      </label>

      <label>
        メモ
        <textarea name="note" rows="7">${formValue(item.note)}</textarea>
      </label>
      ${item.imageUrl ? `<div class="current-image-preview"><span>現在の画像</span><img src="${escapeHtml(item.imageUrl)}" alt="現在の画像" /></div>` : ""}
      <label>画像を添付<input type="file" name="imageFile" accept="image/*" /></label>

      <label>
        ステータス
        <select name="status">
          ${IDEA_STATUSES.map(status => `
            <option value="${status}" ${status === item.status ? "selected" : ""}>
              ${status}
            </option>
          `).join("")}
        </select>
      </label>

      <div class="idea-item-detail-edit-actions">
        <button type="submit" class="primary-btn">保存</button>
        <button
          type="button"
          class="secondary-btn"
          data-cancel-idea-item-detail-edit="${item.id}"
        >キャンセル</button>
      </div>
    </form>
  `;
}

function openIdeaItemDetail(id) {
  const item = getIdeaItemById(id);

  if (!item) {
    showToast("企画内アイデアが見つかりませんでした。", "error");
    return;
  }

  currentDetailIdeaItemId = item.id;
  renderIdeaItemDetail(item);
  openManagedDialog(elements.ideaItemDetailModal);
}

function renderIdeaDetail(idea) {
  elements.ideaDetailTitle.textContent = idea.title;

  const statusSection = idea.status === "実行済み"
    ? ""
    : `
      <div class="detail-summary">
        <div class="detail-field">
          <span>ステータス</span>
          <strong>${escapeHtml(ideaStatusLabel(idea.status))}</strong>
        </div>
      </div>
    `;

  elements.ideaDetailBody.innerHTML = `
    ${statusSection}

    ${renderIdeaImage(idea.imageUrl, `${idea.title}の企画画像`)}
    ${renderTagChips(idea.tags)}

    <section class="detail-section">
      <h4>企画内容・メモ</h4>
      <p class="idea-content-block">${idea.note ? escapeHtml(idea.note) : "内容はまだありません"}</p>
    </section>

    ${renderIdeaItemsSection(idea)}
  `;

  const canMoveToCompletedIdea =
    idea.status === "アイデア" &&
    getCompletedIdeaTargets(idea.id).length > 0;

  elements.ideaMoveToItemButton.classList.toggle(
    "is-hidden",
    !canMoveToCompletedIdea
  );
  elements.ideaMoveToItemButton.dataset.moveIdeaId = idea.id;

  elements.ideaCompleteButton.classList.toggle(
    "is-hidden",
    idea.status === "実行済み"
  );
  elements.ideaCompleteButton.dataset.completeId = idea.id;
  elements.ideaDetailEditButton.dataset.editId = idea.id;
  elements.ideaDetailDeleteButton.dataset.deleteId = idea.id;
}

function openIdeaDetail(id) {
  const idea = findById(data.ideas, id);
  if (!idea) {
    showToast("企画が見つかりませんでした。", "error");
    return;
  }
  currentDetailIdeaId = idea.id;
  renderIdeaDetail(idea);
  openManagedDialog(elements.ideaDetailModal);
}

// ============================================================
// Realtime / authentication
// ============================================================
function scheduleRealtimeRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => loadAllData({ silent: true }), 200);
}

function subscribeRealtime() {
  if (realtimeChannel) {
    supabaseClient.removeChannel(realtimeChannel);
  }

  realtimeChannel = supabaseClient
    .channel("boat-manager-shared-data")
    .on("postgres_changes", { event: "*", schema: "public", table: "videos" }, scheduleRealtimeRefresh)
    .on("postgres_changes", { event: "*", schema: "public", table: "ideas" }, scheduleRealtimeRefresh)
    .on("postgres_changes", { event: "*", schema: "public", table: "idea_items" }, scheduleRealtimeRefresh)
    .on("postgres_changes", { event: "*", schema: "public", table: "goals" }, scheduleRealtimeRefresh)
    .on("postgres_changes", { event: "*", schema: "public", table: "monthly_payments" }, scheduleRealtimeRefresh)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "monthly_achievement_snapshots" }, scheduleRealtimeRefresh)
    .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, scheduleRealtimeRefresh)
    .on("postgres_changes", { event: "*", schema: "public", table: "channel_stats" }, scheduleRealtimeRefresh)
    .subscribe(status => {
      if (status === "SUBSCRIBED") {
        setSyncStatus("リアルタイム同期中", "online");
      }

      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        setSyncStatus("同期接続エラー", "error");
      }
    });
}

async function login(email, password) {
  const { data: authData, error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return authData.user;
}

async function logout() {
  const { error } = await supabaseClient.auth.signOut();

  if (error) {
    showToast(`ログアウトできませんでした：${getErrorMessage(error)}`, "error");
    return;
  }

  if (realtimeChannel) {
    await supabaseClient.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }

  stopYouTubeAutoSync();
  data = createEmptyDataState();
  selectedAchievementMonth = "";
  showAuthScreen();
}

async function startAuthenticatedApp(user) {
  selectedAchievementMonth = currentMonthKey();
  showApplication(user);
  setupDate();
  renderAll();
  await loadAllData();
  subscribeRealtime();
  startYouTubeAutoSync();
}

async function initialize() {
  setupEventListeners();

  const { data: { session }, error } = await supabaseClient.auth.getSession();

  if (error) {
    console.error(error);
    showAuthScreen();
    elements.loginMessage.textContent = `ログイン状態を確認できませんでした：${getErrorMessage(error)}`;
    return;
  }

  if (session?.user) {
    await startAuthenticatedApp(session.user);
  } else {
    showAuthScreen();
  }

  supabaseClient.auth.onAuthStateChange((event, sessionData) => {
    if (event === "SIGNED_OUT" || !sessionData) {
      showAuthScreen();
    }
  });
}

// ============================================================
// Event wiring / application start
// ============================================================
function setupEventListeners() {
  elements.loginForm.addEventListener("submit", async event => {
    event.preventDefault();
    elements.loginMessage.textContent = "";
    setLoading(elements.loginButton, true, "ログイン中...");

    try {
      const user = await login(elements.loginEmail.value.trim(), elements.loginPassword.value);
      elements.loginPassword.value = "";
      await startAuthenticatedApp(user);
    } catch (error) {
      console.error(error);
      elements.loginMessage.textContent = `ログインできませんでした：${getErrorMessage(error)}`;
    } finally {
      setLoading(elements.loginButton, false);
    }
  });

  elements.logoutButton.addEventListener("click", logout);

  document.addEventListener("click", event => {
    const pageButton = event.target.closest("[data-page]");
    if (pageButton) {
      event.preventDefault();
      switchPage(pageButton.dataset.page);
      return;
    }

    const openFormButton = event.target.closest("[data-open-form]");
    if (openFormButton) {
      event.preventDefault();
      openForm(openFormButton.dataset.openForm);
      return;
    }

    const closeButton = event.target.closest("[data-close]");
    if (closeButton) {
      event.preventDefault();
      closeButton.closest("dialog")?.close();
      return;
    }

    const editButton = event.target.closest("[data-edit-type]");
    if (editButton) {
      event.preventDefault();
      event.stopPropagation();
      openForm(editButton.dataset.editType, editButton.dataset.editId);
      return;
    }

    const deleteButton = event.target.closest("[data-delete-type]");
    if (deleteButton) {
      event.preventDefault();
      event.stopPropagation();
      deleteItem(deleteButton.dataset.deleteType, deleteButton.dataset.deleteId, deleteButton);
      return;
    }

    const detailButton = event.target.closest("[data-open-video-detail]");
    if (detailButton) {
      event.preventDefault();
      event.stopPropagation();
      openVideoDetail(detailButton.dataset.openVideoDetail);
      return;
    }


    const notificationTarget = event.target.closest(
      "[data-open-notification-target]"
    );
    if (notificationTarget) {
      event.preventDefault();
      openNotificationTarget(
        notificationTarget.dataset.openNotificationTarget
      );
      return;
    }

    const ideaItemStatusButton = event.target.closest(
      "[data-idea-item-status-choice]"
    );
    if (ideaItemStatusButton) {
      event.preventDefault();
      event.stopPropagation();

      updateIdeaItemStatus(
        ideaItemStatusButton.dataset.ideaItemId,
        ideaItemStatusButton.dataset.ideaItemStatusChoice,
        ideaItemStatusButton
      );
      return;
    }

    const ideaItemDetailCard = event.target.closest("[data-open-idea-item-detail]");
    if (ideaItemDetailCard) {
      event.preventDefault();
      event.stopPropagation();
      openIdeaItemDetail(ideaItemDetailCard.dataset.openIdeaItemDetail);
      return;
    }

    const editIdeaItemDetailButton = event.target.closest("[data-idea-item-detail-edit]");
    if (editIdeaItemDetailButton) {
      event.preventDefault();

      const item = getIdeaItemById(
        editIdeaItemDetailButton.dataset.ideaItemDetailEdit
      );

      if (item) {
        renderIdeaItemDetailEdit(item);
      }
      return;
    }

    const cancelIdeaItemDetailEditButton = event.target.closest(
      "[data-cancel-idea-item-detail-edit]"
    );
    if (cancelIdeaItemDetailEditButton) {
      event.preventDefault();

      const item = getIdeaItemById(
        cancelIdeaItemDetailEditButton.dataset.cancelIdeaItemDetailEdit
      );

      if (item) {
        renderIdeaItemDetail(item);
      }
      return;
    }

    const deleteIdeaItemDetailButton = event.target.closest(
      "[data-idea-item-detail-delete]"
    );
    if (deleteIdeaItemDetailButton) {
      event.preventDefault();
      deleteIdeaItem(
        deleteIdeaItemDetailButton.dataset.ideaItemDetailDelete,
        deleteIdeaItemDetailButton
      );
      return;
    }

    const selectedPaymentButton = event.target.closest(
      "[data-set-payment-status]"
    );
    if (selectedPaymentButton) {
      const isPaid =
        selectedPaymentButton.dataset.setPaymentStatus === "paid";

      setMonthlyPaymentStatus(
        selectedPostStatsMonth,
        isPaid,
        selectedPaymentButton
      );
      return;
    }

    const monthlyPaymentButton = event.target.closest(
      "[data-toggle-payment-month]"
    );
    if (monthlyPaymentButton) {
      const monthKey = monthlyPaymentButton.dataset.togglePaymentMonth;
      const payment = getMonthlyPayment(monthKey);

      setMonthlyPaymentStatus(
        monthKey,
        !payment.isPaid,
        monthlyPaymentButton
      );
      return;
    }

    const postMonthButton = event.target.closest("[data-post-stats-month]");
    if (postMonthButton) {
      selectedPostStatsMonth = postMonthButton.dataset.postStatsMonth;
      renderPostStats();
      return;
    }

    const restoreButton = event.target.closest("[data-restore-type]");
    if (restoreButton) {
      restoreItem(restoreButton.dataset.restoreType, restoreButton.dataset.restoreId, restoreButton);
      return;
    }

    const permanentButton = event.target.closest("[data-permanent-delete-type]");
    if (permanentButton) {
      permanentDeleteItem(
        permanentButton.dataset.permanentDeleteType,
        permanentButton.dataset.permanentDeleteId,
        permanentButton
      );
      return;
    }

    const ideaCard = event.target.closest("[data-idea-card-id]");
    if (ideaCard && !event.target.closest("button, a, select, input, textarea, label")) {
      event.preventDefault();
      openIdeaDetail(ideaCard.dataset.ideaCardId);
      return;
    }

    const videoCard = event.target.closest("[data-video-card-id]");
    if (videoCard && !event.target.closest("button, a, select, input, textarea, label")) {
      openVideoDetail(videoCard.dataset.videoCardId);
    }
  });

  document.addEventListener("keydown", event => {
    if (event.key !== "Enter" && event.key !== " ") return;

    if (event.target.matches("[data-open-notification-target]")) {
      event.preventDefault();
      openNotificationTarget(
        event.target.dataset.openNotificationTarget
      );
      return;
    }

    if (event.target.matches("[data-idea-item-status-choice]")) {
      event.preventDefault();

      updateIdeaItemStatus(
        event.target.dataset.ideaItemId,
        event.target.dataset.ideaItemStatusChoice,
        event.target
      );
      return;
    }

    if (event.target.matches("[data-video-card-id]")) {
      event.preventDefault();
      openVideoDetail(event.target.dataset.videoCardId);
      return;
    }
    if (event.target.matches("[data-idea-card-id]")) {
      event.preventDefault();
      openIdeaDetail(event.target.dataset.ideaCardId);
      return;
    }
  });


  document.addEventListener(
    "error",
    event => {
      const image = event.target;
      if (!(image instanceof HTMLImageElement)) {
        return;
      }
      if (!image.matches("[data-video-thumbnail]")) {
        return;
      }

      image.closest(".video-thumbnail-shell, .youtube-thumbnail-card")
        ?.classList.add("is-thumbnail-error");
      image.remove();
    },
    true
  );

  document.addEventListener("change", event => {
    const videoSelect = event.target.closest("[data-video-status-id]");
    if (videoSelect) {
      updateVideoStatus(videoSelect.dataset.videoStatusId, videoSelect.value, videoSelect);
      return;
    }

    const ideaItemSelect = event.target.closest("[data-idea-item-status-id]");
    if (ideaItemSelect) {
      updateIdeaItemStatus(
        ideaItemSelect.dataset.ideaItemStatusId,
        ideaItemSelect.value,
        ideaItemSelect
      );
      return;
    }

    const ideaSelect = event.target.closest("[data-idea-status-id]");
    if (ideaSelect) {
      moveIdea(ideaSelect.dataset.ideaStatusId, ideaSelect.value, ideaSelect);
    }
  });

  document.addEventListener("submit", event => {
    const addForm = event.target.closest("[data-idea-item-add-form]");
    if (addForm) {
      event.preventDefault();
      const values = Object.fromEntries(new FormData(addForm).entries());
      addIdeaItem(
        addForm.dataset.ideaItemAddForm,
        values,
        addForm.querySelector('[type="submit"]')
      );
      return;
    }

    const detailEditForm = event.target.closest(
      "[data-idea-item-detail-edit-form]"
    );
    if (detailEditForm) {
      event.preventDefault();

      const values = Object.fromEntries(
        new FormData(detailEditForm).entries()
      );

      updateIdeaItem(
        detailEditForm.dataset.ideaItemDetailEditForm,
        values,
        detailEditForm.querySelector('[type="submit"]')
      );
    }
  });

  elements.dynamicForm.addEventListener("submit", handleSubmit);
  elements.achievementGoalForm.addEventListener("submit", saveAchievementGoals);
  elements.achievementGoalButton.addEventListener("click", () => {
    openAchievementGoalModal(selectedAchievementMonth);
  });

  elements.youtubeSyncButton.addEventListener("click", () => {
    const id = elements.youtubeSyncButton.dataset.youtubeSyncId;
    syncYouTubeVideos(
      [id],
      elements.youtubeSyncButton
    );
  });

  elements.syncAllYoutubeButton.addEventListener("click", () => {
    void syncAllYouTubeVideos(elements.syncAllYoutubeButton);
  });

  elements.dashboardYoutubeSyncButton.addEventListener("click", () => {
    void syncAllYouTubeVideos(elements.dashboardYoutubeSyncButton);
  });

  elements.detailEditButton.addEventListener("click", () => {
    const id = elements.detailEditButton.dataset.editId;
    elements.videoDetailModal.close();
    openForm("video", id);
  });

  elements.detailDeleteButton.addEventListener("click", () => {
    deleteItem("video", elements.detailDeleteButton.dataset.deleteId, elements.detailDeleteButton);
  });

  elements.ideaMoveToItemButton.addEventListener("click", () => {
    const id = elements.ideaMoveToItemButton.dataset.moveIdeaId;

    elements.ideaDetailModal.addEventListener(
      "close",
      () => requestAnimationFrame(
        () => openMoveIdeaToItemForm(id)
      ),
      { once: true }
    );

    elements.ideaDetailModal.close();
  });

  elements.ideaDetailEditButton.addEventListener("click", () => {
    const id = elements.ideaDetailEditButton.dataset.editId;
    elements.ideaDetailModal.close();
    openForm("idea", id);
  });

  elements.ideaDetailDeleteButton.addEventListener("click", () => {
    deleteItem("idea", elements.ideaDetailDeleteButton.dataset.deleteId, elements.ideaDetailDeleteButton);
  });

  elements.ideaCompleteButton.addEventListener("click", () => {
    completeIdea(elements.ideaCompleteButton.dataset.completeId, elements.ideaCompleteButton);
  });

  elements.ideaItemDetailEditButton.addEventListener("click", () => {
    const item = getIdeaItemById(
      elements.ideaItemDetailEditButton.dataset.ideaItemDetailEdit
    );

    if (item) {
      renderIdeaItemDetailEdit(item);
    }
  });

  elements.ideaItemDetailDeleteButton.addEventListener("click", () => {
    deleteIdeaItem(
      elements.ideaItemDetailDeleteButton.dataset.ideaItemDetailDelete,
      elements.ideaItemDetailDeleteButton
    );
  });

  elements.notificationButton.addEventListener("click", () => {
    openManagedDialog(elements.notificationModal);
    void markNotificationsReadOnOpen();
  });

  elements.postStatsButton.addEventListener("click", () => {
    selectedPostStatsMonth = currentMonthKey();
    renderPostStats();
    openManagedDialog(elements.postStatsModal);
  });

  elements.postStatsMonthSelect.addEventListener("change", event => {
    selectedPostStatsMonth = event.currentTarget.value;
    renderPostStats();
  });

  elements.achievementMonthSelect.addEventListener("change", event => {
    selectedAchievementMonth = normalizeAchievementMonthKey(event.currentTarget.value);
    renderAchievements();
  });

  elements.trashButton.addEventListener("click", () => {
    renderTrash();
    openManagedDialog(elements.trashModal);
  });


  document.querySelectorAll(".filter-btn").forEach(button => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".filter-btn").forEach(item => item.classList.remove("active"));
      button.classList.add("active");
      activeVideoFilter = button.dataset.filter;
      renderVideos();
    });
  });

  [elements.formModal, elements.achievementGoalModal, elements.videoDetailModal, elements.ideaDetailModal, elements.ideaItemDetailModal, elements.postStatsModal, elements.notificationModal, elements.trashModal].forEach(dialog => {
    dialog.addEventListener("click", event => {
      if (event.target === dialog) {
        dialog.close();
      }
    });

    dialog.addEventListener("close", () => {
      requestAnimationFrame(syncDialogScrollLock);
    });

    dialog.addEventListener("cancel", () => {
      requestAnimationFrame(syncDialogScrollLock);
    });
  });

  elements.videoDetailModal.addEventListener("close", () => {
    currentDetailVideoId = null;
  });

  elements.ideaDetailModal.addEventListener("close", () => {
    currentDetailIdeaId = null;
  });

  elements.ideaItemDetailModal.addEventListener("close", () => {
    currentDetailIdeaItemId = null;
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      restoreDialogStateAfterResume();
      void runAutoYouTubeSync();
    }
  });

  window.addEventListener("pageshow", () => {
    restoreDialogStateAfterResume();
    void runAutoYouTubeSync();
  });
  window.addEventListener("focus", () => {
    restoreDialogStateAfterResume();
    void runAutoYouTubeSync();
  });
}

initialize().catch(error => {
  console.error(error);
  showAuthScreen();
  elements.loginMessage.textContent = `初期化に失敗しました：${getErrorMessage(error)}`;
});
