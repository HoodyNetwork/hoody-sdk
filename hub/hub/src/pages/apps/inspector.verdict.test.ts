// The inspector's Verdict sentence is read through literal keys (a key family or one key per
// case), so the anatomy check measures it in the plate's own region. These pin that the reading says exactly what the
// old `t(v.key)` and `rowSentence` said, for every key view() and wordsFor() can give.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeT } from '@kit';
import { describe, expect, it } from 'vitest';
import { view, type Launch, type LaunchState, type Opens } from './logic';
import { owText, wordsFor } from './launch/openWith/facts';
import owStrings from './launch/openWith/strings.en.json';
import strings from './strings.en.json';
import { viewSentence, wordsSentence } from './parts/Inspector';

const t = makeT(strings);
const owT = makeT(owStrings);
const STATES: (LaunchState | undefined)[] = ['starting', 'started', 'running', 'ready', 'stopped', 'exited', 'not_started', 'unknown', undefined];
const OPENS: Opens[] = ['screen', 'terminal', 'web'];
// Every code logic.ts names (its FAILED table and the unknown-state switch), read from the source so a new one is covered.
const logicSrc = readFileSync(join(__dirname, 'logic.ts'), 'utf8');
const failedBlock = logicSrc.slice(logicSrc.indexOf('const FAILED'), logicSrc.indexOf('};', logicSrc.indexOf('const FAILED')));
const CODES = [
  ...new Set([
    ...[...failedBlock.matchAll(/(\w+): \['/g)].map((m) => m[1] as string),
    ...[...logicSrc.matchAll(/(?:case|l\.code ===) '(\w+)'/g)].map((m) => m[1] as string),
    'not_durable', 'shell_unavailable', 'exec_off', 'access_refused', 'warming_manual', 'something_new',
    // names an object has of its own kind: a code is data, never a lookup of the table's prototype
    'toString', 'constructor', 'hasOwnProperty', '__proto__',
  ]),
];

describe('the Verdict sentence of a row', () => {
  it('reads every view() key the same as t(key)', () => {
    const seen = new Set<string>();
    for (const state of STATES)
      for (const code of [undefined, ...CODES])
        for (const opensIn of OPENS)
          for (const more of [{}, { ipv6Only: true }, { exitCode: 0 }, { exitCode: 2 }, { signal: 'SIGKILL' }, { twin: true }, { stopping: true }] as Partial<Launch>[]) {
            const l: Launch = { ...(state ? { state } : {}), ...(code ? { code } : {}), opensIn, ...more };
            const k = view(l).key;
            seen.add(k);
            expect(typeof k, String(code)).toBe('string');
            expect(viewSentence(t, k, 'Ghostty'), k).toBe(t(k as 'st.ready', { name: 'Ghostty' }));
          }
    // the reading reaches all three families view() uses
    expect([...seen].some((k) => k.startsWith('st.')) && [...seen].some((k) => k.startsWith('fail.')) && [...seen].some((k) => k.startsWith('find.'))).toBe(true);
  });

  it('reads every wordsFor() key the same as rowSentence (owText)', () => {
    const seen = new Set<string>();
    for (const state of STATES)
      for (const code of [undefined, ...CODES])
        for (const opensIn of OPENS)
          for (const more of [{}, { exitCode: 0 }, { exitCode: 125 }, { exitCode: 126 }, { exitCode: 127 }, { exitCode: 3 }, { signal: 'SIGTERM' }, { signal: 'SIGKILL' }] as const)
            for (const ready of [true, false])
              for (const exec of [true, false])
                for (const name of ['vim · notes.md', 'vim notes.md']) {
                  const w = wordsFor({ name, state: (state ?? 'unknown') as LaunchState, opensIn, ...(code ? { code } : {}), ...more }, { ready, exec });
                  seen.add(w.key);
                  expect(wordsSentence(owT, w), w.key).toBe(owText(w));
                }
    expect(seen.size).toBeGreaterThan(15);
    // a separated name gives the file its own words
    const w = wordsFor({ name: 'vim · notes.md', state: 'running', opensIn: 'terminal' });
    expect(w.vars.file).toBe('notes.md');
    expect(wordsSentence(owT, w)).toContain('notes.md');
  });
});
