const MAX_LINES = 200;
const EMOTE = {
  t: id => `https://static-cdn.jtvnw.net/emoticons/v2/${id}/default/dark/1.0`,
  "7": id => `https://cdn.7tv.app/emote/${id}/1x.webp`,
};
const FALLBACK_COLORS = ["#ff4a4a", "#4a9bff", "#3ad07a", "#ffb02e", "#c46bff", "#ff6bd1", "#2ee6d6", "#ff8a3d"];

let player, chat = [], idx = 0, lastT = 0, offset = 0, duration = 0, actHead;
const MOMENT_LABEL = { funny: "😂", hype: "🔥", shock: "😳", sad: "😭", spike: "📈" };

function seekChat(t) { if (player && player.seekTo) player.seekTo(Math.max(0, t - offset), true); }

function drawActivity(moments) {
  if (!chat.length || !duration) return;
  const box = document.getElementById("activity"), svg = document.getElementById("act-svg"), tipEl = document.getElementById("act-tip");
  const bins = Math.min(240, Math.max(30, Math.round(duration / 60)));
  const size = duration / bins, counts = new Array(bins).fill(0);
  for (const c of chat) counts[Math.min(bins - 1, Math.floor(c[0] / size))]++;
  const max = Math.max(...counts, 1);
  const pts = counts.map((c, i) => `${((i + 0.5) / bins) * 1000},${100 - (c / max) * 96}`);
  svg.setAttribute("viewBox", "0 0 1000 100");
  svg.innerHTML = `<path class="area" d="M0,100 L${pts.join(" L")} L1000,100 Z"/>` +
    moments.map(m => `<line class="mark" x1="${(m.t / duration) * 1000}" x2="${(m.t / duration) * 1000}" y1="0" y2="100"/>`).join("");
  box.hidden = false;
  actHead = document.getElementById("act-head");
  const at = e => { const r = box.getBoundingClientRect(); return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)); };
  box.addEventListener("pointermove", e => {
    const f = at(e), i = Math.min(bins - 1, Math.floor(f * bins));
    tipEl.hidden = false; tipEl.style.left = f * 100 + "%";
    tipEl.textContent = `${fmtTime(f * duration)} · ${(counts[i] / (size / 60)).toFixed(1)} msgs/min`;
  });
  box.addEventListener("pointerleave", () => { tipEl.hidden = true; });
  box.addEventListener("click", e => seekChat(at(e) * duration));
}
const log = document.getElementById("log");
const status = document.getElementById("chat-status");

function colorFor(name, color) {
  if (color) return readable(color);
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) | 0;
  return FALLBACK_COLORS[Math.abs(h) % FALLBACK_COLORS.length];
}

function msgHtml([t, name, color, body]) {
  const parts = typeof body === "string" ? [body] : body;
  const text = parts.map(p => {
    if (!Array.isArray(p)) return esc(p);
    const [src, id, name = ""] = p.length === 1 ? ["t", p[0]] : p;
    const url = (EMOTE[src] || EMOTE.t)(encodeURIComponent(id));
    return emoteLink(src, id, `<img src="${url}" alt="${esc(name)}" title="${esc(name)}">`);
  }).join("");
  return `<div class="msg"><span class="ts">${fmtTime(t)}</span><span class="name" style="color:${esc(colorFor(name, color))}">${esc(name)}</span>: ${text}</div>`;
}

function firstAfter(t) {
  let lo = 0, hi = chat.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; chat[mid][0] <= t ? lo = mid + 1 : hi = mid; }
  return lo;
}

function tick() {
  if (!player || !player.getCurrentTime || !chat.length) return;
  const t = player.getCurrentTime() + offset;
  const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 60;

  if (t < lastT - 1 || t > lastT + 10) {
    idx = firstAfter(t);
    log.innerHTML = chat.slice(Math.max(0, idx - 50), idx).map(msgHtml).join("");
  } else {
    let html = "";
    while (idx < chat.length && chat[idx][0] <= t) html += msgHtml(chat[idx++]);
    if (html) log.insertAdjacentHTML("beforeend", html);
  }
  lastT = t;
  if (actHead && duration) actHead.style.left = Math.min(100, (t / duration) * 100) + "%";
  while (log.childElementCount > MAX_LINES) log.firstElementChild.remove();
  if (atBottom) log.scrollTop = log.scrollHeight;
}

const params = new URLSearchParams(location.search);
const vodId = document.body.dataset.vod || params.get("id");
const ready = new Promise(r => { window.onYouTubeIframeAPIReady = r; });

(async () => {
  const vod = (await loadVods()).find(v => v.id === vodId);
  if (!vod) {
    document.title = "VOD not found · itsmotch VODs";
    document.querySelector(".watch").outerHTML = `<div class="not-found"><div class="empty-state">
      <div class="empty-icon">🔍</div><h2>This VOD isn't available</h2>
      <p>It may have been removed, or the link is wrong.</p>
      <a class="btn" href="./">Browse all VODs</a></div></div>`;
    return;
  }
  offset = vod.offset || 0;
  document.title = `${vod.title} · itsmotch VODs`;
  document.getElementById("title").textContent = vod.title;
  document.getElementById("meta").textContent =
    [fmtDate(vod.date), vod.game, fmtTime(vod.duration)].filter(Boolean).join(" · ");

  const chapters = document.getElementById("chapters");
  if ((vod.chapters || []).length > 1) {
    chapters.innerHTML = vod.chapters.map(c =>
      `<button data-t="${c.t}">${fmtTime(c.t)} · ${esc(c.game)}</button>`).join("");
    chapters.addEventListener("click", e => {
      const b = e.target.closest("button");
      if (b) seekChat(+b.dataset.t);
    });
  }

  duration = vod.duration || 0;
  const momentsP = fetch("data/stats.json", { cache: "no-cache" })
    .then(r => r.ok ? r.json() : {}).then(s => (s.moments || {})[vod.id] || []).catch(() => []);
  momentsP.then(ms => {
    if (!ms.length) return;
    const top = ms.slice().sort((a, b) => b.x - a.x).slice(0, 6).sort((a, b) => a.t - b.t);
    document.getElementById("moment-list").innerHTML = top.map(m =>
      `<button data-t="${m.t}">${MOMENT_LABEL[m.tag] || "📈"} ${fmtTime(m.t)}</button>`).join("");
    document.getElementById("moments").hidden = false;
  });
  document.getElementById("moment-list").addEventListener("click", e => {
    const b = e.target.closest("button"); if (b) seekChat(+b.dataset.t);
  });

  fetch(`data/chat/${encodeURIComponent(vod.id)}.json`)
    .then(r => r.ok ? r.json() : [])
    .then(async c => {
      chat = c;
      log.classList.remove("loading");
      status.textContent = chat.length ? `${chat.length.toLocaleString()} messages` : "No chat saved";
      if (chat.length) duration = Math.max(duration, chat[chat.length - 1][0]);
      drawActivity(await momentsP);
    })
    .catch(() => { status.textContent = "Chat unavailable"; log.classList.remove("loading"); });

  const shareBtn = document.getElementById("share");
  const toast = msg => { const t = document.getElementById("toast"); t.textContent = msg; t.hidden = false;
    clearTimeout(toast.h); toast.h = setTimeout(() => (t.hidden = true), 2200); };
  shareBtn.addEventListener("click", async () => {
    const t = Math.floor(player && player.getCurrentTime ? player.getCurrentTime() : 0);
    const url = new URL(`v/${encodeURIComponent(vod.id)}/`, document.baseURI);
    if (t > 0) url.searchParams.set("t", t);
    const link = url.toString();
    try {
      if (navigator.share && matchMedia("(pointer: coarse)").matches) {
        await navigator.share({ title: vod.title, text: `${vod.title} @ ${fmtTime(t)}`, url: link });
      } else {
        await navigator.clipboard.writeText(link);
        toast(`Link copied · starts at ${fmtTime(t)}`);
      }
    } catch (e) {
      if (e && e.name !== "AbortError") prompt("Copy this link:", link);
    }
  });
  let ticks = 0;
  setInterval(() => {
    if (!player || !player.getCurrentTime) return;
    const t = player.getCurrentTime();
    shareBtn.textContent = `🔗 Share at ${fmtTime(t)}`;
    if (++ticks % 5 || (player.getPlayerState && player.getPlayerState() !== 1)) return;
    const all = cwAll(), len = Math.max(60, (vod.duration || 0) - offset);
    if (t > 30 && t < len - 120) all[vod.id] = { t: Math.floor(t), d: Math.floor(len), at: Date.now() };
    else if (t >= len - 120) delete all[vod.id];
    else return;
    cwSave(all);
  }, 1000);

  const saved = cwAll()[vod.id];
  const start = params.has("t") ? parseInt(params.get("t"), 10) || 0 : (saved ? saved.t : 0);
  if (!params.has("t") && saved) {
    const t = document.getElementById("toast");
    t.innerHTML = `Resumed at ${fmtTime(saved.t)} <button type="button" id="restart">Start over</button>`;
    t.classList.add("action"); t.hidden = false;
    const hide = setTimeout(() => (t.hidden = true), 7000);
    document.getElementById("restart").onclick = () => {
      clearTimeout(hide); t.hidden = true;
      const all = cwAll(); delete all[vod.id]; cwSave(all);
      if (player && player.seekTo) player.seekTo(0, true);
    };
  }
  await ready;
  player = new YT.Player("yt", {
    videoId: vod.youtube,
    playerVars: { start, rel: 0, modestbranding: 1, playsinline: 1 },
  });
  setInterval(tick, 250);
})();
