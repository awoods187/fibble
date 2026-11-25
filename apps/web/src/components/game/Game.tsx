'use client';

import {
  applyResult,
  CATEGORIES,
  chooseLie,
  type GameState,
  isFinished,
  type LieIndex,
  localDateString,
  markTruth,
  type MarkResult,
  newGame,
  nextRound,
  type PublicPuzzle,
  recordCompletion,
  ROUNDS_PER_PUZZLE,
  score,
  skipCard,
  startRound,
  type Stats,
  unmarkTruth,
} from '@fibble/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { RoundProgress } from '@/components/RoundProgress';
import { fetchPuzzle, submitAnswer } from '@/lib/client/api';
import { buzz } from '@/lib/client/haptics';
import {
  isFirstVisit,
  loadGame,
  loadStats,
  markHowToSeen,
  saveGame,
  saveStats,
} from '@/lib/client/storage';
import { HowTo, Splash } from './Intro';
import { Results } from './Results';
import { Reveal } from './Reveal';
import { RoundPlay } from './RoundPlay';

/** Start the clock on the round now showing, if it hasn't started yet. */
const begin = (state: GameState): GameState =>
  state.current < ROUNDS_PER_PUZZLE ? startRound(state, state.current, Date.now()) : state;

type Screen = 'loading' | 'missing' | 'splash' | 'howto' | 'play';

interface Props {
  /** The server's pick for today (UTC, or a sample in development). Replaced by the local date's puzzle. */
  initialPuzzle: PublicPuzzle | null;
}

/**
 * The day's game (PRD section 3, "Full user flow"). The rules live in @fibble/shared; this
 * component only wires them to the screen, the API and localStorage.
 */
export function Game({ initialPuzzle }: Props) {
  const [screen, setScreen] = useState<Screen>('loading');
  const [puzzle, setPuzzle] = useState<PublicPuzzle | null>(null);
  const [game, setGame] = useState<GameState | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [today, setToday] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const update = useCallback((next: GameState) => {
    setGame(next);
    saveGame(next);
  }, []);

  const n = game?.current ?? 0;
  const play = game?.rounds[n];
  const round = puzzle?.rounds[n];

  const send = useCallback(
    async (state: GameState, roundIdx: number) => {
      const choice = state.rounds[roundIdx]?.choice;
      if (choice === undefined) return;
      setSubmitting(true);
      setError(null);
      try {
        const result = await submitAnswer(state.date, roundIdx + 1, choice);
        const next = applyResult(state, roundIdx, result);
        update(next);
        if (!result.correct) buzz('wrong');
        if (isFinished(next)) {
          if (score(next) === ROUNDS_PER_PUZZLE) buzz('perfect');
          const s = recordCompletion(loadStats(), next.date, score(next));
          saveStats(s);
          setStats(s);
        }
      } catch {
        setError("Couldn't check your answer. Check your connection and try again.");
      } finally {
        setSubmitting(false);
      }
    },
    [update],
  );

  // Find today's puzzle by the player's local date: a new one starts at local midnight.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const local = localDateString(new Date());
      let p = initialPuzzle?.date === local ? initialPuzzle : null;
      if (!p) {
        try {
          const res = await fetchPuzzle(local);
          p = res.ok ? res.puzzle : initialPuzzle;
        } catch {
          p = initialPuzzle;
        }
      }
      if (cancelled) return;
      if (!p) return setScreen('missing');
      const saved = loadGame(p.date);
      // Not "no saved game": React can run this twice in development, and the first run saves.
      const first = isFirstVisit();
      // Return visits skip the splash; a first visit sees it and the how-to once.
      const state = first
        ? newGame(p.date, p.puzzleNumber)
        : begin(saved ?? newGame(p.date, p.puzzleNumber));
      setToday(local);
      setPuzzle(p);
      setStats(loadStats());
      update(state);
      setScreen(first ? 'splash' : 'play');
      // A resumed round may be locked with no answer back yet: ask again.
      const r = state.rounds[state.current];
      if (r?.choice !== undefined && !r.result) void send(state, state.current);
    })();
    return () => {
      cancelled = true;
    };
  }, [initialPuzzle, update, send]);

  const apply = useCallback(
    (r: MarkResult) => {
      if (r.ok) update(r.state);
    },
    [update],
  );

  const onTruth = useCallback(
    (c: LieIndex) => game && apply(markTruth(game, n, c)),
    [game, n, apply],
  );
  const onUntruth = useCallback(
    (c: LieIndex) => game && apply(unmarkTruth(game, n, c)),
    [game, n, apply],
  );
  const onSkip = useCallback(
    (c: LieIndex) => game && apply(skipCard(game, n, c)),
    [game, n, apply],
  );
  const onLie = useCallback(
    (c: LieIndex) => {
      if (!game || submitting) return;
      const r = chooseLie(game, n, c, Date.now());
      if (!r.ok) return;
      update(r.state);
      void send(r.state, n);
    },
    [game, n, submitting, update, send],
  );

  const onNext = useCallback(() => {
    if (!game) return;
    update(begin(nextRound(game)));
    window.scrollTo({ top: 0 });
    requestAnimationFrame(() => headingRef.current?.focus());
  }, [game, update]);

  if (screen === 'loading') {
    return (
      <p className="my-auto text-silver-500" role="status">
        Loading today’s Fibble…
      </p>
    );
  }
  if (screen === 'missing' || !puzzle || !game || !stats) {
    return <p className="my-auto text-silver-300">No puzzle today. Check back after midnight.</p>;
  }
  if (screen === 'splash') return <Splash onPlay={() => setScreen('howto')} />;
  if (screen === 'howto') {
    return (
      <HowTo
        onDone={() => {
          markHowToSeen();
          update(begin(game));
          setScreen('play');
        }}
      />
    );
  }

  const done = n >= ROUNDS_PER_PUZZLE;
  const roundsDone = game.rounds.filter((r) => r.result).length;

  return (
    <div className="flex w-full flex-col items-center gap-6">
      <div className="flex w-full items-center justify-between">
        <span className="font-mono text-sm tracking-stamp text-silver-300">
          #{puzzle.puzzleNumber}
        </span>
        <RoundProgress
          current={roundsDone}
          total={ROUNDS_PER_PUZZLE}
          label={done ? 'Finished' : `Round ${n + 1} of ${ROUNDS_PER_PUZZLE}`}
        />
        <span className="w-8" aria-hidden="true" />
      </div>
      {puzzle.sample && (
        <p className="font-mono text-xs tracking-stamp text-silver-500">SAMPLE PUZZLE</p>
      )}

      {done ? (
        <Results puzzle={puzzle} game={game} stats={stats} today={today} />
      ) : (
        round &&
        play && (
          <section
            aria-labelledby="round-title"
            className="flex w-full flex-col items-center gap-6"
          >
            <div className="text-center">
              <h2
                id="round-title"
                ref={headingRef}
                tabIndex={-1}
                className="text-sm font-medium uppercase tracking-category text-silver-300 outline-none [font-variant-caps:all-small-caps]"
              >
                <span aria-hidden="true">{CATEGORIES[n]?.emoji} </span>
                Round {n + 1}: {round.category}
              </h2>
              {!play.result && (
                <p className="mt-1 text-sm text-silver-500">
                  Two truths. One fib. Which is the lie?
                </p>
              )}
            </div>
            {play.result ? (
              <Reveal
                key={n}
                round={round}
                result={play.result}
                isLast={n === ROUNDS_PER_PUZZLE - 1}
                onNext={onNext}
              />
            ) : (
              <RoundPlay
                key={n}
                round={round}
                play={play}
                submitting={submitting}
                onTruth={onTruth}
                onUntruth={onUntruth}
                onSkip={onSkip}
                onLie={onLie}
              />
            )}
            {submitting && (
              <p role="status" className="text-sm text-silver-500">
                Checking…
              </p>
            )}
            {error && (
              <div role="alert" className="flex flex-col items-center gap-2 text-sm text-fib">
                <p>{error}</p>
                <button
                  type="button"
                  onClick={() => void send(game, n)}
                  className="rounded-xl border border-border px-4 py-2 text-silver-100"
                >
                  Try again
                </button>
              </div>
            )}
          </section>
        )
      )}
    </div>
  );
}
