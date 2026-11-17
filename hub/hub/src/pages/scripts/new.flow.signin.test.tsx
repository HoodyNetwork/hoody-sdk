// Vitest (New script, "Agent sign-in needed"): on the AI way Build it goes through the
// shared sign-in press: with the agent signed out and the box not ticked nothing is sent; when the press may go, it signs
// in first and the build starts only from the press, never beside it.
import { renderPage, screen, userEvent, waitFor } from '@app/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const io = vi.hoisted(() => ({
  canPress: false,
  presses: 0,
  send: null as null | (() => void),
  starts: [] as number[],
  /** What the place passed the box as its own press being blocked (Try again follows it). */
  blocked: [] as Array<string | undefined>,
}));

vi.mock('./parts/AgentSignIn', () => ({
  useAgentSignIn: (_comp: unknown, send: () => void) => {
    io.send = send;
    return { box: 'offer', offered: true, checked: io.canPress, setChecked: () => undefined, canPress: io.canPress, busy: false, pressing: false, shown: null, press: async () => { io.presses++; io.send?.(); }, check: async () => undefined };
  },
  AgentSignIn: (p: { blocked?: string }) => { io.blocked.push(p.blocked); return null; },
  // The idea way's own view of the sign-in (Flow.tsx reads it on every way): nothing to show here, and it never sends.
  useAgentSignInOnly: () => ({ box: 'none', offered: false, checked: false, setChecked: () => undefined, canPress: false, busy: false, pressing: false, shown: null, press: async () => undefined, check: async () => undefined }),
  IdeaSignIn: () => null,
  rereadAgentStatus: () => undefined,
}));
vi.mock('./data', async (orig) => {
  const real = await orig<Record<string, unknown>>();
  const fx = await import('./new/flowfix');
  return {
    ...real,
    useAskStore: () => 0,
    useOverview: fx.overviewOf([fx.comp(fx.ATLAS, 'atlas', 'a.00a1', 'n1'), fx.comp(fx.BOREALIS, 'borealis', 'b.00b2', 'n2')]),
    useScriptsTarget: () => fx.targetOf(fx.shown.id),
    useResolve: () => ({ mutateAsync: async () => ({ outcome: 'done', data: { matched: false } }) }),
    useBuildApi: () => ({ start: (_b: unknown, _d: string, n: number) => { io.starts.push(n); return new Promise(() => undefined); }, check: async () => null, cancel: async () => true, discard: async () => 'ok' }),
  };
});

import page from './page';
import { clearDrafts } from './new/draft';
import { mintDraft } from './new/Flow';
import { clearScriptStore } from './new/flowfix';
import strings from './strings.en.json';

// A loaded host can take seconds to show a page: finds wait up to the test's own timeout.
const SLOW = { timeout: 14000 };

const loc = (r: { router: { state: { location: { pathname: string; searchStr: string } } } }) => r.router.state.location.pathname + r.router.state.location.searchStr;
const btn = (key: keyof typeof strings) => screen.getByRole('button', { name: strings[key] });

async function toWhere() {
  const user = userEvent.setup();
  const r = await renderPage(page, { state: 'many', path: '/scripts/new/aaaaaaaaaa' });
  await user.type(await screen.findByRole('textbox', { name: strings['flow.what.describe'] }, SLOW), 'Count sign-ups');
  await user.click(btn('flow.continue'));
  await waitFor(() => expect(loc(r)).toMatch(/step=where/));
  const address = screen.getByRole('textbox', { name: strings['new.address'] });
  await user.clear(address);
  await user.type(address, '/signups');
  return { r, user };
}

beforeEach(async () => {
  clearDrafts(); mintDraft('aaaaaaaaaa');
  await clearScriptStore();
  io.canPress = false;
  io.presses = 0;
  io.starts.length = 0;
  io.blocked.length = 0;
});

describe('New script flow: agent sign-in on Build it', () => {
  it('Try again follows Build it: blocked while Where is not done, free once it is', async () => {
    io.canPress = true;
    const { user } = await toWhere();
    await waitFor(() => expect(io.blocked.at(-1)).toBe(''));
    await user.clear(screen.getByRole('textbox', { name: strings['new.address'] }));
    await waitFor(() => expect(io.blocked.at(-1)).toBe(strings['retryWhy.where']));
  });

  it('the box not ticked: Build it sends nothing and stays on Where', async () => {
    const { r, user } = await toWhere();
    await user.click(btn('flow.where.build'));
    expect(io.presses).toBe(0);
    expect(io.starts).toEqual([]);
    expect(loc(r)).toMatch(/step=where/);
  });

  it('when the press may go, Build it is the press: the build starts from it', async () => {
    io.canPress = true;
    const { r, user } = await toWhere();
    await user.click(btn('flow.where.build'));
    await waitFor(() => expect(loc(r)).toMatch(/step=build/));
    expect(io.presses).toBe(1);
    expect(io.starts).toEqual([1]);
  });
});
