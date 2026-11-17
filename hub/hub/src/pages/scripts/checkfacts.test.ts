// New script step 4 "Check it": the facts Check shows come from the code and the model's answer, read
// right. Built-in modules are never "a new package" (hoody-exec installs none of them), and the model's one-line summary is
// shown as text: no raw backticks, cut at a sentence or a word with the cut mark, never mid-word.
import { describe, expect, it } from 'vitest';
import { changesOf, extract, imports, riskOf } from './logic';

const pkgs = (code: string): string | undefined => changesOf(null, code).find((c) => c.code === 'new_package')?.detail;

describe('imports: built-in modules are not packages', () => {
  it('drops bare Node built-ins, their subpaths, and Bun\'s own, keeping real packages', () => {
    const code = [
      "import fs from 'fs';",
      "import os from 'os';",
      "import * as path from 'path';",
      "import { readFile } from 'fs/promises';",
      "import { join } from 'path/posix';",
      "const cp = require('child_process');",
      "import { serve } from 'bun';",
      "import { Database } from 'bun:sqlite';",
      "import { randomUUID } from 'node:crypto';",
      "import { z } from 'zod';",
      "import extra from 'fs-extra';",
      "import { get } from '@scope/pkg/sub';",
    ].join('\n');
    expect(imports(code)).toEqual(['zod', 'fs-extra', '@scope/pkg']);
    expect(pkgs(code)).toBe('zod, fs-extra, @scope/pkg');
  });

  it('a script that uses only built-ins installs nothing (the screenshot: fs, os, path)', () => {
    expect(pkgs("import fs from 'fs';\nimport os from 'os';\nimport path from 'path';\nexport default () => 1;\n")).toBeUndefined();
  });
});

const reply = (summary: string): string => `Summary: ${summary}\nPath: /a\n\n\`\`\`ts\nexport default () => 1;\n\`\`\`\n`;
const sumOf = (summary: string, S?: readonly string[]): string => {
  const x = extract(reply(summary), true, S);
  if ('error' in x) throw new Error(x.error);
  return x.summary;
};

// The answer, as the model wrote it (the screenshot cut it at "?lim").
const LONG = 'A `/address-web-form` endpoint that accepts POSTed `name` and `email` (JSON or form-encoded), validates and appends them to a JSON file on disk, and returns the stored list on GET (with optional `?limit=` to cap the count). It never deletes entries.';

// Past the cut (600 characters): the same answer, three times over.
const LONGER = `${LONG} ${LONG} ${LONG}`;

describe('extract: the summary as Check shows it', () => {
  it('shows inline code as its text, without the backticks', () => {
    expect(sumOf('Saves `name` and `email`.')).toBe('Saves name and email.');
  });

  it('keeps a backtick that opens no code span', () => {
    expect(sumOf('Quotes a ` in text.')).toBe('Quotes a ` in text.');
  });

  it('a short summary is whole: no cut mark', () => {
    expect(sumOf('Returns the list.')).toBe('Returns the list.');
  });

  it('an answer of a few sentences is whole: the cut is for a runaway answer only', () => {
    const s = sumOf(LONG);
    expect(s).toBe(LONG.replace(/`([^`\n]+)`/g, '$1'));
    expect(s.endsWith('…')).toBe(false);
  });

  it('a long one is cut at a word or sentence, with the cut mark, never mid-word, and no backtick shows', () => {
    const s = sumOf(LONGER);
    expect(s).not.toContain('`');
    expect(s.endsWith('…')).toBe(true);
    expect(s.length).toBeLessThanOrEqual(601);
    const body = s.slice(0, -1).trimEnd();
    const whole = LONGER.replace(/`([^`\n]+)`/g, '$1');
    expect(whole.startsWith(body)).toBe(true);
    // The next character of the whole text after the kept part is a space or the end: no word is split.
    expect(/^(\s|$)/.test(whole.slice(body.length))).toBe(true);
  });

  it('prefers the end of a sentence when one falls late enough', () => {
    const one = 'Reads the shared list and answers with every entry it holds, newest first, as JSON with a count, so a page can draw it.';
    const first = `${one} ${one} ${one}`;
    const s = sumOf(`${first} ${'Then it also does many other quite long things in turn '.repeat(8)}`);
    expect(s).toBe(`${first}…`);
  });

  it('with no sentence end late enough, it is cut at the last space', () => {
    // 'words ' is 6 characters: 100 of them end on the 600th, so the kept text is 100 whole words.
    const s = sumOf('words '.repeat(150));
    expect(s).toBe(`${'words '.repeat(100).trimEnd()}…`);
  });

  it('one run with no space is cut on a character, with the cut mark', () => {
    const s = sumOf('x'.repeat(700));
    expect(s).toBe(`${'x'.repeat(600)}…`);
  });

  it('a fix answer (the secret map given) is cut and cleaned the same way', () => {
    const s = sumOf(LONGER, ['nothing-here']);
    expect(s).not.toContain('`');
    expect(s.endsWith('…')).toBe(true);
    expect(s.length).toBeLessThanOrEqual(601);
  });

  it('hides a key the model echoed, as every Hub view of model text does', () => {
    expect(sumOf('Calls the API with sk-live0123456789abcdef0123456789abcdef.')).not.toContain('sk-live0123');
  });

  it('a key inside backticks stays hidden once the backticks go', () => {
    const s = sumOf('Sends `sk-live0123456789abcdef0123456789abcdef` as the header.');
    expect(s).not.toContain('sk-live0123');
    expect(s).not.toContain('`');
  });
});

describe('changesOf: the computer\'s own list of what it installs comes first', () => {
  const code = "import { z } from 'zod';\nimport _ from 'lodash';\nimport fs from 'fs';\nexport default () => 1;\n";
  it('lists the check\'s missing modules when the check gave them', () => {
    expect(changesOf(null, code, { installs: ['zod'] }).find((c) => c.code === 'new_package')?.detail).toBe('zod');
  });
  it('an empty list from the check: nothing installs', () => {
    expect(changesOf(null, code, { installs: [] }).find((c) => c.code === 'new_package')).toBeUndefined();
  });
  it('a built-in in the check\'s list is still not a package', () => {
    expect(changesOf(null, code, { installs: ['fs', 'zod'] }).find((c) => c.code === 'new_package')?.detail).toBe('zod');
  });
  it('no list from the check: the code\'s own imports, built-ins left out', () => {
    expect(changesOf(null, code).find((c) => c.code === 'new_package')?.detail).toBe('zod, lodash');
  });
});

describe('riskOf: writing files changes data', () => {
  const writes: Array<[string, string]> = [
    ['writeFileSync', "fs.writeFileSync('a.json', body);"],
    ['appendFileSync', "fs.appendFileSync('log.txt', line);"],
    ['a bare writeFile', "await writeFile('a.json', body);"],
    ['a bare appendFileSync', "appendFileSync(file, line);"],
    ['fs.promises.writeFile', "await fs.promises.writeFile('a.json', body);"],
    ['fs.promises.appendFile', "await fs.promises.appendFile('a.json', body);"],
    ['fs.promises.unlink', "await fs.promises.unlink(p);"],
    ['Bun.file().write', "await Bun.file('a.json').write(body);"],
    ['Bun.file(path.join()).write', "await Bun.file(path.join(dir, 'a.json')).write(body);"],
    ['Bun.write', "await Bun.write('a.json', body);"],
    ['a file handle\'s writeFile', "const f = await fs.promises.open(p, 'w');\nawait f.writeFile(data);"],
  ];
  for (const [name, code] of writes) it(`${name} changes data`, () => { expect(riskOf(code).data).toBe(true); });

  const reads: Array<[string, string]> = [
    ['readFileSync', "const list = JSON.parse(fs.readFileSync('a.json', 'utf8'));"],
    ['Bun.file().text()', "const list = JSON.parse(await Bun.file('a.json').text());"],
    ['fs.promises.readFile', "const b = await fs.promises.readFile('a.json');"],
    ['a bare readFile', "const b = await readFile('a.json');"],
    ['a response write', "res.write('ok');"],
  ];
  for (const [name, code] of reads) it(`${name} does not`, () => { expect(riskOf(code).data).toBe(false); });
});

describe('riskOf: the scan stays linear on large code', () => {
  it('many unclosed Bun.file( calls read in well under a second (quadratic took 4.6 s at 360k)', () => {
    const big = 'Bun.file(x '.repeat(40_000);
    const t0 = performance.now();
    expect(riskOf(big).data).toBe(false);
    expect(performance.now() - t0).toBeLessThan(1500);
  });
});

describe('extract: a cut never splits a surrogate pair', () => {
  it('an emoji across character 600 is left out whole', () => {
    const s = sumOf(`${'x'.repeat(599)}\u{1F600}${'y'.repeat(50)}`);
    expect(s).toBe(`${'x'.repeat(599)}…`);
  });
});
