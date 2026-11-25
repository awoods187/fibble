import { createHash } from 'node:crypto';
import { z } from 'zod';
import { seededShuffle } from '../shuffle';
import { describeSensitive, findSensitive } from '../content/sensitive';
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

export { seededShuffle } from '../shuffle';

/** Drop anything that trips the hard content filter: it never reaches a human rater. */
export function filterForRating(
  truths: RewordedTruth[],
  lies: LieCandidate[],
): { truths: RewordedTruth[]; lies: LieCandidate[]; skipped: string[] } {
  const skipped: string[] = [];
  const clean = (texts: string[], label: string) => {
    const hits = findSensitive(...texts);
    if (hits.length) skipped.push(`${label}: ${describeSensitive(hits)}`);
    return !hits.length;
  };
  return {
    truths: truths.filter((t) => clean([t.text, t.expansion], `truth ${t.candidateId}`)),
    lies: lies.filter((l) => clean([l.text, l.lieNote], `lie ${l.id}`)),
    skipped,
  };
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

export const FUN_LEVELS = ['boring', 'fine', 'great', 'not-ok'] as const;
export type FunLevel = (typeof FUN_LEVELS)[number];

/** The file the page downloads. Version 1 files (believability only) have no `fun`. */
export const RatingsFileSchema = z.object({
  setId: z.string(),
  ratedAt: z.string(),
  ratings: z.array(
    z.object({
      id: z.string(),
      /** Believability: could a player believe it's true? */
      plausibility: z.int().min(1).max(5),
      /** Would it make a good card in the game, whatever its truth? "not-ok" = shouldn't be in it. */
      fun: z.enum(FUN_LEVELS).optional(),
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

/**
 * Two separate questions (v1 mixed them, and raters used "believable" to mean
 * "good for the game"). Believability is only about whether it sounds true.
 */
export const BELIEVE_SCALE = [
  [1, 'Obviously made up'],
  [2, 'I doubt it'],
  [3, 'Could go either way'],
  [4, 'Probably true'],
  [5, 'Definitely sounds true'],
] as const;

export const FUN_SCALE = [
  ['boring', 'Boring', 'B', 'A shrug, true or not'],
  ['fine', 'Fine', 'F', 'Would do as a card'],
  ['great', 'Great', 'G', '"No way!" Players would share it'],
  ['not-ok', 'Not OK', 'N', "Shouldn't be in the game"],
] as const;

export function buildRatingPage(set: RatingSet): string {
  const data = embedJson({
    setId: set.setId,
    items: set.items,
    believe: BELIEVE_SCALE,
    fun: FUN_SCALE,
  });
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; form-action 'none'; base-uri 'none'">
<meta name="robots" content="noindex">
<title>Fibble · rate statements</title>
<style>
  :root { --bg:#0a0a0b; --surface:#141416; --raised:#1c1c1f; --border:#2a2a2e; --s100:#e8e8ec; --s300:#b8bcc4; --s500:#8a8f98;
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
  .card { background:var(--surface); border:1px solid var(--border); border-radius:20px; box-shadow:inset 0 1px 0 0 rgb(255 255 255 / .08); padding:28px 24px; min-height:160px; }
  .cat { text-transform:uppercase; letter-spacing:.08em; font-size:12px; color:var(--s500); margin-bottom:12px; }
  .text { font-size:20px; line-height:1.45; }
  fieldset { border:0; margin:20px 0 0; padding:0; }
  legend { font-size:14px; color:var(--s300); margin-bottom:8px; padding:0; }
  legend strong { color:var(--s100); }
  .seg { display:grid; gap:6px; }
  .seg.five { grid-template-columns:repeat(5,1fr); }
  .seg.four { grid-template-columns:repeat(4,1fr); }
  .opt { padding:10px 6px; background:var(--raised); color:var(--s100); border:1px solid var(--border); border-radius:12px; font:inherit; font-size:13px; line-height:1.25; cursor:pointer; text-align:center; }
  .opt b { display:block; font-size:18px; font-variant-numeric:tabular-nums; margin-bottom:2px; }
  .opt small { display:block; color:var(--s500); font-size:11px; margin-top:2px; }
  .opt:hover, .opt:focus-visible { border-color:var(--s500); outline:none; }
  .opt[aria-pressed="true"] { border-color:var(--s100); background:#2a2a2f; }
  .opt.notok { border-color:#5a2a2c; }
  .opt.notok[aria-pressed="true"] { border-color:#e5484d; background:#3a1a1c; }
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
  <header><h1>Fibble · rate statements</h1><span class="progress" id="progress"></span></header>
  <div class="bar"><div id="bar"></div></div>
  <p class="intro">Some of these are true and some are invented. Answer two separate questions for each, without looking anything up. <strong>Believable?</strong> is only about whether it sounds true. <strong>Good for the game?</strong> is whether it would make a fun card, true or not. Use <strong>Not OK</strong> for anything that shouldn't be in the game at all: politics, extremism, racism, atrocities, anything hurtful.</p>
  <section id="view"></section>
  <p class="hint"><kbd>1</kbd>–<kbd>5</kbd> believable · <kbd>B</kbd> <kbd>F</kbd> <kbd>G</kbd> <kbd>N</kbd> boring / fine / great / not OK · <kbd>K</kbd> I already knew · <kbd>←</kbd> <kbd>→</kbd> move · progress saves in this browser</p>
</main>
<script id="data" type="application/json">${data}</script>
<script>
(() => {
  const { setId, items, believe, fun } = JSON.parse(document.getElementById('data').textContent);
  const storeKey = 'fibble-' + setId;
  const saved = JSON.parse(localStorage.getItem(storeKey) || '{}');
  const ratings = saved.ratings || {};
  let i = Math.min(saved.i || 0, items.length);
  const view = document.getElementById('view');
  const save = () => localStorage.setItem(storeKey, JSON.stringify({ ratings, i }));
  const complete = (r) => Boolean(r && r.plausibility && r.fun);
  const done = () => items.filter((it) => complete(ratings[it.id])).length;
  const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids); return e; };

  function render() {
    document.getElementById('progress').textContent = done() + ' / ' + items.length + ' rated';
    document.getElementById('bar').style.width = (100 * done() / items.length) + '%';
    view.replaceChildren(i >= items.length ? doneView() : cardView(items[i]));
  }

  function choice(label, value, current, onPick) {
    const b = el('button', { className: 'opt', type: 'button' }, ...label);
    b.setAttribute('aria-pressed', String(current === value));
    b.addEventListener('click', () => onPick(value));
    return b;
  }

  function cardView(item) {
    const r = ratings[item.id] || {};
    const believeOpts = believe.map(([n, title]) => choice([el('b', {}, String(n)), title], n, r.plausibility, (v) => set('plausibility', v)));
    const funOpts = fun.map(([value, title, keyName, desc]) => {
      const b = choice([el('b', {}, title), el('small', {}, desc)], value, r.fun, (v) => set('fun', v));
      if (value === 'not-ok') b.classList.add('notok');
      return b;
    });
    const knew = el('input', { type: 'checkbox', checked: Boolean(r.knew) });
    knew.addEventListener('change', () => { ratings[item.id] = { ...(ratings[item.id] || {}), knew: knew.checked }; save(); });
    const prev = el('button', { type: 'button', disabled: i === 0 }, '← Back');
    prev.addEventListener('click', () => go(-1));
    const next = el('button', { type: 'button' }, complete(r) ? 'Next →' : 'Skip →');
    next.addEventListener('click', () => go(1));
    const legend = (q, hint) => { const l = el('legend', {}); l.append(el('strong', {}, q), ' ' + hint); return l; };
    return el('div', {},
      el('article', { className: 'card' }, el('div', { className: 'cat' }, item.category), el('div', { className: 'text' }, item.text)),
      el('fieldset', {}, legend('Believable?', 'Does it sound true?'), el('div', { className: 'seg five' }, ...believeOpts)),
      el('fieldset', {}, legend('Good for the game?', 'True or not, would it make a fun card?'), el('div', { className: 'seg four' }, ...funOpts)),
      el('div', { className: 'row' }, el('label', { className: 'knew' }, knew, 'I already knew whether this is true'), el('div', { className: 'nav' }, prev, ' ', next)));
  }

  function doneView() {
    const missing = items.length - done();
    const dl = el('button', { className: 'primary', type: 'button' }, 'Download ratings');
    dl.addEventListener('click', download);
    const back = el('button', { type: 'button' }, '← Review');
    back.addEventListener('click', () => { i = items.length - 1; save(); render(); });
    return el('div', { className: 'card done' },
      el('p', {}, missing ? missing + ' statement' + (missing === 1 ? '' : 's') + ' not fully rated. You can go back, or download what you have.' : 'All rated. Thank you.'),
      el('p', {}, dl), el('p', {}, back));
  }

  // Record one answer; move on once both questions for this card are answered.
  function set(field, value) {
    const item = items[i];
    ratings[item.id] = { ...(ratings[item.id] || {}), [field]: value };
    if (complete(ratings[item.id])) i++;
    save(); render();
  }
  function go(d) { i = Math.max(0, Math.min(items.length, i + d)); save(); render(); }

  function download() {
    const out = { setId, ratedAt: new Date().toISOString(), ratings: items
      .filter((it) => ratings[it.id] && ratings[it.id].plausibility)
      .map((it) => ({ id: it.id, plausibility: ratings[it.id].plausibility, ...(ratings[it.id].fun ? { fun: ratings[it.id].fun } : {}), knew: Boolean(ratings[it.id].knew) })) };
    const a = el('a', { href: URL.createObjectURL(new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' })), download: setId + '-ratings.json' });
    document.body.append(a); a.click(); a.remove();
  }

  const funKeys = Object.fromEntries(fun.map(([value, , keyName]) => [keyName.toLowerCase(), value]));
  document.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (i < items.length && /^[1-5]$/.test(k)) set('plausibility', Number(k));
    else if (i < items.length && funKeys[k]) set('fun', funKeys[k]);
    else if (e.key === 'ArrowLeft') go(-1);
    else if (e.key === 'ArrowRight') go(1);
    else if (k === 'k' && i < items.length) { const box = view.querySelector('input[type=checkbox]'); box.checked = !box.checked; box.dispatchEvent(new Event('change')); }
  });
  render();
})();
</script>
</body>
</html>
`;
}
