import { describe, expect, it } from 'vitest';
import {
  HAPTICS,
  leaning,
  pastThreshold,
  releaseVelocity,
  rotationFor,
  swipeDecision,
  tintFor,
} from './swipe';

const W = 400;
const H = 600;
const still = { vx: 0, vy: 0 };

describe('swipe', () => {
  it('rotates in proportion to offset, capped at 12 degrees', () => {
    expect(rotationFor(0, W)).toBe(0);
    expect(rotationFor(60, W)).toBeCloseTo(6);
    expect(rotationFor(-1000, W)).toBe(-12);
    expect(rotationFor(10, 0)).toBe(0);
  });

  it('fades the tint in from 10% to full at 30% of width', () => {
    expect(tintFor(30, W)).toBe(0);
    expect(tintFor(80, W)).toBeCloseTo(0.5);
    expect(tintFor(-120, W)).toBe(1);
    expect(tintFor(400, W)).toBe(1);
  });

  it('leans truth, lie or skip, and nowhere near the centre', () => {
    expect(leaning({ dx: 10, dy: 0 }, W)).toBeNull();
    expect(leaning({ dx: 80, dy: 0 }, W)).toBe('truth');
    expect(leaning({ dx: -80, dy: 10 }, W)).toBe('lie');
    expect(leaning({ dx: 20, dy: -90 }, W)).toBe('skip');
  });

  it('commits past 30% of width, and springs back below it', () => {
    expect(swipeDecision({ dx: 120, dy: 0, ...still }, W, H)).toBe('truth');
    expect(swipeDecision({ dx: -120, dy: 30, ...still }, W, H)).toBe('lie');
    expect(swipeDecision({ dx: 100, dy: 0, ...still }, W, H)).toBeNull();
    expect(swipeDecision({ dx: 0, dy: 0, ...still }, W, H)).toBeNull();
  });

  it('commits a short fast fling, but not one against the drag', () => {
    expect(swipeDecision({ dx: 40, dy: 0, vx: 0.8, vy: 0 }, W, H)).toBe('truth');
    expect(swipeDecision({ dx: -40, dy: 0, vx: -0.7, vy: 0 }, W, H)).toBe('lie');
    expect(swipeDecision({ dx: 40, dy: 0, vx: -0.9, vy: 0 }, W, H)).toBeNull();
    expect(swipeDecision({ dx: 40, dy: 0, vx: 0.5, vy: 0 }, W, H)).toBeNull();
  });

  it('skips on a mostly-upward drag past 30% of height or a fast flick up', () => {
    expect(swipeDecision({ dx: 20, dy: -200, ...still }, W, H)).toBe('skip');
    expect(swipeDecision({ dx: 0, dy: -60, vx: 0, vy: -0.9 }, W, H)).toBe('skip');
    expect(swipeDecision({ dx: 0, dy: -60, ...still }, W, H)).toBeNull();
    // Mostly downward is never a skip.
    expect(swipeDecision({ dx: 0, dy: 300, vx: 0, vy: 1 }, W, H)).toBeNull();
  });

  it('measures release velocity over ~100 ms, not two bunched samples', () => {
    // A quick flick: 60 px in 40 ms, then release.
    expect(
      releaseVelocity([
        { x: 0, y: 0, t: 0 },
        { x: 30, y: 0, t: 20 },
        { x: 60, y: 0, t: 40 },
      ]).vx,
    ).toBeCloseTo(1.5);
    // A slow drag where two moves arrive 5 ms apart: still slow.
    const slow = [
      { x: 0, y: 0, t: 0 },
      { x: 20, y: 0, t: 100 },
      { x: 40, y: 0, t: 200 },
      { x: 57, y: 0, t: 205 },
      { x: 57, y: 0, t: 210 },
    ];
    expect(releaseVelocity(slow).vx).toBeLessThan(0.6);
    // Dragging, then holding still before letting go: no fling.
    expect(
      releaseVelocity([
        { x: 0, y: 0, t: 0 },
        { x: 50, y: 0, t: 30 },
        { x: 50, y: 0, t: 300 },
      ]).vx,
    ).toBe(0);
    expect(releaseVelocity([{ x: 5, y: 5, t: 0 }])).toEqual({ vx: 0, vy: 0 });
  });

  it('knows when the threshold is crossed', () => {
    expect(pastThreshold({ dx: 119, dy: 0 }, W, H)).toBe(false);
    expect(pastThreshold({ dx: -120, dy: 0 }, W, H)).toBe(true);
    expect(pastThreshold({ dx: 0, dy: -180 }, W, H)).toBe(true);
  });

  it('has the PRD haptic patterns', () => {
    expect(HAPTICS.threshold).toEqual([10]);
    expect(HAPTICS.commit).toEqual([20]);
    expect(HAPTICS.wrong).toEqual([15, 60, 15]);
    expect(HAPTICS.perfect.filter((_, i) => i % 2 === 0)).toHaveLength(3);
  });
});
