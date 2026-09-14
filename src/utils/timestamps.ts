/** Clock dependency used by time-sensitive modules and their unit tests. */
export type Clock = () => Date;

/** Returns a new Date so callers cannot mutate shared clock state. */
export const systemClock: Clock = () => new Date();

/** Converts a Date to the UTC ISO-8601 representation used in evidence files. */
export function toIsoTimestamp(value: Date): string {
  return value.toISOString();
}

/** Returns a non-negative elapsed duration, even if the wall clock moves back. */
export function elapsedMilliseconds(startedAt: Date, endedAt: Date): number {
  return Math.max(0, endedAt.getTime() - startedAt.getTime());
}

/** Returns a filesystem-safe UTC timestamp suitable for evidence filenames. */
export function toFileTimestamp(value: Date): string {
  return value.toISOString().replace(/[:.]/g, '-');
}
