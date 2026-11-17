// Named screenshot states of the vault page (`bun run hub:shots --page vault`). Every value typed here is a
// fixture value; the encrypted entry opens with the SDK test vector's password.
import type { Shots } from '@app/shots.types';
import { sdkVectors } from './crypto.vectors';

/** The encrypted fixture entry's password: an SDK test vector, not a credential. */
const FIXTURE_PASSWORD = sdkVectors[0]!.password;

// The header button at desktop, the floating one on a phone: whichever is on screen (a hidden twin is in the DOM).
const NEW = { click: 'role=button[name="New entry"] >> visible=true >> nth=0' } as const;
const NAME = { fill: 'Name', text: 'ci-token' } as const;
const VALUE = { fill: 'Value', text: 'fixture-value-ci' } as const;
const SAVE = { click: 'role=button[name="Save"]' } as const;
const SEND = [NEW, NAME, VALUE, SAVE] as const;
const SHOW = { click: 'role=button[name="Show value"]' } as const;

export default [
  { name: 'default', extra: ['1024-light'] },
  { name: 'global', realm: 'all' },
  { name: 'detail', path: `?sel=deploy.notes` },
  { name: 'value-shown', path: `?sel=deploy.notes`, act: [SHOW] },
  { name: 'value-encrypted', path: `?sel=db-password`, act: [SHOW] },
  {
    name: 'value-decrypted',
    path: `?sel=db-password`,
    // Waits for the opened value (its eye turns to Hide): the decrypt answers after the click, "Opening…" until then.
    act: [SHOW, { fill: 'Password', text: FIXTURE_PASSWORD }, { click: 'role=button[name="Open"]' }, { waitFor: 'role=button[name="Hide value"]' }],
  },
  { name: 'value-json', state: 'jsonValues', path: `?sel=app.config`, act: [SHOW], extra: ['390-dark'] },
  { name: 'value-json-raw', state: 'jsonValues', path: `?sel=app.config`, act: [SHOW, { click: 'role=radio[name="Raw"]' }] },
  { name: 'value-too-deep', state: 'jsonValues', path: `?sel=deep.config`, act: [SHOW] },
  { name: 'value-open-copy', path: `?sel=db-password`, act: [{ click: 'role=button[name="Copy value"]' }] },
  { name: 'long', state: 'long' },
  { name: 'search', state: 'long', path: `?q=entry-01` },
  { name: 'no-match', path: `?q=zzzz` },
  { name: 'empty', state: 'empty' },
  { name: 'loading', state: 'loading' },
  { name: 'error', state: 'error' },
  { name: 'forbidden', state: 'forbidden' },
  { name: 'access-key', state: 'accessKey' },
  { name: 'new-entry', act: [NEW] },
  { name: 'new-entry-encrypt', act: [NEW, { click: 'text=Encrypt with a password' }] },
  { name: 'new-entry-saved', act: [...SEND] },
  { name: 'new-entry-pending', state: 'unknown', act: [...SEND], extra: ['1024-light'] },
  { name: 'new-entry-checked', state: 'appliedLost', act: [...SEND, { click: 'role=dialog >> role=button[name="Check again"]' }] },
  { name: 'new-entry-full', state: 'full', act: [...SEND] },
  { name: 'new-entry-rate-limited', state: 'rateLimited', act: [...SEND] },
  { name: 'replace', path: `?sel=deploy.notes`, act: [{ click: 'role=button[name="Replace value"]' }] },
  { name: 'delete', path: `?sel=deploy.notes`, act: [{ click: 'role=region[name="Details"] >> role=button[name="More actions"]' }, { click: 'role=menuitem[name=/^Delete…/]' }] },
  {
    name: 'delete-hoody',
    path: '?sel=hoody.realm-aliases',
    realm: 'all',
    act: [{ click: 'role=region[name="Details"] >> role=button[name="More actions"]' }, { click: 'role=menuitem[name=/^Delete…/]' }, { click: 'role=alertdialog >> role=button[name="Delete"]' }],
  },
  { name: 'delete-unknown', state: 'unknown', path: `?sel=deploy.notes`, act: [{ click: 'role=region[name="Details"] >> role=button[name="More actions"]' }, { click: 'role=menuitem[name=/^Delete…/]' }, { click: 'role=alertdialog >> role=button[name="Delete"]' }] },
  { name: 'more', act: [{ click: 'role=button[name="More vault actions"]' }] },
  { name: 'agent-hint', act: [{ click: 'role=button[name="Use with your agent"]' }] },
  { name: 'clear', act: [{ click: 'role=button[name="More vault actions"]' }, { click: 'role=menuitem[name="Clear vault…"]' }] },
  { name: 'export', act: [{ click: 'role=button[name="More vault actions"]' }, { click: 'role=menuitem[name="Export vault…"]' }], extra: ['390-dark'] },
  {
    name: 'export-readable',
    act: [
      { click: 'role=button[name="More vault actions"]' },
      { click: 'role=menuitem[name="Export vault…"]' },
      { click: 'text="Readable"' },
      { click: 'role=alertdialog >> role=button[name="Export"]' },
    ],
    extra: ['390-dark'],
  },
] satisfies Shots;
