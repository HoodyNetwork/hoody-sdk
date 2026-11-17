// Vitest: Edit, Delete and links held off because the agent's list of idea-made scripts is not read.
// The agent answers 503 ownership_unknown / restriction_unknown for causes that never clear by themselves: it is signed out, its
// stored login was rejected, or a realm of the computer keeps its data nowhere yet. The deployed agents answer one code for all,
// so the page tells them apart by its own read of the agent's sign-in. Pinned: each cause has its own true sentence and its
// action (the shared agent sign-in for the first two, Check again for the rest); no sentence says it clears by itself; the hold
// itself stays (fail closed); nothing is read without a press. Replaced in '@core': the sign-in, the status reads, the context.
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as Core from '@core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { writable } from './logic';
import { OwnerHeld } from './parts/OwnerHeld';
import { ownerHeld, readOnlyNote, readOnlyText } from './parts/readOnly';
import { shareWhy, shareWhyKey } from './parts/share';
import strings from './strings.en.json';
import type { CompScripts } from './types';

const S = strings as Record<string, string>;
const READY = { auth_active: true, account_id: 'acct1', owner_fingerprint: 'fp1', restriction: 'none' };

const w = vi.hoisted(() => ({ offered: true, order: [] as string[], status: 'login' as string, signIn: (async () => ({ kind: 'signedIn' })) as () => Promise<unknown> }));
vi.mock('@core', async (orig) => {
  const real = await orig<typeof Core>();
  const target = () => ({ project: { id: 'p1' }, container: { id: 'c1' } });
  return {
    ...real,
    capture: () => ({ account: 'acct1', target: target(), gen: 1 }),
    useCore: () => ({ target: target(), account: 'acct1' }),
    signInOffered: () => w.offered,
    agentBaseFor: () => 'https://agent.example/',
    signInAgent: async () => { w.order.push('signIn'); return w.signIn(); },
    checkAgentLogin: async () => { w.order.push('check'); return w.status; },
    refreshFresh: async () => { w.order.push('reread'); return { state: 'fresh', answers: [{ data: READY }] }; },
    watchComputer: () => () => undefined,
  };
});

const err = (code: string) => ({ kind: 'server', code, status: 503 });
const caps = { revisions: true } as never;
const comp = (agent: Record<string, unknown>, code = 'ownership_unknown'): CompScripts => ({
  id: 'c1', name: 'atlas', caps, instances: null, ownerRead: { k: 'failed', kind: 'server', error: err(code) },
  agent: { templates: true, guardedDelete: false, writer: false, ...agent },
} as never);
const OUT = { writerWhy: 'login', signIn: 'offer' };
const REJECTED = { writerWhy: 'login', signIn: 'renew' };
const IN = { writer: true };
const Held = OwnerHeld;
const item = { managed: null, ownershipUnknown: true, path: 'default/1/a.ts', route: '/a' };

beforeEach(() => { w.offered = true; w.status = 'login'; w.order.length = 0; w.signIn = async () => ({ kind: 'signedIn' }); });

describe('why the list of idea-made scripts is not read', () => {
  it('tells the causes apart by the agent\'s sign-in, for both of the agent\'s codes', () => {
    for (const code of ['ownership_unknown', 'restriction_unknown']) {
      expect(ownerHeld(comp(OUT, code))).toBe('signedOut');
      expect(ownerHeld(comp(REJECTED, code))).toBe('rejected');
      expect(ownerHeld(comp(IN, code))).toBe('noHost');
      // Signed in, only no realm chosen for the assistant: the sign-in is still not the cause.
      expect(ownerHeld(comp({ writerWhy: 'realm' }, code))).toBe('noHost');
      // The sign-in is not known to the page (still read, another account, no identity yet, an old agent): no cause is claimed.
      for (const why of ['loading', 'account', 'identity', 'old']) expect(ownerHeld(comp({ writerWhy: why }, code))).toBe('notOpen');
    }
    expect(ownerHeld({ instances: null, ownerRead: { k: 'failed', kind: 'server', error: err('ownership_unknown') } })).toBe('notOpen');
  });

  it('any other failure is not blamed on the sign-in, and a read list holds nothing', () => {
    expect(ownerHeld(comp(OUT, 'internal'))).toBe('failed');
    expect(ownerHeld({ ...comp(OUT), ownerRead: { k: 'failed', kind: 'network', error: { kind: 'network' } } })).toBe('failed');
    expect(ownerHeld({ ...comp(OUT), ownerRead: { k: 'reading' } })).toBe('reading');
    expect(ownerHeld({ ...comp(OUT), instances: {} })).toBeNull();
  });

  it('each cause has its own sentence on the Code and Settings tabs and on the links', () => {
    const t = (k: string) => S[k]!;
    const cases = [[OUT, 'SignedOut', 'signedOut'], [REJECTED, 'Rejected', 'rejected'], [IN, 'NoHost', 'noHost'], [{ writerWhy: 'identity' }, 'NotOpen', 'notOpen']] as const;
    const seen = new Set<string>();
    for (const [agent, key, kind] of cases) {
      const n = readOnlyNote(item, comp(agent));
      expect(n).toEqual({ title: `code.owner${key}`, body: `code.owner${key}Body` });
      const line = readOnlyText(t, n!);
      expect(line).toContain(S[`code.owner${key}Body`]);
      seen.add(line);
      const why = shareWhy(item, comp(agent), false);
      expect(why).toMatchObject({ k: 'ownerFailed', kind });
      expect(S[shareWhyKey(why!)], kind).toBeTruthy();
      seen.add(S[shareWhyKey(why!)]!);
    }
    expect(seen.size).toBe(8);
    expect(S['code.ownerSignedOutBody']).toMatch(/isn't signed in/);
    expect(S['code.ownerRejectedBody']).toMatch(/signed out/);
    expect(S['code.ownerNoHostBody']).toMatch(/is signed in/);
  });

  it('no sentence of the page says the hold clears by itself or in a moment', () => {
    for (const [k, v] of Object.entries(S)) {
      if (!/^(code\.owner|code\.unknownOwner|share\.why\.owner|owner\.)/.test(k)) continue;
      expect(v, k).not.toMatch(/on its own|clears by itself|in a moment|isn't in use/i);
      expect(v, k).not.toMatch(/503|ownership_unknown|restriction_unknown/);
    }
    for (const k of ['code.ownerNoHostBody', 'code.ownerNotOpenBody', 'share.why.ownerFailed.noHost', 'share.why.ownerFailed.notOpen', 'owner.noHost', 'owner.notOpen']) expect(S[k], k).toMatch(/doesn't clear by itself/);
  });

  it('the hold itself stays: a script whose ownership is not read is never writable', () => {
    expect(writable(item, caps)).toBe('unknown');
  });
});

describe('above the tabs: what the person can do now', () => {
  it('a signed-out agent: says so, and the shared sign-in signs it in and reads the page again', async () => {
    const onChanged = vi.fn();
    render(<Held comp={comp(OUT)} onChanged={onChanged} />);
    expect(screen.getByText(S['owner.signedOut']!.replace('{{computer}}', 'atlas'))).toBeTruthy();
    expect(w.order).toEqual([]); // nothing is read or sent before a press
    await userEvent.click(screen.getByRole('button', { name: S['owner.signIn'] }));
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(w.order[0]).toBe('signIn');
    expect(w.order.filter((x) => x === 'signIn')).toHaveLength(1);
    // The status and the ownership list, each read again after the proof.
    expect(w.order.filter((x) => x === 'reread')).toHaveLength(2);
  });

  it('a rejected login: the same sign-in, and the tabs say it was signed out', () => {
    render(<Held comp={comp(REJECTED)} onChanged={() => undefined} />);
    expect(screen.getByText(S['owner.rejected']!.replace('{{computer}}', 'atlas'))).toBeTruthy();
    expect(screen.getByRole('button', { name: S['owner.signIn'] })).toBeTruthy();
  });

  it('shared access: no sign-in button, the shared note says who can', () => {
    w.offered = false;
    render(<Held comp={comp(OUT)} onChanged={() => undefined} />);
    expect(screen.queryByRole('button', { name: S['owner.signIn'] })).toBeNull();
    expect(screen.getByText(S['owner.signedOutShared']!.replace('{{computer}}', 'atlas'))).toBeTruthy();
  });

  it('a sign-in whose outcome is not known is never called failed, and is not sent again', async () => {
    w.signIn = async () => ({ kind: 'unknown' });
    render(<Held comp={comp(OUT)} onChanged={() => undefined} />);
    await userEvent.click(screen.getByRole('button', { name: S['owner.signIn'] }));
    expect(await screen.findByText(S['owner.signInUnknown']!.replace('{{computer}}', 'atlas'))).toBeTruthy();
    expect(screen.queryByRole('button', { name: S['owner.signIn'] })).toBeNull();
    expect(screen.getByRole('button', { name: S['share.check'] })).toBeTruthy();
  });

  // Check again takes the ownership read through "reading" (a failed read with no data starts over as pending).
  it('an unknown sign-in keeps its hold while the ownership read is read again: no second sign-in', async () => {
    w.signIn = async () => ({ kind: 'unknown' });
    const r = render(<Held comp={comp(OUT)} onChanged={() => undefined} />);
    await userEvent.click(screen.getByRole('button', { name: S['owner.signIn'] }));
    await screen.findByText(S['owner.signInUnknown']!.replace('{{computer}}', 'atlas'));
    r.rerender(<Held comp={{ ...comp(OUT), ownerRead: { k: 'reading' } } as never} onChanged={() => undefined} />);
    r.rerender(<Held comp={comp(OUT)} onChanged={() => undefined} />);
    expect(screen.queryByRole('button', { name: S['owner.signIn'] })).toBeNull();
    expect(screen.getByText(S['owner.signInUnknown']!.replace('{{computer}}', 'atlas'))).toBeTruthy();
    expect(w.order.filter((x) => x === 'signIn')).toHaveLength(1);
  });

  it('a newer agent that names the cause itself gets the same sentences', () => {
    expect(ownerHeld(comp(IN, 'not_logged_in'))).toBe('signedOut');
    expect(ownerHeld(comp({ writerWhy: 'loading' }, 'hoody_auth_expired'))).toBe('rejected');
    expect(shareWhy(item, { ...comp(OUT, 'not_logged_in'), ownerRead: { k: 'failed', kind: 'forbidden', error: { code: 'not_logged_in' } } } as never, false)).toMatchObject({ kind: 'signedOut' });
  });

  it('a refused sign-in says it was not signed in and where to do it; nothing more is sent', async () => {
    w.signIn = async () => ({ kind: 'refused', reason: 'disabled' });
    render(<Held comp={comp(OUT)} onChanged={() => undefined} />);
    await userEvent.click(screen.getByRole('button', { name: S['owner.signIn'] }));
    expect(await screen.findByText(S['owner.signInRefused']!.replace('{{computer}}', 'atlas'))).toBeTruthy();
    expect(w.order.filter((x) => x === 'signIn')).toHaveLength(1);
  });

  it('a refusal the person can answer keeps the sign-in: Try again is the same press', async () => {
    w.signIn = async () => ({ kind: 'refused', reason: 'key' });
    render(<Held comp={comp(OUT)} onChanged={() => undefined} />);
    await userEvent.click(screen.getByRole('button', { name: S['owner.signIn'] }));
    expect(await screen.findByText(S['owner.signInRetry']!.replace('{{computer}}', 'atlas'))).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: S['owner.tryAgain'] }));
    await waitFor(() => expect(w.order.filter((x) => x === 'signIn')).toHaveLength(2));
  });

  it('another account holding the agent is not called a failed sign-in, and nothing more is sent', async () => {
    w.signIn = async () => ({ kind: 'notAllowed', reason: 'otherAccount' });
    render(<Held comp={comp(OUT)} onChanged={() => undefined} />);
    await userEvent.click(screen.getByRole('button', { name: S['owner.signIn'] }));
    expect(await screen.findByText(S['owner.otherAccount']!.replace('{{computer}}', 'atlas'))).toBeTruthy();
    expect(screen.queryByText(S['owner.signInRefused']!.replace('{{computer}}', 'atlas'))).toBeNull();
    expect(screen.queryByRole('button', { name: S['owner.signIn'] })).toBeNull();
    expect(w.order.filter((x) => x === 'signIn')).toHaveLength(1);
  });

  it('a proven sign-in the page does not show yet is the agent\'s word, with a Check again that only reads', async () => {
    const onChanged = vi.fn();
    render(<Held comp={comp(OUT)} onChanged={onChanged} />);
    await userEvent.click(screen.getByRole('button', { name: S['owner.signIn'] }));
    expect(await screen.findByText(S['owner.signedIn']!.replace('{{computer}}', 'atlas'))).toBeTruthy();
    expect(S['owner.signedIn']).toMatch(/doesn't show it yet/);
    expect(screen.queryByRole('button', { name: S['owner.signIn'] })).toBeNull();
    w.order.length = 0;
    await userEvent.click(screen.getByRole('button', { name: S['share.check'] }));
    await waitFor(() => expect(w.order).toContain('check'));
    expect(w.order).not.toContain('signIn');
  });

  it('an agent that names its sign-in as the cause gets the sign-in, whatever the page\'s status read shows', () => {
    for (const [code, key] of [['not_logged_in', 'owner.signedOut'], ['hoody_auth_expired', 'owner.rejected']] as const) {
      const r = render(<Held comp={comp(IN, code)} onChanged={() => undefined} />);
      expect(screen.getByText(S[key]!.replace('{{computer}}', 'atlas'))).toBeTruthy();
      expect(screen.getByRole('button', { name: S['owner.signIn'] })).toBeTruthy();
      r.unmount();
    }
  });

  it('an older Scripts program: the sign-in still shows; with none to offer, the older-program line', () => {
    const a = render(<Held old comp={comp(OUT)} onChanged={() => undefined} />);
    expect(screen.getByRole('button', { name: S['owner.signIn'] })).toBeTruthy();
    a.unmount();
    for (const c of [comp(IN), { ...comp(OUT), instances: {} }]) {
      const r = render(<Held old comp={c as never} onChanged={() => undefined} />);
      expect(r.container.textContent).toBe(S['notice.old']);
      r.unmount();
    }
  });

  it('signed in and still not open: the remedy line and Check again, no sign-in', async () => {
    const onChanged = vi.fn();
    render(<Held comp={comp(IN)} onChanged={onChanged} />);
    expect(screen.getByText(S['owner.noHost']!.replace('{{computer}}', 'atlas'))).toBeTruthy();
    expect(screen.queryByRole('button', { name: S['owner.signIn'] })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: S['share.check'] }));
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(w.order).toEqual([]);
  });

  it('a sign-in the page does not know: the plain line and Check again', () => {
    render(<Held comp={comp({ writerWhy: 'identity' })} onChanged={() => undefined} />);
    expect(screen.getByText(S['owner.notOpen']!.replace('{{computer}}', 'atlas'))).toBeTruthy();
    expect(screen.getByRole('button', { name: S['share.check'] })).toBeTruthy();
  });

  it('nothing here for a list still being read, read, or failed another way', () => {
    for (const c of [{ ...comp(IN), ownerRead: { k: 'reading' } }, { ...comp(OUT), instances: {} }, comp(IN, 'internal')]) {
      const r = render(<Held comp={c as never} onChanged={() => undefined} />);
      expect(r.container.textContent).toBe('');
      r.unmount();
    }
  });
});
