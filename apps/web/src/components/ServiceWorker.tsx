'use client';

import { useEffect } from 'react';

/** Registers /sw.js in production (in development it would cache stale builds). */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // No offline shell this time; the game itself still works.
    });
  }, []);
  return null;
}
