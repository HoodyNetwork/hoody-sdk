// Models & keys → Hoody AI allowance: each server's lanes in core's words (a lane without a reading or an unreadable
// server is never a 0), the account's empty and failed reads in the kit's states, and Add AI credit shown as planned,
// disabled with its reason, sending nothing.
import { cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Allowance } from './data';
import { AllowanceSection } from './Allowance';
import strings from './Allowance.strings.en.json';
import { mount } from './agents/routed';

const R = vi.hoisted(() => ({ q: null as unknown as { data?: Allowance; error: unknown; isPending: boolean; refetch: () => Promise<unknown> } }));
vi.mock('./data', () => ({ useAllowance: () => R.q }));

const refetch = vi.fn(() => Promise.resolve());
const read = (o: Partial<typeof R.q>) => { R.q = { data: undefined, error: null, isPending: false, refetch, ...o }; };
const lane = (l: string, pct: number | null, off = false) => ({ lane: l as 'chat', off, pct, resets: null });
const ALLOW: Allowance = {
  servers: [
    { id: 'a', name: 'atlas', ok: true, lanes: [lane('chat', 30), lane('decisions', 100), lane('speech', null, true), lane('transcription', null)] },
    { id: 'b', name: 'spare', ok: false, lanes: [] },
  ],
  truncated: true,
};
const row = (name: string) => screen.getAllByRole('row').find((r) => within(r).queryByText(name)) as HTMLElement;

beforeEach(() => refetch.mockClear());
afterEach(cleanup);

describe('the allowance of each server', () => {
  it('says each lane in words, never a 0 for what was not read', async () => {
    read({ data: ALLOW });
    await mount(<AllowanceSection />, '/ai/models');
    const atlas = row('atlas');
    expect(within(atlas).getByText(/30%/)).toBeTruthy();
    expect(within(atlas).getByRole('meter', { name: `${strings['aiu.lane.decisions']}: ${strings['aiu.full']}` })).toBeTruthy();
    expect(within(atlas).getByText(strings['aiu.off'])).toBeTruthy();
    // A lane with no reading, and one the answer left out (web search), say so.
    expect(within(atlas).getAllByText(strings['aiu.unknown'])).toHaveLength(2);
    // An unreadable server says so once, under its name; its lanes say only that there is no reading, so no lane cell
    // cuts a long sentence.
    expect(within(row('spare')).getAllByText(strings['aiu.unavailable'])).toHaveLength(1);
    // Short enough for one line of the narrow Server column (a long sentence took four rows there).
    expect([...strings['aiu.unavailable']].length).toBeLessThanOrEqual(18);
    expect(within(row('spare')).getAllByText(strings['aiu.unknown'])).toHaveLength(5);
    expect(screen.getByText(strings.truncated)).toBeTruthy();
  });

  it('no server: the empty state says where the allowance comes from', async () => {
    read({ data: { servers: [], truncated: false } });
    const { router } = await mount(<AllowanceSection />, '/ai/models');
    expect(screen.getByText(strings['empty.title'])).toBeTruthy();
    // The way to a server sits beside the words (the empty table draws no toolbar): it opens the plans.
    await userEvent.click(screen.getByRole('button', { name: strings['empty.plans'] }));
    expect(router.state.location.href).toContain('/billing');
    expect(router.state.location.href).toContain('view=plans');
  });

  it('a refused read says why in core\'s words and Try again reads again', async () => {
    read({ error: { kind: 'forbidden' } });
    await mount(<AllowanceSection />, '/ai/models');
    expect(screen.getByText(strings['aiu.noAccess'])).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(refetch).toHaveBeenCalled();
  });
});

describe('Add AI credit', () => {
  it('is shown as coming soon; its button is disabled, says why and does nothing', async () => {
    read({ data: ALLOW });
    await mount(<AllowanceSection />, '/ai/models');
    // Planned, not a status to act on: a neutral tag, never the accent (the accent is the one primary button).
    const soon = screen.getByText(strings['credit.soon']);
    expect(soon.closest('[class*="tag_accent"]')).toBeNull();
    const b = screen.getByRole('button', { name: new RegExp(strings['credit.button'], 'i') });
    expect(b.getAttribute('aria-disabled') === 'true' || b.hasAttribute('disabled')).toBe(true);
    await userEvent.click(b);
    expect((await screen.findAllByText(strings['credit.why'])).length).toBeGreaterThan(0);
    expect(refetch).not.toHaveBeenCalled();
  });
});
