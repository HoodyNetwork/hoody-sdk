// Named screenshot states of the notes page (`bun run hub:shots --page notes`). Every state renders its own case.
import type { Shots } from '@app/shots.types';

const NEW = { click: 'role=button[name="New note"] >> nth=0' } as const;
const TITLE = { fill: 'role=textbox[name="Title"]', text: 'Q4 plan' } as const;
const CREATE = { click: 'role=button[name="Create"]' } as const;
const SEND = [NEW, TITLE, CREATE] as const;

export default [
  { name: 'default', extra: ['1024-light'] },
  { name: 'agent-hint', act: [{ click: 'role=button[name="Use with your agent"]' }] },
  { name: 'refusals', state: 'refusals' },
  { name: 'mixed', state: 'mixed', extra: ['1024-light'] },
  { name: 'many-rows', state: 'many', extra: ['1024-light'] },
  { name: 'long-text', state: 'long' },
  { name: 'one-computer', path: '?computer=c0a7150000000000000000b2' },
  { name: 'search', path: '?q=deploy' },
  { name: 'no-match', path: '?q=zzzz' },
  { name: 'empty', state: 'empty' },
  { name: 'loading', state: 'loading' },
  { name: 'error', state: 'error' },
  { name: 'no-computers', state: 'none' },
  { name: 'only-stopped', state: 'onlyStopped', act: [{ waitFor: 'cedar' }] },
  { name: 'no-place', state: 'noPlace' },
  { name: 'note-open', act: [{ click: 'text=Weekly plan >> nth=0' }, { waitFor: 'role=button[name=/^Open (in a new tab|outside the Hub)$/]' }], extra: ['1024-light'] },
  // The row menu leads with Open here (the row click), then the new-tab Open note.
  { name: 'row-menu', act: [{ click: 'role=row[name=/Weekly plan/] >> role=button[name="Row actions"] >> nth=0' }, { waitFor: 'role=menuitem[name="Open here"]' }] },
  // Copy link and Copy read-only link (its line says what read-only does not stop), in the open note's menu too.
  { name: 'note-open-menu', act: [{ click: 'text=Weekly plan >> nth=0' }, { waitFor: 'role=button[name=/^Open (in a new tab|outside the Hub)$/]' }, { click: 'role=button[name="More actions"] >> nth=-1' }, { waitFor: 'role=menuitem[name=/^Copy read-only link/]' }] },
  // No web address for the computer's Notes: both copy items disabled, their one reason said once.
  { name: 'row-menu-no-address', state: 'noAddress', act: [{ click: 'role=row[name=/Weekly plan/] >> role=button[name="Row actions"] >> nth=0' }, { waitFor: 'role=menuitem[name=/^Copy read-only link/]' }] },
  { name: 'note-open-no-address', state: 'noAddress', act: [{ click: 'text=Weekly plan >> nth=0' }, { waitFor: 'role=button[name=/^Open (in a new tab|outside the Hub)$/]' }] },
  { name: 'note-open-missing', path: '?sel=nocomputer~0a1b2c3d4e5f6a7b8c9d0e1fff' },
  { name: 'new-note', act: [NEW] },
  { name: 'new-note-empty-title', act: [NEW, { click: 'role=button[name="Create"]' }] },
  { name: 'new-note-created', act: [...SEND] },
  { name: 'new-note-pending', state: 'createPending', act: [...SEND], extra: ['1024-light'] },
  { name: 'new-note-unknown-checked', state: 'createPending', act: [...SEND, { click: 'role=button[name="Check again"]' }] },
  { name: 'new-note-found', state: 'createFound', act: [...SEND, { click: 'role=button[name="Check again"]' }] },
  { name: 'new-note-not-sent', state: 'createNotSent', act: [...SEND] },
  { name: 'new-note-failed', state: 'createFailed', act: [...SEND] },
  { name: 'new-note-protected-failed', state: 'createProtected', act: [...SEND] },
] satisfies Shots;
