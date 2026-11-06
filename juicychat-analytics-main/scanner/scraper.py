"""Logs in to JuicyChat with a magic link and reads bots from Recent and
Trending. The site's layout isn't documented, so the scanner listens to the
data the site itself loads (its JSON) and also reads the visible bot cards as
a backup. Everything runs in a real, visible Chromium window whose login is
kept in data/browser-profile."""
import math
import re
import time
from datetime import datetime, timezone

from playwright.sync_api import sync_playwright

BASE = "https://juicychat.ai"
SECTION_WORDS = {
    "Recent": ["Recent", "New", "Newest", "Latest"],
    "Trending": ["Trending", "Hot"],
}

NAME_KEYS = ["name", "character_name", "char_name", "title", "nickname", "display_name"]
TEXT_KEYS = ["description", "intro", "introduction", "short_description", "tagline", "summary", "bio",
             "desc", "greeting", "first_message", "first_mes", "scenario", "personality", "prologue"]
TAG_KEYS = ["tags", "tag_list", "tag_names", "labels", "categories", "tagList", "characterTags", "character_tags", "characterTagList"]
ID_KEYS = ["id", "_id", "character_id", "characterId", "uuid", "slug", "bot_id"]
TIME_KEYS = ["created_at", "createdAt", "create_time", "createTime", "created", "publish_time",
             "published_at", "publishedAt"]
ENGAGE = re.compile(r"(chat|message|msg|conversation|interact|like|heart|favou?r|star|follow|"
                    r"view|visit|play|usage|user_count|popular|hot|heat|score|count)", re.I)
NOT_ENGAGE = re.compile(r"(id$|_id|time|date|age$|price|cost|level|length|size|width|height|index|"
                        r"page|limit|offset|total_pages|version|status|type|gender|token)", re.I)
CHAT_KEY = re.compile(r"(chat|message|msg|conversation|interact|play|usage|user_count)", re.I)
LIKE_KEY = re.compile(r"(like|heart|follow)", re.I)
FAV_KEY = re.compile(r"(favou?r|star|bookmark|collect)", re.I)
VIEW_KEY = re.compile(r"(view|visit)", re.I)


class Cancelled(Exception):
    pass


def _browser(p, profile_dir, headless=False):
    return p.chromium.launch_persistent_context(
        profile_dir, headless=headless, no_viewport=True,
        args=["--start-maximized", "--disable-blink-features=AutomationControlled"])


def _alive(ctx, state):
    return not state.get("closed") and len(ctx.pages) > 0


# -------------------------------------------------------------------- login
def login(profile_dir, magic_link, log, stop, timeout=600):
    state = {}
    with sync_playwright() as p:
        ctx = _browser(p, profile_dir)
        ctx.on("close", lambda *_: state.update(closed=True))
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        log("Opening your magic link in the JuicyChat window...")
        try:
            page.goto(magic_link, wait_until="domcontentloaded", timeout=60000)
        except Exception as e:
            log(f"The page was slow to load ({e.__class__.__name__}); carrying on.")
        log("Finish any sign-in steps in that window. When you can see you're logged in, "
            "close the window or click Done in the app.")
        t0 = time.time()
        while _alive(ctx, state) and not stop.is_set() and time.time() - t0 < timeout:
            try:
                ctx.pages[0].wait_for_timeout(1000)
            except Exception:
                break
        cookies = []
        if not state.get("closed"):
            try:
                cookies = [c for c in ctx.cookies() if "juicychat" in c.get("domain", "")]
                ctx.close()
            except Exception:
                pass
        log("Login window closed. Your session is saved for future scans.")
        return {"cookies": len(cookies), "at": datetime.now().isoformat(timespec="seconds")}


# --------------------------------------------------------------- extraction
def _num(v):
    if isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return float(v)
    if isinstance(v, str):
        m = re.fullmatch(r"\s*([\d,.]+)\s*([kKmM]?)\s*", v)
        if m:
            try:
                n = float(m.group(1).replace(",", ""))
            except ValueError:
                return None
            return n * {"k": 1e3, "m": 1e6}.get(m.group(2).lower(), 1)
    return None


def _time(v):
    try:
        if isinstance(v, (int, float)) and v > 1e9:
            return datetime.fromtimestamp(v / 1000 if v > 1e12 else v, tz=timezone.utc)
        if isinstance(v, str) and re.match(r"\d{4}-\d{2}-\d{2}", v):
            return datetime.fromisoformat(v.replace("Z", "+00:00")[:25])
    except Exception:
        return None
    return None


def _tags(v):
    out = []
    if isinstance(v, str):
        out = [t.strip() for t in re.split(r"[,#|]", v) if t.strip()]
    elif isinstance(v, list):
        for t in v:
            if isinstance(t, str):
                out.append(t.strip())
            elif isinstance(t, dict):
                for k in ("name", "title", "label", "tag", "tag_name", "tagName"):
                    if isinstance(t.get(k), str):
                        out.append(t[k].strip())
                        break
    return [t for t in out if 0 < len(t) < 60][:30]


def _bot_from(d):
    creator_raw = d.get("creator") or d.get("author") or d.get("user")
    creator_name = creator_raw.get("name") or creator_raw.get("nickname") or creator_raw.get("username") \
        if isinstance(creator_raw, dict) else creator_raw if isinstance(creator_raw, str) else None
    name = next((d[k] for k in NAME_KEYS if isinstance(d.get(k), str) and 0 < len(d[k]) < 120
                 and d[k].strip() != (creator_name or "").strip()), None)
    if not name:
        return None
    texts = {k: d[k] for k in TEXT_KEYS if isinstance(d.get(k), str) and len(d[k].strip()) > 15}
    tags = next((_tags(d[k]) for k in TAG_KEYS if d.get(k)), [])
    metrics = {}
    flat = dict(d)
    for k, v in d.items():
        if isinstance(v, dict):
            for k2, v2 in v.items():
                flat[f"{k}.{k2}"] = v2
    for k, v in flat.items():
        n = _num(v)
        if n is not None and n >= 0 and ENGAGE.search(k) and not NOT_ENGAGE.search(k.split(".")[-1]):
            metrics[k] = n
    if not (texts or tags) or not (metrics or any(d.get(k) for k in ID_KEYS)):
        return None
    created = next((_time(d[k]) for k in TIME_KEYS if d.get(k) is not None), None)
    desc = max(texts.values(), key=len) if texts else ""
    creator = d.get("creator") or d.get("author") or d.get("user")
    if isinstance(creator, dict):
        creator = creator.get("name") or creator.get("nickname") or creator.get("username")
    return {
        "id": str(next((d[k] for k in ID_KEYS if d.get(k)), name)),
        "name": name.strip(),
        "description": desc.strip()[:2500],
        "greeting": (d.get("greeting") or d.get("first_message") or d.get("first_mes") or "")[:1500]
        if isinstance(d.get("greeting") or d.get("first_message") or d.get("first_mes"), str) else "",
        "tags": tags,
        "metrics": metrics,
        "created": created.isoformat() if created else None,
        "creator": creator if isinstance(creator, str) else None,
        "source": "data",
    }


def _walk(obj, found, depth=0):
    if depth > 8:
        return
    if isinstance(obj, dict):
        b = _bot_from(obj)
        if b:
            found.append(b)
        for v in obj.values():
            if isinstance(v, (dict, list)):
                _walk(v, found, depth + 1)
    elif isinstance(obj, list):
        for v in obj[:500]:
            _walk(v, found, depth + 1)


DOM_JS = r"""() => {
  // One record per bot (/chat/<number>). For each card we look for the BOT's
  // name specifically and set aside the creator's name, which JuicyChat also
  // prints on the card (often above the bot name, so "first line" was wrong).
  const CREATOR = /creator|author|user|nick|owner|profile|avatar|by-?line/i;
  const NAMEISH = /(^|[\s_-])(name|title|char|character|bot)([\s_-]|$)|Name|Title/;
  const clean = t => (t || '').replace(/\s+/g, ' ').trim();
  const isCreatorText = t => /^(@|by\s)/i.test(t);
  const idOf = h => (h.match(/\/chat\/(\d{6,})/) || [])[1];
  function cardRoot(a) {           // climb while the box still holds only this bot
    const id = idOf(a.href); let root = a;
    for (let i = 0, e = a.parentElement; i < 6 && e && e !== document.body; i++, e = e.parentElement) {
      const ids = new Set([...e.querySelectorAll('a[href*="/chat/"]')].map(x => idOf(x.href)).filter(Boolean));
      if (ids.size !== 1 || !ids.has(id)) break;
      root = e;
    }
    return root;
  }
  function creatorOf(root) {
    for (const el of root.querySelectorAll('*')) {
      const t = clean(el.innerText);
      if (!t || t.length > 60 || el.children.length > 2) continue;
      if (CREATOR.test(String(el.className || '')) || isCreatorText(t)) return t.replace(/^(@|by\s+)/i, '');
    }
    const cl = root.querySelector('a[href*="/user"],a[href*="/profile"],a[href*="/creator"],a[href*="/u/"]');
    return cl ? clean(cl.innerText).replace(/^@/, '') : '';
  }
  function nameOf(root, creator) {
    const bad = t => !t || t.length > 90 || isCreatorText(t) || (creator && t.replace(/^@/, '') === creator) ||
                     /^[\d.,]+\s*[kKmM]?$/.test(t);
    for (const h of root.querySelectorAll('h1,h2,h3,h4,h5,h6,strong,b')) {
      const t = clean(h.innerText); if (!bad(t)) return [t, 'heading'];
    }
    for (const el of root.querySelectorAll('[class]')) {
      const c = String(el.className || '');
      if (!NAMEISH.test(c) || CREATOR.test(c) || el.children.length > 2) continue;
      const t = clean(el.innerText); if (!bad(t)) return [t, 'class'];
    }
    let best = null;
    for (const img of root.querySelectorAll('img[alt]')) {
      if (CREATOR.test(String(img.className || '')) || CREATOR.test(img.alt)) continue;
      const w = img.naturalWidth || img.width || 0;
      if (!bad(clean(img.alt)) && (!best || w > best.w)) best = {t: clean(img.alt), w};
    }
    if (best) return [best.t, 'image'];
    const lines = (root.innerText || '').split('\n').map(clean).filter(t => !bad(t));
    return [lines[0] || '', 'line'];
  }
  const out = new Map();
  document.querySelectorAll('a[href*="/chat/"]').forEach(a => {
    const h = a.href.split(/[?#]/)[0], id = idOf(h);
    if (!id || out.has(h)) return;
    const root = cardRoot(a);
    const creator = creatorOf(root);
    const [name, from] = nameOf(root, creator);
    const text = (root.innerText || '').trim().slice(0, 2000);
    // numbers shown next to icons (chat bubble, heart, star...) carry no words, so
    // collect each number with every hint around it: aria-label, title, alt, class,
    // svg <title>/<use>, data-* and the text right beside it
    const stats = [];
    const cls = e => String(e && e.className && e.className.baseVal !== undefined ? e.className.baseVal : (e && e.className) || '');
    const iconInfo = e => { if (!e) return ''; const svg = e.tagName === 'svg' ? e : e.querySelector && e.querySelector('svg');
      return [cls(e), e.getAttribute && (e.getAttribute('aria-label') || ''), e.getAttribute && (e.getAttribute('alt') || ''), e.getAttribute && (e.getAttribute('title') || ''), e.tagName === 'IMG' ? e.getAttribute('src') || '' : '',
        svg ? [cls(svg), (svg.querySelector('title') || {}).textContent || '', ((svg.querySelector('use') || {getAttribute: () => ''}).getAttribute('href') || '')].join(' ') : ''].join(' '); };
    const own = e => [e.getAttribute('aria-label') || '', e.getAttribute('title') || '', cls(e), ...[...e.attributes].filter(a => /^data-/.test(a.name)).map(a => a.name + ' ' + a.value)].join(' ');
    // closest hints first: the number itself and the icon right beside it, then its
    // container, then the container's container. Neighbouring counts are never mixed in.
    const hintOf = el => { const p = el.parentElement, g = p && p.parentElement;
      const icon = e => e && !/\d/.test(e.textContent || '') ? iconInfo(e) : '';
      return [own(el), icon(el.previousElementSibling) + ' ' + icon(el.nextElementSibling),
        p && p !== root ? own(p) + ' ' + [...p.children].filter(c => c !== el && !/\d/.test(c.textContent || '')).map(iconInfo).join(' ') : '',
        g && g !== root && p !== root ? own(g) : ''].map(x => x.slice(0, 400)); };
    for (const el of root.querySelectorAll('*')) {
      if (el.children.length) continue;                      // leaf elements only
      const t = (el.textContent || '').trim();
      if (!/^[\d][\d.,]*\s*[kKmM]?$/.test(t) || t.length > 9) continue;
      stats.push({value: t, hint: hintOf(el)});
      if (stats.length >= 8) break;
    }
    if (name || text) out.set(h, {href: h, text, name, nameFrom: from, creator, stats});
  });
  return [...out.values()];
}"""

COUNT_JS = r"""() => new Set([...document.querySelectorAll('a[href*="/chat/"]')]
  .map(a => a.href.split(/[?#]/)[0]).filter(h => /\/chat\/\d{6,}/.test(h))).size"""


def bot_num_id(x):
    m = re.search(r"(\d{6,})", str(x or ""))
    return m.group(1) if m else None


def _bot_from_dom(card):
    lines = [l.strip() for l in card["text"].split("\n") if l.strip()] or [card.get("name") or ""]
    if not any(lines):
        return None
    nums = []
    rest = []
    labeled = {}
    LABELED = re.compile(r"([\d][\d,.]*\s*[kKmM]?)\s*(chats?|conversations?|messages?|likes?|hearts?|favou?rites?|views?|plays?)(?![a-z])", re.I)
    for l in lines[1:]:
        hits = list(LABELED.finditer(l))
        if hits:                                   # "1.5k chats", "12 likes · 3k views"
            for h in hits:
                n = _num(h.group(1).replace(" ", ""))
                w = h.group(2).lower()
                key = "chats" if w.startswith(("chat", "conv", "mess")) else "likes" if w.startswith(("like", "heart", "fav")) else "views"
                if n is not None:
                    labeled[key] = max(labeled.get(key, 0), n)
            continue
        n = _num(l)
        if n is not None:
            nums.append(n)
        elif len(l) < 25 and not re.search(r"[.!?]", l):
            rest.append(("tag", l))
        else:
            rest.append(("text", l))
    creator = (card.get("creator") or "").strip()
    name = (card.get("name") or "").strip()
    if not name:
        name = next((l for l in lines if not re.match(r"^(@|by\s)", l, re.I) and l != creator), lines[0])
    stat_mode = "labeled" if labeled else ""
    unknown = []
    for st in card.get("stats") or []:
        n = _num(str(st.get("value", "")).replace(" ", ""))
        if n is None:
            continue
        levels = st.get("hint") or []
        levels = [levels] if isinstance(levels, str) else levels
        key = None
        for h in levels:                      # closest hint that names a stat wins
            h = str(h or "").lower()
            key = ("favorites" if re.search(r"fav|star|bookmark|collect|saved", h) else
                   "likes" if re.search(r"like|heart|thumb|love", h) else
                   "chats" if re.search(r"chat|message|comment|bubble|conversation|talk|dialog|msg", h) else
                   "views" if re.search(r"view|eye|visit|play", h) else None)
            if key:
                break
        if key:
            if key not in labeled:
                labeled[key] = n
                stat_mode = stat_mode or "icons"
        else:
            unknown.append(n)
    if not labeled and len(unknown) >= 2:
        # no icon hints at all: JuicyChat lists chats first, then likes, then favourites
        for key, n in zip(["chats", "likes", "favorites"], unknown):
            labeled[key] = n
        stat_mode = "position"
    return {
        "statMode": stat_mode,
        "id": bot_num_id(card["href"]) or card["href"], "name": name[:120],
        "nameStrong": card.get("nameFrom") in ("heading", "class", "image"),
        "description": " ".join(t for k, t in rest if k == "text")[:2500], "greeting": "",
        # v1.3.4: JuicyChat's tags are its own fixed list. On a bot card read from the page, a short line was taken as a tag, so the bot's name and the
        # creator's name ("@The Futa King") were stored as tags. Those lines are left out here; the app also keeps only JuicyChat's real tags.
        "tags": [t for k, t in rest if k == "tag" and t.strip().lower() not in {name.strip().lower(), creator.strip().lower(), creator.strip().lstrip("@").lower()}
                 and not re.match(r"^\s*(@|by\s)", t, re.I)][:12],
        "metrics": {**({"card_number": max(nums)} if nums else {}), **labeled},
        "created": None, "creator": creator or None, "url": card["href"], "source": "page",
    }


# --------------------------------------------------------------------- scan
def _click_section(page, section, log):
    for word in SECTION_WORDS[section]:
        pat = re.compile(rf"^\s*{word}\s*$", re.I)
        for loc in (page.get_by_role("tab", name=pat), page.get_by_role("button", name=pat),
                    page.get_by_role("link", name=pat), page.get_by_text(pat)):
            try:
                if loc.count() > 0:
                    loc.first.click(timeout=5000)
                    page.wait_for_timeout(2500)
                    log(f"Opened '{word}'.")
                    return True
            except Exception:
                continue
    return False


def _scroll(page, times, stop):
    for _ in range(times):
        if stop.is_set():
            raise Cancelled()
        try:
            page.mouse.wheel(0, 2600)
            page.wait_for_timeout(1300)
        except Exception:
            return


def scan(profile_dir, settings, log, stop, manual=False):
    captured, dom = [], []
    current = {"section": "Manual" if manual else "Recent"}
    state = {}
    learned = {}

    def on_response(resp):
        try:
            if "json" not in resp.headers.get("content-type", ""):
                return
            if "juicychat" not in resp.url and "juicy" not in resp.url:
                return
            captured.append({"section": current["section"], "data": resp.json()})
        except Exception:
            pass

    with sync_playwright() as p:
        ctx = _browser(p, profile_dir, headless=bool(settings.get("hidden_browser")) and not manual)
        ctx.on("close", lambda *_: state.update(closed=True))
        ctx.on("response", on_response)
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            page.goto(BASE, wait_until="domcontentloaded", timeout=60000)
            page.wait_for_timeout(3000)
        except Exception as e:
            log(f"JuicyChat was slow to load ({e.__class__.__name__}).")

        scrolls = int(settings.get("scrolls", 8))
        try:
            if manual:
                log("Browse Recent, Trending, or any list you want analyzed. Scroll down so more bots "
                    "load. Click Finish in the app (or close the window) when you're done.")
                while _alive(ctx, state) and not stop.is_set():
                    try:
                        pg = ctx.pages[-1]
                        u = pg.url.lower()
                        current["section"] = "Recent" if re.search(r"recent|new|latest", u) else \
                            "Trending" if re.search(r"trend|hot", u) else "Manual"
                        pg.wait_for_timeout(1500)
                        if len(dom) < 5000:
                            dom.extend({**c, "section": current["section"]} for c in pg.evaluate(DOM_JS))
                    except Exception:
                        if state.get("closed"):
                            break
            else:
                for section in ("Recent", "Trending"):
                    current["section"] = section
                    url = (settings.get(f"{section.lower()}_url") or "").strip()
                    if url:
                        page.goto(url, wait_until="domcontentloaded", timeout=60000)
                        page.wait_for_timeout(3000)
                        log(f"Opened your saved {section} address.")
                    else:
                        page.goto(BASE, wait_until="domcontentloaded", timeout=60000)
                        page.wait_for_timeout(2500)
                        if not _click_section(page, section, log):
                            log(f"Couldn't find a '{section}' button. Paste its address in Settings, "
                                f"or use 'Browse and capture' instead.")
                            continue
                        learned[section] = page.url
                    _scroll(page, scrolls, stop)
                    dom.extend({**c, "section": section} for c in page.evaluate(DOM_JS))
                    log(f"{section}: page read.")
        except Cancelled:
            log("Scan stopped early; keeping what was collected.")
        finally:
            if not state.get("closed"):
                try:
                    ctx.close()
                except Exception:
                    pass

    return _assemble(captured, dom, learned)


def _assemble(captured, dom, learned):
    bots = {}

    def add(b, section):
        key = b["id"] if b["id"] != b["name"] else b["name"].lower()
        prev = bots.get(key)
        if not prev:
            # Only merge by name when the two records can't be told apart by id.
            # (Previously two different bots that shared a name were merged into one.)
            nid = bot_num_id(b["id"])
            prev = next((v for v in bots.values() if v["name"].lower() == b["name"].lower()
                         and not (nid and bot_num_id(v["id"]) and nid != bot_num_id(v["id"]))), None)
        if prev:
            prev["sections"] = sorted(set(prev["sections"]) | {section})
            for k in ("description", "greeting"):
                if len(b.get(k) or "") > len(prev.get(k) or ""):
                    prev[k] = b[k]
            if b.get("nameStrong") and b.get("name"):
                prev["name"] = b["name"]
            elif prev.get("creator") and prev["name"].strip().lower() == str(prev["creator"]).strip().lower() \
                    and b.get("name") and b["name"].lower() != prev["name"].lower():
                prev["name"] = b["name"]
            prev["creator"] = prev.get("creator") or b.get("creator")
            prev["tags"] = prev["tags"] or b["tags"]
            prev["metrics"] = {**b["metrics"], **prev["metrics"]} if prev["source"] == "data" else \
                {**prev["metrics"], **b["metrics"]}
            prev["created"] = prev["created"] or b["created"]
        else:
            b["sections"] = [section]
            bots[key] = b

    for c in captured:
        found = []
        _walk(c["data"], found)
        for b in found:
            add(b, c["section"])
    for card in dom:
        b = _bot_from_dom(card)
        if b:
            add(b, card["section"])

    out = list(bots.values())
    score_bots(out)
    return {"bots": out, "learned_urls": learned,
            "at": datetime.now().isoformat(timespec="seconds"),
            "sections": sorted({s for b in out for s in b["sections"]})}


def score_bots(bots):
    """Give each bot a 0-100 engagement score, ranked inside its section.
    Recent bots are judged on speed (engagement per hour since creation)."""
    now = datetime.now(timezone.utc)
    for b in bots:
        m = b["metrics"]
        chats = max([v for k, v in m.items() if CHAT_KEY.search(k)] or [0])
        likes = max([v for k, v in m.items() if LIKE_KEY.search(k) and not FAV_KEY.search(k)] or [0])
        favorites = max([v for k, v in m.items() if FAV_KEY.search(k)] or [0])
        views = max([v for k, v in m.items() if VIEW_KEY.search(k)] or [0])
        other = max(m.values()) if m else 0
        raw = 0.6 * math.log10(1 + chats) + 0.3 * math.log10(1 + likes) + 0.1 * math.log10(1 + views)
        if raw == 0:
            raw = math.log10(1 + other)
        b["raw_engagement"] = round(raw, 4)
        b["headline"] = {"chats": chats, "likes": likes, "views": views, "favorites": favorites}
        speed = None
        if b.get("created"):
            try:
                hours = max(1.0, (now - datetime.fromisoformat(b["created"])).total_seconds() / 3600)
                speed = raw / math.log10(10 + hours)
            except Exception:
                pass
        b["speed"] = speed
    for section in {s for b in bots for s in b["sections"]}:
        group = [b for b in bots if section in b["sections"]]
        use_speed = section == "Recent" and sum(1 for b in group if b["speed"] is not None) > len(group) / 2
        vals = sorted(((b["speed"] if use_speed and b["speed"] is not None else b["raw_engagement"]), i)
                      for i, b in enumerate(group))
        n = len(vals)
        if n and vals[0][0] == vals[-1][0]:
            # the page showed no numbers: being listed here is the only signal
            for b in group:
                b["score"] = max(b.get("score", 0), 70)
            continue
        for rank, (_, i) in enumerate(vals):
            pct = round(100 * (rank + 1) / n) if n else 0
            group[i]["score"] = max(group[i].get("score", 0), pct)
    for b in bots:
        b.setdefault("score", 0)
        b["high"] = b["score"] >= 70
