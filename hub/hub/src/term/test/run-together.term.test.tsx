// Run-together text: what the web's layout separates stays separated in the terminal, and a cut is
// one "…" at the end. Every case is a real page structure with the page's own stylesheet (the CSS translator's table).
//
// | # | Web behaviour | Test |
// |---|---|---|
// | 1 | Children of a flex row (gap) inside a control read as separate words (Logs "Failed 40 times Files") | 'flex row in a button' |
// | 2 | A realm row: name, count and "Showing" apart (Home "Personal3 computersShowing") | 'realm row' |
// | 3 | A tile link: title and body on their own lines (Home "New BotAssistants…") | 'tile link' |
// | 4 | A name cell drawn as text: name and note apart (Files "copyCan't open") | 'name cell in a text run' |
// | 5 | Block spans inside a plain span inside a button stack (kit cells `.line`, one block line each: "Command Run a command…") | 'lines cell' |
// | 6 | Plain inline flow keeps words touching as written ("a<b>b</b>c" is "abc") | 'inline flow' |
// | 7 | text-overflow: ellipsis on rich text: cut at the END with one "…", never the engine's middle "..." | 'rich truncate' |
// | 8 | Rich text that fits is not cut | 'rich truncate' |
import { afterAll, beforeAll, expect, test } from 'bun:test';
import type { ReactNode } from 'react';
import { drawTest } from '../prim/testing';
import { Box, FocusRoot, Text } from '../prim';
import { setStyleTable } from '../jsx/style';
import { installStyleTable } from '../../../scripts/term/style-table';
import { Link } from '../../kit/controls/Link';
import { Icon } from '../../kit/icons';
import lg from '../../pages/logs/parts/Logs.module.css';
import hm from '../../pages/home/parts/home.module.css';
import fl from '../../pages/files/files.module.css';
import ce from '../../kit/data/cells.module.css';

beforeAll(() => installStyleTable(120));
afterAll(() => setStyleTable(null));

async function frame(node: ReactNode, width = 60, height = 8): Promise<string[]> {
  const t = await drawTest(<FocusRoot>{node}</FocusRoot>, { width, height });
  for (let i = 0; i < 6; i++) await t.renderOnce();
  const rows = t.captureCharFrame().split('\n').map((r) => r.trimEnd());
  t.renderer.destroy();
  return rows;
}
const text = (rows: string[]): string => rows.join('\n');

test('flex row in a button: one space between its items', async () => {
  const f = text(await frame(
    <div className={lg.strip}><span className={lg.chipGroup}><button type="button" className={lg.chipMain}><b>Failed</b><span className={lg.groupMeta}>40 times</span><span className={lg.groupMeta}>Files</span></button></span></div>));
  expect(f).toContain('Failed 40 times Files');
});

test('realm row: name, count and Showing apart', async () => {
  const f = text(await frame(
    <ul><li><button type="button" className={hm.realmRow}><span className={hm.swatch} aria-hidden="true" /><span className={hm.realmName}>Personal</span><span className={hm.realmCount}>3 computers</span><span className={hm.realmShowing}>Showing</span></button></li></ul>, 60));
  expect(f).not.toMatch(/Personal3|computersShowing/);
  expect(f).toMatch(/Personal\s+3 computers Showing/);
});

test('tile link: title and body on their own lines, the body cut at its end', async () => {
  const rows = await frame(
    <Box width={30}><Link href="/bots"><span className={hm.tileText}><span className={hm.tileName}>New Bot</span><span className={hm.tileBody}>Assistants that work on your computers</span></span></Link></Box>);
  expect(text(rows)).not.toContain('New BotAssistants');
  expect(rows[0]).toBe('New Bot');
  expect(rows[1]).toBe('Assistants that work on your …');
  expect(text(rows)).not.toContain('...');
});

test('name cell in a text run: name and note apart', async () => {
  const f = text(await frame(<Text><span className={fl.name}><span className={fl.nameText}>copy</span><span className={fl.note}>Can't open here yet</span></span></Text>));
  expect(f).not.toContain("copyCan't");
  expect(f).toContain("copy Can't open here yet");
});

test('lines cell: block spans in a plain span stack (title over body)', async () => {
  const rows = await frame(
    <button type="button"><Icon name="programs" size="md" /><span><span className={ce.line}>Command</span><span className={ce.line}>Run a command on this computer on a timer.</span></span></button>, 70);
  expect(text(rows)).not.toContain('Command Run');
  const at = rows.findIndex((r) => r.includes('Command'));
  expect(rows[at + 1]).toContain('Run a command on this computer');
});

test('inline flow keeps words touching as written', async () => {
  const f = text(await frame(<div><p>Hello <b>you</b>!</p><Text>a<span>b</span>c</Text></div>));
  expect(f).toContain('Hello you!');
  expect(f).toContain('abc');
});

test('rich truncate: one … at the end; whole when it fits', async () => {
  const rows = await frame(<Box dir="column">
    <Box width={20}><Text truncate>abc <Text bold>defghijklmnop</Text> qrstuvwxyz</Text></Box>
    <Box width={40}><Text truncate>short <Text bold>rich</Text></Text></Box>
  </Box>);
  expect(rows[0]).toBe('abc defghijklmnop q…');
  expect(rows[1]).toBe('short rich');
  expect(text(rows)).not.toContain('...');
});
