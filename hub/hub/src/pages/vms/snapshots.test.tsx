// Vitest: a VM's Snapshots tab over its fixture states. Take and restore need a stopped VM; restore and delete ask
// first; each change is sent once; a lost answer is held under the VM's one change lock and only a read (bound to the
// VM's own id) or Stop tracking frees it; a held restore is proved by no read.
import { act, render, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { heldChanges } from '@core';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
// fixtures.ts first: it imports fixtures.snap and calls its states(), so it must start the cycle.
import './fixtures';
import { vmChange, VM_LOCK } from './changes';
import { SNAPSHOTS, holdSnapReads, setSnapRows, snapLog, snapOrder, snapReadLog, resetSnapFixtures } from './fixtures.snap';
import page from './page';
import { isVmUnsure, useMarkVmUnsure } from './parts/unsure';
import strings from './strings.en.json';

// A test here opens a drawer or a dialog, sends, and reads again: several waits, each bounded by WAIT.
vi.setConfig({ testTimeout: 45000 });
const WAIT = { timeout: 10000 };
const say = (key: keyof typeof strings, vars: Record<string, string | number> = {}): string =>
  Object.entries(vars).reduce((s, [k, v]) => s.replaceAll(`{{${k}}}`, String(v)), strings[key]);
const STOPPED = '/vms/win11?tab=snapshots';
const RUNNING = '/vms/web-1?tab=snapshots';
const pause = (ms = 300) => new Promise((r) => setTimeout(r, ms));
const dialog = (name: string) => screen.findByRole('alertdialog', { name }, WAIT).catch(() => screen.findByRole('dialog', { name }, WAIT));
const button = (name: string) => screen.findByRole('button', { name }, WAIT);
const held = () => heldChanges(VM_LOCK).map((h) => h.identity as Record<string, unknown>);
const ready = () => button(say('snap.row.restoreName', { label: 'clean-install' }));
/** A row's Delete: it sits in the row's menu, after Restore. */
async function menuDelete(label: string): Promise<HTMLElement> {
  const row = (await button(say('snap.row.restoreName', { label }))).closest('tr') as HTMLElement;
  await userEvent.click(within(row).getByRole('button', { name: /row actions/i }));
  return screen.findByRole('menuitem', { name: new RegExp(`^${say('snap.row.deleteName', { label })}`) }, WAIT);
}
const closeMenu = () => userEvent.keyboard('{Escape}');

async function take(label: string) {
  await ready();
  await userEvent.click(await button(strings['snap.take.open']));
  const drawer = await dialog(say('snap.take.title', { vm: 'win11' }));
  const field = within(drawer).getByRole('textbox', { name: strings['snap.take.field'] });
  await userEvent.clear(field);
  await userEvent.click(field);
  await userEvent.paste(label);
  return drawer;
}
const submitTake = (drawer: HTMLElement) => userEvent.click(within(drawer).getByRole('button', { name: strings['snap.take.go'] }));
async function confirmRestore(label = 'clean-install') {
  await ready();
  await userEvent.click(await button(say('snap.row.restoreName', { label })));
  const d = await dialog(say('snap.restore.title', { label }));
  expect(within(d).getByText(say('snap.restore.body', { vm: 'win11' }))).toBeInTheDocument();
  return d;
}
async function confirmDelete(label = 'clean-install') {
  await userEvent.click(await menuDelete(label));
  return dialog(say('snap.remove.title', { label }));
}

// The page's view is loaded once here, so no test's own time goes to loading it.
beforeAll(async () => { await import('./view'); }, 180000);
beforeEach(() => {
  resetSnapFixtures();
});

describe('the list', () => {
  it('snap-many: each snapshot, and the one that cannot be restored says why on its Restore', async () => {
    await renderPage(page, { state: 'snap-many', path: STOPPED });
    await ready();
    for (const label of ['clean-install', 'before-drivers', 'old-layout']) expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    expect(screen.getAllByText(strings['snap.cannot'])).toHaveLength(1);
    const off = await button(say('snap.row.restoreName', { label: 'old-layout' }));
    expect(off).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(off);
    await pause();
    expect(screen.queryByText(say('snap.restore.title', { label: 'old-layout' }))).toBeNull();
    // The way to move a VM is a command to copy, naming the newest snapshot.
    expect(screen.getByText(strings['snap.move.title'])).toBeInTheDocument();
    expect(document.body.textContent).toContain('hoody vm snapshots export create win11 before-drivers');
    expect(snapLog).toEqual([]);
  });

  it('snap-empty: says so, and offers no move command', async () => {
    await renderPage(page, { state: 'snap-empty', path: STOPPED });
    expect(await screen.findByText(strings['snap.empty.title'], undefined, WAIT)).toBeInTheDocument();
    expect(screen.queryByText(strings['snap.move.title'])).toBeNull();
  });

  it('snap-loading: a skeleton, no rows', async () => {
    await renderPage(page, { state: 'snap-loading', path: STOPPED });
    await screen.findByRole('heading', { name: strings['snap.title'] }, WAIT);
    await pause();
    expect(screen.queryByText('clean-install')).toBeNull();
    expect(document.querySelectorAll('[data-skeleton]').length).toBeGreaterThan(0);
  });

  it('snap-error: the failed read offers a retry and no rows', async () => {
    await renderPage(page, { state: 'snap-error', path: STOPPED });
    expect((await screen.findAllByRole('button', { name: /try again|retry/i }, WAIT)).length).toBeGreaterThan(0);
    expect(screen.queryByText('clean-install')).toBeNull();
  });

  it('snap-shared: the snapshots are never asked for', async () => {
    await renderPage(page, { state: 'snap-shared', path: STOPPED });
    expect(await screen.findByText(say('st.shared', { name: 'atlas' }), undefined, WAIT)).toBeInTheDocument();
    await pause();
    expect(snapReadLog).toEqual([]);
    expect(snapLog).toEqual([]);
  });

  it('a running VM: take and restore are off with the reason, delete still works', async () => {
    await renderPage(page, { state: 'snap-many', path: RUNNING });
    await button(say('snap.row.restoreName', { label: 'v1' }));
    expect(await button(strings['snap.take.open'])).toHaveAttribute('aria-disabled', 'true');
    expect(await button(say('snap.row.restoreName', { label: 'v1' }))).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getAllByText(strings['snap.why.notStopped']).length).toBeGreaterThan(0);
    await userEvent.click(await button(strings['snap.take.open']));
    await userEvent.click(await button(say('snap.row.restoreName', { label: 'v1' })));
    await pause();
    expect(snapLog).toEqual([]);
    await userEvent.click(await menuDelete('v1'));
    await userEvent.click(within(await dialog(say('snap.remove.title', { label: 'v1' }))).getByRole('button', { name: strings['snap.remove.go'] }));
    await waitFor(() => expect(snapLog).toEqual([{ change: 'remove', vm: 'web-1', label: 'v1' }]), WAIT);
  });
});

describe('take', () => {
  it('reads the list fresh right before the send, then sends the label once and lists the snapshot', async () => {
    await renderPage(page, { state: 'snap-many', path: STOPPED });
    const drawer = await take('before-update');
    const before = snapOrder.length;
    await submitTake(drawer);
    await waitFor(() => expect(snapLog).toHaveLength(1), WAIT);
    // One log for reads and changes: the read made for this press arrived BEFORE the take.
    expect(snapOrder.slice(before, before + 2)).toEqual(['read:win11', 'take:win11:before-update']);
    await waitFor(() => expect(snapLog).toEqual([{ change: 'take', vm: 'win11', label: 'before-update' }]), WAIT);
    expect(await screen.findByText(strings['snap.take.done'], undefined, WAIT)).toBeInTheDocument();
    expect(await button(say('snap.row.restoreName', { label: 'before-update' }))).toBeInTheDocument();
    expect(held()).toEqual([]);
  });

  it('a label the list holds, or one that breaks the rule, is never sent', async () => {
    await renderPage(page, { state: 'snap-many', path: STOPPED });
    const drawer = await take('clean-install');
    expect(await within(drawer).findByText(strings['snap.take.taken'])).toBeInTheDocument();
    await submitTake(drawer).catch(() => undefined);
    const field = within(drawer).getByRole('textbox', { name: strings['snap.take.field'] });
    await userEvent.clear(field);
    await userEvent.click(field);
    await userEvent.paste('Not A Label');
    await submitTake(drawer).catch(() => undefined);
    await pause();
    expect(snapLog).toEqual([]);
  });

  it('another session took the label since the list was read: the fresh read stops the take, nothing is sent', async () => {
    await renderPage(page, { state: 'snap-many', path: STOPPED });
    const drawer = await take('s2');
    setSnapRows('snap-many', 'win11', [...SNAPSHOTS.win11!, { label: 's2', created_unix: 1_761_000_000, disk_bytes: 1, restorable: true }]);
    await submitTake(drawer);
    expect(await within(drawer).findByText(strings['snap.take.taken'], undefined, WAIT)).toBeInTheDocument();
    await pause();
    expect(snapLog).toEqual([]);
    expect(held()).toEqual([]);
  });

  it('during the first load of the list Take is off with the reason; the take made after it follows a read sent after the press', async () => {
    const release = holdSnapReads();
    await renderPage(page, { state: 'snap-many', path: STOPPED });
    await waitFor(() => expect(snapOrder).toContain('read:win11'), WAIT);
    // A take now would ride on that first request, sent before any press: Take is off until the list is in.
    const open = await button(strings['snap.take.open']);
    expect(open).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getAllByText(strings['snap.why.listUnread']).length).toBeGreaterThan(0);
    await userEvent.click(open);
    await pause(500);
    expect(screen.queryByRole('dialog', { name: say('snap.take.title', { vm: 'win11' }) })).toBeNull();
    release();
    await ready();
    const drawer = await take('after-load');
    const before = snapOrder.length;
    await submitTake(drawer);
    await waitFor(() => expect(snapLog).toEqual([{ change: 'take', vm: 'win11', label: 'after-load' }]), WAIT);
    expect(snapOrder.slice(before, before + 2)).toEqual(['read:win11', 'take:win11:after-load']);
  });

  it('snap-take-warned: taken, with what the computer noted', async () => {
    await renderPage(page, { state: 'snap-take-warned', path: STOPPED });
    await submitTake(await take('s2'));
    expect(await screen.findByText(say('snap.take.warned', { label: 's2', notes: 'the disk was copied in full: this snapshot takes its whole size now' }), undefined, WAIT)).toBeInTheDocument();
    expect(held()).toEqual([]);
  });

  it("snap-take-refused: the tab's sentence in the drawer, nothing held, not shown as taken", async () => {
    await renderPage(page, { state: 'snap-take-refused', path: STOPPED });
    const drawer = await take('s2');
    await submitTake(drawer);
    expect(await within(drawer).findByText(strings['snap.err.take.AlreadyExists'], undefined, WAIT)).toBeInTheDocument();
    expect(held()).toEqual([]);
    expect(screen.queryByText(strings['snap.take.done'])).toBeNull();
    expect(snapLog).toHaveLength(1);
  });

  it("snap-take-lost-nothing: held under the VM's lock by its id; a list without the label proves nothing; no other change of the VM is sent", async () => {
    await renderPage(page, { state: 'snap-take-lost-nothing', path: STOPPED });
    await submitTake(await take('s2'));
    const text = say('snap.held.take', { label: 's2' });
    expect(await screen.findByText(text, undefined, WAIT)).toBeInTheDocument();
    expect(held()).toHaveLength(1);
    expect(held()[0]).toMatchObject({ op: 'snap.take', name: 'win11', label: 's2', absentBefore: true });
    expect(typeof held()[0]!.vm).toBe('string');
    expect(screen.queryByText(strings['snap.take.done'])).toBeNull();
    // The one lock of the VM: its start is refused unsent, and so is every snapshot action.
    const target = heldChanges(VM_LOCK)[0]!.target!;
    const start = await vmChange.start.run({ target: target as never, vmId: String(held()[0]!.vm), name: 'win11', run: null });
    expect(start.outcome).toBe('not_sent');
    expect(await button(strings['snap.take.open'])).toHaveAttribute('aria-disabled', 'true');
    expect(await menuDelete('clean-install')).toHaveAttribute('aria-disabled', 'true');
    await closeMenu();
    await userEvent.click(screen.getByRole('button', { name: /check again/i }));
    await pause(500);
    expect(screen.getByText(text)).toBeInTheDocument();
    expect(snapLog).toHaveLength(1);
  });

  it('snap-take-lost: Check again proves it from a fresh list of the same VM', async () => {
    await renderPage(page, { state: 'snap-take-lost', path: STOPPED });
    await submitTake(await take('s2'));
    await waitFor(() => expect(held()).toHaveLength(1), WAIT);
    await userEvent.click(await screen.findByRole('button', { name: /check again/i }, WAIT));
    await waitFor(() => expect(held()).toEqual([]), WAIT);
    expect(await button(say('snap.row.restoreName', { label: 's2' }))).toBeInTheDocument();
    expect(snapLog).toHaveLength(1);
  });

  it('snap-take-no-space: a 507 is held with what the computer reported, never shown as refused or taken', async () => {
    await renderPage(page, { state: 'snap-take-no-space', path: STOPPED });
    await submitTake(await take('s2'));
    expect(await screen.findByText(say('snap.held.take', { label: 's2' }), undefined, WAIT)).toBeInTheDocument();
    expect(await screen.findByText(strings['snap.reason.InsufficientSpace'], undefined, WAIT)).toBeInTheDocument();
    expect(screen.queryByText(strings['snap.take.done'])).toBeNull();
    expect(held()).toHaveLength(1);
  });
});

describe('restore', () => {
  it('asks first; cancel sends nothing; confirm reads the list again, then sends once', async () => {
    await renderPage(page, { state: 'snap-many', path: STOPPED });
    let d = await confirmRestore();
    await userEvent.click(within(d).getByRole('button', { name: /cancel/i }));
    await pause();
    expect(snapLog).toEqual([]);
    d = await confirmRestore();
    const before = snapOrder.length;
    await userEvent.click(within(d).getByRole('button', { name: strings['snap.restore.go'] }));
    await waitFor(() => expect(snapLog).toEqual([{ change: 'restore', vm: 'win11', label: 'clean-install' }]), WAIT);
    expect(snapOrder.slice(before, before + 2)).toEqual(['read:win11', 'restore:win11:clean-install']);
    expect(await screen.findByText(strings['snap.restore.done'], undefined, WAIT)).toBeInTheDocument();
    expect(held()).toEqual([]);
  });

  it('the snapshot was replaced under its label since the list was read: the fresh read stops the restore, nothing is sent', async () => {
    await renderPage(page, { state: 'snap-many', path: STOPPED });
    const d = await confirmRestore();
    // Another session deleted it and took a new one under the same label.
    setSnapRows('snap-many', 'win11', [{ ...SNAPSHOTS.win11![0]!, created_unix: 1_761_000_000 }]);
    await userEvent.click(within(d).getByRole('button', { name: strings['snap.restore.go'] }));
    expect(await screen.findByText(say('snap.restore.changed', { label: 'clean-install' }), undefined, WAIT)).toBeInTheDocument();
    await pause();
    expect(snapLog).toEqual([]);
    expect(held()).toEqual([]);
  });

  it('the fresh read fails: nothing is sent and the tab says so', async () => {
    await renderPage(page, { state: 'snap-many', path: STOPPED });
    const d = await confirmRestore();
    setSnapRows('snap-many', 'win11', [{ label: 'Not A Label' }]);
    await userEvent.click(within(d).getByRole('button', { name: strings['snap.restore.go'] }));
    expect(await screen.findByText(say('snap.restore.unread', { label: 'clean-install' }), undefined, WAIT)).toBeInTheDocument();
    expect(snapLog).toEqual([]);
  });

  it("snap-restore-refused: the tab's sentence, nothing held, not shown as restored", async () => {
    await renderPage(page, { state: 'snap-restore-refused', path: STOPPED });
    await userEvent.click(within(await confirmRestore()).getByRole('button', { name: strings['snap.restore.go'] }));
    expect(await screen.findByText(strings['snap.err.restore.BadState'], undefined, WAIT)).toBeInTheDocument();
    expect(held()).toEqual([]);
    expect(screen.queryByText(strings['snap.restore.done'])).toBeNull();
  });

  it('snap-restore-lost: held, no read proves it, never sent again; only Stop tracking frees the VM', async () => {
    await renderPage(page, { state: 'snap-restore-lost', path: STOPPED });
    await userEvent.click(within(await confirmRestore()).getByRole('button', { name: strings['snap.restore.go'] }));
    const text = say('snap.held.restore', { label: 'clean-install' });
    expect(await screen.findByText(text, undefined, WAIT)).toBeInTheDocument();
    expect(held()[0]).toMatchObject({ op: 'snap.restore', label: 'clean-install' });
    expect(screen.queryByText(strings['snap.restore.done'])).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /check again/i }));
    await pause(500);
    expect(screen.getByText(text)).toBeInTheDocument();
    expect(held()).toHaveLength(1);
    expect(await button(say('snap.row.restoreName', { label: 'before-drivers' }))).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(screen.getByRole('button', { name: /stop tracking/i }));
    const q = await screen.findByRole('alertdialog', undefined, WAIT);
    await userEvent.click(within(q).getAllByRole('button').find((b) => /stop tracking/i.test(b.textContent ?? ''))!);
    await waitFor(() => expect(held()).toEqual([]), WAIT);
    expect(snapLog).toHaveLength(1);
  });
});

describe('delete', () => {
  it('asks first; confirm sends once and the snapshot leaves the list', async () => {
    await renderPage(page, { state: 'snap-many', path: STOPPED });
    const d = await confirmDelete();
    expect(within(d).getByText(say('snap.remove.body', { vm: 'win11' }))).toBeInTheDocument();
    await userEvent.click(within(d).getByRole('button', { name: strings['snap.remove.go'] }));
    await waitFor(() => expect(snapLog).toEqual([{ change: 'remove', vm: 'win11', label: 'clean-install' }]), WAIT);
    expect(await screen.findByText(strings['snap.remove.done'], undefined, WAIT)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('button', { name: say('snap.row.restoreName', { label: 'clean-install' }) })).toBeNull(), WAIT);
  });

  it('the snapshot was deleted and taken again under its label since the list was read: the fresh read stops the delete, nothing is sent', async () => {
    await renderPage(page, { state: 'snap-many', path: STOPPED });
    await ready();
    const d = await confirmDelete();
    // Another session did it; the tab has not read the list since.
    setSnapRows('snap-many', 'win11', [{ ...SNAPSHOTS.win11![0]!, created_unix: 1_761_000_000 }, ...SNAPSHOTS.win11!.slice(1)]);
    await userEvent.click(within(d).getByRole('button', { name: strings['snap.remove.go'] }));
    expect(await screen.findByText(say('snap.remove.changed', { label: 'clean-install' }), undefined, WAIT)).toBeInTheDocument();
    await pause();
    expect(snapLog).toEqual([]);
    expect(held()).toEqual([]);
  });

  it('the fresh read before a delete fails: nothing is sent and the tab says so', async () => {
    await renderPage(page, { state: 'snap-many', path: STOPPED });
    await ready();
    const d = await confirmDelete();
    setSnapRows('snap-many', 'win11', [{ label: 'Not A Label' }]);
    await userEvent.click(within(d).getByRole('button', { name: strings['snap.remove.go'] }));
    expect(await screen.findByText(say('snap.remove.unread', { label: 'clean-install' }), undefined, WAIT)).toBeInTheDocument();
    expect(snapLog).toEqual([]);
  });

  it("snap-remove-refused: the tab's sentence, nothing held, still listed", async () => {
    await renderPage(page, { state: 'snap-remove-refused', path: STOPPED });
    await userEvent.click(within(await confirmDelete()).getByRole('button', { name: strings['snap.remove.go'] }));
    expect(await screen.findByText(strings['snap.err.remove.OperationInProgress'], undefined, WAIT)).toBeInTheDocument();
    expect(held()).toEqual([]);
    expect(screen.queryByText(strings['snap.remove.done'])).toBeNull();
    expect(await ready()).toBeInTheDocument();
  });

  it('snap-remove-lost: held, then proved by a fresh list', async () => {
    await renderPage(page, { state: 'snap-remove-lost', path: STOPPED });
    await userEvent.click(within(await confirmDelete()).getByRole('button', { name: strings['snap.remove.go'] }));
    await waitFor(() => expect(held()).toHaveLength(1), WAIT);
    expect(screen.queryByText(strings['snap.remove.done'])).toBeNull();
    await userEvent.click(await screen.findByRole('button', { name: /check again/i }, WAIT));
    await waitFor(() => expect(held()).toEqual([]), WAIT);
    expect(snapLog).toHaveLength(1);
  });
});

// The VM's screen says the reads no longer agree on which VM holds the name (parts/unsure.ts): stated here as any
// screen may state it, since the guard fails closed on the name alone.
function Unsure({ name }: { name: string }) {
  useMarkVmUnsure('elsewhere', name, true);
  return null;
}
const makeUnsure = async (name = 'win11') => {
  await act(async () => { render(<Unsure name={name} />); });
  expect(isVmUnsure(name)).toBe(true);
};

describe('while the VM under this name is not sure', () => {
  it('take, restore and delete are off with the reason', async () => {
    await renderPage(page, { state: 'snap-many', path: STOPPED });
    await ready();
    await makeUnsure();
    await waitFor(async () => expect(await button(strings['snap.take.open'])).toHaveAttribute('aria-disabled', 'true'), WAIT);
    expect(await ready()).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getAllByText(strings['power.why.unread']).length).toBeGreaterThan(0);
  });

  it('a take typed before it turned unsure is not sent, and no list is read for it', async () => {
    await renderPage(page, { state: 'snap-many', path: STOPPED });
    await ready();
    await userEvent.click(await button(strings['snap.take.open']));
    const drawer = await dialog(say('snap.take.title', { vm: 'win11' }));
    await makeUnsure();
    const before = snapOrder.length;
    await userEvent.click(within(drawer).getByRole('button', { name: strings['snap.take.go'] }));
    await pause(800);
    expect(snapLog).toEqual([]);
    expect(snapOrder.slice(before).filter((x) => x.startsWith('take:'))).toEqual([]);
  });

  it('it turns unsure while a take reads the list before its send: the read comes back and no take is sent', async () => {
    await renderPage(page, { state: 'snap-many', path: STOPPED });
    await ready();
    await userEvent.click(await button(strings['snap.take.open']));
    const drawer = await dialog(say('snap.take.title', { vm: 'win11' }));
    const push = snapOrder.push.bind(snapOrder);
    let marked = false;
    snapOrder.push = (...xs: string[]) => {
      if (!marked && xs.includes('read:win11')) { marked = true; render(<Unsure name="win11" />); }
      return push(...xs);
    };
    try {
      const before = snapOrder.length;
      await userEvent.click(within(drawer).getByRole('button', { name: strings['snap.take.go'] }));
      await waitFor(() => expect(snapOrder.slice(before)).toContain('read:win11'), WAIT);
      expect(marked).toBe(true);
      await pause(1500);
      expect(snapLog).toEqual([]);
    } finally {
      snapOrder.push = push;
    }
  });

  it('a restore question open when it turned unsure closes; nothing is sent', async () => {
    await renderPage(page, { state: 'snap-many', path: STOPPED });
    await confirmRestore();
    await makeUnsure();
    await waitFor(() => expect(screen.queryByText(say('snap.restore.title', { label: 'clean-install' }))).toBeNull(), WAIT);
    await pause(500);
    expect(snapLog).toEqual([]);
  });

  it('it turns unsure while a confirmed restore reads the list: the read comes back and nothing is sent', async () => {
    await renderPage(page, { state: 'snap-many', path: STOPPED });
    const d = await confirmRestore();
    // The fact arrives with the list read the confirm starts, before that read answers.
    const push = snapOrder.push.bind(snapOrder);
    let marked = false;
    snapOrder.push = (...xs: string[]) => {
      if (!marked && xs.includes('read:win11')) { marked = true; render(<Unsure name="win11" />); }
      return push(...xs);
    };
    try {
      const before = snapOrder.length;
      await userEvent.click(within(d).getByRole('button', { name: strings['snap.restore.go'] }));
      await waitFor(() => expect(snapOrder.slice(before)).toContain('read:win11'), WAIT);
      expect(marked).toBe(true);
      await pause(1500);
      expect(snapLog).toEqual([]);
    } finally {
      snapOrder.push = push;
    }
  });

  it('it turns unsure in the very press that confirms a delete: nothing is sent', async () => {
    await renderPage(page, { state: 'snap-many', path: STOPPED });
    const d = await confirmDelete();
    // Stated in the capture phase of the confirming press, before the tab draws again or the question can close.
    let marked = false;
    const mark = () => { if (!marked) { marked = true; render(<Unsure name="win11" />); } };
    const kinds = ['pointerup', 'click'] as const;
    const go = within(d).getByRole('button', { name: strings['snap.remove.go'] });
    for (const k of kinds) go.addEventListener(k, mark, true);
    try {
      await userEvent.click(go);
      expect(marked).toBe(true);
      await pause(1500);
      expect(snapLog).toEqual([]);
    } finally {
      for (const k of kinds) go.removeEventListener(k, mark, true);
    }
  });

  it('a delete question open when it turned unsure closes; nothing is sent', async () => {
    await renderPage(page, { state: 'snap-many', path: STOPPED });
    await confirmDelete();
    await makeUnsure();
    await waitFor(() => expect(screen.queryByText(say('snap.remove.title', { label: 'clean-install' }))).toBeNull(), WAIT);
    await pause(500);
    expect(snapLog).toEqual([]);
  });
});
