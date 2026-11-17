// Vitest: the settings answer of the Magic comments panel is a Why (a closed question that ends with the link)
// in every state of the panel (loading, read error, no fields, the editor), and not there at all when the page gives no answer.
// Its fields are rows of one titled setting group per category; the folded ones sit under one More settings fold. FaqLink needs the router, so it is replaced by a plain link here;
// that it opens the right question is in faq.page.test.tsx.
import { CoreQueryProvider, queryClient } from '@core';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setTarget } from '@core/ctx';
import { boot, onFetch, R1, settle, TARGET, type Reply } from '@core/test/env';

// The Why's link is the kit's own FaqLink (imported inside the kit, not through the barrel): it is replaced where it lives.
vi.mock('../../kit/layouts/Faq', async (orig) => ({ ...(await orig<Record<string, unknown>>()), FaqLink: ({ children }: { children: ReactNode }) => <a href="#faq">{children}</a> }));

import { MagicPanel } from './parts/MagicPanel';
import strings from './strings.en.json';
import type { CompScripts } from './types';

const PATH = 'default/1/a.ts';
const item = (extra: object = {}) => ({ id: 'atlas.1111~a.ts', compId: 'c1', compName: 'atlas', compHandle: 'atlas.1111', path: PATH, name: 'a', route: '/a', description: '', status: 'working', schedule: null, keyed: false, calls: 0, failed: 0, managed: null, ownershipUnknown: false, group: 'ok', ...extra } as never);
const comp = { id: 'c1', name: 'atlas', handle: 'atlas.1111', state: 'on', serverName: 'sv1', realmIds: [R1], origin: 'https://x', err: null, caps: { revisions: true, history: true, env: true, executions: true, tests: true, publishable: true }, agent: { templates: true, writer: true, guardedDelete: true }, agentRealm: null, instances: {}, rows: [{ path: PATH }], summary: {}, aliases: [], deleted: [] } as unknown as CompScripts;
const FAQ = { id: 'settingsAtTop', q: 'Q?', a: 'A' };
let mode: 'ok' | 'fail' | 'nofields' = 'ok';
const reply = (url: string): Reply => {
  if (url.includes('/magic-comments/schema')) {
    if (mode === 'fail') return { status: 500, body: { error: 'INTERNAL' } };
    return { status: 200, body: { schema_version: '1.0.0', total_fields: 0, parse_window_lines: 50, unknown_keys_behavior: 'ignored-by-serializer', defaults_context: { when_omitted: 'x', runtime: 'x', sdk_import: 'x' }, categories: {}, fields: mode === 'nofields' ? [] : [{ key: 'description', directive: '@description', category: 'metadata', type: 'string', description: 'About it.', defaults: { when_omitted: null, runtime: null, sdk_import: null } }] } };
  }
  if (url.includes('/magic-comments/read')) return { status: 200, body: { path: PATH, resolvedPath: PATH, revision: 'abcdef0123456789', comments: {}, warnings: [] } };
  return { status: 200, body: { data: {} } };
};
const why = async () => {
  expect(screen.queryByRole('link', { name: strings['settings.more'] })).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: strings['magic.why.q'] }));
  expect(screen.getByText(strings['magic.why.a'])).toBeTruthy();
  return screen.getByRole('link', { name: strings['settings.more'] });
};
const mount = (faq?: typeof FAQ) => render(<MagicPanel item={item() as never} comp={comp as unknown as CompScripts} editable onChanged={() => undefined} faq={faq} />, { wrapper: CoreQueryProvider });

beforeEach(() => {
  boot({ realm: R1 });
  queryClient.clear();
  mode = 'ok';
  onFetch((c) => reply(c.url));
  setTarget(TARGET);
});

describe('the settings answer link', () => {
  it('shows while the panel loads', async () => {
    mount(FAQ);
    expect(await why()).toBeTruthy();
  });
  it('shows with the editor', async () => {
    mount(FAQ);
    await screen.findByRole('button', { name: new RegExp(strings['magic.more']) });
    expect(await why()).toBeTruthy();
  });
  it('shows when the computer lists no fields', async () => {
    mode = 'nofields';
    mount(FAQ);
    await screen.findByText(strings['magic.noSchema']);
    expect(await why()).toBeTruthy();
  });
  it('shows when the read fails', async () => {
    mode = 'fail';
    mount(FAQ);
    for (let i = 0; i < 30; i++) await settle();
    await screen.findByRole('button', { name: /retry|again/i }, { timeout: 5000 });
    expect(await why()).toBeTruthy();
  });
  it('is absent when the page gives no answer', async () => {
    mount();
    await screen.findByRole('button', { name: new RegExp(strings['magic.more']) });
    expect(screen.queryByRole('link', { name: strings['settings.more'] })).toBeNull();
    expect(screen.queryByRole('button', { name: strings['magic.why.q'] })).toBeNull();
  });
  it('a folded category\'s fields are rows of its own titled setting group, under the More settings fold, open when nothing else shows', async () => {
    mount(FAQ);
    const fold = await screen.findByRole('button', { name: new RegExp(strings['magic.more']) });
    expect(fold.getAttribute('aria-expanded')).toBe('true');
    const panel = await screen.findByRole('group', { name: strings['magic.cat.metadata'] });
    const row = within(panel).getByText(strings['magic.f.description']).closest('[data-sg-row]');
    expect(row).toBeTruthy();
    expect(panel.contains(row)).toBe(true);
    expect(panel.closest('[data-setting-group]')).toBeTruthy();
  });
});
