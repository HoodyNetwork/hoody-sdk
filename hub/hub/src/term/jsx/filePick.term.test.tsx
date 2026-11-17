// A file input in the terminal opens a field for local paths (filePick.ts). On the Files page, Upload (its own button
// clicking a hidden file input) opens that field, and a readable path reaches the web's own Upload dialog; a path that
// cannot be used is refused in words and no dialog opens. The checks themselves: a missing path, a folder, a second path
// where one is asked, a file over the cap; the cap is the web upload's per-file limit.
import { afterAll, afterEach, beforeAll, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { LIMITS } from '../../pages/files/upload';
import { act, queryAllByRole, semanticsOf, type Role } from '../prim/semantics';
import { PICK_MAX_BYTES, readPicked } from './filePick';

let dir = '';
beforeAll(() => {
  dir = mkdtempSync(join(process.env.TMPDIR || '/tmp', 'filepick-'));
  writeFileSync(join(dir, 'notes.txt'), 'twelve bytes');
  writeFileSync(join(dir, 'second.txt'), 'x');
  mkdirSync(join(dir, 'folder'));
});
afterAll(() => { rmSync(dir, { recursive: true, force: true }); });

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

const nodes = (role: Role, name: string | RegExp) => {
  const r = s!.renderer as unknown as { root: never; stdin: never };
  return queryAllByRole(semanticsOf({ root: r.root, stdin: r.stdin }), role, { name });
};
async function press(role: Role, name: string | RegExp): Promise<void> {
  const found = nodes(role, name);
  expect(found.length).toBeGreaterThan(0);
  act(found[0]!, 'press');
  await s!.settle();
}
async function typeInto(name: string | RegExp, text: string): Promise<void> {
  const found = nodes('textbox', name);
  expect(found.length).toBeGreaterThan(0);
  act(found[0]!, 'type', text);
  await s!.settle();
}

async function openUpload(): Promise<void> {
  s = await renderPage({ page: 'files', path: '/files?a=atlas.00a1&ap=%2Fsrv%2Fapp', cols: 140, rows: 60 });
  await s.settle();
  await press('button', 'Upload');
}

test('Files › Upload opens a path field, and a readable path reaches the Upload dialog', async () => {
  await openUpload();
  expect(nodes('dialog', 'Choose files').length).toBe(1);
  await typeInto('Choose files', join(dir, 'notes.txt'));
  await press('button', 'Use these files');
  expect(nodes('dialog', 'Choose files').length).toBe(0);
  expect(nodes('dialog', /^Upload to /).length).toBe(1);
  expect(s!.frame).toContain('notes.txt');
}, 180_000);

test('Files › Upload: a path that is not there is refused in words, and no Upload dialog opens', async () => {
  await openUpload();
  await typeInto('Choose files', join(dir, 'missing.txt'));
  await press('button', 'Use these files');
  expect(s!.frame).toContain(`There is no file at ${join(dir, 'missing.txt')}.`);
  expect(nodes('dialog', /^Upload to /).length).toBe(0);
  expect(nodes('dialog', 'Choose files').length).toBe(1);
}, 180_000);

test('Files › Upload: Cancel while the path is still being checked hands nothing on', async () => {
  await openUpload();
  await typeInto('Choose files', join(dir, 'notes.txt'));
  const use = nodes('button', 'Use these files');
  const cancel = nodes('button', 'Cancel');
  expect(use.length).toBe(1);
  expect(cancel.length).toBe(1);
  // Both presses land before the check of the path has finished.
  act(use[0]!, 'press');
  act(cancel[0]!, 'press');
  await s!.settle();
  expect(nodes('dialog', 'Choose files').length).toBe(0);
  expect(nodes('dialog', /^Upload to /).length).toBe(0);
}, 180_000);

test('the checks: nothing typed, a folder, a second path for one file, a file over the cap', async () => {
  expect(await readPicked('  \n', { multiple: true })).toEqual({ ok: false, why: 'Type the path of a file first.' });
  expect(await readPicked(join(dir, 'folder'), { multiple: true })).toEqual({ ok: false, why: `${join(dir, 'folder')} is a folder: choose the files in it, one per line.` });
  expect(await readPicked(`${join(dir, 'notes.txt')}\n${join(dir, 'second.txt')}`, { multiple: false })).toEqual({ ok: false, why: 'Only one file can be chosen here.' });
  const big = await readPicked(join(dir, 'notes.txt'), { multiple: true, maxBytes: 4 });
  expect(big.ok).toBe(false);
  // A missing path among good ones refuses the whole pick: nothing is handed on.
  expect((await readPicked(`${join(dir, 'notes.txt')}\n${join(dir, 'nope')}`, { multiple: true })).ok).toBe(false);
});

test('a pick keeps names and sizes, and reads back the file\'s bytes; ~ is the home folder and a relative path is read from the current folder', async () => {
  const r = await readPicked(`notes.txt\n~/second.txt`, { multiple: true, cwd: dir, home: dir });
  expect(r.ok).toBe(true);
  if (!r.ok) return;
  expect(r.files.map((f) => [f.name, f.size])).toEqual([['notes.txt', 12], ['second.txt', 1]]);
  expect(await r.files[0]!.text()).toBe('twelve bytes');
});

test('the cap is the web upload\'s per-file limit', () => {
  expect(PICK_MAX_BYTES).toBe(LIMITS.fileBytes);
});
