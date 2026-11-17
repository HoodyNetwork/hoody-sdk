// Fake-API states of the __ID__ page for hub:dev, hub:shots, tests and specs. Names that the shell
// also shows (computers, realms, the account) come from core's fixtureWorld, never invented ones.
import { defineFixtures } from '@app/fixtures';
import type { ActivityEntry, RecordDetail } from './data';

const WHO = ['Ada', 'Ben Okafor', 'Chen Wei', 'Dara Novak'];
const WHAT = ['Renamed', 'Restarted', 'Paused', 'Resumed', 'Resized'];

const activity: ActivityEntry[] = Array.from({ length: 12 }, (_, i) => ({
  id: `act-${String(i + 1).padStart(2, '0')}`,
  text: `${WHAT[i % WHAT.length] ?? 'Changed'} by ${WHO[i % WHO.length] ?? 'Ada'}`,
  at: new Date(Date.UTC(2026, 9, 22, 12) - i * 3_600_000 * 5).toISOString(),
}));

const record: RecordDetail = {
  id: '64f0c2a91b3e4d5f6a7b8c9d',
  name: 'atlas',
  status: 'active',
  owner: 'Ada',
  realm: 'Personal',
  createdAt: '2026-09-14T08:30:00.000Z',
  sizeBytes: 12_884_901_888,
  activity,
};

export default defineFixtures({
  default: 'default',
  states: {
    default: { record: { data: record } },
    // A record with no history yet: the Activity tab shows its compact empty state.
    empty: { record: { data: { ...record, name: 'boreal', realm: 'Acme client', activity: [] } } },
    error: { record: { error: 'server' } },
    loading: { record: { pending: true } },
    // An action whose answer never came: the Outcome line says "This may have gone through".
    'save-unknown': { record: { data: record }, save: { outcome: 'pending' } },
    'save-failed': { record: { data: record }, save: { outcome: 'failed', code: 'bad_request' } },
  },
});
