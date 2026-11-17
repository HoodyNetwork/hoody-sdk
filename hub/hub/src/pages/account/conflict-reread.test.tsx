// Vitest: a change the server refuses with 409 (the account changed while it was on its way) reads every read of the
// account page again, and the refusal is answered only once they are in, so a second try goes out against the account
// as it is now; the sentence asks for no reload. Each of the page's three ways of sending a change is covered (a core
// change, the password's own lock, a change whose answer holds a secret), each with a refusal of another status that
// reads nothing again (the control), then the name drawer from the press to the second Save.
import { CoreQueryProvider, queryClient } from '@core';
import { boot, calls, deferred, onFetch, settle, signIn, UID, type Call, type Reply } from '@core/test/env';
import { act, cleanup, render, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useChangePassword, useNewCodes, useProfile, useRename, useTwoFactor } from './data';
import { NameSheet } from './parts/NameSheet';
import { locks } from './parts/locks';
import strings from './strings.en.json';

const flush = async () => {
  for (let i = 0; i < 20; i++) await settle();
};
// Builds a fake credential from parts, so no source line holds a whole key-shaped string.
const fake = (...p: string[]) => p.join('');

const ME = /\/users\/auth\/me(\?|$)/;
const STATUS = /\/users\/auth\/2fa\/status(\?|$)/;
const reads = (p: RegExp): number => calls.filter((c) => c.method === 'GET' && p.test(c.url)).length;
const sends = (): number => calls.filter((c) => c.method !== 'GET').length;

const conflict: Reply = { status: 409, body: { error: 'CREDENTIALS_CHANGED', message: 'Account credentials changed while the request was in flight' } };
const refused: Reply = { status: 400, body: { error: 'VALIDATION_ERROR' } };

// The page's reads answer (the 2FA status waits for `answer.hold` while one is set); every change answers `answer.now`,
// set by each step.
const answer: { now: Reply; hold: Promise<void> | null } = { now: refused, hold: null };
const status: Reply = { status: 200, body: { data: { enabled: true, verified: true, backup_codes_remaining: 8, require_for_tokens: false } } };
const handler = (c: Call): Reply | Promise<Reply> => {
  if (c.method !== 'GET') return answer.now;
  if (ME.test(c.url)) return { status: 200, body: { data: { id: UID, username: 'ada', alias: 'Ada', email: 'ada@example.com' } } };
  if (STATUS.test(c.url)) return answer.hold ? answer.hold.then(() => status) : status;
  return { status: 404, body: {} };
};
afterEach(cleanup);

const fresh = () => {
  boot();
  signIn();
  queryClient.clear();
  locks.clear();
  answer.now = refused;
  answer.hold = null;
  onFetch(handler);
};

type Answer = { outcome: string; code?: string; status?: number };
type Run = (vars: never) => Promise<Answer>;

// The hook under test beside two reads of the page: the profile and the 2FA status.
async function mount(useHook: () => { run: Run }): Promise<(vars: unknown) => Promise<Answer>> {
  const out: { run?: Run } = {};
  function Probe() {
    out.run = useHook().run;
    useProfile();
    useTwoFactor();
    return null;
  }
  render(<Probe />, { wrapper: CoreQueryProvider });
  await act(flush);
  return (vars) => out.run!(vars as never);
}

const cases: ReadonlyArray<readonly [string, () => { run: Run }, unknown]> = [
  ['the display name (a core change)', useRename, { alias: 'Grace' }],
  ['the password (its own lock)', useChangePassword, { current: 'old', password: fake('New-Pass', '-1234') }],
  ['new backup codes (an answer holding a secret)', useNewCodes, { password: 'pw', code: '123456' }],
];

describe('a change refused with 409 reads the account page again', () => {
  for (const [name, useHook, vars] of cases) {
    it(name, async () => {
      fresh();
      const run = await mount(useHook);
      const me = reads(ME);
      const st = reads(STATUS);
      expect(me).toBeGreaterThan(0);
      expect(st).toBeGreaterThan(0);

      // The control: a refusal of another status reads nothing again.
      let r: Answer = { outcome: '' };
      await act(async () => {
        r = await run(vars);
        await flush();
      });
      expect(r).toMatchObject({ outcome: 'failed', status: 400 });
      expect([reads(ME), reads(STATUS)]).toEqual([me, st]);

      // A 409: the profile and the 2FA status are both read again, not only the change's own reads, and the refusal is
      // answered only once they are in (the status read is held here, then let go).
      answer.now = conflict;
      const gate = deferred();
      answer.hold = gate.p;
      let answered = false;
      let sent!: Promise<Answer>;
      await act(async () => {
        sent = run(vars).then((x) => {
          answered = true;
          return x;
        });
        await flush();
      });
      expect(reads(ME)).toBeGreaterThan(me);
      expect(reads(STATUS)).toBeGreaterThan(st);
      expect(answered).toBe(false);
      answer.hold = null;
      await act(async () => {
        gate.res();
        r = await sent;
        await flush();
      });
      expect(r).toMatchObject({ outcome: 'failed', status: 409 });

      // Nothing is held: the next try is sent.
      const before = sends();
      await act(async () => {
        r = await run(vars);
        await flush();
      });
      expect(r.code).not.toBe('READ_BACK_FIRST');
      expect(sends()).toBe(before + 1);
    });
  }
});

describe('the name drawer after a 409', () => {
  it('says to try again with no reload, reads the profile again, and the second Save goes through', async () => {
    fresh();
    answer.now = conflict;
    const done = vi.fn();
    render(<NameSheet open onClose={() => undefined} onDone={done} />, { wrapper: CoreQueryProvider });
    await act(flush);
    // Within the drawer: its title reads the same as the field's label, so the drawer itself is labelled by it too.
    const dialog = await waitFor(() => {
      const d = document.querySelector<HTMLElement>('[role="dialog"]');
      if (!d) throw new Error('no open drawer');
      return d;
    });
    const field = within(dialog).getByLabelText(strings['p.alias']);
    expect(field).toHaveValue('Ada');
    await userEvent.clear(field);
    await userEvent.type(field, 'Grace');

    const me = reads(ME);
    await userEvent.click(within(dialog).getByRole('button', { name: strings['p.save'] }));
    await act(flush);
    expect(await within(dialog).findByText(strings['err.changed'])).toBeInTheDocument();
    expect(strings['err.changed']).not.toMatch(/reload/i);
    expect(reads(ME)).toBeGreaterThan(me);
    expect(done).not.toHaveBeenCalled();

    answer.now = { status: 200, body: { data: { id: UID, username: 'ada', alias: 'Grace', email: 'ada@example.com' } } };
    await userEvent.click(within(dialog).getByRole('button', { name: strings['p.save'] }));
    await act(flush);
    expect(done).toHaveBeenCalledTimes(1);
    expect(calls.filter((c) => c.method === 'PUT').map((c) => c.body)).toEqual([{ alias: 'Grace' }, { alias: 'Grace' }]);
  });
});
