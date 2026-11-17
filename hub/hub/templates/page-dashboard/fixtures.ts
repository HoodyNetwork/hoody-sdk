// Fake-API states of the __ID__ page for hub:dev, hub:shots, tests and specs. Names that the shell
// also shows (computers, realms, the account) come from core's fixtureWorld, never invented ones.
import { defineFixtures } from '@app/fixtures';
import type { RecentItem, Stats } from './data';

const NAMES = ['atlas', 'boreal', 'cinder', 'delta', 'ember', 'fjord'];
const STATUS = ['active', 'failed', 'active', 'paused', 'active', 'failed'] as const;

const stats: Stats = { running: 14, failed: 2, perHour: Array.from({ length: 24 }, (_, i) => 6 + ((i * 7) % 11)) };
const recent: RecentItem[] = NAMES.map((name, i) => ({
  id: `item-${String(i + 1).padStart(2, '0')}`,
  name,
  status: STATUS[i] ?? 'active',
  updatedAt: new Date(Date.UTC(2026, 9, 22, 12) - i * 3_600_000 * 3).toISOString(),
}));
const none: Stats = { running: 0, failed: 0, perHour: Array.from({ length: 24 }, () => 0) };

export default defineFixtures({
  default: 'many',
  states: {
    many: { stats: { data: stats }, recent: { data: recent } },
    // A new account: every widget shows its compact empty state.
    empty: { stats: { data: none }, recent: { data: [] } },
    error: { stats: { error: 'server' }, recent: { error: 'server' } },
    loading: { stats: { pending: true }, recent: { pending: true } },
    // An action whose answer never came: the Outcome line says "This may have gone through".
    'save-unknown': { stats: { data: stats }, recent: { data: recent }, restart: { outcome: 'pending' } },
    'save-failed': { stats: { data: stats }, recent: { data: recent }, restart: { outcome: 'failed', code: 'bad_request' } },
  },
});
