// Vitest: no strings table under src holds a key twice. JSON.parse keeps the last copy silently, so a second key
// with the same name replaces the first sentence everywhere it is used (the dock composer once said the full-journal
// sentence for "check your last message").
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '..');

function jsonFiles(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules') continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) jsonFiles(p, out);
    else if (e.name.endsWith('.json')) out.push(p);
  }
  return out;
}

/** The keys of a flat object written more than once, read off the text (JSON.parse would hide them). */
function duplicateTopKeys(text: string): string[] {
  const seen = new Set<string>(), dup: string[] = [];
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '{' || c === '[') depth++;
    else if (c === '}' || c === ']') depth--;
    else if (c === '"') {
      let j = i + 1;
      while (j < text.length && text[j] !== '"') j += text[j] === '\\' ? 2 : 1;
      const raw = text.slice(i, j + 1);
      let k = j + 1;
      while (k < text.length && /\s/.test(text[k] as string)) k++;
      if (depth === 1 && text[k] === ':') {
        const key = JSON.parse(raw) as string;
        if (seen.has(key)) dup.push(key);
        seen.add(key);
      }
      i = j;
    }
  }
  return dup;
}

describe('strings tables', () => {
  it('the scanner finds a key written twice', () => {
    expect(duplicateTopKeys('{\n  "a": "x",\n  "b": { "a": 1 },\n  "a": "y"\n}')).toEqual(['a']);
    expect(duplicateTopKeys('{ "a": "say \\"b\\": no", "b": "z" }')).toEqual([]);
  });

  it('no strings.en.json under src holds a key twice', () => {
    const files = jsonFiles(SRC).filter((f) => /strings[^/]*\.json$/.test(f));
    expect(files.length).toBeGreaterThan(20);
    const bad = files.flatMap((f) => duplicateTopKeys(readFileSync(f, 'utf8')).map((k) => `${relative(SRC, f)}: ${k}`));
    expect(bad).toEqual([]);
  });
});
