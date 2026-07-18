
const SUPABASE_URL = "https://jyxrrnfhypqaecfojsle.supabase.co";

const SUPABASE_KEY = "あなたのPublishable Key";const STORAGE_KEY = "boatChannelManagerData";

const defaultData = {
  subscribers: 128,
  monthlyPosts: 3,
  videos: [],
  ideas: [],
  goals: [
    {
      id: crypto.randomUUID(),
      title: "登録者150人",
      current: 128,
      target: 150,
      deadline: "2026-08-31",
      achieved: false,
      achievedDate: ""
    }
  ]
};

let data = loadData();
let activeVideoFilter = "all";

function loadData() {
  const saved = localStorage.getItem(STORAGE_KEY);
  return saved ? JSON.parse(saved) : defaultData;
}

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  renderAll();
}

function formatDate(date) {
  if (!date) return "未設定";
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "short",
    day: "numeric"
  }).format(new Date(date));
}

function setupDate() {
  const now = new Date();
  document.getElementById("todayLabel").textContent =
    new Intl.DateTimeFormat("ja-JP", {
      year: "numeric",
      month: "long",
      day: "numeric",
      weekday: "short"
    }).format(now);
}

function switchPage(pageId) {
  document.querySelectorAll(".page").forEach(page => page.classList.remove("active"));
  document.querySelectorAll("[data-page]").forEach(btn => btn.classList.remove("active"));

  document.getElementById(pageId).classList.add("active");
  document.querySelectorAll(`[data-page="${pageId}"]`).forEach(btn => btn.classList.add("active"));

  const titles = {
    dashboard: "ダッシュボード",
    videos: "動画管理",
    ideas: "企画管理",
    goals: "目標・実績"
  };
  document.getElementById("pageTitle").textContent = titles[pageId];
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderDashboard() {
  document.getElementById("monthlyPosts").textContent = data.monthlyPosts;

  const waiting = data.videos.filter(v => ["編集待ち", "編集中", "確認待ち"].includes(v.status));
  const ideaStock = data.ideas.filter(i => !["実行済み", "ボツ"].includes(i.status));
  document.getElementById("waitingCount").textContent = waiting.length;
  document.getElementById("ideaCount").textContent = ideaStock.length;

  const activeGoal = data.goals.find(g => !g.achieved);
  if (activeGoal) {
    const percent = Math.min(100, Math.round((Number(activeGoal.current) / Number(activeGoal.target)) * 100));
    document.getElementById("currentGoalTitle").textContent = activeGoal.title;
    document.getElementById("currentGoalMeta").textContent =
      `現在${activeGoal.current} / 目標${activeGoal.target}`;
    document.getElementById("goalPercent").textContent = `${percent}%`;
    document.getElementById("goalProgress").style.width = `${percent}%`;
  }

  const todoPreview = document.getElementById("todoPreview");
  if (!waiting.length) {
    todoPreview.className = "stack-list empty-state";
    todoPreview.textContent = "編集待ちの動画はありません";
  } else {
    todoPreview.className = "stack-list";
    todoPreview.innerHTML = waiting.slice(0, 4).map(v => `
      <div class="stack-item">
        <strong>${escapeHtml(v.title)}</strong>
        <span>${escapeHtml(v.status)}・担当 ${escapeHtml(v.owner || "未設定")}</span>
      </div>
    `).join("");
  }

  const posted = data.videos.filter(v => v.status === "投稿済み");
  const recent = document.getElementById("recentVideos");
  if (!posted.length) {
    recent.className = "table-wrap empty-state";
    recent.textContent = "投稿済み動画はまだありません";
  } else {
    recent.className = "table-wrap";
    recent.innerHTML = `
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
          ${posted.slice(0, 5).map(v => `
            <tr>
              <td>${escapeHtml(v.title)}</td>
              <td>${escapeHtml(v.type)}</td>
              <td>${formatDate(v.postDate)}</td>
              <td>${Number(v.views24 || 0).toLocaleString()}回</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  }
}

function renderVideos() {
  const list = document.getElementById("videoList");
  const videos = activeVideoFilter === "all"
    ? data.videos
    : data.videos.filter(v => v.status === activeVideoFilter);

  if (!videos.length) {
    list.innerHTML = `<div class="card empty-state">該当する動画はありません</div>`;
    return;
  }

  list.innerHTML = videos.map(v => `
    <article class="item-card">
      <div>
        <span class="status">${escapeHtml(v.status)}</span>
        <h4>${escapeHtml(v.title)}</h4>
        <div class="meta">
          <span>${escapeHtml(v.type)}</span>
          <span>担当：${escapeHtml(v.owner || "未設定")}</span>
          <span>投稿日：${formatDate(v.postDate)}</span>
          ${v.views24 ? `<span>24時間：${Number(v.views24).toLocaleString()}回</span>` : ""}
        </div>
      </div>
      <button class="delete-btn" onclick="deleteItem('video', '${v.id}')">削除</button>
    </article>
  `).join("");
}

function renderIdeas() {
  const statuses = ["アイデア", "検討中", "実行予定", "実行済み"];
  const board = document.getElementById("ideaBoard");

  board.innerHTML = statuses.map(status => {
    const items = data.ideas.filter(i => i.status === status);
    return `
      <section class="kanban-column">
        <h4>${status} <span>(${items.length})</span></h4>
        ${items.map(i => `
          <article class="idea-card">
            <strong>${escapeHtml(i.title)}</strong>
            <p>${escapeHtml(i.note || "メモなし")}</p>
            <select onchange="moveIdea('${i.id}', this.value)">
              ${statuses.map(s => `<option ${s === i.status ? "selected" : ""}>${s}</option>`).join("")}
            </select>
            <button class="delete-btn" onclick="deleteItem('idea', '${i.id}')">削除</button>
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

  list.innerHTML = data.goals.map(g => {
    const percent = Math.min(100, Math.round((Number(g.current) / Number(g.target)) * 100));
    return `
      <article class="item-card">
        <div>
          <span class="status">${g.achieved ? "達成済み" : "進行中"}</span>
          <h4>${escapeHtml(g.title)}</h4>
          <div class="meta">
            <span>現在 ${g.current}</span>
            <span>目標 ${g.target}</span>
            <span>期限 ${formatDate(g.deadline)}</span>
            ${g.achievedDate ? `<span>達成日 ${formatDate(g.achievedDate)}</span>` : ""}
          </div>
          <div class="progress"><span style="width:${percent}%"></span></div>
        </div>
        <div>
          ${!g.achieved ? `<button class="secondary-btn" onclick="achieveGoal('${g.id}')">達成</button>` : ""}
          <button class="delete-btn" onclick="deleteItem('goal', '${g.id}')">削除</button>
        </div>
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

function openForm(type) {
  document.getElementById("quickModal").close();
  const modal = document.getElementById("formModal");
  const title = document.getElementById("formTitle");
  const form = document.getElementById("dynamicForm");

  const forms = {
    video: {
      title: "動画を追加",
      html: `
        <div class="form-grid">
          <label>動画タイトル<input name="title" required></label>
          <label>動画形式
            <select name="type">
              <option>Shorts</option>
              <option>横動画</option>
            </select>
          </label>
          <label>ステータス
            <select name="status">
              <option>企画中</option>
              <option>編集待ち</option>
              <option>編集中</option>
              <option>確認待ち</option>
              <option>投稿済み</option>
            </select>
          </label>
          <label>担当者<input name="owner" placeholder="自分 / 相方"></label>
          <label>投稿日<input type="date" name="postDate"></label>
          <label>24時間後の再生数<input type="number" name="views24" min="0"></label>
        </div>
        <button class="form-submit">追加する</button>
      `
    },
    idea: {
      title: "企画を追加",
      html: `
        <div class="form-grid">
          <label>企画名<input name="title" required></label>
          <label>ステータス
            <select name="status">
              <option>アイデア</option>
              <option>検討中</option>
              <option>実行予定</option>
              <option>実行済み</option>
            </select>
          </label>
          <label>メモ<textarea name="note"></textarea></label>
        </div>
        <button class="form-submit">追加する</button>
      `
    },
    goal: {
      title: "目標を追加",
      html: `
        <div class="form-grid">
          <label>目標名<input name="title" required></label>
          <label>現在の数値<input type="number" name="current" value="0" required></label>
          <label>目標数値<input type="number" name="target" value="100" required></label>
          <label>期限<input type="date" name="deadline"></label>
        </div>
        <button class="form-submit">追加する</button>
      `
    }  };

  title.textContent = forms[type].title;
  form.innerHTML = forms[type].html;
  form.dataset.type = type;
  modal.showModal();
}

function handleSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const values = Object.fromEntries(new FormData(form).entries());
  const type = form.dataset.type;

  if (type === "video") {
    data.videos.unshift({
      id: crypto.randomUUID(),
      title: values.title,
      type: values.type,
      status: values.status,
      owner: values.owner,
      postDate: values.postDate,
      views24: Number(values.views24 || 0)
    });
  }

  if (type === "idea") {
    data.ideas.unshift({
      id: crypto.randomUUID(),
      title: values.title,
      status: values.status,
      note: values.note
    });
  }

  if (type === "goal") {
    data.goals.unshift({
      id: crypto.randomUUID(),
      title: values.title,
      current: Number(values.current),
      target: Number(values.target),
      deadline: values.deadline,
      achieved: false,
      achievedDate: ""
    });
  }

  document.getElementById("formModal").close();
  saveData();
}

function deleteItem(type, id) {
  if (type === "video") data.videos = data.videos.filter(v => v.id !== id);
  if (type === "idea") data.ideas = data.ideas.filter(i => i.id !== id);
  if (type === "goal") data.goals = data.goals.filter(g => g.id !== id);
  saveData();
}

function moveIdea(id, status) {
  const idea = data.ideas.find(i => i.id === id);
  if (idea) idea.status = status;
  saveData();
}

function achieveGoal(id) {
  const goal = data.goals.find(g => g.id === id);
  if (!goal) return;
  goal.achieved = true;
  goal.achievedDate = new Date().toISOString().split("T")[0];
  goal.current = goal.target;
  saveData();
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

document.querySelectorAll("[data-page]").forEach(button => {
  button.addEventListener("click", () => switchPage(button.dataset.page));
});

document.querySelectorAll("[data-open-modal]").forEach(button => {
  button.addEventListener("click", () => openForm(button.dataset.openModal));
});

document.querySelectorAll("[data-close]").forEach(button => {
  button.addEventListener("click", () => button.closest("dialog").close());
});

document.getElementById("openQuickAdd").addEventListener("click", () => {
  document.getElementById("quickModal").showModal();
});

document.getElementById("mobileQuickAdd").addEventListener("click", () => {
  document.getElementById("quickModal").showModal();
});

document.getElementById("dynamicForm").addEventListener("submit", handleSubmit);

document.querySelectorAll(".filter-btn").forEach(button => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".filter-btn").forEach(btn => btn.classList.remove("active"));
    button.classList.add("active");
    activeVideoFilter = button.dataset.filter;
    renderVideos();
  });
});

setupDate();
renderAll();

window.deleteItem = deleteItem;
window.moveIdea = moveIdea;
window.achieveGoal = achieveGoal;
