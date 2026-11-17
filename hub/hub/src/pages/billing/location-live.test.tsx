// Vitest: the live Checkout hook and the Location choice, against a fake core attempt. A location is part of the
// request: another choice is another attempt (its own quote, its own key), the purchase carries the choice only when
// one is made, a refused location reads the list again and never resends the refused request, and a kept request
// (outcome unknown) is never offered a new location.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import page from './page';
import strings from './strings.en.json';

const REGIONS = [
  { region: 'de-fra', country: 'DE', city: 'Frankfurt', available: true },
  { region: 'fi-hel', country: 'FI', city: 'Helsinki', available: true },
  { region: 'us-nyc', country: 'US', city: 'New York', available: false },
];
const fx = vi.hoisted(() => ({
  /** Every attempt core was asked for, in order: its target and its fake. */
  made: [] as Array<{ target: any; att: any }>,
  attConfirm: { ok: true, result: { operation: { id: 'op1', charge_cents: 1200 }, subscription: { id: 'x1', paid_through: null, region: { region: 'fi-hel', country: 'FI', city: 'Helsinki' } }, replayed: false, failed: false } } as any,
  attError: null as any,
  attPending: false,
  quoteFails: null as any,
  regions: null as any,
  regionsError: false,
  regionsFetching: false,
  regionsRefetch: vi.fn(),
  regionsPlan: [] as Array<string | null>,
  api: null as any,
  /** The top-up continuation's location for the family (a code), and how often it was forgotten. */
  resume: null as string | null,
  forgot: 0,
  wroteResume: [] as any[][],
}));

vi.mock('@core', async (orig) => {
  const a: Record<string, any> = await orig();
  return {
    ...a,
    commerce: {
      ...a.commerce,
      shownOwner: () => ({ owner: 'u1', live: () => true }),
      heldPlanEntry: () => (fx.attPending ? { key: 'k'.repeat(20), maxCents: 1200, sig: 's' } : null),
      heldPlanTitle: () => null,
      writeBuyResume: (...a: any[]) => { fx.wroteResume.push(a); return true; },
      createAttempt: (_kind: unknown, target: any) => {
        const att: any = {
          quote: vi.fn(async () => {
            if (fx.quoteFails) throw fx.quoteFails;
            const r = target.region ? REGIONS.find((x) => x.region === target.region) : REGIONS[0];
            return { charge_cents: 1200, price_cents_per_month: 1200, available: true, region: r ? { region: r.region, country: r.country, city: r.city } : null };
          }),
          confirm: vi.fn(async () => fx.attConfirm),
          snapshot: vi.fn(() => ({ phase: 'review', error: fx.attError, ceiling: 1200, pending: fx.attPending, key: fx.attPending ? 'k'.repeat(20) : null, region: target.region ?? null })),
          resume: vi.fn(),
          dispose: vi.fn(),
        };
        fx.made.push({ target, att });
        return att;
      },
    },
  };
});

vi.mock('./data', async (orig) => {
  const a: Record<string, any> = await orig();
  return {
    ...a,
    useCheckout: (...args: any[]) => {
      const api = a.useCheckoutLive(...args);
      fx.api = api;
      return api;
    },
    resumeRegion: (family: string | null) => (family === 'fam-plus' ? fx.resume : null),
    forgetResumeRegion: () => { fx.forgot += 1; fx.resume = null; },
    usePlanRegions: (planId: string | null) => {
      fx.regionsPlan.push(planId);
      return { data: fx.regionsError ? undefined : fx.regions, isPending: false, isFetching: fx.regionsFetching, isError: fx.regionsError, error: fx.regionsError ? new Error('x') : null, refetch: fx.regionsRefetch };
    },
  };
});

const fill = (s: string, v: Record<string, string>) => s.replace(/\{\{(\w+)\}\}/g, (_m, k: string) => String(v[k]));
const last = () => fx.made[fx.made.length - 1]!;
async function openBuy() {
  await renderPage(page, { path: '/billing?checkout=buy&plan=fam-plus' });
  const dialog = await screen.findByRole('dialog', undefined, { timeout: 20000 });
  await within(dialog).findByRole('checkbox', undefined, { timeout: 20000 });
  return dialog;
}
// The Location choice is a radio list in view (up to six places): Automatic first, then each place.
const picker = (dialog: HTMLElement) => within(dialog).getByRole('radiogroup', { name: strings['loc.label'] });
const radios = (dialog: HTMLElement) => within(picker(dialog)).getAllByRole('radio') as HTMLInputElement[];
const textOf = (r: HTMLElement) => r.closest('label')?.textContent ?? '';
// A place before Automatic: Automatic's own line names where it would place the server right now.
const radioOf = (dialog: HTMLElement, name: RegExp) => radios(dialog).find((r) => r.value !== 'auto' && name.test(textOf(r))) ?? radios(dialog).find((r) => name.test(textOf(r)))!;
const chosen = (dialog: HTMLElement) => radios(dialog).find((r) => r.checked)!;
async function choose(dialog: HTMLElement, name: RegExp) {
  await userEvent.click(radioOf(dialog, name));
  await within(dialog).findByRole('checkbox', undefined, { timeout: 20000 });
}
const confirm = async (dialog: HTMLElement) => {
  await userEvent.click(within(dialog).getByRole('checkbox'));
  await userEvent.click(within(dialog).getByRole('button', { name: strings['buy.confirm'] }));
};

beforeEach(() => {
  fx.made.length = 0;
  fx.attConfirm = { ok: true, result: { operation: { id: 'op1', charge_cents: 1200 }, subscription: { id: 'x1', paid_through: null, region: { region: 'fi-hel', country: 'FI', city: 'Helsinki' } }, replayed: false, failed: false } };
  fx.attError = null;
  fx.attPending = false;
  fx.quoteFails = null;
  fx.regions = REGIONS;
  fx.regionsError = false;
  fx.regionsFetching = false;
  fx.regionsRefetch.mockReset();
  fx.regionsPlan.length = 0;
  fx.resume = null;
  fx.forgot = 0;
  fx.wroteResume.length = 0;
});

describe('the live checkout and the chosen location', () => {
  it('up to six places every one is in view as a radio, Automatic first and picked; above six the field is a Select', async () => {
    const six = ['a', 'b', 'c', 'd', 'e', 'f'].map((k) => ({ region: `x-${k}`, country: 'DE', city: `Town ${k}`, available: true }));
    fx.regions = six;
    let dialog = await openBuy();
    expect(radios(dialog).map((r) => r.value)).toEqual(['auto', ...six.map((r) => `r:${r.region}`)]);
    expect(radios(dialog)[0]!.checked).toBe(true);
    cleanup();
    fx.regions = [...six, { region: 'x-g', country: 'DE', city: 'Town g', available: true }];
    dialog = await openBuy();
    expect(within(dialog).queryByRole('radiogroup', { name: strings['loc.label'] })).toBeNull();
    expect(within(dialog).getByRole('button', { name: new RegExp(strings['loc.label']) })).toHaveTextContent(strings['loc.auto']);
  });

  it('Automatic: the attempt is made without a region; the list is read for the plan version the drawer buys', async () => {
    const dialog = await openBuy();
    expect(fx.made.length).toBe(1);
    expect('region' in last().target).toBe(false);
    expect(fx.regionsPlan.filter(Boolean).every((p) => p === 'plan-plus-v2')).toBe(true);
    expect(fx.regionsPlan.some(Boolean)).toBe(true);
    // Where Automatic would place it now is the quote's own hint.
    expect(within(dialog).getByText(fill(strings['loc.autoNow'], { place: 'Frankfurt, Germany' }))).toBeInTheDocument();
  });

  it('a choice is ANOTHER attempt with that region, quoted on its own; the first one is never confirmed', async () => {
    const dialog = await openBuy();
    const first = last();
    await choose(dialog, /Helsinki, Finland/);
    expect(fx.made.length).toBe(2);
    expect(last().target).toMatchObject({ plan: { id: 'plan-plus-v2' }, region: 'fi-hel' });
    expect(last().att.quote).toHaveBeenCalledTimes(1);
    await confirm(dialog);
    await waitFor(() => expect(last().att.confirm).toHaveBeenCalledTimes(1));
    expect(first.att.confirm).not.toHaveBeenCalled();
    // The answer's subscription says where the server is.
    await waitFor(() => expect(dialog).toHaveTextContent(fill(strings['loc.in'], { place: 'Helsinki, Finland' })));
  });

  it('consent given for one location never carries to another', async () => {
    const dialog = await openBuy();
    await userEvent.click(within(dialog).getByRole('checkbox'));
    await choose(dialog, /Helsinki, Finland/);
    expect(fx.api.state.consent).toBe(false);
    expect(fx.api.state.quote.subject).toMatch(/:fi-hel$/);
  });

  it('NO_PAID_CAPACITY_IN_REGION: the region is named, nothing charged, the list is read again, the price is read again; nothing is resent', async () => {
    const dialog = await openBuy();
    await choose(dialog, /Helsinki, Finland/);
    const att = last().att;
    fx.attConfirm = { ok: false, reason: 'refused', definitive: true, kind: 'regionFull' };
    fx.attError = { kind: 'regionFull', code: 'NO_PAID_CAPACITY_IN_REGION' };
    await confirm(dialog);
    expect(await within(dialog).findByText(fill(strings['loc.refusedFullIn'], { place: 'Helsinki, Finland' }))).toBeInTheDocument();
    expect(fx.api.state.phase).toBe('review');
    expect(fx.api.state.consent).toBe(false);
    await waitFor(() => expect(fx.regionsRefetch).toHaveBeenCalled());
    await waitFor(() => expect(att.quote).toHaveBeenCalledTimes(2));
    expect(att.confirm).toHaveBeenCalledTimes(1);
    // The picker is usable: another location is another attempt.
    await choose(dialog, /Frankfurt, Germany/);
    expect(last().target.region).toBe('de-fra');
    expect(last().att).not.toBe(att);
    expect(within(dialog).queryByText(/Nothing was charged/)).toBeNull();
  });

  it('PAID_REGION_UNKNOWN at the purchase: said, the list read again; a list without the choice puts Automatic back and says so', async () => {
    const dialog = await openBuy();
    await choose(dialog, /Helsinki, Finland/);
    fx.attConfirm = { ok: false, reason: 'refused', definitive: true, kind: 'regionUnknown' };
    fx.attError = { kind: 'regionUnknown', code: 'PAID_REGION_UNKNOWN' };
    await confirm(dialog);
    expect(await within(dialog).findByText(strings['loc.refusedUnknown'])).toBeInTheDocument();
    await waitFor(() => expect(fx.regionsRefetch).toHaveBeenCalled());
    const before = fx.made.length;
    // The fresh list no longer offers Helsinki.
    await act(async () => { fx.regions = REGIONS.filter((r) => r.region !== 'fi-hel'); fx.api.setConsent(false); });
    await waitFor(() => expect(fx.made.length).toBeGreaterThan(before));
    expect('region' in last().target).toBe(false);
    await waitFor(() => expect(textOf(chosen(dialog))).toMatch(/^Automatic \(best available\)/));
    expect(within(dialog).getByText(strings['loc.dropped'])).toBeInTheDocument();
  });

  it('PAID_REGION_UNKNOWN at the quote: the list is read again and the picker stays to choose another', async () => {
    const dialog = await openBuy();
    fx.quoteFails = { status: 400, code: 'PAID_REGION_UNKNOWN' };
    await userEvent.click(radioOf(dialog, /Helsinki, Finland/));
    await waitFor(() => expect(fx.api.state.phase).toBe('quote_error'));
    await waitFor(() => expect(fx.regionsRefetch).toHaveBeenCalled());
    expect(radioOf(dialog, /Frankfurt, Germany/)).toBeEnabled();
  });

  it('the list cannot be read: Automatic only, Retry reads it again, and Confirm still sends (without a region)', async () => {
    fx.regionsError = true;
    const dialog = await openBuy();
    expect(within(dialog).getByText(strings['loc.listErr'])).toBeInTheDocument();
    expect(radios(dialog)).toHaveLength(1);
    await userEvent.click(within(dialog).getByRole('button', { name: /retry|try again/i }));
    expect(fx.regionsRefetch).toHaveBeenCalledTimes(1);
    await confirm(dialog);
    await waitFor(() => expect(last().att.confirm).toHaveBeenCalledTimes(1));
    expect('region' in last().target).toBe(false);
  });

  it('a kept request (outcome unknown) is shown as that: no Location choice is offered over it', async () => {
    fx.attPending = true;
    await renderPage(page, { path: '/billing?checkout=buy&plan=fam-plus' });
    const dialog = await screen.findByRole('dialog', undefined, { timeout: 20000 });
    await waitFor(() => expect(fx.api.state.phase).toBe('unknown'));
    expect(within(dialog).queryByRole('radiogroup', { name: strings['loc.label'] })).toBeNull();
  });

  it('the receipt says the paid-until date and the place as ONE sentence pair from one string', async () => {
    fx.attConfirm = { ok: true, result: { operation: { id: 'op1', charge_cents: 1200 }, subscription: { id: 'x1', paid_through: '2031-03-04T00:00:00.000Z', region: { region: 'fi-hel', country: 'FI', city: 'Helsinki' } }, replayed: false, failed: false } } as any;
    const dialog = await openBuy();
    await confirm(dialog);
    const re = new RegExp('^' + strings['co.paidUntilIn'].replace(/[.]/g, '\\.').replace('{{date}}', '[^.]+').replace('{{place}}', 'Helsinki, Finland') + '$');
    await waitFor(() => expect(within(dialog).getByText(re)).toBeInTheDocument());
    expect(within(dialog).queryByText(fill(strings['loc.in'], { place: 'Helsinki, Finland' }))).toBeNull();
  });

  it('a location that is Full is refused by the field itself, whatever hands its value over', async () => {
    const dialog = await openBuy();
    const { fireEvent } = await import('@testing-library/react');
    const full = radios(dialog).find((r) => /us-nyc/.test(r.value));
    expect(full).toBeTruthy();
    expect(full).toBeDisabled();
    // Even with its lock taken off, a press on it chooses nothing.
    full!.disabled = false;
    await act(async () => { fireEvent.click(full!); });
    expect(fx.made.every((m) => m.target.region !== 'us-nyc')).toBe(true);
    expect(textOf(chosen(dialog))).toMatch(/^Automatic \(best available\)/);
    // The same hand-over of a location with room is taken (the guard refuses only Full).
    const ok = radios(dialog).find((r) => /fi-hel/.test(r.value));
    await act(async () => { fireEvent.click(ok!); });
    await waitFor(() => expect(last().target.region).toBe('fi-hel'));
  });

  it('a request on its way keeps its location: a list that loses the choice mid-send drops nothing and makes no new attempt', async () => {
    const dialog = await openBuy();
    await choose(dialog, /Helsinki, Finland/);
    const att = last().att;
    let answer: (v: unknown) => void = () => undefined;
    att.confirm.mockImplementation(() => new Promise((res) => { answer = res; }));
    await confirm(dialog);
    await waitFor(() => expect(att.confirm).toHaveBeenCalledTimes(1));
    const made = fx.made.length;
    fx.regions = REGIONS.filter((r) => r.region !== 'fi-hel');
    fx.attPending = true;
    await act(async () => { answer({ ok: false, reason: 'unknown' }); });
    await waitFor(() => expect(fx.api.state.phase).toBe('unknown'));
    expect(fx.made.length).toBe(made);
    expect(fx.api.keptRegion).toBe('fi-hel');
    // The kept request names its location where its resend is offered (the list no longer has it: the code stands in).
    expect(dialog).toHaveTextContent(/asks for FI-HEL and charges up to/);
  });

  it('a kept request names its location in "Send the same request again", on the line and in the dialog', async () => {
    const dialog = await openBuy();
    await choose(dialog, /Helsinki, Finland/);
    fx.attConfirm = { ok: false, reason: 'unknown' } as any;
    fx.attPending = true;
    await confirm(dialog);
    await waitFor(() => expect(fx.api.state.phase).toBe('unknown'));
    await waitFor(() => expect(dialog).toHaveTextContent(/asks for Helsinki, Finland and charges up to/));
    await userEvent.click(within(dialog).getByRole('button', { name: strings['co.resend'] }));
    const ask = await screen.findByRole('alertdialog');
    expect(ask).toHaveTextContent(/asks for Helsinki, Finland and charges up to/);
  });

  it('a kept request with no location (Automatic) keeps the plain sentence', async () => {
    const dialog = await openBuy();
    fx.attConfirm = { ok: false, reason: 'unknown' } as any;
    fx.attPending = true;
    await confirm(dialog);
    await waitFor(() => expect(fx.api.state.phase).toBe('unknown'));
    await waitFor(() => expect(dialog).toHaveTextContent(/this one goes through now and charges up to/));
    expect(dialog).not.toHaveTextContent(/asks for/);
  });

  it('back from Add funds: the location chosen before is offered again when the fresh list has room there, asked once', async () => {
    fx.resume = 'fi-hel';
    const dialog = await openBuy();
    await waitFor(() => expect(last().target.region).toBe('fi-hel'));
    await waitFor(() => expect(textOf(chosen(dialog))).toMatch(/Helsinki, Finland/));
    expect(fx.forgot).toBe(1);
    expect(within(dialog).queryByText(strings['loc.reset'])).toBeNull();
  });

  it('back from Add funds: a location that is Full now, or gone from the list, is Automatic with a note that it was reset', async () => {
    for (const code of ['us-nyc', 'xx-gone']) {
      fx.made.length = 0; fx.forgot = 0;
      fx.resume = code;
      const dialog = await openBuy();
      await waitFor(() => expect(within(dialog).getByText(strings['loc.reset'])).toBeInTheDocument());
      expect(textOf(chosen(dialog))).toMatch(/^Automatic \(best available\)/);
      expect(fx.made.every((m) => !('region' in m.target))).toBe(true);
      expect(fx.forgot).toBe(1);
      // The person's own choice afterwards clears the note.
      await choose(dialog, /Frankfurt, Germany/);
      expect(within(dialog).queryByText(strings['loc.reset'])).toBeNull();
      const { cleanup } = await import('@testing-library/react');
      cleanup();
    }
  });

  it('back from Add funds: a choice made while the list is still being read wins, Automatic included', async () => {
    fx.resume = 'fi-hel';
    fx.regionsFetching = true;
    const dialog = await openBuy();
    await choose(dialog, /Frankfurt, Germany/);
    await choose(dialog, /^Automatic/);
    expect(fx.forgot).toBeGreaterThan(0);
    const before = fx.made.length;
    // The read settles: the person's Automatic stays; the location from before Add funds is not put back.
    await act(async () => { fx.regionsFetching = false; fx.api.setConsent(true); });
    await act(async () => { fx.api.setConsent(false); });
    expect(textOf(chosen(dialog))).toMatch(/^Automatic \(best available\)/);
    expect(fx.made.slice(before).every((m) => !('region' in m.target))).toBe(true);
  });

  it('back from Add funds while the list cannot be read: nothing is decided and nothing forgotten', async () => {
    fx.resume = 'fi-hel';
    fx.regionsError = true;
    const dialog = await openBuy();
    expect(within(dialog).getByText(strings['loc.listErr'])).toBeInTheDocument();
    expect(fx.forgot).toBe(0);
    expect(fx.made.every((m) => !('region' in m.target))).toBe(true);
  });

  it('a checkout link never carries a location (the continuation record does, in core: commerce-region-kept.test.ts)', async () => {
    const { links } = await import('./links');
    expect(JSON.stringify(links.checkout('buy', { plan: 'fam-plus' }))).not.toMatch(/region|fi-hel/);
  });

  it('a refused location: ONE band (warn) says it, the focus is on the refused place in Location, which adds no line of its own, never "will be in"', async () => {
    const dialog = await openBuy();
    await choose(dialog, /Helsinki, Finland/);
    fx.attConfirm = { ok: false, reason: 'refused', definitive: true, kind: 'regionFull' } as any;
    fx.attError = { kind: 'regionFull', code: 'NO_PAID_CAPACITY_IN_REGION' };
    await confirm(dialog);
    const said = fill(strings['loc.refusedFullIn'], { place: 'Helsinki, Finland' });
    await within(dialog).findByText(said);
    // The re-read still lists Helsinki with room: the field must not promise the place just refused.
    await waitFor(() => expect(radioOf(dialog, /Helsinki, Finland/)).toHaveFocus());
    expect(picker(dialog)).toHaveAccessibleDescription('');
    expect(within(dialog).getAllByText(/Choose another location/)).toHaveLength(1);
    expect(dialog).not.toHaveTextContent(fill(strings['loc.chosen'], { place: 'Helsinki, Finland' }));
    const band = dialog.querySelector('[data-band="notice"]')!;
    expect(band.innerHTML).toMatch(/warn/);
    expect(dialog.querySelectorAll('[data-band="notice"]').length).toBe(1);
    // Another choice clears the refusal's line.
    await choose(dialog, /Frankfurt, Germany/);
    expect(picker(dialog)).toHaveAccessibleDescription(fill(strings['loc.chosen'], { place: 'Frankfurt, Germany' }));
  });

  it('a refused location the re-read now marks Full: the refusal is said once, not again by the price read', async () => {
    const dialog = await openBuy();
    await choose(dialog, /Helsinki, Finland/);
    const att = last().att;
    fx.attConfirm = { ok: false, reason: 'refused', definitive: true, kind: 'regionFull' } as any;
    fx.attError = { kind: 'regionFull', code: 'NO_PAID_CAPACITY_IN_REGION' };
    // The price read after the refusal says there is no room either.
    att.quote.mockImplementation(async () => ({ charge_cents: 1200, price_cents_per_month: 1200, available: false, region: { region: 'fi-hel', country: 'FI', city: 'Helsinki' } }));
    fx.regions = REGIONS.map((r) => (r.region === 'fi-hel' ? { ...r, available: false } : r));
    await confirm(dialog);
    await within(dialog).findByText(fill(strings['loc.refusedFullIn'], { place: 'Helsinki, Finland' }));
    await waitFor(() => expect(att.quote).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(fx.api.state.quote.blocked).toBeTruthy());
    expect(dialog.querySelector('[data-band="blocked"]')).toBeNull();
    // Drawn once as a Band; the closed Confirm keeps its reason for a screen reader and on hover, as every closed Confirm.
    expect(dialog.querySelectorAll('[data-band]').length).toBe(1);
    expect(within(dialog).getByRole('button', { name: strings['buy.confirm'] })).toHaveAttribute('aria-disabled', 'true');
  });

  it('Automatic refused for no room: worded for Automatic (no "that location", no "choose another")', async () => {
    const dialog = await openBuy();
    fx.attConfirm = { ok: false, reason: 'refused', definitive: true, kind: 'regionFull' } as any;
    fx.attError = { kind: 'regionFull', code: 'NO_PAID_CAPACITY_IN_REGION' };
    await confirm(dialog);
    await within(dialog).findByText(strings['loc.refusedAuto']);
    expect(within(dialog).queryByText(strings['loc.refusedFull'])).toBeNull();
    expect(dialog).not.toHaveTextContent(/Right now that is/);
    expect(strings['loc.refusedAuto']).not.toMatch(/That location|Choose another/);
  });

  it('a price for a chosen place that names no place it can read: Confirm shut, said, Check again reads it anew', async () => {
    const dialog = await openBuy();
    await userEvent.click(radioOf(dialog, /Helsinki, Finland/));
    await waitFor(() => expect(last().target.region).toBe('fi-hel'));
    const att = last().att;
    let unread = true;
    att.quote.mockImplementation(async () => ({ charge_cents: 1200, price_cents_per_month: 1200, available: true, region: unread ? null : { region: 'fi-hel', country: 'FI', city: 'Helsinki' } }));
    await act(async () => { fx.api.reload(); });
    await waitFor(() => expect(dialog.querySelector('[data-band="blocked"]')).toHaveTextContent(fill(strings['loc.unread'], { asked: 'Helsinki, Finland' })));
    await userEvent.click(within(dialog).getByRole('checkbox'));
    expect(within(dialog).getByRole('button', { name: strings['buy.confirm'] })).toHaveAttribute('aria-disabled', 'true');
    expect(att.confirm).not.toHaveBeenCalled();
    unread = false;
    await userEvent.click(within(dialog.querySelector('[data-band="blocked"]') as HTMLElement).getByRole('button', { name: strings['buy.checkAgain'] }));
    await waitFor(() => expect(dialog.querySelector('[data-band="blocked"]')).toBeNull());
  });

  it('Automatic with a price that names no place is not blocked (nothing was asked for)', async () => {
    const dialog = await openBuy();
    const att = last().att;
    att.quote.mockImplementation(async () => ({ charge_cents: 1200, price_cents_per_month: 1200, available: true, region: null }));
    await act(async () => { fx.api.reload(); });
    await waitFor(() => expect(att.quote).toHaveBeenCalledTimes(2));
    expect(dialog.querySelector('[data-band="blocked"]')).toBeNull();
  });

  it('a price that came back for another place than the one chosen: said as answered, Confirm shut, Check again reads it anew', async () => {
    const dialog = await openBuy();
    await userEvent.click(radioOf(dialog, /Helsinki, Finland/));
    await waitFor(() => expect(last().target.region).toBe('fi-hel'));
    const att = last().att;
    let wrong = true;
    att.quote.mockImplementation(async () => ({ charge_cents: 1200, price_cents_per_month: 1200, available: true, region: wrong ? { region: 'de-fra', country: 'DE', city: 'Frankfurt' } : { region: 'fi-hel', country: 'FI', city: 'Helsinki' } }));
    await act(async () => { fx.api.reload(); });
    await waitFor(() => expect(dialog.querySelector('[data-band="blocked"]')).toHaveTextContent(fill(strings['loc.mismatch'], { got: 'Frankfurt, Germany', asked: 'Helsinki, Finland' })));
    expect(dialog).not.toHaveTextContent(fill(strings['loc.chosen'], { place: 'Helsinki, Finland' }));
    expect(picker(dialog)).toHaveAccessibleDescription(fill(strings['loc.answerSays'], { place: 'Frankfurt, Germany' }));
    await userEvent.click(within(dialog).getByRole('checkbox'));
    expect(within(dialog).getByRole('button', { name: strings['buy.confirm'] })).toHaveAttribute('aria-disabled', 'true');
    expect(att.confirm).not.toHaveBeenCalled();
    wrong = false;
    await userEvent.click(within(dialog.querySelector('[data-band="blocked"]') as HTMLElement).getByRole('button', { name: strings['buy.checkAgain'] }));
    await waitFor(() => expect(picker(dialog)).toHaveAccessibleDescription(fill(strings['loc.chosen'], { place: 'Helsinki, Finland' })));
    expect(dialog.querySelector('[data-band="blocked"]')).toBeNull();
  });
});
