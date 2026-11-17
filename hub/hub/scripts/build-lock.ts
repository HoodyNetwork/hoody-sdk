// What build.ts does after it asked flock(1) to run it again under the build lock.
// flock is util-linux; macOS and some containers have none. Then the build runs without the lock: two builds in the
// same folder at once can then clash, so run one at a time.
export const LOCK_BUSY = 75;

export type LockOutcome = { kind: 'exit'; code: number; message?: string } | { kind: 'unlocked'; message: string };

export function lockOutcome(r: { error?: Error; status: number | null }, lock: string, waitS: number): LockOutcome {
  if ((r.error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT') {
    return { kind: 'unlocked', message: 'hub:build: flock is not on PATH (util-linux), building without the build lock; run one build at a time' };
  }
  if (r.status === LOCK_BUSY) {
    return { kind: 'exit', code: LOCK_BUSY, message: `hub:build: another build holds ${lock}; gave up after ${waitS / 60} min` };
  }
  return { kind: 'exit', code: r.status ?? 1 };
}
