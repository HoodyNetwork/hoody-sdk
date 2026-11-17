// The terminal's own wording (termWords.ts): a variant only replaces a key its web table has, keeps the key's
// {{placeholders}} and names none of the web's surface ("browser", "tap", "click", the realm square, the eye, a touch
// keyboard); importing the module changes no table (only createTermApp applies it), and nothing outside the terminal
// reaches it. termWords.page.term.test.tsx pins that the app applies it.
import { expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { applyTermWords, TERM_WORDS, TERM_WORD_TABLES } from './termWords';

const SRC = path.resolve(import.meta.dir, '../..');
// A table's name is its file, relative to src.
const disk = (name: string) => JSON.parse(readFileSync(path.join(SRC, name), 'utf8')) as Record<string, string>;
const WEB_SURFACE = /\b(browsers?|tap|taps|tapping|click|clicks|clicking)\b|realm square|\bthe eye\b|touch keyboard/i;
const holes = (text: string) => [...text.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]).sort();

test('every variant replaces a key its web table has, with the same placeholders and no web-surface word', () => {
  expect(Object.keys(TERM_WORDS).sort()).toEqual(Object.keys(TERM_WORD_TABLES).sort());
  applyTermWords();
  for (const [name, variants] of Object.entries(TERM_WORDS)) {
    const web = disk(name);
    for (const [key, text] of Object.entries(variants)) {
      expect({ name, key, has: typeof web[key] === 'string' }).toEqual({ name, key, has: true });
      expect({ name, key, holes: holes(text) }).toEqual({ name, key, holes: holes(web[key]!) });
      expect({ name, key, web: WEB_SURFACE.test(text) }).toEqual({ name, key, web: false });
      expect(TERM_WORD_TABLES[name]![key]).toBe(text);
    }
    // The table is that file's: every other key reads as the file has it.
    const rest = Object.fromEntries(Object.entries(TERM_WORD_TABLES[name]!).filter(([key]) => !(key in variants)));
    expect({ name, rest }).toEqual({ name, rest: Object.fromEntries(Object.entries(web).filter(([key]) => !(key in variants))) });
  }
});

test('importing termWords changes no string table: only applyTermWords writes one', () => {
  // A fresh import cannot be had in one process, so this reads the module: outside applyTermWords' body nothing
  // assigns into an object (the tables are plain imported objects).
  const text = readFileSync(path.join(import.meta.dir, 'termWords.ts'), 'utf8');
  const body = /export function applyTermWords\(\): void \{\n[\s\S]*?\n\}\n/.exec(text);
  expect(body).not.toBeNull();
  const rest = text.replace(body![0], '');
  expect(rest).not.toMatch(/Object\.(assign|defineProperty|defineProperties|setPrototypeOf)\s*\(|\]\s*=[^=]|\.\w+\s*=[^=>]|delete\s/);
});

test('only the terminal app applies it, and no web file reaches the terminal app', () => {
  const files = (readdirSync(SRC, { recursive: true, encoding: 'utf8' }) as string[]).filter((f) => /\.(tsx?|mts)$/.test(f));
  const terminal = (f: string) => f.startsWith('term/') || /\.term\.(tsx?|test\.tsx?)$/.test(f);
  const applies: string[] = [];
  const reachesApp: string[] = [];
  for (const f of files) {
    const text = readFileSync(path.join(SRC, f), 'utf8');
    // A call, not the definition; this file's own call is the test's.
    if (/(?<!function\s+)\bapplyTermWords\s*\(/.test(text) && f !== 'term/app/termWords.term.test.tsx') applies.push(f);
    if (!terminal(f) && /from\s+['"][^'"]*term\/app\/(App|termWords)['"]|import\(\s*['"][^'"]*term\/app\/(App|termWords)/.test(text)) reachesApp.push(f);
  }
  expect(applies).toEqual(['term/app/App.tsx']);
  expect(reachesApp).toEqual([]);
});
