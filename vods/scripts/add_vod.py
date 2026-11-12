#!/usr/bin/env python3
"""python add_vod.py --chat chat.json --youtube <id-or-url>"""
import argparse
import json
from pathlib import Path

import vodlib

ap = argparse.ArgumentParser()
ap.add_argument("--chat", required=True)
ap.add_argument("--youtube", required=True)
ap.add_argument("--title", default="")
ap.add_argument("--offset", type=float, default=0.0)
args = ap.parse_args()

entry = vodlib.convert(json.loads(Path(args.chat).read_text(encoding="utf-8")))
entry["youtube"] = vodlib.youtube_id(args.youtube)
entry["offset"] = args.offset
if args.title:
    entry["title"] = args.title
vodlib.publish(entry)
print(f"Added '{entry['title']}' ({entry['id']} -> {entry['youtube']}), {entry['messages']} messages")
