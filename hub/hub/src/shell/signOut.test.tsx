// The warned sign-out: sign-out asks first while the leaving account has holds that
// may have gone through (core signOutHolds: one HoldRef array of changes and attempts, each by record id and hold token) or an unsaved
// setting (pendingPrefWrites). Every confirm passes the holds it showed to core's signOutForgetting(account, shown)
// and reads the answer: 'done' forgot those (except sends still out, which core keeps and the warning names) and
// signed out; 'changed' (something not shown) deleted nothing and the dialog shows the warning again; 'failed' keeps the session (the dialog says why). Cancel, Esc or the scrim send nothing. With none, it signs out at once. The confirm works by
// keyboard (Cancel has the first focus, Esc cancels) and by mouse. signOut.core.test.tsx runs it on the real core.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useSyncExternalStore } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const calls: string[] = [];
// Inputs for core's holds (HoldRef { id, token }): `unresolved` change holds (ids c0, c1, ... token t1) and `held`
// attempts ({ id, token? }), one array as core's signOutHolds() gives it.
// A `sending: true` hold is one core marks as a live send: the sign-out keeps its record stored.
type HoldRef = { id: string; token: string; sending?: true };
const unresolved = vi.fn(() => 0);
const held = vi.fn((): Array<{ id: string; token?: string; sending?: true }> => []);
const holdsNow = (): HoldRef[] => [
  ...Array.from({ length: unresolved() }, (_, i) => ({ id: 'c' + i, token: 't1' })),
  ...held().map((a) => ({ id: a.id, token: a.token ?? 't1', ...(a.sending ? { sending: a.sending } : {}) })),
];
const saving = vi.fn(() => 0);
const forgetWorks = async () => {
  calls.push('forget');
  return true;
};
const forget = vi.fn(forgetWorks);
const logout = vi.fn(() => {
  calls.push('logout');
});
// core's change and attempt versions (useSyncExternalStore), bumped by `notify` as core does on a change.
let version = 0;
const versionWatchers = new Set<() => void>();
const notify = () => {
  version += 1;
  for (const w of [...versionWatchers]) w();
};
const watchVersion = (l: () => void) => {
  versionWatchers.add(l);
  return () => versionWatchers.delete(l);
};
const useVersion = () => useSyncExternalStore(watchVersion, () => version);
vi.mock('@core', async (orig) => ({
  ...(await orig<object>()),
  unresolvedChanges: () => unresolved(),
  heldAttempts: () => held(),
  useChangesVersion: () => useVersion(),
  useAttemptsVersion: () => useVersion(),
  // The shell must not forget by itself any more: core's signOutForgetting does (and re-checks the account).
  forgetAccountChanges: () => {
    calls.push('direct');
    return forget();
  },
  pendingPrefWrites: () => saving(),
}));
// The account core files changes under (snapshot().account) and whether a sign-out runs, as core's
// snapshot/subscribe give them. `identityShown` false plays a page whose identity is not read yet.
let who: string | null = 'acct-a';
let outing = false;
let identityShown = true;
const watchers = new Set<() => void>();
const switchTo = (id: string | null) => {
  who = id;
  for (const w of [...watchers]) w();
};
// core's signOutForgetting(account, shown) (attempts-f lifecycle.ts), modelled on its contract: 'changed' and
// nothing done for an account that is not the one shown now; 'changed' and nothing done when the store (here
// `stored`, else what core shows now) holds a hold not in `shown`; the forget (`forget` above); 'failed' when it fails
// or throws; 'changed' when the account changed meanwhile; else logout() and 'done'. `sofRejects`: the call itself
// rejects (the shell's own catch).
const sofAccounts: string[] = [];
const sofShown: unknown[] = [];
let stored: HoldRef[] | null = null; // what core finds under its lock, when it differs from what it shows in memory
// The next forget's rollback is refused and core answers 'unknown'. `removalLanded` false: storage still
// holds the records, so core's next clean read (signOutHolds) shows them again; true: none left.
let rollbackRefused = false;
let removalLanded = true;
let sofRejects = false;
const keyOf = (h: HoldRef) => h.id + '/' + h.token;
const signOutForgetting = async (account: string, shown?: readonly HoldRef[]): Promise<'done' | 'changed' | 'failed' | 'unknown'> => {
  sofAccounts.push(account);
  sofShown.push(shown);
  if (sofRejects) {
    sofRejects = false;
    calls.push('reject');
    throw new Error('storage');
  }
  if (!account || who !== account) return 'changed';
  const truth = stored ?? holdsNow();
  const named = new Set((shown ?? []).map(keyOf));
  if (truth.some((h) => !named.has(keyOf(h)))) {
    calls.push('changed');
    return 'changed';
  }
  if (rollbackRefused) {
    rollbackRefused = false;
    calls.push('unknown');
    if (removalLanded) {
      unresolved.mockReturnValue(0);
      held.mockReturnValue([]);
    }
    return 'unknown';
  }
  let ok = false;
  try {
    ok = await forget();
  } catch {
    ok = false;
  }
  if (!ok) return 'failed';
  if (who !== account) return 'changed';
  logout();
  return 'done';
};
// The script asks the warning shows (core readScriptAsks(account): the account's stored asks, or 'unreadable')
// and core's signOutForgettingAsks(account, holds, asks), modelled on its contract: first the
// asks drop (`dropAnswer`, recorded with what it was given; 'not_run' with no account), then signOutForgetting(account,
// holds) whatever the drop answered; `result` is that verdict unchanged.
type Ask = { askId: string; compId: string; path: string | null; realm: string | null; owner: string | null; sessionId: string | null; turnId: string | null; phase: 'create' | 'turn' | 'lost' | 'wait' | 'read'; sentAt: number; createKey: string; turnKey: string };
const askRec = (n: number, phase: Ask['phase'] = 'wait'): Ask => ({ askId: 'ask' + n, compId: 'c' + n, path: null, realm: null, owner: null, sessionId: 's' + n, turnId: null, phase, sentAt: n, createKey: 'ck' + n, turnKey: 'tk' + n });
const asksStored = vi.fn((): Ask[] | 'unreadable' => []);
const asksReadFor: Array<string | undefined> = [];
const dropAnswer = vi.fn((): string => 'ok');
const drops: Array<{ account: string; asks: readonly Ask[] }> = [];
// core's own asks version (useScriptAsksVersion), bumped by `notifyAsks` alone: an asks change bumps no change or
// attempt version.
let asksVersion = 0;
const asksWatchers = new Set<() => void>();
const notifyAsks = () => {
  asksVersion += 1;
  for (const w of [...asksWatchers]) w();
};
const useAsksVersion = () =>
  useSyncExternalStore(
    (l: () => void) => {
      asksWatchers.add(l);
      return () => asksWatchers.delete(l);
    },
    () => asksVersion,
  );
vi.mock('@core/shell', async (orig) => ({
  ...(await orig<object>()),
  logout: () => logout(),
  // The shell goes through signOutForgettingAsks only: a direct call is recorded so a test can say it never happens.
  signOutForgetting: (account: string, shown?: readonly HoldRef[]) => {
    calls.push('sof-direct');
    return signOutForgetting(account, shown);
  },
  signOutForgettingAsks: async (account: string, holds: readonly HoldRef[], asks: readonly Ask[]) => {
    const asksDropped = account ? dropAnswer() : 'not_run';
    if (account) drops.push({ account, asks });
    // An 'ok' drop removes the shown asks from storage, so later reads no longer list them.
    const stored = asksStored();
    if (asksDropped === 'ok' && Array.isArray(stored) && asks.length) {
      asksStored.mockReturnValue(stored.filter((a) => !asks.some((b) => b.askId === a.askId)));
      notifyAsks();
    }
    return { result: await signOutForgetting(account, holds), asksDropped };
  },
  readScriptAsks: (account?: string) => {
    asksReadFor.push(account);
    return asksStored();
  },
  useScriptAsksVersion: () => useAsksVersion(),
  signOutHolds: () => holdsNow(),
  snapshot: () => ({ account: who, loggingOut: outing, identity: identityShown && who ? { id: who } : null }),
  subscribe: (l: () => void) => {
    watchers.add(l);
    return () => watchers.delete(l);
  },
}));

import { requestSignOut, SignOutConfirm, useSendsKeptAtSignOut } from './signOut';

/** What a page that stays after the sign-out (the purge-failed panel) reads. */
function Kept() {
  return <output aria-label="kept">{useSendsKeptAtSignOut()}</output>;
}

beforeEach(() => {
  who = 'acct-a';
  outing = false;
  identityShown = true;
  calls.length = 0;
  sofAccounts.length = 0;
  sofShown.length = 0;
  stored = null;
  rollbackRefused = false;
  removalLanded = true;
  sofRejects = false;
  asksStored.mockReset().mockReturnValue([]);
  asksReadFor.length = 0;
  dropAnswer.mockReset().mockReturnValue('ok');
  drops.length = 0;
  unresolved.mockReset().mockReturnValue(0);
  held.mockReset().mockReturnValue([]);
  saving.mockReset().mockReturnValue(0);
  forget.mockReset().mockImplementation(forgetWorks); // also drops a once-answer a test left unused
  logout.mockClear();
});
afterEach(() => cleanup());

const ask = async () => {
  render(<SignOutConfirm />);
  await act(async () => requestSignOut());
  return screen.findByRole('alertdialog', { name: 'Sign out with unconfirmed changes?' });
};

describe('warned sign-out', () => {
  it('with nothing unresolved it signs out at once, no dialog and nothing forgotten', async () => {
    render(<SignOutConfirm />);
    await act(async () => requestSignOut());
    expect(logout).toHaveBeenCalledTimes(1);
    expect(forget).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('names how many changes may have gone through (changes and attempts together)', async () => {
    unresolved.mockReturnValue(2);
    held.mockReturnValue([{ id: 'a' }]);
    const dialog = await ask();
    expect(dialog.textContent).toMatch(/3 changes may have gone through/);
    expect(dialog.textContent).toMatch(/this browser stops tracking them/);
    expect(logout).not.toHaveBeenCalled();
  });

  it('one change reads in the singular', async () => {
    held.mockReturnValue([{ id: 'a' }]);
    const dialog = await ask();
    expect(dialog.textContent).toMatch(/1 change may have gone through/);
  });

  it('keyboard: Cancel has the first focus, Esc closes and sends nothing', async () => {
    unresolved.mockReturnValue(1);
    await ask();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel' })));
    await act(async () => fireEvent.keyDown(document.activeElement!, { key: 'Escape' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(forget).not.toHaveBeenCalled();
    expect(logout).not.toHaveBeenCalled();
  });

  it('mouse: Cancel sends nothing', async () => {
    unresolved.mockReturnValue(1);
    await ask();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Cancel' })));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(calls).toEqual([]);
  });

  it('Sign out forgets the account’s changes first, then signs out', async () => {
    unresolved.mockReturnValue(1);
    await ask();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Sign out' })));
    await waitFor(() => expect(calls).toEqual(['forget', 'logout']));
    // When sign-out cannot leave the page, the dialog does not stay behind, busy.
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });

  it('asking again after a sign-out that stayed on the page works again', async () => {
    unresolved.mockReturnValue(1);
    await ask();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Sign out' })));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    await act(async () => requestSignOut());
    await act(async () => fireEvent.click(await screen.findByRole('button', { name: 'Sign out' })));
    await waitFor(() => expect(calls).toEqual(['forget', 'logout', 'forget', 'logout']));
  });

  it('a forget that answers false keeps the session: no logout, the dialog stays and says why', async () => {
    unresolved.mockReturnValue(1);
    forget.mockImplementationOnce(async () => {
      calls.push('forget');
      return false;
    });
    await ask();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Sign out' })));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent("couldn't stop tracking these changes, so you're still signed in"));
    expect(calls).toEqual(['forget']);
    expect(logout).not.toHaveBeenCalled();
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    // Pressing again tries again; a forget that works then signs out.
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Sign out' })));
    await waitFor(() => expect(calls).toEqual(['forget', 'forget', 'logout']));
  });

  it('a forget that throws keeps the session too (signOutForgetting itself rejects: the shell\'s own catch)', async () => {
    unresolved.mockReturnValue(1);
    await ask();
    sofRejects = true;
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Sign out' })));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(calls).toEqual(['reject']);
    expect(logout).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Sign out' })).not.toBeDisabled();
  });

  it('Cancel after a failed forget closes, sends nothing more, and the next ask starts clean', async () => {
    unresolved.mockReturnValue(1);
    forget.mockImplementationOnce(async () => {
      calls.push('forget');
      return false;
    });
    await ask();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Sign out' })));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Cancel' })));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(calls).toEqual(['forget']);
    await act(async () => requestSignOut());
    await screen.findByRole('alertdialog');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('a second press while it runs sends once', async () => {
    unresolved.mockReturnValue(1);
    let done: (v: boolean) => void = () => {};
    forget.mockImplementationOnce(
      () =>
        new Promise<boolean>((r) => {
          calls.push('forget');
          done = r;
        }),
    );
    await ask();
    const button = screen.getByRole('button', { name: 'Sign out' });
    // Both presses in one turn, before the busy render can disable the button: the synchronous guard alone holds.
    await act(async () => {
      fireEvent.click(button);
      fireEvent.click(button);
    });
    expect(sofAccounts).toEqual(['acct-a']);
    await act(async () => fireEvent.click(button));
    await act(async () => done(true));
    await waitFor(() => expect(calls).toEqual(['forget', 'logout']));
    expect(sofAccounts).toEqual(['acct-a']);
  });

  it('without a mounted shell it signs out directly', async () => {
    unresolved.mockReturnValue(1);
    await act(async () => requestSignOut());
    expect(logout).toHaveBeenCalledTimes(1);
  });

  // The dialog belongs to the account it opened for.
  it('an account switch while the dialog is open closes it and sends nothing', async () => {
    unresolved.mockReturnValue(1);
    await ask();
    await act(async () => switchTo('acct-b'));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(calls).toEqual([]);
  });

  it('an account switch while the forget runs closes the dialog, and a forget that then succeeds signs nobody out', async () => {
    unresolved.mockReturnValue(1);
    let done: (v: boolean) => void = () => {};
    forget.mockImplementationOnce(
      () =>
        new Promise<boolean>((r) => {
          calls.push('forget');
          done = r;
        }),
    );
    await ask();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Sign out' })));
    await act(async () => switchTo('acct-b'));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    await act(async () => done(true));
    expect(calls).toEqual(['forget']);
    expect(logout).not.toHaveBeenCalled();
  });

  it('a retry checks the account again: after a switch nothing is forgotten for the new one', async () => {
    unresolved.mockReturnValue(1);
    forget.mockImplementationOnce(async () => {
      calls.push('forget');
      return false;
    });
    await ask();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Sign out' })));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    // The account changes without core telling the dialog (no subscription fired): the press still checks.
    who = 'acct-b';
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Sign out' })));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(calls).toEqual(['forget']);
    expect(logout).not.toHaveBeenCalled();
  });

  it('asking again while the forget runs changes nothing: still busy, one forget', async () => {
    unresolved.mockReturnValue(1);
    let done: (v: boolean) => void = () => {};
    forget.mockImplementationOnce(
      () =>
        new Promise<boolean>((r) => {
          calls.push('forget');
          done = r;
        }),
    );
    await ask();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Sign out' })));
    await act(async () => requestSignOut());
    // Still the busy dialog: busy disables Cancel.
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    unresolved.mockReturnValue(0);
    await act(async () => requestSignOut());
    expect(logout).not.toHaveBeenCalled();
    await act(async () => done(true));
    await waitFor(() => expect(calls).toEqual(['forget', 'logout']));
  });

  // A preference write still saving is named in the confirm.
  it('an unsaved setting is named in the confirm', async () => {
    unresolved.mockReturnValue(1);
    saving.mockReturnValue(1);
    const dialog = await ask();
    expect(dialog.textContent).toMatch(/A setting isn't saved on this browser yet/);
  });

  it('with nothing saving the confirm says nothing about it', async () => {
    unresolved.mockReturnValue(1);
    const dialog = await ask();
    expect(dialog.textContent).not.toMatch(/isn't saved/);
  });

  // Logout drops a write still saving after its 3 s bound, so a save alone asks.
  it('an unsaved setting alone opens the confirm; Sign out still goes through core\'s forget, then signs out', async () => {
    saving.mockReturnValue(2);
    render(<SignOutConfirm />);
    await act(async () => requestSignOut());
    const dialog = await screen.findByRole('alertdialog', { name: 'Sign out with an unsaved change?' });
    expect(dialog.textContent).toMatch(/A setting isn't saved on this browser yet\. If you sign out now, it's lost\./);
    expect(dialog.textContent).not.toMatch(/may have gone through/);
    expect(logout).not.toHaveBeenCalled();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Sign out' })));
    await waitFor(() => expect(calls).toEqual(['forget', 'logout']));
    expect(sofAccounts).toEqual(['acct-a']);
  });

  it('a change still saving: Cancel sends nothing', async () => {
    saving.mockReturnValue(1);
    render(<SignOutConfirm />);
    await act(async () => requestSignOut());
    await screen.findByRole('alertdialog');
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Cancel' })));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(calls).toEqual([]);
  });

  it('a change still saving: another account showing before the press signs nobody out', async () => {
    saving.mockReturnValue(1);
    render(<SignOutConfirm />);
    await act(async () => requestSignOut());
    await screen.findByRole('alertdialog');
    who = 'acct-b';
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Sign out' })));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(calls).toEqual([]);
  });

  // The confirm goes through core's signOutForgetting with the account the dialog opened for.
  it('Sign out asks core to forget and sign out for the bound account, never forgetting by itself', async () => {
    unresolved.mockReturnValue(1);
    await ask();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Sign out' })));
    await waitFor(() => expect(calls).toEqual(['forget', 'logout']));
    expect(sofAccounts).toEqual(['acct-a']);
    expect(calls).not.toContain('direct');
  });

  it('when core refuses because another account shows, the dialog closes and says nothing failed', async () => {
    unresolved.mockReturnValue(1);
    let done: (v: boolean) => void = () => {};
    forget.mockImplementationOnce(
      () =>
        new Promise<boolean>((r) => {
          calls.push('forget');
          done = r;
        }),
    );
    await ask();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Sign out' })));
    who = 'acct-b'; // no notice from core: the shell learns it from core's answer and its own account check
    await act(async () => done(true));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(screen.queryByRole('alert')).toBeNull();
    expect(logout).not.toHaveBeenCalled();
  });

  // No fast path, a save-only confirm forgets through core too.
  it('a save-only confirm whose forget answers false keeps the session and says why', async () => {
    saving.mockReturnValue(1);
    forget.mockImplementationOnce(async () => {
      calls.push('forget');
      return false;
    });
    render(<SignOutConfirm />);
    await act(async () => requestSignOut());
    await screen.findByRole('alertdialog', { name: 'Sign out with an unsaved change?' });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Sign out' })));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent("Sign-out didn't finish on this browser, so you're still signed in"));
    expect(calls).toEqual(['forget']);
    expect(logout).not.toHaveBeenCalled();
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });

  it('a save-only confirm whose signOutForgetting throws keeps the session too', async () => {
    saving.mockReturnValue(1);
    render(<SignOutConfirm />);
    await act(async () => requestSignOut());
    await screen.findByRole('alertdialog');
    sofRejects = true;
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Sign out' })));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(logout).not.toHaveBeenCalled();
  });

  // What the dialog warns about stays live, and a press never acts on less than is unresolved now.
  it('a hold that arrives while a save-only dialog is open turns it into the changes warning', async () => {
    saving.mockReturnValue(1);
    render(<SignOutConfirm />);
    await act(async () => requestSignOut());
    await screen.findByRole('alertdialog', { name: 'Sign out with an unsaved change?' });
    held.mockReturnValue([{ id: 'a' }]);
    await act(async () => notify());
    const dialog = await screen.findByRole('alertdialog', { name: 'Sign out with unconfirmed changes?' });
    expect(dialog.textContent).toMatch(/1 change may have gone through/);
    expect(dialog.textContent).toMatch(/A setting isn't saved on this browser yet/);
    expect(calls).toEqual([]);
  });

  it('a press that finds more unresolved than shown (no notice came) shows it and signs nothing out', async () => {
    saving.mockReturnValue(1);
    render(<SignOutConfirm />);
    await act(async () => requestSignOut());
    await screen.findByRole('alertdialog', { name: 'Sign out with an unsaved change?' });
    unresolved.mockReturnValue(2); // a sibling tab's hold, read only at the press
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Sign out' })));
    const dialog = await screen.findByRole('alertdialog', { name: 'Sign out with unconfirmed changes?' });
    expect(dialog.textContent).toMatch(/2 changes may have gone through/);
    expect(calls).toEqual([]);
    expect(sofAccounts).toEqual([]);
    // The next press, on what the person now sees, goes through.
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Sign out' })));
    await waitFor(() => expect(calls).toEqual(['forget', 'logout']));
  });

  it('a press that finds a count higher than a changes warning showed shows the new count first', async () => {
    unresolved.mockReturnValue(1);
    await ask();
    unresolved.mockReturnValue(3);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Sign out' })));
    await waitFor(() => expect(screen.getByRole('alertdialog').textContent).toMatch(/3 changes may have gone through/));
    expect(screen.getByRole('alertdialog').textContent).toMatch(/Something changed on this browser while you were deciding/);
    expect(calls).toEqual([]);
  });

  it('a setting that becomes unsaved after the dialog opened is shown before any sign-out', async () => {
    unresolved.mockReturnValue(1);
    const dialog = await ask();
    expect(dialog.textContent).not.toMatch(/isn't saved/);
    saving.mockReturnValue(1); // the preference count has no notice: the press reads it
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Sign out' })));
    await waitFor(() => expect(screen.getByRole('alertdialog').textContent).toMatch(/A setting isn't saved on this browser yet/));
    expect(calls).toEqual([]);
  });

  it('a count that goes down while open is shown as it is now', async () => {
    unresolved.mockReturnValue(2);
    const dialog = await ask();
    expect(dialog.textContent).toMatch(/2 changes may have gone through/);
    unresolved.mockReturnValue(1);
    await act(async () => notify());
    await waitFor(() => expect(screen.getByRole('alertdialog').textContent).toMatch(/1 change may have gone through/));
  });

  // Bound to the account core files changes under (snapshot().account), not the identity shown.
  it('with no identity read yet, the dialog binds to core\'s account and passes it to signOutForgetting', async () => {
    identityShown = false;
    unresolved.mockReturnValue(1);
    await ask();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Sign out' })));
    await waitFor(() => expect(calls).toEqual(['forget', 'logout']));
    expect(sofAccounts).toEqual(['acct-a']);
  });

  it('core\'s account changing closes the dialog even when no identity is shown', async () => {
    identityShown = false;
    unresolved.mockReturnValue(1);
    await ask();
    await act(async () => switchTo('acct-b'));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(calls).toEqual([]);
  });

  it('no account (nothing keyed to forget) signs out at once, no dialog', async () => {
    who = null;
    unresolved.mockReturnValue(1);
    render(<SignOutConfirm />);
    await act(async () => requestSignOut());
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(calls).toEqual(['logout']);
    expect(sofAccounts).toEqual([]);
  });

  it('a sign-out starting while the dialog is open closes it (no account while it runs)', async () => {
    unresolved.mockReturnValue(1);
    await ask();
    outing = true;
    await act(async () => switchTo('acct-a'));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(calls).toEqual([]);
  });

  // The unsaved line names no page (the count covers every kept key: Guide, Board, page-only values).
  it('an unsaved Guide write alone is not called a Board change', async () => {
    saving.mockReturnValue(1);
    render(<SignOutConfirm />);
    await act(async () => requestSignOut());
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog.textContent).not.toMatch(/Board/);
    expect(dialog.textContent).toMatch(/A setting isn't saved on this browser yet/);
  });

  // The whole warning is the dialog's description; the error stays outside it.
  it('aria-describedby reads the count and the unsaved line; the error is not part of it', async () => {
    unresolved.mockReturnValue(2);
    saving.mockReturnValue(1);
    forget.mockImplementationOnce(async () => {
      calls.push('forget');
      return false;
    });
    const dialog = await ask();
    const described = () => document.getElementById(dialog.getAttribute('aria-describedby') ?? '')?.textContent ?? '';
    expect(described()).toMatch(/2 changes may have gone through/);
    expect(described()).toMatch(/A setting isn't saved on this browser yet/);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Sign out' })));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(described()).not.toMatch(/couldn't stop tracking/);
  });

  // The shown set goes to core; 'changed' signs nothing out.
  it('Sign out passes exactly the holds the dialog showed (ids and tokens)', async () => {
    unresolved.mockReturnValue(1);
    held.mockReturnValue([{ id: 'a1', token: 'k9' }]);
    await ask();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Sign out' })));
    await waitFor(() => expect(calls).toEqual(['forget', 'logout']));
    expect(sofShown).toEqual([[{ id: 'c0', token: 't1' }, { id: 'a1', token: 'k9' }]]);
  });

  it('core answers changed: no logout, no error, the warning is shown as it is now; the next press signs out', async () => {
    unresolved.mockReturnValue(1);
    await ask();
    // Under its lock core finds a hold this tab had not read yet; by the re-read this tab sees it too.
    stored = [{ id: 'c0', token: 't1' }, { id: 'c1', token: 't1' }];
    unresolved.mockImplementation(() => (calls.includes('changed') ? 2 : 1));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Sign out' })));
    await waitFor(() => expect(screen.getByRole('alertdialog').textContent).toMatch(/2 changes may have gone through/));
    expect(calls).toEqual(['changed']);
    expect(logout).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('alertdialog').textContent).toMatch(/Something changed on this browser while you were deciding/);
    expect(screen.getByRole('button', { name: 'Cancel' })).not.toBeDisabled();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Sign out' })));
    await waitFor(() => expect(calls).toEqual(['changed', 'forget', 'logout']));
    expect(sofShown[1]).toEqual(stored);
  });

  it('changed, then Cancel sends nothing more', async () => {
    unresolved.mockReturnValue(1);
    await ask();
    stored = [{ id: 'c0', token: 't2' }]; // sent again under a new token
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Sign out' })));
    await waitFor(() => expect(calls).toEqual(['changed']));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Cancel' })));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(calls).toEqual(['changed']);
    expect(logout).not.toHaveBeenCalled();
  });

  it('a swap at the press (same count, another hold) shows it with the neutral changed line and asks core nothing', async () => {
    held.mockReturnValue([{ id: 'a1' }]);
    await ask();
    held.mockReturnValue([{ id: 'a2' }]); // a1 freed, a2 admitted: still 1
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Sign out' })));
    expect(screen.getByRole('alertdialog').textContent).toMatch(/Something changed on this browser while you were deciding/);
    expect(sofAccounts).toEqual([]);
    expect(calls).toEqual([]);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Sign out' })));
    await waitFor(() => expect(calls).toEqual(['forget', 'logout']));
    expect(sofShown).toEqual([[{ id: 'a2', token: 't1' }]]);
  });

  it('a hold sent again under a new token at the press is a new hold: shown first, core asked nothing', async () => {
    held.mockReturnValue([{ id: 'a1', token: 'k1' }]);
    await ask();
    held.mockReturnValue([{ id: 'a1', token: 'k2' }]);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Sign out' })));
    expect(screen.getByRole('alertdialog').textContent).toMatch(/Something changed on this browser while you were deciding/);
    expect(sofAccounts).toEqual([]);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Sign out' })));
    await waitFor(() => expect(calls).toEqual(['forget', 'logout']));
    expect(sofShown).toEqual([[{ id: 'a1', token: 'k2' }]]);
  });

  // 'unknown' keeps the session with a neutral line; again finishes.
  it('core answers unknown: still signed in, a neutral may-already-be-forgotten line, no error; Sign out again finishes', async () => {
    unresolved.mockReturnValue(1);
    held.mockReturnValue([{ id: 'a1' }]);
    await ask();
    rollbackRefused = true;
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Sign out' })));
    await waitFor(() => expect(screen.getByRole('alertdialog').textContent).toMatch(/may already have stopped tracking those changes, but sign-out didn't finish, so you're still signed in\. Sign out again to finish\./));
    expect(calls).toEqual(['unknown']);
    expect(logout).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).toBeNull();
    const dialog = screen.getByRole('alertdialog');
    expect(dialog.textContent).not.toMatch(/confirmed and saved now/);
    expect(screen.getByRole('button', { name: 'Cancel' })).not.toBeDisabled();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Sign out' })));
    await waitFor(() => expect(calls).toEqual(['unknown', 'forget', 'logout']));
    expect(sofShown[1]).toEqual([]);
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });

  // No carried set in core; signOutHolds() is a fresh clean read, so records still stored show again.
  it('unknown with the records still stored: the re-read shows them, the next confirm forgets them and signs out', async () => {
    unresolved.mockReturnValue(1);
    held.mockReturnValue([{ id: 'a1' }]);
    await ask();
    rollbackRefused = true;
    removalLanded = false;
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Sign out' })));
    await waitFor(() => expect(screen.getByRole('alertdialog').textContent).toMatch(/Sign out again to finish/));
    expect(screen.getByRole('alertdialog').textContent).toMatch(/2 changes may have gone through/);
    expect(logout).not.toHaveBeenCalled();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Sign out' })));
    await waitFor(() => expect(calls).toEqual(['unknown', 'forget', 'logout']));
    expect(sofShown[1]).toEqual([{ id: 'c0', token: 't1' }, { id: 'a1', token: 't1' }]);
  });

  it('unknown with the records still stored, Cancel: the next sign-out opens on them and its confirm signs out', async () => {
    unresolved.mockReturnValue(1);
    await ask();
    rollbackRefused = true;
    removalLanded = false;
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Sign out' })));
    await waitFor(() => expect(screen.getByRole('alertdialog').textContent).toMatch(/Sign out again to finish/));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Cancel' })));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    const again = await ask();
    expect(again.textContent).toMatch(/1 change may have gone through/);
    expect(again.textContent).not.toMatch(/Sign out again to finish/);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Sign out' })));
    await waitFor(() => expect(calls).toEqual(['unknown', 'forget', 'logout']));
  });

  // The removal keeps live-send records, so 'done' can leave sends stored. The
  // warning names them before the press; never "removed" or "failed".
  it('a live send among the shown holds is named in the warning before the press, inside its description', async () => {
    held.mockReturnValue([{ id: 'a1', sending: true }, { id: 'a2' }]);
    const dialog = await ask();
    expect(dialog.textContent).toMatch(/2 changes may have gone through/);
    expect(dialog.textContent).toMatch(/1 change is still being sent\. Signing out doesn't stop it: it stays on this browser and keeps the same change blocked until its answer comes back\./);
    const described = document.getElementById(dialog.getAttribute('aria-describedby') ?? '');
    expect(described?.textContent).toMatch(/1 change is still being sent/);
    expect(dialog.textContent).not.toMatch(/removed|failed/i);
  });

  it('two live sends read in the plural', async () => {
    held.mockReturnValue([{ id: 'a1', sending: true }, { id: 'a2', sending: true }]);
    const dialog = await ask();
    expect(dialog.textContent).toMatch(/2 changes are still being sent\. Signing out doesn't stop them: they stay on this browser and keep the same change blocked until their answers come back\./);
  });

  it('a shown hold that is not a live send (stale stamp) gets no still-being-sent line', async () => {
    held.mockReturnValue([{ id: 'a1' }]);
    unresolved.mockReturnValue(1);
    const dialog = await ask();
    expect(dialog.textContent).toMatch(/2 changes may have gone through/);
    expect(dialog.textContent).not.toMatch(/still being sent/);
  });

  it('a send that goes live while the dialog is open is named; one whose stamp goes stale is no longer', async () => {
    held.mockReturnValue([{ id: 'a1' }]);
    const dialog = await ask();
    expect(dialog.textContent).not.toMatch(/still being sent/);
    held.mockReturnValue([{ id: 'a1', sending: true }]);
    await act(async () => notify());
    await waitFor(() => expect(screen.getByRole('alertdialog').textContent).toMatch(/1 change is still being sent/));
    held.mockReturnValue([{ id: 'a1' }]);
    await act(async () => notify());
    await waitFor(() => expect(screen.getByRole('alertdialog').textContent).not.toMatch(/still being sent/));
  });

  it('done with a live send shown: signed out, and a page that stays learns how many sends stay stored', async () => {
    held.mockReturnValue([{ id: 'a1', sending: true }, { id: 'a2' }]);
    render(<Kept />);
    await ask();
    expect(screen.getByLabelText('kept').textContent).toBe('0');
    // As core's logout does: the sign-out starting shows no account, which closes the dialog before 'done' arrives.
    logout.mockImplementationOnce(() => {
      calls.push('logout');
      outing = true;
      for (const w of [...watchers]) w();
    });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Sign out' })));
    await waitFor(() => expect(calls).toEqual(['forget', 'logout']));
    expect(sofShown).toEqual([[{ id: 'a1', token: 't1', sending: true }, { id: 'a2', token: 't1' }]]);
    await waitFor(() => expect(screen.getByLabelText('kept').textContent).toBe('1'));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    // The next sign-out starts clean.
    outing = false;
    held.mockReturnValue([]);
    await act(async () => requestSignOut());
    expect(screen.getByLabelText('kept').textContent).toBe('0');
  });

  it('no live send kept when the forget does not finish (changed, failed, unknown)', async () => {
    held.mockReturnValue([{ id: 'a1', sending: true }]);
    render(<Kept />);
    await ask();
    stored = [{ id: 'a1', token: 't1', sending: true }, { id: 'x9', token: 't1' }]; // core finds one more under its lock
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Sign out' })));
    await waitFor(() => expect(screen.getByRole('alertdialog').textContent).toMatch(/Something changed on this browser/));
    expect(calls).toEqual(['changed']);
    expect(screen.getByLabelText('kept').textContent).toBe('0');
    stored = null;
    forget.mockResolvedValueOnce(false);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Sign out' })));
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    rollbackRefused = true;
    removalLanded = false;
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Sign out' })));
    await waitFor(() => expect(screen.getByRole('alertdialog').textContent).toMatch(/Sign out again to finish/));
    expect(screen.getByLabelText('kept').textContent).toBe('0');
    expect(logout).not.toHaveBeenCalled();
  });

  // A shown hold that turns into a send still out, same record and token, is more than shown.
  it('a shown hold that turns into a send still out by the press (no notice): re-shown with its line, core asked nothing', async () => {
    held.mockReturnValue([{ id: 'a1', token: 'k1' }]);
    render(<Kept />);
    const dialog = await ask();
    expect(dialog.textContent).not.toMatch(/still being sent/);
    held.mockReturnValue([{ id: 'a1', token: 'k1', sending: true }]); // another tab's heartbeat renewed, no notice here
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Sign out' })));
    expect(sofAccounts).toEqual([]);
    expect(screen.getByRole('alertdialog').textContent).toMatch(/Something changed on this browser while you were deciding/);
    expect(screen.getByRole('alertdialog').textContent).toMatch(/1 change is still being sent/);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Sign out' })));
    await waitFor(() => expect(calls).toEqual(['forget', 'logout']));
    expect(sofShown).toEqual([[{ id: 'a1', token: 'k1', sending: true }]]);
    expect(screen.getByLabelText('kept').textContent).toBe('1');
  });

  it('a send still out that settles by the press (flag gone) is not more: the press goes on with what was shown', async () => {
    held.mockReturnValue([{ id: 'a1', token: 'k1', sending: true }]);
    render(<Kept />);
    await ask();
    held.mockReturnValue([{ id: 'a1', token: 'k1' }]);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Sign out' })));
    await waitFor(() => expect(calls).toEqual(['forget', 'logout']));
    expect(sofShown).toEqual([[{ id: 'a1', token: 'k1', sending: true }]]);
    // Settled by the press, so core forgot it with the rest; no page says it stays.
    expect(screen.getByLabelText('kept').textContent).toBe('0');
  });

  it('of two shown sends still out, one settled and one gone by the press: neither counts as kept, the third does', async () => {
    held.mockReturnValue([{ id: 'a1', token: 'k1', sending: true }, { id: 'a2', token: 'k1', sending: true }, { id: 'a3', token: 'k1', sending: true }]);
    render(<Kept />);
    await ask();
    held.mockReturnValue([{ id: 'a1', token: 'k1' }, { id: 'a3', token: 'k1', sending: true }]);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Sign out' })));
    await waitFor(() => expect(calls).toEqual(['forget', 'logout']));
    expect(screen.getByLabelText('kept').textContent).toBe('1');
  });

  // The same totals with the flag on another record is still more than shown.
  it('the send flag moving from one shown hold to another by the press (same totals, no notice): re-shown, core asked nothing', async () => {
    held.mockReturnValue([{ id: 'a1', token: 'k1', sending: true }, { id: 'a2', token: 'k1' }]);
    await ask();
    held.mockReturnValue([{ id: 'a1', token: 'k1' }, { id: 'a2', token: 'k1', sending: true }]);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Sign out' })));
    expect(sofAccounts).toEqual([]);
    expect(screen.getByRole('alertdialog').textContent).toMatch(/Something changed on this browser while you were deciding/);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Sign out' })));
    await waitFor(() => expect(calls).toEqual(['forget', 'logout']));
    expect(sofShown).toEqual([[{ id: 'a1', token: 'k1' }, { id: 'a2', token: 'k1', sending: true }]]);
  });

  it('the send flag moving between shown holds while open (same totals) is re-read: the press passes the new flags', async () => {
    held.mockReturnValue([{ id: 'a1', token: 'k1', sending: true }, { id: 'a2', token: 'k1' }]);
    await ask();
    held.mockReturnValue([{ id: 'a1', token: 'k1' }, { id: 'a2', token: 'k1', sending: true }]);
    await act(async () => notify());
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Sign out' })));
    await waitFor(() => expect(calls).toEqual(['forget', 'logout']));
    expect(screen.queryByText(/Something changed on this browser/)).toBeNull();
    expect(sofShown).toEqual([[{ id: 'a1', token: 'k1' }, { id: 'a2', token: 'k1', sending: true }]]);
  });

  // The "forgets" sentence never covers the sends still out.
  it('only sends still out: no "forgets" sentence, only the stays line', async () => {
    held.mockReturnValue([{ id: 'a1', sending: true }, { id: 'a2', sending: true }]);
    const dialog = await ask();
    expect(dialog.textContent).toMatch(/2 changes may have gone through, and the Hub has not confirmed them yet\./);
    expect(dialog.textContent).not.toMatch(/stops tracking/);
    expect(dialog.textContent).toMatch(/2 changes are still being sent\. Signing out doesn't stop them: they stay on this browser/);
  });

  it('a mix names how many it forgets and how many stay', async () => {
    unresolved.mockReturnValue(2);
    held.mockReturnValue([{ id: 'a1', sending: true }]);
    const dialog = await ask();
    expect(dialog.textContent).toMatch(/3 changes may have gone through, and the Hub has not confirmed them yet\. If you sign out, this browser stops tracking 2 of them and can no longer check those for you\./);
    expect(dialog.textContent).toMatch(/1 change is still being sent\. Signing out doesn't stop it: it stays on this browser/);
    expect(dialog.textContent).not.toMatch(/stops tracking them|stops tracking it/);
  });

  it('one forgotten beside sends still out reads in the singular', async () => {
    unresolved.mockReturnValue(1);
    held.mockReturnValue([{ id: 'a1', sending: true }, { id: 'a2', sending: true }]);
    const dialog = await ask();
    expect(dialog.textContent).toMatch(/If you sign out, this browser stops tracking 1 of them and can no longer check that one for you\./);
  });

  it('with no send still out the whole list is forgotten (it / them)', async () => {
    unresolved.mockReturnValue(1);
    const one = await ask();
    expect(one.textContent).toMatch(/1 change may have gone through, and the Hub has not confirmed it yet\. If you sign out, this browser stops tracking it and can no longer check it for you\./);
    expect(one.textContent).not.toMatch(/still being sent/);
  });

  // An account change between the ask and the dialog's first render closes it.
  it('another account showing before the dialog first renders closes it; nothing is forgotten', async () => {
    unresolved.mockReturnValue(1);
    render(<SignOutConfirm />);
    await act(async () => {
      requestSignOut();
      who = 'acct-b'; // no notice: the change happened before the dialog's subscription existed
    });
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(sofAccounts).toEqual([]);
    expect(logout).not.toHaveBeenCalled();
    // The next ask belongs to the account shown now.
    who = 'acct-a';
    await act(async () => requestSignOut());
    expect(await screen.findByRole('alertdialog')).toBeTruthy();
  });

  // The preference count has no notice; the 1 s re-read alone shows it.
  it('an unsaved setting that appears while open shows within the 1 s re-read, with no notice and no press', async () => {
    unresolved.mockReturnValue(1);
    const dialog = await ask();
    expect(dialog.textContent).not.toMatch(/isn't saved/);
    saving.mockReturnValue(1);
    await waitFor(() => expect(screen.getByRole('alertdialog').textContent).toMatch(/A setting isn't saved on this browser yet/), { timeout: 2500 });
    expect(sofAccounts).toEqual([]);
  });
});

// The warning also names the assistant's questions still waiting for
// an answer (readScriptAsks(account)), and every confirm goes through signOutForgettingAsks(account, holds, asks) with
// exactly the asks it showed. The drop's answer never keeps a person signed in; only `result` decides.
describe('warned sign-out: questions to the assistant', () => {
  const askAsks = async () => {
    render(<SignOutConfirm />);
    await act(async () => requestSignOut());
    return screen.findByRole('alertdialog', { name: 'Sign out while the assistant may still answer?' });
  };

  it('a question still waiting asks first, names it, and Sign out drops exactly that one, then signs out', async () => {
    asksStored.mockReturnValue([askRec(1)]);
    const dialog = await askAsks();
    expect(dialog.textContent).toMatch(/1 question to the assistant may still be answered/);
    expect(dialog.textContent).not.toMatch(/Everything on this browser is confirmed/);
    expect(logout).not.toHaveBeenCalled();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Sign out' })));
    await waitFor(() => expect(logout).toHaveBeenCalledTimes(1));
    expect(drops).toEqual([{ account: 'acct-a', asks: [askRec(1)] }]);
    expect(sofShown).toEqual([[]]);
    expect(calls).not.toContain('sof-direct');
    expect(asksReadFor.length).toBeGreaterThan(0);
    expect(asksReadFor.every((a) => a === 'acct-a')).toBe(true);
  });

  it('changes and questions together: both are named, and one confirm passes both', async () => {
    unresolved.mockReturnValue(1);
    asksStored.mockReturnValue([askRec(1), askRec(2)]);
    const dialog = await ask();
    expect(dialog.textContent).toMatch(/1 change may have gone through/);
    expect(dialog.textContent).toMatch(/2 questions to the assistant may still be answered/);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Sign out' })));
    await waitFor(() => expect(calls).toEqual(['forget', 'logout']));
    expect(drops).toEqual([{ account: 'acct-a', asks: [askRec(1), askRec(2)] }]);
    expect(sofShown).toEqual([[{ id: 'c0', token: 't1' }]]);
  });

  it('Cancel drops nothing and signs nothing out', async () => {
    asksStored.mockReturnValue([askRec(1)]);
    await askAsks();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Cancel' })));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(drops).toEqual([]);
    expect(logout).not.toHaveBeenCalled();
  });

  it('asks that cannot be read, and nothing else: sign-out goes straight through (they stay stored for that account)', async () => {
    asksStored.mockReturnValue('unreadable');
    render(<SignOutConfirm />);
    await act(async () => requestSignOut());
    expect(logout).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(drops).toEqual([]);
  });

  it('a question asked after the warning, before the press (no notice): the press shows it and signs nothing out', async () => {
    asksStored.mockReturnValue([askRec(1)]);
    await askAsks();
    asksStored.mockReturnValue([askRec(1), askRec(2)]);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Sign out' })));
    await waitFor(() => expect(screen.getByRole('alertdialog').textContent).toMatch(/2 questions to the assistant/));
    expect(screen.getByRole('alertdialog').textContent).toMatch(/Something changed on this browser while you were deciding/);
    expect(drops).toEqual([]);
    expect(logout).not.toHaveBeenCalled();
    // The next press drops what it now shows.
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Sign out' })));
    await waitFor(() => expect(logout).toHaveBeenCalledTimes(1));
    expect(drops).toEqual([{ account: 'acct-a', asks: [askRec(1), askRec(2)] }]);
  });

  it('a shown question that moved on (same ask, new phase) before the press: re-shown, nothing dropped; the next press passes the new record', async () => {
    asksStored.mockReturnValue([askRec(1, 'turn')]);
    await askAsks();
    asksStored.mockReturnValue([askRec(1, 'wait')]);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Sign out' })));
    await waitFor(() => expect(screen.getByRole('alertdialog').textContent).toMatch(/Something changed on this browser while you were deciding/));
    expect(drops).toEqual([]);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Sign out' })));
    await waitFor(() => expect(logout).toHaveBeenCalledTimes(1));
    expect(drops).toEqual([{ account: 'acct-a', asks: [askRec(1, 'wait')] }]);
  });

  it('a shown question answered before the press (gone): the press still signs out, passing what it showed', async () => {
    asksStored.mockReturnValue([askRec(1)]);
    await askAsks();
    asksStored.mockReturnValue([]);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Sign out' })));
    await waitFor(() => expect(logout).toHaveBeenCalledTimes(1));
    expect(drops).toEqual([{ account: 'acct-a', asks: [askRec(1)] }]);
  });

  it('a question asked while the dialog is open shows at once on the asks notice', async () => {
    unresolved.mockReturnValue(1);
    const dialog = await ask();
    expect(dialog.textContent).not.toMatch(/question/);
    asksStored.mockReturnValue([askRec(1)]);
    await act(async () => notifyAsks());
    // At once on the notice, not on the 1 s re-read.
    expect(screen.getByRole('alertdialog').textContent).toMatch(/1 question to the assistant may still be answered/);
    expect(drops).toEqual([]);
  });

  it('a shown question answered while the dialog is open drops out of the count on the asks notice', async () => {
    asksStored.mockReturnValue([askRec(1), askRec(2)]);
    const dialog = await askAsks();
    expect(dialog.textContent).toMatch(/2 questions to the assistant/);
    asksStored.mockReturnValue([askRec(2)]);
    await act(async () => notifyAsks());
    // At once on the notice, not on the 1 s re-read.
    expect(screen.getByRole('alertdialog').textContent).toMatch(/1 question to the assistant may still be answered/);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Sign out' })));
    await waitFor(() => expect(logout).toHaveBeenCalledTimes(1));
    expect(drops).toEqual([{ account: 'acct-a', asks: [askRec(2)] }]);
  });

  it('a drop the browser refused still signs out (a local drop never keeps a person signed in)', async () => {
    asksStored.mockReturnValue([askRec(1)]);
    dropAnswer.mockReturnValue('refused');
    await askAsks();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Sign out' })));
    await waitFor(() => expect(logout).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('the forget failing keeps the session and says why, with the questions named', async () => {
    asksStored.mockReturnValue([askRec(1)]);
    forget.mockImplementationOnce(async () => {
      calls.push('forget');
      return false;
    });
    await askAsks();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Sign out' })));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent("Sign-out didn't finish on this browser, so you're still signed in"));
    expect(logout).not.toHaveBeenCalled();
  });
});

// The asks drop runs before the forget, so a sign-out that does not finish can
// leave the person signed in with the shown questions no longer tracked. The dialog says so and never claims that
// everything is confirmed; an asks-only 'unknown' names no changes it never showed.
describe('warned sign-out: questions dropped, sign-out not finished', () => {
  const askAsks = async () => {
    render(<SignOutConfirm />);
    await act(async () => requestSignOut());
    return screen.findByRole('alertdialog', { name: 'Sign out while the assistant may still answer?' });
  };
  const failOnce = () =>
    forget.mockImplementationOnce(async () => {
      calls.push('forget');
      return false;
    });

  it('dropped, then the forget fails: still signed in, the questions are named as no longer followed, never "everything is confirmed"', async () => {
    asksStored.mockReturnValue([askRec(1)]);
    failOnce();
    await askAsks();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Sign out' })));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent("Sign-out didn't finish on this browser, so you're still signed in"));
    const text = screen.getByRole('alertdialog').textContent ?? '';
    expect(text).toMatch(/This browser no longer keeps track of the questions you confirmed to the assistant/);
    expect(text).not.toMatch(/Everything on this browser is confirmed/);
    expect(logout).not.toHaveBeenCalled();
  });

  it('dropped, then core answers changed: the neutral line, the stopped line, no "everything is confirmed"', async () => {
    asksStored.mockReturnValue([askRec(1)]);
    stored = [{ id: 'other', token: 't9' }]; // core finds a hold the dialog did not show: 'changed', nothing forgotten
    await askAsks();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Sign out' })));
    await waitFor(() => expect(screen.getByRole('alertdialog').textContent).toMatch(/Something changed on this browser while you were deciding/));
    const text = screen.getByRole('alertdialog').textContent ?? '';
    expect(text).toMatch(/This browser no longer keeps track of the questions you confirmed to the assistant/);
    expect(text).not.toMatch(/Everything on this browser is confirmed/);
  });

  it('an asks-only confirm that core answers unknown names no changes it never showed', async () => {
    asksStored.mockReturnValue([askRec(1)]);
    rollbackRefused = true;
    await askAsks();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Sign out' })));
    await waitFor(() => expect(screen.getByRole('alertdialog').textContent).toMatch(/didn't finish, so you're still signed in/));
    const text = screen.getByRole('alertdialog').textContent ?? '';
    expect(text).not.toMatch(/those changes/);
    expect(text).toMatch(/This browser no longer keeps track of the questions you confirmed to the assistant/);
    expect(text).not.toMatch(/Everything on this browser is confirmed/);
  });

  // Core counts an ask already gone as dropped, so an 'ok' drop does not prove an answer was
  // kept from showing: a delivery claim queued before the drop may have won. The line says only what is sure.
  it('a delivery claim wins before the drop (already gone, ok), then the forget fails: no promise that answers won\'t show', async () => {
    asksStored.mockReturnValue([askRec(1)]);
    dropAnswer.mockImplementationOnce(() => {
      // The answer's delivery claimed the ask first: it is gone before the drop looks, and the drop answers ok.
      asksStored.mockReturnValue([]);
      notifyAsks();
      return 'ok';
    });
    failOnce();
    await askAsks();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Sign out' })));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent("Sign-out didn't finish"));
    const text = screen.getByRole('alertdialog').textContent ?? '';
    expect(text).toMatch(/This browser no longer keeps track of the questions you confirmed to the assistant, so an answer may not show here/);
    expect(text).not.toMatch(/won't show/);
    expect(text).not.toMatch(/Everything on this browser is confirmed/);
  });

  it('a drop that removed nothing (refused), then the forget fails: the questions are still named, no stopped line', async () => {
    asksStored.mockReturnValue([askRec(1)]);
    dropAnswer.mockReturnValue('refused');
    failOnce();
    await askAsks();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Sign out' })));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent("Sign-out didn't finish"));
    const text = screen.getByRole('alertdialog').textContent ?? '';
    expect(text).toMatch(/1 question to the assistant may still be answered/);
    expect(text).not.toMatch(/no longer keeps track/);
  });

  it('Cancel after it, then a new ask: the next dialog starts clean (no stopped line)', async () => {
    asksStored.mockReturnValue([askRec(1)]);
    failOnce();
    await askAsks();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Sign out' })));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Cancel' })));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    asksStored.mockReturnValue([askRec(2)]);
    await act(async () => requestSignOut());
    const again = await screen.findByRole('alertdialog');
    expect(again.textContent).not.toMatch(/no longer keeps track/);
  });
});
