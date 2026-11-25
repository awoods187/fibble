'use client';

import {
  type Drag,
  leaning,
  pastThreshold,
  releaseVelocity,
  rotationFor,
  type SwipeAction,
  swipeDecision,
  tintFor,
} from '@fibble/shared';
import { type Ref, useImperativeHandle, useRef, useState, useSyncExternalStore } from 'react';
import { buzz } from '@/lib/client/haptics';

export interface SwipeCardHandle {
  /** Animate the card away as if swiped, then commit (used by the buttons). */
  fling: (action: SwipeAction) => void;
}

interface Props {
  ref?: Ref<SwipeCardHandle>;
  card: number;
  text: string;
  /** Two truths are marked: a Truth swipe rubber-bands back. */
  truthRefused: boolean;
  disabled: boolean;
  onCommit: (action: SwipeAction) => void;
  /** Called when a Truth swipe is refused, so the round can show its hint. */
  onRefuse: () => void;
}

type Phase =
  | { kind: 'idle' }
  | { kind: 'dragging'; dx: number; dy: number; w: number }
  | { kind: 'returning' }
  | { kind: 'exiting'; action: SwipeAction; w: number };

const EXIT_MS = 220;
const FADE_MS = 150;
const LABEL: Record<SwipeAction, string> = { truth: 'TRUTH', lie: 'LIE', skip: 'SKIP' };

/** prefers-reduced-motion, read without an effect. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia('(prefers-reduced-motion: reduce)');
      m.addEventListener('change', cb);
      return () => m.removeEventListener('change', cb);
    },
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    () => false,
  );
}

/**
 * The top card of the mobile stack (PRD section 7, "Motion"). It follows the finger 1:1 and
 * tilts from the bottom centre; the Truth or Lie tint and label fade in from 10% to 30% of the
 * card's width. Release past 30% (or a fast fling) commits; otherwise it springs back. With
 * reduced motion, commits cross-fade instead of flying.
 */
export function SwipeCard({ ref, card, text, truthRefused, disabled, onCommit, onRefuse }: Props) {
  const el = useRef<HTMLElement>(null);
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  const samples = useRef<{ x: number; y: number; t: number }[]>([]);
  const ticked = useRef(false);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const reduced = useReducedMotion();

  const size = () => {
    const r = el.current?.getBoundingClientRect();
    return { w: r?.width || 1, h: r?.height || 1 };
  };

  function commit(action: SwipeAction) {
    setPhase({ kind: 'exiting', action, w: size().w });
    buzz('commit');
    window.setTimeout(() => onCommit(action), reduced ? FADE_MS : EXIT_MS);
  }

  function refuse() {
    buzz('refuse');
    onRefuse();
    setPhase({ kind: 'returning' });
  }

  useImperativeHandle(ref, () => ({
    fling: (action) => {
      if (phase.kind === 'exiting') return;
      if (action === 'truth' && truthRefused) refuse();
      else commit(action);
    },
  }));

  function onPointerDown(e: React.PointerEvent) {
    if (disabled || phase.kind === 'exiting' || (e.pointerType === 'mouse' && e.button !== 0))
      return;
    el.current?.setPointerCapture(e.pointerId);
    start.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
    samples.current = [{ x: e.clientX, y: e.clientY, t: e.timeStamp }];
    ticked.current = false;
    setPhase({ kind: 'dragging', dx: 0, dy: 0, w: size().w });
  }

  function onPointerMove(e: React.PointerEvent) {
    const s = start.current;
    if (!s || s.id !== e.pointerId) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    samples.current = [
      ...samples.current.slice(-4),
      { x: e.clientX, y: e.clientY, t: e.timeStamp },
    ];
    const { w, h } = size();
    const past = pastThreshold({ dx, dy }, w, h);
    if (past && !ticked.current) buzz('threshold');
    ticked.current = past;
    setPhase({ kind: 'dragging', dx, dy, w });
  }

  function onPointerUp(e: React.PointerEvent) {
    const s = start.current;
    if (!s || s.id !== e.pointerId) return;
    start.current = null;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    const drag: Drag = {
      dx,
      dy,
      ...releaseVelocity([...samples.current, { x: e.clientX, y: e.clientY, t: e.timeStamp }]),
    };
    const { w, h } = size();
    const action = swipeDecision(drag, w, h);
    if (!action) setPhase({ kind: 'returning' });
    else if (action === 'truth' && truthRefused) refuse();
    else commit(action);
  }

  function onPointerCancel() {
    start.current = null;
    setPhase({ kind: 'returning' });
  }

  // Where the card is drawn, and how it gets there.
  const w = phase.kind === 'dragging' || phase.kind === 'exiting' ? phase.w : 360;
  let transform = 'none';
  let transition = 'transform 320ms cubic-bezier(0.2, 1.4, 0.4, 1)'; // springs back with a small overshoot
  let opacity = 1;
  let lean: SwipeAction | null = null;
  let tint = 0;
  if (phase.kind === 'dragging') {
    transform = `translate(${phase.dx}px, ${phase.dy}px) rotate(${rotationFor(phase.dx, w)}deg)`;
    transition = 'none';
    lean = leaning(phase, w);
    tint = lean === 'skip' ? Math.min(1, -phase.dy / (w * 0.3)) : tintFor(phase.dx, w);
  } else if (phase.kind === 'exiting') {
    lean = phase.action;
    tint = 1;
    if (reduced) {
      opacity = 0;
      transition = `opacity ${FADE_MS}ms linear`;
    } else {
      transition = `transform ${EXIT_MS}ms cubic-bezier(0.3, 0.7, 0.4, 1), opacity ${EXIT_MS}ms linear`;
      transform =
        phase.action === 'skip'
          ? 'translateY(-48px) scale(0.92)'
          : `translateX(${phase.action === 'truth' ? 1.4 * w : -1.4 * w}px) rotate(${phase.action === 'truth' ? 18 : -18}deg)`;
      opacity = phase.action === 'skip' ? 0 : 1;
    }
  }

  const tintColor = lean === 'lie' ? 'var(--color-fib)' : 'var(--color-truth)';

  return (
    <article
      ref={el}
      aria-label={`Card ${card + 1}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      style={{ transform, transition, opacity, transformOrigin: '50% 100%', touchAction: 'none' }}
      className="relative flex aspect-[3/4] cursor-grab flex-col rounded-card border border-border bg-surface p-5 shadow-card-edge select-none active:cursor-grabbing"
    >
      {lean && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-card"
          style={{
            opacity: tint,
            boxShadow: `inset 0 0 0 2px ${tintColor}, 0 0 32px -4px ${tintColor}`,
          }}
        >
          {/* On the trailing corner, so it stays on screen as the card leaves. */}
          <span
            className={`absolute top-4 rounded-md border-2 px-2 py-0.5 font-mono text-sm font-bold tracking-stamp ${lean === 'lie' ? 'right-4 border-fib text-fib' : lean === 'truth' ? 'left-4 border-truth text-truth' : 'left-1/2 -translate-x-1/2 border-silver-300 text-silver-300'}`}
          >
            {LABEL[lean]}
          </span>
        </div>
      )}
      <span className="font-mono text-sm tracking-stamp text-silver-500" aria-hidden="true">
        {String(card + 1).padStart(2, '0')}
      </span>
      <p className="my-auto text-left text-[17px] leading-[1.4] text-silver-100">{text}</p>
    </article>
  );
}
