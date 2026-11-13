"""Fold live-monitor samples (Actions cache) into committed insight files."""
import json
import os
from datetime import datetime, timezone
from pathlib import Path

import vodlib

SRC = Path(os.environ.get("MONITOR_DIR", ".monitor")) / "monitor.json"
DIR = vodlib.ROOT / "insights"
LIVE, LAND = DIR / "live.json", DIR / "landscape.json"


def week_slot(ts):
    t = datetime.strptime(ts, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    return t.weekday() * 24 + t.hour  # Monday 00 UTC = 0


def fold():
    if not SRC.exists():
        print("insights: no monitor data yet")
        return
    samples = json.loads(SRC.read_text()).get("samples", [])
    live = vodlib.load(LIVE, {"folded_until": "", "streams": {}})
    land = vodlib.load(LAND, {"games": {}})
    new = [s for s in samples if s["ts"] > live["folded_until"]]
    for s in new:
        if s["k"] == "live":
            st = live["streams"].setdefault(s["start"], {"sid": s["sid"], "title": s["title"], "samples": [], "cat": [], "peers": {}})
            st["title"] = s["title"] or st["title"]
            st["samples"].append([s["ts"], s["v"], s["game"]])
            c = s.get("cat")
            if c:
                st["cat"].append([s["ts"], s["game"], c.get("rank"), c["channels"], c["viewers"], c["truncated"], c["median"]])
                for login, v in c.get("peers", []):
                    p = st["peers"].setdefault(login, [0, 0])
                    p[0] += 1
                    p[1] += v
        elif s["k"] == "land":
            g = land["games"].setdefault(s["gid"], {"name": s["game"], "b": [[0, 0, 0, 0] for _ in range(168)]})
            g["name"] = s["game"]
            b = g["b"][week_slot(s["ts"])]
            b[0] += 1
            b[1] += s["channels"]
            b[2] += s["viewers"]
            b[3] += s["median"]
    if new:
        live["folded_until"] = max(s["ts"] for s in new)
        DIR.mkdir(parents=True, exist_ok=True)
        vodlib.save(LIVE, live)
        vodlib.save(LAND, land)
    print(f"insights: folded {len(new)} new samples ({sum(s['k'] == 'live' for s in new)} live)")
