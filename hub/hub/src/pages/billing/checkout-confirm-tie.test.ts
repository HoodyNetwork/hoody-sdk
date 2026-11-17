// Vitest: Confirm's disabled state and its footer reason come from one helper, confirmFooter(), so a condition added to
// one of them cannot leave a disabled Confirm with no reason (in the footer, or in the review body the footer leaves it to).
// The drawer reads both from it, pinned on its source below (a render test
// reaches only the states it renders); checkout-buy-layout.test.tsx pins the rendered footer.
import { describe, expect, it } from 'vitest';
import {
  type CheckoutPhase,
  type CheckoutQuote,
  type CheckoutState,
  confirmFooter,
  confirmGate,
  confirmReason,
  initialCheckout,
  shortfall,
} from './checkout-logic';
import drawer from './parts/CheckoutDrawer.tsx?raw';

const PHASES: CheckoutPhase[] = [
  'quoting',
  'quote_error',
  'review',
  'posting',
  'reconciling',
  'checking',
  'unknown',
  'done',
  'already',
  'failed',
  'not_found',
  'banned',
];

const quote = (o: Partial<CheckoutQuote> = {}): CheckoutQuote => ({
  chargeCents: 2500,
  balanceCents: 4000,
  blocked: null,
  warnings: [],
  notes: [],
  lines: [{ label: 'co.plan', cents: 2500 }],
  ...o,
});

const QUOTES: Array<[string, CheckoutQuote | null]> = [
  ['no quote', null],
  ['ok', quote()],
  ['blocked', quote({ blocked: { k: 'buy.noRoom' } })],
  ['balance unknown', quote({ balanceCents: null })],
  ['short', quote({ chargeCents: 1200, balanceCents: 880 })],
  ['blocked and short', quote({ blocked: { k: 'buy.noRoom' }, chargeCents: 1200, balanceCents: 880 })],
];

interface Case {
  label: string;
  s: CheckoutState;
  banned: boolean;
}

const CASES: Case[] = PHASES.flatMap((phase) =>
  QUOTES.flatMap(([name, q]) =>
    [false, true].flatMap((consent) =>
      [false, true].map((banned) => ({
        label: `${phase} / ${name} / consent ${consent} / banned ${banned}`,
        s: { ...initialCheckout, phase, quote: q, consent },
        banned,
      })),
    ),
  ),
);

describe('confirmFooter: Confirm is disabled and says why from one place', () => {
  it('the table reaches every gate outcome, so the checks below are not vacuous', () => {
    const seen = new Set(CASES.map(({ s }) => {
      const g = confirmGate(s);
      return g.ok ? 'ok' : g.reason;
    }));
    expect([...seen].sort()).toEqual(['balance', 'blocked', 'consent', 'ok', 'phase', 'short']);
  });

  it('disabled is exactly a suspension or a closed gate, and the reason is confirmReason unless the body says it, in every state', () => {
    for (const { label, s, banned } of CASES) {
      const f = confirmFooter(s, banned);
      expect(f.disabled, label).toBe(banned || !confirmGate(s).ok);
      expect(f.reason, label).toEqual(f.saidAbove ? null : confirmReason(s, banned));
    }
  });

  it("the body says why exactly when it draws the blocked Band, the balance Band or the shortfall line for the gate's reason", () => {
    // The review body draws the blocked Band on q.blocked, the balance Band on balanceCents === null and the shortfall
    // line on shortfall(q) > 0 (pinned in checkout-bands-no-repeat.test.ts); the footer leaves those to it
    // (no fact is said twice). A suspension and the consent box stay in the footer.
    const seen = new Set<string>();
    for (const { label, s, banned } of CASES) {
      const g = confirmGate(s);
      const above = !banned && !g.ok && (g.reason === 'blocked' || g.reason === 'balance' || g.reason === 'short');
      expect(confirmFooter(s, banned).saidAbove, label).toBe(above);
      if (above) {
        seen.add(g.reason);
        expect(s.phase, label).toBe('review');
        expect(s.quote?.blocked != null || s.quote?.balanceCents === null || shortfall(s.quote) > 0, label).toBe(true);
      }
    }
    expect([...seen].sort()).toEqual(['balance', 'blocked', 'short']);
  });

  it('a reason never shows on a Confirm that can act', () => {
    for (const { label, s, banned } of CASES) {
      const f = confirmFooter(s, banned);
      if (f.reason !== null) expect(f.disabled, label).toBe(true);
    }
  });

  it('`why` is the first failing gate\'s words on every Confirm that cannot act for a nameable reason, and null on one that can act', () => {
    // The reasoned Confirm (a kit ReasonButton, which has no action) is drawn on `why`: it must never be set while the
    // gate is open, and it names the reason whether the footer line or the review body shows it.
    for (const { label, s, banned } of CASES) {
      const f = confirmFooter(s, banned);
      expect(f.why, label).toEqual(f.disabled ? confirmReason(s, banned) : null);
      if (f.why !== null) expect(f.disabled, label).toBe(true);
      if (!f.disabled) expect(f.why, label).toBeNull();
      if (f.reason !== null) expect(f.why, label).toEqual(f.reason);
    }
    const reviews = CASES.filter(({ s }) => s.phase === 'review' && s.quote !== null);
    for (const { label, s, banned } of reviews) expect(confirmFooter(s, banned).why !== null, label).toBe(confirmFooter(s, banned).disabled);
    // While the quote is coming an unsuspended Confirm is off with no words: a plain disabled button.
    expect(confirmFooter({ ...initialCheckout, phase: 'quoting' }, false)).toMatchObject({ disabled: true, why: null });
  });

  it('on a quoted review, Confirm is disabled exactly when the footer or the body says why, never both', () => {
    // A review always carries its quote; while quoting the body shows its skeleton and the footer no reason.
    const reviews = CASES.filter(({ s }) => s.phase === 'review' && s.quote !== null);
    expect(reviews.length).toBeGreaterThan(0);
    for (const { label, s, banned } of reviews) {
      const f = confirmFooter(s, banned);
      expect(f.disabled, label).toBe(f.reason !== null || f.saidAbove);
      expect(f.reason !== null && f.saidAbove, label).toBe(false);
    }
  });

  it('only the open gate on an unsuspended account leaves Confirm on', () => {
    const on = CASES.filter(({ s, banned }) => !confirmFooter(s, banned).disabled);
    expect(on.length).toBeGreaterThan(0);
    for (const { label, s, banned } of on) {
      expect(banned, label).toBe(false);
      expect(s.phase, label).toBe('review');
      expect(confirmGate(s).ok, label).toBe(true);
    }
  });
});

describe("the drawer takes Confirm's disabled state from confirmFooter alone", () => {
  it('one Confirm, disabled by `disabled` only, and the footer gets it and the reason from confirmFooter', () => {
    const confirms = [...drawer.matchAll(/<Button\s+variant="primary"\s+isDisabled=\{([^}]*)\}\s+aria-describedby=\{[^}]*\}\s+onPress=\{co\.confirm\}/g)];
    expect(confirms.map((m) => m[1])).toEqual(['disabled']);
    // The reasoned Confirm beside it has no action (checkout-buy-reason.test.tsx); the Button stays disabled by `disabled`.
    expect(drawer).toMatch(/\{why \? \(\s*<ReasonButton [^>]*>\s*\{confirmLabel\}\s*<\/ReasonButton>\s*\) : \(\s*<Button\s+variant="primary"\s+isDisabled=\{disabled\}/);
    expect(drawer.match(/onPress=\{co\.confirm\}/g)).toHaveLength(1);
    expect(drawer).toContain('const cf = confirmFooter(shown, banned, kind);');
    expect(drawer).toContain('disabled: cf.disabled,');
    expect(drawer).toContain("reason: kind === 'buy' ? cf.reason : null,");
    expect(drawer).toContain('why: cf.why,');
  });
});

// The disabled Confirm's reason words a short wallet by kind, as the body's own short line does.
describe('a short wallet, worded by kind', () => {
  const short: CheckoutState = { ...initialCheckout, phase: 'review', consent: true, quote: quote({ chargeCents: 1200, balanceCents: 880 }) };
  it.each([
    ['pay', 'subs.payShort'],
    ['upgrade', 'up.short'],
    ['buy', 'buy.short'],
  ] as const)('%s says %s, in the reason and the footer why', (kind, k) => {
    expect(confirmReason(short, false, kind)).toEqual({ k, v: { amount: '$3.20' } });
    expect(confirmFooter(short, false, kind).why).toEqual({ k, v: { amount: '$3.20' } });
  });
  it('the drawer passes its kind to confirmFooter', () => {
    expect(drawer).toMatch(/confirmFooter\(shown, banned, kind\)/);
  });
});
