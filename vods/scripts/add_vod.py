#!/usr/bin/env python3
"""Add a VOD: python add_vod.py --chat chat.json --youtube <id-or-url>"""
import argparse
import json
import re
import sys
from pathlib import Path

SITE = Path(__file__).resolve().parent.parent / "site"
DATA = SITE / "data"


def youtube_id(value: str) -> str:
    value = value.strip()
    m = re.search(r"(?:v=|youtu\.be/|/embed/|/live/|/shorts/)([A-Za-z0-9_-]{11})", value)
    if m:
        return m.group(1)
    if re.fullmatch(r"[A-Za-z0-9_-]{11}", value):
        return value
    sys.exit(f"Could not find a YouTube video ID in: {value!r}")


def compact_message(msg: dict):
    parts = []
    for frag in msg.get("fragments") or []:
        emote = frag.get("emoticon") or {}
        eid = emote.get("emoticon_id") or emote.get("emoticonID")
        if eid:
            parts.append([str(eid)])
        elif frag.get("text"):
            parts.append(frag["text"])
    if not parts:
        parts = [msg.get("body", "")]
    if len(parts) == 1 and isinstance(parts[0], str):
        return parts[0]
    return parts


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--chat", required=True)
    ap.add_argument("--youtube", required=True)
    ap.add_argument("--title", default="")
    ap.add_argument("--offset", type=float, default=0.0, help="Chat shift in seconds")
    args = ap.parse_args()

    raw = json.loads(Path(args.chat).read_text(encoding="utf-8"))
    video = raw.get("video") or {}
    twitch_id = str(video.get("id") or "").strip()
    if not twitch_id:
        sys.exit("Chat file has no video.id - is this a TwitchDownloader chat JSON?")

    comments = []
    for c in raw.get("comments") or []:
        msg = c.get("message") or {}
        who = c.get("commenter") or {}
        comments.append([
            round(float(c.get("content_offset_seconds", 0)), 2),
            who.get("display_name") or who.get("name") or "?",
            msg.get("user_color") or "",
            compact_message(msg),
        ])
    comments.sort(key=lambda x: x[0])

    chapters = []
    for ch in video.get("chapters") or []:
        chapters.append({
            "t": int((ch.get("startMilliseconds") or 0) / 1000),
            "game": ch.get("gameDisplayName") or ch.get("description") or "",
        })

    duration = video.get("length") or video.get("end") or 0
    if not duration and comments:
        duration = int(comments[-1][0])

    game = video.get("game") or (chapters[0]["game"] if chapters else "")
    if isinstance(game, dict):
        game = game.get("displayName") or game.get("name") or ""

    entry = {
        "id": twitch_id,
        "youtube": youtube_id(args.youtube),
        "title": args.title or video.get("title") or f"Stream {twitch_id}",
        "date": video.get("created_at") or "",
        "duration": int(duration),
        "game": game,
        "chapters": chapters,
        "messages": len(comments),
        "offset": args.offset,
    }

    (DATA / "chat").mkdir(parents=True, exist_ok=True)
    (DATA / "chat" / f"{twitch_id}.json").write_text(
        json.dumps(comments, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    vods_path = DATA / "vods.json"
    vods = json.loads(vods_path.read_text(encoding="utf-8")) if vods_path.exists() else []
    vods = [v for v in vods if v.get("id") != twitch_id]
    vods.append(entry)
    vods.sort(key=lambda v: v.get("date", ""), reverse=True)
    vods_path.write_text(json.dumps(vods, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(f"Added '{entry['title']}' ({twitch_id} -> youtube {entry['youtube']}), "
          f"{len(comments)} chat messages")


if __name__ == "__main__":
    main()
