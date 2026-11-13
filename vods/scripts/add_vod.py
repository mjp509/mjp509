#!/usr/bin/env python3
"""python add_vod.py --youtube <id-or-url> [--chat chat.json]  (no --chat: newest stream waiting in pending.json)"""
import argparse
import json
import sys
from pathlib import Path

import vodlib

ap = argparse.ArgumentParser()
ap.add_argument("--youtube", required=True)
ap.add_argument("--chat", default="")
ap.add_argument("--title", default="")
ap.add_argument("--offset", type=float, default=0.0)
args = ap.parse_args()

if args.chat:
    entry = vodlib.convert(json.loads(Path(args.chat).read_text(encoding="utf-8")))
else:
    pending = vodlib.load(vodlib.PENDING, [])
    if not pending:
        sys.exit("No saved streams are waiting. Run Sync VODs first, or paste the Twitch VOD link too.")
    entry = max(pending, key=lambda p: p.get("date", ""))
    print(f"Using newest waiting stream: {entry['id']} ({entry['title']})")

entry["youtube"] = vodlib.youtube_id(args.youtube)
entry["offset"] = args.offset
if args.title:
    entry["title"] = args.title
vodlib.publish(entry)
print(f"Added '{entry['title']}' ({entry['id']} -> {entry['youtube']}), {entry['messages']} messages")
