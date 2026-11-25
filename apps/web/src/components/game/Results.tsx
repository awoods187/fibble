'use client';

import {
  buildShareText,
  CATEGORIES,
  displayedStreak,
  formatDuration,
  type GameState,
  type PublicPuzzle,
  ROUNDS_PER_PUZZLE,
  roundOutcomes,
  roundTimes,
  score,
  type Stats,
} from '@fibble/shared';
import { useState } from 'react';
import { Countdown } from './Countdown';

interface Props {
  puzzle: PublicPuzzle;
  game: GameState;
  stats: Stats;
  today: string;
}

/**
 * Results (PRD section 3 and F6–F9): score, the per-round grid, time, streaks and the
 * histogram, the day's ten true facts ("Today you learned"), Share, and the countdown.
 */
export function Results({ puzzle, game, stats, today }: Props) {
  const total = score(game);
  const outcomes = roundOutcomes(game);
  const times = roundTimes(game);
  const streak = displayedStreak(stats, today);
  const [shared, setShared] = useState<string | null>(null);
  const shareText = buildShareText({
    puzzleNumber: puzzle.puzzleNumber,
    rounds: outcomes.map(Boolean),
    streak,
  });
  const maxBar = Math.max(1, ...stats.histogram);
  const totalTime = times.reduce<number>((a, t) => a + (t ?? 0), 0);

  async function share() {
    try {
      if (navigator.share) {
        await navigator.share({ text: shareText });
        setShared('Shared');
      } else {
        await navigator.clipboard.writeText(shareText);
        setShared('Copied to clipboard');
      }
    } catch {
      // The player closed the share sheet, or the clipboard is blocked: show the text instead.
      setShared('Copy the text below');
    }
  }

  return (
    <section
      aria-labelledby="results-title"
      className="flex w-full max-w-2xl flex-col items-center gap-8"
    >
      <div className="text-center">
        <h2 id="results-title" className="font-mono text-sm tracking-stamp text-silver-300">
          FIBBLE #{puzzle.puzzleNumber}
        </h2>
        <p
          className="mt-2 font-display text-6xl font-semibold text-metal"
          aria-label={`Score: ${total} out of ${ROUNDS_PER_PUZZLE}`}
        >
          {total}/{ROUNDS_PER_PUZZLE}
        </p>
        <p className="mt-1 text-sm text-silver-500">Total time {formatDuration(totalTime)}</p>
      </div>

      <ol className="grid w-full grid-cols-1 gap-2 sm:grid-cols-5" aria-label="Rounds">
        {CATEGORIES.map((c, i) => {
          const found = outcomes[i];
          return (
            <li
              key={c.name}
              className="flex items-center justify-between gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-sm sm:flex-col sm:text-center"
            >
              <span>
                <span aria-hidden="true">{c.emoji} </span>
                <span className="sm:hidden">{c.name}</span>
              </span>
              <span className={found ? 'text-correct' : 'text-fib'}>
                {found ? '✓ Found' : '✗ Fibbed'}
              </span>
              <span className="font-mono text-xs text-silver-500">
                {times[i] === undefined ? '' : formatDuration(times[i])}
              </span>
            </li>
          );
        })}
      </ol>

      <div className="flex w-full flex-col items-center gap-3">
        <button
          type="button"
          onClick={share}
          className="rounded-xl bg-metal px-10 py-3 font-semibold text-bg"
        >
          Share
        </button>
        {shared && (
          <p role="status" className="text-xs text-silver-500">
            {shared}
          </p>
        )}
        {shared === 'Copy the text below' && (
          <pre className="w-full overflow-x-auto rounded-xl border border-border bg-surface p-3 text-sm whitespace-pre-wrap">
            {shareText}
          </pre>
        )}
        <Countdown />
      </div>

      <dl className="grid w-full grid-cols-4 gap-2 text-center">
        {[
          ['Played', stats.played],
          ['Streak', streak],
          ['Best streak', stats.maxStreak],
          ['Perfect days', stats.perfectDays],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-border bg-surface p-3">
            <dd className="font-display text-2xl font-semibold text-silver-100">{value}</dd>
            <dt className="text-xs text-silver-500">{label}</dt>
          </div>
        ))}
      </dl>

      <figure className="w-full" aria-label="Score history">
        <figcaption className="mb-2 text-sm text-silver-300">Score history</figcaption>
        <ol className="flex flex-col gap-1">
          {stats.histogram.map((n, s) => (
            <li key={s} className="flex items-center gap-2 text-xs">
              <span className="w-8 text-right font-mono text-silver-500">{s}/5</span>
              <span
                className={`h-5 rounded-sm px-1.5 text-right leading-5 ${s === total ? 'bg-silver-300 text-bg' : 'bg-surface-raised text-silver-300'}`}
                style={{ width: `${Math.max(8, (n / maxBar) * 100)}%` }}
              >
                {n}
              </span>
            </li>
          ))}
        </ol>
      </figure>

      <section aria-labelledby="tyl-title" className="w-full">
        <h3 id="tyl-title" className="mb-3 text-sm text-silver-300">
          Today you learned
        </h3>
        <ul className="flex flex-col gap-3">
          {puzzle.rounds.flatMap((r, ri) =>
            (game.rounds[ri]?.result?.truths ?? []).map((t) => (
              <li
                key={`${ri}-${t.index}`}
                className="rounded-xl border border-border bg-surface p-4 text-sm"
              >
                <p className="text-silver-100">{r.statements[t.index]?.text}</p>
                <p className="mt-1 text-silver-500">{t.expansion}</p>
                <a
                  href={t.source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-block text-xs text-silver-300 underline underline-offset-4"
                >
                  Wikipedia: {t.source.title} ↗
                </a>
              </li>
            )),
          )}
        </ul>
      </section>
    </section>
  );
}
