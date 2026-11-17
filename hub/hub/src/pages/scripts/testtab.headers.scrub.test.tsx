// Vitest: the Answer panel's header names and values, its Content-Type row and its body are scrubbed against
// the request that produced the answer, when it is stored. A secret the person typed in the request body and echoed
// back never shows, not even before Show body, and not after the form changes (body cleared or edited, method GET)
// while that answer still shows. A POST with a body is withheld (testtab.answer.reveal.test.tsx): its
// headers and body draw only after Show answer, and are scrubbed there just the same.
import { CoreQueryProvider, queryClient } from '@core';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setTarget } from '@core/ctx';
import { boot, onFetch, R1, settle, TARGET } from '@core/test/env';

type Data = { status: number; ms: number; body: string; headers?: ReadonlyArray<readonly [string, string]>; size?: number };
const world = vi.hoisted(() => ({ data: null as unknown as Data }));
vi.mock('./data', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  useTests: () => ({ data: { revision: 'abcdef0123456789', cases: [] }, refetch: async () => undefined }),
  useRunTest: () => ({ held: null, mutateAsync: async () => ({ outcome: 'done', data: world.data }) }),
}));

import { TestTab } from './parts/TestTab';
import strings from './strings.en.json';
import type { CompScripts } from './types';

const item = { id: 'atlas.1111~a.ts', compId: 'c1', compName: 'atlas', compHandle: 'atlas.1111', path: 'default/1/a.ts', name: 'a', route: '/a', description: '', status: 'working', schedule: null, keyed: false, calls: 0, managed: false } as never;
const comp = { id: 'c1', name: 'atlas', handle: 'atlas.1111', state: 'on', serverName: 'sv1', realmIds: [R1], origin: 'https://x', err: null, caps: { revisions: true, history: true, env: true, executions: true, tests: true, publishable: true }, instances: [], rows: [], agentRealm: R1 } as unknown as CompScripts;
const flush = async () => { for (let i = 0; i < 20; i++) await settle(); };
const SECRET = 'sk_synthetic_9f3a7c1e5b2d4086';
const fact = (scope: HTMLElement, label: string) => within(scope).getByText(label, { selector: 'dt' }).nextElementSibling?.textContent;

beforeEach(() => {
  boot({ realm: R1 });
  queryClient.clear();
  onFetch(() => ({ status: 200, body: { data: {} } }));
  setTarget(TARGET);
});

/** POST the secret as the request body; the answer echoes it in headers. */
const postSecret = async () => {
  render(<TestTab item={item} comp={comp} />, { wrapper: CoreQueryProvider });
  await act(async () => { fireEvent.click(await screen.findByRole('button', { name: new RegExp(strings['test.method']) })); await flush(); });
  await act(async () => { fireEvent.click(within(await screen.findByRole('listbox')).getByText('POST')); await flush(); });
  fireEvent.change(screen.getByRole('textbox', { name: strings['test.requestBody'] }), { target: { value: SECRET } });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: strings['test.send'] })); await flush(); });
  return screen.getByRole('status');
};
/** The answer of a POST with a body is withheld: nothing of it shows the secret before Show answer, which draws it. */
const reveal = async (a: HTMLElement) => {
  expect(a.textContent).not.toContain(SECRET);
  await act(async () => { fireEvent.click(within(a).getByRole('button', { name: strings['test.showAnswer'] })); await flush(); });
};

const ECHO: Data = { status: 200, ms: 4, body: `{"echo":"${SECRET}"}`, headers: [['content-type', `text/plain; tag=${SECRET}`], ['x-echo', SECRET]], size: 2 };
/** After the form changed: nothing in the Answer panel shows the secret, the body included once shown. */
const stillHidden = async (a: HTMLElement) => {
  await reveal(a);
  expect(a.textContent).not.toContain(SECRET);
  expect(fact(within(a).getByLabelText(strings['test.headers']), 'x-echo')).toBe('[hidden]');
  expect(fact(a, strings['test.contentType'])).toBe('text/plain; tag=[hidden]');
  const pre = screen.getByRole('figure', { name: strings['test.answer'] }).querySelector('pre')!;
  expect(pre.textContent).toBe('{"echo":"[hidden]"}');
};

describe('Answer panel: scrubbed against the request that produced it, not the form', () => {
  it('clearing the request body leaves the shown answer scrubbed', async () => {
    world.data = ECHO;
    const a = await postSecret();
    fireEvent.change(screen.getByRole('textbox', { name: strings['test.requestBody'] }), { target: { value: '' } });
    await act(async () => { await flush(); });
    await stillHidden(a);
  });

  it('editing the request body leaves the shown answer scrubbed', async () => {
    world.data = ECHO;
    const a = await postSecret();
    fireEvent.change(screen.getByRole('textbox', { name: strings['test.requestBody'] }), { target: { value: 'something else' } });
    await act(async () => { await flush(); });
    await stillHidden(a);
  });

  it('switching the method to GET leaves the shown answer scrubbed', async () => {
    world.data = ECHO;
    const a = await postSecret();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: new RegExp(strings['test.method']) })); await flush(); });
    await act(async () => { fireEvent.click(within(await screen.findByRole('listbox')).getByText('GET')); await flush(); });
    expect(screen.queryByRole('textbox', { name: strings['test.requestBody'] })).toBeNull();
    await stillHidden(a);
  });
});

describe('Answer panel: header values are scrubbed like the body', () => {
  it('a typed secret echoed in x-echo and in Content-Type shows as [hidden] once the answer is shown', async () => {
    world.data = { status: 200, ms: 4, body: 'ok', headers: [['content-type', `text/plain; tag=${SECRET}`], ['x-echo', SECRET], ['x-execution-id', 'ex_7']], size: 2 };
    const a = await postSecret();
    await reveal(a);
    expect(a.textContent).not.toContain(SECRET); // the Answer panel; the request field still holds what the person typed
    expect(fact(a, strings['test.contentType'])).toBe('text/plain; tag=[hidden]');
    const hs = within(a).getByLabelText(strings['test.headers']);
    expect(fact(hs, 'x-echo')).toBe('[hidden]');
    expect(fact(hs, 'x-execution-id')).toBe('ex_7');
  });
});

describe('Answer panel: header names are scrubbed like their values', () => {
  // The secret is echoed into a header NAME, which the Headers facts show as a label.
  const NAMED: Data = { status: 200, ms: 4, body: `{"echo":"${SECRET}"}`, headers: [['content-type', 'text/plain'], [`x-${SECRET}`, 'v1'], ['x-echo', SECRET]], size: 2 };
  /** Nothing in the Answer panel shows the secret: the named header reads x-[hidden] with its value, the body too once shown. */
  const nameHidden = async (a: HTMLElement) => {
    await reveal(a);
    const hs = within(a).getByLabelText(strings['test.headers']);
    expect(fact(hs, 'x-[hidden]')).toBe('v1');
    expect(fact(hs, 'x-echo')).toBe('[hidden]');
    expect(a.textContent).not.toContain(SECRET);
    expect(screen.getByRole('figure', { name: strings['test.answer'] }).querySelector('pre')!.textContent).toBe('{"echo":"[hidden]"}');
  };

  it('a typed secret echoed in a header name shows as [hidden] in its label once the answer is shown', async () => {
    world.data = NAMED;
    const a = await postSecret();
    expect(a.textContent).not.toContain(SECRET);
    await nameHidden(a);
  });

  it('editing the request body leaves the name hidden', async () => {
    world.data = NAMED;
    const a = await postSecret();
    fireEvent.change(screen.getByRole('textbox', { name: strings['test.requestBody'] }), { target: { value: 'something else' } });
    await act(async () => { await flush(); });
    await nameHidden(a);
  });

  it('switching the method to GET leaves the name hidden', async () => {
    world.data = NAMED;
    const a = await postSecret();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: new RegExp(strings['test.method']) })); await flush(); });
    await act(async () => { fireEvent.click(within(await screen.findByRole('listbox')).getByText('GET')); await flush(); });
    await nameHidden(a);
  });
});

describe('Answer panel: a header name arrives lower-cased (core lower-cases names)', () => {
  it('a typed secret with capitals, echoed into a header name, is hidden in its lower-case form', async () => {
    const MIXED = 'Sk_Live_AbC123xyzQ9';
    render(<TestTab item={item} comp={comp} />, { wrapper: CoreQueryProvider });
    await act(async () => { fireEvent.click(await screen.findByRole('button', { name: new RegExp(strings['test.method']) })); await flush(); });
    await act(async () => { fireEvent.click(within(await screen.findByRole('listbox')).getByText('POST')); await flush(); });
    fireEvent.change(screen.getByRole('textbox', { name: strings['test.requestBody'] }), { target: { value: MIXED } });
    world.data = { status: 200, ms: 4, body: 'ok', headers: [['content-type', 'text/plain'], [`x-${MIXED.toLowerCase()}`, 'v1']], size: 2 };
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: strings['test.send'] })); await flush(); });
    const a = screen.getByRole('status');
    await act(async () => { fireEvent.click(within(a).getByRole('button', { name: strings['test.showAnswer'] })); await flush(); });
    expect(a.textContent?.toLowerCase()).not.toContain(MIXED.toLowerCase());
    expect(fact(within(a).getByLabelText(strings['test.headers']), 'x-[hidden]')).toBe('v1');
  });
});
