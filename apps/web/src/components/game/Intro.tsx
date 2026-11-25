'use client';

import { useEffect, useRef, useState } from 'react';

/** First visit only: the splash (PRD section 3, "Full user flow"). */
export function Splash({ onPlay }: { onPlay: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <section className="my-auto flex flex-col items-center gap-6 text-center">
      <h2 className="font-display text-6xl font-semibold tracking-tight text-metal">Fibble</h2>
      <p className="text-lg text-silver-300">Two truths. One fib. Five rounds.</p>
      <button
        ref={ref}
        type="button"
        onClick={onPlay}
        className="rounded-xl bg-metal px-12 py-3 font-semibold text-bg"
      >
        Play
      </button>
    </section>
  );
}

export const HOW_TO_PANELS = [
  {
    title: 'Truth →',
    body: 'Swipe right, or tap Truth, if a card is true. It goes to your truth tray; tap it there to take it back.',
  },
  {
    title: '← Lie',
    body: 'Swipe left, or tap Lie, on the one you think is the fib. That locks in your answer, so be sure.',
  },
  {
    title: '↑ Skip',
    body: 'Swipe up, or tap Skip, to put a card at the back and read the others first. On a computer you see all three at once.',
  },
] as const;

/** The 3-panel how-to, shown once and skippable. */
export function HowTo({ onDone }: { onDone: () => void }) {
  const [i, setI] = useState(0);
  const panel = HOW_TO_PANELS[i] ?? HOW_TO_PANELS[0];
  const last = i === HOW_TO_PANELS.length - 1;
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => headingRef.current?.focus(), [i]);
  return (
    <section
      aria-labelledby="howto-title"
      className="my-auto flex w-full max-w-sm flex-col items-center gap-6 text-center"
    >
      <p className="font-mono text-xs tracking-stamp text-silver-500">
        HOW TO PLAY · {i + 1}/{HOW_TO_PANELS.length}
      </p>
      <div className="flex aspect-[3/4] w-full flex-col justify-center gap-4 rounded-card border border-border bg-surface p-6 shadow-card-edge">
        <h2
          id="howto-title"
          ref={headingRef}
          tabIndex={-1}
          className="font-display text-3xl font-semibold text-silver-100"
        >
          {panel.title}
        </h2>
        <p className="text-silver-300">{panel.body}</p>
      </div>
      <div className="flex w-full gap-3">
        <button
          type="button"
          onClick={onDone}
          className="flex-1 rounded-xl border border-border py-3 text-silver-300"
        >
          Skip
        </button>
        <button
          type="button"
          onClick={() => (last ? onDone() : setI(i + 1))}
          className="flex-1 rounded-xl bg-metal py-3 font-semibold text-bg"
        >
          {last ? 'Start' : 'Next'}
        </button>
      </div>
    </section>
  );
}
