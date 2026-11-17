// TokenSignIn.tsx: hiding the page ends the access-key way like Back. A checked key (the confirm card), a realm pick
// holding the key, and a check still out are all dropped; the empty key form is what the page shows again (a page kept
// in the back/forward cache). Without a page hide the confirm card opens the session once (control).
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TokenSignIn } from './TokenSignIn';

const TOKEN = 'hdy_' + 'a'.repeat(24) + '_' + 'b'.repeat(48);
const R1 = '1'.repeat(24);
const R2 = '2'.repeat(24);
const UID = '64f0c0ffee0000000000aaaa';
const NAMES = ['apiCall', 'parseTokenIntrospection', 'installTokenSession', 'readAuthRev', 'classifyStoredAuth', 'realmApiDomain', 'standaloneApiHeld', 'isFramedPage'] as const;

/** The shared.js / token-auth.js globals, with every apiCall answered only when the test says so. */
function installGlobals(realmIds: string[] = [R1]) {
  const pending: Array<() => void> = [];
  const installs: unknown[] = [];
  const g = globalThis as unknown as Record<string, unknown>;
  g.apiCall = (_m: string, path: string) => new Promise((resolve) => {
    pending.push(() => { resolve(path === '/auth/tokens/me' ? { data: 'intro' } : { data: { id: UID, username: 'owner' } }); });
  });
  g.parseTokenIntrospection = () => ({ id: 't1', alias: 'shared', perms: { computers: { read: true }, projects: { read: true } }, expiresAt: null, realmIds, allowNoRealm: false, isEnabled: true });
  g.installTokenSession = (rec: unknown) => { installs.push(rec); return { ok: true }; };
  g.readAuthRev = () => 'r0';
  g.classifyStoredAuth = () => 'none';
  g.realmApiDomain = () => 'api.hoody.test';
  g.standaloneApiHeld = () => true;
  g.isFramedPage = () => false;
  /** Answers every request sent so far, then lets the awaiting code run. */
  const answerAll = async () => {
    for (let i = 0; i < 4; i++) {
      await act(async () => { pending.splice(0).forEach((f) => { f(); }); await Promise.resolve(); });
    }
  };
  return { answerAll, installs };
}

const pasteAndCheck = () => {
  fireEvent.change(screen.getByLabelText(/Access key/), { target: { value: TOKEN } });
  fireEvent.click(screen.getByRole('button', { name: /Check the key/ }));
};
const hidePage = () => act(() => { window.dispatchEvent(new Event('pagehide')); });
const keyField = () => screen.getByLabelText(/Access key/) as HTMLInputElement;

describe('TokenSignIn: page hide drops the key', () => {
  afterEach(() => { for (const n of NAMES) delete (globalThis as unknown as Record<string, unknown>)[n]; });

  it('the confirm card is up: page hide drops the checked key and brings the empty key form back', async () => {
    const h = installGlobals();
    const onConfirming = vi.fn();
    render(<TokenSignIn onSignedIn={() => {}} onConfirming={onConfirming} onBack={() => {}} />);
    pasteAndCheck();
    await h.answerAll();
    expect(screen.getByRole('button', { name: /Open/ })).toBeInTheDocument();
    hidePage();
    expect(screen.queryByRole('button', { name: /Open/ })).toBeNull();
    expect(keyField().value).toBe('');
    expect(onConfirming).toHaveBeenLastCalledWith(false);
    expect(h.installs).toEqual([]);
  });

  it('a check still out at page hide: its answer is dropped, no confirm card, nothing installed', async () => {
    const h = installGlobals();
    const onConfirming = vi.fn();
    render(<TokenSignIn onSignedIn={() => {}} onConfirming={onConfirming} onBack={() => {}} />);
    pasteAndCheck(); // /auth/tokens/me is out
    hidePage();
    await h.answerAll();
    expect(screen.queryByRole('button', { name: /Open/ })).toBeNull();
    expect(onConfirming).not.toHaveBeenCalledWith(true);
    expect(keyField().value).toBe('');
    expect(screen.getByRole('button', { name: /Check the key/ })).not.toHaveAttribute('aria-busy', 'true');
    expect(h.installs).toEqual([]);
  });

  it('a realm pick holding the key: page hide drops it and brings the empty key form back', async () => {
    const h = installGlobals([R1, R2]);
    render(<TokenSignIn onSignedIn={() => {}} onBack={() => {}} />);
    pasteAndCheck();
    await h.answerAll();
    expect(screen.getByRole('button', { name: /This key opens 2 realms/ })).toBeInTheDocument();
    hidePage();
    expect(screen.queryByRole('button', { name: /This key opens 2 realms/ })).toBeNull();
    expect(keyField().value).toBe('');
    expect(h.installs).toEqual([]);
  });

  it('control: with no page hide, Open on the confirm card opens the session once', async () => {
    const h = installGlobals();
    const onSignedIn = vi.fn();
    render(<TokenSignIn onSignedIn={onSignedIn} onBack={() => {}} />);
    pasteAndCheck();
    await h.answerAll();
    fireEvent.click(screen.getByRole('button', { name: /Open/ }));
    expect(onSignedIn).toHaveBeenCalledTimes(1);
    expect(h.installs).toHaveLength(1);
  });
});
