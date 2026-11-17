// Vitest on the Test tab's Answer panel: the answer shows its status, time, content type, size and
// headers at once; its body stays out of the page until the person presses Show body, and a new answer starts hidden again.
import { CoreQueryProvider, queryClient } from '@core';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setTarget } from '@core/ctx';
import { boot, onFetch, R1, settle, TARGET } from '@core/test/env';

type Data = { status: number; ms: number; body: string; headers?: ReadonlyArray<readonly [string, string]>; size?: number };
const world = vi.hoisted(() => ({ outcome: 'done' as 'done' | 'pending', data: null as unknown as Data, sends: 0 }));
vi.mock('./data', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  useTests: () => ({ data: { revision: 'abcdef0123456789', cases: [] }, refetch: async () => undefined }),
  useRunTest: () => ({ held: null, mutateAsync: async () => { world.sends++; return { outcome: world.outcome, data: world.data }; } }),
}));

import { TestTab } from './parts/TestTab';
import strings from './strings.en.json';
import type { CompScripts } from './types';

const item = { id: 'atlas.1111~a.ts', compId: 'c1', compName: 'atlas', compHandle: 'atlas.1111', path: 'default/1/a.ts', name: 'a', route: '/a', description: '', status: 'working', schedule: null, keyed: false, calls: 0, managed: false } as never;
const comp = { id: 'c1', name: 'atlas', handle: 'atlas.1111', state: 'on', serverName: 'sv1', realmIds: [R1], origin: 'https://x', err: null, caps: { revisions: true, history: true, env: true, executions: true, tests: true, publishable: true }, instances: [], rows: [], agentRealm: R1 } as unknown as CompScripts;
const flush = async () => { for (let i = 0; i < 20; i++) await settle(); };

const HEADERS = [['content-type', 'application/json; charset=utf-8'], ['x-execution-id', 'ex_7']] as const;
const BODY = '{"order":"42","note":"private words"}';

beforeEach(() => {
  boot({ realm: R1 });
  queryClient.clear();
  onFetch(() => ({ status: 200, body: { data: {} } }));
  setTarget(TARGET);
  world.outcome = 'done';
  world.data = { status: 200, ms: 12, body: BODY, headers: HEADERS, size: 2048 };
  world.sends = 0;
});

const pressSend = async () => {
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: strings['test.send'] })); await flush(); });
};
const open = async () => {
  render(<TestTab item={item} comp={comp} />, { wrapper: CoreQueryProvider });
  await screen.findByRole('button', { name: strings['test.send'] });
  await pressSend();
  return screen.getByRole('status');
};
/** The value a fact list gives a label (dt -> its dd). */
const fact = (scope: HTMLElement, label: string) => within(scope).getByText(label, { selector: 'dt' }).nextElementSibling?.textContent;

describe('Answer panel: what shows at once', () => {
  it('status, time, content type, size and every header show; the body does not', async () => {
    const a = await open();
    expect(a.textContent).toContain(`${strings['test.ok']} · 200`);
    expect(a.textContent).toContain('12 ms');
    expect(fact(a, strings['test.contentType'])).toBe('application/json; charset=utf-8');
    expect(fact(a, strings['test.size'])).toBe('2 KB');
    const hs = within(a).getByLabelText(strings['test.headers']);
    expect(fact(hs, 'content-type')).toBe('application/json; charset=utf-8');
    expect(fact(hs, 'x-execution-id')).toBe('ex_7');
    expect(document.body.textContent).not.toContain('private words');
    expect(screen.queryByRole('figure', { name: strings['test.answer'] })).toBeNull();
  });

  it('no content-type header: Not given; no header the page can read: says so', async () => {
    world.data = { status: 204, ms: 3, body: '', headers: [], size: 0 };
    const a = await open();
    expect(fact(a, strings['test.contentType'])).toBe(strings['test.noType']);
    expect(fact(a, strings['test.size'])).toBe('0 B');
    expect(a.textContent).toContain(strings['test.noHeaders']);
  });

  it('an answer without headers or size (an older core): those facts are left out, the rest shows', async () => {
    world.data = { status: 200, ms: 5, body: 'ok' };
    const a = await open();
    expect(a.textContent).toContain(`${strings['test.ok']} · 200`);
    expect(within(a).queryByText(strings['test.size'], { selector: 'dt' })).toBeNull();
    expect(within(a).queryByText(strings['test.contentType'], { selector: 'dt' })).toBeNull();
    expect(within(a).getByRole('button', { name: strings['test.showBody'] })).toBeTruthy();
  });

  it('an unknown outcome keeps its label and shows its headers too', async () => {
    world.outcome = 'pending';
    world.data = { status: 502, ms: 9, body: 'bad gateway', headers: [['content-type', 'text/html']], size: 11 };
    const a = await open();
    expect(a.textContent).toContain(`${strings['test.unknown']} · 502`);
    expect(a.textContent).not.toContain(strings['test.failed']);
    expect(fact(a, strings['test.contentType'])).toBe('text/html');
  });
});

describe('Answer panel: the body only on Show', () => {
  it('Show body shows it (scrubbed, in the kit block); Hide body takes it out again; nothing is sent by either', async () => {
    const a = await open();
    await act(async () => { fireEvent.click(within(a).getByRole('button', { name: strings['test.showBody'] })); await flush(); });
    const fig = screen.getByRole('figure', { name: strings['test.answer'] });
    expect(fig.querySelector('pre')!.textContent).toBe(BODY);
    await act(async () => { fireEvent.click(within(a).getByRole('button', { name: strings['test.hideBody'] })); await flush(); });
    expect(screen.queryByRole('figure', { name: strings['test.answer'] })).toBeNull();
    expect(document.body.textContent).not.toContain('private words');
    expect(world.sends).toBe(1);
  });

  it('a new answer starts with its body hidden again', async () => {
    const a = await open();
    await act(async () => { fireEvent.click(within(a).getByRole('button', { name: strings['test.showBody'] })); await flush(); });
    expect(screen.getByRole('figure', { name: strings['test.answer'] })).toBeTruthy();
    world.data = { ...world.data, body: '{"second":"answer"}' };
    await pressSend();
    expect(screen.queryByRole('figure', { name: strings['test.answer'] })).toBeNull();
    expect(document.body.textContent).not.toContain('second');
    expect(within(screen.getByRole('status')).getByRole('button', { name: strings['test.showBody'] })).toBeTruthy();
  });
});
