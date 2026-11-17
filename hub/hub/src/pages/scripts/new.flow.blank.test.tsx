// Vitest (New script): the write-it-myself way. The editor is step 3 and Continue
// needs code other than the starter; step 4 checks the code by itself, folds it under See the code below the check, and
// what is folded there is exactly what is checked and sent.
import { renderPage, screen, userEvent, waitFor } from '@app/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const io = vi.hoisted(() => ({ sent: [] as string[] }));

vi.mock('./data', async (orig) => {
  const real = await orig<Record<string, unknown>>();
  const fx = await import('./new/flowfix');
  return {
    ...real,
    useAskStore: () => 0,
    useOverview: fx.overviewOf([fx.comp(fx.ATLAS, 'atlas', 'a.00a1', 'n1'), fx.comp(fx.BOREALIS, 'borealis', 'b.00b2', 'n2')]),
    useScriptsTarget: () => fx.targetOf(fx.shown.id),
    useResolve: () => ({ mutateAsync: async () => ({ outcome: 'done', data: { matched: false } }) }),
    useBoundSends: () => ({ shown: true, validate: async (code: string) => { io.sent.push(code); return { outcome: 'done', data: { publishable: true, results: { dependencies: {} } } }; } }),
  };
});

import page from './page';
import { clearDrafts } from './new/draft';
import { mintDraft } from './new/Flow';
import strings from './strings.en.json';

// A loaded host can take seconds to show a page: finds wait up to the test's own timeout.
const SLOW = { timeout: 14000 };

const loc = (r: { router: { state: { location: { pathname: string; searchStr: string } } } }) => r.router.state.location.pathname + r.router.state.location.searchStr;
const btn = (key: keyof typeof strings) => screen.getByRole('button', { name: strings[key] });
const CODE = 'export default () => new Response("blank");';

async function toWrite() {
  const user = userEvent.setup();
  const r = await renderPage(page, { state: 'many', path: '/scripts/new/aaaaaaaaaa' });
  await user.click(await screen.findByRole('button', { name: new RegExp(strings['flow.what.writeCard']) }, SLOW));
  const address = await screen.findByRole('textbox', { name: strings['new.address'] }, SLOW);
  await user.clear(address);
  await user.type(address, '/blank');
  await user.click(btn('flow.continue'));
  await waitFor(() => expect(loc(r)).toMatch(/step=write/));
  return { r, user };
}

beforeEach(() => {
  clearDrafts(); mintDraft('aaaaaaaaaa');
  io.sent.length = 0;
});

describe('New script flow: write it myself', () => {
  it('on Where a bad address shows its error with the line saying what an address is', async () => {
    const user = userEvent.setup();
    await renderPage(page, { state: 'many', path: '/scripts/new/aaaaaaaaaa' });
    await user.click(await screen.findByRole('button', { name: new RegExp(strings['flow.what.writeCard']) }, SLOW));
    const address = await screen.findByRole('textbox', { name: strings['new.address'] }, SLOW);
    await user.clear(address);
    await user.type(address, '/bad path');
    expect(screen.getByText(strings['new.addressBad'])).toBeTruthy();
    expect(screen.getAllByText(strings['address.what'])).toHaveLength(1);
  });

  it('on Where an address the computer keeps for itself says so, not that its characters are wrong', async () => {
    const user = userEvent.setup();
    await renderPage(page, { state: 'many', path: '/scripts/new/aaaaaaaaaa' });
    await user.click(await screen.findByRole('button', { name: new RegExp(strings['flow.what.writeCard']) }, SLOW));
    const address = await screen.findByRole('textbox', { name: strings['new.address'] }, SLOW);
    for (const r of ['/notes.md', '/favicon.ico', '/a/pre', '/foo.js']) {
      await user.clear(address);
      await user.type(address, r);
      expect(screen.getByText(strings['new.addressReserved']), r).toBeTruthy();
      expect(screen.queryByText(strings['new.addressBad']), r).toBeNull();
    }
  });

  it('step 3 is the editor; Continue on the starter code says so and stays', async () => {
    const { r, user } = await toWrite();
    expect(screen.getByRole('heading', { name: strings['flow.write.title'] })).toBeTruthy();
    await user.click(btn('flow.continue'));
    expect(await screen.findByText(strings['flow.write.missing'], undefined, SLOW)).toBeTruthy();
    expect(loc(r)).toMatch(/step=write/);
    expect(io.sent).toHaveLength(0);
  });

  it('step 4 checks the code by itself and folds it under See the code: the folded bytes are the checked ones', async () => {
    const { r, user } = await toWrite();
    const code = screen.getByRole('textbox', { name: strings['new.code'] }) as HTMLTextAreaElement;
    await user.clear(code);
    await user.type(code, CODE);
    await user.click(btn('flow.continue'));
    await waitFor(() => expect(loc(r)).toMatch(/step=check/));
    await screen.findByText(strings['flow.check.ready'], undefined, SLOW);
    expect(io.sent).toEqual([CODE]);
    // No editor open by itself on Check.
    expect(screen.queryByRole('textbox', { name: strings['new.code'] })).toBeNull();
    await user.click(screen.getByRole('button', { name: new RegExp(strings['flow.built.seeCode']) }));
    expect((screen.getByRole('textbox', { name: strings['new.code'] }) as HTMLTextAreaElement).value).toBe(io.sent[0]);
  });
});
