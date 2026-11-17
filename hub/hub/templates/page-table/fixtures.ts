// Fake-API states of the __ID__ page for hub:dev, hub:shots, tests and specs. Names that the shell
// also shows (computers, realms, the account) come from core's fixtureWorld, never invented ones.
import { defineFixtures } from '@app/fixtures';
import type { Item } from './data';

const NAMES = ['atlas', 'boreal', 'cinder', 'delta', 'ember', 'fjord', 'granite', 'harbor', 'iris', 'juniper', 'kestrel', 'lumen'];
const OWNERS = ['Ana Ruiz', 'Ben Okafor', 'Chen Wei', 'Dara Novak'];
const STATUS = ['active', 'active', 'paused', 'active', 'failed'] as const;

// More rows than one page (pageSize 50), so the @page e2e has a page 2.
const many: Item[] = Array.from({ length: 120 }, (_, i) => ({
  id: `item-${String(i + 1).padStart(2, '0')}`,
  name: `${NAMES[i % NAMES.length]}-${Math.floor(i / NAMES.length) + 1}`,
  status: STATUS[i % STATUS.length] ?? 'active',
  owner: OWNERS[i % OWNERS.length] ?? 'Ana Ruiz',
  updatedAt: new Date(Date.UTC(2026, 9, 22, 12) - i * 3_600_000 * 7).toISOString(),
  sizeBytes: (i + 1) * 734_003_200,
}));

export default defineFixtures({
  default: 'many',
  states: {
    many: { items: { data: many } },
    empty: { items: { data: [] } },
    error: { items: { error: 'server' } },
    loading: { items: { pending: true } },
    // An action whose answer never came: the Outcome line says "This may have gone through".
    'save-unknown': { items: { data: many }, save: { outcome: 'pending' } },
    'save-failed': { items: { data: many }, save: { outcome: 'failed', code: 'bad_request' } },
  },
});
