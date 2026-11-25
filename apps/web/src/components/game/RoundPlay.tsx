'use client';

import {
  isLastCard,
  type LieIndex,
  type PublicRound,
  type RoundPlay as Play,
  stack,
} from '@fibble/shared';
import { useEffect, useRef, useState } from 'react';
import { HapticsToggle } from './HapticsToggle';
import { SwipeCard, type SwipeCardHandle } from './SwipeCard';

interface Props {
  round: PublicRound;
  play: Play;
  submitting: boolean;
  onTruth: (card: LieIndex) => void;
  onUntruth: (card: LieIndex) => void;
  onSkip: (card: LieIndex) => void;
  onLie: (card: LieIndex) => void;
}

export const LAST_CARD_HINT = 'One of these is a fib.';
const CARDS: LieIndex[] = [0, 1, 2];
const pad = (n: number) => String(n + 1).padStart(2, '0');

const cardClass =
  'relative flex flex-col rounded-card border border-border bg-surface p-5 shadow-card-edge';

/**
 * One round (PRD section 3). Three ways to play, same rules:
 * - Desktop: all three cards side by side; keys 1–3 focus a card, T or → marks it truth,
 *   L or ← makes it the lie.
 * - Mobile: a stack; swipe right (Truth) sends the top card to the tray, up (Skip) sends it
 *   to the back, left (Lie) locks the round. The buttons do the same, with the same motion.
 * - List view: radio buttons and "Lock in".
 */
export function RoundPlay({ round, play, submitting, onTruth, onUntruth, onSkip, onLie }: Props) {
  const [listView, setListView] = useState(false);
  const [focused, setFocused] = useState<LieIndex>(0);
  const cardRefs = useRef<(HTMLElement | null)[]>([]);
  const swipeRef = useRef<SwipeCardHandle>(null);
  // Bumped when a Truth is refused on the last card, to replay the hint's nudge.
  const [refusals, setRefusals] = useState(0);
  const locked = play.choice !== undefined;
  const lastCard = isLastCard(play);

  useEffect(() => {
    if (listView || locked) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const k = e.key.toLowerCase();
      if (k === '1' || k === '2' || k === '3') {
        const card = (Number(k) - 1) as LieIndex;
        setFocused(card);
        cardRefs.current[card]?.focus();
      } else if (k === 't' || e.key === 'ArrowRight') {
        if (play.truths.includes(focused)) onUntruth(focused);
        else onTruth(focused);
      } else if (k === 'l' || e.key === 'ArrowLeft') {
        onLie(focused);
      } else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [listView, locked, focused, play.truths, onTruth, onUntruth, onLie]);

  const toggle = (
    <button
      type="button"
      onClick={() => setListView((v) => !v)}
      className="text-xs text-silver-500 underline underline-offset-4 hover:text-silver-300"
    >
      {listView ? 'Card view' : 'List view'}
    </button>
  );

  if (listView)
    return (
      <ListView round={round} play={play} submitting={submitting} onLie={onLie} toggle={toggle} />
    );

  const top = stack(play)[0];
  const behind = stack(play).slice(1);

  return (
    <div className="flex w-full flex-col items-center gap-5">
      {/* Desktop: side by side */}
      <div className="hidden w-full grid-cols-3 gap-4 md:grid">
        {CARDS.map((i) => {
          const isTruth = play.truths.includes(i);
          return (
            <article
              key={i}
              ref={(el) => {
                cardRefs.current[i] = el;
              }}
              tabIndex={0}
              onFocus={() => setFocused(i)}
              aria-label={`Card ${i + 1}${isTruth ? ', marked truth' : ''}`}
              className={`${cardClass} min-h-64 ${focused === i ? 'border-silver-500' : ''} ${isTruth ? 'opacity-70' : ''}`}
            >
              <div className="flex items-center justify-between">
                <span
                  className="font-mono text-sm tracking-stamp text-silver-500"
                  aria-hidden="true"
                >
                  {pad(i)}
                </span>
                {isTruth && (
                  <span className="font-mono text-xs tracking-stamp text-truth">✓ TRUTH</span>
                )}
              </div>
              <p className="my-auto py-4 text-left text-lg leading-[1.4] text-silver-100">
                {round.statements[i]?.text}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={locked || submitting || (!isTruth && lastCard)}
                  aria-pressed={isTruth}
                  onClick={() => (isTruth ? onUntruth(i) : onTruth(i))}
                  className="flex-1 rounded-xl border border-border px-3 py-2 text-sm text-silver-300 hover:border-silver-500 disabled:opacity-40"
                >
                  {isTruth ? 'Undo truth' : 'Truth'}
                </button>
                <button
                  type="button"
                  disabled={locked || submitting}
                  onClick={() => onLie(i)}
                  className="flex-1 rounded-xl border border-fib/60 px-3 py-2 text-sm text-fib hover:border-fib disabled:opacity-40"
                >
                  This is the fib
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {/* Mobile: the stack */}
      <div className="flex w-full flex-col items-center gap-4 md:hidden">
        <div className="relative isolate w-[88vw] max-w-[var(--card-max-width)] pb-4">
          {behind.slice(0, 2).map((c, depth) => (
            <div
              key={c}
              aria-hidden="true"
              className="absolute inset-0 rounded-card border border-border bg-surface shadow-card-edge"
              style={{
                transform: `translateY(${(depth + 1) * 8}px) scale(${depth === 0 ? 0.96 : 0.92})`,
                zIndex: -depth - 1,
              }}
            />
          ))}
          {top !== undefined && (
            <SwipeCard
              key={top}
              ref={swipeRef}
              card={top}
              text={round.statements[top]?.text ?? ''}
              truthRefused={lastCard}
              disabled={locked || submitting}
              onCommit={(a) =>
                a === 'truth' ? onTruth(top) : a === 'lie' ? onLie(top) : onSkip(top)
              }
              onRefuse={() => setRefusals((n) => n + 1)}
            />
          )}
        </div>
        {top !== undefined && (
          <div className="flex w-[88vw] max-w-[var(--card-max-width)] gap-2">
            <button
              type="button"
              disabled={locked || submitting}
              onClick={() => swipeRef.current?.fling('lie')}
              className="flex-1 rounded-xl border border-fib/60 py-3 text-fib disabled:opacity-40"
            >
              ← Lie
            </button>
            <button
              type="button"
              disabled={locked || submitting || behind.length === 0}
              onClick={() => swipeRef.current?.fling('skip')}
              className="flex-1 rounded-xl border border-border py-3 text-silver-300 disabled:opacity-40"
            >
              ↑ Skip
            </button>
            <button
              type="button"
              disabled={locked || submitting}
              aria-describedby={lastCard ? 'last-card-hint' : undefined}
              onClick={() => swipeRef.current?.fling('truth')}
              className="flex-1 rounded-xl border border-border py-3 text-silver-100 disabled:opacity-40"
            >
              Truth →
            </button>
          </div>
        )}
        {play.truths.length > 0 && (
          <div className="flex flex-wrap justify-center gap-2" aria-label="Truth tray">
            {play.truths.map((c) => (
              <button
                key={c}
                type="button"
                disabled={locked || submitting}
                onClick={() => onUntruth(c)}
                className="rounded-full border border-border px-3 py-1 text-xs text-silver-300"
                aria-label={`Card ${c + 1} marked truth. Tap to put it back.`}
              >
                Card {c + 1} · Truth ×
              </button>
            ))}
          </div>
        )}
      </div>

      {lastCard && !locked && (
        <p
          key={refusals}
          id="last-card-hint"
          role="status"
          className={`text-sm text-silver-300 ${refusals > 0 ? 'motion-safe:animate-nudge' : ''}`}
        >
          {LAST_CARD_HINT}
        </p>
      )}
      <div className="flex items-center gap-4">
        {toggle}
        <HapticsToggle />
        <span className="hidden text-xs text-silver-500 md:inline">
          Keys: 1–3 pick a card · T truth · L lie
        </span>
      </div>
    </div>
  );
}

function ListView({
  round,
  play,
  submitting,
  onLie,
  toggle,
}: Pick<Props, 'round' | 'play' | 'submitting' | 'onLie'> & { toggle: React.ReactNode }) {
  const [selected, setSelected] = useState<LieIndex | undefined>(undefined);
  const locked = play.choice !== undefined;
  return (
    <form
      className="flex w-full max-w-xl flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (selected !== undefined) onLie(selected);
      }}
    >
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm text-silver-300">Which one is the fib?</legend>
        {CARDS.map((i) => (
          <label
            key={i}
            className={`flex cursor-pointer gap-3 rounded-xl border p-4 ${selected === i ? 'border-fib' : 'border-border'} bg-surface`}
          >
            <input
              type="radio"
              name="lie"
              value={i}
              checked={selected === i}
              disabled={locked || submitting}
              onChange={() => setSelected(i)}
              className="mt-1 accent-[var(--color-fib)]"
            />
            <span>
              <span className="mr-2 font-mono text-xs tracking-stamp text-silver-500">
                {pad(i)}
              </span>
              {round.statements[i]?.text}
            </span>
          </label>
        ))}
      </fieldset>
      <button
        type="submit"
        disabled={selected === undefined || locked || submitting}
        className="rounded-xl bg-metal py-3 font-semibold text-bg disabled:opacity-40"
      >
        Lock in
      </button>
      <div className="text-center">{toggle}</div>
    </form>
  );
}
