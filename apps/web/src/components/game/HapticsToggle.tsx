'use client';

import { useState } from 'react';
import { canVibrate, hapticsOn, setHapticsOn } from '@/lib/client/haptics';

/** Vibration on/off (PRD section 7). Only shown where the browser can vibrate. */
export function HapticsToggle() {
  const [on, setOn] = useState(hapticsOn);
  if (!canVibrate()) return null;
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => {
        setHapticsOn(!on);
        setOn(!on);
      }}
      className="text-xs text-silver-500 underline underline-offset-4 hover:text-silver-300"
    >
      Vibration: {on ? 'on' : 'off'}
    </button>
  );
}
