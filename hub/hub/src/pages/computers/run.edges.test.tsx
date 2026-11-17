// Vitest: the Run tab and the menu's "Take a snapshot…" at their edges. The folder sent is the folder shown (outer
// spaces are part of a folder's name); a destructive command confirmed twice in one tick is still one run and never
// reads "not sent" while it is out; the menu's ask opens the Take drawer only on a whole, fresh list, as the card's
// own Take button does.
import { afterEach, describe, expect, it } from 'vitest';
import { act, fireEvent, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { interpolate } from '@kit';
import { checkFolder } from './cmd-logic';
import { execGate, execSends } from './fixtures';
import page from './page';
import strings from './strings.en.json';
import snapStrings from './snapshots/strings.en.json';

afterEach(() => {
  execGate.open?.();
  execGate.wait = undefined;
  execGate.open = undefined;
});

const folderField = () => screen.getByRole('combobox', { name: strings['run.folder'] });
const lastSent = () => execSends[execSends.length - 1] as { command?: string; cwd?: string } | undefined;

async function openRun(folder: string) {
  await renderPage(page, { path: '/computers?sel=atlas.00a1&tab=run' });
  const box = await screen.findByRole('textbox', { name: strings['run.label'] }, { timeout: 30000 });
  await userEvent.clear(folderField());
  if (folder) await userEvent.type(folderField(), folder);
  return box;
}

describe('computers: Run tab, the folder sent is the folder shown', () => {
  it('keeps the outer spaces of a folder name; a field of spaces only is the top folder', () => {
    expect(checkFolder(' tmp')).toEqual({ ok: true, cwd: '/ tmp' });
    expect(checkFolder('srv/app ')).toEqual({ ok: true, cwd: '/srv/app ' });
    expect(checkFolder(' srv /app')).toEqual({ ok: true, cwd: '/ srv /app' });
    expect(checkFolder('   ')).toEqual({ ok: true, cwd: '/' });
    expect(checkFolder('')).toEqual({ ok: true, cwd: '/' });
  });

  it('a folder typed with a leading space is sent with it, never as its trimmed neighbour', { timeout: 60000 }, async () => {
    const before = execSends.length;
    const box = await openRun(' tmp');
    await userEvent.type(box, 'ls');
    await userEvent.click(screen.getByRole('button', { name: strings['run.go'] }));
    await waitFor(() => expect(execSends.length).toBe(before + 1), { timeout: 8000 });
    expect(lastSent()?.cwd).toBe('/ tmp');
  });
});

describe('computers: Run tab, a destructive command confirmed twice', () => {
  it('two presses of the confirm in one tick send one run, and the tab never says "not sent" while it is out', { timeout: 60000 }, async () => {
    execGate.wait = new Promise<void>((open) => { execGate.open = open; });
    const before = execSends.length;
    const box = await openRun('srv/app');
    await userEvent.type(box, 'rm -rf build');
    await userEvent.click(screen.getByRole('button', { name: strings['run.go'] }));
    const d = await screen.findByRole('alertdialog', { name: strings['run.confirm.title'] }, { timeout: 8000 });
    const go = within(d).getByRole('button', { name: strings['run.go'] });
    await act(async () => {
      fireEvent.click(go);
      fireEvent.click(go);
    });
    await waitFor(() => expect(execSends.length).toBe(before + 1), { timeout: 8000 });
    // The first run is still out: the tab shows it running, not a refusal of the second press.
    await act(async () => { await new Promise((r) => setTimeout(r, 300)); });
    expect(screen.queryByText(strings['run.notSent'])).toBeNull();
    expect(screen.getByText(strings['run.running'])).toBeInTheDocument();
    execGate.open?.();
    await screen.findByText(interpolate(strings['run.ranIn'], { cwd: '/srv/app' }), { exact: false }, { timeout: 8000 });
    expect(execSends.length).toBe(before + 1);
    expect(screen.queryByText(strings['run.notSent'])).toBeNull();
  });
});

describe('computers: the menu\'s Take a snapshot… on a list that is not whole', () => {
  it('opens no drawer (the card\'s own Take is off there) and drops the ask from the address', { timeout: 60000 }, async () => {
    const r = await renderPage(page, { path: '/computers?sel=atlas.00a1&tab=backups&take=1', state: 'snapshotsPartial' });
    // The card says the list is not whole.
    await waitFor(() => expect(r.router.state.location.href).not.toMatch(/[?&]take=/), { timeout: 30000 });
    await act(async () => { await new Promise((x) => setTimeout(x, 300)); });
    expect(screen.queryByRole('dialog', { name: snapStrings['take.title'] })).toBeNull();
  });

  it('control: on a whole list the same address opens the drawer', { timeout: 60000 }, async () => {
    await renderPage(page, { path: '/computers?sel=atlas.00a1&tab=backups&take=1' });
    expect(await screen.findByRole('dialog', { name: snapStrings['take.title'] }, { timeout: 30000 })).toBeInTheDocument();
  });
});
