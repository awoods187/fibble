import { HAPTICS, type HapticName } from '@fibble/shared';

/**
 * Vibration for swipes and results (PRD section 7, "Haptics"). Works on Android Chrome; iOS
 * Safari has no Vibration API, so it's silently a no-op there. Players can turn it off; the
 * choice is kept in localStorage.
 */

const KEY = 'fibble:haptics';

export const canVibrate = () =>
  typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

export function hapticsOn(): boolean {
  try {
    return window.localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setHapticsOn(on: boolean): void {
  try {
    window.localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch {
    // Blocked storage: the setting just won't stick.
  }
}

export function buzz(name: HapticName): void {
  if (!canVibrate() || !hapticsOn()) return;
  try {
    navigator.vibrate([...HAPTICS[name]]);
  } catch {
    // Some browsers throw if vibration isn't allowed yet (no user gesture): ignore.
  }
}
