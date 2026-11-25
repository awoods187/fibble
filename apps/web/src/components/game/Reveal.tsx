'use client';

import type { AnswerResult, PublicRound } from '@fibble/shared';
import { useEffect, useRef } from 'react';

interface Props {
  round: PublicRound;
  result: AnswerResult;
  isLast: boolean;
  onNext: () => void;
}

/**
 * The reveal after each round (PRD section 3): the lie shows a FIB stamp and why it sounded
 * true; each truth shows TRUE, a one-line expansion and its Wikipedia source. Colour is never
 * the only signal: every result also has an icon and a word.
 */
export function Reveal({ round, result, isLast, onNext }: Props) {
  const nextRef = useRef<HTMLButtonElement>(null);
  useEffect(() => nextRef.current?.focus(), []);
  const truthByIndex = new Map(result.truths.map((t) => [t.index, t]));

  return (
    <section aria-labelledby="reveal-title" className="flex w-full flex-col items-center gap-5">
      <h3
        id="reveal-title"
        role="status"
        className={`font-display text-2xl font-semibold ${result.correct ? 'text-silver-100' : 'text-fib'}`}
      >
        {result.correct ? '✓ You found it' : '✗ Fibbed!'}
      </h3>
      <div className="grid w-full gap-3 md:grid-cols-3">
        {round.statements.map((s, i) => {
          const isLie = i === result.lieIndex;
          const truth = truthByIndex.get(i as 0 | 1 | 2);
          const picked = i === result.choice;
          return (
            <article
              key={i}
              aria-label={`Card ${i + 1}: ${isLie ? 'the fib' : 'true'}${picked ? ', your pick' : ''}`}
              className={`flex flex-col gap-3 rounded-card border bg-surface p-5 shadow-card-edge ${isLie ? 'border-fib/70' : 'border-border'}`}
            >
              <div className="flex items-center justify-between">
                <span
                  className={`rounded-md border px-2 py-0.5 font-mono text-xs font-bold tracking-stamp ${isLie ? 'border-fib text-fib' : 'border-silver-300 text-metal'}`}
                >
                  {isLie ? 'FIB' : 'TRUE'}
                </span>
                {picked && <span className="text-xs text-silver-500">Your pick</span>}
              </div>
              <p className="text-[17px] leading-[1.4] text-silver-100">{s.text}</p>
              {isLie ? (
                <p className="text-sm text-silver-300">
                  <span className="text-silver-500">Why it sounded true: </span>
                  {result.lieNote}
                </p>
              ) : (
                truth && (
                  <div className="flex flex-col gap-2 text-sm text-silver-300">
                    <p>{truth.expansion}</p>
                    <a
                      href={truth.source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="self-start rounded-full border border-border px-3 py-1 text-xs text-silver-300 hover:border-silver-500"
                    >
                      Read on Wikipedia: {truth.source.title} ↗
                    </a>
                  </div>
                )
              )}
            </article>
          );
        })}
      </div>
      <button
        ref={nextRef}
        type="button"
        onClick={onNext}
        className="rounded-xl bg-metal px-8 py-3 font-semibold text-bg"
      >
        {isLast ? 'See results' : 'Next round'}
      </button>
    </section>
  );
}
