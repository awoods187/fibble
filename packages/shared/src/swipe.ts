/**
 * Swipe and haptics numbers from PRD section 7 ("Motion", "Haptics"), as pure functions so the
 * card component only measures the pointer and asks what to do.
 *
 * - The card follows the finger and rotates up to 12° in proportion to horizontal offset.
 * - The tint (silver toward Truth, red toward Lie) fades in from 10% of width to full at 30%.
 * - Release past 30% of width, or faster than 0.6 px/ms, commits. Otherwise it springs back.
 * - Swipe up past 30% of height (or a fast upward fling) skips.
 */

export const COMMIT_FRACTION = 0.3;
export const TINT_START_FRACTION = 0.1;
export const FLING_PX_PER_MS = 0.6;
export const MAX_ROTATION_DEG = 12;

export type SwipeAction = 'truth' | 'lie' | 'skip';

export interface Drag {
  /** Offset from where the drag started, in px (dy negative = up). */
  dx: number;
  dy: number;
  /** Release velocity in px/ms. */
  vx: number;
  vy: number;
}

/** Card rotation in degrees for a horizontal offset, capped at ±12°. */
export function rotationFor(dx: number, width: number): number {
  if (width <= 0) return 0;
  const r = (dx / (width * COMMIT_FRACTION)) * MAX_ROTATION_DEG;
  return Math.max(-MAX_ROTATION_DEG, Math.min(MAX_ROTATION_DEG, r));
}

/** 0 to 1: how strongly to show the Truth or Lie tint for a horizontal offset. */
export function tintFor(dx: number, width: number): number {
  if (width <= 0) return 0;
  const f = Math.abs(dx) / width;
  return Math.max(
    0,
    Math.min(1, (f - TINT_START_FRACTION) / (COMMIT_FRACTION - TINT_START_FRACTION)),
  );
}

/** Which way the drag is leaning right now (for the tint label), or null near the centre. */
export function leaning(d: Pick<Drag, 'dx' | 'dy'>, width: number): SwipeAction | null {
  if (Math.abs(d.dx) < width * TINT_START_FRACTION && -d.dy < width * TINT_START_FRACTION)
    return null;
  if (-d.dy > Math.abs(d.dx)) return 'skip';
  return d.dx > 0 ? 'truth' : 'lie';
}

/** True once a drag has passed the commit threshold (used for the threshold haptic tick). */
export function pastThreshold(d: Pick<Drag, 'dx' | 'dy'>, width: number, height: number): boolean {
  return Math.abs(d.dx) >= width * COMMIT_FRACTION || -d.dy >= height * COMMIT_FRACTION;
}

/**
 * What a released drag does: commit an action, or null to spring back. A mostly-upward drag
 * skips; otherwise right is Truth and left is Lie. Distance or a fast fling both commit, but a
 * fling against the drag's direction doesn't.
 */
export function swipeDecision(d: Drag, width: number, height: number): SwipeAction | null {
  const up = -d.dy > Math.abs(d.dx);
  if (up) {
    const far = -d.dy >= height * COMMIT_FRACTION;
    const fast = -d.vy >= FLING_PX_PER_MS && d.dy < 0;
    return far || fast ? 'skip' : null;
  }
  if (d.dx === 0) return null;
  const sign = Math.sign(d.dx);
  const far = Math.abs(d.dx) >= width * COMMIT_FRACTION;
  const fast = Math.abs(d.vx) >= FLING_PX_PER_MS && Math.sign(d.vx) === sign;
  if (!far && !fast) return null;
  return sign > 0 ? 'truth' : 'lie';
}

export interface PointerSample {
  x: number;
  y: number;
  /** Event time in ms. */
  t: number;
}

/** How far back release velocity looks. */
export const VELOCITY_WINDOW_MS = 100;

/**
 * Release velocity in px/ms, measured across the last ~100 ms (from the newest sample at least
 * that old, if there is one, to the release). Browsers bunch pointer moves together, so two
 * samples a few ms apart can't be trusted on their own. Includes the release point, so a pause
 * before letting go reads as slow.
 */
export function releaseVelocity(samples: readonly PointerSample[]): { vx: number; vy: number } {
  const last = samples[samples.length - 1];
  if (!last || samples.length < 2) return { vx: 0, vy: 0 };
  let i = samples.findIndex((p) => last.t - p.t <= VELOCITY_WINDOW_MS);
  if (i > 0) i -= 1;
  const first = samples[Math.max(0, i)] ?? last;
  const dt = Math.max(16, last.t - first.t);
  return { vx: (last.x - first.x) / dt, vy: (last.y - first.y) / dt };
}

/* ---------- Haptics (Vibration API; Android Chrome only, not iOS Safari) ---------- */

export const HAPTICS = {
  /** The drag crosses the commit threshold. */
  threshold: [10],
  /** A swipe commits. */
  commit: [20],
  /** A wrong answer: a double buzz. */
  wrong: [15, 60, 15],
  /** A perfect 5 of 5: three pulses. */
  perfect: [30, 60, 30, 60, 30],
  /** The last card refuses Truth and rubber-bands back. */
  refuse: [10],
} as const satisfies Record<string, readonly number[]>;

export type HapticName = keyof typeof HAPTICS;
