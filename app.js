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

const VIDEO_STATUSES = ["企画中", "編集待ち", "編集中", "確認待ち", "投稿済み"];
const IDEA_STATUSES = ["アイデア", "検討中", "実行予定", "実行済み"];

let data = {
  videos: [],
  ideas: [],
  goals: []
};

let activeVideoFilter = "all";
let realtimeChannel = null;
let toastTimer = null;
let refreshTimer = null;
let currentDetailVideoId = null;
let currentDetailIdeaId = null;
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
  quickModal: document.getElementById("quickModal"),
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
  goalDetailModal: document.getElementById("goalDetailModal"),
  goalDetailTitle: document.getElementById("goalDetailTitle"),
  goalDetailBody: document.getElementById("goalDetailBody"),
  goalDetailEditButton: document.getElementById("goalDetailEditButton"),
  goalDetailDeleteButton: document.getElementById("goalDetailDeleteButton")
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
    status: row.status || "企画中",
    owner: row.owner || "",
    postDate: row.post_date || "",
    views24: Number(row.views_24 || 0),
    youtubeUrl: row.youtube_url || "",
    memo: row.memo || "",
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || ""
  };
}

function mapIdea(row) {
  return {
    id: row.id,
    title: row.title,
    status: row.status || "アイデア",
    note: row.note || "",
    priority: Number(row.priority || 1),
    plannedDate: row.planned_date || "",
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
    updatedAt: row.updated_at || ""
  };
}

async function loadAllData({ silent = false } = {}) {
  if (!silent) {
    setSyncStatus("同期中");
  }

  const [videosResult, ideasResult, goalsResult] = await Promise.all([
    supabaseClient.from("videos").select("*").order("created_at", { ascending: false }),
    supabaseClient.from("ideas").select("*").order("created_at", { ascending: false }),
    supabaseClient.from("goals").select("*").order("created_at", { ascending: false })
  ]);

  const firstError = videosResult.error || ideasResult.error || goalsResult.error;

  if (firstError) {
    console.error(firstError);
    setSyncStatus("同期エラー", "error");

    if (!silent) {
      showToast(`読み込みに失敗しました：${getErrorMessage(firstError)}`, "error");
    }

    return false;
  }

  data = {
    videos: videosResult.data.map(mapVideo),
    ideas: ideasResult.data.map(mapIdea),
    goals: goalsResult.data.map(mapGoal)
  };

  renderAll();

  if (elements.videoDetailModal.open && currentDetailVideoId) {
    const detailVideo = data.videos.find(video => video.id === currentDetailVideoId);
    if (detailVideo) {
      renderVideoDetail(detailVideo);
    } else {
      elements.videoDetailModal.close();
      currentDetailVideoId = null;
    }
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

function countMonthlyPosts() {
  return data.videos.filter(video =>
    video.status === "投稿済み" && isCurrentMonth(video.postDate)
  ).length;
}

function countMonthlyPostsByType(videoType) {
  return data.videos.filter(video =>
    video.status === "投稿済み" &&
    video.type === videoType &&
    isCurrentMonth(video.postDate)
  ).length;
}

function renderDashboard() {
  document.getElementById("monthlyPosts").textContent = countMonthlyPosts();
  document.getElementById("monthlyShorts").textContent = countMonthlyPostsByType("Shorts");
  document.getElementById("monthlyLongVideos").textContent = countMonthlyPostsByType("横動画");
  document.getElementById("planningCount").textContent =
    data.videos.filter(video => video.status === "企画中").length;
  document.getElementById("editingWaitingCount").textContent =
    data.videos.filter(video => video.status === "編集待ち").length;
  document.getElementById("ideaCount").textContent =
    data.ideas.filter(idea => idea.status !== "実行済み").length;

  const activeGoal = data.goals.find(goal => !goal.achieved);
  const titleElement = document.getElementById("currentGoalTitle");
  const metaElement = document.getElementById("currentGoalMeta");
  const percentElement = document.getElementById("goalPercent");
  const progressElement = document.getElementById("goalProgress");

  if (!activeGoal) {
    titleElement.textContent = "目標はまだありません";
    metaElement.textContent = "目標ページから追加してください";
    percentElement.textContent = "0%";
    progressElement.style.width = "0%";
  } else {
    const denominator = Math.max(Number(activeGoal.target), 1);
    const percent = Math.min(100, Math.max(0,
      Math.round((Number(activeGoal.current) / denominator) * 100)
    ));

    titleElement.textContent = activeGoal.title;
    metaElement.textContent = `現在 ${activeGoal.current} / 目標 ${activeGoal.target}`;
    percentElement.textContent = `${percent}%`;
    progressElement.style.width = `${percent}%`;
  }

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
        ${posted.slice(0, 5).map(video => `
          <tr>
            <td>${escapeHtml(video.title)}</td>
            <td>${escapeHtml(video.type)}</td>
            <td>${formatDate(video.postDate)}</td>
            <td>${Number(video.views24).toLocaleString()}回</td>
          </tr>
        `).join("")}
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
    const items = data.ideas.filter(idea => idea.status === status);

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

  if (!data.goals.length) {
    list.innerHTML = `<div class="card empty-state">目標はまだありません</div>`;
    return;
  }

  list.innerHTML = data.goals.map(goal => {
    const denominator = Math.max(Number(goal.target), 1);
    const percent = Math.min(100, Math.max(0,
      Math.round((Number(goal.current) / denominator) * 100)
    ));

    return `
      <article
        class="item-card is-tappable"
        data-goal-card-id="${goal.id}"
        role="button"
        tabindex="0"
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
        <span class="detail-chevron">›</span>
      </article>
    `;
  }).join("");
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
  if (elements.quickModal.open) {
    elements.quickModal.close();
  }

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
      status: "企画中",
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
        <label>メモ<textarea name="note">${formValue(idea.note)}</textarea></label>
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
  const payload = {
    title: validateTitle(values.title, "動画タイトル"),
    video_type: values.type,
    status: values.status,
    owner: String(values.owner || "").trim() || null,
    post_date: confirmPostDateIfNeeded(values.status, values.postDate),
    views_24: Number(values.views24 || 0),
    youtube_url: String(values.youtubeUrl || "").trim() || null,
    memo: String(values.memo || "").trim() || null,
    updated_at: new Date().toISOString()
  };

  const query = mode === "edit"
    ? supabaseClient.from("videos").update(payload).eq("id", id)
    : supabaseClient.from("videos").insert(payload);

  const { error } = await query;
  if (error) throw error;
}

async function saveIdea(values, mode, id) {
  const payload = {
    title: validateTitle(values.title, "企画名"),
    status: values.status,
    note: String(values.note || "").trim() || null,
    updated_at: new Date().toISOString()
  };

  const query = mode === "edit"
    ? supabaseClient.from("ideas").update(payload).eq("id", id)
    : supabaseClient.from("ideas").insert(payload);

  const { error } = await query;
  if (error) throw error;
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
    ? supabaseClient.from("goals").update(payload).eq("id", id)
    : supabaseClient.from("goals").insert({
        ...payload,
        achieved: false,
        achieved_date: null
      });

  const { error } = await query;
  if (error) throw error;
}

async function handleSubmit(event) {
  event.preventDefault();

  const form = event.currentTarget;
  const submitButton = form.querySelector('[type="submit"]');
  const values = Object.fromEntries(new FormData(form).entries());
  const type = form.dataset.type;
  const mode = form.dataset.mode;
  const id = form.dataset.id;

  elements.formError.textContent = "";
  setLoading(submitButton, true, mode === "edit" ? "変更を保存中..." : "保存中...");
  setSyncStatus("変更を保存中...");

  try {
    if (type === "video") {
      await saveVideo(values, mode, id);
    } else if (type === "idea") {
      await saveIdea(values, mode, id);
    } else if (type === "goal") {
      await saveGoal(values, mode, id);
    } else {
      throw new Error("保存形式が不明です。");
    }

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
  const tableMap = { video: "videos", idea: "ideas", goal: "goals" };
  const labelMap = { video: "動画", idea: "企画", goal: "目標" };
  const table = tableMap[type];
  const entity = getEntity(type, id);

  if (!table || !entity) {
    showToast("削除対象が見つかりませんでした。", "error");
    return;
  }

  const confirmed = window.confirm(
    `「${entity.title}」を削除しますか？\n\nこの操作は取り消せません。`
  );

  if (!confirmed) {
    return;
  }

  setLoading(triggerButton, true, "削除中...");
  setSyncStatus("削除中...");

  try {
    const { error } = await supabaseClient.from(table).delete().eq("id", id);
    if (error) throw error;

    if (type === "video" && currentDetailVideoId === id) {
      elements.videoDetailModal.close();
      currentDetailVideoId = null;
    }

    await loadAllData({ silent: true });
    showToast(`${labelMap[type]}を削除しました`);
  } catch (error) {
    console.error(error);
    const message = getErrorMessage(error);
    showToast(`削除できませんでした：${message}`, "error");
    setSyncStatus("削除エラー", "error");
  } finally {
    setLoading(triggerButton, false);
  }
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

function renderIdeaDetail(idea) {
  elements.ideaDetailTitle.textContent = idea.title;
  elements.ideaDetailBody.innerHTML = `
    <div class="detail-summary">
      <div class="detail-field"><span>ステータス</span><strong>${escapeHtml(idea.status)}</strong></div>
      <div class="detail-field"><span>作成日</span><strong>${formatDate(idea.createdAt?.slice(0,10))}</strong></div>
      <div class="detail-field"><span>更新日</span><strong>${formatDate((idea.updatedAt || idea.createdAt)?.slice(0,10))}</strong></div>
    </div>
    <section class="detail-section">
      <h4>メモ</h4>
      <p>${idea.note ? escapeHtml(idea.note) : "メモはありません"}</p>
    </section>
  `;
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
    ${!goal.achieved ? `
      <section class="detail-section">
        <button type="button" class="secondary-btn" data-achieve-goal="${goal.id}">達成済みにする</button>
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
    .on("postgres_changes", { event: "*", schema: "public", table: "goals" }, scheduleRealtimeRefresh)
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

  data = { videos: [], ideas: [], goals: [] };
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

    const ideaCard = event.target.closest("[data-idea-card-id]");
    if (ideaCard && !event.target.closest("button, a, select, input, textarea, label")) {
      event.preventDefault();
      openIdeaDetail(ideaCard.dataset.ideaCardId);
      return;
    }

    const goalCard = event.target.closest("[data-goal-card-id]");
    if (goalCard && !event.target.closest("button, a, select, input, textarea, label")) {
      event.preventDefault();
      openGoalDetail(goalCard.dataset.goalCardId);
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

    const ideaSelect = event.target.closest("[data-idea-status-id]");
    if (ideaSelect) {
      moveIdea(ideaSelect.dataset.ideaStatusId, ideaSelect.value, ideaSelect);
    }
  });

  document.getElementById("openQuickAdd").addEventListener("click", () => elements.quickModal.showModal());
  document.getElementById("mobileQuickAdd").addEventListener("click", () => elements.quickModal.showModal());
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

  document.querySelectorAll(".filter-btn").forEach(button => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".filter-btn").forEach(item => item.classList.remove("active"));
      button.classList.add("active");
      activeVideoFilter = button.dataset.filter;
      renderVideos();
    });
  });

  [elements.quickModal, elements.formModal, elements.videoDetailModal, elements.ideaDetailModal, elements.goalDetailModal].forEach(dialog => {
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
