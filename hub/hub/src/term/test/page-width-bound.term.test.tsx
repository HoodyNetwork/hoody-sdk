// The AI tab's new-chat page (`.page { inline-size: min(100%, 760px); margin-inline: auto }`) keeps the width it is
// given, bounded by 95 cols (css-translate percentOrLength), instead of shrinking to its content: that cut its
// suggestion cards (the "Do it every day" card stopped mid-sentence and lost its links) and overran its pane. Its
// icons keep their cell above the card's text (kit/icons.term.tsx: a glyph never shrinks).
import { afterEach, expect, test } from 'bun:test';
import { renderPage } from '../../../scripts/term/render';

let close: (() => void) | null = null;
afterEach(() => { close?.(); close = null; });

for (const cols of [100, 120, 140]) test(`new chat at ${cols} cols: every card whole, with its icon and links`, async () => {
  const s = await renderPage({ page: 'ai', path: '/ai/new', cols, rows: 40 });
  close = () => s.close();
  const f = s.frame;
  expect(s.failures).toEqual([]);
  // The cards stand side by side, so a card's sentence is read in its own column: the last card's ends whole there
  // (a narrow cell wraps its title, so the column is found by the title's first words).
  const at = f.split('\n').find((l) => l.includes('Do it every'))!.indexOf('Do it every');
  const card = f.split('\n').map((l) => l.slice(at)).join(' ').replace(/\s+/g, ' ');
  expect(card).toContain('Or keep a TODO.');
  expect(f).toContain('New TODO');
  // A cell draws its icon above its text: the chat card's mark stands over the start of its title.
  const lines = f.split('\n');
  const iconRow = lines.findIndex((l) => /✦(?! Chats)/.test(l));
  const iconCol = lines[iconRow]!.search(/✦(?! Chats)/);
  expect(lines[iconRow + 1]!.slice(iconCol), f).toStartWith('Just chat');
  // The page stays inside its pane: the cards' right column ends before the screen's edge.
  const daily = f.split('\n').find((l) => l.includes('Do it every'))!;
  expect(daily.trimEnd().length, f).toBeLessThan(cols);
}, 180_000);
