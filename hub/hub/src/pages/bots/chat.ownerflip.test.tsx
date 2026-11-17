// Vitest: a chat app's Setup drops the lines of an earlier code press once the app gets its owner. Before, a refused cancel
// (or "the code no longer works") came back in Setup when the owner was removed later and the app waited for an owner again,
// though it was about a code from before.
// eslint-disable-next-line no-restricted-imports -- a router harness for the drawer's URL state, not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, render, screen, userEvent } from '@app/testing';
import { CoreQueryProvider } from '@core';
import { useRef, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetCodesForTests } from './codes';
import type { BotView, Change, Channel, ChannelChange, ChannelSettings, ChannelVars, Right } from './data';
import { ChatAppsTab } from './parts/ChatAppsTab';

// The read sent now that confirms a used owner code: what the agent lists as owners when it answers, undefined for a
// read that failed or did not answer. Unset, it never answers anything, as with no list read on screen.
let fresh: () => Promise<string[] | undefined> = async () => undefined;
const freshCalls: unknown[][] = [];
vi.mock('./data', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  freshOwnerIds: (...a: unknown[]) => { freshCalls.push(a); return fresh(); },
}));
import strings from './strings.en.json';

afterEach(() => {
  resetCodesForTests();
  ownersNow = [owner];
  fresh = async () => undefined;
  freshCalls.length = 0;
  gate = null;
  held = null;
});

const bot = { key: 'c1~global~chief', uid: 'u-chief', id: 'chief', name: 'Chief' } as unknown as BotView;
const owner = { id: 'pr-1', platformUser: '1001', name: 'Ana', rights: ['chat'] as Right[], owner: true, lang: '' };
// The owners the next owned read lists (a test may add a row whose id is unreadable).
let ownersNow = [owner];
const app = (owned: boolean): Channel => ({
  id: 'ch-x', kind: 'telegram', label: 'X', enabled: true, state: owned ? 'running' : 'needs_owner', needsOwner: !owned, people: owned ? 1 : 0, chats: 0, homeChat: null, reason: '',
  principals: owned ? ownersNow : [], chatRows: [], view: { settings: {}, effective: { dm_policy: { value: 'pairing', source: 'channel' } } }, notes: [],
});
let answer: { outcome: string; code?: string } = { outcome: 'not_sent', code: 'READ_BACK_FIRST' };
// When set, the next send waits for the test to answer it (to land its answer in the same batch as an ownership change).
let gate: Promise<void> | null = null;
type Answer = { outcome: string; code?: string };
// When set, every send waits in this queue until the test answers it, one by one and in any order.
let held: ((a: Answer) => void)[] | null = null;
const answerSend = (i: number, a: Answer) => {
  const send = held?.[i];
  if (!send) throw new Error(`no send ${i} is waiting`);
  send(a);
};
const change = {
  run: async () => {
    if (held) {
      const queue = held;
      return new Promise<Answer>((r) => queue.push(r));
    }
    if (gate) await gate;
    return answer;
  }, outcome: 'idle', data: undefined, code: undefined, details: undefined, idem: undefined, running: false,
  readBack: async () => true, dismiss: () => undefined, reset: () => undefined,
} as unknown as Change<ChannelChange, ChannelVars>;
const pause = { ...change } as unknown as Change<unknown, { paused: boolean }>;
const settings = { ok: true, paused: false } as unknown as ChannelSettings;

let setOwned: (o: boolean) => void = () => undefined;
// A new read of the same list (a new object), and a read that failed: the page keeps the last list it had.
let reread: () => void = () => undefined;
let keepLast: () => void = () => undefined;
function Live({ first = false }: { first?: boolean }) {
  const [owned, set] = useState(first);
  const [, setReads] = useState(0);
  const [keep, setKeep] = useState(false);
  const last = useRef<Channel[] | null>(null);
  setOwned = set;
  reread = () => setReads((n) => n + 1);
  keepLast = () => setKeep(true);
  const list = keep && last.current ? last.current : [app(owned)];
  last.current = list;
  return <ChatAppsTab bot={bot} channels={list} settings={settings} loading={false} change={change} pause={pause} />;
}
async function show(owned = false) {
  const router = createRouter({ routeTree: createRootRoute({ component: () => <Live first={owned} /> }), history: createMemoryHistory({ initialEntries: ['/bots?app=ch-x'] }) });
  await act(async () => {
    render(<CoreQueryProvider><RouterProvider router={router} /></CoreQueryProvider>);
    await router.load();
  });
}

describe('Setup of a chat app waiting for its owner', () => {
  it('a refused cancel does not come back after the app had an owner and lost it', async () => {
    answer = { outcome: 'not_sent', code: 'READ_BACK_FIRST' };
    await show();
    await userEvent.click(await screen.findByRole('button', { name: strings['chan.cancelCode'] }));
    expect(await screen.findByText(strings['chan.press.cancelNotSent'])).toBeInTheDocument();
    act(() => setOwned(true));
    expect(screen.queryByRole('button', { name: strings['chan.cancelCode'] })).toBeNull();
    act(() => setOwned(false));
    expect(await screen.findByRole('button', { name: strings['chan.cancelCode'] })).toBeInTheDocument();
    expect(screen.queryByText(strings['chan.press.cancelNotSent'])).toBeNull();
  });

  it('"the code no longer works" does not come back either', async () => {
    answer = { outcome: 'done' };
    await show();
    await userEvent.click(await screen.findByRole('button', { name: strings['chan.cancelCode'] }));
    expect(await screen.findByText(strings['chan.codeCancelled'])).toBeInTheDocument();
    act(() => setOwned(true));
    act(() => setOwned(false));
    expect(await screen.findByRole('button', { name: strings['chan.cancelCode'] })).toBeInTheDocument();
    expect(screen.queryByText(strings['chan.codeCancelled'])).toBeNull();
  });

  it('a refusal that lands in the same update as the ownership change stays: it is the current press', async () => {
    // The app has its owner; People makes an invite, and the agent's refusal arrives with the owner list that turns the app ownerless.
    answer = { outcome: 'not_sent', code: 'READ_BACK_FIRST' };
    let release: () => void = () => undefined;
    gate = new Promise<void>((r) => (release = r));
    await show(true);
    await userEvent.click(await screen.findByRole('button', { name: strings['chan.rail.people'] }));
    await userEvent.click(await screen.findByRole('button', { name: strings['chan.invite.go'] }));
    await act(async () => {
      release();
      setOwned(false);
      await gate;
    });
    expect(await screen.findByText(strings['chan.press.issueNotSent'])).toBeInTheDocument();
  });

  it('a refusal stays when the ownership change commits in its own update right after it: still the current press', async () => {
    // The same refusal and owner list as above, but React commits them one after the other.
    answer = { outcome: 'not_sent', code: 'READ_BACK_FIRST' };
    await show(true);
    await userEvent.click(await screen.findByRole('button', { name: strings['chan.rail.people'] }));
    await userEvent.click(await screen.findByRole('button', { name: strings['chan.invite.go'] }));
    expect(await screen.findByText(strings['chan.press.issueNotSent'])).toBeInTheDocument();
    act(() => setOwned(false));
    expect(screen.getByText(strings['chan.press.issueNotSent'])).toBeInTheDocument();
  });

  it('that refusal goes once the owner changes again: it never comes back with the owner it was pressed under', async () => {
    answer = { outcome: 'not_sent', code: 'READ_BACK_FIRST' };
    await show(true);
    await userEvent.click(await screen.findByRole('button', { name: strings['chan.rail.people'] }));
    await userEvent.click(await screen.findByRole('button', { name: strings['chan.invite.go'] }));
    expect(await screen.findByText(strings['chan.press.issueNotSent'])).toBeInTheDocument();
    act(() => setOwned(false));
    act(() => setOwned(true));
    expect(screen.queryByText(strings['chan.press.issueNotSent'])).toBeNull();
  });

  it('a press made after an ownership change keeps its own refusal through the next change', async () => {
    answer = { outcome: 'not_sent', code: 'READ_BACK_FIRST' };
    await show(true);
    act(() => setOwned(false));
    act(() => setOwned(true));
    await userEvent.click(await screen.findByRole('button', { name: strings['chan.rail.people'] }));
    await userEvent.click(await screen.findByRole('button', { name: strings['chan.invite.go'] }));
    expect(await screen.findByText(strings['chan.press.issueNotSent'])).toBeInTheDocument();
    act(() => setOwned(false));
    expect(screen.getByText(strings['chan.press.issueNotSent'])).toBeInTheDocument();
  });

  it('a refusal that answers only after the owner changed twice shows nothing: it is about a code from before', async () => {
    held = [];
    await show(true);
    await userEvent.click(await screen.findByRole('button', { name: strings['chan.rail.people'] }));
    await userEvent.click(await screen.findByRole('button', { name: strings['chan.invite.go'] }));
    expect(held).toHaveLength(1);
    act(() => setOwned(false));
    act(() => setOwned(true));
    await act(async () => answerSend(0, { outcome: 'not_sent', code: 'READ_BACK_FIRST' }));
    expect(screen.queryByText(strings['chan.press.issueNotSent'])).toBeNull();
  });

  it('a cancel that answers only after the owner changed twice does not say the code no longer works', async () => {
    held = [];
    await show();
    await userEvent.click(await screen.findByRole('button', { name: strings['chan.cancelCode'] }));
    expect(held).toHaveLength(1);
    act(() => setOwned(true));
    act(() => setOwned(false));
    await act(async () => answerSend(0, { outcome: 'done' }));
    expect(await screen.findByRole('button', { name: strings['chan.cancelCode'] })).toBeInTheDocument();
    expect(screen.queryByText(strings['chan.codeCancelled'])).toBeNull();
  });

  it('an older press that answers after a newer one was made shows nothing; the newer press keeps its own line', async () => {
    held = [];
    await show(true);
    await userEvent.click(await screen.findByRole('button', { name: strings['chan.rail.people'] }));
    await userEvent.click(await screen.findByRole('button', { name: strings['chan.invite.go'] }));
    act(() => setOwned(false));
    await userEvent.click(await screen.findByRole('button', { name: strings['chan.invite.go'] }));
    expect(held).toHaveLength(2);
    await act(async () => answerSend(0, { outcome: 'not_sent', code: 'READ_BACK_FIRST' }));
    expect(screen.queryByText(strings['chan.press.issueNotSent'])).toBeNull();
    await act(async () => answerSend(1, { outcome: 'not_sent', code: 'READ_BACK_FIRST' }));
    expect(await screen.findByText(strings['chan.press.issueNotSent'])).toBeInTheDocument();
    act(() => setOwned(true));
    expect(screen.getByText(strings['chan.press.issueNotSent'])).toBeInTheDocument();
    act(() => setOwned(false));
    expect(screen.queryByText(strings['chan.press.issueNotSent'])).toBeNull();
  });
});

// An owner code works once. The agent refuses an owner code while the app has an owner, and the first owner
// comes only from an owner code, so an owner the drawer had not seen when it issued the code proves that code was used.
describe('a held owner code after an owner paired', () => {
  const issue = async () => {
    answer = { outcome: 'done', data: { demo: { code: 'OWNR-7K', expiresAt: 0 } } } as unknown as Answer;
    await userEvent.click(await screen.findByRole('button', { name: strings['chan.ownerCode'] }));
    expect(await screen.findByText(strings['chan.codeNote'])).toBeInTheDocument();
  };
  const codeShown = () => screen.queryByText(strings['chan.codeNote']) !== null;

  it('a new owner paired with it, then was removed: the used code is gone, and Setup says so and offers a new one', async () => {
    await show();
    await issue();
    // the read sent now still lists the new owner
    fresh = async () => [owner.id];
    act(() => setOwned(true));
    act(() => setOwned(false));
    expect(await screen.findByText(strings['chan.code.used'])).toBeInTheDocument();
    expect(codeShown()).toBe(false);
    // one confirming read, of this Bot's app
    expect(freshCalls).toEqual([[bot.key, 'ch-x']]);
    // the next step is the owner's own press: nothing is issued for them
    expect(screen.getByRole('button', { name: strings['chan.ownerCode'] })).toBeEnabled();
  });

  it('a read sent before the issue lands after it with an owner removed before the agent took the issue: the code still works and shows', async () => {
    await show();
    await issue();
    // the read sent now lists no owner: the one on screen came from the older read
    fresh = async () => [];
    act(() => setOwned(true));
    act(() => setOwned(false));
    await act(async () => undefined);
    expect(freshCalls).toHaveLength(1);
    expect(codeShown()).toBe(true);
    expect(screen.queryByText(strings['chan.code.used'])).toBeNull();
  });

  it('the confirming read failed: nothing is proved, and the code shows', async () => {
    await show();
    await issue();
    fresh = async () => undefined;
    act(() => setOwned(true));
    act(() => setOwned(false));
    await act(async () => undefined);
    expect(freshCalls).toHaveLength(1);
    expect(codeShown()).toBe(true);
    expect(screen.queryByText(strings['chan.code.used'])).toBeNull();
  });

  it('a new code issued while the confirming read was out is not dropped by that read', async () => {
    await show();
    await issue();
    let land: (ids: string[]) => void = () => undefined;
    fresh = () => new Promise<string[]>((r) => { land = r; });
    act(() => setOwned(true));
    act(() => setOwned(false));
    expect(freshCalls).toHaveLength(1);
    // before the read answers, the owner cancels the code and presses for a new one; then the read answers with the owner
    // who used the old one
    answer = { outcome: 'done' };
    await userEvent.click(screen.getByRole('button', { name: strings['chan.cancelCode'] }));
    answer = { outcome: 'done', data: { demo: { code: 'OWNR-8M', expiresAt: 0 } } } as unknown as Answer;
    await userEvent.click(await screen.findByRole('button', { name: strings['chan.ownerCode'] }));
    expect(await screen.findByText(strings['chan.codeNote'])).toBeInTheDocument();
    await act(async () => land([owner.id]));
    expect(codeShown()).toBe(true);
    expect(screen.queryByText(strings['chan.code.used'])).toBeNull();
  });

  it('still valid: more reads of the ownerless app keep the code shown', async () => {
    await show();
    await issue();
    act(() => reread());
    act(() => reread());
    expect(codeShown()).toBe(true);
    expect(screen.queryByText(strings['chan.code.used'])).toBeNull();
  });

  it('a read that failed keeps the last list, and the code with it', async () => {
    await show();
    await issue();
    act(() => keepLast());
    act(() => reread());
    expect(codeShown()).toBe(true);
    expect(screen.queryByText(strings['chan.code.used'])).toBeNull();
  });

  it('an owner already seen before the issue proves nothing (a read older than the issue): the code shows again', async () => {
    await show(true);
    act(() => setOwned(false));
    await issue();
    // even a read sent now that lists them
    fresh = async () => [owner.id];
    act(() => setOwned(true));
    act(() => setOwned(false));
    expect(await screen.findByText(strings['chan.codeNote'])).toBeInTheDocument();
    expect(screen.queryByText(strings['chan.code.used'])).toBeNull();
  });

  it('an owner row without an id proves nothing either: beside an owner seen before, the code shows again', async () => {
    await show(true);
    act(() => setOwned(false));
    await issue();
    fresh = async () => [owner.id];
    ownersNow = [owner, { ...owner, id: '', platformUser: '1009', name: 'Unread' }];
    act(() => setOwned(true));
    act(() => setOwned(false));
    expect(await screen.findByText(strings['chan.codeNote'])).toBeInTheDocument();
    expect(screen.queryByText(strings['chan.code.used'])).toBeNull();
  });
});
