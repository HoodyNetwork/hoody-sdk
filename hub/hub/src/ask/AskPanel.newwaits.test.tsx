// Every New conversation button (header, the gone conversation's, the too-long failure's) is soft-disabled with the
// header's reason while a first message is on its way, and acts again once that message is sent; the header re-enables
// from the live snapshot, not a captured one.
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, cleanup, render, screen } from '@testing-library/react';
import { useSyncExternalStore, type ReactElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { ShellDataProvider, type ShellData } from '../shell/context';
import { Blocked, Header, type HeaderProps } from './AskPanel';
import { FailureExtras } from './Column';
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
/** The first message stays on its way until release() lets the create answer. */
function holdCreate(agent: FakeAgent): () => void {
  const host = agent as unknown as Record<string, unknown>;
  const real = (host.create as (...a: unknown[]) => Promise<unknown>).bind(agent);
  let release: () => void = () => {};
  host.create = (...a: unknown[]) => new Promise((res, rej) => { release = () => { real(...a).then(res, rej); }; });
  return () => release();
}
const newBtn = () => screen.getByRole('button', { name: strings['ask.new'] });
const sendingStates = (eng: AskEngine) => Object.values(eng.getSnapshot().conv.users).map((u) => u.state);

describe('the gone conversation\'s and the too-long failure\'s New while a first message is on its way', () => {
  it('ask.gone: New is aria-disabled with the header\'s reason, and pressing it leaves the sending row', async () => {
    const { eng, agent } = await engine();
    holdCreate(agent);
    eng.send('hi');
    await mount(<Blocked b={{ key: 'ask.gone', act: 'retry', tone: 'warn', agent: false }} eng={eng} computer="c1" agentUrl="" t={t} />);
    const btn = newBtn();
    expect(btn.getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByText(strings['ask.newWait'])).toBeTruthy();
    await act(async () => { btn.click(); });
    expect(sendingStates(eng)).toEqual(['sending']);
  });

  it('ask.tooLong: New is aria-disabled with the header\'s reason, and pressing it leaves the sending row', async () => {
    const { eng, agent } = await engine();
    holdCreate(agent);
    eng.send('hi');
    await mount(<FailureExtras kind="ask.tooLong" ended eng={eng} t={t} />);
    const btn = newBtn();
    expect(btn.getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByText(strings['ask.newWait'])).toBeTruthy();
    await act(async () => { btn.click(); });
    expect(sendingStates(eng)).toEqual(['sending']);
  });

  it('with nothing on its way, both are enabled, carry no reason, and start a new conversation', async () => {
    for (const el of [
      (eng: AskEngine) => <Blocked b={{ key: 'ask.gone', act: 'retry', tone: 'warn', agent: false }} eng={eng} computer="c1" agentUrl="" t={t} />,
      (eng: AskEngine) => <FailureExtras kind="ask.tooLong" ended eng={eng} t={t} />,
    ]) {
      const { eng, flush } = await engine();
      eng.send('first');
      await flush(2000);
      expect(eng.newWaits()).toBe(false);
      const before = eng.getSnapshot().conv;
      await mount(el(eng));
      const btn = newBtn();
      expect(btn.getAttribute('aria-disabled')).toBeNull();
      expect(screen.queryByText(strings['ask.newWait'])).toBeNull();
      await act(async () => { btn.click(); });
      expect(eng.getSnapshot().conv).not.toBe(before);
      expect(Object.keys(eng.getSnapshot().conv.users)).toEqual([]);
      cleanup();
    }
  });
});

describe('the header\'s New follows the live snapshot', () => {
  function LiveHeader({ eng }: { eng: AskEngine }) {
    const snap = useSyncExternalStore(eng.subscribe, eng.getSnapshot);
    return <Header t={t} phone={false} onClose={() => {}} realmName="Realm" computer="" computerHref="" eng={eng} snap={snap} agentUrl="" />;
  }
  it('is disabled while the first message is on its way and enabled again once it is sent, without a remount', async () => {
    const { eng, agent, flush } = await engine();
    const release = holdCreate(agent);
    eng.send('hi');
    await mount(<LiveHeader eng={eng} />);
    expect(newBtn().getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByText(strings['ask.newWait'])).toBeTruthy();
    await act(async () => { release(); await flush(2000); });
    expect(eng.newWaits()).toBe(false);
    expect(newBtn().getAttribute('aria-disabled')).toBeNull();
    expect(screen.queryByText(strings['ask.newWait'])).toBeNull();
  });
});

// The waiting New (ReasonButton) and the live one (Button) are different elements; a
// keyboard user on New keeps the focus when the send settles and it becomes the live button.
describe('New keeps the focus when the first message is sent', () => {
  function Live({ eng, el }: { eng: AskEngine; el: (eng: AskEngine) => ReactElement }) {
    useSyncExternalStore(eng.subscribe, eng.getSnapshot);
    return el(eng);
  }
  for (const [name, el] of [
    ['ask.gone', (eng: AskEngine) => <Blocked b={{ key: 'ask.gone', act: 'retry', tone: 'warn', agent: false }} eng={eng} computer="c1" agentUrl="" t={t} />],
    ['ask.tooLong', (eng: AskEngine) => <FailureExtras kind="ask.tooLong" ended eng={eng} t={t} />],
  ] as const) {
    it(`${name}: focus on the waiting New moves to the live New once the send settles`, async () => {
      const { eng, agent, flush } = await engine();
      const release = holdCreate(agent);
      eng.send('hi');
      await mount(<Live eng={eng} el={el} />);
      const waiting = newBtn();
      expect(waiting.getAttribute('aria-disabled')).toBe('true');
      act(() => waiting.focus());
      expect(document.activeElement).toBe(waiting);
      await act(async () => { release(); await flush(2000); });
      expect(eng.newWaits()).toBe(false);
      const live = newBtn();
      expect(live.getAttribute('aria-disabled')).toBeNull();
      expect(document.activeElement).toBe(live);
    });
  }
  it('focus that left New for another control stays there when the send settles', async () => {
    const { eng, agent, flush } = await engine();
    const release = holdCreate(agent);
    eng.send('hi');
    await mount(<><Live eng={eng} el={(e) => <FailureExtras kind="ask.tooLong" ended eng={e} t={t} />} /><button type="button">elsewhere</button></>);
    act(() => newBtn().focus());
    const other = screen.getByRole('button', { name: 'elsewhere' });
    act(() => other.focus());
    await act(async () => { release(); await flush(2000); });
    expect(document.activeElement).toBe(other);
  });
});
