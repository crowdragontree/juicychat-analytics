// Collapsible cards (v1.3.0): every card on the JuicyChat Analysis, Performance and Settings tabs folds up by clicking the empty part of its title row, like Prediction accuracy.
// A card is a box with a title row as its first child; clicking the title row (the title words, the empty part or the arrow) folds it; the buttons in the row do not. Collapse.apply(root) turns every such box inside root into a <details> (once; safe to call again
// after any redraw). What you folded stays folded, also after a redraw and after the app is restarted.
(function () {
  const KEY = 'jbs.collapsed', PAIRS = [['.perf-card', '.perf-card-head'], ['.panel', '.panel-head'], ['.rt-card', '.rt-card-h'], ['.fx', '.fx-head']];
  let closed = new Set(); try { closed = new Set(JSON.parse(localStorage.getItem(KEY) || '[]')); } catch (e) { /* nothing saved */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify([...closed])); } catch (e) { /* not saved */ } };
  const keyOf = (scope, head) => scope + ':' + String((head.querySelector('h3,h4,h5') || head).textContent || '').replace(/\s+/g, ' ').trim().replace(/\d+ bots? judged.*$/i, '').replace(/^total \w+ over time/i, 'total over time').trim().slice(0, 60).toLowerCase();
  function convert(el, headSel, scope) {
    if (!el || el.tagName === 'DETAILS' || el.dataset.cx || el.closest('summary')) return null;
    const head = [...el.children].find(c => c.matches(headSel)); if (!head) return null;
    const key = keyOf(scope, head), d = document.createElement('details'), s = document.createElement('summary');
    d.className = el.className + ' cx'; d.dataset.cx = key; if (el.id) d.id = el.id;
    for (const a of el.attributes) if (/^data-/.test(a.name) && a.name !== 'data-cx' && a.name !== 'data-bound') d.setAttribute(a.name, a.value);   // v1.3.4: a listener set up on the old box does not come along, so it must not look set up
    s.className = head.className + ' cx-sum'; while (head.firstChild) s.appendChild(head.firstChild);
    d.appendChild(s); for (const c of [...el.children]) if (c !== head) d.appendChild(c);
    d.open = !closed.has(key);
    d.addEventListener('toggle', () => { if (d.open) closed.delete(key); else closed.add(key); save(); });
    // pressing a button, field or link inside the title row does its own job and does not fold the card
    // a card folds when the empty part of its title row (or the arrow) is clicked. Clicking the title text or the empty space folds it (v1.3.2); a button, tab, chip, field or link in the row never does
    s.addEventListener('click', e => {
      e.preventDefault();
      const tg = e.target; if (!tg || !tg.isConnected) return;
      try { if (String(window.getSelection && window.getSelection() || '').trim()) return; } catch (x) { /* ignore */ }     // v1.3.2: selecting the title's words to copy them does not fold the card
      for (let n = tg; n && n !== s; n = n.parentElement) {
        if (n.matches('button,input,select,textarea,a,label,.rt-seg,[role="button"],[data-an],[data-dp],[data-metric],[onclick]')) return;
      }
      d.open = !d.open;
    });
    el.replaceWith(d); return d;
  }
  function apply(root, scope) {
    if (!root) return; scope = scope || (root.id || 'x');
    for (let pass = 0; pass < 3; pass++) {            // outer cards first, then the cards inside them
      let n = 0;
      for (const [cs, hs] of PAIRS) for (const el of root.querySelectorAll(cs)) if (el.parentElement && !el.dataset.cx && convert(el, hs, scope)) n++;
      if (!n) break;
    }
  }
  window.Collapse = {apply};
})();
