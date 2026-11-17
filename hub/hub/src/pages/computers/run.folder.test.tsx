// Vitest: the Run tab's Folder. The folder is always sent ('/' when the field is empty: without it the terminal program
// starts from its own default folder), the result says where the command ran, and a refused folder is a definite
// failure (nothing ran) with the reason under the field, never "may have run". A destructive command's question shows
// the folder it will run in; a refusal is shown only while the field still holds the folder it refused.
import { afterEach, describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { interpolate } from '@kit';
import { checkFolder, fromAnswer, requestBody } from './cmd-logic';
import { execGate, execSends } from './fixtures';
import page from './page';
import strings from './strings.en.json';

const answer = (extra: Record<string, unknown>) => ({ mode: 'raw', completion: 'exited', exit_code: 0, signal: '', duration_ms: 5, stdout_b64: '', stderr_b64: '', ...extra });

afterEach(() => {
  execGate.open?.();
  execGate.wait = undefined;
  execGate.open = undefined;
});

describe('the folder in the run body and the answer', () => {
  it('always sends cwd, / when none is set', () => {
    expect(requestBody('ls', '/')).toEqual({ command: 'ls', mode: 'raw', wait: true, timeout: 60, cwd: '/' });
    expect(requestBody('ls', '/srv/app').cwd).toBe('/srv/app');
  });
  it('reads the field from the top folder: empty is /, a trailing / or a typed leading / is the same folder', () => {
    expect(checkFolder('')).toEqual({ ok: true, cwd: '/' });
    expect(checkFolder('srv/app')).toEqual({ ok: true, cwd: '/srv/app' });
    expect(checkFolder('srv/app/')).toEqual({ ok: true, cwd: '/srv/app' });
    expect(checkFolder('/srv')).toEqual({ ok: true, cwd: '/srv' });
    // Spaces are part of the name: the folder sent is the folder shown (run.edges.test.tsx).
    expect(checkFolder(' srv ')).toEqual({ ok: true, cwd: '/ srv ' });
  });
  it('refuses control characters, a way up and a path too long', () => {
    expect(checkFolder('a\u0007b')).toEqual({ ok: false, why: 'control' });
    expect(checkFolder('srv/../etc')).toEqual({ ok: false, why: 'up' });
    expect(checkFolder('a'.repeat(4096))).toEqual({ ok: false, why: 'long' });
  });
  it('reads the reported folder only as an absolute path', () => {
    expect(fromAnswer(answer({ cwd: '/home/u' }))?.cwd).toBe('/home/u');
    expect(fromAnswer(answer({ cwd: 'home' }))?.cwd).toBeNull();
    expect(fromAnswer(answer({ cwd: 5 }))?.cwd).toBeNull();
    expect(fromAnswer(answer({}))?.cwd).toBeNull();
  });
});

const folderField = () => screen.getByRole('combobox', { name: strings['run.folder'] });

/** Opens atlas's Run tab with `folder` typed in the Folder field (the field keeps a computer's folder for the visit). */
async function openRun(folder: string, state?: string) {
  await renderPage(page, { path: '/computers?sel=atlas.00a1&tab=run', ...(state ? { state } : {}) });
  const box = await screen.findByRole('textbox', { name: strings['run.label'] }, { timeout: 30000 });
  await userEvent.clear(folderField());
  if (folder) await userEvent.type(folderField(), folder);
  return box;
}

async function runIn(command: string, folder: string, state?: string) {
  const box = await openRun(folder, state);
  await userEvent.type(box, command);
  await userEvent.click(screen.getByRole('button', { name: strings['run.go'] }));
}

const lastSent = () => execSends[execSends.length - 1] as { command?: string; cwd?: string } | undefined;

describe('computers: Run tab, Folder', () => {
  it('runs in / by default, sends it once, and says where it ran', { timeout: 60000 }, async () => {
    const before = execSends.length;
    await runIn('ls', '');
    expect(await screen.findByText(interpolate(strings['run.ranIn'], { cwd: '/' }), { exact: false }, { timeout: 8000 })).toBeInTheDocument();
    expect(execSends.length).toBe(before + 1);
    expect(lastSent()).toMatchObject({ command: 'ls', cwd: '/' });
  });

  it('sends the folder typed', { timeout: 60000 }, async () => {
    await runIn('ls', 'srv/app');
    expect(await screen.findByText(interpolate(strings['run.ranIn'], { cwd: '/srv/app' }), { exact: false }, { timeout: 8000 })).toBeInTheDocument();
    expect(lastSent()?.cwd).toBe('/srv/app');
  });

  it('a folder with a way up is refused in the field and Run stays off', { timeout: 60000 }, async () => {
    const before = execSends.length;
    const box = await openRun('srv/../etc');
    await userEvent.type(box, 'ls');
    expect(screen.getByText(strings['run.folder.invalid.up'])).toBeInTheDocument();
    expect(screen.getByRole('button', { name: strings['run.go'] })).toBeDisabled();
    expect(execSends.length).toBe(before);
  });

  it('says so when the program ran somewhere else', { timeout: 60000 }, async () => {
    await runIn('ls', '', 'runFolderOther');
    expect(await screen.findByText(interpolate(strings['run.ranInAsked'], { cwd: '/root', sent: '/' }), { exact: false }, { timeout: 8000 })).toBeInTheDocument();
  });

  it('a refused folder is a failure with its reason under the field, never "may have run"', { timeout: 60000 }, async () => {
    const before = execSends.length;
    await runIn('ls', 'missing', 'runFolderMissing');
    const words = interpolate(strings['run.folder.refused.missing'], { name: 'atlas' });
    expect(await screen.findByText(words, {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByText(strings['run.failed'])).toBeInTheDocument();
    expect(screen.queryByText(strings['run.unknownShort'])).toBeNull();
    expect(execSends.length).toBe(before + 1);
    // Another folder in the field: the refusal was about the old one.
    await userEvent.type(folderField(), '2');
    await waitFor(() => expect(screen.queryByText(words)).toBeNull());
  });

  it('a 5xx naming the folder code proves nothing, so it is the held "may have run", never a failure', { timeout: 60000 }, async () => {
    await runIn('ls', '', 'runFolderBroken');
    expect(await screen.findByText(interpolate(strings['held.run'], { name: 'atlas' }), {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.queryByText(strings['run.failed'])).toBeNull();
    expect(screen.queryByText(strings['run.folder.refused.failed'])).toBeNull();
  });

  // A refusal that comes back after the field was changed belongs to the folder that was sent: it never shows under
  // the folder typed since, and shows again only if the field holds the refused folder again.
  it('a late refusal never shows under a folder typed while the run was out', { timeout: 60000 }, async () => {
    execGate.wait = new Promise<void>((open) => { execGate.open = open; });
    await runIn('ls', 'missing', 'runFolderMissing');
    await waitFor(() => expect(lastSent()?.cwd).toBe('/missing'));
    await userEvent.clear(folderField());
    await userEvent.type(folderField(), 'srv');
    execGate.open?.();
    expect(await screen.findByText(strings['run.failed'], {}, { timeout: 8000 })).toBeInTheDocument();
    const words = interpolate(strings['run.folder.refused.missing'], { name: 'atlas' });
    expect(screen.queryByText(words)).toBeNull();
    await userEvent.clear(folderField());
    await userEvent.type(folderField(), 'missing');
    expect(await screen.findByText(words)).toBeInTheDocument();
  });

  it("a destructive command's question shows the folder it runs in, and Run sends that folder once", { timeout: 60000 }, async () => {
    const before = execSends.length;
    await runIn('rm -rf build', 'srv/app');
    const d = await screen.findByRole('alertdialog', { name: strings['run.confirm.title'] }, { timeout: 8000 });
    // The folder is its own block, named Folder, beside the command's.
    expect(within(d).getByLabelText(strings['run.folder'])).toHaveTextContent('/srv/app');
    expect(within(d).getByLabelText(strings['run.label'])).toHaveTextContent('rm -rf build');
    expect(execSends.length).toBe(before);
    await userEvent.click(within(d).getByRole('button', { name: strings['run.go'] }));
    await screen.findByText(interpolate(strings['run.ranIn'], { cwd: '/srv/app' }), { exact: false }, { timeout: 8000 });
    expect(execSends.length).toBe(before + 1);
    expect(lastSent()).toMatchObject({ command: 'rm -rf build', cwd: '/srv/app' });
  });
});
