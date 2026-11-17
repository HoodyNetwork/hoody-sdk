// Open in AI, through the real engine and registry over the fixture agent: the dock's header action opens the SAME conversation
// on the AI page (its reference in the address) and closes the dock. A settled conversation closes the dock at once. One with a
// message still on its way is lent to the page as the dock's own engine: the dock stays until the message has settled, the row
// stays as it was and nothing is sent a second time.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider, type AnyRouter } from '@tanstack/react-router';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PageManifest } from '@kit/page';
import type * as Data from './data';

type Hang = Record<string, boolean>;
type Held = Array<() => void>;
vi.mock('./data', async (orig) => {
  const real = await orig<typeof Data>();
  const { FakeAgent } = await import('./fake');
  const { realClock } = await import('./engine');
  return {
    ...real,
    // One agent for the whole test; `__hang` holds the named agent calls until the test lets them go.
    liveIO: (t: { container: { id: string } }) => {
      const g = globalThis as { __fake?: InstanceType<typeof FakeAgent>; __hang?: Hang; __held?: Held };
      g.__fake ??= new FakeAgent({ account: '64f0c0ffee0000000000c0de', pace: 10, realms: ['f1f1f1f1f1f1f1f1f1f1f1f1'] }, realClock);
      const agent = g.__fake;
      const wrapped = new Proxy(agent, {
        get(target, p) {
          const v = (target as any)[p];
          if (typeof v !== 'function') return v;
          return (...a: unknown[]) => (g.__hang?.[String(p)] ? new Promise((res, rej) => { (g.__held ??= []).push(() => { Promise.resolve(v.apply(target, a)).then(res, rej); }); }) : v.apply(target, a));
        },
      });
      return real.withFixtureDest(wrapped, t.container.id);
    },
  };
});

import './data';
import { ShellDataProvider, type ShellData } from '../shell/context';
import { PagesProvider } from '../shell/pageLinks';
import { dockConvRef, Header, useOpenInAi, type HeaderProps } from './AskPanel';
import type { AskEngine } from './engine';
import type { FakeAgent } from './fake';
import { useSnapshot } from './registry';
import type * as Reg from './registry';
import { computerHandle } from '@core';
import { ACCOUNT, REALM, slot, world, type World } from './accept/env';
import strings from './strings.en.json';

let w: World | null = null;
afterEach(async () => {
  cleanup();
  const R = await import('./registry');
  R.resetRegistryForTests();
  vi.restoreAllMocks();
  w?.dispose();
  w = null;
  const g = globalThis as Record<string, unknown>;
  for (const k of ['__fake', '__hang', '__held']) delete g[k];
});
const g = globalThis as { __fake?: FakeAgent; __hang?: Hang; __held?: Held };
const fake = (): FakeAgent => g.__fake!;
const AT = { project: slot.project, id: slot.computer, name: 'atlas' };
const HANDLE = computerHandle(AT);
const target = { project: { id: slot.project }, container: { id: slot.computer, server_name: 'atlas' } } as any;
const dir = { resolve: (h: string) => (h === HANDLE ? AT : null), handleOf: (id: string) => (id === AT.id ? HANDLE : null) };
const t = ((k: string) => (strings as Record<string, string>)[k] ?? k) as unknown as HeaderProps['t'];
const pg = (id: string) => ({ id, path: `/${id}`, title: id, strings: {}, status: 'ready' }) as unknown as PageManifest;
const sent = (text: string): number => fake().log.filter(([m, a]) => (m === 'turn' || m === 'command') && a.includes(text)).length;
const states = (e: AskEngine): string[] => Object.values(e.getSnapshot().conv.users).map((u) => u.state);

/** The dock's header over the engine, as the panel draws it: the same hook, the same button. */
function Dock({ eng, onClose, name }: { eng: AskEngine; onClose: () => void; name: string }) {
  const snap = useSnapshot(eng);
  const openInAi = useOpenInAi(eng, dockConvRef(eng, target), snap, onClose, name);
  return <Header t={t} phone={false} onClose={onClose} realmName="Realm" computer="atlas" computerHref="" eng={eng} snap={snap} agentUrl="" openInAi={openInAi} />;
}

async function mount(eng: AskEngine, onClose: () => void, pages = ['ai'], name = 'atlas'): Promise<AnyRouter> {
  const data: ShellData = { realms: [], realmId: 'r1', computers: [] };
  const Component = () => <PagesProvider pages={pages.map(pg)}><ShellDataProvider value={data}><Dock eng={eng} onClose={onClose} name={name} /></ShellDataProvider></PagesProvider>;
  const router = createRouter({ routeTree: createRootRoute({ component: Component }), history: createMemoryHistory({ initialEntries: ['/computers'] }) });
  await act(async () => { render(<RouterProvider router={router} />); await router.load(); });
  return router;
}

async function dock(): Promise<{ R: typeof Reg; eng: AskEngine }> {
  w = world();
  const R = await import('./registry');
  R.setComputerDirectory(dir);
  const eng = R.engineFor(slot, target);
  await vi.waitFor(() => expect(eng.getSnapshot().phase).toBe('ready'), { timeout: 5000 });
  return { R, eng };
}
async function settled(): Promise<{ R: typeof Reg; eng: AskEngine; sid: string }> {
  const { R, eng } = await dock();
  eng.send('Build me a dashboard');
  await vi.waitFor(() => expect(eng.quiet(), 'the first turn did not settle').toBe(true), { timeout: 15000 });
  return { R, eng, sid: eng.session()! };
}
const button = () => screen.getByRole('button', { name: strings['ask.openInAi'] });
const where = (r: AnyRouter): string => r.state.location.href;
/** A leave confirmation holding the navigation, as a page with unsaved work does: `answer(true)` cancels it, `answer(false)` goes. */
function hold(router: AnyRouter): { answer: (cancel: boolean) => void; unhold: () => void } {
  let answer: (cancel: boolean) => void = () => undefined;
  const unhold = router.history.block({ blockerFn: () => new Promise<boolean>((res) => { answer = res; }) });
  return { answer: (cancel) => answer(cancel), unhold };
}
const pause = (ms: number) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });

describe('Open in AI', () => {
  it('no conversation yet: the button is there, disabled, and says why', async () => {
    const { eng } = await dock();
    const onClose = vi.fn();
    const router = await mount(eng, onClose);
    expect(button().getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByText(strings['ask.openInAiNone'])).toBeTruthy();
    await act(async () => { button().click(); });
    expect(where(router)).toBe('/computers');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('a load that serves no AI page has no such button', async () => {
    const { eng } = await settled();
    await mount(eng, () => undefined, ['computers']);
    expect(screen.queryByRole('button', { name: strings['ask.openInAi'] })).toBeNull();
  });

  it('a settled conversation: lands on the same session and closes the dock; nothing is sent', async () => {
    const { eng, sid } = await settled();
    const before = fake().log.filter(([m]) => m === 'turn' || m === 'command' || m === 'create').length;
    const onClose = vi.fn();
    const router = await mount(eng, onClose);
    expect(button().getAttribute('aria-disabled')).toBeNull();
    await act(async () => { button().click(); });
    await vi.waitFor(() => expect(where(router)).toContain('/ai/c/'), { timeout: 5000 });
    const url = new URL(where(router), 'https://hub.example');
    expect(url.pathname, 'not the same session').toBe(`/ai/c/${sid}`);
    expect(url.searchParams.get('computer')).toBe(HANDLE);
    expect(url.searchParams.get('realm')).toBe(REALM);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(fake().log.filter(([m]) => m === 'turn' || m === 'command' || m === 'create').length, 'the move sent something').toBe(before);
  });

  it('a message still on its way survives the move: lent, not resent; the dock closes once it has settled', async () => {
    const { R, eng, sid } = await settled();
    g.__hang = { turn: true, command: true };
    eng.send('and a chart');
    await vi.waitFor(() => expect(states(eng)).toContain('sending'), { timeout: 5000 });
    expect(eng.quiet()).toBe(false);
    const onClose = vi.fn();
    const router = await mount(eng, onClose);
    await act(async () => { button().click(); });
    await vi.waitFor(() => expect(where(router)).toContain(`/ai/c/${sid}`), { timeout: 5000 });
    // Not settled: the dock stays (its engine streams only while it shows), and the row is as it was.
    await act(async () => { await new Promise((r) => setTimeout(r, 150)); });
    expect(onClose, 'the dock closed over a message on its way').not.toHaveBeenCalled();
    expect(states(eng)).toContain('sending');
    // The AI page opening this reference is lent the dock's own engine: one engine, so the row cannot be sent twice.
    const h = R.openRef(ACCOUNT, { computer: HANDLE, realm: REALM, sid }, AT)!;
    expect(h.current(), 'the AI page got a second engine').toBe(eng);
    // The agent answers: the message is sent once, the turn ends, and the dock closes by itself.
    g.__hang = {};
    await act(async () => { for (const go of g.__held ?? []) go(); g.__held = []; });
    await vi.waitFor(() => expect(onClose).toHaveBeenCalledTimes(1), { timeout: 15000 });
    expect(sent('and a chart'), 'the message was not sent exactly once').toBe(1);
    expect(states(eng).every((x) => x === 'sent')).toBe(true);
    h.release();
  });

  it('after a rename the link names the computer by its current name, so the AI page finds it', async () => {
    const { eng, sid } = await settled();
    const onClose = vi.fn();
    const router = await mount(eng, onClose, ['ai'], 'atlas-2');
    await act(async () => { button().click(); });
    await vi.waitFor(() => expect(where(router)).toContain(`/ai/c/${sid}`), { timeout: 5000 });
    const url = new URL(where(router), 'https://hub.example');
    expect(url.searchParams.get('computer')).toBe(computerHandle({ ...AT, name: 'atlas-2' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('a leave confirmation holds the move: nothing closes while it asks, and a cancelled move leaves the dock open', async () => {
    const { eng } = await settled();
    const onClose = vi.fn();
    const router = await mount(eng, onClose);
    const h = hold(router);
    await act(async () => { button().click(); });
    await pause(100);
    expect(where(router)).toBe('/computers');
    expect(onClose, 'the dock closed before the page showed the conversation').not.toHaveBeenCalled();
    await act(async () => { h.answer(true); });
    await pause(100);
    expect(where(router)).toBe('/computers');
    expect(onClose, 'a cancelled move closed the dock').not.toHaveBeenCalled();
    h.unhold();
  });

  it('a cancelled move is over: reaching the same conversation later by another way closes nothing', async () => {
    const { eng, sid } = await settled();
    const onClose = vi.fn();
    const router = await mount(eng, onClose);
    const h = hold(router);
    await act(async () => { button().click(); });
    await pause(100);
    await act(async () => { h.answer(true); });
    await pause(100);
    h.unhold();
    expect(where(router)).toBe('/computers');
    // Not the press: the person opens that conversation themselves (a list row, a link), straight from where they stayed.
    await act(async () => { await router.navigate({ href: `/ai/c/${sid}` } as never); });
    await vi.waitFor(() => expect(where(router)).toContain(`/ai/c/${sid}`), { timeout: 5000 });
    await pause(150);
    expect(onClose, 'the cancelled press closed the dock later').not.toHaveBeenCalled();
  });

  it('a cancelled move, then a new conversation on its way: reaching the old one later leaves the dock open over the new one', async () => {
    const { eng, sid } = await settled();
    const onClose = vi.fn();
    const router = await mount(eng, onClose);
    const h = hold(router);
    await act(async () => { button().click(); });
    await pause(100);
    await act(async () => { h.answer(true); });
    await pause(100);
    h.unhold();
    // The dock moves on: a new conversation whose first message is still on its way.
    g.__hang = { create: true, turn: true, command: true };
    await act(async () => { eng.newConversation(); });
    await act(async () => { eng.send('a new question'); });
    await vi.waitFor(() => expect(eng.quiet()).toBe(false), { timeout: 5000 });
    expect(eng.session()).not.toBe(sid);
    await act(async () => { await router.navigate({ href: `/ai/c/${sid}` } as never); });
    await vi.waitFor(() => expect(where(router)).toContain(`/ai/c/${sid}`), { timeout: 5000 });
    await pause(150);
    expect(onClose, 'the old press closed the dock over the new conversation').not.toHaveBeenCalled();
    g.__hang = {};
    await act(async () => { for (const go of g.__held ?? []) go(); g.__held = []; });
  });

  it('a held move with a message on its way: once the person goes, the dock still closes when the message has settled', async () => {
    const { eng, sid } = await settled();
    g.__hang = { turn: true, command: true };
    eng.send('and a table');
    await vi.waitFor(() => expect(states(eng)).toContain('sending'), { timeout: 5000 });
    const onClose = vi.fn();
    const router = await mount(eng, onClose);
    const h = hold(router);
    await act(async () => { button().click(); });
    await pause(100);
    expect(onClose).not.toHaveBeenCalled();
    await act(async () => { h.answer(false); });
    await vi.waitFor(() => expect(where(router)).toContain(`/ai/c/${sid}`), { timeout: 5000 });
    await pause(100);
    expect(onClose, 'the dock closed over a message on its way').not.toHaveBeenCalled();
    g.__hang = {};
    await act(async () => { for (const go of g.__held ?? []) go(); g.__held = []; });
    await vi.waitFor(() => expect(onClose).toHaveBeenCalledTimes(1), { timeout: 15000 });
    expect(sent('and a table'), 'the message was not sent exactly once').toBe(1);
    h.unhold();
  });
});
