'use client';

import { formatCountdown, msUntilLocalMidnight } from '@fibble/shared';
import { useEffect, useState } from 'react';

/** Time until the next puzzle, at local midnight (PRD F9). */
export function Countdown() {
  const [ms, setMs] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setMs(msUntilLocalMidnight(new Date()));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);
  return (
    <p className="text-center text-sm text-silver-300">
      Next Fibble in{' '}
      <span className="font-mono tracking-stamp text-silver-100">
        {ms === null ? '…' : formatCountdown(ms)}
      </span>
    </p>
  );
}
