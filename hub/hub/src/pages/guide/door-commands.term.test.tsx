// The Bots section's AI apps door shows three commands with a Bot placeholder and a refused copy ("⧉ copy (Make a Bot
// first)"). A command is drawn with its words whole: it may wrap at a space, never inside a word. Beside the refusal and
// a ways rail as wide as the web's 176px, a command had 17 cells and broke in the middle of a word ("ANTHROPIC_BASE_U" /
// "RL=https://", "‹bot›.hoody.bo" / "t"). The rail is as wide as its names here (scripts/term/css-translate/term-decls.ts,
// guide.module.css#doors) and a refused copy goes under a command that needs the whole row (kit CodeBlock).
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

// Every word of the three commands, as drawn (the Bot placeholder in its angle quotes).
const WORDS = [
  'https://‹bot›.hoody.bot/v1',
  'https://‹bot›.hoody.bot',
  'ANTHROPIC_BASE_URL=https://‹bot›.hoody.bot',
  'ANTHROPIC_API_KEY="$HOODY_BOT_KEY"',
  'claude',
];

for (const [cols, rows] of [[80, 24], [120, 40]] as const) {
  test(`${cols}x${rows}: the AI apps door draws each command word whole`, async () => {
    // As tall as the section: the door's commands sit below the first screen at 80x24.
    s = await renderPage({ page: 'guide', path: '/guide?bdoor=models#bots', cols, rows: rows * 4 });
    const frame = await s.settle();
    const lines = frame.split('\n');
    const start = lines.findIndex((l) => l.includes('1. OpenAI-compatible base'));
    const end = lines.findIndex((l, i) => i > start && l.includes('Make a Bot') && !l.includes('copy'));
    expect({ start: start > 0, end: end > start }).toEqual({ start: true, end: true });
    const words = lines.slice(start, end).flatMap((l) => l.replace(/[│]/g, ' ').split(/\s+/)).filter((w) => w !== '');
    for (const w of WORDS) expect({ word: w, whole: words.includes(w) }).toEqual({ word: w, whole: true });
    expect(s.failures).toEqual([]);
  }, 180_000);
}
