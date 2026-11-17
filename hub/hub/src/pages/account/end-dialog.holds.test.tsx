// Vitest: the session dialog's Start over frees the hold of the target the dialog is about (a session's revoke by that
// session's id, or end-others), never another session's revoke or the other operation, shown or not; a reopened dialog
// over a held revoke offers the warned Start over, also after an inconclusive Check again.
import { act, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { bootFixtureCore } from '@core';
import { useSyncExternalStore } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Data from './data';
import page from './page';
import { locks } from './parts/locks';
import strings from './strings.en.json';

type Row = { hold: string; at: number; identity: unknown; account: string };
const A = '5e55c0ffee00000000000002';
const B = '5e55c0ffee00000000000001';
const row = (identity: unknown, hold: string): Row => ({ hold, at: 1, identity, account: 'acct' });

// The core's holds as the page sees them, with core's own by-token rules for the two end hooks.
const core = vi.hoisted(() => ({
  one: [] as Row[],
  others: [] as Row[],
  freed: [] as string[],
  proves: false,
  ghost: false,
  dropGhostOnRead: false,
  delay: 0,
  dismissDelay: 0,
  refetches: 0,
  subs: new Set<() => void>(),
  rev: 0,
}));
const tick = () => {
  core.rev++;
  core.subs.forEach((f) => f());
};
const useFake = (which: 'one' | 'others') => {
  useSyncExternalStore(
    (f) => (core.subs.add(f), () => core.subs.delete(f)),
    () => core.rev,
  );
  const rows = () => core[which];
  const free = (r: Row): boolean => {
    const i = rows().findIndex((x) => x.hold === r.hold);
    if (i < 0) return false;
    rows().splice(i, 1);
    core.freed.push(r.hold);
    return true;
  };
  const dismiss = (list: Row[]) => {
    let all = true;
    for (const r of list) if (!free(r)) all = false;
    tick();
    return all;
  };
  const holds = [...rows()];
  return {
    run: async (vars?: { id: string }) => {
      // A send whose outcome is unknown: core keeps its hold (the session's id, or end-others, is the identity).
      core[which].push(row(vars?.id ?? 'endOthers', 'h' + (vars?.id ?? 'O') + core.rev));
      tick();
      return { outcome: 'pending' as const };
    },
    running: false,
    pending: holds.length > 0 || core.ghost,
    holds,
    readBack: async () => {
      if (core.delay) await new Promise((r) => setTimeout(r, core.delay));
      if (core.dropGhostOnRead) {
        core.ghost = false;
        tick();
      }
      // As core: a read that proved the send lets its holds go (they are not Start over's frees); one that proved
      // nothing frees nothing.
      if (core.proves && (rows().length > 0 || core.ghost)) {
        rows().length = 0;
        core.ghost = false;
        tick();
      }
      return core.proves;
    },
    heldNow: () => [...rows()],
    // core's frees answer once stored: after a store-lock turn (dismissDelay stands in for a long one).
    dismissRows: async (list: Row[]) => {
      if (core.dismissDelay) await new Promise((r) => setTimeout(r, core.dismissDelay));
      return dismiss(list);
    },
  };
};
vi.mock('./data', async (orig) => {
  const data = await orig<typeof Data>();
  return {
    ...data,
    useEndSession: () => useFake('one'),
    useEndOthers: () => useFake('others'),
    // The page's own re-read of the sessions, counted (the answer is still the real one).
    useSessions: (kind: 'active' | 'ended') => {
      const q = data.useSessions(kind);
      return { ...q, refetch: (...a: Parameters<typeof q.refetch>) => (core.refetches++, q.refetch(...a)) };
    },
  };
});

beforeEach(() => {
  bootFixtureCore();
  locks.clear();
  core.one = [];
  core.others = [];
  core.freed = [];
  core.proves = false;
  core.ghost = false;
  core.dropGhostOnRead = false;
  core.delay = 0;
  core.dismissDelay = 0;
  core.refetches = 0;
});

const dialogIn = (): Promise<HTMLElement> =>
  waitFor(
    () => {
      const d = document.querySelector<HTMLElement>('[role="alertdialog"][open], dialog[open], [role="alertdialog"]');
      if (!d) throw new Error('no dialog');
      return d;
    },
    { timeout: 8000 },
  );
const dialogFor = async (target: string): Promise<HTMLElement> => {
  await renderPage(page, { path: `/account?end=${target}` });
  return dialogIn();
};
const startOver = (d: HTMLElement) => within(d).queryByRole('button', { name: strings['check.startOver'] });

describe('the session dialog frees only its own target', () => {
  it("B's Start over frees B's revoke and leaves A's revoke and the end-others hold held", async () => {
    core.one = [row(A, 'hA'), row(B, 'hB')];
    core.others = [row('endOthers', 'hO')];
    const d = await dialogFor(B);
    await userEvent.click(startOver(d)!);
    expect(core.freed).toEqual(['hB']);
    expect(core.one.map((r) => r.identity)).toEqual([A]);
    expect(core.others).toHaveLength(1);
  });

  it("a Start over that frees its target's hold closes the dialog, with no note", async () => {
    core.one = [row(B, 'hB')];
    const { router } = await renderPage(page, { path: `/account?end=${B}` });
    const d = await dialogIn();
    await userEvent.click(startOver(d)!);
    await waitFor(() => expect((router.state.location.search as Record<string, unknown>).end).toBeUndefined());
    expect(core.freed).toEqual(['hB']);
    expect(screen.queryByText(strings['s.endNothing'])).toBeNull();
  });

  it("the end-others dialog frees the end-others hold and no session's revoke", async () => {
    core.one = [row(A, 'hA')];
    core.others = [row('endOthers', 'hO')];
    const d = await dialogFor('others');
    await userEvent.click(startOver(d)!);
    expect(core.freed).toEqual(['hO']);
    expect(core.one).toHaveLength(1);
  });

  it("another session's held revoke neither locks B's dialog nor offers it Start over", async () => {
    core.one = [row(A, 'hA')];
    const d = await dialogFor(B);
    expect(startOver(d)).toBeNull();
    expect(core.freed).toEqual([]);
  });

  it("the doubt raised on A's dialog is A's: B's dialog, opened in the same page, is not locked and has no Start over, and A's still frees A's", async () => {
    const { router } = await renderPage(page, { path: `/account?end=${A}` });
    const d = await dialogIn();
    await userEvent.click(within(d).getByRole('button', { name: strings['s.end'] }));
    expect(await within(d).findByRole('button', { name: strings['check.startOver'] })).toBeInTheDocument();
    expect(core.one.map((r) => r.identity)).toEqual([A]);
    act(() => router.history.push(`/account?end=${B}`));
    await waitFor(() => expect(startOver(d)).toBeNull());
    expect(within(d).getByRole('button', { name: strings['s.end'] })).not.toBeDisabled();
    act(() => router.history.push(`/account?end=${A}`));
    await userEvent.click(await within(d).findByRole('button', { name: strings['check.startOver'] }));
    expect(core.one).toHaveLength(0);
  });

  it("a send that replaced B's shown hold meanwhile stays held and the answer is the note, never failed", async () => {
    core.one = [row(B, 'hB')];
    const d = await dialogFor(B);
    // Another tab freed the shown hold and sent again: the page re-renders over the replacement.
    core.one = [row(B, 'hB2')];
    act(() => tick());
    await userEvent.click(startOver(d)!);
    expect(core.one.map((r) => r.hold)).toEqual(['hB2']);
    const note = await within(d).findByText(strings['s.endNothing']);
    // The replacement is still out, its outcome unknown: the note never says the session ended, and points at Check again.
    expect(note.textContent).not.toMatch(/ended/);
    expect(note.textContent).toMatch(/replaced/);
    expect(note.textContent).toContain(strings['check.again']);
    expect(startOver(d)).not.toBeNull();
  });

  it("a hold another tab settled meanwhile answers with the note too (nothing was dismissed), not a silent close", async () => {
    core.one = [row(B, 'hB')];
    const d = await dialogFor(B);
    core.one = [];
    core.ghost = true;
    act(() => tick());
    await userEvent.click(startOver(d)!);
    expect(await within(d).findByText(strings['s.endNothing'])).toBeInTheDocument();
  });

  it("an inconclusive Check again re-arms over the replacement: the next Start over frees it, and the old note is gone", async () => {
    core.one = [row(B, 'hB')];
    const d = await dialogFor(B);
    core.one = [row(B, 'hB2')];
    act(() => tick());
    await userEvent.click(startOver(d)!);
    expect(core.one.map((r) => r.hold)).toEqual(['hB2']);
    expect(await within(d).findByText(strings['s.endNothing'])).toBeInTheDocument();
    await userEvent.click(within(d).getByRole('button', { name: strings['check.again'] }));
    await waitFor(() => expect(within(d).queryByText(strings['s.endNothing'])).toBeNull());
    await userEvent.click(startOver(d)!);
    expect(core.freed).toEqual(['hB2']);
    expect(core.one).toHaveLength(0);
  });

  it('control: a replacement that arrives after the Check again, before the press, is still refused', async () => {
    core.one = [row(B, 'hB')];
    const d = await dialogFor(B);
    await userEvent.click(within(d).getByRole('button', { name: strings['check.again'] }));
    await waitFor(() => expect(within(d).getByRole('button', { name: strings['check.again'] })).not.toBeDisabled());
    core.one = [row(B, 'hB2')];
    act(() => tick());
    await userEvent.click(startOver(d)!);
    expect(core.one.map((r) => r.hold)).toEqual(['hB2']);
    expect(await within(d).findByText(strings['s.endNothing'])).toBeInTheDocument();
  });
});

describe('the automatic read after a pending answer', () => {
  it("a read that returns the session unchanged (not a failed read) proves nothing: the hold, the doubt and the page notice all stay", async () => {
    const { router } = await renderPage(page, { path: `/account?end=${A}` });
    const d = await dialogIn();
    await userEvent.click(within(d).getByRole('button', { name: strings['s.end'] }));
    // The send's answer is lost; the page then re-reads the sessions by itself and the session is still there.
    expect(await within(d).findByRole('button', { name: strings['check.startOver'] })).toBeInTheDocument();
    // The automatic read of the sessions ran and came back with the session still listed.
    await waitFor(() => expect(core.refetches).toBeGreaterThan(0));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 500));
    });
    expect(document.body.textContent).toContain('Chrome');
    expect(core.one.map((r) => r.identity)).toEqual([A]);
    expect(core.freed).toEqual([]);
    expect(startOver(d)).not.toBeNull();
    expect(within(d).getByText(strings['s.endWarn'])).toBeInTheDocument();
    expect((router.state.location.search as Record<string, unknown>).end).toBe(A);
    expect(screen.getAllByText(strings['err.pending']).length).toBeGreaterThan(0);
  });
});

describe('a reopened dialog over a held revoke', () => {
  it("a Start over that answers after the dialog moved to another target leaves that target's dialog as it is", async () => {
    core.one = [row(A, 'hA'), row(B, 'hB')];
    core.dismissDelay = 400;
    const { router } = await renderPage(page, { path: `/account?end=${A}` });
    const d = await dialogIn();
    await userEvent.click(startOver(d)!);
    act(() => router.history.push(`/account?end=${B}`));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 700));
    });
    // A's revoke was freed (its own answer), but B's dialog stays open, B's hold stays offered and no note says nothing was dismissed.
    expect(core.freed).toEqual(['hA']);
    expect((router.state.location.search as Record<string, unknown>).end).toBe(B);
    const now = await dialogIn();
    expect(startOver(now)).not.toBeNull();
    expect(within(now).queryByText(strings['s.endNothing'])).toBeNull();
  });

  it("a Start over that frees after the dialog was closed and opened again on the same target leaves the new dialog open", async () => {
    core.one = [row(A, 'hA')];
    core.dismissDelay = 400;
    const { router } = await renderPage(page, { path: `/account?end=${A}` });
    const d = await dialogIn();
    await userEvent.click(startOver(d)!);
    act(() => router.history.push('/account'));
    act(() => router.history.push(`/account?end=${A}`));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 700));
    });
    // The first opening's Start over freed its hold, but the dialog opened since is another one: it stays open.
    expect(core.freed).toEqual(['hA']);
    expect((router.state.location.search as Record<string, unknown>).end).toBe(A);
    expect(await dialogIn()).not.toBeNull();
  });

  it("a Start over that frees nothing after the dialog was closed and opened again shows no note on the new dialog", async () => {
    core.one = [row(A, 'hA')];
    core.dismissDelay = 400;
    const { router } = await renderPage(page, { path: `/account?end=${A}` });
    const d = await dialogIn();
    await userEvent.click(startOver(d)!);
    act(() => router.history.push('/account'));
    act(() => router.history.push(`/account?end=${A}`));
    // A send in another tab replaced A's hold meanwhile: the late answer is "nothing freed", for the closed opening only,
    // and the new dialog still offers its Start over over the replacement.
    core.one.splice(0, 1, row(A, 'hA2'));
    act(() => tick());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 700));
    });
    expect(core.freed).toEqual([]);
    const now = await dialogIn();
    expect(startOver(now)).not.toBeNull();
    expect(within(now).queryByText(strings['s.endNothing'])).toBeNull();
  });

  it("a Check again that answers after the dialog moved to another target does not raise the doubt on that target", async () => {
    core.one = [row(A, 'hA')];
    core.delay = 400;
    const { router } = await renderPage(page, { path: `/account?end=${A}` });
    const d = await dialogIn();
    await userEvent.click(within(d).getByRole('button', { name: strings['check.again'] }));
    act(() => router.history.push(`/account?end=${B}`));
    await waitFor(() => expect(startOver(d)).toBeNull());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 600));
    });
    // A's inconclusive answer arrived while B's dialog is open: B has no held revoke, so it is not locked and has no Start over.
    expect(startOver(d)).toBeNull();
    expect(within(d).getByRole('button', { name: strings['s.end'] })).not.toBeDisabled();
    expect(core.freed).toEqual([]);
  });

  it("a Check again that proves A's revoke done after the dialog moved to B leaves B's dialog open", async () => {
    core.one = [row(A, 'hA')];
    core.delay = 400;
    core.proves = true;
    const { router } = await renderPage(page, { path: `/account?end=${A}` });
    const d = await dialogIn();
    await userEvent.click(within(d).getByRole('button', { name: strings['check.again'] }));
    act(() => router.history.push(`/account?end=${B}`));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 700));
    });
    expect((router.state.location.search as Record<string, unknown>).end).toBe(B);
    expect(document.querySelector('[role="alertdialog"][open], dialog[open], [role="alertdialog"]')).not.toBeNull();
  });

  it("a Check again that proves the revoke done after the dialog was closed and opened again on the same target leaves the new dialog open", async () => {
    core.one = [row(A, 'hA')];
    core.delay = 400;
    core.proves = true;
    const { router } = await renderPage(page, { path: `/account?end=${A}` });
    const d = await dialogIn();
    await userEvent.click(within(d).getByRole('button', { name: strings['check.again'] }));
    act(() => router.history.push('/account'));
    act(() => router.history.push(`/account?end=${A}`));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 700));
    });
    // The first opening's proof ended its doubt, but the dialog opened since is another one: it stays open.
    expect((router.state.location.search as Record<string, unknown>).end).toBe(A);
    expect(await dialogIn()).not.toBeNull();
  });

  it("a Check again that proves the revoke done after the dialog moved still clears the page's pending notice", async () => {
    const { router } = await renderPage(page, { path: `/account?end=${A}` });
    const d = await dialogIn();
    await userEvent.click(within(d).getByRole('button', { name: strings['s.end'] }));
    expect(await screen.findAllByText(strings['err.pending'])).not.toHaveLength(0);
    core.delay = 400;
    core.proves = true;
    await userEvent.click(within(d).getByRole('button', { name: strings['check.again'] }));
    act(() => router.history.push(`/account?end=${B}`));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 700));
    });
    expect((router.state.location.search as Record<string, unknown>).end).toBe(B);
    expect(screen.queryAllByText(strings['err.pending'])).toHaveLength(0);
  });

  it('offers the warning and Start over from the hold alone, and keeps them after an inconclusive Check again', async () => {
    core.one = [row(B, 'hB')];
    const d = await dialogFor(B);
    expect(within(d).getByText(strings['s.endWarn'])).toBeInTheDocument();
    await userEvent.click(within(d).getByRole('button', { name: strings['check.again'] }));
    await waitFor(() => expect(within(d).getByRole('button', { name: strings['check.again'] })).not.toBeDisabled());
    expect(startOver(d)).not.toBeNull();
    expect(core.freed).toEqual([]);
  });

  it('an inconclusive Check again keeps the doubt: a change core no longer lists is still offered Start over, which then closes the dialog', async () => {
    core.ghost = true;
    core.dropGhostOnRead = true;
    const d = await dialogFor(B);
    expect(startOver(d)).not.toBeNull();
    await userEvent.click(within(d).getByRole('button', { name: strings['check.again'] }));
    await waitFor(() => expect(core.ghost).toBe(false));
    await waitFor(() => expect(within(d).getByRole('button', { name: strings['check.again'] })).not.toBeDisabled());
    expect(startOver(d)).not.toBeNull();
    await userEvent.click(startOver(d)!);
    await waitFor(() => expect(document.querySelector('[role="alertdialog"][open]')).toBeNull());
    expect(core.freed).toEqual([]);
  });
});

describe('the warned Stop tracking is part of the dialog\'s own pending outcome', () => {
  it('the warning is the outcome\'s line and Stop tracking sits on the outcome after Check again, outside the text the dialog is described by', async () => {
    core.one = [row(B, 'hB')];
    const d = await dialogFor(B);
    const press = startOver(d)!;
    const outcome = d.querySelector<HTMLElement>('[data-dialog-outcome]')!;
    expect(outcome).not.toBeNull();
    expect(outcome).toHaveTextContent(strings['s.endWarn']);
    expect(outcome.querySelector('[data-dialog-outcome-actions]')).toContainElement(press);
    const names = within(outcome).getAllByRole('button').map((b) => b.textContent ?? '');
    expect(names.indexOf(strings['check.startOver'])).toBeGreaterThan(names.findIndex((n) => /Check again/.test(n)));
    // No hand-made line in the body any more.
    expect(within(d).getByText(strings['s.endWarn']).closest('p')).toBeNull();
    const described = (d.getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean).map((id) => document.getElementById(id));
    for (const el of described) expect(el?.contains(outcome)).toBe(false);
    expect(within(d).getAllByRole('button', { name: strings['check.startOver'] })).toHaveLength(1);
  });

  it('no doubt, no outcome actions: a dialog that is not unsure shows neither the warning nor Stop tracking', async () => {
    core.one = [row(A, 'hA')];
    const d = await dialogFor(B);
    expect(d.querySelector('[data-dialog-outcome-actions]')).toBeNull();
    expect(within(d).queryByText(strings['s.endWarn'])).toBeNull();
  });
});

describe('the warning reaches a screen reader before Stop tracking', () => {
  it('Stop tracking is described by the warning', async () => {
    core.one = [row(B, 'hB')];
    const d = await dialogFor(B);
    const press = startOver(d)!;
    const warn = (ids: string | null) => (ids ?? '').split(' ').filter(Boolean).map((id) => document.getElementById(id)?.textContent ?? '');
    expect(warn(press.getAttribute('aria-describedby'))).toContain(strings['s.endWarn']);
  });
});

describe("the page's pending notice and Stop tracking in one dialog", () => {
  const sendBoth = async () => {
    const { router } = await renderPage(page, { path: `/account?end=${A}` });
    const d = await dialogIn();
    await userEvent.click(within(d).getByRole('button', { name: strings['s.end'] }));
    expect(await within(d).findByRole('button', { name: strings['check.startOver'] })).toBeInTheDocument();
    act(() => router.history.push(`/account?end=${B}`));
    await waitFor(() => expect(startOver(d)).toBeNull());
    await userEvent.click(within(d).getByRole('button', { name: strings['s.end'] }));
    expect(await within(d).findByRole('button', { name: strings['check.startOver'] })).toBeInTheDocument();
    expect(core.one.map((r) => r.identity)).toEqual([A, B]);
    return { router, d };
  };

  it("B's Stop tracking leaves the notice while A's revoke is still held", async () => {
    const { router, d } = await sendBoth();
    await userEvent.click(startOver(d)!);
    await waitFor(() => expect((router.state.location.search as Record<string, unknown>).end).toBeUndefined());
    expect(core.one.map((r) => r.identity)).toEqual([A]);
    expect(screen.queryAllByText(strings['err.pending'])).not.toHaveLength(0);
  });

  it('the last Stop tracking takes the notice away', async () => {
    const { router, d } = await sendBoth();
    await userEvent.click(startOver(d)!);
    await waitFor(() => expect((router.state.location.search as Record<string, unknown>).end).toBeUndefined());
    act(() => router.history.push(`/account?end=${A}`));
    await userEvent.click(await within(await dialogIn()).findByRole('button', { name: strings['check.startOver'] }));
    await waitFor(() => expect(core.one).toHaveLength(0));
    await waitFor(() => expect(screen.queryAllByText(strings['err.pending'])).toHaveLength(0));
  });
});

describe("the page's pending notice on a fresh visit", () => {
  const notice = () => screen.queryAllByText(strings['err.pending']);
  const visit = async () => {
    await renderPage(page, { path: '/account' });
    await screen.findByRole('heading', { name: strings['s.title'] }, { timeout: 8000 });
  };

  it('a revoke still held from an earlier visit shows the notice, with no dialog open', async () => {
    core.one = [row(B, 'hB')];
    await visit();
    await waitFor(() => expect(notice()).not.toHaveLength(0));
    expect(document.querySelector('[role="alertdialog"][open], dialog[open]')).toBeNull();
  });

  it('a held end-others shows it too, and no hold shows none', async () => {
    await visit();
    expect(notice()).toHaveLength(0);
    act(() => {
      core.others = [row('endOthers', 'hO')];
      tick();
    });
    await waitFor(() => expect(notice()).not.toHaveLength(0));
  });

  it('a Check again that proves nothing keeps the notice and the hold', async () => {
    core.one = [row(B, 'hB')];
    await visit();
    await userEvent.click((await screen.findAllByRole('button', { name: strings['check.again'] }))[0]!);
    await waitFor(() => expect(screen.getAllByRole('button', { name: strings['check.again'] })[0]).not.toBeDisabled());
    expect(notice()).not.toHaveLength(0);
    expect(core.one.map((r) => r.hold)).toEqual(['hB']);
  });

  it('a Check again that proves the revoke takes the notice away', async () => {
    core.one = [row(B, 'hB')];
    await visit();
    core.proves = true;
    await userEvent.click((await screen.findAllByRole('button', { name: strings['check.again'] }))[0]!);
    await waitFor(() => expect(notice()).toHaveLength(0));
    expect(core.one).toHaveLength(0);
    expect(core.freed).toEqual([]);
  });
});
