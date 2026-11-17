// Vitest (New script): Back keeps every field on every step.
// What → Where → Build → Back lands on Where with the address and the schedule kept; going back to What after a build
// keeps the description and the build: coming forward again starts no new attempt, and Check names what changed.
import { act, renderPage, screen, userEvent, waitFor } from '@app/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Answer = { outcome: string; data?: { reply: string }; code?: string };
const io = vi.hoisted(() => ({
  starts: [] as number[],
  ends: new Map<number, (a: Answer) => void>(),
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
    useBuildApi: () => ({
      start: (_b: unknown, _d: string, n: number) => { io.starts.push(n); return new Promise((res) => io.ends.set(n, res)); },
      check: async () => null,
      cancel: async () => true,
      discard: async () => 'ok',
    }),
    useBoundSends: () => ({ shown: true, validate: async () => ({ outcome: 'done', data: { publishable: true, results: { dependencies: {} } } }) }),
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
const describeBox = () => screen.getByRole('textbox', { name: strings['flow.what.describe'] }) as HTMLTextAreaElement;
const address = () => screen.getByRole('textbox', { name: strings['new.address'] }) as HTMLInputElement;
const REPLY = 'Summary: Counts sign-ups.\n```ts\nexport default () => new Response("42");\n```\n';

async function toWhere() {
  const user = userEvent.setup();
  const r = await renderPage(page, { state: 'many', path: '/scripts/new/aaaaaaaaaa' });
  await user.type(await screen.findByRole('textbox', { name: strings['flow.what.describe'] }, SLOW), 'Count sign-ups');
  await user.click(btn('flow.continue'));
  await waitFor(() => expect(loc(r)).toMatch(/step=where/));
  await user.clear(address());
  await user.type(address(), '/signups');
  await user.click(screen.getByRole('radio', { name: new RegExp(`^${strings['flow.where.alsoSchedule']}`) }));
  return { r, user };
}

beforeEach(async () => {
  clearDrafts(); mintDraft('aaaaaaaaaa');
  await clearScriptStore();
  io.starts.length = 0;
  io.ends.clear();
});

describe('New script flow: Back', () => {
  it('What → Where → Build → Back lands on Where with the address and the schedule kept', async () => {
    const { r, user } = await toWhere();
    await user.click(btn('flow.where.build'));
    await waitFor(() => expect(loc(r)).toMatch(/step=build/));
    r.router.history.back();
    await waitFor(() => expect(loc(r)).toMatch(/step=where/));
    expect(address().value).toBe('/signups');
    expect((screen.getByRole('radio', { name: new RegExp(`^${strings['flow.where.alsoSchedule']}`) }) as HTMLInputElement).checked).toBe(true);
    // The footer's Back walks the same way: Where → What keeps the description.
    // Exactly "Back": the step strip's done steps are buttons named "Go back to step N: …".
    await user.click(screen.getByRole('button', { name: 'Back' }));
    await waitFor(() => expect(loc(r)).toBe('/scripts/new/aaaaaaaaaa'));
    expect(describeBox().value).toBe('Count sign-ups');
  });

  it('back to What after a build keeps it: forward again starts no new attempt, and Check names the changed description', async () => {
    const { r, user } = await toWhere();
    await user.click(btn('flow.where.build'));
    await waitFor(() => expect(io.starts).toEqual([1]));
    await act(async () => { io.ends.get(1)?.({ outcome: 'done', data: { reply: REPLY } }); });
    await screen.findByText(strings['flow.built.ready'], undefined, SLOW);
    r.router.history.back();
    r.router.history.back();
    await waitFor(() => expect(loc(r)).toBe('/scripts/new/aaaaaaaaaa'));
    expect(describeBox().value).toBe('Count sign-ups');
    await user.type(describeBox(), ' each week');
    await user.click(btn('flow.continue'));
    await waitFor(() => expect(loc(r)).toMatch(/step=where/));
    expect(address().value).toBe('/signups');
    await user.click(btn('flow.where.build'));
    await waitFor(() => expect(loc(r)).toMatch(/step=build/));
    // The written attempt is kept, not replaced behind the person's back.
    expect(screen.getByText(strings['flow.built.ready'])).toBeTruthy();
    expect(io.starts).toEqual([1]);
    await user.click(btn('flow.built.checkIt'));
    expect(await screen.findByText(strings['flow.check.changed'].replace('{{what}}', strings['flow.check.input.description']), undefined, SLOW)).toBeTruthy();
  });

  it('the write way: Back from Check to Write keeps the code; Back to Where keeps the address', async () => {
    const user = userEvent.setup();
    const r = await renderPage(page, { state: 'many', path: '/scripts/new/aaaaaaaaaa' });
    await user.click(await screen.findByRole('button', { name: new RegExp(strings['flow.what.writeCard']) }, SLOW));
    await user.clear(await screen.findByRole('textbox', { name: strings['new.address'] }, SLOW));
    await user.type(address(), '/notes');
    await user.click(btn('flow.continue'));
    await waitFor(() => expect(loc(r)).toMatch(/step=write/));
    const code = () => screen.getByRole('textbox', { name: strings['new.code'] }) as HTMLTextAreaElement;
    await user.clear(code());
    await user.type(code(), 'export default () => new Response("n");');
    await user.click(btn('flow.continue'));
    await waitFor(() => expect(loc(r)).toMatch(/step=check/));
    r.router.history.back();
    await waitFor(() => expect(loc(r)).toMatch(/step=write/));
    expect(code().value).toBe('export default () => new Response("n");');
    r.router.history.back();
    await waitFor(() => expect(loc(r)).toMatch(/step=where/));
    expect(address().value).toBe('/notes');
  });
});
