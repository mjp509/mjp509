#!/usr/bin/env python3
"""Save viewer stats typed in from Twitch's Stream Summary for a past stream (no live-monitor data)."""
import argparse
import re
import sys
from datetime import datetime, timezone

import vodlib
from insights import DIR

MANUAL = DIR / "manual.json"


def number(v, name, integer=True):
    v = (v or "").strip().replace(",", "")
    if not v:
        return None
    try:
        x = float(v)
    except ValueError:
        sys.exit(f"{name} must be a number (got {v!r})")
    if x < 0:
        sys.exit(f"{name} can't be negative")
    return int(round(x)) if integer else round(x, 1)


ap = argparse.ArgumentParser()
ap.add_argument("--stream", default="")
ap.add_argument("--avg", default="")
ap.add_argument("--peak", default="")
ap.add_argument("--followers", default="")
args = ap.parse_args()

streams = sorted(vodlib.load(vodlib.VODS, []) + vodlib.load(vodlib.PENDING, []), key=lambda v: v.get("date", ""))
if not streams:
    sys.exit("No saved streams yet.")
m = re.findall(r"\d{6,}", args.stream or "")
if m:
    target = next((s for s in streams if s["id"] == m[-1]), None)
    if not target:
        recent = "\n".join(f"  {s['id']}  {s['date'][:10]}  {s['title']}" for s in streams[-8:])
        sys.exit(f"Stream {m[-1]} isn't saved on the site. Recent saved streams:\n{recent}")
else:
    target = streams[-1]

vals = {"avg_viewers": number(args.avg, "Average viewers", integer=False), "peak_viewers": number(args.peak, "Peak viewers"),
        "followers_gained": number(args.followers, "Followers gained")}
vals = {k: v for k, v in vals.items() if v is not None}
if not vals:
    sys.exit("Enter at least one number (average viewers, peak viewers or followers gained).")
if "avg_viewers" in vals and "peak_viewers" in vals and vals["peak_viewers"] < vals["avg_viewers"]:
    sys.exit("Peak viewers can't be lower than average viewers. Check the numbers.")

data = vodlib.load(MANUAL, {})
entry = data.get(target["id"], {})
entry.update(vals)
entry["added"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
data[target["id"]] = entry
DIR.mkdir(parents=True, exist_ok=True)
vodlib.save(MANUAL, data)
print(f"Saved for '{target['title']}' ({target['date'][:10]}): " + ", ".join(f"{k.replace('_', ' ')} {v}" for k, v in vals.items()))
