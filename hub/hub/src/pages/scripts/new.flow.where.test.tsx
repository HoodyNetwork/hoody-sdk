// Vitest (New script, step 2 "Where it answers"): the address and the computer as the person picks them.
// The address field asks the computer what answers an address now: one another script holds is refused with that script
// named and a free one offered, and an answer that comes back after the address changed says nothing about the new one.
// The address is shown whole (the computer's Exec address with the ids masked, `exec-1` readable) with Copy, never with an
// Open or QR (opening a script address would run it). The computer picker draws each computer's colour as the API keeps it;
// a value that is not a hex colour draws no mark and reaches no style.
// Replaced: the overview (two computers, the shown one first), the containers list's colours and the address check (a
// double that answers from a list of files, or holds each answer until the test lets it go).
import { act, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
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

const fill = (k: keyof typeof strings, v: Record<string, string>) => Object.entries(v).reduce((s, [a, b]) => s.replace(`{{${a}}}`, b), strings[k]);
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

describe('New script flow, Where: an address another script holds', () => {
  it('is refused with the script named and a free address offered; Continue does not leave Where', async () => {
    io.files = ['default/1/fetch-last-100.ts'];
    const { r, user, address } = await toWhere();
    await user.clear(address);
    await user.type(address, '/fetch-last-100');
    expect(await screen.findByText(fill('flow.where.takenBy', { route: '/fetch-last-100', name: 'fetch-last-100.ts' }), undefined, SLOW)).toBeTruthy();
    expect(screen.getByRole('button', { name: fill('flow.where.useFree', { route: '/fetch-last-100-2' }) })).toBeTruthy();
    // Continue does not leave Where while the address is taken.
    await user.click(btn('flow.continue'));
    await new Promise((r) => setTimeout(r, 300));
    expect(loc(r)).not.toMatch(/step=write/);
    expect(screen.getByRole('textbox', { name: strings['new.address'] })).toBe(address);
    await user.click(screen.getByRole('button', { name: fill('flow.where.useFree', { route: '/fetch-last-100-2' }) }));
    await waitFor(() => expect(address.value).toBe('/fetch-last-100-2'));
  });

  it('an answer that comes back after the address changed says nothing about the new address', async () => {
    io.files = ['default/1/fetch-last-100.ts'];
    io.hold = true;
    const { user, address } = await toWhere();
    await user.clear(address);
    await user.type(address, '/fetch-last-100');
    await waitFor(() => expect(io.held.has('/fetch-last-100')).toBe(true), SLOW);
    await user.clear(address);
    await user.type(address, '/fresh');
    await waitFor(() => expect(io.held.has('/fresh')).toBe(true), SLOW);
    await act(async () => { io.held.get('/fetch-last-100')?.(); await Promise.resolve(); });
    expect(screen.queryByText(/is already used/)).toBeNull();
    await act(async () => { io.held.get('/fresh')?.(); await Promise.resolve(); });
    expect(screen.queryByText(/is already used/)).toBeNull();
  });
});

describe('New script flow, Where: the address check is a tag inside the field', () => {
  // The tag sits in the field's own box, beside the typed address (the kit field's suffix), in words, never colour alone.
  const tagOf = (address: HTMLInputElement) => address.parentElement?.querySelector('[class*="suffix"]')?.textContent ?? null;

  it('Checking while the computer is asked, then Free; Taken for an address another script holds', async () => {
    io.files = ['default/1/fetch-last-100.ts'];
    io.hold = true;
    const { user, address } = await toWhere();
    await user.clear(address);
    await user.type(address, '/fresh');
    await waitFor(() => expect(io.held.has('/fresh')).toBe(true), SLOW);
    expect(tagOf(address)).toBe(strings['flow.where.tag.checking']);
    await act(async () => { io.held.get('/fresh')?.(); await Promise.resolve(); });
    await waitFor(() => expect(tagOf(address)).toBe(strings['flow.where.tag.free']), SLOW);
    await user.clear(address);
    await user.type(address, '/fetch-last-100');
    await waitFor(() => expect(io.held.has('/fetch-last-100')).toBe(true), SLOW);
    await act(async () => { io.held.get('/fetch-last-100')?.(); await Promise.resolve(); });
    await waitFor(() => expect(tagOf(address)).toBe(strings['flow.where.tag.taken']), SLOW);
    // Typing went on in the same field: the tag never remounts the input.
    expect(screen.getByRole('textbox', { name: strings['new.address'] })).toBe(address);
  });

  it('no tag for an address that is not valid yet', async () => {
    const { user, address } = await toWhere();
    await user.clear(address);
    await user.type(address, 'no slash');
    await new Promise((r) => setTimeout(r, 400));
    expect(tagOf(address)).toBeNull();
  });
});

describe('New script flow, Where: when it runs', () => {
  it('When it runs is two tiles, each saying what it means', async () => {
    await toWhere();
    const group = await screen.findByRole('radiogroup', { name: strings['flow.where.when'] }, SLOW);
    const tiles = within(group).getAllByRole('radio');
    expect(tiles).toHaveLength(2);
    expect(group.textContent).toContain(strings['flow.where.onlyCalledHint']);
    expect(group.textContent).toContain(strings['flow.where.alsoScheduleHint']);
  });
});

describe('New script flow, Where: the address shown', () => {
  it('is the whole Exec address with the path, exec-1 readable, with Copy and the line saying what it is', async () => {
    const { user, address } = await toWhere();
    await user.clear(address);
    await user.type(address, '/probe');
    expect(await screen.findByText(/exec-1\.example\/probe$/, undefined, SLOW)).toBeTruthy();
    expect(screen.getByText(strings['address.where'])).toBeTruthy();
    expect(screen.getByRole('button', { name: fill('address.copyWhat', { what: strings['new.address'] }) })).toBeTruthy();
  });

  it('has no Open or QR: opening a script address would run it', async () => {
    const { user, address } = await toWhere();
    await user.clear(address);
    await user.type(address, '/probe');
    await screen.findByText(/exec-1\.example\/probe$/, undefined, SLOW);
    expect(screen.queryByRole('button', { name: /open .*in a new tab/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /qr/i })).toBeNull();
    expect(screen.queryByRole('link', { name: /exec-1\.example\/probe/ })).toBeNull();
  });
});

describe('New script flow, Where: the computer picker shows each computer’s colour', () => {
  const markIn = (el: Element) => el.querySelector<HTMLElement>('[data-computer-color]');

  it('the picked computer’s mark on the trigger and each row’s own; a colour that is not a hex value draws none', async () => {
    io.colours = { atlas: '#3B82F6', cedar: 'red;x:url()' };
    const { user } = await toWhere();
    const trigger = () => screen.getByRole('button', { name: new RegExp(` ${strings['new.computer']}$`) });
    await screen.findByRole('button', { name: new RegExp(` ${strings['new.computer']}$`) }, SLOW);
    expect(trigger()).toHaveTextContent('atlas');
    expect(markIn(trigger())?.dataset.computerColor).toBe('#3B82F6');
    await user.click(trigger());
    const list = await screen.findByRole('dialog', { name: strings['new.computer'] }, SLOW);
    const row = (name: string) => within(list).getByRole('radio', { name: new RegExp(`^${name}\\b`) });
    expect(markIn(row('atlas'))?.dataset.computerColor).toBe('#3B82F6');
    expect(markIn(row('cedar'))).toBeNull();
    for (const el of document.querySelectorAll<HTMLElement>('[style]')) expect(el.getAttribute('style') ?? '').not.toContain('url(');
  });
});
