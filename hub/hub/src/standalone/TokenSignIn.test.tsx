// TokenSignIn.tsx: the access key's own form (Enter submits "Check the key"); a check still out when the person goes
// back to sign in is dropped; a realm id shows masked, never whole; the realm pick takes the focus, never from a field
// the person is in.
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TokenSignIn } from './TokenSignIn';

const TOKEN = 'hdy_' + 'a'.repeat(24) + '_' + 'b'.repeat(48);
const R1 = '1'.repeat(24);
const R2 = '2'.repeat(24);
const UID = '64f0c0ffee0000000000aaaa';
const NAMES = ['apiCall', 'parseTokenIntrospection', 'installTokenSession', 'readAuthRev', 'classifyStoredAuth', 'realmApiDomain', 'standaloneApiHeld', 'isFramedPage'] as const;

/** The shared.js / token-auth.js globals, with every apiCall answered only when the test says so. */
function installGlobals() {
  const pending: Array<() => void> = [];
  const installs: unknown[] = [];
  const g = globalThis as unknown as Record<string, unknown>;
  g.apiCall = (_m: string, path: string) => new Promise((resolve) => {
    pending.push(() => { resolve(path === '/auth/tokens/me' ? { data: 'intro' } : { data: { id: UID, username: 'owner' } }); });
  });
  g.parseTokenIntrospection = () => ({ id: 't1', alias: 'shared', perms: { computers: { read: true }, projects: { read: true } }, expiresAt: null, realmIds: [R1], allowNoRealm: false, isEnabled: true });
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

describe('TokenSignIn', () => {
  afterEach(() => { for (const n of NAMES) delete (globalThis as unknown as Record<string, unknown>)[n]; });

  const pasteAndCheck = () => {
    fireEvent.change(screen.getByLabelText(/Access key/), { target: { value: TOKEN } });
    fireEvent.click(screen.getByRole('button', { name: /Check the key/ }));
  };

  it('too many checks: the wait is said as the sign-in card says it, never as raw seconds', async () => {
    installGlobals();
    (globalThis as unknown as Record<string, unknown>).apiCall = () => Promise.reject({ status: 429, retryAfter: 3600 });
    render(<TokenSignIn onSignedIn={() => {}} onBack={() => {}} />);
    pasteAndCheck();
    for (let i = 0; i < 4; i++) await act(async () => { await Promise.resolve(); });
    expect(screen.getByText('Too many tries. Wait 60 minutes, then try again.')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/3600/);
  });

  it('control: an answered check shows the confirm card and retitles the page', async () => {
    const h = installGlobals();
    const onConfirming = vi.fn();
    render(<TokenSignIn onSignedIn={() => {}} onConfirming={onConfirming} onBack={() => {}} />);
    pasteAndCheck();
    await h.answerAll();
    expect(screen.getByRole('button', { name: /Open/ })).toBeInTheDocument();
    expect(onConfirming).toHaveBeenLastCalledWith(true);
  });

  it('Enter in the key field submits the check; "Check the key" is the form\'s one submit button', async () => {
    const h = installGlobals();
    const onConfirming = vi.fn();
    render(<TokenSignIn onSignedIn={() => {}} onConfirming={onConfirming} onBack={() => {}} />);
    const check = screen.getByRole('button', { name: /^Check the key$/ });
    expect(check).toHaveAttribute('type', 'submit');
    expect(check.closest('form')).toBe(screen.getByLabelText(/Access key/).closest('form'));
    fireEvent.change(screen.getByLabelText(/Access key/), { target: { value: TOKEN } });
    await userEvent.setup().type(screen.getByLabelText(/Access key/), '{Enter}');
    await h.answerAll();
    expect(onConfirming).toHaveBeenLastCalledWith(true);
  });

  it('a refused check puts the focus back in the key field: Enter on the empty field, and a key Hoody refused', async () => {
    const h = installGlobals();
    render(<TokenSignIn onSignedIn={() => {}} onBack={() => {}} />);
    const field = () => screen.getByLabelText(/Access key/);
    // The form takes its first focus in the key field (focusOnMount.ts through the wrapper; no autoFocus attribute).
    expect(document.activeElement).toBe(field());
    // Enter on the empty field is a submit of its form (Enter itself: the test above); the check's answer is async.
    // jsdom keeps the focus on a field the locked form disabled (its blur() does nothing there), so the drop a browser
    // makes is made just before the submit, while the field can still lose it.
    (document.activeElement as HTMLElement | null)?.blur();
    expect(document.activeElement).toBe(document.body);
    fireEvent.submit(field().closest('form') as HTMLFormElement);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(screen.getByText(/^Paste the access key first\.$/)).toBeInTheDocument();
    expect(document.activeElement).toBe(field());
    // A refusal after a request (Hoody's answer cannot be read): the same.
    (globalThis as unknown as Record<string, unknown>).parseTokenIntrospection = () => null;
    fireEvent.change(field(), { target: { value: TOKEN } });
    (document.activeElement as HTMLElement | null)?.blur();
    expect(document.activeElement).toBe(document.body);
    fireEvent.click(screen.getByRole('button', { name: /^Check the key$/ }));
    await h.answerAll();
    expect(screen.queryByRole('button', { name: /Open/ })).toBeNull();
    expect(document.activeElement).toBe(field());
  });

  it('Back to sign in while a check is out drops its answer: no confirm card, nothing installed', async () => {
    const h = installGlobals();
    const onConfirming = vi.fn();
    const onBack = vi.fn();
    render(<TokenSignIn onSignedIn={() => {}} onConfirming={onConfirming} onBack={onBack} />);
    pasteAndCheck();
    fireEvent.click(screen.getByRole('button', { name: /^Back to sign in$/ })); // while /auth/tokens/me is out
    expect(onBack).toHaveBeenCalledTimes(1);
    await h.answerAll();
    expect(onConfirming).not.toHaveBeenCalledWith(true);
    expect(screen.queryByRole('button', { name: /Open/ })).toBeNull();
    const check = screen.getByRole('button', { name: /Check the key/ });
    expect(check).not.toHaveAttribute('aria-busy', 'true');
    expect(h.installs).toEqual([]);
  });

  it('the confirm card names the realm by its masked id; the full id never shows', async () => {
    const h = installGlobals();
    render(<TokenSignIn onSignedIn={() => {}} onBack={() => {}} />);
    pasteAndCheck();
    await h.answerAll();
    expect(screen.getByRole('button', { name: /Open/ })).toBeInTheDocument();
    expect(screen.getByText('1111…1111')).toBeInTheDocument();
    expect(document.body.textContent).not.toContain(R1);
  });

  it('a key for several realms: the pick lists each by its masked id; the full ids never show', async () => {
    const h = installGlobals();
    const g = globalThis as unknown as Record<string, unknown>;
    const one = (g.parseTokenIntrospection as () => Record<string, unknown>)();
    g.parseTokenIntrospection = () => ({ ...one, realmIds: [R1, R2] });
    render(<TokenSignIn onSignedIn={() => {}} onBack={() => {}} />);
    pasteAndCheck();
    await h.answerAll();
    await userEvent.setup().click(screen.getByRole('button', { name: /This key opens 2 realms/ }));
    const rows = screen.getAllByRole('option').map((o) => o.textContent ?? '');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toContain('1111…1111');
    expect(rows[1]).toContain('2222…2222');
    expect(document.body.textContent).not.toContain(R1);
    expect(document.body.textContent).not.toContain(R2);
  });

  it('a key for several realms: the pick takes the focus when it appears, and again after a refused pick', async () => {
    const h = installGlobals();
    const g = globalThis as unknown as Record<string, unknown>;
    const one = (g.parseTokenIntrospection as () => Record<string, unknown>)();
    g.parseTokenIntrospection = () => ({ ...one, realmIds: [R1, R2] });
    // The owner read is held, then refused (Hoody answers 503) when the test says so: the pick ends with an error, no
    // confirm card.
    const held: { refuse?: () => void } = {};
    const send = g.apiCall as (...a: unknown[]) => Promise<unknown>;
    g.apiCall = (method: string, path: string, ...rest: unknown[]) => (path === '/users/auth/me'
      ? new Promise((_resolve, reject) => { held.refuse = () => { reject({ status: 503 }); }; })
      : send(method, path, ...rest));
    render(<TokenSignIn onSignedIn={() => {}} onBack={() => {}} />);
    pasteAndCheck();
    await h.answerAll();
    // The form (its key field and its button) is gone; the pick holds the focus, not <body>.
    const pick = () => screen.getByRole('button', { name: /This key opens 2 realms/ });
    expect(document.activeElement).toBe(pick());
    const user = userEvent.setup();
    await user.click(pick());
    await user.click(screen.getByRole('option', { name: /Realm 1/ }));
    // The press leaves the focus on Continue while the owner read is out: a busy kit Button stays focusable (pending,
    // aria-disabled, never disabled). The refusal finds the focus on that button, not on <body>, and hands it to the pick.
    const cont = screen.getByRole('button', { name: /^Continue$/ });
    await user.click(cont);
    expect(held.refuse).toBeDefined();
    expect(cont).not.toBeDisabled();
    expect(document.activeElement).toBe(cont);
    for (let i = 0; i < 4; i++) {
      await act(async () => { if (i === 0) held.refuse?.(); await Promise.resolve(); });
    }
    expect(screen.getByText(/^Can't reach Hoody\./)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Open the Hub/ })).toBeNull();
    expect(document.activeElement).toBe(pick());
  });

  it('a late refusal on the pick leaves the focus where the person put it: typing in the Realm ID field, it stays there', async () => {
    const h = installGlobals();
    const g = globalThis as unknown as Record<string, unknown>;
    const one = (g.parseTokenIntrospection as () => Record<string, unknown>)();
    // A key for the whole account: the pick asks "Everything, or one realm?"; One realm adds the Realm ID field.
    g.parseTokenIntrospection = () => ({ ...one, realmIds: [], allowNoRealm: true });
    // The owner read is held, then refused (Hoody answers 503) when the test says so.
    const held: { refuse?: () => void } = {};
    const send = g.apiCall as (...a: unknown[]) => Promise<unknown>;
    g.apiCall = (method: string, path: string, ...rest: unknown[]) => (path === '/users/auth/me'
      ? new Promise((_resolve, reject) => { held.refuse = () => { reject({ status: 503 }); }; })
      : send(method, path, ...rest));
    render(<TokenSignIn onSignedIn={() => {}} onBack={() => {}} />);
    pasteAndCheck();
    await h.answerAll();
    const pick = () => screen.getByRole('button', { name: /This key opens your whole account/ });
    expect(document.activeElement).toBe(pick());
    const user = userEvent.setup();
    await user.click(pick());
    await user.click(screen.getByRole('option', { name: /One realm/ }));
    const realmField = () => screen.getByLabelText(/^Realm ID/);
    fireEvent.change(realmField(), { target: { value: R1 } });
    fireEvent.click(screen.getByRole('button', { name: /^Continue$/ }));
    // The pick is no Form: its Realm ID field stays usable while the owner read is out, and the person goes back to it.
    expect(held.refuse).toBeDefined();
    await user.click(realmField());
    expect(document.activeElement).toBe(realmField());
    for (let i = 0; i < 4; i++) {
      await act(async () => { if (i === 0) held.refuse?.(); await Promise.resolve(); });
    }
    expect(screen.getByText(/^Can't reach Hoody\./)).toBeInTheDocument();
    // No confirm card (its button opens the Hub). Not /Open/: the pick's own label says "Open everything, or one realm?".
    expect(screen.queryByRole('button', { name: /^Open the Hub/ })).toBeNull();
    expect(document.activeElement).toBe(realmField());
  });
});
