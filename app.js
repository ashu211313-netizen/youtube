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
const VIDEO_STATUS_ORDER = new Map(
  VIDEO_STATUSES.map((status, index) => [status, index])
);
const IDEA_STATUSES = ["アイデア", "実行済み"];

let data = {
  videos: [],
  ideas: [],
  ideaItems: [],
  goals: [],
  activityLogs: [],
  notifications: [],
  trash: []
};

let activeVideoFilter = "all";
let realtimeChannel = null;
let toastTimer = null;
let refreshTimer = null;
let selectedPostStatsMonth = "";
let currentDetailVideoId = null;
let currentDetailIdeaId = null;
let currentDetailIdeaItemId = null;
let currentDetailGoalId = null;

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
  detailEditButton: document.getElementById("detailEditButton"),
  detailDeleteButton: document.getElementById("detailDeleteButton"),
  ideaDetailModal: document.getElementById("ideaDetailModal"),
  ideaDetailTitle: document.getElementById("ideaDetailTitle"),
  ideaDetailBody: document.getElementById("ideaDetailBody"),
  ideaDetailEditButton: document.getElementById("ideaDetailEditButton"),
  ideaDetailDeleteButton: document.getElementById("ideaDetailDeleteButton"),
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
  markAllNotificationsRead: document.getElementById("markAllNotificationsRead"),
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
  postStatsAllLong: document.getElementById("postStatsAllLong")
};

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
    goals: "目標・実績"
  };

  document.getElementById("pageTitle").textContent =
    titles[pageId] || "Channel Manager";

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function mapVideo(row) {
  return {
    id: row.id,
    title: row.title,
    type: row.video_type || "Shorts",
    status: row.status === "投稿済み" ? "投稿済み" : "編集待ち",
    owner: row.owner || "",
    postDate: row.post_date || "",
    views24: Number(row.views_24 || 0),
    youtubeUrl: row.youtube_url || "",
    memo: row.memo || "",
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || "",
    sortOrder: row.sort_order == null ? null : Number(row.sort_order),
    deletedAt: row.deleted_at || ""
  };
}

function mapIdea(row) {
  return {
    id: row.id,
    title: row.title,
    status: row.status === "実行済み" ? "実行済み" : "アイデア",
    note: row.note || "",
    priority: Number(row.priority || 1),
    plannedDate: row.planned_date || "",
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || "",
    sortOrder: row.sort_order == null ? null : Number(row.sort_order),
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
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || "",
    sortOrder:
      row.sort_order === null || row.sort_order === undefined
        ? null
        : Number(row.sort_order),
    deletedAt: row.deleted_at || ""
  };
}


function mapActivityLog(row) {
  return {
    id: row.id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    entityTitle: row.entity_title || "",
    action: row.action || "",
    details: row.details || "",
    actorEmail: row.actor_email || "",
    createdAt: row.created_at || ""
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
  if (error) console.error("履歴保存:", error);
}

async function addNotification(title, message, type = "", entityId = "") {
  const { error } = await supabaseClient.from("notifications").insert({
    title,
    message,
    entity_type: type,
    entity_id: entityId,
    is_read: false
  });
  if (error) console.error("通知保存:", error);
}

function logsFor(type, id) {
  return data.activityLogs
    .filter(log => log.entityType === type && String(log.entityId) === String(id))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

function renderHistory(type, id) {
  const logs = logsFor(type, id);
  return `
    <section class="history-section">
      <h4>更新履歴</h4>
      <div class="history-list">
        ${logs.length ? logs.map(log => `
          <article class="history-item">
            <strong>${escapeHtml(log.action)}</strong>
            ${log.details ? `<p>${escapeHtml(log.details)}</p>` : ""}
            <span class="history-time">${formatDateTime(log.createdAt)}${log.actorEmail ? `・${escapeHtml(log.actorEmail)}` : ""}</span>
          </article>
        `).join("") : `<div class="empty-state">履歴はまだありません</div>`}
      </div>
    </section>
  `;
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

function compareBySortOrder(a, b) {
  const ao = Number.isFinite(a.sortOrder) ? a.sortOrder : Number.MAX_SAFE_INTEGER;
  const bo = Number.isFinite(b.sortOrder) ? b.sortOrder : Number.MAX_SAFE_INTEGER;
  return ao - bo || String(a.createdAt).localeCompare(String(b.createdAt));
}

async function fetchGoals() {
  return supabaseClient
    .from("goals")
    .select("*")
    .order("created_at", { ascending: true });
}

async function loadAllData({ silent = false } = {}) {
  if (!silent) setSyncStatus("同期中");

  const [
    videosResult,
    ideasResult,
    ideaItemsResult,
    goalsResult,
    logsResult,
    notificationsResult
  ] = await Promise.all([
    supabaseClient.from("videos").select("*").order("created_at"),
    supabaseClient.from("ideas").select("*").order("created_at"),
    supabaseClient.from("idea_items").select("*").order("created_at"),
    fetchGoals(),
    supabaseClient.from("activity_logs").select("*").order("created_at", { ascending: false }).limit(500),
    supabaseClient.from("notifications").select("*").order("created_at", { ascending: false }).limit(200)
  ]);

  const firstError =
    videosResult.error ||
    ideasResult.error ||
    ideaItemsResult.error ||
    goalsResult.error ||
    logsResult.error ||
    notificationsResult.error;

  if (firstError) {
    console.error(firstError);
    setSyncStatus("同期エラー", "error");
    if (!silent) showToast(`読み込みに失敗しました：${getErrorMessage(firstError)}`, "error");
    return false;
  }

  const allVideos = videosResult.data.map(mapVideo);
  const allIdeas = ideasResult.data.map(mapIdea);
  const allIdeaItems = ideaItemsResult.data.map(mapIdeaItem);
  const allGoals = goalsResult.data.map(mapGoal);

  data = {
    videos: allVideos.filter(item => !item.deletedAt).sort(compareBySortOrder),
    ideas: allIdeas.filter(item => !item.deletedAt),
    ideaItems: allIdeaItems,
    goals: allGoals.filter(item => !item.deletedAt),
    activityLogs: logsResult.data.map(mapActivityLog),
    notifications: notificationsResult.data.map(mapNotification),
    trash: [
      ...allVideos.filter(item => item.deletedAt).map(item => ({ ...item, entityType: "video" })),
      ...allIdeas.filter(item => item.deletedAt).map(item => ({ ...item, entityType: "idea" })),
      ...allGoals.filter(item => item.deletedAt).map(item => ({ ...item, entityType: "goal" }))
    ].sort((a, b) => String(b.deletedAt).localeCompare(String(a.deletedAt)))
  };

  renderAll();
  renderNotifications();
  renderTrash();

  if (elements.videoDetailModal.open && currentDetailVideoId) {
    const item = data.videos.find(video => video.id === currentDetailVideoId);
    item ? renderVideoDetail(item) : elements.videoDetailModal.close();
  }
  if (elements.ideaDetailModal.open && currentDetailIdeaId) {
    const item = data.ideas.find(idea => idea.id === currentDetailIdeaId);
    item ? renderIdeaDetail(item) : elements.ideaDetailModal.close();
  }
  if (elements.ideaItemDetailModal.open && currentDetailIdeaItemId) {
    const item = getIdeaItemById(currentDetailIdeaItemId);
    item ? renderIdeaItemDetail(item) : elements.ideaItemDetailModal.close();
  }
  if (elements.goalDetailModal.open && currentDetailGoalId) {
    const item = data.goals.find(goal => goal.id === currentDetailGoalId);
    item ? renderGoalDetail(item) : elements.goalDetailModal.close();
  }

  setSyncStatus("同期済み", "online");
  return true;
}

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

function currentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
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

  return [...months].sort((a, b) => b.localeCompare(a));
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

function renderPostStatsMonthlyList(months) {
  elements.postStatsMonthlyList.innerHTML = months.length
    ? months.map(monthKey => {
        const stats = getMonthlyPostStats(monthKey);
        const selectedClass = monthKey === selectedPostStatsMonth ? " is-selected" : "";

        return `
          <button
            type="button"
            class="post-monthly-row${selectedClass}"
            data-post-stats-month="${monthKey}"
          >
            <strong>${formatMonthLabel(monthKey)}</strong>
            <span>合計 <b>${stats.total}</b></span>
            <span>Shorts <b>${stats.shorts}</b></span>
            <span>横動画 <b>${stats.long}</b></span>
            <i aria-hidden="true">›</i>
          </button>
        `;
      }).join("")
    : `<div class="empty-state">投稿実績はまだありません</div>`;
}

function renderPostStats() {
  const posted = getPostedVideos();
  const months = getAvailablePostMonths();

  renderPostStatsMonthOptions(months);

  const selectedStats = getMonthlyPostStats(selectedPostStatsMonth);
  elements.postStatsSelectedMonthLabel.textContent =
    `${formatMonthLabel(selectedPostStatsMonth)}の投稿`;

  elements.postStatsMonthTotal.textContent = selectedStats.total;
  elements.postStatsMonthShorts.textContent = selectedStats.shorts;
  elements.postStatsMonthLong.textContent = selectedStats.long;

  elements.postStatsAllTotal.textContent = posted.length;
  elements.postStatsAllShorts.textContent = countAllPostsByType("Shorts");
  elements.postStatsAllLong.textContent = countAllPostsByType("横動画");

  renderPostStatsMonthlyList(months);
}

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

  const posted = data.videos
    .filter(video => video.status === "投稿済み")
    .sort((a, b) => String(b.postDate).localeCompare(String(a.postDate)));

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
              <td>${Number(video.views24).toLocaleString()}回</td>
            </tr>
          `;
        }).join("")}
      </tbody>
    </table>
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

function videoSortDate(video) {
  return String(video.updatedAt || video.createdAt || "");
}

function sortVideosForList(videos) {
  return [...videos].sort((a, b) => {
    if (activeVideoFilter === "投稿済み") {
      return (
        String(b.postDate || "").localeCompare(String(a.postDate || "")) ||
        videoSortDate(b).localeCompare(videoSortDate(a))
      );
    }

    if (activeVideoFilter !== "all") {
      return videoSortDate(b).localeCompare(videoSortDate(a));
    }

    const statusDifference =
      (VIDEO_STATUS_ORDER.get(a.status) ?? 999) -
      (VIDEO_STATUS_ORDER.get(b.status) ?? 999);

    if (statusDifference !== 0) {
      return statusDifference;
    }

    if (a.status === "投稿済み" && b.status === "投稿済み") {
      return (
        String(b.postDate || "").localeCompare(String(a.postDate || "")) ||
        videoSortDate(b).localeCompare(videoSortDate(a))
      );
    }

    return videoSortDate(b).localeCompare(videoSortDate(a));
  });
}

function renderVideos() {
  const list = document.getElementById("videoList");
  renderVideoFilterCounts();

  const filteredVideos = activeVideoFilter === "all"
    ? data.videos
    : data.videos.filter(video => video.status === activeVideoFilter);

  const videos = sortVideosForList(filteredVideos);

  if (!videos.length) {
    list.innerHTML = `<div class="card empty-state">該当する動画はありません</div>`;
    return;
  }

  list.innerHTML = videos.map(video => {
    const youtubeUrl = safeExternalUrl(video.youtubeUrl);

    return `
      <article class="item-card video-card is-clickable" data-video-card-id="${video.id}" tabindex="0" role="button" aria-label="${escapeHtml(video.title)}の詳細を開く">
        <div>
          <div class="video-card-top">
            <select class="status-select" data-video-status-id="${video.id}" aria-label="${escapeHtml(video.title)}のステータス">
              ${VIDEO_STATUSES.map(status => `
                <option value="${status}" ${status === video.status ? "selected" : ""}>${status}</option>
              `).join("")}
            </select>
          </div>

          <h4>${escapeHtml(video.title)}</h4>

          <div class="meta">
            <span>${escapeHtml(video.type)}</span>
            <span>担当：${escapeHtml(video.owner || "未設定")}</span>
            <span>投稿日：${formatDate(video.postDate)}</span>
            ${video.views24 ? `<span>24時間：${Number(video.views24).toLocaleString()}回</span>` : ""}
            ${youtubeUrl ? `<a href="${escapeHtml(youtubeUrl)}" target="_blank" rel="noopener noreferrer">YouTubeを開く</a>` : ""}
          </div>

          ${video.memo ? `<p class="card-memo-preview">${escapeHtml(video.memo)}</p>` : ""}
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

function renderIdeas() {
  const board = document.getElementById("ideaBoard");

  board.innerHTML = IDEA_STATUSES.map(status => {
    const items = data.ideas
      .filter(idea => idea.status === status)
      .sort((a, b) => {
        const createdCompare = String(a.createdAt || "").localeCompare(
          String(b.createdAt || "")
        );

        if (createdCompare !== 0) {
          return createdCompare;
        }

        return String(a.id).localeCompare(String(b.id));
      });

    return `
      <section class="kanban-column">
        <h4>${status} <span>(${items.length})</span></h4>

        ${items.map(idea => `
          <article
            class="idea-card idea-list-card is-tappable"
            data-idea-card-id="${idea.id}"
            role="button"
            tabindex="0"
          >
            <div class="idea-list-main">
              <strong>${escapeHtml(idea.title)}</strong>
              <div class="idea-list-meta">
                <span class="status">${escapeHtml(idea.status)}</span>
                <span>更新 ${formatDate((idea.updatedAt || idea.createdAt)?.slice(0,10))}</span>
              </div>
            </div>
            <span class="detail-chevron">›</span>
          </article>
        `).join("") || `<div class="empty-state">なし</div>`}
      </section>
    `;
  }).join("");
}

function renderGoals() {
  const list = document.getElementById("goalList");
  const goals = data.goals;

  if (!goals.length) {
    list.innerHTML = `<div class="card empty-state">目標はまだありません</div>`;
    return;
  }

  list.innerHTML = goals.map(goal => {
    const denominator = Math.max(Number(goal.target), 1);
    const percent = Math.min(100, Math.max(0,
      Math.round((Number(goal.current) / denominator) * 100)
    ));

    return `
      <article
        class="item-card is-tappable goal-progress-card"
        data-goal-card-id="${goal.id}"
        role="button"
        tabindex="0"
        aria-label="${escapeHtml(goal.title)}の達成度を変更"
      >
        <div>
          <span class="status">${goal.achieved ? "達成済み" : "進行中"}</span>
          <h4>${escapeHtml(goal.title)}</h4>
          <div class="meta">
            <span>現在 ${goal.current}</span>
            <span>目標 ${goal.target}</span>
            <span>期限 ${formatDate(goal.deadline)}</span>
          </div>
          <div class="progress"><span style="width:${percent}%"></span></div>
        </div>

        <div class="goal-progress-card-side">
          <span class="goal-progress-percent">${percent}%</span>
          <span class="detail-chevron" aria-hidden="true">›</span>
        </div>
      </article>
    `;
  }).join("");
}


function renderNotifications() {
  const unread = data.notifications.filter(item => !item.isRead).length;
  elements.notificationBadge.textContent = unread > 99 ? "99+" : unread;
  elements.notificationBadge.classList.toggle("is-hidden", unread === 0);

  elements.notificationList.innerHTML = data.notifications.length
    ? data.notifications.map(item => `
      <article class="notification-item ${item.isRead ? "" : "unread"}" data-notification-id="${item.id}">
        <strong>${escapeHtml(item.title)}</strong>
        <p>${escapeHtml(item.message)}</p>
        <span class="notification-time">${formatDateTime(item.createdAt)}</span>
      </article>
    `).join("")
    : `<div class="empty-state">通知はありません</div>`;
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
}

function getEntity(type, id) {
  const keyMap = {
    video: "videos",
    idea: "ideas",
    goal: "goals"
  };

  return data[keyMap[type]]?.find(item => item.id === id) || null;
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
  elements.formEyebrow.textContent = isEdit ? "EDIT DATA" : "ADD DATA";
  elements.dynamicForm.dataset.type = type;
  elements.dynamicForm.dataset.mode = isEdit ? "edit" : "create";
  elements.dynamicForm.dataset.id = entity?.id || "";

  if (type === "video") {
    const video = entity || {
      title: "",
      type: "Shorts",
      status: "編集待ち",
      owner: "",
      postDate: "",
      views24: 0,
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
        <label>担当者<input name="owner" value="${formValue(video.owner)}" placeholder="自分 / 相方" /></label>
        <label>投稿日<input type="date" name="postDate" value="${formValue(video.postDate)}" /></label>
        <label>24時間後の再生数<input type="number" name="views24" min="0" value="${Number(video.views24 || 0)}" /></label>
        <label>YouTube URL<input type="url" name="youtubeUrl" value="${formValue(video.youtubeUrl)}" placeholder="https://youtube.com/..." /></label>
        <label>メモ<textarea name="memo">${formValue(video.memo)}</textarea></label>
      </div>
      <button class="form-submit" type="submit">${isEdit ? "変更を保存" : "追加する"}</button>
    `;
  } else if (type === "idea") {
    const idea = entity || { title: "", status: "アイデア", note: "" };

    elements.formTitle.textContent = isEdit ? "企画を編集" : "企画を追加";
    elements.dynamicForm.innerHTML = `
      <div class="form-grid">
        <label>企画名<input name="title" value="${formValue(idea.title)}" required /></label>
        <label>ステータス
          <select name="status">
            ${IDEA_STATUSES.map(status => `<option ${optionSelected(idea.status, status)}>${status}</option>`).join("")}
          </select>
        </label>
        <label>企画内容・メモ<textarea name="note">${formValue(idea.note)}</textarea></label>
      </div>
      <button class="form-submit" type="submit">${isEdit ? "変更を保存" : "追加する"}</button>
    `;
  } else if (type === "goal") {
    const goal = entity || { title: "", current: 0, target: 100, deadline: "" };

    elements.formTitle.textContent = isEdit ? "目標を編集" : "目標を追加";
    elements.dynamicForm.innerHTML = `
      <div class="form-grid">
        <label>目標名<input name="title" value="${formValue(goal.title)}" required /></label>
        <label>現在の数値<input type="number" name="current" value="${Number(goal.current || 0)}" required /></label>
        <label>目標数値<input type="number" name="target" value="${Number(goal.target || 0)}" required /></label>
        <label>期限<input type="date" name="deadline" value="${formValue(goal.deadline)}" /></label>
      </div>
      <button class="form-submit" type="submit">${isEdit ? "変更を保存" : "追加する"}</button>
    `;
  } else {
    return;
  }

  elements.formModal.showModal();
}

function validateTitle(value, label) {
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    throw new Error(`${label}を入力してください。`);
  }
  return trimmed;
}

function confirmPostDateIfNeeded(status, postDate) {
  if (status !== "投稿済み" || postDate) {
    return postDate || null;
  }

  const useToday = window.confirm(
    "投稿日が未設定です。今日の日付を投稿日に設定しますか？\n\n「キャンセル」を選ぶと、投稿日を未設定のまま投稿済みにします。"
  );

  return useToday ? todayString() : null;
}

async function saveVideo(values, mode, id) {
  const existing = mode === "edit" ? getEntity("video", id) : null;
  const payload = {
    title: validateTitle(values.title, "動画タイトル"),
    video_type: values.type,
    status: values.status,
    owner: values.owner?.trim() || "",
    post_date: values.postDate || null,
    views_24: Number(values.views24 || 0),
    youtube_url: values.youtubeUrl?.trim() || "",
    memo: values.memo || "",
    updated_at: new Date().toISOString()
  };

  const query = mode === "edit"
    ? supabaseClient.from("videos").update(payload).eq("id", id).select().single()
    : supabaseClient.from("videos").insert(payload).select().single();

  const { data: row, error } = await query;
  if (error) throw error;

  const action = mode === "edit" ? "動画を編集" : "動画を追加";
  const details = existing && existing.status !== values.status
    ? `${existing.status} → ${values.status}`
    : "";
  await addActivityLog("video", row.id, row.title, action, details);

  if (mode === "edit" && existing?.status !== values.status) {
    await addNotification("動画ステータス変更", `${row.title}\n${existing.status} → ${values.status}`, "video", row.id);
  }
  return row;
}

async function saveIdea(values, mode, id) {
  const existing = mode === "edit" ? getEntity("idea", id) : null;
  const payload = {
    title: validateTitle(values.title, "企画名"),
    status: values.status,
    note: values.note || "",
    updated_at: new Date().toISOString()
  };

  const query = mode === "edit"
    ? supabaseClient.from("ideas").update(payload).eq("id", id).select().single()
    : supabaseClient.from("ideas").insert(payload).select().single();

  const { data: row, error } = await query;
  if (error) throw error;

  const details = existing && existing.status !== values.status
    ? `${existing.status} → ${values.status}`
    : "";
  await addActivityLog("idea", row.id, row.title, mode === "edit" ? "企画を編集" : "企画を追加", details);
  if (details) await addNotification("企画ステータス変更", `${row.title}\n${details}`, "idea", row.id);
  return row;
}

async function saveGoal(values, mode, id) {
  const payload = {
    title: validateTitle(values.title, "目標名"),
    current_value: Number(values.current || 0),
    target_value: Number(values.target || 0),
    deadline: values.deadline || null,
    updated_at: new Date().toISOString()
  };

  const query = mode === "edit"
    ? supabaseClient.from("goals").update(payload).eq("id", id).select().single()
    : supabaseClient.from("goals").insert({ ...payload, achieved: false, achieved_date: null }).select().single();

  const { data: row, error } = await query;
  if (error) throw error;
  await addActivityLog("goal", row.id, row.title, mode === "edit" ? "目標を編集" : "目標を追加");
  return row;
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
    if (type === "video") await saveVideo(values, mode, id);
    else if (type === "idea") await saveIdea(values, mode, id);
    else if (type === "goal") await saveGoal(values, mode, id);
    else throw new Error("保存形式が不明です。");

    elements.formModal.close();
    await loadAllData({ silent: true });
    showToast(mode === "edit" ? "変更を保存しました" : "追加しました");
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
    await addNotification("ゴミ箱へ移動", `${entity.title}をゴミ箱へ移動しました`, type, id);

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
  const video = data.videos.find(item => item.id === id);
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
    await addNotification("動画ステータス変更", `${video.title}
${previousStatus} → ${newStatus}`, "video", id);
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
  const idea = data.ideas.find(item => item.id === id);
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
  const parentIdea = data.ideas.find(
    item => String(item.id) === String(parentIdeaId)
  );

  if (!parentIdea || parentIdea.status !== "実行済み") {
    showToast("実行済みの企画内でのみ追加できます。", "error");
    return;
  }

  setLoading(submitButton, true, "追加中...");

  try {
    const title = validateTitle(values.title, "アイデア名");

    const { data: row, error } = await supabaseClient
      .from("idea_items")
      .insert({
        parent_idea_id: String(parentIdeaId),
        title,
        note: values.note || "",
        status: "アイデア",
        updated_at: new Date().toISOString()
      })
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
  const item = data.ideaItems.find(
    entry => String(entry.id) === String(itemId)
  );

  if (!item) {
    showToast("企画内アイデアが見つかりませんでした。", "error");
    return;
  }

  const parentIdea = data.ideas.find(
    idea => String(idea.id) === String(item.parentIdeaId)
  );

  setLoading(submitButton, true, "保存中...");

  try {
    const payload = {
      title: validateTitle(values.title, "アイデア名"),
      note: values.note || "",
      status: IDEA_STATUSES.includes(values.status)
        ? values.status
        : "アイデア",
      updated_at: new Date().toISOString()
    };

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

async function updateIdeaItemStatus(itemId, status, selectElement) {
  const item = data.ideaItems.find(
    entry => String(entry.id) === String(itemId)
  );

  if (!item || !IDEA_STATUSES.includes(status)) {
    return;
  }

  const previousStatus = item.status;
  selectElement.disabled = true;

  try {
    const { error } = await supabaseClient
      .from("idea_items")
      .update({
        status,
        updated_at: new Date().toISOString()
      })
      .eq("id", itemId);

    if (error) throw error;

    const parentIdea = data.ideas.find(
      idea => String(idea.id) === String(item.parentIdeaId)
    );

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
    selectElement.value = previousStatus;
    showToast(`変更できませんでした：${getErrorMessage(error)}`, "error");
  } finally {
    selectElement.disabled = false;
  }
}

async function deleteIdeaItem(itemId, button) {
  const item = data.ideaItems.find(
    entry => String(entry.id) === String(itemId)
  );

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

    const parentIdea = data.ideas.find(
      idea => String(idea.id) === String(item.parentIdeaId)
    );

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
  const idea = data.ideas.find(item => String(item.id) === String(id));
  if (!idea || idea.status === "実行済み") return;
  setLoading(button, true, "保存中...");
  const { error } = await supabaseClient.from("ideas")
    .update({ status: "実行済み", updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) showToast(`更新できませんでした：${getErrorMessage(error)}`, "error");
  else {
    await addActivityLog("idea", id, idea.title, "企画を実行済みに変更", "アイデア → 実行済み");
    await addNotification("企画を実行済みに変更", idea.title, "idea", id);
    elements.ideaDetailModal.close();
    await loadAllData({ silent: true });
    showToast("実行済みに変更しました");
  }
  setLoading(button, false);
}

async function updateGoalProgress(id, rawValue, triggerButton) {
  const goal = data.goals.find(item => String(item.id) === String(id));
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
        updated_at: new Date().toISOString()
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

    if (newlyAchieved) {
      await addNotification(
        "目標達成",
        `${goal.title}を達成しました`,
        "goal",
        id
      );
    } else {
      await addNotification(
        "目標の達成度を更新",
        `${goal.title}\n${previousValue} → ${nextValue}`,
        "goal",
        id
      );
    }

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
  const goal = data.goals.find(item => item.id === id);
  if (!goal) return;

  setLoading(triggerButton, true, "保存中...");
  setSyncStatus("変更を保存中...");

  try {
    const { error } = await supabaseClient
      .from("goals")
      .update({
        achieved: true,
        achieved_date: todayString(),
        current_value: goal.target,
        updated_at: new Date().toISOString()
      })
      .eq("id", id);

    if (error) throw error;
    await addActivityLog("goal", id, goal.title, "目標を達成");
    await addNotification("目標達成", `${goal.title}を達成しました`, "goal", id);
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

function renderVideoDetail(video) {
  const youtubeUrl = safeExternalUrl(video.youtubeUrl);
  elements.videoDetailTitle.textContent = video.title;
  elements.videoDetailBody.innerHTML = `
    <div class="detail-summary">
      <div class="detail-field"><span>ステータス</span><strong>${escapeHtml(video.status)}</strong></div>
      <div class="detail-field"><span>動画形式</span><strong>${escapeHtml(video.type)}</strong></div>
      <div class="detail-field"><span>担当</span><strong>${escapeHtml(video.owner || "未設定")}</strong></div>
      <div class="detail-field"><span>投稿日</span><strong>${formatDate(video.postDate)}</strong></div>
      <div class="detail-field"><span>24時間後の再生数</span><strong>${Number(video.views24).toLocaleString()}回</strong></div>
      <div class="detail-field"><span>YouTube</span><strong>${youtubeUrl ? `<a class="detail-link" href="${escapeHtml(youtubeUrl)}" target="_blank" rel="noopener noreferrer">動画を開く</a>` : "未設定"}</strong></div>
    </div>
    <section class="detail-section">
      <h4>メモ</h4>
      <p>${video.memo ? escapeHtml(video.memo) : "メモはありません"}</p>
    </section>
  `;
  elements.detailEditButton.dataset.editId = video.id;
  elements.detailDeleteButton.dataset.deleteId = video.id;
}

function openVideoDetail(id) {
  const video = data.videos.find(item => item.id === id);
  if (!video) {
    showToast("動画が見つかりませんでした。", "error");
    return;
  }

  currentDetailVideoId = id;
  renderVideoDetail(video);
  elements.videoDetailModal.showModal();
}

function getIdeaItems(parentIdeaId) {
  return data.ideaItems
    .filter(item => String(item.parentIdeaId) === String(parentIdeaId))
    .sort((a, b) =>
      String(b.updatedAt || b.createdAt).localeCompare(
        String(a.updatedAt || a.createdAt)
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
          <span>IDEAS IN PROJECT</span>
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
                <span class="status">${escapeHtml(item.status)}</span>
                <span>追加 ${formatDate(item.createdAt?.slice(0, 10))}</span>
              </div>
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
  return data.ideaItems.find(item => String(item.id) === String(id));
}

function renderIdeaItemDetail(item) {
  const parentIdea = data.ideas.find(
    idea => String(idea.id) === String(item.parentIdeaId)
  );

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
  elements.ideaItemDetailModal.showModal();
}

function renderIdeaDetail(idea) {
  elements.ideaDetailTitle.textContent = idea.title;
  elements.ideaDetailBody.innerHTML = `
    <div class="detail-summary">
      <div class="detail-field"><span>ステータス</span><strong>${escapeHtml(idea.status)}</strong></div>
      <div class="detail-field"><span>作成日</span><strong>${formatDate(idea.createdAt?.slice(0,10))}</strong></div>
      <div class="detail-field"><span>更新日</span><strong>${formatDate((idea.updatedAt || idea.createdAt)?.slice(0,10))}</strong></div>
    </div>
    <section class="detail-section">
      <h4>企画内容・メモ</h4>
      <p class="idea-content-block">${idea.note ? escapeHtml(idea.note) : "内容はまだありません"}</p>
    </section>

    ${renderIdeaItemsSection(idea)}
  `;
  elements.ideaCompleteButton.classList.toggle("is-hidden", idea.status === "実行済み");
  elements.ideaCompleteButton.dataset.completeId = idea.id;
  elements.ideaDetailEditButton.dataset.editId = idea.id;
  elements.ideaDetailDeleteButton.dataset.deleteId = idea.id;
}

function openIdeaDetail(id) {
  const idea = data.ideas.find(item => item.id === id);
  if (!idea) {
    showToast("企画が見つかりませんでした。", "error");
    return;
  }
  currentDetailIdeaId = id;
  renderIdeaDetail(idea);
  elements.ideaDetailModal.showModal();
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
          <span>PROGRESS</span>
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
  const goal = data.goals.find(item => item.id === id);
  if (!goal) {
    showToast("目標が見つかりませんでした。", "error");
    return;
  }
  currentDetailGoalId = id;
  renderGoalDetail(goal);
  elements.goalDetailModal.showModal();
}

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
    .on("postgres_changes", { event: "*", schema: "public", table: "activity_logs" }, scheduleRealtimeRefresh)
    .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, scheduleRealtimeRefresh)
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

  data = {
    videos: [],
    ideas: [],
    ideaItems: [],
    goals: [],
    activityLogs: [],
    notifications: [],
    trash: []
  };
  showAuthScreen();
}

async function startAuthenticatedApp(user) {
  showApplication(user);
  setupDate();
  renderAll();
  await loadAllData();
  subscribeRealtime();
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

  elements.detailEditButton.addEventListener("click", () => {
    const id = elements.detailEditButton.dataset.editId;
    elements.videoDetailModal.close();
    openForm("video", id);
  });

  elements.detailDeleteButton.addEventListener("click", () => {
    deleteItem("video", elements.detailDeleteButton.dataset.deleteId, elements.detailDeleteButton);
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

  elements.notificationButton.addEventListener("click", async () => {
    elements.notificationModal.showModal();

    const unreadIds = data.notifications
      .filter(item => !item.isRead)
      .map(item => item.id);

    if (!unreadIds.length) return;

    // ベルを開いた瞬間に、画面上ではすぐ既読として反映
    data.notifications = data.notifications.map(item =>
      unreadIds.includes(item.id)
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
      showToast(`通知を既読にできませんでした：${getErrorMessage(error)}`, "error");
      await loadAllData({ silent: true });
    }
  });

  elements.postStatsButton.addEventListener("click", () => {
    selectedPostStatsMonth = currentMonthKey();
    renderPostStats();
    elements.postStatsModal.showModal();
  });

  elements.postStatsMonthSelect.addEventListener("change", event => {
    selectedPostStatsMonth = event.currentTarget.value;
    renderPostStats();
  });

  elements.trashButton.addEventListener("click", () => {
    renderTrash();
    elements.trashModal.showModal();
  });

  elements.markAllNotificationsRead.addEventListener("click", async () => {
    const unreadIds = data.notifications.filter(item => !item.isRead).map(item => item.id);
    if (!unreadIds.length) return;
    const { error } = await supabaseClient.from("notifications").update({ is_read: true }).in("id", unreadIds);
    if (error) showToast(`既読にできませんでした：${getErrorMessage(error)}`, "error");
    else await loadAllData({ silent: true });
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
  });

  elements.videoDetailModal.addEventListener("close", () => {
    currentDetailVideoId = null;
  });

  elements.ideaDetailModal.addEventListener("close", () => {
    currentDetailIdeaId = null;
  });

  elements.goalDetailModal.addEventListener("close", () => {
    currentDetailGoalId = null;
  });
}

initialize().catch(error => {
  console.error(error);
  showAuthScreen();
  elements.loginMessage.textContent = `初期化に失敗しました：${getErrorMessage(error)}`;
});
