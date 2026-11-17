// Named screenshot states of the API page (`bun run hub:shots --page api`). The runner takes 1440
// light/dark and 390 light; `390-dark` is added for the list and one example.
import type { Shots } from '@app/shots.types';

const DARK = ['390-dark'] as const;

export default [
  { name: 'list', extra: DARK },
  { name: 'list-search', act: [{ fill: 'role=searchbox', text: 'waitlist' }] },
  { name: 'account-curl', path: '?op=api_listAuthTokens', extra: DARK },
  { name: 'account-undeclared', path: '?op=api_login' },
  { name: 'public-no-docs', path: '?op=api_waitlistJoin' },
  { name: 'program-sdk', path: '?op=browser_startInstance&lang=js' },
  { name: 'notes', path: '?op=notes_uploadAvatar' },
  { name: 'no-example', path: '?op=files_createDirectory' },
  { name: 'overview', path: '?view=overview', extra: DARK },
  // The header's "Use with your agent" control, open on its Prompts tab.
  { name: 'agent', act: [{ click: 'Use with your agent' }, { waitFor: 'text=Do something through the API' }], extra: DARK },
] satisfies Shots;
