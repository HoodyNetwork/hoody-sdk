// Vitest on the Test tab's answer: the text of the answer is shown in the kit's code block (wrapped, with a Copy), coloured
// as JSON when it is JSON and plain otherwise. The text itself is the scrubbed answer either way.
import { CoreQueryProvider, queryClient } from '@core';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setTarget } from '@core/ctx';
import { boot, onFetch, R1, settle, TARGET } from '@core/test/env';

const world = vi.hoisted(() => ({ body: '' }));
vi.mock('./data', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  useTests: () => ({ data: { revision: 'abcdef0123456789', cases: [] }, refetch: async () => undefined }),
  useRunTest: () => ({ held: null, mutateAsync: async () => ({ outcome: 'done', data: { status: 200, ms: 3, body: world.body } }) }),
}));

import { TestTab } from './parts/TestTab';
import strings from './strings.en.json';
import type { CompScripts } from './types';
import { looksJson } from './logic';

const item = { id: 'atlas.1111~a.ts', compId: 'c1', compName: 'atlas', compHandle: 'atlas.1111', path: 'default/1/a.ts', name: 'a', route: '/a', description: '', status: 'working', schedule: null, keyed: false, calls: 0, managed: false } as never;
const comp = { id: 'c1', name: 'atlas', handle: 'atlas.1111', state: 'on', serverName: 'sv1', realmIds: [R1], origin: 'https://x', err: null, caps: { revisions: true, history: true, env: true, executions: true, tests: true, publishable: true }, instances: [], rows: [], agentRealm: R1 } as unknown as CompScripts;
const flush = async () => { for (let i = 0; i < 20; i++) await settle(); };

beforeEach(() => {
  boot({ realm: R1 });
  queryClient.clear();
  onFetch(() => ({ status: 200, body: { data: {} } }));
  setTarget(TARGET);
});

const send = async (body: string) => {
  world.body = body;
  render(<TestTab item={item} comp={comp} />, { wrapper: CoreQueryProvider });
  await act(async () => { fireEvent.click(await screen.findByRole('button', { name: strings['test.send'] })); await flush(); });
  // The body shows on Show body only (testtab.answer.panel.test.tsx).
  await act(async () => { fireEvent.click(await screen.findByRole('button', { name: strings['test.showBody'] })); await flush(); });
  return await screen.findByRole('figure', { name: strings['test.answer'] });
};

describe('Test tab: the answer is a code block', () => {
  it('a JSON answer is shown as JSON in the kit block: its text is unchanged and its keys and strings carry colour spans', async () => {
    const fig = await send('{"city":"Tokyo","ok":true}');
    const pre = fig.querySelector('pre')!;
    expect(pre.textContent).toBe('{"city":"Tokyo","ok":true}');
    expect(pre.querySelectorAll('span span').length).toBeGreaterThan(0);
  });

  it('an answer that is not JSON is shown as plain text with no colour spans', async () => {
    // text that has JSON-like tokens in it but is not JSON: it must not be coloured as if it were
    const fig = await send('Not found: "x" 42 true');
    const pre = fig.querySelector('pre')!;
    expect(pre.textContent).toBe('Not found: "x" 42 true');
    expect(pre.querySelectorAll('span span')).toHaveLength(0);
  });
});

describe('Test tab: what is shown is scrubbed first', () => {
  it('control characters in an answer never reach the page', async () => {
    const fig = await send('ok\u001b[31m red\u0007 bell');
    expect(fig.querySelector('pre')!.textContent).toBe('ok[31m red bell');
  });
});

describe('Test tab: the block shows the answer the way the kit does and Copy carries the whole answer', () => {
  it('a final newline ends the last line (the kit never draws an empty line for it) and Copy keeps it: the copy is the scrubbed answer exactly', async () => {
    const written: string[] = [];
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: (text: string) => (written.push(text), Promise.resolve()) } });
    const fig = await send('{"ok":true}\n');
    expect(fig.querySelector('pre')!.textContent).toBe('{"ok":true}');
    await act(async () => { fireEvent.click(within(fig).getByRole('button')); await flush(); });
    expect(written).toEqual(['{"ok":true}\n']);
  });

  it('text with no final newline is shown and copied as it is', async () => {
    const written: string[] = [];
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: (text: string) => (written.push(text), Promise.resolve()) } });
    const fig = await send('line one\nline two');
    expect(fig.querySelector('pre')!.textContent).toBe('line one\nline two');
    await act(async () => { fireEvent.click(within(fig).getByRole('button')); await flush(); });
    expect(written).toEqual(['line one\nline two']);
  });
});

describe('looksJson', () => {
  it('is true only for one JSON object or array', () => {
    expect(looksJson('{"a":1}')).toBe(true);
    expect(looksJson('  [1, 2]\n')).toBe(true);
    expect(looksJson('{"a":')).toBe(false);
    expect(looksJson('42')).toBe(false);
    expect(looksJson('hello')).toBe(false);
    expect(looksJson('')).toBe(false);
  });
});
