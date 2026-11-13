(async () => {
  let data;
  try { const r = await fetch("data/clips.json", { cache: "no-cache" }); if (r.ok) data = await r.json(); } catch {}
  if (!data || !data.clips || !data.clips.length) return;
  const section = document.getElementById("clips"), modal = document.getElementById("clip-modal"), frame = document.getElementById("clip-frame");
  document.getElementById("clips-title").textContent = data.period === "month" ? "Top clips this month" : "Top clips";
  const views = n => new Intl.NumberFormat(undefined, { notation: "compact" }).format(n) + " views";
  document.getElementById("clip-row").innerHTML = data.clips.map(c => `
    <button class="clip-card" data-id="${esc(c.id)}" type="button">
      <div class="thumb"><img loading="lazy" src="${esc(c.thumbnail_url)}" alt=""
        onload="this.classList.add('loaded')"><span class="badge">${fmtTime(c.duration || 0)}</span></div>
      <div class="info"><h3>${esc(c.title)}</h3>
        <div class="meta">${views(c.view_count || 0)} · ${esc(c.creator_name || "")}</div></div>
    </button>`).join("");
  section.hidden = false;

  const close = () => { modal.hidden = true; frame.innerHTML = ""; };
  section.addEventListener("click", e => {
    const b = e.target.closest(".clip-card"); if (!b) return;
    frame.innerHTML = `<iframe allowfullscreen allow="autoplay; fullscreen"
      src="https://clips.twitch.tv/embed?clip=${encodeURIComponent(b.dataset.id)}&parent=${encodeURIComponent(location.hostname)}&autoplay=true"></iframe>`;
    modal.hidden = false;
  });
  document.getElementById("clip-close").addEventListener("click", close);
  modal.addEventListener("click", e => { if (e.target === modal) close(); });
  addEventListener("keydown", e => { if (e.key === "Escape" && !modal.hidden) close(); });
})();
