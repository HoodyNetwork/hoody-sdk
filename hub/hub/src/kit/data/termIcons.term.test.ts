import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { iconMark, withIcon } from './termIcons';

// Emoji presentation is never an icon: U+FE0F (VS16), an Emoji_Presentation code point, or any other emoji-capable
// symbol (\p{Extended_Pictographic}: ⚙ ⚲ ✔ …), which a terminal may draw as a wide colour emoji.
const EMOJI = /️|\p{Emoji_Presentation}|\p{Extended_Pictographic}/u;

test('table and filter icons come from the icon map and are never emoji', () => {
  expect(withIcon('reload', 'Refresh')).toBe(`${iconMark('reload')} Refresh`);
  expect(withIcon('sliders', 'View options')).toBe('View options'); // the map draws nothing for it: words alone
  for (const n of ['reload', 'sliders', 'filter', 'dots'] as const) expect(EMOJI.test(iconMark(n))).toBe(false);
});

test('no string literal in the terminal data and widget siblings holds an emoji-presentation code point', () => {
  const dir = import.meta.dir;
  const files = ['DataTable.term.tsx', 'FilterChips.term.tsx', 'Display.term.tsx', 'Ids.term.tsx', 'Address.term.tsx', 'Ledger.term.tsx', 'cells.term.tsx', 'drag.term.tsx', '../widgets/Widgets.term.tsx', '../widgets/AgentHint.term.tsx'];
  const bad: string[] = [];
  for (const f of files) {
    const src = readFileSync(join(dir, f), 'utf8');
    // Code only: comments may name the glyphs they refuse.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    for (const ch of new Set(code.match(new RegExp(EMOJI.source, 'gu')) ?? [])) bad.push(`${f}: U+${ch.codePointAt(0)!.toString(16).toUpperCase()} ${ch}`);
  }
  expect(bad).toEqual([]);
});
