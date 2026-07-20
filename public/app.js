const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const state = {
  user: null,
  range: "today",
};

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
  el.textContent = msg;
  el.classList.remove("hidden");
}

function clearAuthError() {
  $("#auth-error").classList.add("hidden");
}

function switchTab(tab) {
  const isLogin = tab === "login";
  $("#login-form").classList.toggle("hidden", !isLogin);
  $("#signup-form").classList.toggle("hidden", isLogin);
  $("#tab-login").classList.toggle("bg-brand-600", isLogin);
  $("#tab-login").classList.toggle("text-white", isLogin);
  $("#tab-login").classList.toggle("text-slate-300", !isLogin);
  $("#tab-signup").classList.toggle("bg-brand-600", !isLogin);
  $("#tab-signup").classList.toggle("text-white", !isLogin);
  $("#tab-signup").classList.toggle("text-slate-300", isLogin);
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

function paintRangeButtons() {
  $$(".range-btn").forEach((btn) => {
    const active = btn.dataset.range === state.range;
    btn.classList.toggle("bg-brand-600", active);
    btn.classList.toggle("text-white", active);
    btn.classList.toggle("text-slate-400", !active);
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
      '<p class="text-sm text-slate-600">No data yet.</p>';
    return;
  }
  const max = items[0].total_seconds || 1;
  items.slice(0, 8).forEach((item) => {
    const pct = Math.max(2, Math.round((item.total_seconds / max) * 100));
    const row = document.createElement("div");
    row.innerHTML = `
      <div class="flex justify-between text-sm mb-1">
        <span class="text-slate-300 truncate pr-2">${escapeHtml(item.name)}</span>
        <span class="text-slate-500 shrink-0">${escapeHtml(item.text)}</span>
      </div>
      <div class="h-2 bg-slate-800 rounded-full overflow-hidden">
        <div class="h-full bg-brand-500 rounded-full" style="width:${pct}%"></div>
      </div>`;
    container.appendChild(row);
  });
}

function renderChart(days) {
  const chart = $("#chart");
  chart.innerHTML = "";
  const max = Math.max(1, ...days.map((d) => d.total_seconds));
  days.forEach((d) => {
    const pct = Math.round((d.total_seconds / max) * 100);
    const col = document.createElement("div");
    col.className = "flex-1 flex flex-col items-center justify-end gap-1 group";
    const label = new Date(d.date + "T00:00:00").toLocaleDateString(undefined, {
      weekday: days.length <= 7 ? "short" : undefined,
      day: days.length > 7 ? "numeric" : undefined,
    });
    col.innerHTML = `
      <div class="w-full flex items-end justify-center h-32">
        <div class="bar w-full max-w-[36px] rounded-t bg-brand-500/80 group-hover:bg-brand-400"
             style="height:${pct}%" title="${escapeHtml(d.text)}"></div>
      </div>
      <span class="text-[10px] text-slate-500">${escapeHtml(label)}</span>`;
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
