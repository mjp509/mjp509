function fmtTime(s) {
  s = Math.max(0, Math.floor(s));
  const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, sec = s % 60;
  const mm = h ? String(m).padStart(2, "0") : m;
  return (h ? h + ":" : "") + mm + ":" + String(sec).padStart(2, "0");
}

function fmtDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

async function loadVods() {
  const r = await fetch("data/vods.json", { cache: "no-cache" });
  return r.ok ? r.json() : [];
}

(async () => {
  let avatar = "https://unavatar.io/twitch/itsmotch";
  try {
    const r = await fetch("data/channel.json", { cache: "no-cache" });
    if (r.ok) avatar = (await r.json()).avatar || avatar;
  } catch {}
  const img = document.getElementById("avatar");
  if (img) { img.onerror = () => img.remove(); img.src = avatar; }
  const fav = document.getElementById("favicon");
  if (fav) fav.href = avatar;
})();
