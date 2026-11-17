// Named screenshot states of the home page (`bun run hub:shots --page home`).
import type { Shots } from '@app/shots.types';

export default [
  { name: 'many', extra: ['1350-light', '1350-dark', '390-dark'] },
  { name: 'customize', path: '?customize=1' },
  { name: 'loading', state: 'loading' },
  { name: 'load-error', state: 'failed' },
  { name: 'empty-realm', state: 'emptyRealm' },
  { name: 'setup-invite', state: 'invite', realm: 'all' },
  { name: 'setup-invite-code-refused', state: 'inviteFailed', realm: 'all' },
  { name: 'setup-provisioning', state: 'provisioning', realm: 'all' },
  { name: 'setup-capacity', state: 'capacity', realm: 'all' },
  { name: 'setup-mailbox', state: 'mailbox', realm: 'all' },
  { name: 'setup-expired', state: 'expired', realm: 'all' },
  { name: 'setup-reinstalled', state: 'reinstalled', realm: 'all' },
  // No 'first-visit' shot: the first-run view needs a setup read that answers "provisioning", which no fixture read
  // gives (core setupFixtures), so the browser shows the empty realm instead. page.test.ts covers it with a forced
  // setup state.
  { name: 'new-account', state: 'newAccount' },
  { name: 'new-account-intro', state: 'newAccount', path: '?intro=1' },
  { name: 'intro-reopened', path: '?intro=1' },
  { name: 'attention', state: 'attention' },
  { name: 'pick-one', state: 'pickOne', computer: false },
  { name: 'long-name', state: 'longName' },
] satisfies Shots;
