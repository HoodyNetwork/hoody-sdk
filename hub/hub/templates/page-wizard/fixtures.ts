// Fake-API states of the __ID__ page for hub:dev, hub:shots, tests and specs. Names that the shell
// also shows (computers, realms, the account) come from core's fixtureWorld, never invented ones.
import { defineFixtures } from '@app/fixtures';
import type { Existing, Plan } from './data';

const plans: Plan[] = [
  { id: 'small', name: 'Small', priceCents: 500, detail: '1 core, 2 GB' },
  { id: 'medium', name: 'Medium', priceCents: 1200, detail: '2 cores, 4 GB' },
  { id: 'large', name: 'Large', priceCents: 2900, detail: '4 cores, 16 GB' },
];
const existing: Existing[] = [
  { id: 'item-01', name: 'boreal' },
  { id: 'item-02', name: 'cinder' },
];

export default defineFixtures({
  default: 'default',
  states: {
    default: { plans: { data: plans }, existing: { data: existing } },
    // No plan can be chosen right now: the plan step shows its compact empty state.
    empty: { plans: { data: [] }, existing: { data: existing } },
    error: { plans: { error: 'server' }, existing: { data: existing } },
    loading: { plans: { pending: true }, existing: { pending: true } },
    // An action whose answer never came: the Outcome line says "This may have gone through".
    'save-unknown': { plans: { data: plans }, existing: { data: existing }, create: { outcome: 'pending' } },
    'save-failed': { plans: { data: plans }, existing: { data: existing }, create: { outcome: 'failed', code: 'bad_request' } },
  },
});
