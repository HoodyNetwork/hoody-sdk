// The __ID__ page's data: its queries and mutations, declared in one place. Each widget reads
// its own query, so one failing read shows one compact error, never a blank dashboard.
// The scaffold reads fixtures through fixtureSource. A live page moves these hooks onto @core (coreSource over
// its routes, or defineQuery/defineMutation) and keeps their names and types.
import { fixtureSource } from '@app/fixtures';

export type ItemStatus = 'active' | 'paused' | 'failed';

export interface Stats {
  running: number;
  failed: number;
  /** Runs per hour, the last 24 hours, oldest first. */
  perHour: number[];
}

export interface RecentItem {
  id: string;
  name: string;
  status: ItemStatus;
  /** ISO time. */
  updatedAt: string;
}

const source = fixtureSource('__ID__');

export function useStats() {
  return source.useQuery<Stats>('stats');
}

export function useRecent() {
  return source.useQuery<RecentItem[]>('recent');
}

/** Restart every failed item. Its answer is a C9 outcome: `pending` means "may have gone through". */
export function useRestartFailed() {
  return source.useMutation<Stats>('restart');
}
