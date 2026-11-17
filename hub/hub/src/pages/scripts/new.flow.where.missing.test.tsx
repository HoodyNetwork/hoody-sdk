// Vitest (New script, step 2 "Where it answers"): Continue pressed with the address box emptied. The press does not leave
// the step (as before) and now says why at the address field: the flow hands its `missing` flag to the step. Typing an
// address takes the words away. Replaced: as new.flow.where.test.tsx (the overview and the address check).
import { renderPage, screen, userEvent, waitFor } from '@app/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const io = vi.hoisted(() => ({
  files: [] as string[],
  hold: false,
  held: new Map<string, () => void>(),
  colours: {} as Record<string, string>,
}));

vi.mock('@core', async (orig) => {
  const real = await orig<Record<string, unknown> & { useComputersAll: (o?: unknown) => { rows?: Array<Record<string, unknown>> } }>();
  return {
    ...real,
    useComputersAll: (o?: unknown) => {
      const all = real.useComputersAll(o);
      return { ...all, rows: all.rows?.map((r) => (typeof r.name === 'string' && r.name in io.colours ? { ...r, color: io.colours[r.name] } : r)) };
    },
  };
});

vi.mock('./data', async (orig) => {
  const real = await orig<Record<string, unknown>>();
  const fx = await import('./new/flowfix');
  const answer = (p: string) => {
    const file = io.files.find((f) => f === `default/1${p}.ts`);
    return { outcome: 'done', data: file ? { matched: true, scriptPath: file, type: 'static' } : { matched: false } };
  };
  return {
    ...real,
    useAskStore: () => 0,
    useOverview: fx.overviewOf([fx.comp(fx.ATLAS, 'atlas', 'a.00a1', 'n1'), fx.comp(fx.BOREALIS, 'borealis', 'b.00b2', 'n2')]),
    useScriptsTarget: () => fx.targetOf(fx.shown.id),
    useResolve: () => ({
      mutateAsync: (v: { path: string }) => (io.hold ? new Promise((res) => { io.held.set(v.path, () => res(answer(v.path))); }) : Promise.resolve(answer(v.path))),
    }),
  };
});

import page from './page';
import { clearDrafts } from './new/draft';
import { mintDraft } from './new/Flow';
import * as fx from './new/flowfix';
import strings from './strings.en.json';

// A loaded host can take seconds to show a page: finds wait up to the test's own timeout.
const SLOW = { timeout: 14000 };

const btn = (k: keyof typeof strings) => screen.getByRole('button', { name: strings[k] });
const loc = (r: { router: { state: { location: { pathname: string; searchStr: string } } } }) => r.router.state.location.pathname + r.router.state.location.searchStr;

/** The flow on Where by the write way (no description needed), its address field returned. */
async function toWhere() {
  const user = userEvent.setup();
  const r = await renderPage(page, { state: 'many', path: '/scripts/new/aaaaaaaaaa' });
  await user.click(await screen.findByRole('button', { name: new RegExp(strings['flow.what.writeCard']) }, SLOW));
  const address = (await screen.findByRole('textbox', { name: strings['new.address'] }, SLOW)) as HTMLInputElement;
  return { r, user, address };
}

beforeEach(() => {
  clearDrafts(); mintDraft('aaaaaaaaaa');
  fx.shown.id = fx.ATLAS;
  io.files = [];
  io.hold = false;
  io.held.clear();
  io.colours = {};
});

describe('New script flow, Where: Continue with an empty address', () => {
  it('stays on Where and names the address at its field; typing one clears it', async () => {
    const { r, user, address } = await toWhere();
    await user.clear(address);
    expect(screen.queryByText(strings['flow.where.addressMissing'])).toBeNull();
    await user.click(btn('flow.continue'));
    expect(await screen.findByText(strings['flow.where.addressMissing'], undefined, SLOW)).toBeTruthy();
    expect(loc(r)).not.toMatch(/step=write/);
    await user.type(screen.getByRole('textbox', { name: strings['new.address'] }), '/fresh');
    await waitFor(() => expect(screen.queryByText(strings['flow.where.addressMissing'])).toBeNull());
  });
});
