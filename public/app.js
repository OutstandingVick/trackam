const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const state = {
  user: null,
  range: "today",
};

// Fun rotating palette (from the brand colours) for bars & chart columns.
const PALETTE = ["#FF1097", "#9800FF", "#9CE404", "#E8642F", "#5900C0", "#FECDEC"];
const colorAt = (i) => PALETTE[i % PALETTE.length];

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

/* ---------------- Auth view ---------------- */

function showAuthError(msg) {
  const el = $("#auth-error");
  el.textContent = "⚠️ " + msg;
  el.classList.remove("hidden");
}

function clearAuthError() {
  $("#auth-error").classList.add("hidden");
}

function switchTab(tab) {
  const isLogin = tab === "login";
  $("#login-form").classList.toggle("hidden", !isLogin);
  $("#signup-form").classList.toggle("hidden", isLogin);

  const login = $("#tab-login");
  const signup = $("#tab-signup");
  // active tab = lime with hard shadow; inactive = white
  login.classList.toggle("bg-lime", isLogin);
  login.classList.toggle("shadow-hardsm", isLogin);
  login.classList.toggle("bg-white", !isLogin);
  signup.classList.toggle("bg-lime", !isLogin);
  signup.classList.toggle("shadow-hardsm", !isLogin);
  signup.classList.toggle("bg-white", isLogin);
  clearAuthError();
}

$("#tab-login").addEventListener("click", () => switchTab("login"));
$("#tab-signup").addEventListener("click", () => switchTab("signup"));

$("#login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  clearAuthError();
  const fd = new FormData(e.target);
  try {
    await api("/api/account/login", {
      method: "POST",
      body: JSON.stringify({
        login: fd.get("login"),
        password: fd.get("password"),
      }),
    });
    await boot();
  } catch (err) {
    showAuthError(err.message);
  }
});

$("#signup-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  clearAuthError();
  const fd = new FormData(e.target);
  try {
    await api("/api/account/signup", {
      method: "POST",
      body: JSON.stringify({
        email: fd.get("email"),
        username: fd.get("username"),
        password: fd.get("password"),
      }),
    });
    await boot();
  } catch (err) {
    showAuthError(err.message);
  }
});

$("#logout-btn").addEventListener("click", async () => {
  await api("/api/account/logout", { method: "POST" });
  window.location.reload();
});

/* ---------------- Dashboard ---------------- */

function setView(view) {
  $("#auth-view").classList.toggle("hidden", view !== "auth");
  $("#dashboard-view").classList.toggle("hidden", view !== "dashboard");
}

const RANGE_COLORS = { today: "bg-pink text-white", week: "bg-violet text-white", month: "bg-orange text-white" };

function paintRangeButtons() {
  $$(".range-btn").forEach((btn) => {
    const active = btn.dataset.range === state.range;
    // reset
    btn.classList.remove(
      "bg-pink", "bg-violet", "bg-orange", "text-white", "bg-white"
    );
    if (active) {
      RANGE_COLORS[btn.dataset.range].split(" ").forEach((c) => btn.classList.add(c));
    } else {
      btn.classList.add("bg-white");
    }
  });
}

$$(".range-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    state.range = btn.dataset.range;
    paintRangeButtons();
    loadStats();
  });
});

function renderBreakdown(containerId, items) {
  const container = $(containerId);
  container.innerHTML = "";
  if (!items || items.length === 0) {
    container.innerHTML =
      '<p class="text-sm font-medium text-ink/40">Nothing here yet — go write some code! 😎</p>';
    return;
  }
  const max = items[0].total_seconds || 1;
  items.slice(0, 8).forEach((item, i) => {
    const pct = Math.max(4, Math.round((item.total_seconds / max) * 100));
    const row = document.createElement("div");
    row.innerHTML = `
      <div class="flex justify-between text-sm mb-1.5">
        <span class="font-bold truncate pr-2">${escapeHtml(item.name)}</span>
        <span class="font-semibold text-ink/60 shrink-0">${escapeHtml(item.text)}</span>
      </div>
      <div class="h-3.5 bg-grey border-[2px] border-ink rounded-full overflow-hidden">
        <div class="h-full rounded-full border-r-[2px] border-ink" style="width:${pct}%;background:${colorAt(i)}"></div>
      </div>`;
    container.appendChild(row);
  });
}

function renderChart(days) {
  const chart = $("#chart");
  chart.innerHTML = "";
  const max = Math.max(1, ...days.map((d) => d.total_seconds));
  days.forEach((d, i) => {
    const pct = d.total_seconds > 0 ? Math.max(6, Math.round((d.total_seconds / max) * 100)) : 0;
    const col = document.createElement("div");
    col.className = "flex-1 flex flex-col items-center justify-end gap-1.5 group";
    const label = new Date(d.date + "T00:00:00").toLocaleDateString(undefined, {
      weekday: days.length <= 7 ? "short" : undefined,
      day: days.length > 7 ? "numeric" : undefined,
    });
    col.innerHTML = `
      <div class="w-full flex items-end justify-center h-32">
        <div class="bar w-full max-w-[38px] rounded-t-lg border-[2px] border-ink group-hover:brightness-105"
             style="height:${pct}%;background:${colorAt(i)}" title="${escapeHtml(d.text)}"></div>
      </div>
      <span class="text-[10px] font-bold text-ink/50">${escapeHtml(label)}</span>`;
    chart.appendChild(col);
  });
}

async function loadStats() {
  try {
    const data = await api(`/api/stats?range=${state.range}`);
    $("#stat-total").textContent = data.grand_total.text;
    $("#stat-average").textContent = data.daily_average.text;
    $("#stat-heartbeats").textContent = data.heartbeat_count.toLocaleString();
    renderChart(data.days);
    renderBreakdown("#projects-list", data.projects);
    renderBreakdown("#languages-list", data.languages);
    renderBreakdown("#editors-list", data.editors);
    renderBreakdown("#os-list", data.operating_systems);
    $("#chart-card").classList.toggle("hidden", state.range === "today");
  } catch (err) {
    console.error(err);
  }
}

async function loadAccount() {
  const me = await api("/api/account/me");
  state.user = me;
  $("#nav-username").textContent = "@" + me.username;
  $("#greet-name").textContent = me.username;
  const origin = window.location.origin;
  $("#config-snippet").textContent =
    `[settings]\napi_url = ${origin}/api/v1\napi_key = ${me.api_key}`;
}

$("#copy-config").addEventListener("click", async () => {
  const text = $("#config-snippet").textContent;
  await navigator.clipboard.writeText(text);
  const fb = $("#copy-feedback");
  fb.classList.remove("hidden");
  setTimeout(() => fb.classList.add("hidden"), 1500);
});

$("#regenerate-key").addEventListener("click", async () => {
  if (!confirm("Regenerate your API key? You'll need to update your editor config.")) {
    return;
  }
  const data = await api("/api/account/regenerate-key", { method: "POST" });
  state.user.api_key = data.api_key;
  const origin = window.location.origin;
  $("#config-snippet").textContent =
    `[settings]\napi_url = ${origin}/api/v1\napi_key = ${data.api_key}`;
});

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[c]);
}

/* ---------------- Boot ---------------- */

async function boot() {
  try {
    await loadAccount();
    setView("dashboard");
    paintRangeButtons();
    await loadStats();
  } catch {
    setView("auth");
    switchTab("login");
  }
}

boot();
