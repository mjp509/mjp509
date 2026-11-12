#!/usr/bin/env python3
"""Save chat for new Twitch VODs, then publish once the matching YouTube upload exists."""
import json
import os
import re
import subprocess
import tempfile
import urllib.parse
from pathlib import Path

import vodlib

CHANNEL = os.environ.get("TWITCH_CHANNEL", "itsmotch")
TDL = os.environ.get("TDL", "TwitchDownloaderCLI")


def twitch():
    cid, secret = os.environ["TWITCH_CLIENT_ID"], os.environ["TWITCH_CLIENT_SECRET"]
    q = urllib.parse.urlencode({"client_id": cid, "client_secret": secret, "grant_type": "client_credentials"})
    token = vodlib.get_json(f"https://id.twitch.tv/oauth2/token?{q}", data=b"")["access_token"]
    h = {"Client-ID": cid, "Authorization": f"Bearer {token}"}
    return lambda path: vodlib.get_json(f"https://api.twitch.tv/helix/{path}", h)["data"]


def norm(s):
    return re.sub(r"[^a-z0-9]", "", s.lower())


def save_new_chats():
    helix = twitch()
    user = helix(f"users?login={CHANNEL}")[0]
    live = helix(f"streams?user_id={user['id']}")
    live_since = live[0]["started_at"] if live else None
    known = {v["id"] for v in vodlib.load(vodlib.VODS, [])} | {p["id"] for p in vodlib.load(vodlib.PENDING, [])}
    stv = None

    for v in reversed(helix(f"videos?user_id={user['id']}&type=archive&first=20")):
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
        pending = vodlib.load(vodlib.PENDING, [])
        pending.append(entry)
        vodlib.save(vodlib.PENDING, pending)


def match_youtube():
    pending = sorted(vodlib.load(vodlib.PENDING, []), key=lambda p: p["date"])
    if not pending:
        return
    key, channel = os.environ["YOUTUBE_API_KEY"], os.environ["YOUTUBE_CHANNEL_ID"]
    uploads = "UU" + channel[2:]
    url = ("https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=50"
           f"&playlistId={uploads}&key={key}")
    items = vodlib.get_json(url).get("items", [])
    videos = sorted(({"id": i["snippet"]["resourceId"]["videoId"], "title": i["snippet"]["title"],
                      "at": i["snippet"]["publishedAt"]} for i in items), key=lambda x: x["at"])
    used = {v["youtube"] for v in vodlib.load(vodlib.VODS, [])}

    for p in pending:
        for yt in videos:
            if yt["id"] not in used and norm(yt["title"]) == norm(p["title"]) and yt["at"] >= p["date"]:
                used.add(yt["id"])
                p["youtube"] = yt["id"]
                vodlib.publish(p)
                print(f"Published {p['id']} -> {yt['id']}")
                break
        else:
            print(f"Waiting for YouTube upload: {p['title']}")


if __name__ == "__main__":
    save_new_chats()
    match_youtube()
