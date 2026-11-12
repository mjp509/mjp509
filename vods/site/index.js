(async () => {
  const vods = await loadVods();
  const grid = document.getElementById("grid");
  const q = document.getElementById("q");
  const gameSel = document.getElementById("game");
  const count = document.getElementById("count");

  const games = [...new Set(vods.flatMap(v => [v.game, ...(v.chapters || []).map(c => c.game)]).filter(Boolean))].sort();
  for (const g of games) gameSel.add(new Option(g, g));

  function render() {
    const term = q.value.trim().toLowerCase();
    const game = gameSel.value;
    const list = vods.filter(v =>
      (!term || v.title.toLowerCase().includes(term)) &&
      (!game || v.game === game || (v.chapters || []).some(c => c.game === game)));

    count.textContent = `${list.length} stream${list.length === 1 ? "" : "s"}`;
    grid.innerHTML = list.length ? list.map(v => `
      <a class="card" href="vod.html?id=${encodeURIComponent(v.id)}">
        <div class="thumb">
          <img loading="lazy" src="https://i.ytimg.com/vi/${esc(v.youtube)}/hqdefault.jpg" alt="">
          <span class="badge">${fmtTime(v.duration)}</span>
        </div>
        <div class="info">
          <h3>${esc(v.title)}</h3>
          <div class="meta">${fmtDate(v.date)}${v.game ? " · " + esc(v.game) : ""}</div>
        </div>
      </a>`).join("")
      : `<p class="empty">${vods.length ? "No streams match." : "No VODs yet."}</p>`;
  }

  q.addEventListener("input", render);
  gameSel.addEventListener("change", render);
  render();
})();
