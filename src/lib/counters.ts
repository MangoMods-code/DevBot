export interface CounterState { lastRename: number; lastValue: number | null; }

export const MIN_RENAME_INTERVAL_MS = 5 * 60 * 1000;

export function shouldRename(state: CounterState, newValue: number, now: number): boolean {
  if (state.lastValue === newValue) return false;
  return now - state.lastRename >= MIN_RENAME_INTERVAL_MS || state.lastValue === null;
}
