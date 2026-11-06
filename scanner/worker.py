import json
import os
import re
import sys
import threading
import time
from datetime import datetime, timezone

import scraper
from playwright.sync_api import sync_playwright


def emit(kind, **payload):
    msg = {"type": kind, **payload}
    print(json.dumps(msg, ensure_ascii=True), flush=True)


def log(message):
    emit("log", message=str(message), at=datetime.now().isoformat(timespec="seconds"))


def monitor_stop(path, event):
    while not event.is_set():
        if path and os.path.exists(path):
            event.set()
            return
        time.sleep(0.15)


def _tag_norm(t):
    return re.sub(r"[\W_]+", " ", str(t or "").lower().lstrip("#"), flags=re.UNICODE).strip()


def blocked_tags():
    """Tags the user blocked in Settings (the app passes them in JBS_BLOCKED_TAGS). Bots carrying one are skipped while collecting."""
    try:
        raw = json.loads(os.environ.get("JBS_BLOCKED_TAGS") or "[]")
    except Exception:
        raw = []
    return {n for n in (_tag_norm(t) for t in raw if isinstance(t, str)) if n}


def skip_record(row, hit, section):
    """What the app shows for a bot that was left out because of a blocked tag."""
    tags = []
    for t in (row.get("tags") or []):
        name = t if isinstance(t, str) else (t.get("name") or t.get("tagName") or t.get("title") or "") if isinstance(t, dict) else ""
        if name:
            tags.append(str(name).lstrip("#").strip())
    return {"id": str(row.get("id") or ""), "name": (row.get("name") or row.get("title") or "A bot").strip()[:80], "url": row.get("url") or "",
            "section": section, "tags": tags[:30], "blocked": list(hit)}


def blocked_hits(row, blocked):
    if not blocked:
        return []
    out = []
    for t in (row.get("tags") or []):
        name = t if isinstance(t, str) else (t.get("name") or t.get("tagName") or t.get("title") or t.get("label") or "") if isinstance(t, dict) else ""
        if _tag_norm(name) in blocked:
            out.append(str(name).lstrip("#").strip())
    return out


def normalize_bot(b, section):
    name = (b.get("name") or "").strip()
    url = b.get("url") or ""
    bid = str(b.get("id") or "")
    # The working scraper intentionally has a broad DOM fallback. For the desktop
    # app, discard obvious navigation links while preserving its actual bot rows.
    if b.get("source") == "page":
        if not re.search(r"/chat/\d{6,}(?:$|[/?#])", url):
            return None
    if name.lower() in {
        "juicychat.ai", "juicychat pwa", "store", "recent chats", "create", "search",
        "photo creation", "photos", "70% off", "pricing", "home"
    }:
        return None
    metrics = b.get("metrics") or {}
    headline = b.get("headline") or {}
    chats = float(headline.get("chats") or 0)
    likes = float(headline.get("likes") or 0)
    views = float(headline.get("views") or 0)
    favorites = float(headline.get("favorites") or 0)
    engagement = max([chats, likes, views] + [float(v) for v in metrics.values() if isinstance(v, (int, float))] + [0])
    if not url and bid.isdigit() and len(bid) >= 6:
        url = f"https://juicychat.ai/chat/{bid}"
    return {
        "id": bid or url or name.lower(),
        "url": url,
        "title": name,
        "name": name,
        "description": b.get("description") or "",
        "greeting": b.get("greeting") or "",
        "tags": b.get("tags") or [],
        "creator": b.get("creator") or "",
        "imageUrl": b.get("imageUrl") or "",
        "metrics": metrics,
        "headline": {"chats": chats, "likes": likes, "views": views, "favorites": favorites},
        "statMode": b.get("statMode") or ("data" if b.get("source") == "data" and (chats or likes) else ""),
        "engagementEstimate": engagement or None,
        "created": b.get("created"),
        "published": b.get("published"),        # JuicyChat's own "Publish:" date (first publish), when the data has it
        "rawText": " ".join([name, b.get("description") or "", " ".join(b.get("tags") or [])]).strip(),
        "network": b.get("source") == "data",
        "sourceType": b.get("source") or "page",
        "source": section,
    }


def announce_bots(rows, seen, section, owner="", limit=400):
    """One Live-activity line per newly read bot: its name and who made it."""
    n = 0
    for r in rows:
        key = str(r.get("id") or r.get("url") or r.get("name"))
        if key in seen:
            continue
        seen.add(key)
        n += 1
        if n > limit:
            continue
        name = (r.get("name") or r.get("title") or "(no name)").strip()[:70]
        who = (r.get("creator") or owner or "").strip()[:40]
        log(f"{section}: {name}" + (f"  by {who}" if who else ""))
    return n


def announce_feeds(rows, limit=60):
    """Live-activity lines for the bots that were found in a feed (name and where)."""
    n = 0
    for r in rows:
        f = r.get("feeds") or {}
        if not f:
            continue
        n += 1
        if n > limit:
            continue
        where = ", ".join(f"{k} #{v}" for k, v in list(f.items())[:4])
        log(f"Feed: {(r.get('name') or r.get('title') or '').strip()[:60]} is at {where}")
    return n


def _look_like_chrome(ctx):
    # Chromium's no-window mode announces itself as "HeadlessChrome" in the user agent; send the plain Chrome one instead.
    def fix(page):
        try:
            cdp = ctx.new_cdp_session(page)
            ua = cdp.send("Browser.getVersion")["userAgent"].replace("HeadlessChrome", "Chrome")
            cdp.send("Emulation.setUserAgentOverride", {"userAgent": ua})
        except Exception:
            pass
    for pg in list(ctx.pages):
        fix(pg)
    ctx.on("page", fix)


def launch_scan_context(p, profile_dir, hidden=False):
    # Every collection (Recent/Trending, tags, lounge and account reads) runs with NO window at all: the
    # same real Chromium in its no-window mode (--headless=new), so nothing appears on screen or in the taskbar.
    # The progress bar in the app is what shows what it is doing.
    args = ["--disable-blink-features=AutomationControlled"]
    if hidden:
        args += ["--headless=new", "--window-size=1280,900", "--no-first-run", "--no-default-browser-check"]
        ctx = p.chromium.launch_persistent_context(profile_dir, headless=False, viewport={"width": 1280, "height": 860}, args=args)
        _look_like_chrome(ctx)
        return ctx
    # Open on the screen the app window is on: the browser would otherwise reopen where it was last (it can be a screen you can't see).
    # The point is a little inside that screen, then the window is maximized there.
    try:
        bx, by, bw, bh = [int(float(v)) for v in os.environ.get("JBS_SCAN_BOUNDS", "").split(",")]
        args += ["--window-position=%d,%d" % (bx + 40, by + 40), "--window-size=%d,%d" % (max(800, bw - 80), max(600, bh - 80))]
    except Exception:
        pass
    return p.chromium.launch_persistent_context(profile_dir, headless=False, no_viewport=True, args=["--start-maximized"] + args)


def _wait_for_list(page, stop, max_wait=20.0, quiet=3.0):
    """Wait until the number of bot cards on the page stops changing."""
    t0 = time.time()
    last, since = -1, time.time()
    while time.time() - t0 < max_wait and not stop.is_set():
        try:
            n = page.evaluate(scraper.COUNT_JS)
        except Exception:
            n = last
        if n != last:
            last, since = n, time.time()
        elif n > 0 and time.time() - since >= quiet:
            break
        page.wait_for_timeout(500)
    return max(last, 0)


def _nudge_down(page):
    """Bring the last card on screen so lazy cards render, without flinging the
    page to the bottom (which is what kept triggering JuicyChat to load more)."""
    try:
        page.evaluate("""() => {
          const a = [...document.querySelectorAll('a[href*="/chat/"]')].pop();
          if (a) a.scrollIntoView({block: 'end'});
        }""")
        page.wait_for_timeout(1200)
    except Exception:
        pass


FIRST_IDS_JS = r"""(n) => { const out = [];
  for (const a of document.querySelectorAll('a[href*="/chat/"]')) {
    const m = a.href.match(/\/chat\/(\d{6,})/);
    if (m && !out.includes(m[1])) out.push(m[1]);
    if (out.length >= n) break;
  } return out; }"""

ACTIVE_JS = r"""(el) => { let e = el;
  for (let i = 0; i < 3 && e; i++, e = e.parentElement) {
    if (e.getAttribute('aria-selected') === 'true' || e.getAttribute('aria-pressed') === 'true' ||
        (e.getAttribute('aria-current') && e.getAttribute('aria-current') !== 'false') ||
        e.getAttribute('data-state') === 'active' ||
        /(^|[\s_-])(active|selected|current|checked)([\s_-]|$)/i.test(String(e.className || ''))) return true;
  } return false; }"""

OTHER_TABS = {"Recent": ["Popular", "Trending", "Hot", "For You"], "Trending": ["Popular", "Recent", "New", "For You"]}


def _tab_candidates(page, word):
    pat = re.compile(rf"^\s*{re.escape(word)}\s*$", re.I)
    for loc in (page.get_by_role("tab", name=pat), page.get_by_role("button", name=pat),
                page.get_by_role("link", name=pat), page.get_by_text(pat)):
        try:
            n = loc.count()
        except Exception:
            continue
        for i in range(min(n, 6)):
            el = loc.nth(i)
            try:
                if el.is_visible():
                    yield el
            except Exception:
                continue


def _first_ids(page):
    try:
        return page.evaluate(FIRST_IDS_JS, 12)
    except Exception:
        return []


# ------------------------------------------------------------ Claim Coins overlay
# On the first visit of the day (or after a reset) JuicyChat can show a daily
# "Claim Coins" pop-up that covers the page, so tabs can't be clicked. Click its
# Claim button, dismiss any follow-up pop-up, then carry on.
OVERLAY_JS = r"""(mode) => {
  const vis = e => { const r = e.getBoundingClientRect(), st = getComputedStyle(e); return r.width > 4 && r.height > 4 && st.visibility !== 'hidden' && st.display !== 'none' && +st.opacity > 0.05; };
  // an element that floats over the page: fixed/absolute with a z-index, or a dialog/modal
  const inOverlay = e => { for (let x = e; x && x !== document.body; x = x.parentElement) { const st = getComputedStyle(x), c = String(x.className || '') + ' ' + (x.getAttribute('role') || '');
      if (/dialog|modal|popup|pop-up|overlay|mask|drawer|toast|reward|checkin|check-in|sign-?in-?bonus/i.test(c) || x.getAttribute('aria-modal') === 'true') return true;
      if ((st.position === 'fixed' || st.position === 'absolute') && (+st.zIndex || 0) >= 10) return true; } return false; };
  const text = e => (e.innerText || e.textContent || '').replace(/\s+/g, ' ').trim();
  const want = mode === 'claim' ? /^claim(\s+(coins?|now|reward|rewards|daily|bonus|gift|it))?(\s*[!.])?$|^claim\s+\d+\s*coins?$/i
                                : /^(ok|okay|got it|close|continue|done|great|thanks|thank you|×|✕|x)$/i;
  const nodes = [...document.querySelectorAll('button,[role=button],a,div,span')].filter(e => vis(e) && text(e).length <= 30 && want.test(text(e)) && inOverlay(e));
  if (mode !== 'claim') for (const e of document.querySelectorAll('[aria-label]')) if (vis(e) && /^(close|dismiss)$/i.test(e.getAttribute('aria-label')) && inOverlay(e)) nodes.push(e);
  // smallest match first (the button itself, not its wrapper)
  nodes.sort((a, b) => a.getBoundingClientRect().width * a.getBoundingClientRect().height - b.getBoundingClientRect().width * b.getBoundingClientRect().height);
  const e = nodes[0]; if (!e) return null;
  e.setAttribute('data-jbs-overlay', mode); return text(e) || e.getAttribute('aria-label') || mode;
}"""

# ------------------------------------------------------------ 18+ age pop-up
# JuicyChat can cover a lounge (or the home page) with an "Are you 18+?" pop-up. It has to be
# confirmed before the page's bots can be read. Only a button INSIDE a pop-up is clicked, and
# never one that says under 18 / no / exit / leave.
AGE_JS = r"""() => {
  const vis = e => { const r = e.getBoundingClientRect(), st = getComputedStyle(e); return r.width > 4 && r.height > 4 && st.visibility !== 'hidden' && st.display !== 'none' && +st.opacity > 0.05; };
  const text = e => (e.innerText || e.textContent || '').replace(/\s+/g, ' ').trim();
  // the pop-up an element sits in: a dialog / modal, or a big fixed layer. A small badge on a bot card is not one.
  const popupOf = e => { for (let x = e; x && x !== document.body; x = x.parentElement) { const st = getComputedStyle(x), r = x.getBoundingClientRect(), c = String(x.className && x.className.baseVal !== undefined ? x.className.baseVal : x.className || '') + ' ' + (x.getAttribute('role') || '');
      if (x.getAttribute('aria-modal') === 'true' || /dialog|modal|popup|pop-up|overlay|mask|drawer/i.test(c)) return x;
      if (st.position === 'fixed' && r.width >= 240 && r.height >= 120) return x; } return null; };
  const bad = /under|below|younger|less than|\bno\b|\bnot\b|exit|leave|cancel|decline|back|<\s*18/i;
  const says18 = /18\s*\+|(^|\D)18(\D|$)|(over|above|at least|older than)\s*18/i;
  const cards = e => { const a = e.closest && e.closest('a[href]'); return a && /\/(chat|userdetailspace)\//.test(a.getAttribute('href') || ''); };
  const all = [...document.querySelectorAll('button,[role=button],a,div,span,label')].filter(e => vis(e) && !cards(e) && popupOf(e));
  let nodes = all.filter(e => { const t = text(e); return t.length > 0 && t.length <= 40 && says18.test(t) && !bad.test(t); });
  if (!nodes.length) {                                        // the pop-up talks about age: take its Enter / Yes / Confirm / Continue button
    const talks = all.some(e => { const t = text(e); return t.length > 20 && t.length < 800 && /18\s*\+|over\s*18|\bage\b|adult|mature|explicit|nsfw/i.test(t); });
    if (talks) nodes = all.filter(e => { const t = text(e); return t.length > 0 && t.length <= 30 && /^(yes|enter|confirm|continue|agree|i agree|i am|i'm|ok|okay|proceed|accept)\b/i.test(t) && !bad.test(t); });
  }
  nodes.sort((a, b) => a.getBoundingClientRect().width * a.getBoundingClientRect().height - b.getBoundingClientRect().width * b.getBoundingClientRect().height);
  const e = nodes[0]; if (!e) return null;
  e.setAttribute('data-jbs-age', '1'); return text(e) || 'age';
}"""

def clear_age_gate(page, log=None):
    """Click the 18+ confirmation pop-up if one is showing. True if clicked."""
    clicked = False
    try:
        for _ in range(3):
            label = page.evaluate(AGE_JS)
            if not label:
                break
            try:
                page.locator('[data-jbs-age="1"]').first.click(timeout=5000)
            except Exception:
                page.evaluate("() => { const e = document.querySelector('[data-jbs-age=\"1\"]'); if (e) e.click(); }")
            page.evaluate("() => document.querySelectorAll('[data-jbs-age]').forEach(e => e.removeAttribute('data-jbs-age'))")
            clicked = True
            if log:
                log(f"Confirmed the 18+ pop-up (\"{label}\") so the page could be read.")
            page.wait_for_timeout(1500)
    except Exception as e:
        if log:
            log(f"Couldn't check for the 18+ pop-up ({str(e)[:120]}).")
    return clicked


def clear_claim_overlay(page, log=None, wait=1500):
    """Click a Claim Coins pop-up (and any follow-up pop-up) if one is showing. True if clicked."""
    clicked = aged = False
    try:
        page.wait_for_timeout(wait)
        aged = clear_age_gate(page, log)                    # an 18+ pop-up can sit over the page before anything else shows
        for _ in range(3):                                   # the pop-up can take a moment, or come back once
            label = page.evaluate(OVERLAY_JS, "claim")
            if not label:
                break
            try:
                page.locator('[data-jbs-overlay="claim"]').first.click(timeout=5000)
            except Exception:
                page.evaluate("() => { const e = document.querySelector('[data-jbs-overlay=\"claim\"]'); if (e) e.click(); }")
            clicked = True
            if log:
                log(f"Claimed the daily coins pop-up (\"{label}\") so the page could be used.")
            page.wait_for_timeout(1500)
        if clicked:
            for _ in range(2):                               # "Got it" / "OK" / close after claiming
                label = page.evaluate(OVERLAY_JS, "close")
                if not label:
                    break
                try:
                    page.locator('[data-jbs-overlay="close"]').first.click(timeout=4000)
                except Exception:
                    page.evaluate("() => { const e = document.querySelector('[data-jbs-overlay=\"close\"]'); if (e) e.click(); }")
                page.wait_for_timeout(900)
    except Exception as e:
        if log:
            log(f"Couldn't check for the Claim Coins pop-up ({str(e)[:120]}).")
    return clicked or aged


def clear_any_popup(page, log=None):
    """v1.3.4: close whatever pop-up sits over the page (an event or promotion announcement, a notice), not only the Claim Coins and 18+ ones:
    Escape first, then a Close / OK / x button inside the pop-up. True if something was done."""
    done = clear_claim_overlay(page, log, wait=0)
    try:
        page.keyboard.press("Escape")
        page.wait_for_timeout(600)
        for _ in range(3):
            label = page.evaluate(OVERLAY_JS, "close")
            if not label:
                break
            try:
                page.locator('[data-jbs-overlay="close"]').first.click(timeout=4000)
            except Exception:
                page.evaluate("() => { const e = document.querySelector('[data-jbs-overlay=close]'); if (e) e.click(); }")
            page.evaluate("() => document.querySelectorAll('[data-jbs-overlay]').forEach(e => e.removeAttribute('data-jbs-overlay'))")
            done = True
            if log:
                log(f"Closed a pop-up over the page (\"{label}\").")
            page.wait_for_timeout(900)
    except Exception:
        pass
    return done


def _click_and_wait_change(page, el, before, wait=15.0):
    try:
        el.click(timeout=5000)
    except Exception:
        # usually a pop-up sitting over the page: close it and try again; if the tab still can't be clicked, click it from inside the page
        clear_any_popup(page, log)
        try:
            el.click(timeout=5000)
        except Exception:
            try:
                el.evaluate("e => e.click()")
            except Exception:
                return False
    t0 = time.time()
    while time.time() - t0 < wait:
        page.wait_for_timeout(500)
        now = _first_ids(page)
        if now and now != before:
            page.wait_for_timeout(1500)   # let the rest of the list land
            return True
    return False


def switch_tab(page, section):
    """Open the Recent/Trending tab and PROVE the bot list actually switched.
    Old behaviour clicked and immediately read, so it read whatever tab was
    showing before (Popular on first run, the last-used tab after that)."""
    words = scraper.SECTION_WORDS[section]
    for word in words:
        for el in _tab_candidates(page, word):
            before = _first_ids(page)
            try:
                was_active = el.evaluate(ACTIVE_JS)
            except Exception:
                was_active = False
            if _click_and_wait_change(page, el, before):
                return word
            if was_active and before:
                return word   # JuicyChat was already on this tab
            # List didn't change and we can't tell if it's active: hop to another
            # tab, then come back, so the switch is visible either way.
            for other in OTHER_TABS[section]:
                for o in _tab_candidates(page, other):
                    if _click_and_wait_change(page, o, _first_ids(page)):
                        if _click_and_wait_change(page, el, _first_ids(page)):
                            return word
                        break
    return None


def scan_section(profile_dir, section, target, stop, max_passes=25):
    if blocked_tags():
        max_passes = max(max_passes, 60)      # bots with a blocked tag do not count, so more scrolling may be needed to reach the target
    captured = []
    dom = []
    order = []          # bot ids in the order they appear on the page
    state = {}
    current = {"section": section}
    clicked = False

    def on_response(resp):
        try:
            if "json" not in resp.headers.get("content-type", ""):
                return
            if "juicychat" not in resp.url and "juicy" not in resp.url:
                return
            captured.append({"section": current["section"], "data": resp.json()})
        except Exception:
            pass

    def read_page():
        try:
            cards = page.evaluate(scraper.DOM_JS)
        except Exception:
            return 0
        known = {c["href"] for c in dom}
        for c in cards:
            if c["href"] not in known:
                dom.append({**c, "section": section})
                bid = scraper.bot_num_id(c["href"])
                if bid and bid not in order:
                    order.append(bid)
        return len(cards)

    def build_rows_all():
        assembled = scraper._assemble(captured, dom, {})
        by_id, loose = {}, []
        for b in assembled.get("bots", []):
            nb = normalize_bot(b, section)
            if not nb:
                continue
            bid = scraper.bot_num_id(nb.get("url")) or scraper.bot_num_id(nb.get("id"))
            if bid and bid not in by_id:
                by_id[bid] = nb
            elif not bid:
                loose.append(nb)
        if order:
            # The cards on the page ARE the Recent/Trending list. Use them, in page
            # order, and enrich each one with JuicyChat's own data when available.
            # JSON from other rows on the homepage no longer gets counted here.
            return [by_id[i] for i in order if i in by_id]
        return list(by_id.values()) + loose

    blocked = blocked_tags()
    skipped = {}

    def build_rows():
        # bots with a blocked tag never count toward the target, so the scan keeps going until it has enough that are allowed
        rows = build_rows_all()
        if not blocked:
            return rows
        keep = []
        for r in rows:
            hit = blocked_hits(r, blocked)
            if hit:
                key = r.get("url") or r.get("id") or r.get("name")
                if key not in skipped:
                    skipped[key] = skip_record(r, hit, section)
                    log(f"Skipped {(r.get('name') or r.get('title') or 'a bot').strip()[:60]}: blocked tag {', '.join(hit)}")
            else:
                keep.append(r)
        return keep

    with sync_playwright() as p:
        ctx = launch_scan_context(p, profile_dir, hidden=True)
        ctx.on("close", lambda *_: state.update(closed=True))
        ctx.on("response", on_response)
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            emit("progress", stage="opening", status="starting", section=section, current=0, target=target,
                 passNo=0, maxPasses=max_passes, pageCards=0, networkResponses=0,
                 message=f"Opening JuicyChat for {section}...")
            try:
                page.goto(scraper.BASE, wait_until="domcontentloaded", timeout=60000)
                page.wait_for_timeout(3000)
            except Exception as e:
                log(f"JuicyChat was slow to load ({e.__class__.__name__}).")

            clear_claim_overlay(page, log)
            if os.environ.get("JBS_EXPECT_SIGNED_IN") == "1":
                me0 = who_am_i(page)
                if me0 is not None and not me0.get("ok"):
                    raise RuntimeError("This account is logged out. You need to log back in to scrape: paste its magic link to log back in.")
            word = switch_tab(page, section)
            if not word:
                # v1.3.4: one more try on a freshly loaded page, after closing any pop-up, with more time for the list to load (a run at
                # Windows start-up can begin while the computer and the connection are still waking up)
                log(f"Couldn't confirm the {section} tab yet; loading JuicyChat again and trying once more.")
                try:
                    page.goto(scraper.BASE, wait_until="domcontentloaded", timeout=60000)
                    page.wait_for_timeout(6000)
                except Exception as e:
                    log(f"JuicyChat was slow to load again ({e.__class__.__name__}).")
                clear_claim_overlay(page, log)
                clear_any_popup(page, log)
                word = switch_tab(page, section)
            clicked = bool(word)
            if not word:
                raise RuntimeError(
                    f"Couldn't confirm JuicyChat switched to the {section} tab, so nothing was collected "
                    f"(this stops Popular or another tab's bots being saved as {section}).")
            log(f"Switched to the '{word}' tab and confirmed the bot list changed.")

            on_page = _wait_for_list(page, stop)
            log(f"{section}: {on_page} bot cards already on the page before any scrolling.")
            try:
                first = [(c.get("name") or c["text"].split("\n")[0]).strip() for c in page.evaluate(scraper.DOM_JS)[:3]]
                log(f"{section}: first bots on this tab: {', '.join(first)}")
                ex = page.evaluate(scraper.DOM_JS)[:1]
                if ex:
                    log(f"{section}: name read as '{ex[0].get('name')}' (from {ex[0].get('nameFrom')}), "
                        f"creator '{ex[0].get('creator') or 'not found'}'")
            except Exception:
                pass

            rows = []
            announced = set()
            stagnant = 0
            for pass_no in range(1, max_passes + 1):
                if stop.is_set():
                    break
                if state.get("closed"):
                    log(f"Scan window was closed; keeping the {len(rows)} {section} bots already read.")
                    break
                page_cards = read_page()
                before = len(rows)
                rows = build_rows()
                count = len(rows)
                announce_bots(rows[:target], announced, section)
                stagnant = stagnant + 1 if count <= before and pass_no > 1 else 0
                emit("progress", stage="collecting", status="collecting", section=section,
                     current=min(count, target), target=target, passNo=pass_no, maxPasses=max_passes,
                     pageCards=page_cards, networkResponses=len(captured), stagnantPasses=stagnant,
                     clickedSection=clicked,
                     message=f"{section}: {min(count, target)}/{target} bots captured "
                             f"({page_cards} cards readable on page)")
                if count >= target:
                    log(f"{section}: target reached from the cards already loaded. No more loading.")
                    break
                if stagnant >= 4:
                    log(f"{section}: page stopped showing new cards; keeping {count}. "
                        f"Not clicking 'Load more'.")
                    break
                # Short of target: only nudge the list so lazy cards render.
                _nudge_down(page)
                _wait_for_list(page, stop, max_wait=6.0, quiet=1.5)

            rows = rows[:target]
            if skipped:
                log(f"{section}: skipped {len(skipped)} bots with a blocked tag.")
            for i, row in enumerate(rows, 1):
                row["rank"] = i
                row["collectedAt"] = datetime.now().isoformat(timespec="seconds")
            return rows, clicked, list(skipped.values())
        finally:
            try:
                if not state.get("closed"):
                    ctx.close()
            except Exception:
                pass


PROFILE_LINKS_JS = r"""() => {
  // Links that can lead to the signed-in creator's own bot list.
  const re = /\/(profile|profiles|user|users|creator|creators|u|author|me|account|my)(\/|$|\?)|my[-_]?(characters?|bots?|creations?)|\/characters\/mine/i;
  const out = [];
  for (const a of document.querySelectorAll('a[href]')) {
    const h = a.href.split('#')[0];
    if (!h.startsWith(location.origin) || /\/chat\//.test(h) || /logout|signout|settings|billing|pricing|store/i.test(h)) continue;
    if (re.test(new URL(h).pathname) && !out.includes(h)) out.push(h);
  }
  return out.slice(0, 8);
}"""
MENU_JS = r"""() => {
  // Open the avatar / account menu so its links (My Characters, Profile) exist.
  const c = [...document.querySelectorAll('header img, nav img, [class*=avatar], [aria-label*=account i], [aria-label*=profile i], [aria-label*=menu i]')]
    .filter(e => e.offsetParent !== null);
  const el = c.find(e => /avatar|account|profile|user/i.test((e.className || '') + (e.getAttribute('aria-label') || '') + (e.alt || ''))) || c[0];
  if (el) { (el.closest('button,a,[role=button]') || el).click(); return true; }
  return false;
}"""
TAB_WORDS = ["My Characters", "My Bots", "Characters", "Created", "Creations", "Bots", "Published"]



# ---------------------------------------------------------------- bot stats
# JuicyChat builds pages in the browser from its own data. The counts for each
# bot are in that data (and on each bot's own page), so read them from there.
STAT_KEYS = [
    ("favorites", re.compile(r"(favou?r|collect|bookmark|star)", re.I)),
    ("likes", re.compile(r"(?<!dis)(like|heart|thumb)", re.I)),
    ("chats", re.compile(r"(chat|message|msg|conversation|dialog|talk|interact|usage)", re.I)),
    ("views", re.compile(r"(view|visit|play|pv|uv)", re.I)),
]
CREATED_KEY = re.compile(r"(create|publish|release).*(time|date|at)|^(created|ctime)$", re.I)
SKIP_KEY = re.compile(r"(id|type|status|limit|max|min|level|price|cost|coin|gem|rank|index|page|size|version|flag|is_|has_|can_)", re.I)

def _as_num(v):
    if isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return float(v)
    if isinstance(v, str):
        m = re.fullmatch(r"\s*([\d,.]+)\s*([kKmMwW]?)\s*", v)
        if m:
            try:
                n = float(m.group(1).replace(",", ""))
            except ValueError:
                return None
            return n * {"k": 1e3, "m": 1e6, "w": 1e4}.get(m.group(2).lower(), 1)
    return None

def _stats_from_dict(d, depth=0):
    """Counts found directly in one bot's data object (and small nested ones)."""
    out, created = {}, None
    for k, v in d.items():
        ks = str(k)
        if isinstance(v, dict) and depth < 2 and len(v) < 40:
            sub, c2 = _stats_from_dict(v, depth + 1)
            for kk, vv in sub.items():
                out.setdefault(kk, vv)
            created = created or c2
            continue
        if CREATED_KEY.search(ks) and v:
            created = created or v
            continue
        n = _as_num(v)
        if n is None or n < 0 or SKIP_KEY.search(ks.replace("count", "")) and not re.search(r"count|num|total", ks, re.I):
            continue
        for name, rx in STAT_KEYS:
            if rx.search(ks):
                out[name] = max(out.get(name, 0), n)
                break
    return out, created

def stats_from_json(payloads, bot_ids):
    """Search captured JuicyChat data for objects that belong to each bot id."""
    want, found = set(str(b) for b in bot_ids), {}
    def walk(x, depth=0):
        if depth > 12:
            return
        if isinstance(x, dict):
            ids = {str(x.get(k)) for k in ("id", "character_id", "characterId", "char_id", "bot_id", "botId", "cid", "role_id", "roleId") if x.get(k) is not None}
            hit = ids & want
            if hit:
                st, created = _stats_from_dict(x)
                if st:
                    bid = hit.pop()
                    prev = found.get(bid, {})
                    found[bid] = {**st, **{k: max(v, prev.get(k, 0)) for k, v in prev.items() if k in st or k != "created"}}
                    if created:
                        found[bid]["created"] = created
            for v in x.values():
                walk(v, depth + 1)
        elif isinstance(x, list):
            for v in x:
                walk(v, depth + 1)
    for p in payloads:
        walk(p.get("data") if isinstance(p, dict) and "data" in p else p)
    return found

def _created_iso(v):
    try:
        if isinstance(v, (int, float)) or (isinstance(v, str) and v.isdigit()):
            t = float(v)
            t = t / 1000 if t > 1e11 else t
            return datetime.fromtimestamp(t, tz=timezone.utc).isoformat()
        if isinstance(v, str) and re.match(r"\d{4}-\d{2}-\d{2}", v):
            return v
    except Exception:
        pass
    return None

BOT_PAGE_JS = r"""() => {
  // numbers shown on a bot's own page next to an icon or a label
  const cls = e => String(e && e.className && e.className.baseVal !== undefined ? e.className.baseVal : (e && e.className) || '');
  const info = e => { if (!e) return ''; const svg = e.tagName === 'svg' ? e : e.querySelector && e.querySelector('svg');
    return [cls(e), e.getAttribute && (e.getAttribute('aria-label') || ''), e.getAttribute && (e.getAttribute('alt') || ''), e.getAttribute && (e.getAttribute('title') || ''), e.tagName === 'IMG' ? e.getAttribute('src') || '' : '',
      svg ? [cls(svg), (svg.querySelector('title') || {}).textContent || '', ((svg.querySelector('use') || {getAttribute: () => ''}).getAttribute('href') || '')].join(' ') : '', !/\d/.test(e.textContent || '') ? (e.textContent || '').slice(0, 20) : ''].join(' '); };
  const out = [];
  for (const el of document.querySelectorAll('body *')) {
    if (el.children.length) continue;
    const t = (el.textContent || '').trim();
    if (!/^[\d][\d.,]*\s*[kKmMwW]?$/.test(t) || t.length > 9) continue;
    const p = el.parentElement, g = p && p.parentElement;
    const icon = e => e && !/\d/.test(e.textContent || '') ? info(e) : '';
    out.push({value: t, hint: [[el.getAttribute('aria-label') || '', el.getAttribute('title') || '', cls(el)].join(' '),
      icon(el.previousElementSibling) + ' ' + icon(el.nextElementSibling),
      p ? [p.getAttribute('aria-label') || '', p.getAttribute('title') || '', cls(p), ...[...p.children].filter(c => c !== el).map(icon)].join(' ') : '',
      g ? [g.getAttribute('aria-label') || '', cls(g)].join(' ') : '']});
    if (out.length > 60) break;
  }
  return out;
}"""

def stats_from_page_numbers(nums):
    out = {}
    for st in nums:
        n = _as_num(str(st.get("value", "")).replace(" ", ""))
        if n is None:
            continue
        for h in st.get("hint") or []:
            h = str(h or "").lower()
            key = ("favorites" if re.search(r"fav|star|bookmark|collect|saved", h) else
                   "likes" if re.search(r"like|heart|thumb|love", h) else
                   "chats" if re.search(r"chat|message|comment|bubble|conversation|talk|dialog|msg", h) else None)
            if key:
                out.setdefault(key, n)
                break
    return out


# ------------------------------------------------------------ JuicyChat data API
# JuicyChat's web page asks its own data service for everything it shows, and
# scrambles requests/replies with a fixed key built into the page. Doing the same
# from inside the (signed-in tool) browser returns exact counts for a lounge.
JUICY_API_JS = r"""async ({userId, withComments, maxPages}) => {
  const KEY = 'yume1aJ83ZbPpkwb', IV = 'yume2024cccydnzc', te = new TextEncoder(), td = new TextDecoder();
  const key = await crypto.subtle.importKey('raw', te.encode(KEY), {name: 'AES-CBC'}, false, ['encrypt', 'decrypt']);
  const toB64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode(...u8.subarray(i, i + 8192)); return btoa(s); };
  const fromB64 = b => Uint8Array.from(atob(b), c => c.charCodeAt(0));
  const utf8b64 = t => toB64(te.encode(t)), b64utf8 = b => td.decode(fromB64(b));
  const enc = async plain => toB64(new Uint8Array(await crypto.subtle.encrypt({name: 'AES-CBC', iv: te.encode(IV)}, key, te.encode(utf8b64(plain)))));
  const dec = async b => b64utf8(td.decode(await crypto.subtle.decrypt({name: 'AES-CBC', iv: te.encode(IV)}, key, fromB64(b))));
  const uuid = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now()).replace(/-/g, '').split('');
  uuid.splice(5, 0, 'm'); uuid.splice(10, 0, 'g'); const secret = uuid.join('');
  const distinct = '19f' + Date.now().toString(16) + Math.random().toString(16).slice(2, 10);
  const post = async (path, data, anon) => {
    const r = await fetch(path, {method: 'POST', credentials: anon ? 'omit' : 'include', headers: {'content-type': 'application/json', Accept: 'application/json, text/plain, */*',
      SecretKey: secret, client: 'pc', system: 'windows64', platformType: 'web', appVersion: '0.1.67', language: 'en', nsfw: '1', voucher: 'null',
      utm_source: 'null', offsetnumber: '0', navigatorlang: 'en-US', distinctId: distinct}, body: JSON.stringify({requestData: await enc(JSON.stringify(data || {}))})});
    const j = await r.json(); return j && j.responseData ? JSON.parse(await dec(j.responseData)) : j;
  };
  const out = {bots: [], comments: {}, warnings: [], total: null};
  let lastFirst = '';
  for (let pageNo = 1; pageNo <= maxPages; pageNo++) {
    let res; try { res = await post('/yume/api/user/v1/character/getUserSpaceCharacterList', {pageNo, pageSize: 20, visibility: null, auditType: null, searchContent: '', characterTags: [], sortName: 'new', gender: null, userId}); }
    catch (e) { out.warnings.push('list: ' + e.message); break; }
    if (!(res && (res.success || String(res.code) === '200'))) { out.warnings.push('list: ' + ((res && (res.msg || res.code)) || 'no reply')); break; }
    const batch = Array.isArray(res.data) ? res.data : [];
    out.total = typeof res.total === 'number' ? res.total : out.total;
    const first = batch.length ? String(batch[0].characterId || batch[0].id || '') : ''; if (first && first === lastFirst) break; lastFirst = first;
    out.bots.push(...batch);
    if (batch.length < 20 || (typeof out.total === 'number' && out.total > 0 && out.bots.length >= out.total)) break;
  }
  if (withComments) for (const b of out.bots) {
    const id = b.characterId; if (!id) continue; const all = [];
    for (let pageNo = 1; pageNo <= 3; pageNo++) {
      let c; try { c = await post('/yume/api/user/v1/character/comment/getCommentPage', {characterId: id, pageNo, pageSize: 50}); } catch (e) { break; }
      if (!(c && (c.success || String(c.code) === '200'))) break;
      const batch = Array.isArray(c.data) ? c.data : (c.data && Array.isArray(c.data.list) ? c.data.list : []);
      all.push(...batch); if (batch.length < 50) break;
    }
    out.comments[id] = all.slice(0, 150).map(x => ({id: String(x.commentId || x.id || ''), name: String(x.userName || x.nickName || x.nickname || x.senderName || x.name || 'Someone'),
      at: x.gmtCreate || x.createTime || x.time || x.gmtModified || null, likes: x.likeCount || 0}));
  }
  return out;
}"""

def _ms_iso(v):
    return _created_iso(v) if v not in (None, "") else None

def _raw_scalars(b):
    """Every small yes/no or number field JuicyChat sends for a bot (no text), so
    rating-related fields can be identified from real data."""
    out = {}
    for k, v in (b or {}).items():
        if k in ("characterId", "characterName", "introduction", "characterPhoto", "characterThumb", "personality", "userName", "userId", "chatCount", "likeCount", "favoriteCount"):
            continue
        if isinstance(v, bool) or isinstance(v, (int, float)) or (isinstance(v, str) and len(v) <= 24 and not v.startswith("http")):
            if not re.search(r"gmt|time|date|photo|thumb|url|avatar", k, re.I):
                out[k] = v
    return out


def api_lounge_rows(page, user_id, with_comments=True, lounge_url=""):
    """Exact numbers for every bot in a lounge, from JuicyChat's own data service."""
    args = {"userId": str(user_id), "withComments": with_comments, "maxPages": 5000}
    res = None
    if lounge_url:                                           # open the lounge itself first, as a visitor would: confirm 18+ / claim pop-ups, then read
        try:
            page.goto(lounge_url, wait_until="domcontentloaded", timeout=60000)
            page.wait_for_timeout(2500)
            clear_claim_overlay(page, log, wait=500)
            res = page.evaluate(JUICY_API_JS, args)
        except Exception as e:
            log(f"Opening the lounge page first didn't work ({str(e)[:120]}); trying from the home page.")
            res = None
    if not (res and res.get("bots")):
        page.goto(scraper.BASE, wait_until="domcontentloaded", timeout=60000)
        page.wait_for_timeout(2500)
        clear_claim_overlay(page, log, wait=500)
        res2 = page.evaluate(JUICY_API_JS, args)
        if res2.get("bots") or res is None:
            res = res2
    rows = []
    for b in res.get("bots") or []:
        cid = str(b.get("characterId") or "")
        if not cid:
            continue
        rows.append({
            "title": str(b.get("characterName") or "Untitled"), "url": f"https://www.juicychat.ai/chat/{cid}",
            "headline": {"chats": float(b.get("chatCount") or 0), "likes": float(b.get("likeCount") or 0), "favorites": float(b.get("favoriteCount") or 0), "views": 0.0},
            "created": _ms_iso(b.get("gmtFirstPublish") or b.get("gmtCreate")), "published": _ms_iso(b.get("gmtFirstPublish")), "tags": [str(t) for t in (b.get("characterTags") or [])][:20],
            "rating": b.get("rating"), "visibility": b.get("visibility"), "description": str(b.get("introduction") or "")[:1200], "statMode": "api", "raw": _raw_scalars(b),
            "extra": {k: b.get(k) for k in ("score", "score10", "score20", "basePopular", "baseTrending", "baseRecent", "rating") if b.get(k) is not None},
            "comments": (res.get("comments") or {}).get(cid) or [],
        })
    return rows, res.get("warnings") or [], res.get("total")


JUICY_OWN_JS = JUICY_API_JS.replace("async ({userId, withComments, maxPages}) => {", "async ({userId, withComments, maxPages, notifPages}) => {", 1).replace(
  "  const out = {bots: [], comments: {}, warnings: [], total: null};",
  """  const get = async path => { const r = await fetch(path, {credentials: 'include', headers: {Accept: 'application/json, text/plain, */*', SecretKey: secret, client: 'pc', system: 'windows64', platformType: 'web', appVersion: '0.1.67', language: 'en', nsfw: '1', distinctId: distinct}}); const j = await r.json(); return j && j.responseData ? JSON.parse(await dec(j.responseData)) : j; };
  const out = {bots: [], comments: {}, warnings: [], total: null, me: null, events: []};
  if (!userId) { const me = await get('/yume/api/user/v1/getUserInfo'); const d = me && me.data; if (!d || !d.userId) return {...out, warnings: ['not signed in']}; out.me = {userId: String(d.userId), userName: String(d.userName || d.nickName || ''), ids: Object.fromEntries(Object.entries(d).filter(([k, v]) => /(id|uid|no|code)$/i.test(k) && (typeof v === 'string' || typeof v === 'number') && /^[A-Za-z0-9_-]{3,40}$/.test(String(v))).map(([k, v]) => [k, String(v)]))}; userId = out.me.userId;
    // the owner's own list includes every rating (SFW, NSFW and 18+), unlike the public lounge list
    let lastFirst = '';
    for (let pageNo = 1; pageNo <= maxPages; pageNo++) {
      let res; try { res = await post('/yume/api/user/v1/character/getOwnUserCharacterList', {pageNo, pageSize: 20, sortGmtCreate: 0, visibility: null, searchContent: ''}); } catch (e) { out.warnings.push('own list: ' + e.message); break; }
      if (!(res && (res.success || String(res.code) === '200'))) { out.warnings.push('own list: ' + ((res && (res.msg || res.code)) || 'no reply')); break; }
      const batch = Array.isArray(res.data) ? res.data : []; out.total = typeof res.total === 'number' ? res.total : out.total; const first = batch.length ? String(batch[0].characterId || batch[0].id || '') : ''; if (first && first === lastFirst) break; lastFirst = first; out.bots.push(...batch); if (batch.length < 20 || (typeof out.total === 'number' && out.total > 0 && out.bots.length >= out.total)) break;
    }
    if (out.bots.length) { out.ownList = true; maxPages = 0; } }""", 1).replace(
  "  return out;\n}",
  """  // notifications: who liked, favourited/starred, commented or followed (only visible to the account itself)
  for (let pageNo = 1; pageNo <= (notifPages || 0); pageNo++) {
    let r; try { r = await post('/yume/api/user/v1/message/getMessageList', {pageNo, pageSize: 100, messageType: 1, actionTypes: [1, 2, 3, 4, 10, 13, 15, 16, 17]}); } catch (e) { out.warnings.push('notifications: ' + e.message); break; }
    if (!(r && (r.success || String(r.code) === '200'))) { out.warnings.push('notifications: ' + ((r && (r.msg || r.code)) || 'no reply')); break; }
    const batch = Array.isArray(r.data) ? r.data : [];
    for (const m of batch) { const t = Number(m.actionType); const kind = t === 1 ? 'follow' : (t === 2 || t === 4) ? 'favorite' : (t === 3 || t === 15) ? 'like' : (t === 10 || t === 16) ? 'comment' : t === 13 ? 'gift' : t === 17 ? 'reward' : 'other';
      out.events.push({id: String(m.messageId || ''), kind, characterId: String(m.businessId || m.characterId || ''), name: String(m.sendUserName || 'Someone'), userId: String(m.sendUserId || ''), at: m.gmtModified || m.gmtCreate || null}); }
    if (batch.length < 100) break;
  }
  return out;
}""", 1)

# Asks JuicyChat who the browser is signed in as (the same call the page makes). Returns {ok, userId, userName}.
JUICY_ME_JS = JUICY_API_JS.split("  const out = {bots")[0].replace("async ({userId, withComments, maxPages}) => {", "async () => {", 1) + """  const r = await fetch('/yume/api/user/v1/getUserInfo', {credentials: 'include', headers: {Accept: 'application/json, text/plain, */*', SecretKey: secret, client: 'pc', system: 'windows64', platformType: 'web', appVersion: '0.1.67', language: 'en', nsfw: '1', distinctId: distinct}});
  const j = await r.json(); const me = j && j.responseData ? JSON.parse(await dec(j.responseData)) : j; const d = me && me.data;
  return d && d.userId ? {ok: true, userId: String(d.userId), userName: String(d.userName || d.nickName || '')} : {ok: false};
}"""


def who_am_i(page):
    """{ok, userId, userName} when signed in; {ok: False} when not; None when the check itself could not run."""
    try:
        return page.evaluate(JUICY_ME_JS)
    except Exception:
        return None


def do_login(profile_dir, magic_link, stop, timeout=90):
    """Signs in with a magic link with no browser window at all. The link signs the browser in by itself; this waits
    until JuicyChat says who is signed in, saves that in the profile and closes."""
    with sync_playwright() as p:
        ctx = launch_scan_context(p, profile_dir, hidden=True)
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            log("Signing in with the magic link in the background...")
            try:
                page.goto(magic_link, wait_until="domcontentloaded", timeout=60000)
            except Exception as e:
                log(f"The link was slow to load ({e.__class__.__name__}); carrying on.")
            page.wait_for_timeout(3000)
            t0 = time.time()
            me = None
            while time.time() - t0 < timeout:
                try:
                    if "juicychat" not in page.url:
                        page.goto(scraper.BASE, wait_until="domcontentloaded", timeout=60000)
                        page.wait_for_timeout(1500)
                except Exception:
                    pass
                me = who_am_i(page)
                if me and me.get("ok"):
                    break
                if stop.is_set():
                    break
                emit("progress", stage="login", status="checking", message="Waiting for JuicyChat to confirm the sign-in...")
                page.wait_for_timeout(2500)
            if not (me and me.get("ok")):
                raise RuntimeError("The magic link did not sign in (it may be expired or already used). Paste a fresh magic link from the account's email.")
            log(f"Signed in as {me.get('userName') or me.get('userId')}. The session is saved.")
            page.wait_for_timeout(1000)
            cookies = [c for c in ctx.cookies() if "juicychat" in c.get("domain", "")]
            return {"cookies": len(cookies), "userId": me.get("userId"), "userName": me.get("userName"), "at": datetime.now().isoformat(timespec="seconds")}
        finally:
            try:
                ctx.close()
            except Exception:
                pass


def api_own_rows(page, with_comments=True, notif_pages=40):
    """Signed in as the account itself: its own bots, comments and notifications."""
    page.goto(scraper.BASE, wait_until="domcontentloaded", timeout=60000)
    page.wait_for_timeout(2500)
    clear_claim_overlay(page, log, wait=500)
    res = page.evaluate(JUICY_OWN_JS, {"userId": "", "withComments": with_comments, "maxPages": 5000, "notifPages": notif_pages})
    if not res.get("me"):
        raise RuntimeError("This account isn't signed in. Use its magic link in the Performance tab, then pull again.")
    rows = []
    for b in res.get("bots") or []:
        cid = str(b.get("characterId") or "")
        if not cid:
            continue
        rows.append({"title": str(b.get("characterName") or "Untitled"), "url": f"https://www.juicychat.ai/chat/{cid}",
            "headline": {"chats": float(b.get("chatCount") or 0), "likes": float(b.get("likeCount") or 0), "favorites": float(b.get("favoriteCount") or 0), "views": 0.0},
            "created": _ms_iso(b.get("gmtFirstPublish") or b.get("gmtCreate")), "published": _ms_iso(b.get("gmtFirstPublish")), "tags": [str(t) for t in (b.get("characterTags") or [])][:20],
            "rating": b.get("rating"), "visibility": b.get("visibility"), "description": str(b.get("introduction") or "")[:1200], "statMode": "account", "raw": _raw_scalars(b),
            "extra": {k: b.get(k) for k in ("score", "score10", "score20", "visibility", "auditType") if b.get(k) is not None},
            "comments": (res.get("comments") or {}).get(cid) or []})
    return rows, res.get("warnings") or [], res.get("me"), res.get("events") or []


# Where your bots sit in JuicyChat's feeds: Popular, Trending, Recent, New, Immersive,
# Editor's Choice. Reads the top of each feed (50 per page) and notes positions.
FEEDS = [("popular", "Popular"), ("trending", "Trending"), ("recent", "Recent"), ("new", "New"), ("immersive", "Immersive"), ("editor", "Editor's Choice")]
JUICY_FEEDS_JS = JUICY_API_JS.split("  const out = {bots: [], comments: {}, warnings: [], total: null};")[0].replace(
    "async ({userId, withComments, maxPages}) => {", "async ({ids, feeds, maxPages}) => {", 1) + """
  const want = new Set(ids.map(String)), out = {positions: {}, scanned: {}, totals: {}, warnings: [], market: []}, seenM = new Set();
  for (const feed of feeds) {
    let pos = 0;
    for (let pageNo = 1; pageNo <= maxPages; pageNo++) {
      let r; try { r = await post('/yume/api/user/v1/character/getCharacterList', {pageNo, pageSize: 50, visibility: null, auditType: null, searchContent: '', characterTags: [], sortName: feed, gender: null}); }
      catch (e) { out.warnings.push(feed + ': ' + e.message); break; }
      if (!(r && (r.success || String(r.code) === '200'))) { out.warnings.push(feed + ': ' + ((r && (r.msg || r.code)) || 'no reply')); break; }
      const batch = Array.isArray(r.data) ? r.data : [];
      if (typeof r.total === 'number') out.totals[feed] = r.total;
      for (const b of batch) { pos++; const id = String(b.characterId || ''); if (want.has(id) && !(out.positions[id] && out.positions[id][feed])) (out.positions[id] = out.positions[id] || {})[feed] = pos;
        // a small record of every bot seen in the feeds (release time, likes, favourites, chats, tags): the Analysis tab's release-timing statistics use it
        if (id && !seenM.has(id) && out.market.length < 4000) { seenM.add(id); out.market.push([id, b.gmtFirstPublish || b.gmtCreate || null, Number(b.likeCount) || 0, Number(b.favoriteCount) || 0, Number(b.chatCount) || 0, (b.characterTags || b.tags || []).slice(0, 12).map(t => String((t && (t.tagName || t.name)) || t))]); } }
      out.scanned[feed] = pos;
      if (batch.length < 50) break;
    }
  }
  return out;
}"""

JUICY_TAGS_JS = JUICY_API_JS.split("  const out = {bots: [], comments: {}, warnings: [], total: null};")[0].replace(
    "async ({userId, withComments, maxPages}) => {", "async ({feeds, maxPages}) => {", 1) + """
  const out = {tags: {}, bots: 0, warnings: []};
  const add = t => { const n = (typeof t === 'string' ? t : (t && (t.tagName || t.name || t.title || t.label)) || '').trim(); if (n && n.length < 40) out.tags[n] = (out.tags[n] || 0) + 1; };
  for (const feed of feeds) {
    for (let pageNo = 1; pageNo <= maxPages; pageNo++) {
      let r; try { r = await post('/yume/api/user/v1/character/getCharacterList', {pageNo, pageSize: 50, visibility: null, auditType: null, searchContent: '', characterTags: [], sortName: feed, gender: null}); }
      catch (e) { out.warnings.push(feed + ': ' + e.message); break; }
      if (!(r && (r.success || String(r.code) === '200'))) { out.warnings.push(feed + ': ' + ((r && (r.msg || r.code)) || 'no reply')); break; }
      const batch = Array.isArray(r.data) ? r.data : [];
      for (const b of batch) { out.bots++; for (const t of (b.characterTags || b.tags || [])) add(t); }
      if (batch.length < 50) break;
    }
  }
  return out;
}"""


# v1.3.3: the bots a visitor sees in a creator's lounge, asked without signing in (no cookies sent), so private,
# unlisted, unreleased and under-review bots are never on it. Performance only keeps public bots.
JUICY_PUBLIC_IDS_JS = JUICY_API_JS.split("  const out = {bots: [], comments: {}, warnings: [], total: null};")[0].replace(
    "async ({userId, withComments, maxPages}) => {", "async ({userId, maxPages}) => {", 1) + """
  const ids = [], warnings = []; let lastFirst = '', ok = false;
  for (let pageNo = 1; pageNo <= maxPages; pageNo++) {
    let r; try { r = await post('/yume/api/user/v1/character/getUserSpaceCharacterList', {pageNo, pageSize: 20, visibility: null, auditType: null, searchContent: '', characterTags: [], sortName: 'new', gender: null, userId}, true); }
    catch (e) { warnings.push(e.message); break; }
    if (!(r && (r.success || String(r.code) === '200'))) { warnings.push(String((r && (r.msg || r.code)) || 'no reply')); break; }
    ok = true;
    const batch = Array.isArray(r.data) ? r.data : [];
    const first = batch.length ? String(batch[0].characterId || batch[0].id || '') : ''; if (first && first === lastFirst) break; lastFirst = first;
    for (const b of batch) { const id = String(b.characterId || b.id || ''); if (id) ids.push(id); }
    if (batch.length < 20) break;
  }
  return {ids, ok, warnings};
}"""


def mark_public(page, rows, user_id):
    """Marks every row publicListed True/False: is it in the lounge a visitor (not signed in) sees? None when that could not be read."""
    pub = None
    try:
        res = page.evaluate(JUICY_PUBLIC_IDS_JS, {"userId": str(user_id), "maxPages": 500}) if user_id else None
        if res and res.get("ok") and res.get("ids"):
            pub = set(str(i) for i in res["ids"])
        else:
            log("Public check: the lounge as a visitor sees it couldn't be read" + (f" ({'; '.join(res.get('warnings') or [])[:160]})" if res else "") + "; private and unlisted bots are told apart by their settings instead.")
    except Exception as e:
        log(f"Public check: couldn't read the lounge as a visitor ({str(e)[:120]}).")
    for r in rows:
        r["publicListed"] = (str(scraper.bot_num_id(r["url"])) in pub) if pub is not None else None
    if pub is not None:
        log(f"Public check: {sum(1 for r in rows if r['publicListed'])} of {len(rows)} bots are in the lounge a visitor sees.")
    return pub


LAST_FEED = {"totals": {}, "market": []}      # what the last feed scan also read: each feed's total size and a small record of every bot it saw


def feed_positions(page, bot_ids, max_pages=10):
    """{bot id: {feed: position}} for the top max_pages*50 of each feed."""
    LAST_FEED["totals"], LAST_FEED["market"] = {}, []
    if not bot_ids:
        return {}, {}, []
    res = page.evaluate(JUICY_FEEDS_JS, {"ids": [str(i) for i in bot_ids], "feeds": [f for f, _ in FEEDS], "maxPages": max_pages})
    LAST_FEED["totals"], LAST_FEED["market"] = res.get("totals") or {}, res.get("market") or []
    return res.get("positions") or {}, res.get("scanned") or {}, res.get("warnings") or []


# v1.5.3: the Discover tab (juicychat.ai/discover). It is not the six feeds above: it is a list of rows, one per tag ("#Futanari", "#Furry",
# "#Juicy Royalty"...), each with its own bots in order. The page shows the first 10 of a row; the same call can return many more (characterSize).
# Reads every row and notes where each of your bots sits in it.
DISCOVER_DEPTH = 100          # bots read per row (the page itself shows the first 10)
DISCOVER_SHOWN = 10           # how many of a row the Discover page lists without opening it
JUICY_DISCOVER_JS = JUICY_API_JS.split("  const out = {bots: [], comments: {}, warnings: [], total: null};")[0].replace(
    "async ({userId, withComments, maxPages}) => {", "async ({ids, size}) => {", 1) + """
  const want = new Set(ids.map(String)), out = {positions: {}, rows: [], total: null, warnings: []};
  for (let pageNo = 1; pageNo <= 12; pageNo++) {
    let r; try { r = await post('/yume/api/user/v1/character/getExploreTagPageV1', {pageNo, pageSize: 25, characterSize: size}); }
    catch (e) { out.warnings.push('discover: ' + e.message); break; }
    if (!(r && (r.success || String(r.code) === '200'))) { out.warnings.push('discover: ' + ((r && (r.msg || r.code)) || 'no reply')); break; }
    const batch = Array.isArray(r.data) ? r.data : [];
    if (typeof r.total === 'number') out.total = r.total;
    for (const row of batch) {
      const label = String(row.label || row.tagName || '').trim(), list = Array.isArray(row.characterList) ? row.characterList : [];
      if (!label) continue;
      out.rows.push({label, n: list.length});
      list.forEach((c, i) => { const id = String(c.characterId || ''); if (want.has(id)) { const o = (out.positions[id] = out.positions[id] || {}); if (!o[label] || o[label] > i + 1) o[label] = i + 1; } });
    }
    if (batch.length < 25 || (out.total && out.rows.length >= out.total)) break;
  }
  return out;
}"""

LAST_DISCOVER = {"rows": [], "warnings": []}


def read_discover(page, rows):
    """Sets r["discover"] = {row label: position} for each bot, and returns the extra diag fields. Never stops a pull: a failure only means no Discover data this time."""
    LAST_DISCOVER["rows"], LAST_DISCOVER["warnings"] = [], []
    ids = [str(scraper.bot_num_id(r["url"])) for r in rows]
    try:
        res = page.evaluate(JUICY_DISCOVER_JS, {"ids": ids, "size": DISCOVER_DEPTH}) or {}
    except Exception as e:
        log(f"Discover tab: couldn't be read ({str(e)[:140]}).")
        return {}
    pos = res.get("positions") or {}
    LAST_DISCOVER["rows"], LAST_DISCOVER["warnings"] = res.get("rows") or [], res.get("warnings") or []
    for r in rows:
        r["discover"] = pos.get(str(scraper.bot_num_id(r["url"]))) or {}
    n_rows = len(LAST_DISCOVER["rows"])
    if not n_rows:
        log("Discover tab: no rows came back" + (f" ({'; '.join(LAST_DISCOVER['warnings'])[:160]})" if LAST_DISCOVER["warnings"] else "") + ".")
        return {}
    hit = [r for r in rows if r.get("discover")]
    log(f"Discover tab: {n_rows} rows read (the first {DISCOVER_DEPTH} bots of each); {len(hit)} of your bots appear in at least one row.")
    for r in hit[:40]:
        where = ", ".join(f"#{k} {v}" for k, v in list(r["discover"].items())[:5])
        log(f"Discover: {(r.get('name') or r.get('title') or '').strip()[:60]} is in {where}")
    for w in LAST_DISCOVER["warnings"]: log(f"Discover warning: {w}")
    return {"discoverRows": [x["label"] for x in LAST_DISCOVER["rows"]], "discoverDepth": DISCOVER_DEPTH, "discoverShown": DISCOVER_SHOWN}


# ---------------------------------------------------------------- rating badges
# The lounge page shows each bot's rating as a badge ("NSFW", "18+", none = SFW).
# JuicyChat's data can report 18+ bots as NSFW, so the badges on the page are the
# ground truth. Read them, work out which data field decides them, and label
# every bot from that field (or from the badges directly if no field explains them).
BADGE_JS = r"""() => {
  // a badge is a small pill: read the whole pill's text (so "18" + "+" in separate pieces still reads "18+"),
  // and its class names, labels and images too, in case the badge is drawn rather than written
  const out = {};
  const is18 = t => /^\s*18\s*\+\s*$|^\s*R-?18\s*$/i.test(t), isN = t => /^\s*NSFW\s*$/i.test(t);
  const attr18 = e => /(^|[\s_-])(r-?18|18-?plus|age-?18|adult-only|eighteen)([\s_-]|$)/i.test([e.className && e.className.baseVal !== undefined ? e.className.baseVal : e.className, e.getAttribute && e.getAttribute('alt'), e.getAttribute && e.getAttribute('title'), e.getAttribute && e.getAttribute('aria-label'), e.getAttribute && e.getAttribute('src'), e.getAttribute && e.getAttribute('data-rating')].filter(Boolean).join(' '));
  for (const a of document.querySelectorAll('a[href*="/chat/"]')) {
    const m = (a.getAttribute('href') || '').match(/\/chat\/(\d{6,})/); if (!m) continue;
    let card = a; for (let i = 0; i < 6 && card.parentElement; i++) { if ((card.innerText || '').length > 40) break; card = card.parentElement; }
    let r = 'SFW';
    for (const e of [card, ...card.querySelectorAll('*')]) {
      const t = (e.innerText || e.textContent || '').trim();
      const lab = [e.getAttribute && e.getAttribute('alt'), e.getAttribute && e.getAttribute('title'), e.getAttribute && e.getAttribute('aria-label')].filter(Boolean);
      const src = (e.getAttribute && e.getAttribute('src')) || '';
      if (t.length <= 6 && is18(t) || attr18(e) || lab.some(is18) || /(^|[\/_-])(18|r18)(plus)?[._-]|18\+/i.test(src.split('?')[0].split('/').pop())) { r = '18+'; break; }
      if (lab.some(isN)) r = 'NSFW';
      if (t.length <= 6 && isN(t)) r = 'NSFW';
    }
    // a card's own text lines, as a last check ("18+" on its own line)
    if (r !== '18+' && (card.innerText || '').split(/\n/).some(l => is18(l))) r = '18+';
    out[m[1]] = r;
  }
  return out;
}"""


def read_badges(page, url, need, stop, max_scrolls=40):
    """{bot id: 'SFW'|'NSFW'|'18+'} for the bots on the lounge page."""
    page.goto(url, wait_until="domcontentloaded", timeout=60000)
    page.wait_for_timeout(3000)
    clear_claim_overlay(page, log, wait=300)
    seen, still = {}, 0
    for i in range(max_scrolls):
        if stop.is_set():
            break
        got = page.evaluate(BADGE_JS)
        before = len(seen); seen.update(got)
        if need and len(seen) >= need:
            break
        still = still + 1 if len(seen) == before else 0
        if still >= 4:
            break
        page.mouse.wheel(0, 2400); page.wait_for_timeout(900)
    return seen

def apply_badges(page, rows, url, stop):
    """Label every row's rating from the lounge badges. Returns (how, field_rule)."""
    ids = [str(scraper.bot_num_id(r["url"])) for r in rows]
    emit("progress", stage="collecting", status="collecting", section="Mine", phase="Ratings", current=0, target=len(rows), message="Reading SFW / NSFW / 18+ badges from your lounge...")
    # 1) a sample from the top of the page, then look for the data field that explains it
    sample = read_badges(page, url, need=0, stop=stop, max_scrolls=6)
    known = {i: sample[i] for i in ids if i in sample}
    rule = None
    labels = set(known.values())
    # a sample with no 18+ badge at all can't teach which value means 18+: read every badge instead
    if len(known) >= 8 and len(labels) >= 2 and '18+' in labels:
        fields = {}
        for r in rows:
            i = str(scraper.bot_num_id(r["url"]))
            if i in known:
                for k, v in (r.get("raw") or {}).items(): fields.setdefault(k, []).append((str(v), known[i]))
        best = None
        for k, pairs in fields.items():
            if len(pairs) < len(known) * 0.9: continue
            m = {}
            ok = all(m.setdefault(v, lab) == lab for v, lab in pairs)
            if ok and len(set(m.values())) == len(set(known.values())) and len(m) <= 6:
                score = len(pairs)
                if not best or score > best[0]: best = (score, k, m)
        if best: rule = {"field": best[1], "map": best[2]}
    if rule:
        for r in rows:
            v = str((r.get("raw") or {}).get(rule["field"], ""))
            if v in rule["map"]: r["ratingLabel"] = rule["map"][v]
        log(f"Ratings: the lounge badges match JuicyChat's '{rule['field']}' field, so every bot was labelled from it.")
        return "field", rule
    # 2) no field explains the badges: read the whole lounge
    allb = read_badges(page, url, need=len(rows), stop=stop)
    for r in rows:
        i = str(scraper.bot_num_id(r["url"]))
        if i in allb: r["ratingLabel"] = allb[i]
    log(f"Ratings: read the badges of {sum(1 for r in rows if r.get('ratingLabel'))} of {len(rows)} bots from the lounge page.")
    return "badges", None


def find_own_lounge(page, rows, me, stop):
    """The signed-in creator's own lounge: the page that actually shows their bots. The address isn't assumed:
    every likely address is tried (ids from the account data, the creator id on their bots, the profile links the
    site shows when signed in), and the one showing the most of their own bots wins."""
    mine = {str(scraper.bot_num_id(r["url"])) for r in rows}
    ids = []
    for v in [me.get("userId")] + list((me.get("ids") or {}).values()):
        if v and v not in ids: ids.append(str(v))
    for r in rows:                                        # the creator id each bot carries
        raw = r.get("raw") or {}
        for k in ("userId", "creatorId", "authorId", "ownerId", "uid"):
            v = raw.get(k)
            if v and str(v) not in ids: ids.append(str(v))
    cands = [f"{scraper.BASE.rstrip('/')}/userdetailspace/{i}" for i in ids]
    try:                                                  # the site's own links to the signed-in profile
        page.goto(scraper.BASE, wait_until="domcontentloaded", timeout=60000); page.wait_for_timeout(2500)
        clear_claim_overlay(page, log, wait=300)
        links = page.evaluate(PROFILE_LINKS_JS) or []
        if page.evaluate(MENU_JS): page.wait_for_timeout(1200); links += page.evaluate(PROFILE_LINKS_JS) or []
        links += page.evaluate("() => [...document.querySelectorAll('a[href*=\"userdetailspace\"]')].map(a => a.href.split('#')[0])") or []
        for l in links:
            if l not in cands: cands.append(l)
    except Exception as e:
        log(f"Ratings: couldn't read the site's profile links ({str(e)[:100]}).")
    best, best_n, tried = None, 0, []
    for url in cands[:10]:
        if stop.is_set(): break
        try: found = read_badges(page, url, need=0, stop=stop, max_scrolls=4)
        except Exception: found = {}
        n = len(mine & set(found)); tried.append((url, n))
        if n > best_n: best, best_n = url, n
        if mine and best_n >= min(len(mine), 12): break   # clearly the right page
    log(f"Ratings: your lounge is {best} ({best_n} of your bots found there)." if best else f"Ratings: none of {len(tried)} possible lounge pages showed your bots ({', '.join(u.rsplit('/', 1)[-1] for u, _ in tried)[:200]}).")
    return best, tried


def scan_my_bots(profile_dir, profile_url, stop, max_passes=18, mode='lounge'):
    """Open the signed-in user's own profile and read every bot listed there."""
    captured, dom, order, state = [], [], [], {}

    def on_response(resp):
        try:
            if "json" in resp.headers.get("content-type", "") and not re.search(r"google|facebook|doubleclick|sentry|segment|hotjar|clarity|analytics|stripe|cloudflareinsights", resp.url, re.I):
                captured.append({"section": "Mine", "data": resp.json(), "url": resp.url})
        except Exception:
            pass

    def read_cards(page):
        try:
            cards = page.evaluate(scraper.DOM_JS)
        except Exception:
            return 0
        known = {c["href"] for c in dom}
        for c in cards:
            if c["href"] not in known:
                dom.append({**c, "section": "Mine"})
                bid = scraper.bot_num_id(c["href"])
                if bid and bid not in order:
                    order.append(bid)
        return len(cards)

    with sync_playwright() as p:
        ctx = launch_scan_context(p, profile_dir, hidden=True)
        ctx.on("close", lambda *_: state.update(closed=True))
        ctx.on("response", on_response)
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            emit("progress", stage="opening", status="starting", section="Mine", current=0, target=0, message="Opening JuicyChat in the background...")
            if mode == "own":
                emit("progress", stage="collecting", status="collecting", section="Mine", phase="Your bots", current=0, target=0, message="Reading this account's bots and notifications from JuicyChat...")
                rows, warns, me, events = api_own_rows(page)
                mark_public(page, rows, me.get("userId"))          # v1.3.3: only public bots count
                withn = sum(1 for r in rows if r["headline"]["chats"] or r["headline"]["likes"] or r["headline"]["favorites"])
                announce_bots(rows, set(), "Read", owner=str(me.get('userName') or ''))
                log(f"Signed in as {me.get('userName') or me.get('userId')}: {len(rows)} bots (numbers for {withn}), {sum(len(r['comments']) for r in rows)} comments, {len(events)} notifications.")
                emit("progress", stage="collecting", status="collecting", section="Mine", phase="Your bots", current=len(rows), target=len(rows), message=f"Read {len(rows)} of {len(rows)} bots")
                emit("progress", stage="collecting", status="collecting", section="Mine", phase="Feed positions", current=0, target=len(FEEDS), message="Checking where your bots sit in Popular, Trending, Recent, New, Immersive and Editor's Choice...")
                pos, scanned, fw = feed_positions(page, [scraper.bot_num_id(r["url"]) for r in rows])
                for r in rows:
                    r["feeds"] = pos.get(str(scraper.bot_num_id(r["url"]))) or {}
                announce_feeds(rows)
                log(f"Feed positions: {sum(1 for r in rows if r['feeds'])} of your bots appear in the top {max(scanned.values() or [0])} of at least one feed.")
                log("Feeds read (bots scanned): " + ", ".join(f"{k} {v}" for k, v in scanned.items()) + ("" if "immersive" in scanned else ". Immersive was NOT read"))
                for w in fw: log(f"Feed warning: {w}")
                emit("progress", stage="collecting", status="collecting", section="Mine", phase="Discover tab", current=0, target=1, message="Reading the Discover tab rows to see where your bots sit...")
                dx = read_discover(page, rows)
                emit("diag", cardsOnPage=len(rows), jsonResponses=None, withNumbers=withn, modes=["account"], sample=[], url="", dataKeys=[], me=me, events=events, warnings=warns + fw, feedsScanned=scanned, feedTotals=LAST_FEED["totals"], market=LAST_FEED["market"], **dx)
                emit("progress", stage="collecting", status="collecting", section="Mine", phase="Ratings", current=0, target=len(rows), message="Finding your lounge to read SFW / NSFW / 18+ badges...")
                lounge, tried = find_own_lounge(page, rows, me, stop)
                if lounge:
                    try: how, rule = apply_badges(page, rows, lounge, stop)
                    except Exception as e: log(f"Ratings: couldn't read the lounge badges ({str(e)[:120]})."); how, rule = "none", None
                else: how, rule = "none", None
                emit("diag", ratingSource=how, ratingRule=rule, loungeUrl=lounge or "", loungeTried=[u for u, _ in tried],
                     ratingsRead=sum(1 for r in rows if r.get("ratingLabel")), ratingsTotal=len(rows))
                return rows, lounge or ""
            m = re.search(r"userdetailspace/(\d{6,})", profile_url or "")
            if m:
                emit("progress", stage="collecting", status="collecting", section="Mine", current=0, target=0, message="Reading the lounge from JuicyChat's data...")
                try:
                    rows, warns, total = api_lounge_rows(page, m.group(1), lounge_url=profile_url)
                    if rows: mark_public(page, rows, m.group(1))       # v1.3.3: only public bots count
                    emit("progress", stage="collecting", status="collecting", section="Mine", phase="Your bots", current=len(rows), target=total or len(rows), message=f"Read {len(rows)} of {total or len(rows)} bots from JuicyChat's data")
                    if rows:
                        withn = sum(1 for r in rows if r["headline"]["chats"] or r["headline"]["likes"] or r["headline"]["favorites"])
                        announce_bots(rows, set(), "Read")
                        log(f"Your bots: {len(rows)} bots read from JuicyChat's data (numbers for {withn}), with {sum(len(r['comments']) for r in rows)} comments.")
                        emit("progress", stage="collecting", status="collecting", section="Mine", phase="Feed positions", current=0, target=len(FEEDS), message="Checking where your bots sit in Popular, Trending, Recent, New, Immersive and Editor's Choice...")
                        pos, scanned, fw = feed_positions(page, [scraper.bot_num_id(r["url"]) for r in rows])
                        for r in rows:
                            r["feeds"] = pos.get(str(scraper.bot_num_id(r["url"]))) or {}
                        announce_feeds(rows)
                        log(f"Feed positions: {sum(1 for r in rows if r['feeds'])} of your bots appear in the top {max(scanned.values() or [0])} of at least one feed.")
                        log("Feeds read (bots scanned): " + ", ".join(f"{k} {v}" for k, v in scanned.items()) + ("" if "immersive" in scanned else ". Immersive was NOT read"))
                        for w in fw: log(f"Feed warning: {w}")
                        emit("progress", stage="collecting", status="collecting", section="Mine", phase="Discover tab", current=0, target=1, message="Reading the Discover tab rows to see where your bots sit...")
                        dx = read_discover(page, rows)
                        emit("diag", cardsOnPage=len(rows), jsonResponses=None, withNumbers=withn, modes=["api"], sample=[], url=profile_url, dataKeys=[], total=total, warnings=fw, feedsScanned=scanned, feedTotals=LAST_FEED["totals"], market=LAST_FEED["market"], **dx)
                        try: how, rule = apply_badges(page, rows, profile_url, stop)
                        except Exception as e: log(f"Ratings: couldn't read the lounge badges ({str(e)[:120]})."); how, rule = "none", None
                        emit("diag", ratingSource=how, ratingRule=rule)
                        return rows, profile_url
                    log("JuicyChat's data returned no bots" + (f" ({'; '.join(warns)[:200]})" if warns else "") + "; reading the page instead.")
                except Exception as e:
                    log(f"JuicyChat's data could not be read ({str(e)[:160]}); reading the page instead.")
            candidates = [profile_url] if profile_url else []
            if not candidates:
                page.goto(scraper.BASE, wait_until="domcontentloaded", timeout=60000)
                clear_claim_overlay(page, log)
                page.wait_for_timeout(3000)
                candidates = page.evaluate(PROFILE_LINKS_JS)
                if not candidates and page.evaluate(MENU_JS):
                    page.wait_for_timeout(1500)
                    candidates = page.evaluate(PROFILE_LINKS_JS)
            if not candidates:
                raise RuntimeError("Couldn't find your JuicyChat profile link. Paste your profile URL in Settings > My JuicyChat profile, then try again.")
            used = ""
            for url in candidates:
                if stop.is_set():
                    break
                try:
                    page.goto(url, wait_until="domcontentloaded", timeout=60000)
                except Exception:
                    continue
                page.wait_for_timeout(2500)
                clear_claim_overlay(page, log, wait=300)           # an 18+ / Claim Coins pop-up would hide the list
                for word in TAB_WORDS:                     # open the "My Characters" style tab if the page has one
                    try:
                        loc = page.get_by_role("tab", name=re.compile(rf"^\s*{re.escape(word)}\b", re.I))
                        if not loc.count():
                            loc = page.get_by_text(re.compile(rf"^\s*{re.escape(word)}\s*(\(\d+\))?\s*$", re.I))
                        if loc.count() and loc.first.is_visible():
                            loc.first.click(timeout=4000); page.wait_for_timeout(2000); break
                    except Exception:
                        continue
                _wait_for_list(page, stop, max_wait=12.0, quiet=2.5)
                if read_cards(page) > 0:
                    used = page.url
                    break
                log(f"No bots listed at {url}; trying the next profile link.")
            if not used:
                raise RuntimeError("Opened your profile but found no bots on it. If your bots are on a different page, paste that page's URL in Settings > My JuicyChat profile.")
            log(f"Reading your bots from {used}")
            stagnant = 0
            for pass_no in range(1, max_passes + 1):
                if stop.is_set() or state.get("closed"):
                    break
                before = len(dom)
                n = read_cards(page)
                emit("progress", stage="collecting", status="collecting", section="Mine", current=len(dom), target=0, passNo=pass_no,
                     maxPasses=max_passes, pageCards=n, networkResponses=len(captured), phase="Finding bots", message=f"Your bots: {len(dom)} found")
                stagnant = stagnant + 1 if len(dom) == before else 0
                if stagnant >= 3:
                    break
                _nudge_down(page)
                _wait_for_list(page, stop, max_wait=5.0, quiet=1.5)
            assembled = scraper._assemble(captured, dom, {})
            by_id = {}
            for b in assembled.get("bots", []):
                nb = normalize_bot(b, "Mine")
                if not nb:
                    continue
                bid = scraper.bot_num_id(nb.get("url")) or scraper.bot_num_id(nb.get("id"))
                if bid and bid not in by_id:
                    by_id[bid] = nb
            rows = [by_id[i] for i in order if i in by_id]

            def apply(row, st, how):
                h = row.setdefault("headline", {})
                got = False
                for k in ("chats", "likes", "favorites", "views"):
                    if st.get(k) and not h.get(k):
                        h[k] = float(st[k]); got = True
                if st.get("created") and not row.get("created"):
                    row["created"] = _created_iso(st["created"]) or row.get("created")
                if got:
                    row["statMode"] = how
                return got
            has_nums = lambda r: any((r.get("headline") or {}).get(k) for k in ("chats", "likes", "favorites"))

            # 1) JuicyChat's own data, captured while the lounge loaded
            from_data = stats_from_json([c.get("data") for c in captured], [scraper.bot_num_id(r.get("url")) for r in rows])
            for r in rows:
                st = from_data.get(str(scraper.bot_num_id(r.get("url"))))
                if st:
                    apply(r, st, "data")
            log(f"Your bots: numbers found in JuicyChat's data for {sum(1 for r in rows if has_nums(r))} of {len(rows)}.")

            # 2) anything still missing: open that bot's own page and read it there
            missing = [r for r in rows if not has_nums(r) and r.get("url")]
            for i, r in enumerate(missing, 1):
                if stop.is_set() or state.get("closed"):
                    break
                emit("progress", stage="collecting", status="collecting", section="Mine", phase="Reading bot pages", current=i, target=len(missing),
                     message=f"Reading bot pages for their numbers: {i} of {len(missing)} ({(r.get('title') or '')[:40]})")
                before = len(captured)
                try:
                    page.goto(r["url"], wait_until="domcontentloaded", timeout=45000)
                    page.wait_for_timeout(2500)
                except Exception:
                    continue
                bid = scraper.bot_num_id(r.get("url"))
                st = stats_from_json([c.get("data") for c in captured[before:]], [bid]).get(str(bid)) or {}
                if not any(st.get(k) for k in ("chats", "likes", "favorites")):
                    try:
                        st = {**stats_from_page_numbers(page.evaluate(BOT_PAGE_JS)), **{k: v for k, v in st.items() if k == "created"}}
                    except Exception:
                        pass
                apply(r, st, "bot page")
            if missing:
                log(f"Your bots: numbers found for {sum(1 for r in rows if has_nums(r))} of {len(rows)} after reading bot pages.")
            sample = [{"title": c.get("name") or c["text"].split("\n")[0], "text": c["text"][:300], "stats": (c.get("stats") or [])[:6]} for c in dom[:3]]
            key_sample = []
            for c in captured[:40]:
                d = c.get("data")
                def keys_of(x, depth=0):
                    if depth > 5: return
                    if isinstance(x, dict):
                        if any(k in x for k in ("id", "character_id", "characterId")) and len(x) > 4:
                            key_sample.append(sorted(list(x.keys()))[:40]); return
                        for v in x.values(): keys_of(v, depth + 1)
                    elif isinstance(x, list) and x:
                        keys_of(x[0], depth + 1)
                keys_of(d)
                if len(key_sample) >= 3: break
            emit("diag", dataKeys=key_sample[:3], cardsOnPage=len(dom), jsonResponses=len(captured), withNumbers=sum(1 for r in rows if (r.get("headline") or {}).get("chats") or (r.get("headline") or {}).get("likes")),
                 modes=sorted({r.get("statMode") or "none" for r in rows}), sample=sample, url=used)
            return rows, used
        finally:
            try:
                if not state.get("closed"):
                    ctx.close()
            except Exception:
                pass


TAG_URL = re.compile(r"tag|categor|label|genre", re.I)
TAG_NAME_KEYS = ("tagName", "tag_name", "name", "title", "label", "tag", "text")


def _tag_names_in(data, out, depth=0):
    """Names from a JSON payload that is (or contains) a list of tags: ["Romance", ...] or [{"name": "Romance"}, ...]."""
    if depth > 6:
        return
    if isinstance(data, list):
        for x in data:
            if isinstance(x, str):
                if 0 < len(x.strip()) < 40:
                    out.add(x.strip())
            elif isinstance(x, dict):
                for k in TAG_NAME_KEYS:
                    if isinstance(x.get(k), str) and 0 < len(x[k].strip()) < 40:
                        out.add(x[k].strip())
                        break
                for v in x.values():
                    if isinstance(v, (list, dict)):
                        _tag_names_in(v, out, depth + 1)
    elif isinstance(data, dict):
        for v in data.values():
            if isinstance(v, (list, dict)):
                _tag_names_in(v, out, depth + 1)


# v1.3.4: the chips in JuicyChat's tag bar (open after "All Tags" is pressed): the row that starts with the "All" chip.
# "Bull/The Third NSFW" is the tag "Bull/The Third" with an NSFW badge; "All", "All Tags" and "Block Tags" are buttons, not tags.
TAG_PANEL_JS = r"""() => {
  const norm = s => String(s || '').replace(/\s+/g, ' ').trim();
  const skip = /^(all|all tags|block tags|more|less|show all|show less|[\u25b2\u25bc\u02c4\u02c5^v]?)$/i;
  let best = [];
  const starts = [...document.querySelectorAll('button, a, span, div, li, label')].filter(e => norm(e.innerText || e.textContent) === 'All' && e.querySelectorAll('*').length < 6);
  for (const a of starts) {
    let box = a.parentElement;
    for (let up = 0; up < 4 && box; up++, box = box.parentElement) {
      const kids = [...box.children];
      if (kids.length < 15) continue;
      const names = kids.map(k => norm(k.innerText || k.textContent).replace(/\s*NSFW$/i, '').replace(/^[^\p{L}\p{N}]+/u, '').trim()).filter(t => t && t.length < 40 && !skip.test(t));
      if (names.length > best.length) best = names;
      break;
    }
  }
  return [...new Set(best)];
}"""


def scan_tags(profile_dir, stop):
    """Reads JuicyChat's own tag list while signed in: the tag lists the site loads for its filters, plus the tags shown on the bots on the front page."""
    found, captured, state = set(), [], {}

    def on_response(resp):
        try:
            if "json" in resp.headers.get("content-type", "") and ("juicy" in resp.url) and TAG_URL.search(resp.url):
                payload = resp.json()
                _tag_names_in(payload, found)
        except Exception:
            pass

    def on_any(resp):
        try:
            if "json" in resp.headers.get("content-type", "") and "juicy" in resp.url:
                captured.append(resp.json())
        except Exception:
            pass

    with sync_playwright() as p:
        ctx = launch_scan_context(p, profile_dir, hidden=True)
        ctx.on("close", lambda *_: state.update(closed=True))
        ctx.on("response", on_response)
        ctx.on("response", on_any)
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            try:
                page.goto(scraper.BASE, wait_until="domcontentloaded", timeout=60000)
                page.wait_for_timeout(3500)
            except Exception as e:
                log(f"JuicyChat was slow to load ({e.__class__.__name__}).")
            clear_claim_overlay(page, log)
            # v1.3.4: the tags are read from JuicyChat's own "All Tags" panel on the home page: the complete, fixed list creators pick from. Before, the list
            # was put together from the bots on the page, and a short line on a bot card (its name, its creator's name) was taken as a tag.
            panel = []
            try:
                try:
                    btn = page.get_by_text("All Tags", exact=True).first
                    if btn.count():
                        btn.click(timeout=5000)
                        page.wait_for_timeout(1500)
                except Exception as e:
                    log(f"The All Tags button couldn't be pressed ({e.__class__.__name__}); reading the tags shown.")
                panel = [t for t in (page.evaluate(TAG_PANEL_JS) or []) if isinstance(t, str) and 0 < len(t.strip()) < 40]
            except Exception as e:
                log(f"JuicyChat's All Tags panel couldn't be read ({e.__class__.__name__}).")
            if len(panel) >= 30:
                found.clear()
                found.update(t.strip() for t in panel)
                log(f"Read {len(found)} tags from JuicyChat's All Tags panel.")
                return sorted(found, key=str.lower)
            log(f"JuicyChat's All Tags panel showed {len(panel)} tags; reading the tags JuicyChat's own bot data carries instead.")
            # fallback: the tags in JuicyChat's own bot data (its fixed tag names only; never text read off a bot card)
            found.clear()
            try:
                res = page.evaluate(JUICY_TAGS_JS, {"feeds": [f for f, _ in FEEDS], "maxPages": 3}) or {}
                for name in (res.get("tags") or {}):
                    if not str(name).strip().startswith("@"):
                        found.add(name)
                log(f"Read {len(found)} tags from {res.get('bots', 0)} bots in JuicyChat's own data." + (f" ({'; '.join(res.get('warnings') or [])})" if res.get("warnings") else ""))
            except Exception as e:
                log(f"JuicyChat's bot data could not be read for tags ({e.__class__.__name__}).")
            return sorted(found, key=str.lower)
        finally:
            try:
                if not state.get("closed"):
                    ctx.close()
            except Exception:
                pass


def main():
    if len(sys.argv) < 4:
        raise SystemExit("usage: worker.py ACTION PROFILE STOPFILE [args...]")
    action = sys.argv[1]
    profile = os.path.abspath(sys.argv[2])
    stop_file = os.path.abspath(sys.argv[3])
    os.makedirs(profile, exist_ok=True)
    try:
        os.remove(stop_file)
    except FileNotFoundError:
        pass
    stop = threading.Event()
    threading.Thread(target=monitor_stop, args=(stop_file, stop), daemon=True).start()

    if action == "login":
        link = sys.argv[4] if len(sys.argv) > 4 else scraper.BASE
        emit("auth", status="checking", signedIn=None,
             message="Signing in with the magic link in the background...")
        result = do_login(profile, link, stop)
        emit("result", action="login", result=result)
        return

    if action == "scan":
        section = sys.argv[4]
        target = max(1, min(500, int(sys.argv[5])))
        rows, clicked, skipped_bots = scan_section(profile, section, target, stop)
        emit("result", action="scan", section=section, rows=rows, cancelled=stop.is_set(), clickedSection=clicked, skipped=skipped_bots)
        return

    if action == "tags":
        names = scan_tags(profile, stop)
        emit("result", action="tags", tags=names, cancelled=stop.is_set())
        return

    if action == "mybots":
        url = sys.argv[4] if len(sys.argv) > 4 and sys.argv[4].startswith("http") else ""
        mode = sys.argv[5] if len(sys.argv) > 5 else "lounge"
        rows, used = scan_my_bots(profile, url, stop, mode=mode)
        emit("result", action="mybots", rows=rows, profileUrl=used, cancelled=stop.is_set())
        return

    raise SystemExit(f"unknown action: {action}")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        emit("error", message=str(e), errorType=e.__class__.__name__)
        raise
