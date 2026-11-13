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

function cwAll() {
  try { return JSON.parse(localStorage.getItem("cw") || "{}"); } catch { return {}; }
}
function cwSave(all) {
  try { localStorage.setItem("cw", JSON.stringify(all)); } catch {}
}

async function loadVods() {
  const r = await fetch("data/vods.json", { cache: "no-cache" });
  return r.ok ? r.json() : [];
}


function readable(color) {
  const m = /^#?([0-9a-f]{6})$/i.exec(color || "");
  if (!m) return color;
  let [r, g, b] = [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16));
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  if (lum >= 0.5) return "#" + m[1];
  const t = Math.min(1, (0.5 - lum) * 1.6 + 0.25);
  [r, g, b] = [r, g, b].map(c => Math.round(c + (255 - c) * t));
  return `rgb(${r},${g},${b})`;
}

function emoteLink(src, id, inner) {
  if (src !== "7" || !id) return inner;
  return `<a class="emote-link" href="https://7tv.app/emotes/${encodeURIComponent(id)}" target="_blank" rel="noopener">${inner}</a>`;
}
