// Jump to leaves out Account's places the view does not draw: on a token session
// the passcode lock, on a suspended account all but Sign-in sessions, and its sheet commands. Read against the real
// deep index, and through the reader the shell loads (manifest searchHide) in the page's own context.
import { renderPage, screen } from '@app/testing';
import type * as Core from '@core';
import { hidesTail } from '@kit';
import { DEEP } from 'virtual:hub-search-index';
import { describe, expect, it, vi } from 'vitest';
import page from './page';
import useAccountSearchHide, { accountHide } from './searchHide';

const as = vi.hoisted(() => ({ token: false }));
vi.mock('@core', async (orig) => {
  const core = await orig<typeof Core>();
  return { ...core, capture: (...a: Parameters<typeof core.capture>) => {
    const c = core.capture(...a);
    return as.token ? { ...c, page: { ...(c.page ?? {}), kind: 'token' } } : c;
  } };
});

const mine = DEEP.filter((e) => e.page === 'account');
const shown = (h: ReturnType<typeof accountHide>) => mine.filter((e) => !hidesTail(h, e.to));
const passcode = mine.filter((e) => e.to === '?section=passcode');
const sessions = mine.filter((e) => e.to === '?section=sessions');

describe('Account in Jump to', () => {
  it('an ordinary account on an account session, two-step off: every place', () => {
    expect(accountHide({ suspended: false, token: false, twoStep: 'off' })).toBeNull();
  });

  it('a token session: every place but the passcode lock and its rows', () => {
    expect(passcode.length).toBeGreaterThan(1); // the section and its rows are in the index
    const h = accountHide({ suspended: false, token: true, twoStep: 'off' });
    expect(shown(h)).toEqual(mine.filter((e) => !passcode.includes(e)));
  });

  it('a suspended account: Sign-in sessions and its rows only, no question, on either session', () => {
    expect(sessions.some((e) => e.kind === 'section')).toBe(true);
    expect(mine.some((e) => e.kind === 'faq')).toBe(true);
    for (const token of [false, true]) expect(shown(accountHide({ suspended: true, token, twoStep: 'off' }))).toEqual(sessions);
  });

  it('a suspended account: the commands whose sheet it never opens are named, and they are the manifest\'s', () => {
    const ids = (page.commands ?? []).map((c) => c.id);
    const named = accountHide({ suspended: true, token: false, twoStep: 'off' })?.commands ?? [];
    expect(named).toEqual(['password', 'twofa']);
    for (const id of named) expect(ids).toContain(id);
    const tos = (page.commands ?? []).filter((c) => named.includes(c.id)).map((c) => c.to);
    expect(tos).toEqual(['/account?sheet=password', '/account?sheet=setup']);
    expect(accountHide({ suspended: false, token: true, twoStep: 'off' })?.commands).toBeUndefined();
  });

  // Set up opens only while two-step reads off (logic.ts openableSheet): with it on, or its status unknown, the
  // command is left out, on either session. Every place stays (the two-step section holds Turn off).
  it('two-step on or unknown: the Set up command is left out, every place kept', () => {
    for (const twoStep of ['on', 'unknown'] as const) {
      const h = accountHide({ suspended: false, token: false, twoStep });
      expect(h?.commands).toEqual(['twofa']);
      expect(shown(h)).toEqual(mine);
      const ht = accountHide({ suspended: false, token: true, twoStep });
      expect(ht?.commands).toEqual(['twofa']);
      expect(shown(ht)).toEqual(mine.filter((e) => !passcode.includes(e)));
    }
    expect(mine.some((e) => e.to.startsWith('?section=two-step'))).toBe(true);
  });

  // The reader in the page's context (fixtures, core identity, capture), drawn as text by a stand-in view. The
  // default fixture has two-step on.
  const Probe = () => <output>{JSON.stringify(useAccountSearchHide())}</output>;
  const probe = { ...page, load: async () => ({ default: Probe }) };
  it.each([
    ['twofa-off', false, 'null'],
    ['', false, JSON.stringify({ hide: [], commands: ['twofa'] })],
    ['twofa-unreadable', false, JSON.stringify({ hide: [], commands: ['twofa'] })],
    ['suspended', false, JSON.stringify({ only: ['?section=sessions'], commands: ['password', 'twofa'] })],
    ['twofa-off', true, JSON.stringify({ hide: ['?section=passcode'] })],
    ['', true, JSON.stringify({ hide: ['?section=passcode'], commands: ['twofa'] })],
  ])('the reader answers in state "%s" (token %s): %s', async (state, token, want) => {
    as.token = token;
    await renderPage(probe, state ? { state } : {});
    expect(await screen.findByText(want, {}, { timeout: 8000 })).toBeInTheDocument();
  });
});
