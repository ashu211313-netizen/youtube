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
const GOAL_SCOPES = { monthly: "今月の目標", long: "長期目標" };
const IDEA_IMAGE_BUCKET = "idea-images";
const YOUTUBE_SYNC_FUNCTION = "sync-youtube-video";
const YOUTUBE_AUTO_SYNC_INTERVAL_MS = 60 * 60 * 1000;
const YOUTUBE_SYNC_STALE_MS = 55 * 60 * 1000;

function createEmptyDataState() {
  return {
    videos: [],
    ideas: [],
    ideaItems: [],
    goals: [],
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
let currentDetailVideoId = null;
let currentDetailIdeaId = null;
let currentDetailIdeaItemId = null;
let currentDetailGoalId = null;
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
  goalDetailModal: document.getElementById("goalDetailModal"),
  goalDetailTitle: document.getElementById("goalDetailTitle"),
  goalDetailBody: document.getElementById("goalDetailBody"),
  goalDetailEditButton: document.getElementById("goalDetailEditButton"),
  goalDetailDeleteButton: document.getElementById("goalDetailDeleteButton"),
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
  postStatsRewardTotal: document.getElementById("postStatsRewardTotal"),
  postStatsPaymentStatusLabel: document.getElementById("postStatsPaymentStatusLabel"),
  dashboardMonthlyViews: document.getElementById("dashboardMonthlyViews"),
  dashboardMonthlyLikes: document.getElementById("dashboardMonthlyLikes"),
  dashboardMonthlyComments: document.getElementById("dashboardMonthlyComments"),
  dashboardMonthlyAverageViews: document.getElementById("dashboardMonthlyAverageViews"),
  dashboardMonthlySyncLabel: document.getElementById("dashboardMonthlySyncLabel"),
  achievementMonthLabel: document.getElementById("achievementMonthLabel"),
  achievementMonthlyScore: document.getElementById("achievementMonthlyScore"),
  achievementPosts: document.getElementById("achievementPosts"),
  achievementViews: document.getElementById("achievementViews"),
  achievementLikes: document.getElementById("achievementLikes"),
  achievementComments: document.getElementById("achievementComments"),
  achievementAverageViews: document.getElementById("achievementAverageViews"),
  achievementSubscribers: document.getElementById("achievementSubscribers"),
  monthlyGoalSummary: document.getElementById("monthlyGoalSummary"),
  achievementAnalysis: document.getElementById("achievementAnalysis")
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
  const postDateCompare = String(right?.postDate || "").localeCompare(
    String(left?.postDate || "")
  );

  return postDateCompare || compareCreatedAtDesc(left, right);
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

function format24HourViews(video) {
  const hasValue = video?.views24 !== null && video?.views24 !== undefined;
  return hasValue ? `${formatNumber(video.views24)}回` : "未取得";
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

function findMaxByMetric(items, key) {
  let best = null;
  let bestValue = -Infinity;
  for (const item of items || []) {
    const value = Number(item?.[key] || 0);
    if (value > bestValue) {
      best = item;
      bestValue = value;
    }
  }
  return best;
}
function ideaStatusLabel(status) { return IDEA_STATUS_LABELS[status] || status || ""; }
function parseTags(value) {
  return String(value || "").split(/[、,\n]/).map(item => item.trim()).filter(Boolean).filter((item, index, array) => array.indexOf(item) === index).slice(0, 8);
}
function serializeTags(value) { return parseTags(value).join(", "); }
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
function currentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
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

function getYouTubePublishedTime(video) {
  const value = video?.youtubePublishedAt;
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function wasTrackedWithinFirst24Hours(video) {
  const publishedAt = getYouTubePublishedTime(video);
  const syncedAt = video?.youtubeSyncedAt
    ? new Date(video.youtubeSyncedAt).getTime()
    : Number.NaN;

  return (
    publishedAt > 0 &&
    Number.isFinite(syncedAt) &&
    syncedAt <= publishedAt + 24 * 60 * 60 * 1000
  );
}

function needsYouTubeAutoSync(video, now = Date.now()) {
  if (video?.status !== "投稿済み" || !getYouTubeVideoId(video)) {
    return false;
  }

  const syncedAt = video.youtubeSyncedAt
    ? new Date(video.youtubeSyncedAt).getTime()
    : 0;
  const isStale = !Number.isFinite(syncedAt) || now - syncedAt >= YOUTUBE_SYNC_STALE_MS;

  const publishedAt = getYouTubePublishedTime(video);
  const dueFor24h =
    publishedAt > 0 &&
    now >= publishedAt + 24 * 60 * 60 * 1000 &&
    wasTrackedWithinFirst24Hours(video) &&
    !video.youtube24hCapturedAt &&
    video.views24 === null;

  return isStale || dueFor24h;
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
    goals: "目標",
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
    views24:
      row.views_24 === null || row.views_24 === undefined
        ? null
        : Number(row.views_24),
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
    youtube24hCapturedAt: row.youtube_24h_captured_at || "",
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

function mapGoal(row) {
  return {
    id: row.id,
    title: row.title,
    current: Number(row.current_value || 0),
    target: Number(row.target_value || 0),
    deadline: row.deadline || "",
    achieved: Boolean(row.achieved),
    achievedDate: row.achieved_date || "",
    scope: row.goal_scope === "monthly" ? "monthly" : "long",
    goalMonth: row.goal_month || "",
    createdAt: row.created_at || "",
    deletedAt: row.deleted_at || ""
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
  return ({ video: "動画", idea: "企画", goal: "目標" })[type] || "項目";
}

function tableForType(type) {
  return ({ video: "videos", idea: "ideas", goal: "goals" })[type] || "";
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

  if (elements.goalDetailModal.open && currentDetailGoalId) {
    const goal = findById(data.goals, currentDetailGoalId);
    goal ? renderGoalDetail(goal) : elements.goalDetailModal.close();
  }
}

function selectNewestRows(tableName) {
  return supabaseClient
    .from(tableName)
    .select("*")
    .order("created_at", { ascending: false });
}

async function loadAllData({ silent = false } = {}) {
  if (!silent) {
    setSyncStatus("同期中");
  }

  const [
    videosResult,
    ideasResult,
    ideaItemsResult,
    goalsResult,
    monthlyPaymentsResult,
    notificationsResult,
    channelStatsResult
  ] = await Promise.all([
    selectNewestRows("videos"),
    selectNewestRows("ideas"),
    selectNewestRows("idea_items"),
    selectNewestRows("goals"),
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
    goalsResult.error ||
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
  const allGoals = (goalsResult.data || []).map(mapGoal);

  data = {
    videos: sortByCreatedAtDesc(
      allVideos.filter(item => !item.deletedAt)
    ),
    ideas: sortByCreatedAtDesc(
      allIdeas.filter(item => !item.deletedAt)
    ),
    ideaItems: sortByCreatedAtDesc(allIdeaItems),
    goals: sortByCreatedAtDesc(
      allGoals.filter(item => !item.deletedAt)
    ),
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
        .map(item => ({ ...item, entityType: "idea" })),
      ...allGoals
        .filter(item => item.deletedAt)
        .map(item => ({ ...item, entityType: "goal" }))
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
function isCurrentMonth(dateValue) {
  if (!dateValue) {
    return false;
  }

  const date = new Date(`${dateValue}T00:00:00`);
  const now = new Date();

  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth()
  );
}

function getPostedVideos() {
  return data.videos.filter(video =>
    video.status === "投稿済み" && Boolean(video.postDate)
  );
}

function countMonthlyPosts() {
  return getPostedVideos().filter(video => isCurrentMonth(video.postDate)).length;
}

function countMonthlyPostsByType(videoType) {
  return getPostedVideos().filter(video =>
    video.type === videoType && isCurrentMonth(video.postDate)
  ).length;
}

function countAllPostsByType(videoType) {
  return getPostedVideos().filter(video => video.type === videoType).length;
}

function getPostMonthKey(dateValue) {
  if (!dateValue || !/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
    return "";
  }
  return dateValue.slice(0, 7);
}

function formatMonthLabel(monthKey) {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey || "");
  if (!match) return "月を選択";
  return `${Number(match[1])}年${Number(match[2])}月`;
}

function getMonthlyPostStats(monthKey) {
  const videos = getPostedVideos().filter(video =>
    getPostMonthKey(video.postDate) === monthKey
  );

  return {
    monthKey,
    total: videos.length,
    shorts: videos.filter(video => video.type === "Shorts").length,
    long: videos.filter(video => video.type === "横動画").length
  };
}

function getAvailablePostMonths() {
  const months = new Set([currentMonthKey()]);

  getPostedVideos().forEach(video => {
    const monthKey = getPostMonthKey(video.postDate);
    if (monthKey) months.add(monthKey);
  });

  data.monthlyPayments.forEach(payment => {
    if (payment.monthKey) months.add(payment.monthKey);
  });

  return sortMonthKeysDesc([...months]);
}

function renderPostStatsMonthOptions(months) {
  if (!selectedPostStatsMonth || !months.includes(selectedPostStatsMonth)) {
    selectedPostStatsMonth = months.includes(currentMonthKey())
      ? currentMonthKey()
      : months[0];
  }

  elements.postStatsMonthSelect.innerHTML = months.map(monthKey => `
    <option value="${monthKey}" ${monthKey === selectedPostStatsMonth ? "selected" : ""}>
      ${formatMonthLabel(monthKey)}
    </option>
  `).join("");
}

function formatYen(value) {
  return `¥${Math.max(0, Number(value || 0)).toLocaleString("ja-JP")}`;
}

function calculateMonthlyReward(stats) {
  const shortsAmount = Number(stats.shorts || 0) * 100;
  const longAmount = Number(stats.long || 0) * 1000;

  return {
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
    `${selectedStats.shorts}本 × 100円`;
  elements.postStatsRewardShortsAmount.textContent =
    formatYen(selectedReward.shortsAmount);

  elements.postStatsRewardLongFormula.textContent =
    `${selectedStats.long}本 × 1,000円`;
  elements.postStatsRewardLongAmount.textContent =
    formatYen(selectedReward.longAmount);

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
function renderDashboard() {
  document.getElementById("monthlyPosts").textContent = countMonthlyPosts();
  document.getElementById("monthlyShorts").textContent = countMonthlyPostsByType("Shorts");
  document.getElementById("monthlyLongVideos").textContent = countMonthlyPostsByType("横動画");
  document.getElementById("videoCount").textContent =
    data.videos.length;
  document.getElementById("editingWaitingCount").textContent =
    data.videos.filter(video => video.status === "編集待ち").length;
  document.getElementById("ideaCount").textContent =
    data.ideas.filter(idea => idea.status !== "実行済み").length;

  const monthlyPerformance = getMonthlyAchievementStats(currentMonthKey());
  elements.dashboardMonthlyViews.textContent = formatNumber(monthlyPerformance.views);
  elements.dashboardMonthlyLikes.textContent = formatNumber(monthlyPerformance.likes);
  elements.dashboardMonthlyComments.textContent = formatNumber(monthlyPerformance.comments);
  elements.dashboardMonthlyAverageViews.textContent = formatNumber(monthlyPerformance.monthlyAverageViews);
  const latestYouTubeSyncAt = getLatestYouTubeSyncAt();
  elements.dashboardMonthlySyncLabel.textContent = latestYouTubeSyncAt
    ? `最終同期 ${formatDateTime(latestYouTubeSyncAt)}`
    : "YouTube未同期";

  const posted = sortByPostedAtDesc(
    data.videos.filter(video => video.status === "投稿済み")
  );

  const recentElement = document.getElementById("recentVideos");

  if (!posted.length) {
    recentElement.className = "table-wrap empty-state";
    recentElement.textContent = "投稿済み動画はまだありません";
    return;
  }

  recentElement.className = "table-wrap";
  recentElement.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>動画名</th>
          <th>種類</th>
          <th>投稿日</th>
          <th>24時間再生</th>
        </tr>
      </thead>
      <tbody>
        ${posted.slice(0, 3).map(video => {
          const youtubeUrl = safeExternalUrl(video.youtubeUrl);

          return `
            <tr>
              <td>
                <div class="recent-video-title-cell">
                  ${youtubeUrl ? `
                    <a
                      class="recent-video-play-button"
                      href="${escapeHtml(youtubeUrl)}"
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="${escapeHtml(video.title)}をYouTubeで再生"
                      title="YouTubeで再生"
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M9 7.5 16 12l-7 4.5Z"></path>
                      </svg>
                    </a>
                  ` : `
                    <span
                      class="recent-video-play-button is-disabled"
                      aria-label="YouTube URL未設定"
                      title="YouTube URL未設定"
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M9 7.5 16 12l-7 4.5Z"></path>
                      </svg>
                    </span>
                  `}
                  <span class="recent-video-title">${escapeHtml(video.title)}</span>
                </div>
              </td>
              <td>${escapeHtml(video.type)}</td>
              <td>${formatDate(video.postDate)}</td>
              <td>${format24HourViews(video)}</td>
            </tr>
          `;
        }).join("")}
      </tbody>
    </table>
  `;
}


function getMonthlyPostedVideos(monthKey = currentMonthKey()) {
  return data.videos.filter(video =>
    video.status === "投稿済み" &&
    String(video.postDate || "").slice(0, 7) === monthKey
  );
}

function sumVideoMetric(videos, key) {
  return (videos || []).reduce(
    (total, video) => total + Math.max(0, Number(video?.[key] || 0)),
    0
  );
}

function getAverageVideoViews(videos) {
  const synced = (videos || []).filter(video => video.youtubeViews !== null);
  if (!synced.length) return 0;
  return Math.round(sumVideoMetric(synced, "youtubeViews") / synced.length);
}

function getMonthlyAchievementStats(monthKey = currentMonthKey()) {
  const videos = getMonthlyPostedVideos(monthKey);
  const views = sumVideoMetric(videos, "youtubeViews");
  const likes = sumVideoMetric(videos, "youtubeLikes");
  const comments = sumVideoMetric(videos, "youtubeComments");
  const monthlyAverageViews = getAverageVideoViews(videos);
  const allPostedVideos = data.videos.filter(video => video.status === "投稿済み");
  const allAverageViews = getAverageVideoViews(allPostedVideos);
  const monthlyGoals = data.goals.filter(goal =>
    goal.scope === "monthly" &&
    (goal.goalMonth || currentMonthKey()) === monthKey
  );
  const goalScore = monthlyGoals.length
    ? Math.round(monthlyGoals.reduce((sum, goal) => {
        const target = Math.max(1, Number(goal.target || 0));
        return sum + Math.min(
          100,
          Math.max(0, Math.round((Number(goal.current || 0) / target) * 100))
        );
      }, 0) / monthlyGoals.length)
    : 0;

  return {
    videos,
    posts: videos.length,
    views,
    likes,
    comments,
    monthlyAverageViews,
    allAverageViews,
    monthlyGoals,
    goalScore
  };
}

function renderAchievements() {
  if (!elements.achievementMonthLabel) return;

  const monthKey = currentMonthKey();
  const stats = getMonthlyAchievementStats(monthKey);
  const topVideo = findMaxByMetric(stats.videos, "youtubeViews");
  const latestYouTubeSyncAt = getLatestYouTubeSyncAt();

  elements.achievementMonthLabel.textContent = `${formatMonthLabel(monthKey)}の実績`;
  elements.achievementMonthlyScore.textContent = `${stats.goalScore}%`;
  elements.achievementPosts.textContent = formatNumber(stats.posts);
  elements.achievementViews.textContent = formatNumber(stats.views);
  elements.achievementLikes.textContent = formatNumber(stats.likes);
  elements.achievementComments.textContent = formatNumber(stats.comments);
  elements.achievementAverageViews.textContent = `${formatNumber(stats.allAverageViews)}回`;
  elements.achievementSubscribers.textContent = data.channelStats?.subscriberCount == null
    ? "未取得"
    : formatNumber(data.channelStats.subscriberCount);

  elements.monthlyGoalSummary.innerHTML = stats.monthlyGoals.length
    ? stats.monthlyGoals.map(goal => {
        const target = Math.max(1, Number(goal.target || 0));
        const percent = Math.min(
          100,
          Math.max(0, Math.round((Number(goal.current || 0) / target) * 100))
        );
        return `
          <article class="monthly-goal-mini-card">
            <div>
              <strong>${escapeHtml(goal.title)}</strong>
              <span>${formatNumber(goal.current)} / ${formatNumber(goal.target)}</span>
            </div>
            <div class="progress"><span style="width:${percent}%"></span></div>
          </article>
        `;
      }).join("")
    : `<div class="empty-state">今月の目標はまだありません</div>`;

  elements.achievementAnalysis.innerHTML = `
    <article>
      <span>今月一番伸びている動画</span>
      <strong>${topVideo ? escapeHtml(topVideo.title) : "未取得"}</strong>
    </article>
    <article>
      <span>今月投稿動画の平均再生</span>
      <strong>${formatNumber(stats.monthlyAverageViews)}回</strong>
    </article>
    <article>
      <span>今月の反応数</span>
      <strong>${formatNumber(stats.likes + stats.comments)}件</strong>
    </article>
    <article>
      <span>YouTube最終同期</span>
      <strong>${latestYouTubeSyncAt ? formatDateTime(latestYouTubeSyncAt) : "未取得"}</strong>
    </article>
  `;
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
              <span>投稿日：${formatDate(video.postDate)}</span>
              <span>24時間：${format24HourViews(video)}</span>
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

function renderGoalCard(goal) {
  const denominator = Math.max(Number(goal.target), 1);
  const percent = Math.min(100, Math.max(0, Math.round((Number(goal.current) / denominator) * 100)));
  return `<article class="item-card is-tappable goal-progress-card" data-goal-card-id="${goal.id}" role="button" tabindex="0" aria-label="${escapeHtml(goal.title)}の達成度を変更"><div><span class="status">${goal.achieved ? "達成済み" : GOAL_SCOPES[goal.scope]}</span><h4>${escapeHtml(goal.title)}</h4><div class="meta"><span>現在 ${formatNumber(goal.current)}</span><span>目標 ${formatNumber(goal.target)}</span>${goal.scope === "monthly" ? `<span>対象 ${formatMonthLabel(goal.goalMonth || currentMonthKey())}</span>` : ""}<span>期限 ${formatDate(goal.deadline)}</span></div><div class="progress"><span style="width:${percent}%"></span></div></div><div class="goal-progress-card-side"><span class="goal-progress-percent">${percent}%</span><span class="detail-chevron" aria-hidden="true">›</span></div></article>`;
}
function renderGoals() {
  const list = document.getElementById("goalList");
  const monthly = data.goals.filter(goal => goal.scope === "monthly");
  const longTerm = data.goals.filter(goal => goal.scope !== "monthly");
  if (!data.goals.length) { list.innerHTML = `<div class="card empty-state">目標はまだありません</div>`; return; }
  list.innerHTML = `<section class="goal-section-block"><h4>今月の目標</h4>${monthly.length ? monthly.map(renderGoalCard).join("") : `<div class="empty-state">今月の目標はまだありません</div>`}</section><section class="goal-section-block"><h4>長期目標</h4>${longTerm.length ? longTerm.map(renderGoalCard).join("") : `<div class="empty-state">長期目標はまだありません</div>`}</section>`;
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
      openGoalDetail(notification.entityId);
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
  renderGoals();
  renderAchievements();
}

// ============================================================
// Forms / mutations
// ============================================================
function getEntity(type, id) {
  const keyMap = {
    video: "videos",
    idea: "ideas",
    goal: "goals"
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
      views24: null,
      youtubeUrl: "",
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
        <label>タグ<input name="tags" value="${formValue(video.tags)}" placeholder="選手紹介, 用語解説 など" /></label>
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
  } else if (type === "goal") {
    const goal = entity || { title: "", current: 0, target: 100, deadline: "", scope: "long", goalMonth: currentMonthKey() };

    elements.formTitle.textContent = isEdit ? "目標を編集" : "目標を追加";
    elements.dynamicForm.innerHTML = `
      <div class="form-grid">
        <label>目標名<input name="title" value="${formValue(goal.title)}" required /></label>
        <label>現在の数値<input type="number" name="current" value="${Number(goal.current || 0)}" required /></label>
        <label>目標数値<input type="number" name="target" value="${Number(goal.target || 0)}" required /></label>
        <label>目標タイプ<select name="scope"><option value="monthly" ${optionSelected(goal.scope, "monthly")}>今月の目標</option><option value="long" ${optionSelected(goal.scope, "long")}>長期目標</option></select></label>
        <label>対象月<input type="month" name="goalMonth" value="${formValue(goal.goalMonth || currentMonthKey())}" /></label>
        <label>期限<input type="date" name="deadline" value="${formValue(goal.deadline)}" /></label>
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
    tags: serializeTags(values.tags),
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
      youtube_synced_at: null,
      youtube_24h_captured_at: null,
      views_24: null
    });
  }

  if (mode !== "edit") {
    payload.views_24 = null;
    payload.youtube_24h_captured_at = null;
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

async function saveGoal(values, mode, id) {
  const existing = mode === "edit" ? getEntity("goal", id) : null;
  const currentValue = Math.max(0, Math.floor(Number(values.current || 0)));
  const targetValue = Math.max(0, Math.floor(Number(values.target || 0)));
  const nextAchieved = targetValue > 0 && currentValue >= targetValue;
  const newlyAchieved = !Boolean(existing?.achieved) && nextAchieved;
  const updatedAt = new Date().toISOString();

  const payload = {
    title: validateTitle(values.title, "目標名"),
    current_value: currentValue,
    target_value: targetValue,
    deadline: values.deadline || null,
    achieved: nextAchieved,
    achieved_date: nextAchieved
      ? (existing?.achievedDate || todayString())
      : null,
    goal_scope: values.scope === "monthly" ? "monthly" : "long",
    goal_month: values.scope === "monthly" ? (values.goalMonth || currentMonthKey()) : null,
    updated_at: updatedAt
  };

  const query = mode === "edit"
    ? supabaseClient
        .from("goals")
        .update(payload)
        .eq("id", id)
        .select()
        .single()
    : supabaseClient
        .from("goals")
        .insert(payload)
        .select()
        .single();

  const { data: row, error } = await query;
  if (error) throw error;

  await addActivityLog(
    "goal",
    row.id,
    row.title,
    mode === "edit" ? "目標を編集" : "目標を追加"
  );

  return {
    row,
    newlyAchieved
  };
}

async function handleSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const submitButton = form.querySelector('[type="submit"]');
  const values = Object.fromEntries(new FormData(form).entries());
  const { type, mode, id } = form.dataset;

  elements.formError.textContent = "";
  setLoading(submitButton, true, mode === "edit" ? "変更を保存中..." : "保存中...");
  setSyncStatus("変更を保存中...");

  try {
    let goalResult = null;

    let moveResult = null;

    if (type === "video") await saveVideo(values, mode, id);
    else if (type === "idea") await saveIdea(values, mode, id);
    else if (type === "goal") goalResult = await saveGoal(values, mode, id);
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
        : goalResult?.newlyAchieved
          ? "目標を達成しました"
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

    [elements.videoDetailModal, elements.ideaDetailModal, elements.goalDetailModal]
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

async function updateGoalProgress(id, rawValue, triggerButton) {
  const goal = findById(data.goals, id);
  if (!goal) {
    showToast("目標が見つかりませんでした。", "error");
    return;
  }

  const parsedValue = Number(rawValue);
  if (!Number.isFinite(parsedValue) || parsedValue < 0) {
    showToast("現在値は0以上の数字で入力してください。", "error");
    return;
  }

  const nextValue = Math.floor(parsedValue);
  const previousValue = Number(goal.current || 0);
  const target = Number(goal.target || 0);
  const nextAchieved = target > 0 && nextValue >= target;
  const newlyAchieved = !goal.achieved && nextAchieved;
  const updatedAt = new Date().toISOString();

  setLoading(triggerButton, true, "保存中...");
  setSyncStatus("達成度を保存中...");

  try {
    const { error } = await supabaseClient
      .from("goals")
      .update({
        current_value: nextValue,
        achieved: nextAchieved,
        achieved_date: nextAchieved
          ? (goal.achievedDate || todayString())
          : null,
        updated_at: updatedAt
      })
      .eq("id", id);

    if (error) throw error;

    await addActivityLog(
      "goal",
      id,
      goal.title,
      "目標の達成度を更新",
      `${previousValue} → ${nextValue}`
    );

    await loadAllData({ silent: true });

    showToast(newlyAchieved ? "目標を達成しました" : "達成度を更新しました");
  } catch (error) {
    console.error(error);
    showToast(`達成度を保存できませんでした：${getErrorMessage(error)}`, "error");
    setSyncStatus("保存エラー", "error");
  } finally {
    setLoading(triggerButton, false);
  }
}

async function achieveGoal(id, triggerButton) {
  const goal = findById(data.goals, id);
  if (!goal || goal.achieved) return;

  const updatedAt = new Date().toISOString();

  setLoading(triggerButton, true, "保存中...");
  setSyncStatus("変更を保存中...");

  try {
    const { error } = await supabaseClient
      .from("goals")
      .update({
        achieved: true,
        achieved_date: todayString(),
        current_value: goal.target,
        updated_at: updatedAt
      })
      .eq("id", id);

    if (error) throw error;
    await addActivityLog("goal", id, goal.title, "目標を達成");
    await loadAllData({ silent: true });
    showToast("目標を達成済みにしました");
  } catch (error) {
    console.error(error);
    const message = getErrorMessage(error);
    showToast(`更新できませんでした：${message}`, "error");
    setSyncStatus("保存エラー", "error");
  } finally {
    setLoading(triggerButton, false);
  }
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
      <div class="detail-field"><span>投稿日</span><strong>${formatDate(video.postDate)}</strong></div>
      <div class="detail-field"><span>24時間後の再生数</span><strong>${format24HourViews(video)}</strong></div>
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

function renderGoalDetail(goal) {
  const denominator = Math.max(Number(goal.target), 1);
  const percent = Math.min(100, Math.max(0,
    Math.round((Number(goal.current) / denominator) * 100)
  ));

  elements.goalDetailTitle.textContent = goal.title;
  elements.goalDetailBody.innerHTML = `
    <div class="detail-summary">
      <div class="detail-field"><span>状態</span><strong>${goal.achieved ? "達成済み" : "進行中"}</strong></div>
      <div class="detail-field"><span>現在</span><strong>${goal.current}</strong></div>
      <div class="detail-field"><span>目標</span><strong>${goal.target}</strong></div>
      <div class="detail-field"><span>進捗</span><strong>${percent}%</strong></div>
      <div class="detail-field"><span>期限</span><strong>${formatDate(goal.deadline)}</strong></div>
      <div class="detail-field"><span>達成日</span><strong>${formatDate(goal.achievedDate)}</strong></div>
    </div>

    <div class="progress"><span style="width:${percent}%"></span></div>

    <section class="goal-progress-editor">
      <div class="goal-progress-editor-head">
        <div>
          <h4>達成度を変更</h4>
        </div>
        <strong>${percent}%</strong>
      </div>

      <label class="goal-progress-label" for="goalProgressInput">現在の数値</label>

      <div class="goal-progress-control">
        <button
          type="button"
          class="goal-step-button"
          data-goal-progress-step="-1"
          aria-label="現在値を1減らす"
        >−1</button>

        <input
          type="number"
          id="goalProgressInput"
          min="0"
          step="1"
          inputmode="numeric"
          value="${Number(goal.current)}"
        />

        <button
          type="button"
          class="goal-step-button"
          data-goal-progress-step="1"
          aria-label="現在値を1増やす"
        >＋1</button>
      </div>

      <button
        type="button"
        class="primary-btn goal-progress-save"
        data-save-goal-progress="${goal.id}"
      >達成度を保存</button>
    </section>

    ${!goal.achieved ? `
      <section class="detail-section">
        <button type="button" class="secondary-btn" data-achieve-goal="${goal.id}">目標値まで達成済みにする</button>
      </section>
    ` : ""}

  `;

  elements.goalDetailEditButton.dataset.editId = goal.id;
  elements.goalDetailDeleteButton.dataset.deleteId = goal.id;
}

function openGoalDetail(id) {
  const goal = findById(data.goals, id);
  if (!goal) {
    showToast("目標が見つかりませんでした。", "error");
    return;
  }
  currentDetailGoalId = goal.id;
  renderGoalDetail(goal);
  openManagedDialog(elements.goalDetailModal);
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
  showAuthScreen();
}

async function startAuthenticatedApp(user) {
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

    const goalCard = event.target.closest("[data-goal-card-id]");
    if (
      goalCard &&
      !event.target.closest("button, a, select, input, textarea, label")
    ) {
      event.preventDefault();
      openGoalDetail(goalCard.dataset.goalCardId);
      return;
    }

    const goalStepButton = event.target.closest("[data-goal-progress-step]");
    if (goalStepButton) {
      event.preventDefault();
      const input = document.getElementById("goalProgressInput");
      if (!input) return;

      const currentValue = Number(input.value || 0);
      const step = Number(goalStepButton.dataset.goalProgressStep || 0);
      input.value = String(Math.max(0, Math.floor(currentValue + step)));
      return;
    }

    const saveGoalProgressButton = event.target.closest("[data-save-goal-progress]");
    if (saveGoalProgressButton) {
      event.preventDefault();
      const input = document.getElementById("goalProgressInput");
      updateGoalProgress(
        saveGoalProgressButton.dataset.saveGoalProgress,
        input?.value,
        saveGoalProgressButton
      );
      return;
    }

    const achieveButton = event.target.closest("[data-achieve-goal]");
    if (achieveButton) {
      event.preventDefault();
      achieveGoal(achieveButton.dataset.achieveGoal, achieveButton);
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
    if (event.target.matches("[data-goal-card-id]")) {
      event.preventDefault();
      openGoalDetail(event.target.dataset.goalCardId);
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

  elements.youtubeSyncButton.addEventListener("click", () => {
    const id = elements.youtubeSyncButton.dataset.youtubeSyncId;
    syncYouTubeVideos(
      [id],
      elements.youtubeSyncButton
    );
  });

  elements.syncAllYoutubeButton.addEventListener("click", () => {
    const candidates = getYouTubeSyncCandidates();

    syncYouTubeVideos(
      candidates.map(video => video.id),
      elements.syncAllYoutubeButton,
      { isBulk: true }
    );
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

  elements.goalDetailEditButton.addEventListener("click", () => {
    const id = elements.goalDetailEditButton.dataset.editId;
    elements.goalDetailModal.close();
    openForm("goal", id);
  });

  elements.goalDetailDeleteButton.addEventListener("click", () => {
    deleteItem("goal", elements.goalDetailDeleteButton.dataset.deleteId, elements.goalDetailDeleteButton);
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

  [elements.formModal, elements.videoDetailModal, elements.ideaDetailModal, elements.ideaItemDetailModal, elements.goalDetailModal, elements.postStatsModal, elements.notificationModal, elements.trashModal].forEach(dialog => {
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

  elements.goalDetailModal.addEventListener("close", () => {
    currentDetailGoalId = null;
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
