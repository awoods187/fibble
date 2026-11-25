import {
  emptyStats,
  type GameState,
  GameStateSchema,
  type Stats,
  StatsSchema,
} from '@fibble/shared';

/**
 * Progress and streaks live in localStorage (PRD F8: no account). Everything read back is
 * validated; anything unreadable is ignored rather than crashing the game. Storage can be
 * unavailable (private browsing, blocked), so every call is wrapped.
 */

const GAME_KEY = (date: string) => `fibble:game:${date}`;
const STATS_KEY = 'fibble:stats';
const HOWTO_KEY = 'fibble:seen-howto';

function read(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? undefined : JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function write(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked: the game still works, it just won't resume.
  }
}

export function loadGame(date: string): GameState | undefined {
  const parsed = GameStateSchema.safeParse(read(GAME_KEY(date)));
  return parsed.success && parsed.data.date === date ? parsed.data : undefined;
}

export const saveGame = (state: GameState) => write(GAME_KEY(state.date), state);

export function loadStats(): Stats {
  const parsed = StatsSchema.safeParse(read(STATS_KEY));
  return parsed.success ? parsed.data : emptyStats();
}

export const saveStats = (stats: Stats) => write(STATS_KEY, stats);

export const hasSeenHowTo = () => read(HOWTO_KEY) === true;
export const markHowToSeen = () => write(HOWTO_KEY, true);

/** A first-time visitor: no stats and never saw the how-to. */
export const isFirstVisit = () => !hasSeenHowTo() && loadStats().played === 0;
