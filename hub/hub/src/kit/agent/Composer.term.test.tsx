// Composer.term: Enter sends, Alt+Enter and Ctrl+J add a line, a paste of text goes in the box whole however long (never
// handed to the host as a file: a host that refuses files lost it), a pasted path attaches the file, "/"
// opens the commands and Enter picks, Stop is a button.
import { expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { join } from 'node:path';
import { useRef, useState } from 'react';
import { drawTest } from '../../term/prim/testing';
import { Box, FocusRoot } from '../../term/prim';
import { Composer, type ComposerAttachment } from './Composer';
import type { SlashCommand } from './slash';
import { pastedPaths } from './localFiles';

interface Log { sent: string[]; files: File[]; ran: string[] }

/** `refuse`: a host that takes no files yet still passes onAddFiles to say so (the AI page's New chat, NewChat.tsx). */
function Harness({ log, slash, stop, refuse }: { log: Log; slash?: SlashCommand[]; stop?: () => void; refuse?: boolean }) {
  const [draft, setDraft] = useState('');
  const [att, setAtt] = useState<ComposerAttachment[]>([]);
  const [refused, setRefused] = useState(false);
  const ref = useRef<HTMLTextAreaElement | null>(null);
  return (
    <Box dir="column" width={80} height={20} justify="end">
      <Composer
        draft={draft}
        setDraft={setDraft}
        inputRef={ref}
        placeholder="Message your agent"
        max={8000}
        canSend={draft.trim() !== '' || att.length > 0}
        onSend={() => { log.sent.push(draft); setDraft(''); setAtt([]); }}
        notes={refused ? [{ key: 'files', text: 'Images can be added once the chat has started.', status: true }] : []}
        attachments={att}
        onAddFiles={(fs) => {
          log.files.push(...fs);
          if (refuse) { setRefused(fs.length > 0); return; }
          setAtt((a) => [...a, ...fs.map((f, i) => ({ id: `${a.length + i}`, name: f.name, kind: f.type.startsWith('image/') ? 'image' as const : 'text' as const, meta: `${f.size} B` }))]);
        }}
        onRemoveAttachment={(id) => setAtt((a) => a.filter((x) => x.id !== id))}
        flash={false}
        onTyping={() => {}}
        stop={stop ? { busy: false, onPress: stop } : null}
        slash={slash ? { items: slash } : null}
      />
    </Box>
  );
}

const draw = (log: Log, o: { slash?: SlashCommand[]; stop?: () => void; refuse?: boolean } = {}) =>
  drawTest(<FocusRoot><Harness log={log} {...o} /></FocusRoot>, { width: 80, height: 20 });
const fresh = (): Log => ({ sent: [], files: [], ran: [] });

test('Enter sends; Alt+Enter and Ctrl+J add a line first', async () => {
  const log = fresh();
  const t = await draw(log);
  await t.settle();
  t.mockInput.pressTab(); // to the box (first Tab stop)
  await t.settle();
  await t.mockInput.typeText('first');
  t.mockInput.pressEnter({ meta: true });
  await t.mockInput.typeText('second');
  t.mockInput.pressKey('j', { ctrl: true });
  await t.mockInput.typeText('third');
  await t.settle();
  t.mockInput.pressEnter();
  await t.settle();
  expect(log.sent).toEqual(['first\nsecond\nthird']);
  t.renderer.destroy();
});

const ROWS = Array.from({ length: 12 }, (_, i) => `row ${i}`).join('\n');

test('a paste of text goes in the box whole, long or short, and is sent as the draft; no file is made', async () => {
  const log = fresh();
  const t = await draw(log);
  try {
    await t.settle();
    t.mockInput.pressTab();
    await t.settle();
    await t.mockInput.pasteBracketedText('look: ');
    await t.mockInput.pasteBracketedText(ROWS);
    await t.mockInput.pasteBracketedText(' ' + 'x'.repeat(600));
    const f = await t.settle();
    expect(log.files).toEqual([]);
    expect(f).not.toContain('Pasted text');
    t.mockInput.pressEnter();
    await t.settle();
    expect(log.sent).toEqual([`look: ${ROWS} ${'x'.repeat(600)}`]);
  } finally { t.renderer.destroy(); }
});

test('a host that takes no files (New chat): a long paste is kept in the box and sent, never lost', async () => {
  const log = fresh();
  const t = await draw(log, { refuse: true });
  try {
    await t.settle();
    t.mockInput.pressTab();
    await t.settle();
    await t.mockInput.pasteBracketedText(ROWS);
    const f = await t.settle();
    expect(log.files).toEqual([]);
    expect(f).not.toContain('attached as a text file');
    expect(f).toContain('row 11');
    t.mockInput.pressEnter();
    await t.settle();
    expect(log.sent).toEqual([ROWS]);
  } finally { t.renderer.destroy(); }
});

test('a pasted path attaches the file; a missing one says so', async () => {
  // The test home (HOME under the preload: .term-cache/test-homes, swept by test-homes.mjs), never the top of /tmp.
  // os.homedir() through the default export: the preload answers the test home there. A named `homedir` import binds
  // the original (the account's real home, a 16 MB tmpfs inside netns.sh), which a full run had filled: ENOSPC here.
  const dir = mkdtempSync(join(os.homedir(), 'cmp-'));
  expect(dir.startsWith(process.env.HOME + '/')).toBe(true);
  try {
    const file = join(dir, 'plan.md');
    writeFileSync(file, '# plan\n');
    const log = fresh();
    const t = await draw(log);
    await t.settle();
    t.mockInput.pressTab();
    await t.settle();
    await t.mockInput.pasteBracketedText(`'${file}'`);
    await new Promise((r) => setTimeout(r, 30));
    await t.settle();
    expect(log.files.map((x) => x.name)).toEqual(['plan.md']);
    await t.mockInput.pasteBracketedText(join(dir, 'nope.md'));
    await new Promise((r) => setTimeout(r, 30));
    expect((await t.settle()).replace(/\s+/g, ' ')).toContain('nope.md: no such file.');
    t.renderer.destroy();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('pastedPaths', () => {
  expect(pastedPaths("'/home/ada/a b.png'")).toEqual(['/home/ada/a b.png']);
  expect(pastedPaths('/home/ada/a\\ b.png\n~/x.txt')).toEqual(['/home/ada/a b.png', '~/x.txt']);
  expect(pastedPaths('file:///home/ada/a%20b.png')).toEqual(['/home/ada/a b.png']);
  expect(pastedPaths('hello /home/ada')).toBeNull();
  expect(pastedPaths('relative/path')).toBeNull();
});

test('"/" lists the commands; Enter runs the picked one and sends nothing', async () => {
  const log = fresh();
  const t = await draw(log, { slash: [{ name: 'compact', description: 'Shorten the history', run: () => { log.ran.push('compact'); } }, { name: 'clear', description: 'Start fresh', run: () => { log.ran.push('clear'); } }] });
  await t.settle();
  t.mockInput.pressTab();
  await t.settle();
  await t.mockInput.typeText('/');
  let f = await t.settle();
  expect(f).toContain('/compact');
  expect(f).toContain('Shorten the history');
  t.mockInput.pressArrow('down');
  await t.settle();
  t.mockInput.pressEnter();
  f = await t.settle();
  expect(log.ran).toEqual(['clear']);
  expect(log.sent).toEqual([]);
  t.renderer.destroy();
});

// Pressing [+ Attach a file] opens the path row and focuses its field, so typing lands there and Esc reaches the row
// (with the focus left on the button the row would stay under the composer, also after a send). Esc closes the row,
// and so does leaving it empty.
test('[+ Attach a file] focuses the path field; Esc closes the row; leaving it empty closes it too', async () => {
  const t = await draw(fresh());
  await t.settle();
  const openRow = async () => {
    const rows = t.captureCharFrame().split('\n');
    const y = rows.findIndex((r) => r.includes('+ Attach a file'));
    expect(y, t.captureCharFrame()).toBeGreaterThanOrEqual(0);
    await t.mockMouse.click(rows[y]!.indexOf('+ Attach a file') + 2, y);
    await t.settle();
  };
  await openRow();
  expect(t.captureCharFrame()).toContain('Path of the file');
  await t.mockInput.typeText('zq');
  await t.settle();
  expect(t.captureCharFrame()).toMatch(/Path of the file:? *zq/);
  t.mockInput.pressBackspace(); t.mockInput.pressBackspace();
  t.mockInput.pressEscape();
  await t.settle();
  expect(t.captureCharFrame()).not.toContain('Path of the file');
  // opened again and left by Tab while empty: the row goes
  await openRow();
  expect(t.captureCharFrame()).toContain('Path of the file');
  t.mockInput.pressTab();
  await t.settle();
  expect(t.captureCharFrame()).not.toContain('Path of the file');
  t.renderer.destroy();
});
