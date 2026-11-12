const grid = document.getElementById("grid");
grid.innerHTML = Array.from({ length: 8 }, () => `
  <div class="card skeleton">
    <div class="thumb shimmer"></div>
    <div class="info"><div class="sk-line shimmer"></div><div class="sk-line short shimmer"></div></div>
  </div>`).join("");

const fmtViews = n => new Intl.NumberFormat(undefined, { notation: "compact" }).format(n) + " views";
const views = v => (v.yt_views || 0) + (v.twitch_views || 0);

(async () => {
  const vods = await loadVods();
  const q = document.getElementById("q");
  const gameSel = document.getElementById("game");
  const count = document.getElementById("count");
  const sortBtns = document.querySelectorAll("#sort button");
  let sort = "recent";

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

    count.textContent = `${list.length} stream${list.length === 1 ? "" : "s"}`;
    grid.innerHTML = list.length ? list.map(v => `
      <a class="card" href="v/${encodeURIComponent(v.id)}/">
        <div class="thumb shimmer">
          <img loading="lazy" src="https://i.ytimg.com/vi/${esc(v.youtube)}/hqdefault.jpg" alt=""
            onload="this.classList.add('loaded');this.parentNode.classList.remove('shimmer')"
            onerror="this.parentNode.classList.remove('shimmer')">
          <span class="badge">${fmtTime(v.duration)}</span>
        </div>
        <div class="info">
          <h3>${esc(v.title)}</h3>
          <div class="meta">${[fmtDate(v.date), views(v) ? fmtViews(views(v)) : "", esc(v.game || "")].filter(Boolean).join(" · ")}</div>
        </div>
      </a>`).join("")
      : `<p class="empty">${vods.length ? "No streams match." : "No VODs yet."}</p>`;
  }

  sortBtns.forEach(b => b.addEventListener("click", () => {
    sort = b.dataset.sort;
    sortBtns.forEach(x => x.classList.toggle("active", x === b));
    render();
  }));
  q.addEventListener("input", render);
  gameSel.addEventListener("change", render);
  render();
})();
