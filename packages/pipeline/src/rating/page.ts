import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { LieCandidate } from '../generate/schemas';
import type { RewordedTruth } from '../types';

/**
 * A human plausibility-rating page (ADR 0008: the model rater needs human
 * calibration). Truths and lies are mixed, shuffled and given opaque ids, so
 * nothing on the page says which is which. The answer key is a separate file.
 *
 * The page is one self-contained HTML file opened from disk. It makes no network
 * requests (its CSP forbids them) and saves progress in the browser's
 * localStorage. Ratings leave only when the rater downloads them.
 */

export interface RatingItem {
  id: string;
  category: string;
  text: string;
}

export interface RatingKeyEntry {
  expected: 'truth' | 'lie';
  /** The truth's candidateId or the lie's id, for joining back to pipeline records. */
  sourceId: string;
}

export interface RatingSet {
  setId: string;
  items: RatingItem[];
  key: Record<string, RatingKeyEntry>;
}

const hash = (s: string) => createHash('sha256').update(s).digest('hex');

/** Deterministic shuffle (Fisher–Yates driven by a seeded hash), so a page can be rebuilt. */
export function seededShuffle<T>(items: T[], seed: string): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = parseInt(hash(`${seed}:${i}`).slice(0, 8), 16) % (i + 1);
    const a = out[i] as T;
    out[i] = out[j] as T;
    out[j] = a;
  }
  return out;
}

export function buildRatingSet(
  truths: RewordedTruth[],
  lies: LieCandidate[],
  seed: string,
): RatingSet {
  const setId = `rate-${hash(`${seed}|${truths.map((t) => t.candidateId).join()}|${lies.map((l) => l.id).join()}`).slice(0, 10)}`;
  const opaque = (sourceId: string) => `s-${hash(`${setId}|${sourceId}`).slice(0, 10)}`;
  const entries = [
    ...truths.map((t) => ({
      sourceId: t.candidateId,
      expected: 'truth' as const,
      category: t.category,
      text: t.text,
    })),
    ...lies.map((l) => ({
      sourceId: l.id,
      expected: 'lie' as const,
      category: l.category,
      text: l.text,
    })),
  ];
  const key: Record<string, RatingKeyEntry> = {};
  const items = seededShuffle(entries, seed).map((e) => {
    const id = opaque(e.sourceId);
    key[id] = { expected: e.expected, sourceId: e.sourceId };
    return { id, category: e.category, text: e.text };
  });
  return { setId, items, key };
}

/** The file the page downloads. */
export const RatingsFileSchema = z.object({
  setId: z.string(),
  ratedAt: z.string(),
  ratings: z.array(
    z.object({
      id: z.string(),
      plausibility: z.int().min(1).max(5),
      /** The rater already knew whether it was true, so the score isn't a blind judgment. */
      knew: z.boolean(),
    }),
  ),
});
export type RatingsFile = z.infer<typeof RatingsFileSchema>;

/** JSON safe to embed in a <script> element: no closing tags, no line separators. */
export function embedJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

const SCALE = [
  [1, 'Obviously invented', 'Impossible, absurd, or against common knowledge'],
  [2, 'Hard to believe', 'Needs something very unlikely, or the wording gives it away'],
  [3, 'Believable, but…', 'One detail feels too neat or convenient'],
  [4, 'Surprising but real-sounding', 'The kind of odd thing that really happens'],
  [5, 'Completely believable', 'Reads like an ordinary encyclopedia fact'],
] as const;

export function buildRatingPage(set: RatingSet): string {
  const data = embedJson({ setId: set.setId, items: set.items, scale: SCALE });
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; form-action 'none'; base-uri 'none'">
<meta name="robots" content="noindex">
<title>Fibble · rate believability</title>
<style>
  :root { --bg:#0a0a0b; --surface:#141416; --raised:#1c1c1f; --border:#2a2a2e; --s100:#e8e8ec; --s300:#b8bcc4; --s500:#8a8f98; --fib:#e5484d; --ok:#46a758;
    --metal:linear-gradient(135deg,#f4f5f7 0%,#a8adb6 50%,#6e737c 100%); color-scheme:dark; }
  * { box-sizing:border-box; }
  body { margin:0; min-height:100vh; background:var(--bg); color:var(--s100); font:16px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif; display:flex; justify-content:center; }
  main { width:100%; max-width:560px; padding:32px 20px 48px; }
  header { display:flex; justify-content:space-between; align-items:baseline; margin-bottom:20px; }
  h1 { margin:0; font-size:20px; letter-spacing:.02em; background:var(--metal); -webkit-background-clip:text; background-clip:text; color:transparent; }
  .progress { color:var(--s500); font-variant-numeric:tabular-nums; font-size:14px; }
  .bar { height:3px; background:var(--border); border-radius:2px; margin-bottom:24px; overflow:hidden; }
  .bar > div { height:100%; background:var(--s300); transition:width .2s; }
  .intro { color:var(--s300); font-size:14px; margin:0 0 20px; }
  .card { background:var(--surface); border:1px solid var(--border); border-radius:20px; box-shadow:inset 0 1px 0 0 rgb(255 255 255 / .08); padding:28px 24px; min-height:180px; }
  .cat { text-transform:uppercase; letter-spacing:.08em; font-size:12px; color:var(--s500); margin-bottom:12px; }
  .text { font-size:20px; line-height:1.45; }
  .scale { display:grid; gap:8px; margin-top:20px; }
  .opt { display:grid; grid-template-columns:32px 1fr; gap:12px; align-items:center; text-align:left; width:100%; padding:12px 14px; background:var(--raised); color:var(--s100); border:1px solid var(--border); border-radius:12px; font:inherit; cursor:pointer; }
  .opt:hover, .opt:focus-visible { border-color:var(--s500); outline:none; }
  .opt[aria-pressed="true"] { border-color:var(--s100); background:#26262a; }
  .num { display:grid; place-items:center; width:32px; height:32px; border-radius:8px; background:var(--border); font-weight:600; font-variant-numeric:tabular-nums; }
  .opt small { display:block; color:var(--s500); font-size:13px; }
  .row { display:flex; justify-content:space-between; align-items:center; margin-top:16px; gap:12px; flex-wrap:wrap; }
  label.knew { color:var(--s300); font-size:14px; display:flex; gap:8px; align-items:center; cursor:pointer; }
  .nav button, .done button { background:transparent; color:var(--s300); border:1px solid var(--border); border-radius:10px; padding:8px 14px; font:inherit; font-size:14px; cursor:pointer; }
  .nav button:disabled { opacity:.4; cursor:default; }
  .done { text-align:center; }
  .done .primary { background:var(--metal); color:#0a0a0b; border:0; font-weight:600; padding:12px 20px; font-size:16px; }
  .hint { color:var(--s500); font-size:12px; margin-top:24px; text-align:center; }
  kbd { font:inherit; border:1px solid var(--border); border-radius:4px; padding:0 4px; }
</style>
</head>
<body>
<main>
  <header><h1>Fibble · believability</h1><span class="progress" id="progress"></span></header>
  <div class="bar"><div id="bar"></div></div>
  <p class="intro">Some of these are true and some are invented. Rate each one as a player who hasn't seen it before: <strong>could a well-read adult believe it?</strong> Don't look anything up.</p>
  <section id="view"></section>
  <p class="hint"><kbd>1</kbd>–<kbd>5</kbd> rate · <kbd>K</kbd> I already knew · <kbd>←</kbd> <kbd>→</kbd> move · progress saves in this browser</p>
</main>
<script id="data" type="application/json">${data}</script>
<script>
(() => {
  const { setId, items, scale } = JSON.parse(document.getElementById('data').textContent);
  const storeKey = 'fibble-' + setId;
  const saved = JSON.parse(localStorage.getItem(storeKey) || '{}');
  const ratings = saved.ratings || {};
  let i = Math.min(saved.i || 0, items.length);
  const view = document.getElementById('view');
  const save = () => localStorage.setItem(storeKey, JSON.stringify({ ratings, i }));
  const rated = () => Object.values(ratings).filter((r) => r.plausibility).length;
  const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids); return e; };

  function render() {
    document.getElementById('progress').textContent = rated() + ' / ' + items.length + ' rated';
    document.getElementById('bar').style.width = (100 * rated() / items.length) + '%';
    view.replaceChildren(i >= items.length ? doneView() : cardView(items[i]));
  }

  function cardView(item) {
    const r = ratings[item.id] || {};
    const opts = scale.map(([n, title, desc]) => {
      const b = el('button', { className: 'opt', type: 'button' }, el('span', { className: 'num' }, String(n)), el('span', {}, title, el('small', {}, desc)));
      b.setAttribute('aria-pressed', String(r.plausibility === n));
      b.addEventListener('click', () => rate(n));
      return b;
    });
    const knew = el('input', { type: 'checkbox', checked: Boolean(r.knew) });
    knew.addEventListener('change', () => { ratings[item.id] = { ...(ratings[item.id] || {}), knew: knew.checked }; save(); });
    const prev = el('button', { type: 'button', disabled: i === 0 }, '← Back');
    prev.addEventListener('click', () => go(-1));
    const next = el('button', { type: 'button' }, 'Skip →');
    next.addEventListener('click', () => go(1));
    return el('div', {},
      el('article', { className: 'card' }, el('div', { className: 'cat' }, item.category), el('div', { className: 'text' }, item.text)),
      el('div', { className: 'scale', role: 'group', ariaLabel: 'Believability, 1 to 5' }, ...opts),
      el('div', { className: 'row' }, el('label', { className: 'knew' }, knew, 'I already knew whether this is true'), el('div', { className: 'nav' }, prev, ' ', next)));
  }

  function doneView() {
    const missing = items.length - items.filter((it) => ratings[it.id] && ratings[it.id].plausibility).length;
    const dl = el('button', { className: 'primary', type: 'button' }, 'Download ratings');
    dl.addEventListener('click', download);
    const back = el('button', { type: 'button' }, '← Review');
    back.addEventListener('click', () => { i = items.length - 1; save(); render(); });
    return el('div', { className: 'card done' },
      el('p', {}, missing ? missing + ' statement' + (missing === 1 ? '' : 's') + ' skipped. You can go back, or download what you have.' : 'All rated. Thank you.'),
      el('p', {}, dl), el('p', {}, back));
  }

  function rate(n) {
    const item = items[i];
    ratings[item.id] = { ...(ratings[item.id] || {}), plausibility: n };
    i++; save(); render();
  }
  function go(d) { i = Math.max(0, Math.min(items.length, i + d)); save(); render(); }

  function download() {
    const out = { setId, ratedAt: new Date().toISOString(), ratings: items
      .filter((it) => ratings[it.id] && ratings[it.id].plausibility)
      .map((it) => ({ id: it.id, plausibility: ratings[it.id].plausibility, knew: Boolean(ratings[it.id].knew) })) };
    const a = el('a', { href: URL.createObjectURL(new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' })), download: setId + '-ratings.json' });
    document.body.append(a); a.click(); a.remove();
  }

  document.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (i < items.length && /^[1-5]$/.test(e.key)) rate(Number(e.key));
    else if (e.key === 'ArrowLeft') go(-1);
    else if (e.key === 'ArrowRight') go(1);
    else if ((e.key === 'k' || e.key === 'K') && i < items.length) { const box = view.querySelector('input[type=checkbox]'); box.checked = !box.checked; box.dispatchEvent(new Event('change')); }
  });
  render();
})();
</script>
</body>
</html>
`;
}
