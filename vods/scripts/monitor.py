#!/usr/bin/env python3
"""Runs every ~10 min. Live: record viewers + category rank + similar-size channels.
Offline (hourly): sample the category landscape for your usual games. State lives in .monitor/ (Actions cache)."""
import json
import os
import statistics
import urllib.parse
from datetime import datetime, timedelta, timezone
from pathlib import Path

import sync
import vodlib

STATE = Path(os.environ.get("MONITOR_DIR", ".monitor")) / "monitor.json"
MAX_PAGES = int(os.environ.get("MONITOR_MAX_PAGES", "30"))
KEEP_DAYS, MAX_GAMES, LAND_EVERY = 14, 4, timedelta(minutes=55)
FMT = "%Y-%m-%dT%H:%M:%SZ"


def now():
    return datetime.now(timezone.utc)


def parse(ts):
    return datetime.strptime(ts, FMT).replace(tzinfo=timezone.utc)


def user_counts(uid):
    """Followers and subscriber count via the broadcaster's own Twitch token. Empty dict if not set up."""
    refresh = os.environ.get("TWITCH_USER_REFRESH_TOKEN", "").strip()
    if not refresh:
        return {}
    cid, secret = os.environ["TWITCH_CLIENT_ID"].strip(), os.environ["TWITCH_CLIENT_SECRET"].strip()
    out = {}
    try:
        body = urllib.parse.urlencode({"grant_type": "refresh_token", "refresh_token": refresh,
                                       "client_id": cid, "client_secret": secret}).encode()
        token = vodlib.get_json("https://id.twitch.tv/oauth2/token", data=body)["access_token"]
    except Exception as e:
        print(f"::warning::Twitch sign-in refresh failed (redo the Twitch sign-in if this keeps happening): {e}")
        return out
    h = {"Client-ID": cid, "Authorization": f"Bearer {token}"}
    try:
        out["followers"] = int(vodlib.get_json(f"https://api.twitch.tv/helix/channels/followers?broadcaster_id={uid}&first=1", h)["total"])
    except Exception as e:
        print(f"::warning::Follower count failed: {e}")
    try:
        out["subs"] = int(vodlib.get_json(f"https://api.twitch.tv/helix/subscriptions?broadcaster_id={uid}&first=1", h)["total"])
    except Exception as e:
        print(f"::warning::Sub count failed (the Twitch sign-in needs the channel:read:subscriptions permission): {e}")
    return out


def scan(helix, game_id, mine=None, me=None):
    """Live channels in a category (up to MAX_PAGES*100), sorted by viewers."""
    rows, cursor = [], None
    for _ in range(MAX_PAGES):
        r = helix(f"streams?game_id={game_id}&first=100" + (f"&after={cursor}" if cursor else ""), full=True)
        rows += [(s["user_login"].lower(), s["viewer_count"]) for s in r.get("data", [])]
        cursor = (r.get("pagination") or {}).get("cursor")
        if not cursor or not r.get("data"):
            break
    truncated = bool(cursor)
    rows.sort(key=lambda x: -x[1])
    counts = [v for _, v in rows]
    out = {"channels": len(rows), "viewers": sum(counts), "median": statistics.median(counts) if counts else 0,
           "top10": round(sum(counts[:10]) / sum(counts), 3) if sum(counts) else 0, "truncated": truncated}
    if mine is not None:
        logins = [l for l, _ in rows]
        if me in logins:
            out["rank"] = logins.index(me) + 1
        elif not (truncated and counts and mine < counts[-1]):
            out["rank"] = 1 + sum(v > mine for v in counts)
        lo, hi = max(1, mine * 0.65), mine * 1.5 + 2
        peers = sorted(((l, v) for l, v in rows if l != me and lo <= v <= hi), key=lambda x: abs(x[1] - mine))
        out["peers"] = [list(p) for p in peers[:10]]
    return out


def seed_games(helix, state):
    names = []
    for v in sorted(vodlib.load(vodlib.VODS, []) + vodlib.load(vodlib.PENDING, []), key=lambda v: v.get("date", ""), reverse=True):
        for n in [c.get("game") for c in v.get("chapters") or []] + [v.get("game")]:
            if n and n not in names:
                names.append(n)
    if not names:
        return
    q = "&".join("name=" + urllib.parse.quote(n) for n in names[:MAX_GAMES * 2])
    for g in helix(f"games?{q}"):
        state["games"].setdefault(g["id"], {"name": g["name"], "last": "1970-01-01T00:00:00Z"})


def main():
    STATE.parent.mkdir(parents=True, exist_ok=True)
    state = json.loads(STATE.read_text()) if STATE.exists() else {}
    state.setdefault("samples", [])
    state.setdefault("games", {})
    helix = sync.twitch()
    user = helix(f"users?login={sync.CHANNEL}")[0]
    t = now()
    ts = t.strftime(FMT)
    live = helix(f"streams?user_id={user['id']}")

    counts = user_counts(user["id"])
    fol, subs = counts.get("followers"), counts.get("subs")
    if counts:
        print(f"Followers: {fol} | Subs: {subs}")
    if counts and (live or t - parse(state.get("last_fol", "1970-01-01T00:00:00Z")) >= LAND_EVERY):
        state["samples"].append({"ts": ts, "k": "fol", "n": fol, "s": subs})
        state["last_fol"] = ts

    if live:
        s = live[0]
        gid, mine = s.get("game_id"), s.get("viewer_count", 0)
        sample = {"ts": ts, "k": "live", "start": s["started_at"], "sid": s["id"], "v": mine,
                  "gid": gid, "game": s.get("game_name", ""), "title": s.get("title", ""), "f": fol, "sb": subs}
        if gid:
            state["games"][gid] = {"name": s.get("game_name", ""), "last": ts}
            sample["cat"] = scan(helix, gid, mine, user["login"].lower())
        state["samples"].append(sample)
        cat = sample.get("cat", {})
        print(f"LIVE: {mine} viewers in {sample['game']} | rank {cat.get('rank', '?')} of {cat.get('channels', '?')}"
              f"{'+' if cat.get('truncated') else ''} | {len(cat.get('peers', []))} similar-size channels")
    elif t - parse(state.get("last_land", "1970-01-01T00:00:00Z")) >= LAND_EVERY:
        if not state["games"]:
            seed_games(helix, state)
        games = sorted(state["games"].items(), key=lambda g: g[1]["last"], reverse=True)[:MAX_GAMES]
        for gid, g in games:
            state["samples"].append({"ts": ts, "k": "land", "gid": gid, "game": g["name"], **scan(helix, gid)})
        state["last_land"] = ts
        print(f"Offline: sampled {len(games)} categories: {', '.join(g['name'] for _, g in games) or 'none yet'}")
    else:
        print("Offline: nothing to do this run")

    cutoff = (t - timedelta(days=KEEP_DAYS)).strftime(FMT)
    state["samples"] = [x for x in state["samples"] if x["ts"] >= cutoff]
    STATE.write_text(json.dumps(state, separators=(",", ":")))


if __name__ == "__main__":
    main()
