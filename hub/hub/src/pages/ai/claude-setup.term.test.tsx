// AI models, Claude Code's typed setup in the terminal. "Open a terminal to sign in" types the command
// into a terminal on the computer; the web shows that terminal inline (the Board's Frame, an iframe) with a splitter under
// it. A terminal draws no iframe, so the block was an empty box, a "Resize the setup terminal" splitter that resized
// nothing, and words pointing at "the terminal below". Here: no frame, no splitter, words saying where the command runs,
// and Open in a new tab (the computer's terminal, handed outside the Hub) with Check again.
//   - The page test (the page's fixture, the terminal's words): the page fixture's computer names no routing node, so the
//     page builds no address for the setup terminal there and offers no Open in a new tab (the web's fixture neither).
//   - The section test: a computer with its routing node, as a real one has, so the address is built: no splitter, and
//     Open in a new tab hands the share address outside.
import { afterEach, expect, test } from 'bun:test';
import '../../term/env/router-globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory } from '@tanstack/history';
import { createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import type { providers, Target } from '@core';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { setProxyDomain } from '../../core/hosts';
import { ShellDataProvider, type ShellData } from '../../shell/context';
import { parseSearch, stringifySearch } from '../../term/app/router';
import { beginTermSession, type TermSession } from '../../term/env/session';
import { FocusRoot } from '../../term/prim';
import { act, queryAllByRole, semanticsOf, type Role, type SemRoot } from '../../term/prim/semantics';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import type { Api } from './api';
import { claudeOf, COMMANDS } from './logic';
import { ClaudeSection } from './parts/Claude';
import { AiProvider, type AiCtx } from './parts/ctx';
import strings from './strings.en.json';

let s: PageSession | null = null;
let t: TestTerm | null = null;
let host: TermSession | null = null;
afterEach(() => { s?.close(); s = null; t?.renderer.destroy(); t = null; host?.end(); host = null; setProxyDomain(null); });

const flat = (f: string) => f.replace(/[│┃]/g, ' ').replace(/\s+/g, ' ');

test('the page: the typed sign-in says where it runs; no dead splitter; Check again', async () => {
  s = await renderPage({ page: 'ai', path: '/ai/models?section=claude', fx: 'claudeSignedOut', cols: 120, rows: 40, settleMs: 3000 });
  const nodes = (role: Role, name: string | RegExp) => {
    const r = s!.renderer as unknown as { root: never; stdin: never };
    return queryAllByRole(semanticsOf({ root: r.root, stdin: r.stdin }), role, { name });
  };
  const until = async (ok: (f: string) => boolean, ms = 20_000): Promise<string> => {
    const end = performance.now() + ms;
    while (!ok(s!.frame) && performance.now() < end) { await new Promise((r) => setTimeout(r, 250)); await s!.settle(); }
    return s!.frame;
  };
  await until(() => nodes('button', strings['claude.signIn']).length > 0);
  const [open] = nodes('button', strings['claude.signIn']);
  expect(open, s.frame).toBeDefined();
  act(open!, 'press');
  await s.settle();
  const f = await until((x) => x.includes(strings['claude.typedTitle']));
  expect(f).toContain(strings['claude.typedTitle']);
  expect(nodes('separator', strings['claude.termResize'])).toEqual([]);
  expect(flat(f)).toContain('running in a terminal on the computer');
  expect(flat(f)).not.toContain('terminal below');
  expect(nodes('button', strings['claude.check']).length, f).toBeGreaterThan(0);
  expect(s.trapsAt).toEqual([]);
  expect(s.failures).toEqual([]);
  expect(f).not.toContain('could not be drawn');
}, 180_000);

// The section alone, on a computer that has its routing node (the web's Claude.test.tsx mounts it the same way).
type Settled = providers.Settled<unknown>;
const ok = (body: unknown = {}): Settled => ({ ok: true, body });
const A: Target = { project: { id: 'p1' }, container: { id: 'c1', server_name: 'sv1' } };
const acpBody = (): Settled =>
  ok({ status: 'ok', report: { agents: [{ name: 'claude', installed: true, install_state: 'ok', logged_in: 'logged_out', enabled: true, startable: true, setup_user: 'ada', install_hint: COMMANDS.install, login_hint: COMMANDS.login }] } });
const SHELL: ShellData = { realms: [], realmId: 'global', computers: [{ id: 'c1', name: 'atlas' }], computerId: 'c1' };

function mounted(api: Api): ReactNode {
  const ctx = {
    m: { computer: { id: 'c1', name: 'atlas' }, target: A, realm: 'global', realmIds: [], claude: claudeOf(acpBody(), null), acpDefaultCap: true, loads: { claude: 'ok' } },
    api, env: {}, reload: () => undefined, connect: () => undefined, goto: () => undefined,
  } as unknown as AiCtx;
  const root = createRootRoute({ component: () => <ShellDataProvider value={SHELL}><AiProvider value={ctx}><ClaudeSection /></AiProvider></ShellDataProvider> });
  const index = createRoute({ getParentRoute: () => root, path: '/', component: () => null });
  const router = createRouter({ routeTree: root.addChildren([index]), history: createMemoryHistory({ initialEntries: ['/'] }), origin: 'http://hub.term', parseSearch, stringifySearch } as never);
  return <QueryClientProvider client={new QueryClient()}><FocusRoot><RouterProvider router={router as never} /></FocusRoot></QueryClientProvider>;
}

test('the section on a routable computer: no splitter; Open in a new tab hands the terminal\'s address outside; Check again', async () => {
  setProxyDomain('computers.hoody.test');
  const opened: string[] = [];
  host = beginTermSession({ openExternal: (u) => { opened.push(u); } });
  const api = {
    termCaps: async () => ok(),
    termCreate: async (n: number) => ok({ status: 'ok', terminal_id: String(n), incarnation: 'inc-1' }),
    termWait: async () => ok(),
    termWrite: async () => ok(),
    termDelete: async () => ok(),
    acp: async () => acpBody(),
  } as unknown as Api;
  t = await drawTest(mounted(api), { width: 120, height: 40 });
  const first = await t.settle();
  const nodes = (role: Role, name: string | RegExp) => queryAllByRole(semanticsOf(t!.renderer as unknown as SemRoot), role, { name });
  const [signIn] = nodes('button', strings['claude.signIn']);
  expect(signIn, first).toBeDefined();
  act(signIn!, 'press');
  let f = await t.settle();
  for (let i = 0; i < 20 && !f.includes(strings['claude.typedTitle']); i++) f = await t.settle();
  expect(f).toContain(strings['claude.typedTitle']);
  // The web's splitter sizes the inline terminal; a terminal draws no frame, so there is nothing to size.
  expect(nodes('separator', strings['claude.termResize'])).toEqual([]);
  expect(nodes('button', strings['claude.check']).length, f).toBeGreaterThan(0);
  const tab = nodes('link', strings['claude.termTab']);
  expect(tab.length, f).toBe(1);
  act(tab[0]!, 'press');
  const after = await t.settle();
  expect(opened, after).toHaveLength(1);
  expect(opened[0]).toMatch(/^https:\/\/[^/]+\.sv1\.computers\.hoody\.test\//);
  // The address holds the computer's ids: never drawn.
  expect(after).not.toContain('computers.hoody.test');
}, 60_000);
