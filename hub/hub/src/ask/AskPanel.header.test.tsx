// The header's New conversation is disabled while a message is on its way, and says why
// (it stays focusable: the kit's IconButton with a description); it acts again once the message is sent.
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup } from '@testing-library/react';
import { ShellDataProvider, type ShellData } from '../shell/context';
import { Header, type HeaderProps } from './AskPanel';
import { AskEngine, resetSignHoldsForTests, type Slot, type StoreIO } from './engine';
import { FakeAgent, manualClock } from './fake';
import type { AskStore } from './logic';
import strings from './strings.en.json';

afterEach(() => { cleanup(); resetSignHoldsForTests(); });

const REALM = 'f1f1f1f1f1f1f1f1f1f1f1f1';
const slot: Slot = { account: '64f0ada00000000000000001', project: 'p1', computer: 'c1', realm: REALM, name: 'atlas' };
const t = ((k: string) => (strings as Record<string, string>)[k] ?? k) as unknown as HeaderProps['t'];

async function mount(el: ReactElement) {
  const data: ShellData = { realms: [], realmId: 'r1', computers: [] };
  const Component = () => <ShellDataProvider value={data}>{el}</ShellDataProvider>;
  const router = createRouter({ routeTree: createRootRoute({ component: Component }), history: createMemoryHistory({ initialEntries: ['/home'] }) });
  await act(async () => { render(<RouterProvider router={router} />); await router.load(); });
}
async function engine() {
  const clock = manualClock();
  const agent = new FakeAgent({ account: slot.account, pace: 10, realms: [REALM] }, clock);
  let st: AskStore = { v: 1, a: {} };
  const store: StoreIO = { read: () => JSON.parse(JSON.stringify(st)), write: (_a, s) => { if (s) st = JSON.parse(JSON.stringify(s)); } };
  const eng = new AskEngine(slot, agent, store, clock);
  const flush = async (ms = 0) => {
    const drain = async () => { for (let i = 0; i < 20; i++) { await Promise.resolve(); clock.run(0); } };
    await drain();
    for (let left = ms; left > 0; left -= 10) { clock.run(Math.min(10, left)); await drain(); }
  };
  eng.open();
  await flush();
  return { eng, agent, flush };
}
const header = (eng: AskEngine) => <Header t={t} phone={false} onClose={() => {}} realmName="Realm" computer="" computerHref="" eng={eng} snap={eng.getSnapshot()} agentUrl="" />;

describe('the header\'s New conversation while a message is on its way', () => {
  it('is aria-disabled with the reason, and pressing it leaves the sending row', async () => {
    const { eng, agent } = await engine();
    const host = agent as unknown as Record<string, unknown>;
    host.create = () => new Promise(() => {});   // the create never answers: the first message stays on its way
    eng.send('hi');
    await mount(header(eng));
    const btn = screen.getByRole('button', { name: strings['ask.new'] });
    expect(btn.getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByText(strings['ask.newWait'])).toBeTruthy();
    await act(async () => { btn.click(); });
    expect(Object.values(eng.getSnapshot().conv.users).map((u) => u.state)).toEqual(['sending']);
  });

  it('with nothing on its way, New is enabled and has no reason', async () => {
    const { eng } = await engine();
    await mount(header(eng));
    const btn = screen.getByRole('button', { name: strings['ask.new'] });
    expect(btn.getAttribute('aria-disabled')).toBeNull();
    expect(btn.hasAttribute('disabled')).toBe(false);
    expect(screen.queryByText(strings['ask.newWait'])).toBeNull();
  });
});
