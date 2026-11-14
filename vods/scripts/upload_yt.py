#!/usr/bin/env python3
"""Upload the oldest saved stream that isn't on YouTube yet (unlisted, Twitch title). One per run."""
import http.client
import json
import os
import subprocess
import sys
import urllib.parse
from datetime import datetime
from pathlib import Path

import vodlib

UPLOADS = vodlib.ROOT / "uploads.json"
SITE = os.environ.get("SITE_URL", "https://vods.itsmotch.com").rstrip("/")
TDL = os.environ.get("TDL", "TwitchDownloaderCLI")
CHUNK = 64 * 1024 * 1024
API = "https://www.googleapis.com"


def todo():
    done = vodlib.load(UPLOADS, {})
    return [p for p in sorted(vodlib.load(vodlib.PENDING, []), key=lambda p: p["date"]) if p["id"] not in done]


def token():
    env = lambda k: os.environ.get(k, "").strip()
    body = urllib.parse.urlencode({"client_id": env("YT_CLIENT_ID"), "client_secret": env("YT_CLIENT_SECRET"),
                                   "refresh_token": env("YT_REFRESH_TOKEN"), "grant_type": "refresh_token"}).encode()
    return vodlib.get_json("https://oauth2.googleapis.com/token", data=body)["access_token"]


def request(method, url, headers, body=None):
    u = urllib.parse.urlsplit(url)
    conn = http.client.HTTPConnection if u.scheme == "http" else http.client.HTTPSConnection  # http only in tests
    c = conn(u.netloc, timeout=300)
    c.request(method, u.path + ("?" + u.query if u.query else ""), body=body, headers=headers)
    r = c.getresponse()
    return r.status, dict(r.getheaders()), r.read().decode("utf-8", "replace")


def start_session(tok, p):
    title = p["title"].replace("<", "").replace(">", "").strip()[:100] or "Stream"
    day = datetime.fromisoformat(p["date"].replace("Z", "+00:00")).strftime("%B %-d, %Y")
    meta = {"snippet": {"title": title, "categoryId": "20",
                        "description": f"Twitch stream from {day}.\nWatch with chat replay: {SITE}/v/{p['id']}/"},
            "status": {"privacyStatus": "unlisted", "selfDeclaredMadeForKids": False}}
    st, h, body = request("POST", f"{API}/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
                          {"Authorization": f"Bearer {tok}", "Content-Type": "application/json; charset=UTF-8",
                           "X-Upload-Content-Type": "video/mp4"}, json.dumps(meta).encode())
    loc = {k.lower(): v for k, v in h.items()}.get("location")
    if st != 200 or not loc:
        hint = " Sign in again with the youtube.upload scope (see README)." if st in (401, 403) else ""
        sys.exit(f"YouTube wouldn't start the upload (HTTP {st}): {body[:300]}{hint}")
    return loc


def upload(loc, path):
    size, sent = path.stat().st_size, 0
    with path.open("rb") as f:
        while sent < size:
            f.seek(sent)
            chunk = f.read(CHUNK)
            end = sent + len(chunk) - 1
            for attempt in range(5):
                try:
                    st, h, body = request("PUT", loc, {"Content-Length": str(len(chunk)),
                                                      "Content-Range": f"bytes {sent}-{end}/{size}"}, chunk)
                    break
                except OSError as e:
                    print(f"Network error ({e}), retrying")
            else:
                sys.exit("Upload kept failing")
            if st in (200, 201):
                return json.loads(body)
            if st != 308:
                sys.exit(f"YouTube rejected the upload (HTTP {st}): {body[:300]}")
            rng = {k.lower(): v for k, v in h.items()}.get("range")
            sent = int(rng.split("-")[1]) + 1 if rng else 0
            print(f"Uploaded {sent * 100 // size}%", flush=True)
    sys.exit("Upload ended without a response")


if __name__ == "__main__":
    if "--check" in sys.argv:  # used by the workflow to skip the heavy steps
        print("yes" if todo() else "no")
        sys.exit()
    items = todo()
    if not items:
        sys.exit(print("Nothing to upload"))
    p = items[0]
    print(f"Uploading {p['id']}: {p['title']}")
    tok = token()
    loc = start_session(tok, p)  # fails fast on a bad token before the big download
    out = Path("vod.mp4")
    subprocess.run([TDL, "videodownload", "--id", p["id"], "-q", "1080p60", "-o", str(out),
                    "--ffmpeg-path", "ffmpeg", "--threads", "10", "--temp-path", "."], check=True)
    print(f"Downloaded {out.stat().st_size / 1e9:.1f} GB")
    video = upload(loc, out)
    privacy = video.get("status", {}).get("privacyStatus")
    done = vodlib.load(UPLOADS, {})
    done[p["id"]] = video["id"]
    vodlib.save(UPLOADS, done)
    print(f"Uploaded https://youtu.be/{video['id']} ({privacy})")
    if privacy == "private":
        print("::warning::YouTube locked the upload to private (this Google Cloud project isn't verified yet). "
              "Set it to Unlisted on YouTube; the site publishes it on the next sync.")
