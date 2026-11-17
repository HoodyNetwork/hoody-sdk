import { expect, test } from 'bun:test';
import { cellWidth, clipCells, clipPath, clipStart, cutCells } from './TableCells';

test('end: plain text is cut at the end with one "…" cell, never "..." and never in the middle', () => {
  expect(clipCells('Too many requests', 8)).toBe('Too man…');
  expect(cutCells('Too many requests', 8, 'end')).not.toContain('...');
  expect(cellWidth(clipCells('Too many requests', 8))).toBe(8);
});

test('start: the tail is kept, "…" first; wide characters counted as two cells', () => {
  expect(clipStart('abcdef0123456789', 6)).toBe('…56789');
  expect(clipStart('名前名前名前', 5)).toBe('…名前');
  expect(cellWidth(clipStart('名前名前名前', 5))).toBe(5);
});

test('path: whole trailing segments, the file name never cut while it fits; a prefix kept when it fits too', () => {
  expect(clipPath('/home/ada/downloads/backup.tar.gz', 18)).toBe('…/backup.tar.gz');
  expect(clipPath('/home/ada/downloads/backup.tar.gz', 28)).toBe('…/downloads/backup.tar.gz');
  // a rooted path after a prefix: one slash, never "…//session" (Logs)
  expect(clipPath('GET 200 Terminal: opened /session', 22)).not.toContain('//');
  expect(clipPath('GET 200 Terminal: opened /tab/1', 14)).toBe('…/tab/1');
  expect(clipPath('Files: opened /home/ada/downloads/backup.tar.gz', 31)).toBe('Files: opened …/backup.tar.gz');
  expect(clipPath('Files: opened /home/ada/downloads/backup.tar.gz', 18)).toBe('…/backup.tar.gz');
  // the file name alone is longer than the room: cut at its start
  expect(clipPath('/a/very-long-file-name.tar.gz', 10)).toBe('…me.tar.gz');
  for (const w of [5, 9, 14, 20, 40]) expect(cellWidth(clipPath('Files: opened /home/ada/downloads/backup.tar.gz', w))).toBeLessThanOrEqual(w);
});

test('ClipText measures its room and cuts by kind: a path keeps its file name, text ends in one "…"', async () => {
  const { createElement: h } = await import('react');
  const { drawTest } = await import('./testing');
  const { Box } = await import('./Box');
  const { ClipText } = await import('./TableClip');
  const t = await drawTest(h(Box, { dir: 'column', width: 24 },
    h(ClipText, { text: 'Files: opened /home/ada/downloads/backup.tar.gz', cut: 'path' }),
    h(ClipText, { text: 'Too many requests from this address', cut: 'end' })), { width: 30, height: 3 });
  const f = await t.settle();
  expect(f).toContain('…/backup.tar.gz');
  expect(f).toContain('Too many requests from…');
  expect(f).not.toContain('...');
  t.renderer.destroy();
});

test('an end cut after a space leaves no blank before its "…"', () => {
  expect(clipCells('atlas stopped at 10:42 after the nightly job', 15)).toBe('atlas stopped…');
  expect(clipCells('Notifications are on for this computer', 15)).toBe('Notifications…');
  expect(cutCells('a b', 2)).toBe('a…');
  expect(clipCells('Too many requests', 8)).toBe('Too man…');
});
