// Fake-API states of the __ID__ page for hub:dev, hub:shots, tests and specs. Names that the shell
// also shows (computers, realms, the account) come from core's fixtureWorld, never invented ones.
import { defineFixtures } from '@app/fixtures';
import type { Settings } from './data';

const settings: Settings = {
  name: 'Personal',
  region: 'eu',
  emailAlerts: true,
  channels: [
    { id: 'ch-01', name: 'Ada', kind: 'email' },
    { id: 'ch-02', name: 'Acme client alerts', kind: 'webhook' },
    { id: 'ch-03', name: 'Ben Okafor', kind: 'email' },
  ],
};

export default defineFixtures({
  default: 'default',
  states: {
    default: { settings: { data: settings }, delete: { outcome: 'done' } },
    // No notification channels yet: that section shows its compact empty state.
    empty: { settings: { data: { ...settings, name: 'Acme client', emailAlerts: false, channels: [] } } },
    error: { settings: { error: 'server' } },
    loading: { settings: { pending: true } },
    // An action whose answer never came: the Outcome line says "This may have gone through".
    'save-unknown': { settings: { data: settings }, save: { outcome: 'pending' } },
    'save-failed': { settings: { data: settings }, save: { outcome: 'failed', code: 'bad_request' } },
  },
});
