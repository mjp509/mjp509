import json
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "site" / "data"
VODS = DATA / "vods.json"
PENDING = ROOT / "pending.json"


def get_json(url, headers=None, data=None):
    req = urllib.request.Request(url, data=data, headers={"User-Agent": "vod-site", **(headers or {})})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        host = urllib.parse.urlsplit(url).netloc
        body = e.read().decode("utf-8", "replace")[:300]
        sys.exit(f"{host} refused the request (HTTP {e.code}): {body}")


def load(path, default):
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else default


def save(path, obj):
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def youtube_id(value):
    value = value.strip()
    m = re.search(r"(?:v=|youtu\.be/|/embed/|/live/|/shorts/)([A-Za-z0-9_-]{11})", value)
    if m:
        return m.group(1)
    if re.fullmatch(r"[A-Za-z0-9_-]{11}", value):
        return value
    sys.exit(f"Could not find a YouTube video ID in: {value!r}")


def seventv_emotes(twitch_user_id, include_global=True):
    emotes = {}
    sources = ["https://7tv.io/v3/emote-sets/global"] if include_global else []
    if twitch_user_id:
        sources.append(f"https://7tv.io/v3/users/twitch/{twitch_user_id}")
    for url in sources:
        try:
            d = get_json(url)
        except Exception as e:
            print(f"7TV fetch failed ({url}): {e}")
            continue
        for e in (d.get("emote_set") or d).get("emotes") or []:
            if e.get("name") and e.get("id"):
                emotes[e["name"]] = e["id"]
    print(f"7TV: {len(emotes)} emotes")
    return emotes


def parts_for(msg, stv):
    out = []

    def add_text(text):
        for tok in re.split(r"(\s+)", text):
            if not tok:
                continue
            if tok in stv:
                out.append(["7", stv[tok], tok])
            elif out and isinstance(out[-1], str):
                out[-1] += tok
            else:
                out.append(tok)

    frags = msg.get("fragments") or [{"text": msg.get("body", "")}]
    for f in frags:
        em = f.get("emoticon") or {}
        eid = em.get("emoticon_id") or em.get("emoticonID")
        if eid:
            out.append(["t", str(eid), f.get("text", "")])
        elif f.get("text"):
            add_text(f["text"])
    if len(out) == 1 and isinstance(out[0], str):
        return out[0]
    return out


def convert(raw, stv=None):
    video = raw.get("video") or {}
    vid = str(video.get("id") or "").strip()
    if not vid:
        sys.exit("Chat file has no video.id")
    stv = stv if stv is not None else seventv_emotes((raw.get("streamer") or {}).get("id"))

    comments = []
    for c in raw.get("comments") or []:
        msg = c.get("message") or {}
        who = c.get("commenter") or {}
        comments.append([
            round(float(c.get("content_offset_seconds", 0)), 2),
            who.get("display_name") or who.get("name") or "?",
            msg.get("user_color") or "",
            parts_for(msg, stv),
        ])
    comments.sort(key=lambda x: x[0])

    chapters = [{"t": int((ch.get("startMilliseconds") or 0) / 1000),
                 "game": ch.get("gameDisplayName") or ch.get("description") or ""}
                for ch in video.get("chapters") or []]
    game = video.get("game") or (chapters[0]["game"] if chapters else "")
    if isinstance(game, dict):
        game = game.get("displayName") or game.get("name") or ""
    duration = video.get("length") or video.get("end") or (comments[-1][0] if comments else 0)

    (DATA / "chat").mkdir(parents=True, exist_ok=True)
    (DATA / "chat" / f"{vid}.json").write_text(
        json.dumps(comments, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    return {
        "id": vid,
        "youtube": "",
        "title": video.get("title") or f"Stream {vid}",
        "date": video.get("created_at") or "",
        "duration": int(duration),
        "game": game,
        "chapters": chapters,
        "messages": len(comments),
        "offset": 0.0,
    }


def publish(entry):
    vods = [v for v in load(VODS, []) if v["id"] != entry["id"]]
    vods.append(entry)
    vods.sort(key=lambda v: v.get("date", ""), reverse=True)
    save(VODS, vods)
    pending = [p for p in load(PENDING, []) if p["id"] != entry["id"]]
    if PENDING.exists() or pending:
        save(PENDING, pending)
