import { embedJson } from '../rating/page';
import type { ReviewItem } from './schemas';

/**
 * The stage 7 review page: one self-contained HTML file, opened from disk. Like the rating
 * page it makes no network requests (its CSP forbids them; Wikipedia source links open only
 * when clicked) and saves progress in localStorage. Decisions leave only when downloaded.
 */

const REASONS = [
  ['not-ok', 'Not OK', 'N', "Shouldn't be in the game at all"],
  ['boring', 'Boring', 'B', 'Correct but dull'],
  ['truth-wrong', 'Truth is wrong', 'T', 'A "true" card is false or misleading'],
  ['lie-might-be-true', 'Lie might be true', 'M', 'The lie could actually be real'],
  ['lie-too-easy', 'Lie too easy', 'E', 'The lie gives itself away'],
  ['other', 'Other', 'O', 'Explain in the note'],
] as const;

export function buildReviewPage(setId: string, items: ReviewItem[]): string {
  const data = embedJson({ setId, items, reasons: REASONS });
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; form-action 'none'; base-uri 'none'">
<meta name="robots" content="noindex">
<title>Fibble · review rounds</title>
<style>
  :root { --bg:#0a0a0b; --surface:#141416; --raised:#1c1c1f; --border:#2a2a2e; --s100:#e8e8ec; --s300:#b8bcc4; --s500:#8a8f98; --fib:#e5484d; --ok:#46a758;
    --metal:linear-gradient(135deg,#f4f5f7 0%,#a8adb6 50%,#6e737c 100%); color-scheme:dark; }
  * { box-sizing:border-box; }
  body { margin:0; min-height:100vh; background:var(--bg); color:var(--s100); font:15px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif; display:flex; justify-content:center; }
  main { width:100%; max-width:720px; padding:28px 20px 48px; }
  header { display:flex; justify-content:space-between; align-items:baseline; margin-bottom:16px; }
  h1 { margin:0; font-size:20px; background:var(--metal); -webkit-background-clip:text; background-clip:text; color:transparent; }
  .progress { color:var(--s500); font-size:13px; font-variant-numeric:tabular-nums; }
  .cat { text-transform:uppercase; letter-spacing:.08em; font-size:12px; color:var(--s500); margin:4px 0 12px; }
  .card { background:var(--surface); border:1px solid var(--border); border-radius:16px; padding:16px 18px; margin-bottom:10px; box-shadow:inset 0 1px 0 0 rgb(255 255 255 / .08); }
  .card.lie { border-color:#5a2a2c; }
  .stamp { display:inline-block; font-size:11px; letter-spacing:.2em; font-weight:700; padding:2px 8px; border-radius:6px; margin-bottom:8px; }
  .true .stamp { color:var(--ok); border:1px solid var(--ok); }
  .lie .stamp { color:var(--fib); border:1px solid var(--fib); }
  .text { font-size:17px; line-height:1.45; }
  .detail { color:var(--s300); font-size:13px; margin-top:8px; }
  .detail a { color:var(--s300); }
  .meta { color:var(--s500); font-size:12px; margin-top:6px; }
  h2 { font-size:13px; color:var(--s300); font-weight:600; margin:18px 0 8px; }
  .alt { display:flex; gap:10px; align-items:flex-start; width:100%; text-align:left; background:var(--raised); color:var(--s100); border:1px solid var(--border); border-radius:12px; padding:10px 12px; margin-bottom:6px; font:inherit; cursor:pointer; }
  .alt[aria-pressed="true"] { border-color:var(--fib); }
  .alt kbd { flex:none; }
  .actions { display:flex; gap:10px; margin-top:18px; flex-wrap:wrap; }
  button.big { font:inherit; font-weight:600; border-radius:12px; padding:10px 18px; cursor:pointer; border:1px solid var(--border); background:var(--raised); color:var(--s100); }
  button.approve { border-color:var(--ok); }
  button.approve[aria-pressed="true"] { background:#1d3322; }
  button.reject[aria-pressed="true"] { background:#3a1a1c; border-color:var(--fib); }
  .reasons { display:grid; grid-template-columns:repeat(3,1fr); gap:6px; margin-top:10px; }
  .reasons button { font:inherit; font-size:13px; text-align:left; background:var(--raised); color:var(--s100); border:1px solid var(--border); border-radius:10px; padding:8px 10px; cursor:pointer; }
  .reasons button[aria-pressed="true"] { border-color:var(--fib); background:#3a1a1c; }
  .reasons small { display:block; color:var(--s500); font-size:11px; }
  textarea { width:100%; margin-top:10px; background:var(--raised); color:var(--s100); border:1px solid var(--border); border-radius:10px; padding:8px 10px; font:inherit; font-size:13px; min-height:44px; }
  .nav { display:flex; justify-content:space-between; margin-top:18px; }
  .nav button, .done button { font:inherit; font-size:14px; background:transparent; color:var(--s300); border:1px solid var(--border); border-radius:10px; padding:8px 14px; cursor:pointer; }
  .done { text-align:center; }
  .done .primary { background:var(--metal); color:#0a0a0b; border:0; font-weight:600; padding:12px 20px; font-size:16px; }
  .hint { color:var(--s500); font-size:12px; margin-top:22px; text-align:center; }
  kbd { font:inherit; font-size:11px; border:1px solid var(--border); border-radius:4px; padding:0 4px; color:var(--s300); }
</style>
</head>
<body>
<main>
  <header><h1>Fibble · review rounds</h1><span class="progress" id="progress"></span></header>
  <section id="view"></section>
  <p class="hint"><kbd>A</kbd> approve · <kbd>R</kbd> reject, then a reason key · <kbd>1</kbd>–<kbd>9</kbd> choose a lie · <kbd>←</kbd> <kbd>→</kbd> move · progress saves in this browser</p>
</main>
<script id="data" type="application/json">${data}</script>
<script>
(() => {
  const { setId, items, reasons } = JSON.parse(document.getElementById('data').textContent);
  const storeKey = 'fibble-' + setId;
  const saved = JSON.parse(localStorage.getItem(storeKey) || '{}');
  const state = saved.state || {};
  let i = Math.min(saved.i || 0, items.length);
  const view = document.getElementById('view');
  const save = () => localStorage.setItem(storeKey, JSON.stringify({ state, i }));
  const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids); return e; };
  const decided = (s) => s && (s.decision === 'approved' || (s.decision === 'rejected' && s.reason));
  const count = () => items.filter((it) => decided(state[it.roundId])).length;
  const pct = (x) => Math.round(100 * x) + '%';

  function render() {
    document.getElementById('progress').textContent = 'Round ' + Math.min(i + 1, items.length) + ' / ' + items.length + ' · ' + count() + ' decided';
    view.replaceChildren(i >= items.length ? doneView() : roundView(items[i]));
  }

  function roundView(item) {
    const s = state[item.roundId] || {};
    const lieId = s.lieId || item.lies[0].lieId;
    const lie = item.lies.find((l) => l.lieId === lieId) || item.lies[0];
    const truthCard = (t) => el('div', { className: 'card true' },
      el('div', { className: 'stamp' }, 'TRUE'), el('div', { className: 'text' }, t.text),
      el('div', { className: 'detail' }, t.expansion + ' ', el('a', { href: t.sourceUrl, target: '_blank', rel: 'noopener noreferrer' }, 'Wikipedia: ' + t.sourceTitle)));
    const lieMeta = (l) => 'plausibility ' + (l.plausibility ?? '?') + '/5 · spotter found it ' + pct(l.spotterDetectionRate);
    const lieCard = el('div', { className: 'card lie' },
      el('div', { className: 'stamp' }, 'FIB'), el('div', { className: 'text' }, lie.text),
      el('div', { className: 'detail' }, 'Why it sounded true: ' + lie.lieNote),
      el('div', { className: 'meta' }, lieMeta(lie) + (item.heuristicFlags.length && lie === item.lies[0] ? ' · flags: ' + item.heuristicFlags.join(', ') : '')));
    const alts = item.lies.length > 1 ? [el('h2', {}, 'Lies to choose from (' + item.lies.length + ')'), ...item.lies.map((l, n) => {
      const b = el('button', { className: 'alt', type: 'button' }, el('kbd', {}, String(n + 1)), el('span', {}, l.text, el('div', { className: 'meta' }, lieMeta(l))));
      b.setAttribute('aria-pressed', String(l.lieId === lie.lieId));
      b.addEventListener('click', () => setLie(l.lieId));
      return b;
    })] : [];
    const approve = el('button', { className: 'big approve', type: 'button' }, 'Approve');
    approve.setAttribute('aria-pressed', String(s.decision === 'approved'));
    approve.addEventListener('click', () => decide('approved'));
    const reject = el('button', { className: 'big reject', type: 'button' }, 'Reject');
    reject.setAttribute('aria-pressed', String(s.decision === 'rejected'));
    reject.addEventListener('click', () => decide('rejected'));
    const reasonBox = s.decision === 'rejected' ? el('div', { className: 'reasons' }, ...reasons.map(([value, title, key, desc]) => {
      const b = el('button', { type: 'button' }, title + ' (' + key + ')', el('small', {}, desc));
      b.setAttribute('aria-pressed', String(s.reason === value));
      b.addEventListener('click', () => setReason(value));
      return b;
    })) : '';
    const note = el('textarea', { placeholder: 'Note (optional)', value: s.note || '' });
    note.addEventListener('input', () => { state[item.roundId] = { ...(state[item.roundId] || {}), note: note.value }; save(); });
    const prev = el('button', { type: 'button', disabled: i === 0 }, '← Back');
    prev.addEventListener('click', () => go(-1));
    const next = el('button', { type: 'button' }, 'Next →');
    next.addEventListener('click', () => go(1));
    return el('div', {},
      el('div', { className: 'cat' }, item.category),
      ...item.truths.map(truthCard), lieCard, ...alts,
      el('div', { className: 'actions' }, approve, reject), reasonBox, note,
      el('div', { className: 'nav' }, prev, next));
  }

  function doneView() {
    const dl = el('button', { className: 'primary', type: 'button' }, 'Download decisions');
    dl.addEventListener('click', download);
    const back = el('button', { type: 'button' }, '← Review');
    back.addEventListener('click', () => { i = items.length - 1; save(); render(); });
    const left = items.length - count();
    return el('div', { className: 'card done' },
      el('p', {}, left ? left + ' round' + (left === 1 ? '' : 's') + ' undecided. Undecided rounds are left out.' : 'All rounds decided.'),
      el('p', {}, dl), el('p', {}, back));
  }

  const current = () => items[i];
  function setLie(lieId) { const it = current(); state[it.roundId] = { ...(state[it.roundId] || {}), lieId }; save(); render(); }
  function decide(decision) {
    const it = current();
    state[it.roundId] = { ...(state[it.roundId] || {}), decision };
    if (decision === 'approved') { delete state[it.roundId].reason; i++; }
    save(); render();
  }
  function setReason(reason) { const it = current(); state[it.roundId] = { ...(state[it.roundId] || {}), decision: 'rejected', reason }; i++; save(); render(); }
  function go(d) { i = Math.max(0, Math.min(items.length, i + d)); save(); render(); }

  function download() {
    const decisions = items.flatMap((it) => {
      const s = state[it.roundId];
      if (!decided(s)) return [];
      const note = s.note && s.note.trim() ? { note: s.note.trim() } : {};
      return s.decision === 'approved'
        ? [{ roundId: it.roundId, decision: 'approved', lieId: s.lieId || it.lies[0].lieId, ...note }]
        : [{ roundId: it.roundId, decision: 'rejected', reason: s.reason, ...note }];
    });
    const out = { setId, decidedAt: new Date().toISOString(), decisions };
    const a = el('a', { href: URL.createObjectURL(new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' })), download: setId + '-decisions.json' });
    document.body.append(a); a.click(); a.remove();
  }

  const reasonKeys = Object.fromEntries(reasons.map(([value, , key]) => [key.toLowerCase(), value]));
  document.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || e.target.tagName === 'TEXTAREA') return;
    const k = e.key.toLowerCase();
    const it = current();
    if (!it) { if (e.key === 'ArrowLeft') go(-1); return; }
    const s = state[it.roundId] || {};
    if (k === 'a') decide('approved');
    else if (k === 'r') decide('rejected');
    else if (s.decision === 'rejected' && reasonKeys[k]) setReason(reasonKeys[k]);
    else if (/^[1-9]$/.test(k) && it.lies[Number(k) - 1]) setLie(it.lies[Number(k) - 1].lieId);
    else if (e.key === 'ArrowLeft') go(-1);
    else if (e.key === 'ArrowRight') go(1);
  });
  render();
})();
</script>
</body>
</html>
`;
}
