const grid = document.getElementById("grid");
grid.innerHTML = Array.from({ length: 8 }, () => `
  <div class="card skeleton">
    <div class="thumb shimmer"></div>
    <div class="info"><div class="sk-line shimmer"></div><div class="sk-line short shimmer"></div></div>
  </div>`).join("");

const fmtViews = n => new Intl.NumberFormat(undefined, { notation: "compact" }).format(n) + " views";
const views = v => (v.yt_views || 0) + (v.twitch_views || 0);

const progressBar = id => {
  const p = cwAll()[id];
  return p ? `<div class="progress"><div style="width:${Math.min(100, (p.t / p.d) * 100)}%"></div></div>` : "";
};

function renderContinue(vods) {
  const all = cwAll(), byId = Object.fromEntries(vods.map(v => [v.id, v]));
  const list = Object.entries(all).filter(([id]) => byId[id]).sort((a, b) => b[1].at - a[1].at).slice(0, 8);
  const section = document.getElementById("continue");
  section.hidden = !list.length;
  document.getElementById("continue-row").innerHTML = list.map(([id, p]) => { const v = byId[id]; return `
    <a class="clip-card cw" href="v/${encodeURIComponent(id)}/">
      <div class="thumb"><img loading="lazy" src="https://i.ytimg.com/vi/${esc(v.youtube)}/hqdefault.jpg" alt="" onload="this.classList.add('loaded')">
        <button class="cw-x" type="button" data-id="${esc(id)}" aria-label="Remove">✕</button>
        <span class="badge">${fmtTime(p.d - p.t)} left</span>${progressBar(id)}</div>
      <div class="info"><h3>${esc(v.title)}</h3><div class="meta">${fmtDate(v.date)}</div></div>
    </a>`; }).join("");
}

document.getElementById("continue-row").addEventListener("click", e => {
  const x = e.target.closest(".cw-x"); if (!x) return;
  e.preventDefault();
  const all = cwAll(); delete all[x.dataset.id]; cwSave(all);
  loadVods().then(renderContinue);
});

(async () => {
  const vods = await loadVods();
  renderContinue(vods);
  const q = document.getElementById("q");
  const gameSel = document.getElementById("game");
  const count = document.getElementById("count");
  const sortBtns = document.querySelectorAll("#sort button");
  let sort = "recent", shown = 12;
  const more = document.getElementById("more");

  const games = [...new Set(vods.flatMap(v => [v.game, ...(v.chapters || []).map(c => c.game)]).filter(Boolean))].sort();
  for (const g of games) gameSel.add(new Option(g, g));

  function render() {
    const term = q.value.trim().toLowerCase();
    const game = gameSel.value;
    const list = vods.filter(v =>
      (!term || v.title.toLowerCase().includes(term)) &&
      (!game || v.game === game || (v.chapters || []).some(c => c.game === game)));
    if (sort === "popular") list.sort((a, b) => views(b) - views(a) || (b.messages || 0) - (a.messages || 0));
    else list.sort((a, b) => (b.date || "").localeCompare(a.date || ""));

    more.hidden = list.length <= shown;
    const total = list.length;
    list.splice(shown);
    count.textContent = `${total} stream${total === 1 ? "" : "s"}`;
    grid.innerHTML = list.length ? list.map(v => `
      <a class="card" href="v/${encodeURIComponent(v.id)}/">
        <div class="thumb shimmer">
          <img loading="lazy" src="https://i.ytimg.com/vi/${esc(v.youtube)}/hqdefault.jpg" alt=""
            onload="this.classList.add('loaded');this.parentNode.classList.remove('shimmer')"
            onerror="this.parentNode.classList.remove('shimmer')">
          <span class="badge">${fmtTime(v.duration)}</span>${progressBar(v.id)}
        </div>
        <div class="info">
          <h3>${esc(v.title)}</h3>
          <div class="meta">${[fmtDate(v.date), views(v) ? fmtViews(views(v)) : "", esc(v.game || "")].filter(Boolean).join(" · ")}</div>
        </div>
      </a>`).join("")
      : vods.length ? `<p class="empty">No streams match.</p>`
      : `<div class="empty-state"><div class="empty-icon">📺</div><h2>No VODs yet</h2>
          <p>Past streams show up here after they end.</p>
          <a class="btn" href="https://twitch.tv/itsmotch" target="_blank" rel="noopener">Follow on Twitch</a></div>`;
  }

  sortBtns.forEach(b => b.addEventListener("click", () => {
    sort = b.dataset.sort;
    sortBtns.forEach(x => x.classList.toggle("active", x === b));
    render();
  }));
  const reset = () => { shown = 12; render(); };
  q.addEventListener("input", reset);
  gameSel.addEventListener("change", reset);
  more.addEventListener("click", () => { shown += 12; render(); });
  render();
})();
