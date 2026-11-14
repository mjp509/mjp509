#!/usr/bin/env python3
"""Save chat for new Twitch VODs, then publish once the matching YouTube upload exists."""
import json
import os
import re
import subprocess
import tempfile
import urllib.parse
from datetime import datetime, timedelta, timezone
from pathlib import Path

import vodlib

CHANNEL = os.environ.get("TWITCH_CHANNEL", "itsmotch")
TDL = os.environ.get("TDL", "TwitchDownloaderCLI")


def twitch():
    cid, secret = os.environ["TWITCH_CLIENT_ID"].strip(), os.environ["TWITCH_CLIENT_SECRET"].strip()
    q = urllib.parse.urlencode({"client_id": cid, "client_secret": secret, "grant_type": "client_credentials"})
    token = vodlib.get_json(f"https://id.twitch.tv/oauth2/token?{q}", data=b"")["access_token"]
    h = {"Client-ID": cid, "Authorization": f"Bearer {token}"}

    def helix(path, full=False):
        r = vodlib.get_json(f"https://api.twitch.tv/helix/{path}", h)
        return r if full else r["data"]
    return helix


def norm(s):
    return re.sub(r"[^a-z0-9]", "", s.lower())


def save_clips(helix, uid):
    since = (datetime.now(timezone.utc) - timedelta(days=30)).strftime("%Y-%m-%dT%H:%M:%SZ")
    clips, period = helix(f"clips?broadcaster_id={uid}&first=20&started_at={since}"), "month"
    if len(clips) < 4:
        clips, period = helix(f"clips?broadcaster_id={uid}&first=20"), "all"
    keep = ["id", "url", "title", "view_count", "created_at", "thumbnail_url", "duration", "creator_name"]
    clips = sorted(clips, key=lambda c: -c.get("view_count", 0))[:12]
    vodlib.save(vodlib.DATA / "clips.json", {"period": period, "clips": [{k: c.get(k) for k in keep} for c in clips]})


def save_schedule(helix, uid):
    """Upcoming streams from the channel's Twitch schedule, for the homepage."""
    try:
        r = helix(f"schedule?broadcaster_id={uid}&first=14", full=True)["data"]
    except RuntimeError as e:  # 404 when no schedule is set up on Twitch
        print(f"Schedule: none on Twitch ({str(e)[:80]})")
        r = {}
    segs = [{"start": s["start_time"], "end": s.get("end_time"), "title": s.get("title") or "",
             "game": (s.get("category") or {}).get("name", ""), "canceled": bool(s.get("canceled_until"))}
            for s in r.get("segments") or []]
    vac = r.get("vacation") or None
    vodlib.save(vodlib.DATA / "schedule.json", {"segments": segs, "vacation": vac and {"start": vac["start_time"], "end": vac["end_time"]}})
    print(f"Schedule: {len(segs)} upcoming")


def save_boxart(helix):
    """Box art for every game in saved streams, for the Most played games row."""
    names = sorted({c["game"] for v in vodlib.load(vodlib.VODS, []) + vodlib.load(vodlib.PENDING, [])
                    for c in v.get("chapters", []) if c.get("game")} | {v["game"] for v in vodlib.load(vodlib.VODS, []) if v.get("game")})
    art = {}
    for i in range(0, len(names), 100):
        q = "&".join("name=" + urllib.parse.quote(n) for n in names[i:i + 100])
        for g in helix(f"games?{q}"):
            art[g["name"]] = g["box_art_url"].replace("{width}x{height}", "285x380")
    if art:
        vodlib.save(vodlib.DATA / "games.json", art)


def save_new_chats():
    helix = twitch()
    user = helix(f"users?login={CHANNEL}")[0]
    vodlib.save(vodlib.DATA / "channel.json", {"id": user["id"], "name": user.get("display_name", CHANNEL), "avatar": user.get("profile_image_url", "")})
    save_clips(helix, user["id"])
    live = helix(f"streams?user_id={user['id']}")
    live_since = live[0]["started_at"] if live else None
    known = {v["id"] for v in vodlib.load(vodlib.VODS, [])} | {p["id"] for p in vodlib.load(vodlib.PENDING, [])}
    stv = None

    save_boxart(helix)
    save_schedule(helix, user["id"])
    videos = helix(f"videos?user_id={user['id']}&type=archive&first=20")
    tv = {v["id"]: v.get("view_count", 0) for v in videos}
    for path in (vodlib.VODS, vodlib.PENDING):
        items = vodlib.load(path, [])
        for it in items:
            it["twitch_views"] = tv.get(it["id"], it.get("twitch_views", 0))
        if items:
            vodlib.save(path, items)

    for v in reversed(videos):
        if v["id"] in known or (live_since and v["created_at"] >= live_since):
            continue
        print(f"Saving chat for {v['id']}: {v['title']}")
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "chat.json"
            subprocess.run([TDL, "chatdownload", "--id", v["id"], "-o", str(out)], check=True)
            raw = json.loads(out.read_text(encoding="utf-8"))
        raw.setdefault("streamer", {}).setdefault("id", user["id"])
        raw.setdefault("video", {}).setdefault("title", v["title"])
        raw["video"].setdefault("created_at", v["created_at"])
        if stv is None:
            stv = vodlib.seventv_emotes(user["id"])
        entry = vodlib.convert(raw, stv)
        entry["twitch_views"] = v.get("view_count", 0)
        pending = vodlib.load(vodlib.PENDING, [])
        pending.append(entry)
        vodlib.save(vodlib.PENDING, pending)


def iso_seconds(d):
    m = re.fullmatch(r"P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?", d or "")
    if not m:
        return 0
    days, h, mi, sec = (int(x or 0) for x in m.groups())
    return days * 86400 + h * 3600 + mi * 60 + sec


def youtube_uploads():
    """Recent uploads with title, publish time, length and privacy. Uses OAuth (sees unlisted) if set up."""
    env = lambda k: os.environ.get(k, "").strip()
    api = "https://www.googleapis.com/youtube/v3"
    if env("YT_REFRESH_TOKEN"):
        body = urllib.parse.urlencode({"client_id": env("YT_CLIENT_ID"), "client_secret": env("YT_CLIENT_SECRET"),
                                       "refresh_token": env("YT_REFRESH_TOKEN"), "grant_type": "refresh_token"}).encode()
        token = vodlib.get_json("https://oauth2.googleapis.com/token", data=body)["access_token"]
        headers, auth = {"Authorization": f"Bearer {token}"}, ""
        chans = vodlib.get_json(f"{api}/channels?part=snippet,contentDetails&mine=true", headers).get("items", [])
        if not chans:
            raise RuntimeError("signed-in Google account has no YouTube channel")
        uploads = chans[0]["contentDetails"]["relatedPlaylists"]["uploads"]
        print(f"YouTube sign-in OK: channel '{chans[0]['snippet']['title']}'")
    else:
        m = re.search(r"UC[A-Za-z0-9_-]{22}", env("YOUTUBE_CHANNEL_ID"))
        if not m:
            raise RuntimeError("YOUTUBE_CHANNEL_ID should be the ID starting with UC (youtube.com/account_advanced)")
        headers, auth = {}, f"&key={env('YOUTUBE_API_KEY')}"
        uploads = "UU" + m.group(0)[2:]
    items = vodlib.get_json(f"{api}/playlistItems?part=contentDetails&maxResults=50&playlistId={uploads}{auth}",
                            headers).get("items", [])
    ids = [i["contentDetails"]["videoId"] for i in items]
    if not ids:
        return []
    vids = vodlib.get_json(f"{api}/videos?part=snippet,contentDetails,status&id={','.join(ids)}{auth}",
                           headers).get("items", [])
    return [{"id": v["id"], "title": v["snippet"]["title"], "at": v["snippet"]["publishedAt"],
             "dur": iso_seconds(v["contentDetails"].get("duration")), "privacy": v["status"]["privacyStatus"]}
            for v in vids]


def match_youtube():
    pending = sorted(vodlib.load(vodlib.PENDING, []), key=lambda p: p["date"])
    signed_in = bool(os.environ.get("YT_REFRESH_TOKEN", "").strip())
    if not pending and not signed_in:
        return
    try:
        videos = youtube_uploads()
        if signed_in:
            unlisted = sum(v["privacy"] == "unlisted" for v in videos)
            print(f"YouTube: {len(videos)} recent uploads visible ({unlisted} unlisted)")
    except RuntimeError as e:
        hint = " (channel ID wrong, or the channel has no uploads yet)" if "HTTP 404" in str(e) else ""
        print(f"::warning::YouTube lookup failed{hint}: {e}. Chat is saved; VODs publish once YouTube works.")
        return
    used = {v["youtube"] for v in vodlib.load(vodlib.VODS, [])}
    auto = vodlib.load(vodlib.ROOT / "uploads.json", {})  # streams the auto-uploader put on YouTube

    for p in pending:
        cands = [v for v in videos if v["id"] not in used and v["privacy"] != "private" and v["at"] >= p["date"]]
        pick = next((v for v in cands if v["id"] == auto.get(p["id"])), None)
        if p["id"] in auto and not pick:
            print(f"Waiting for auto-upload {auto[p['id']]} to be unlisted/public: {p['title']}")
            continue
        pick = pick or next((v for v in cands if norm(v["title"]) == norm(p["title"])), None)
        if not pick and p.get("duration"):
            close = [v for v in cands if abs(v["dur"] - p["duration"]) <= max(120, p["duration"] * 0.02)]
            pick = min(close, key=lambda v: abs(v["dur"] - p["duration"]), default=None)
        if pick:
            used.add(pick["id"])
            p["youtube"] = pick["id"]
            vodlib.publish(p)
            print(f"Published {p['id']} -> {pick['id']} ({pick['privacy']}, '{pick['title']}')")
        else:
            print(f"Waiting for YouTube upload: {p['title']}")


def update_youtube_views():
    vods = vodlib.load(vodlib.VODS, [])
    ids = [v["youtube"] for v in vods if v.get("youtube")]
    stats = {}
    for i in range(0, len(ids), 50):
        url = ("https://www.googleapis.com/youtube/v3/videos?part=statistics"
               f"&id={','.join(ids[i:i + 50])}&key={os.environ['YOUTUBE_API_KEY'].strip()}")
        try:
            found = vodlib.get_json(url).get("items", [])
        except RuntimeError as e:
            print(f"::warning::Couldn't refresh YouTube views: {e}")
            return
        for it in found:
            stats[it["id"]] = int(it.get("statistics", {}).get("viewCount", 0))
    for v in vods:
        if v.get("youtube") in stats:
            v["yt_views"] = stats[v["youtube"]]
    if vods:
        vodlib.save(vodlib.VODS, vods)


if __name__ == "__main__":
    try:
        import insights
        insights.fold()
    except Exception as e:
        print(f"::warning::Couldn't fold live monitor data: {e}")
    save_new_chats()
    match_youtube()
    update_youtube_views()
