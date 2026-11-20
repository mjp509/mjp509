"""OSRS character overview from TempleOSRS (repo variable OSRS_RSN) -> site/data/osrs.json."""
import math
import os
import re
import urllib.parse

import vodlib

API = "https://templeosrs.com/api/"
UA = {"User-Agent": "Mozilla/5.0 (vod-site OSRS overview)"}
# In-game skills tab order (3 columns, read left to right)
SKILLS = ["Attack", "Hitpoints", "Mining", "Strength", "Agility", "Smithing", "Defence", "Herblore", "Fishing",
          "Ranged", "Thieving", "Cooking", "Prayer", "Crafting", "Firemaking", "Magic", "Fletching", "Woodcutting",
          "Runecraft", "Slayer", "Farming", "Hunter", "Construction", "Sailing"]
RAIDS = ["Chambers of Xeric", "Chambers of Xeric Challenge Mode", "Theatre of Blood", "Theatre of Blood Hard Mode",
         "Tombs of Amascut", "Tombs of Amascut Expert"]
SKILLING_BOSSES = ["Wintertodt", "Tempoross", "Zalcano", "Rift"]
MINIGAMES = ["LMS", "PvP Arena", "Soul Wars", "Bounty Hunter Hunter", "Bounty Hunter Rogue", "Colosseum Glory"]
CLUES = ["Clue_beginner", "Clue_easy", "Clue_medium", "Clue_hard", "Clue_elite", "Clue_master"]
NOT_BOSSES = set(SKILLS) | {"Overall", "Ehp", "Ehb", "Im_ehp", "Lvl3_ehp", "F2p_ehp", "Uim_ehp", "Collections", "Clue_all",
                            "LMS", "PvP Arena", "Soul Wars", "Bounty Hunter Hunter", "Bounty Hunter Rogue", "Colosseum Glory",
                            "Bounty Hunter", "Bounty Hunter (Legacy) - Hunter", "Bounty Hunter (Legacy) - Rogue"} | set(CLUES)
# Boss name on TempleOSRS -> collection log category (for the boss's icon = first item in that log, usually the pet)
ALIASES = {"Callisto": "callisto_and_artio", "Artio": "callisto_and_artio", "Vetion": "vetion_and_calvarion",
           "Calvarion": "vetion_and_calvarion", "Venenatis": "venenatis_and_spindel", "Spindel": "venenatis_and_spindel",
           "Dagannoth Prime": "dagannoth_kings", "Dagannoth Rex": "dagannoth_kings", "Dagannoth Supreme": "dagannoth_kings",
           "Rift": "guardians_of_the_rift", "Hueycoatl": "the_hueycoatl", "The Royal Titans": "royal_titans",
           "Tombs of Amascut Expert": "tombs_of_amascut", "Chambers of Xeric Challenge Mode": "chambers_of_xeric",
           "Theatre of Blood Hard Mode": "theatre_of_blood", "The Corrupted Gauntlet": "the_gauntlet",
           "Phosanis Nightmare": "the_nightmare", "Nightmare": "the_nightmare", "KreeArra": "kree_arra",
           "Kril Tsutsaroth": "kril_tsutsaroth", "TzTok-Jad": "the_fight_caves", "TzKal-Zuk": "the_inferno",
           "Sol Heredit": "fortis_colosseum", "Lunar Chests": "moons_of_peril"}
CLUE_ICONS = {"Clue_beginner": 23182, "Clue_easy": 2677, "Clue_medium": 2801, "Clue_hard": 2722, "Clue_elite": 12073, "Clue_master": 19835}


def slug(s):
    return re.sub(r"[^a-z0-9]+", "_", s.lower()).strip("_")


def combat_level(lv):
    base = 0.25 * (lv["Defence"] + lv["Hitpoints"] + math.floor(lv["Prayer"] / 2))
    melee = 0.325 * (lv["Attack"] + lv["Strength"])
    ranged = 0.325 * math.floor(lv["Ranged"] * 1.5)
    magic = 0.325 * math.floor(lv["Magic"] * 1.5)
    return round(base + max(melee, ranged, magic), 2)


def get(path, **q):
    r = vodlib.get_json(API + path + "?" + urllib.parse.urlencode(q), UA)
    if isinstance(r, dict) and "error" in r:
        raise LookupError(r["error"].get("Message", str(r["error"])))
    return r.get("data", r) if isinstance(r, dict) else r


def build():
    rsn = os.environ.get("OSRS_RSN", "").strip()
    if not rsn:
        return
    try:
        info = get("player_info.php", player=rsn, formattedrsn=1, dateformat="unix", cloginfo=1)
        stats = get("player_stats.php", player=rsn, bosses=1)
    except (RuntimeError, LookupError) as e:
        print(f"::warning::TempleOSRS stats: {e}")
        return
    name = rsn  # exactly as entered (in-game capitalization); TempleOSRS capitalizes the first letter
    q = urllib.parse.quote(rsn)
    base = "https://templeosrs.com/player/"
    links = {"overview": f"{base}overview.php?player={q}", "log": f"{base}collection-log.php?player={q}",
             "stat": f"{base}stats.php?player={q}&skill="}

    num = lambda k: stats.get(k) or 0
    skills = [{"name": s, "level": num(f"{s}_level"), "xp": num(s), "rank": num(f"{s}_rank"), "ehp": round(num(f"{s}_ehp"), 2)} for s in SKILLS]
    levels = {s["name"]: s["level"] or 1 for s in skills}

    # Collection log: categories, per-tab progress, pets, boss icons
    tabs, pets, cats_all, clog = {}, None, {}, None
    try:
        cats_all = vodlib.get_json(API + "collection-log/categories.php", UA)
        clog = get("collection-log/player_collection_log.php", player=rsn, categories="all")
    except (RuntimeError, LookupError) as e:
        print(f"::warning::TempleOSRS collection log: {e}")
    cat_items = {c: ids for tab in cats_all.values() for c, ids in tab.items()} if cats_all else {}
    if clog:
        got = {c: {i["id"] for i in v} for c, v in (clog.get("items") or {}).items()}
        for tab, cats in cats_all.items():
            every, have = set(), set()
            for c, ids in cats.items():
                if c == "all_pets":
                    continue
                every |= set(ids)
                have |= got.get(c, set()) & set(ids)
            tabs[tab] = [len(have), len(every)]
        pet_ids = cat_items.get("all_pets", [])
        pets = {"have": [i for i in pet_ids if i in got.get("all_pets", set())], "total": len(pet_ids)}

    def icon(boss):
        c = ALIASES.get(boss) or slug(boss)
        for key in (c, c.replace("the_", "", 1), "the_" + c):
            if cat_items.get(key):
                return cat_items[key][0]
        return None

    def entry(k):
        return {"name": k, "kc": num(k), "rank": num(f"{k}_rank"), "ehb": round(num(f"{k}_ehb"), 2), "icon": icon(k)}

    raw_bosses = [k for k, v in stats.items() if isinstance(v, (int, float)) and v > 0 and k not in NOT_BOSSES
                  and not re.search(r"_(rank|level|ehp|ehb)$", k) and k not in ("date", "info")]
    raids = [entry(k) for k in RAIDS if num(k) > 0]
    skilling = [entry(k) for k in SKILLING_BOSSES if num(k) > 0]
    bosses = sorted((entry(k) for k in raw_bosses if k not in RAIDS and k not in SKILLING_BOSSES), key=lambda b: -b["kc"])

    gains = None
    try:
        g = get("player_gains.php", player=rsn, time="month", bosses=1)
        xp = {s: g.get(s) or 0 for s in SKILLS}
        kc = {k: v for k, v in g.items() if isinstance(v, (int, float)) and v > 0 and k not in NOT_BOSSES
              and not re.search(r"_(rank|level|ehp|ehb)$", k)}
        gains = {"since": g.get("Date"), "xp": g.get("Overall") or 0, "ehp": round(g.get("Ehp") or 0, 2), "ehb": round(g.get("Ehb") or 0, 2),
                 "skills": sorted(([s, v] for s, v in xp.items() if v > 0), key=lambda x: -x[1])[:6],
                 "bosses": sorted(([k, v] for k, v in kc.items()), key=lambda x: -x[1])[:6]}
    except (RuntimeError, LookupError) as e:
        print(f"::warning::TempleOSRS gains: {e}")

    recent = []
    try:
        r = vodlib.get_json(API + "collection-log/player_recent_items.php?" + urllib.parse.urlencode({"player": rsn, "count": 25}), UA)
        recent = [{"id": i.get("id"), "name": i.get("name", ""), "unix": i.get("date_unix") or 0, "notable": bool(i.get("notable_item"))}
                  for i in (r.get("data") or [])] if "error" not in r else []
    except RuntimeError as e:
        print(f"::warning::TempleOSRS recent items: {e}")

    out = {
        "rsn": name, "links": links, "url": links["log"],
        "mode": {0: "Main", 1: "Ironman", 2: "Ultimate Ironman", 3: "Hardcore Ironman"}.get(info.get("Game mode"), "Main"),
        "updated": info.get("Last checked"),
        "combat": combat_level(levels), "total_level": num("Overall_level"), "total_xp": num("Overall"),
        "rank": num("Overall_rank"), "ehp": round(num("Ehp"), 2), "ehb": round(num("Ehb"), 2),
        "skills": skills, "bosses": bosses, "raids": raids, "skilling_bosses": skilling,
        "clues": {"all": num("Clue_all"), "tiers": [{"name": c.split("_")[1].title(), "count": num(c), "icon": CLUE_ICONS[c]} for c in CLUES]},
        "minigames": [{"name": m, "score": num(m), "rank": num(f"{m}_rank")} for m in MINIGAMES if num(m) > 0],
        "done": (clog or {}).get("total_collections_finished"), "total": (clog or {}).get("total_collections_available"),
        "cats_done": (clog or {}).get("total_categories_finished"), "cats_total": (clog or {}).get("total_categories_available"),
        "ehc": round((clog or {}).get("ehc") or 0, 1), "tabs": tabs, "pets": pets,
        "gains": gains, "items": recent[:25],
    }
    vodlib.save(vodlib.DATA / "osrs.json", out)
    print(f"OSRS: {name} cb {out['combat']}, total {out['total_level']}, {len(bosses)} bosses, log {out['done']}/{out['total']}, {len(recent)} recent")
