// The rate-limit rule, the same as the terminal app's. Each case names the behaviour it holds.
import { describe, expect, it } from 'vitest';
import { parseRateLimit, rateLimitBand, rateLimitBlocked, rateLimitNextChange, rateLimitPercent, rateLimitSupersedes, rateLimitViewAt, type RateLimitReading } from './rateLimit';

const NOW = Date.UTC(2026, 10, 2, 12, 0, 0);
const S = NOW / 1000;
const win = (name: string, utilization: number | null, resetsIn: number, limiting = false) => ({
  name, utilization: utilization ?? 0, has_utilization: utilization !== null, resets_at: resetsIn === 0 ? 0 : S + resetsIn, limiting,
});
const read = (o: Record<string, unknown>): RateLimitReading => {
  const r = parseRateLimit({ status: 'allowed', rev: 1, epoch: 7, ...o });
  if (!r) throw new Error('unreadable');
  return r;
};
const view = (o: Record<string, unknown>, now = NOW) => rateLimitViewAt(read(o), now)!;

describe('parseRateLimit: the wire is free-form, so it is read defensively', () => {
  it('reads a RateLimitState', () => {
    const r = read({ status: 'allowed_warning', windows: [win('five_hour', 0.92, 3600, true)], is_using_overage: true, overage_status: 'allowed', rev: 4, epoch: 9 });
    expect(r).toEqual({
      status: 'allowed_warning', usingOverage: true, overageStatus: 'allowed', rev: 4, epoch: 9,
      windows: [{ name: 'five_hour', utilization: 0.92, hasUtilization: true, resetsAt: S + 3600, limiting: true }],
    });
  });
  it('refuses a non-object and a reading whose rev or epoch is not whole', () => {
    expect(parseRateLimit(null)).toBeNull();
    expect(parseRateLimit([])).toBeNull();
    expect(parseRateLimit({ status: 'allowed', rev: -1, epoch: 1 })).toBeNull();
    expect(parseRateLimit({ status: 'allowed', rev: 1.5, epoch: 1 })).toBeNull();
    expect(parseRateLimit({ status: 'allowed', rev: 1, epoch: '2' })).toBeNull();
  });
  it('Go always sends status, rev and epoch: a frame missing one, or with a status the agent never sends, is refused', () => {
    expect(parseRateLimit({})).toBeNull();
    expect(parseRateLimit({ status: 'allowed', epoch: 1 })).toBeNull();
    expect(parseRateLimit({ status: 'allowed', rev: 1 })).toBeNull();
    expect(parseRateLimit({ rev: 1, epoch: 1 })).toBeNull();
    expect(parseRateLimit({ status: 'blocked', rev: 1, epoch: 1 })).toBeNull();
    expect(parseRateLimit({ status: 'allowed', rev: 1, epoch: 1, windows: 'five_hour' })).toBeNull();
    expect(parseRateLimit({ status: 'allowed', rev: 1, epoch: 1, windows: { name: 'five_hour' } })).toBeNull();
    // Go omits an empty list; it never sends null.
    expect(parseRateLimit({ status: 'allowed', rev: 1, epoch: 1, windows: null })).toBeNull();
  });
  it('Go omits an empty window list: a status-only frame is still a reading', () => {
    expect(read({ status: 'rejected' })).toMatchObject({ status: 'rejected', windows: [] });
  });
  it('an overage status outside the vocabulary reads empty (acp.ValidateRateLimit)', () => {
    expect(read({ overage_status: 'nope' }).overageStatus).toBe('');
  });
  it('drops a malformed window and keeps the rest', () => {
    const r = read({ windows: [{ name: 5, limiting: false }, { name: 'seven_day', utilization: 'x', limiting: false }, { name: 'seven_day', utilization: -1, limiting: false }, { name: 'five_hour', resets_at: 1.5, limiting: false }, win('seven_day', 0.4, 600)] });
    expect(r.windows.map((w) => w.name)).toEqual(['seven_day']);
  });
  it('a reset JS Date cannot render, or a utilization past the daemon clamp, refuses the whole frame', () => {
    expect(parseRateLimit({ status: 'allowed', rev: 1, epoch: 7, windows: [{ ...win('five_hour', 0.5, 600, true), resets_at: 9_000_000_000_000 }] })).toBeNull();
    expect(parseRateLimit({ status: 'allowed', rev: 1, epoch: 7, windows: [win('seven_day', 0.2, 600), win('five_hour', 10.01, 600, true)] })).toBeNull();
    expect(parseRateLimit({ status: 'allowed', rev: 1, epoch: 7, windows: [win('five_hour', 1e300, 600, true)] })).toBeNull();
    // The bounds themselves are readings.
    expect(read({ windows: [win('five_hour', 10, 600, true)] }).windows[0]!.utilization).toBe(10);
    expect(read({ windows: [{ ...win('five_hour', 0.5, 600, true), resets_at: 8_640_000_000_000 }] }).windows).toHaveLength(1);
  });
  it('a dropped malformed limiting window takes its refusal with it: the surviving weekly window is not used up', () => {
    const r = read({ status: 'rejected', windows: [{ name: 'five_hour', utilization: 'full', resets_at: S + 600, limiting: true }, win('seven_day', 0.2, 3600)] });
    expect(r.status).toBe('allowed');
    const v = rateLimitViewAt(r, NOW)!;
    expect(v.governing.name).toBe('seven_day');
    expect(rateLimitBlocked(v)).toBe(false);
    expect(rateLimitBand(v)).toBe('normal');
  });
  it('a dropped malformed limiting window takes its warning with it', () => {
    const r = read({ status: 'allowed_warning', windows: [{ name: 'five_hour', utilization: 0.8, resets_at: -5, limiting: true }, win('seven_day', null, 3600)] });
    expect(r.status).toBe('allowed');
    expect(rateLimitBand(rateLimitViewAt(r, NOW)!)).toBe('normal');
  });
  it('an unknown limiting window name is dropped with its refusal, as the daemon drops it: the known weekly window is not used up', () => {
    const r = read({ status: 'rejected', windows: [win('five_hour_v2', 1, 600, true), win('seven_day', 0.2, 3600)] });
    expect(r.status).toBe('allowed');
    expect(r.windows.map((w) => w.name)).toEqual(['seven_day']);
    const v = rateLimitViewAt(r, NOW)!;
    expect(rateLimitBlocked(v)).toBe(false);
    expect(rateLimitBand(v)).toBe('normal');
  });
  it('an unknown limiting window name is dropped with its warning', () => {
    const r = read({ status: 'allowed_warning', windows: [win('mystery', 0.8, 600, true), win('seven_day', null, 3600)] });
    expect(r.status).toBe('allowed');
    expect(rateLimitBand(rateLimitViewAt(r, NOW)!)).toBe('normal');
  });
  it('a duplicate name is dropped, the first kept: a limiting duplicate cannot outvote it or keep the status', () => {
    const r = read({ status: 'rejected', windows: [win('seven_day', 0.2, 3600), win('seven_day', 1, 600, true)] });
    expect(r.windows).toEqual([{ name: 'seven_day', utilization: 0.2, hasUtilization: true, resetsAt: S + 3600, limiting: false }]);
    expect(r.status).toBe('allowed');
  });
  it('a limiting window past the 16 read still takes its status with it', () => {
    const filler = Array.from({ length: 16 }, () => ({ name: 5, limiting: false }));
    expect(read({ status: 'rejected', windows: [win('seven_day', 0.2, 3600), ...filler.slice(1), win('five_hour', 1, 600, true)] }).status).toBe('allowed');
  });
  it('the status stays when another limiting window survives the drop', () => {
    expect(read({ status: 'rejected', windows: [{ name: 7, limiting: true }, win('seven_day', 1, 3600, true)] }).status).toBe('rejected');
  });
});

describe('a malformed frame applied over a held reading leaves the held one (parse, then RateLimitSupersedes)', () => {
  const apply = (held: RateLimitReading, raw: unknown): RateLimitReading => {
    const next = parseRateLimit(raw);
    return next && rateLimitSupersedes(held, next) ? next : held;
  };
  const held = read({ status: 'rejected', rev: 4, epoch: 7, windows: [win('five_hour', 1, 600, true)] });
  it.each([
    ['an empty object', {}],
    ['another epoch without a rev', { status: 'allowed', epoch: 8 }],
    ['a higher rev without an epoch', { status: 'allowed', rev: 9 }],
    ['a higher rev with an unknown status', { status: 'ok', rev: 9, epoch: 7 }],
    ['another epoch whose windows is not a list', { status: 'allowed', rev: 1, epoch: 8, windows: 'none' }],
    ['a higher rev whose reset Date cannot render', { status: 'allowed', rev: 9, epoch: 7, windows: [{ ...win('five_hour', 0.1, 600, true), resets_at: 9e12 }] }],
    ['a higher rev past the utilization clamp', { status: 'allowed', rev: 9, epoch: 7, windows: [win('five_hour', 50, 600, true)] }],
    ['a higher rev whose unknown window says limiting "true" beside a surviving weekly window', { status: 'rejected', rev: 9, epoch: 7, windows: [{ ...win('mystery', 1, 600), limiting: 'true' }, win('seven_day', 0.2, 3600)] }],
    ['another epoch whose window says limiting 1', { status: 'rejected', rev: 1, epoch: 8, windows: [{ ...win('five_hour', 1, 600), limiting: 1 }, win('seven_day', 0.2, 3600)] }],
    ['a higher rev with a window missing limiting', { status: 'rejected', rev: 9, epoch: 7, windows: [{ name: 'five_hour', utilization: 1, has_utilization: true, resets_at: S + 600 }, win('seven_day', 0.2, 3600)] }],
    ['a higher rev whose malformed limiting is past the 16 read', { status: 'rejected', rev: 9, epoch: 7, windows: [win('seven_day', 0.2, 3600), ...Array.from({ length: 16 }, () => ({ name: 5, limiting: false })), { ...win('five_hour', 1, 600), limiting: null }] }],
    ['a higher rev whose first window is null beside a valid weekly window', { status: 'allowed', rev: 9, epoch: 7, windows: [null, win('seven_day', 0.2, 3600)] }],
    ['another epoch whose window is a string', { status: 'allowed', rev: 1, epoch: 8, windows: ['five_hour', win('seven_day', 0.2, 3600)] }],
    ['a higher rev whose non-object window is past the 16 read', { status: 'allowed', rev: 9, epoch: 7, windows: [win('seven_day', 0.2, 3600), ...Array.from({ length: 16 }, () => ({ name: 5, limiting: false })), 7] }],
    ['a higher rev whose windows is null', { status: 'allowed', rev: 9, epoch: 7, windows: null }],
    ['a higher rev with an unsafe-integer reset beside a valid window', { status: 'allowed', rev: 9, epoch: 7, windows: [win('seven_day', 0.1, 600), { ...win('five_hour', 0.1, 600, true), resets_at: 2 ** 60 }] }],
    ['a higher rev whose offending window is past the 16 read', { status: 'allowed', rev: 9, epoch: 7, windows: [win('seven_day', 0.1, 600), ...Array.from({ length: 16 }, () => ({ name: 5, limiting: false })), win('five_hour', 50, 600)] }],
    ['a higher rev whose Date-unrenderable reset is past the 16 read', { status: 'allowed', rev: 9, epoch: 7, windows: [win('seven_day', 0.1, 600), ...Array.from({ length: 16 }, () => ({ name: 5, limiting: false })), { ...win('five_hour', 0.1, 600), resets_at: 9e12 }] }],
  ])('%s', (_label, raw) => {
    expect(apply(held, raw)).toBe(held);
  });
  it('a well-formed newer frame still replaces it', () => {
    expect(apply(held, { status: 'allowed', rev: 5, epoch: 7 }).rev).toBe(5);
  });
});

describe('rateLimitSupersedes (protocol.RateLimitSupersedes)', () => {
  it('a newer rev in the same epoch wins; an older or equal one does not (the replay that arrives after a newer frame)', () => {
    const held = read({ rev: 5 });
    expect(rateLimitSupersedes(held, read({ rev: 6 }))).toBe(true);
    expect(rateLimitSupersedes(held, read({ rev: 5 }))).toBe(false);
    expect(rateLimitSupersedes(held, read({ rev: 4 }))).toBe(false);
  });
  it('another daemon lifetime always wins, even with a lower rev', () => {
    expect(rateLimitSupersedes(read({ rev: 9, epoch: 1 }), read({ rev: 1, epoch: 2 }))).toBe(true);
  });
  it('anything replaces nothing', () => {
    expect(rateLimitSupersedes(null, read({ rev: 0 }))).toBe(true);
  });
});

describe('rateLimitViewAt (rateLimitViewAt)', () => {
  it('never shows a window name outside the label map', () => {
    expect(rateLimitViewAt(read({ windows: [win('<b>pwned</b>', 0.99, 600, true)] }), NOW)).toBeNull();
    expect(view({ windows: [win('made_up', 0.99, 600), win('seven_day', 0.2, 600)] }).windows.map((w) => w.name)).toEqual(['seven_day']);
  });
  it('drops a window whose reset has passed, and shows nothing once every window has', () => {
    const o = { windows: [win('five_hour', 0.5, 60), win('seven_day', 0.3, 3600)] };
    expect(view(o, NOW + 61_000).windows.map((w) => w.name)).toEqual(['seven_day']);
    expect(rateLimitViewAt(read(o), NOW + 3_601_000)).toBeNull();
    // A window with no reset time never ages out.
    expect(view({ windows: [win('seven_day', 0.3, 0)] }, NOW + 1e12).windows).toHaveLength(1);
  });
  it('the governing window is the limiting one, not the busiest', () => {
    expect(view({ windows: [win('seven_day', 0.6, 3600), win('five_hour', 0.58, 600, true)] }).governing.name).toBe('five_hour');
  });
  it('with no limiting window, the busiest with a number governs', () => {
    expect(view({ windows: [win('five_hour', null, 600), win('seven_day', 0.2, 3600), win('seven_day_opus', 0.5, 3600)] }).governing.name).toBe('seven_day_opus');
  });
  it('the status expires with its limiting window: a rejected 5-hour window that reset leaves the weekly one uncoloured', () => {
    const o = { status: 'rejected', windows: [win('five_hour', 1, 60, true), win('seven_day', 0.4, 3600)] };
    expect(view(o).status).toBe('rejected');
    const after = view(o, NOW + 61_000);
    expect(after.status).toBe('');
    expect(rateLimitBlocked(after)).toBe(false);
    expect(rateLimitBand(after)).toBe('normal');
  });
  it('with no limiting window named, the status holds while any window is current', () => {
    expect(view({ status: 'allowed_warning', windows: [win('seven_day', null, 3600)] }).status).toBe('allowed_warning');
  });
});

describe('rateLimitBand / rateLimitBlocked (band, blocked, overageWarning)', () => {
  it('rejected without overage is blocked and critical', () => {
    const v = view({ status: 'rejected', windows: [win('five_hour', null, 600, true)] });
    expect(rateLimitBlocked(v)).toBe(true);
    expect(rateLimitBand(v)).toBe('critical');
  });
  it('rejected while overage absorbs the work is not blocked and not red; amber only when the overage runs out', () => {
    const v = view({ status: 'rejected', is_using_overage: true, windows: [win('five_hour', 1.2, 600, true)] });
    expect(rateLimitBlocked(v)).toBe(false);
    expect(rateLimitBand(v)).toBe('normal');
    expect(rateLimitBand(view({ status: 'rejected', is_using_overage: true, overage_status: 'allowed_warning', windows: [win('five_hour', 1, 600, true)] }))).toBe('warning');
  });
  it('bands by the governing number: 0.70 warning, 0.90 critical', () => {
    const band = (u: number) => rateLimitBand(view({ windows: [win('five_hour', u, 600, true)] }));
    expect(band(0.69)).toBe('normal');
    expect(band(0.7)).toBe('warning');
    expect(band(0.89)).toBe('warning');
    expect(band(0.9)).toBe('critical');
  });
  it('an allowed_warning below the 0.70 floor is suppressed; with no number it is honoured', () => {
    expect(rateLimitBand(view({ status: 'allowed_warning', windows: [win('five_hour', 0.5, 600, true)] }))).toBe('normal');
    expect(rateLimitBand(view({ status: 'allowed_warning', windows: [win('five_hour', null, 600, true)] }))).toBe('warning');
  });
});

describe('rateLimitPercent and rateLimitNextChange', () => {
  it('rounds down and reads past 100 when the window is over its cap', () => {
    expect(rateLimitPercent({ name: 'five_hour', utilization: 0.929, hasUtilization: true, resetsAt: 0, limiting: false })).toBe(92);
    expect(rateLimitPercent({ name: 'five_hour', utilization: 1.25, hasUtilization: true, resetsAt: 0, limiting: false })).toBe(125);
  });
  it('the next change is the earliest reset still ahead', () => {
    const r = read({ windows: [win('seven_day', 0.1, 3600), win('five_hour', 0.1, 60), win('seven_day_opus', 0.1, -5), win('overage', 0.1, 0)] });
    expect(rateLimitNextChange(r, NOW)).toBe((S + 60) * 1000);
    expect(rateLimitNextChange(r, NOW + 3_600_000)).toBeNull();
    expect(rateLimitNextChange(null, NOW)).toBeNull();
  });
});
