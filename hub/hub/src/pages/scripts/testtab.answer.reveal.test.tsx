// Vitest: an answer to a request that sent something the person typed (a POST with a body, or an
// address with a query string) is withheld. Its status, time and size show at once, but its content type, headers and
// body stay out of the page until the person presses Show answer. A new answer starts hidden again. Whether an answer
// is withheld comes from the request that produced it, never from the form. A fragment (#…) is never sent, so it does
// not count. Nothing here reads the answer's text: the scrub backstop (testtab.headers.scrub.test.tsx) is unchanged.
import { CoreQueryProvider, queryClient } from '@core';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setTarget } from '@core/ctx';
import { boot, onFetch, R1, settle, TARGET } from '@core/test/env';

type Data = { status: number; ms: number; body: string; headers?: ReadonlyArray<readonly [string, string]>; size?: number };
const world = vi.hoisted(() => ({ data: null as unknown as Data, sent: [] as Array<{ method: string; route: string; body?: string }>, cases: [] as unknown[] }));
vi.mock('./data', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  useTests: () => ({ data: { revision: 'abcdef0123456789', cases: world.cases }, refetch: async () => undefined }),
  useRunTest: () => ({ held: null, mutateAsync: async (v: { method: string; route: string; body?: string }) => { world.sent.push(v); return { outcome: 'done', data: world.data }; } }),
}));

import { TestTab } from './parts/TestTab';
import strings from './strings.en.json';
import type { CompScripts } from './types';

const item = { id: 'atlas.1111~a.ts', compId: 'c1', compName: 'atlas', compHandle: 'atlas.1111', path: 'default/1/a.ts', name: 'a', route: '/a', description: '', status: 'working', schedule: null, keyed: false, calls: 0, managed: false } as never;
const comp = { id: 'c1', name: 'atlas', handle: 'atlas.1111', state: 'on', serverName: 'sv1', realmIds: [R1], origin: 'https://x', err: null, caps: { revisions: true, history: true, env: true, executions: true, tests: true, publishable: true }, instances: [], rows: [], agentRealm: R1 } as unknown as CompScripts;
const flush = async () => { for (let i = 0; i < 20; i++) await settle(); };
const fact = (scope: HTMLElement, label: string) => within(scope).getByText(label, { selector: 'dt' }).nextElementSibling?.textContent;

// A typed value one field of the request carries; the answer echoes that field alone (not the whole request body),
// in a header value and in the content type, where the whole-body backstop cannot find it.
const TYPED = 'tok_synthetic_51c9e2a7';
const ECHO: Data = { status: 200, ms: 7, body: `{"seen":"${TYPED}"}`, headers: [['content-type', `application/json; tag=${TYPED}`], ['x-echo', TYPED], ['x-execution-id', 'ex_9']], size: 512 };

beforeEach(() => {
  boot({ realm: R1 });
  queryClient.clear();
  onFetch(() => ({ status: 200, body: { data: {} } }));
  setTarget(TARGET);
  world.data = ECHO;
  world.sent = [];
  world.cases = [];
});

const mount = async () => {
  render(<TestTab item={item} comp={comp} />, { wrapper: CoreQueryProvider });
  await screen.findByRole('button', { name: strings['test.send'] });
};
const pickMethod = async (m: 'GET' | 'POST') => {
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: new RegExp(strings['test.method']) })); await flush(); });
  await act(async () => { fireEvent.click(within(await screen.findByRole('listbox')).getByText(m)); await flush(); });
};
const typeBody = (v: string) => fireEvent.change(screen.getByRole('textbox', { name: strings['test.requestBody'] }), { target: { value: v } });
const typeAddress = (v: string) => fireEvent.change(screen.getByRole('textbox', { name: strings['test.address'] }), { target: { value: v } });
const pressSend = async () => {
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: strings['test.send'] })); await flush(); });
  return screen.getByRole('status');
};
const toggle = async (a: HTMLElement, name: string) => {
  await act(async () => { fireEvent.click(within(a).getByRole('button', { name })); await flush(); });
};

/** Withheld: status, time and size show; the note and Show answer show; no content type, header or body is in the page. */
const expectWithheld = (a: HTMLElement) => {
  expect(a.textContent).toContain(`${strings['test.ok']} · 200`);
  expect(a.textContent).toContain('7 ms');
  expect(fact(a, strings['test.size'])).toBe('512 B');
  expect(a.textContent).toContain(strings['test.withheldNote']);
  expect(within(a).queryByText(strings['test.contentType'], { selector: 'dt' })).toBeNull();
  expect(within(a).queryByLabelText(strings['test.headers'])).toBeNull();
  expect(within(a).queryByText('x-execution-id', { selector: 'dt' })).toBeNull();
  expect(screen.queryByRole('figure', { name: strings['test.answer'] })).toBeNull();
  expect(a.textContent).not.toContain(TYPED);
  expect(a.textContent).not.toContain('ex_9');
  const b = within(a).getByRole('button', { name: strings['test.showAnswer'] });
  expect(b.getAttribute('aria-expanded')).toBe('false');
  expect(within(a).queryByRole('button', { name: strings['test.showBody'] })).toBeNull();
};
/** Not withheld: content type and headers show at once, the body waits for Show body (testtab.answer.panel.test.tsx). */
const expectOpen = (a: HTMLElement) => {
  expect(fact(a, strings['test.contentType'])).toBe(`application/json; tag=${TYPED}`);
  expect(fact(within(a).getByLabelText(strings['test.headers']), 'x-execution-id')).toBe('ex_9');
  expect(a.textContent).not.toContain(strings['test.withheldNote']);
  expect(within(a).getByRole('button', { name: strings['test.showBody'] })).toBeTruthy();
  expect(within(a).queryByRole('button', { name: strings['test.showAnswer'] })).toBeNull();
};

describe('a POST that sent a body is withheld', () => {
  it('only status, time and size show; Show answer reveals content type, headers and body together; Hide answer takes them out', async () => {
    await mount();
    await pickMethod('POST');
    typeBody(`{"token":"${TYPED}","n":1}`);
    const a = await pressSend();
    expectWithheld(a);
    await toggle(a, strings['test.showAnswer']);
    expect(within(a).getByRole('button', { name: strings['test.hideAnswer'] }).getAttribute('aria-expanded')).toBe('true');
    expect(fact(a, strings['test.contentType'])).toBe(`application/json; tag=${TYPED}`);
    const hs = within(a).getByLabelText(strings['test.headers']);
    expect(fact(hs, 'x-echo')).toBe(TYPED);
    expect(fact(hs, 'x-execution-id')).toBe('ex_9');
    expect(screen.getByRole('figure', { name: strings['test.answer'] }).querySelector('pre')!.textContent).toBe(`{"seen":"${TYPED}"}`);
    expect(a.textContent).not.toContain(strings['test.withheldNote']);
    await toggle(a, strings['test.hideAnswer']);
    expectWithheld(a);
    expect(world.sent).toHaveLength(1);
  });

  it('a new answer starts withheld again', async () => {
    await mount();
    await pickMethod('POST');
    typeBody(TYPED);
    const a = await pressSend();
    await toggle(a, strings['test.showAnswer']);
    expect(within(a).getByLabelText(strings['test.headers'])).toBeTruthy();
    world.data = { ...ECHO, body: '{"second":"answer"}' };
    expectWithheld(await pressSend());
    expect(document.body.textContent).not.toContain('second');
  });

  it('a POST with an empty body sent nothing typed: not withheld', async () => {
    await mount();
    await pickMethod('POST');
    typeBody('');
    expectOpen(await pressSend());
    expect(world.sent[0]).toMatchObject({ method: 'POST', body: '' });
  });
});

describe('an address with a query string is withheld; a fragment is not', () => {
  it('GET /a?key=… is withheld', async () => {
    await mount();
    typeAddress(`/a?key=${TYPED}`);
    expectWithheld(await pressSend());
    expect(world.sent[0]).toMatchObject({ method: 'GET', route: `/a?key=${TYPED}` });
  });

  it('a bare ? still counts (a query string, even an empty one, is what the request sent)', async () => {
    await mount();
    typeAddress('/a?');
    expectWithheld(await pressSend());
  });

  it('GET /a#section is not withheld: a fragment never leaves the browser', async () => {
    await mount();
    typeAddress('/a#section');
    expectOpen(await pressSend());
  });

  it('GET /a with no query is not withheld', async () => {
    await mount();
    expectOpen(await pressSend());
  });
});

describe('withheld follows the request that produced the answer, not the form', () => {
  it('a withheld POST answer stays withheld after the body is cleared and the method switched to GET', async () => {
    await mount();
    await pickMethod('POST');
    typeBody(TYPED);
    const a = await pressSend();
    typeBody('');
    await pickMethod('GET');
    await act(async () => { await flush(); });
    expectWithheld(a);
  });

  it('a withheld query answer stays withheld after the address loses its query', async () => {
    await mount();
    typeAddress(`/a?key=${TYPED}`);
    const a = await pressSend();
    typeAddress('/a');
    await act(async () => { await flush(); });
    expectWithheld(a);
  });

  it('an open GET answer stays open after the form turns into a POST with a body', async () => {
    await mount();
    const a = await pressSend();
    await pickMethod('POST');
    typeBody(TYPED);
    await act(async () => { await flush(); });
    expectOpen(a);
  });
});

describe('a saved test run is judged by what it sent, not by the form', () => {
  const runSaved = async (name: string) => {
    await act(async () => { fireEvent.click(within(screen.getByText(name).closest('li')!).getByRole('button', { name: strings['test.run'] })); await flush(); });
    return screen.getByRole('status');
  };

  it('a saved POST with a body, run while the form shows a plain GET, is withheld', async () => {
    world.cases = [{ id: 't1', name: 'post one', method: 'POST', route: '/a', body: { type: 'text', value: TYPED } }];
    await mount();
    expectWithheld(await runSaved('post one'));
    expect(world.sent[0]).toMatchObject({ method: 'POST', route: '/a', body: TYPED });
  });

  it('a saved GET with a query, run while the form shows a plain GET, is withheld', async () => {
    world.cases = [{ id: 't2', name: 'query one', method: 'GET', route: `/a?key=${TYPED}` }];
    await mount();
    expectWithheld(await runSaved('query one'));
  });
});
