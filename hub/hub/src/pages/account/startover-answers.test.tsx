// Vitest: each warned Start over acts on core's answer, both ways. Core answers once the free is stored:
// true settles the page lock and clears the warning; false (refused: replaced, already settled, a switch during its
// store-lock turn) keeps the lock, the hold and the warning. The data hooks are fakes whose dismiss answers what the
// row sets, so each branch is reached on purpose (the live wrappers answer true in fixture mode). A held answer
// (`fake.held`) lands only when the row releases it, so a context change or a newer send can come first: the late
// answer then commits nothing.
import { bump } from '@core/ctx';
import { boot, signIn } from '@core/test/env';
import type { HeldRow } from '@core';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Data from './data';
import { PasswordSheet } from './parts/PasswordSheet';
import { SetupSheet } from './parts/SetupSheet';
import { TwoFactorSection } from './parts/TwoFactorSection';
import { locks } from './parts/locks';
import strings from './strings.en.json';

const fake = vi.hoisted(() => ({
  // What each dismiss answers.
  pw: true,
  codes: true,
  start: true,
  verify: true,
  // The set-up drawer's verify step is held by core (its own lock), with one shown row.
  verifyHeld: false,
  calls: [] as string[],
  // Answers held until the row lets them land.
  held: {} as Partial<Record<'pw' | 'codes' | 'start' | 'verify', { p: Promise<boolean>; land: () => void }>>,
}));
const answer = (name: 'pw' | 'codes' | 'start' | 'verify') => () => {
  fake.calls.push(name);
  return fake.held[name]?.p ?? Promise.resolve(fake[name]);
};
/** Holds `name`'s next answer (what fake[name] says when it lands). */
const holdAnswer = (name: 'pw' | 'codes' | 'start' | 'verify') => {
  let land!: () => void;
  const p = new Promise<boolean>((r) => { land = () => r(fake[name]); });
  fake.held[name] = { p, land };
  return async () => { await act(async () => { land(); await flush(); }); };
};
const unread = { isPending: false, isError: true, error: new Error('down'), data: undefined, refetch: async () => ({ isError: true, data: undefined }) };
const hook = (name: 'codes' | 'start' | 'verify', extra: Record<string, unknown> = {}) => ({
  run: async () => ({ outcome: 'pending' as const }),
  running: false,
  pending: false,
  readBack: async () => false,
  heldNow: (): readonly HeldRow[] => [],
  dismissShown: answer(name),
  dismissRows: answer(name),
  ...extra,
});
vi.mock('./data', async (orig) => {
  const data = await orig<typeof Data>();
  return {
    ...data,
    useChangePassword: () => ({ run: async () => ({ outcome: 'pending' as const }), running: false, pending: true, readBack: async () => false, dismiss: answer('pw') }),
    useProfile: () => ({ ...unread, refetch: async () => ({ isError: true, data: undefined }) }),
    useTwoFactor: () => unread,
    useSetGate: () => hook('codes'),
    useTurnOff: () => hook('codes'),
    useNewCodes: () => hook('codes'),
    useStartSetup: () => hook('start'),
    useVerifySetup: () => hook('verify', fake.verifyHeld ? { pending: true, heldNow: () => [{ hold: 'v1' } as unknown as HeldRow] } : {}),
  };
});
const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};
const click = async (name: string) => {
  await act(async () => {
    fireEvent.click(await screen.findByRole('button', { name }));
    await flush();
  });
};
const hold = (op: 'password' | 'codes' | 'setup') => {
  locks.sent(op);
  locks.settle(op, true);
};
const pendingOp = (op: string) => locks.snapshot().get(op) === 'pending';

beforeEach(() => {
  boot();
  signIn();
  locks.clear();
  Object.assign(fake, { pw: true, codes: true, start: true, verify: true, calls: [], verifyHeld: false, held: {} });
});

describe('the password drawer: Start over acts on core\'s answer', () => {
  const armed = async () => {
    hold('password');
    render(<PasswordSheet open onClose={() => undefined} onChanged={() => undefined} onUnsure={() => undefined} />);
    await click(strings['check.again']);
    expect(await screen.findByRole('button', { name: strings['check.startOver'] })).toBeInTheDocument();
  };
  it('freed: the lock settles and Start over goes', async () => {
    await armed();
    await click(strings['check.startOver']);
    expect(fake.calls).toEqual(['pw']);
    expect(pendingOp('password')).toBe(false);
    expect(screen.queryByRole('button', { name: strings['check.startOver'] })).toBeNull();
  });
  it('not freed: the lock stays pending and Start over stays', async () => {
    fake.pw = false;
    await armed();
    await click(strings['check.startOver']);
    expect(fake.calls).toEqual(['pw']);
    expect(pendingOp('password')).toBe(true);
    expect(screen.getByRole('button', { name: strings['check.startOver'] })).toBeInTheDocument();
  });
});

describe('the password drawer: a late answer commits nothing outside its press', () => {
  const armed = async () => {
    hold('password');
    render(<PasswordSheet open onClose={() => undefined} onChanged={() => undefined} onUnsure={() => undefined} />);
    await click(strings['check.again']);
  };
  it('a context change before the answer: the lock stays', async () => {
    const land = holdAnswer('pw');
    await armed();
    await click(strings['check.startOver']);
    act(() => { bump('switch'); });
    await land();
    // The switch itself resets the drawer's warning; what matters is that the late answer frees nothing.
    expect(pendingOp('password')).toBe(true);
  });
  it('a newer send of the change before the answer: its lock stays', async () => {
    const land = holdAnswer('pw');
    await armed();
    await click(strings['check.startOver']);
    act(() => hold('password'));
    await land();
    expect(pendingOp('password')).toBe(true);
    expect(screen.getByRole('button', { name: strings['check.startOver'] })).toBeInTheDocument();
  });
});

describe('the two-step section: Start over settles each lock on its own answer', () => {
  const armed = async (ops: Array<'codes' | 'setup'>) => {
    for (const op of ops) hold(op);
    render(<TwoFactorSection onOpen={() => undefined} />);
    await click(strings['check.again']);
    expect(await screen.findByRole('button', { name: strings['check.startOver'] })).toBeInTheDocument();
  };
  it('codes freed: its lock settles and Start over goes', async () => {
    await armed(['codes']);
    await click(strings['check.startOver']);
    expect(pendingOp('codes')).toBe(false);
    expect(screen.queryByRole('button', { name: strings['check.startOver'] })).toBeNull();
  });
  it('codes not freed: its lock stays and Start over stays', async () => {
    fake.codes = false;
    await armed(['codes']);
    await click(strings['check.startOver']);
    expect(pendingOp('codes')).toBe(true);
    expect(screen.getByRole('button', { name: strings['check.startOver'] })).toBeInTheDocument();
  });
  it('codes freed, set-up start refused: codes settles, set-up stays, the warning stays', async () => {
    fake.start = false;
    await armed(['codes', 'setup']);
    await click(strings['check.startOver']);
    expect(fake.calls.sort()).toEqual(['codes', 'start']);
    expect(pendingOp('codes')).toBe(false);
    expect(pendingOp('setup')).toBe(true);
    expect(screen.getByRole('button', { name: strings['check.startOver'] })).toBeInTheDocument();
  });
  it('codes refused, set-up start freed: set-up settles, codes stays, the warning stays', async () => {
    fake.codes = false;
    await armed(['codes', 'setup']);
    await click(strings['check.startOver']);
    expect(pendingOp('codes')).toBe(true);
    expect(pendingOp('setup')).toBe(false);
    expect(screen.getByRole('button', { name: strings['check.startOver'] })).toBeInTheDocument();
  });
});

describe('the two-step section: a late answer commits nothing outside its press', () => {
  it('codes freed, set-up answers late after a newer codes send: the newer codes lock stays', async () => {
    const land = holdAnswer('start');
    for (const op of ['codes', 'setup'] as const) hold(op);
    render(<TwoFactorSection onOpen={() => undefined} />);
    await click(strings['check.again']);
    await click(strings['check.startOver']);
    act(() => hold('codes'));
    await land();
    expect(pendingOp('codes')).toBe(true);
    expect(pendingOp('setup')).toBe(false);
    expect(screen.getByRole('button', { name: strings['check.startOver'] })).toBeInTheDocument();
  });
  it('a context change before the answers: both locks stay', async () => {
    const land = holdAnswer('start');
    for (const op of ['codes', 'setup'] as const) hold(op);
    render(<TwoFactorSection onOpen={() => undefined} />);
    await click(strings['check.again']);
    await click(strings['check.startOver']);
    act(() => { bump('switch'); });
    await land();
    expect(pendingOp('codes')).toBe(true);
    expect(pendingOp('setup')).toBe(true);
  });
});

describe('the set-up drawer: Start over frees the verify hold, then the start, and acts on both answers', () => {
  const armed = async () => {
    hold('setup');
    fake.verifyHeld = true;
    render(<SetupSheet open onClose={() => undefined} onOn={() => undefined} />);
    await click(strings['check.again']);
    expect(await screen.findByRole('button', { name: strings['check.startOver'] })).toBeInTheDocument();
  };
  it('both freed: the start is dismissed too, the lock settles, no note', async () => {
    await armed();
    await click(strings['check.startOver']);
    expect(fake.calls).toEqual(['verify', 'start']);
    expect(pendingOp('setup')).toBe(false);
    expect(screen.queryByText(strings['check.nothing'])).toBeNull();
  });
  it('verify refused: the start is not asked, the lock stays, the note shows', async () => {
    fake.verify = false;
    await armed();
    await click(strings['check.startOver']);
    expect(fake.calls).toEqual(['verify']);
    expect(pendingOp('setup')).toBe(true);
    expect(await screen.findByText(strings['check.nothing'])).toBeInTheDocument();
  });
  it('start refused: the lock stays, the note shows', async () => {
    fake.start = false;
    await armed();
    await click(strings['check.startOver']);
    expect(fake.calls).toEqual(['verify', 'start']);
    expect(pendingOp('setup')).toBe(true);
    expect(await screen.findByText(strings['check.nothing'])).toBeInTheDocument();
  });
});

describe('the set-up drawer: a late verify answer starts nothing outside its press', () => {
  const armed = async () => {
    hold('setup');
    fake.verifyHeld = true;
    render(<SetupSheet open onClose={() => undefined} onOn={() => undefined} />);
    await click(strings['check.again']);
  };
  it('a context change before verify answers: the start step is never asked, the lock stays, no note', async () => {
    const land = holdAnswer('verify');
    await armed();
    await click(strings['check.startOver']);
    act(() => { bump('switch'); });
    await land();
    expect(fake.calls).toEqual(['verify']);
    expect(pendingOp('setup')).toBe(true);
    expect(screen.queryByText(strings['check.nothing'])).toBeNull();
  });
  it('a newer set-up send before verify answers: the start step is never asked, its lock stays, no note', async () => {
    const land = holdAnswer('verify');
    await armed();
    await click(strings['check.startOver']);
    act(() => hold('setup'));
    await land();
    expect(fake.calls).toEqual(['verify']);
    expect(pendingOp('setup')).toBe(true);
    expect(screen.queryByText(strings['check.nothing'])).toBeNull();
  });
  it('a newer set-up send before the start answer: its lock stays', async () => {
    const land = holdAnswer('start');
    await armed();
    await click(strings['check.startOver']);
    act(() => hold('setup'));
    await land();
    expect(fake.calls).toEqual(['verify', 'start']);
    expect(pendingOp('setup')).toBe(true);
  });
});
