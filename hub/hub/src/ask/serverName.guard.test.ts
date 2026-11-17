// The guard: no code of the AI page puts a computer's DISPLAY name where the server belongs. A Target is made
// by `targetOf(project, id, server)` (ask/engine.ts); a `server_name:` written by hand from a name-like value, or a `name:` handed
// to the shell-jobs or agent door, is the bug this guard keeps out (the agent's host built from `sunny-red-lemur`).
import { describe, expect, it } from 'vitest';

const sources = import.meta.glob(['../ask/**/*.{ts,tsx}', '../kit/agent/**/*.{ts,tsx}', '../pages/ai/**/*.{ts,tsx}', '!../**/*.test.{ts,tsx}', '!../**/fixtures.ts', '!../**/fixtures.*.ts'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const code = (src: string) => src.split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');

describe('the server of a computer is never its display name', () => {
  it('scans the AI page sources', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(20);
  });

  it('no `server_name:` is written from a name-like value', () => {
    const bad: string[] = [];
    for (const [f, raw] of Object.entries(sources)) {
      code(raw).split('\n').forEach((l, i) => {
        if (/server_name\s*:\s*[\w.?!]*\bname\b/.test(l)) bad.push(`${f}:${i + 1}: ${l.trim()}`);
      });
    }
    expect(bad, 'use targetOf(project, id, server) with the real server').toEqual([]);
  });

  it('the shell-jobs door and the starter are handed a server, not a name', () => {
    const bad: string[] = [];
    for (const [f, raw] of Object.entries(sources)) {
      const c = code(raw);
      for (const m of c.matchAll(/\b(?:J\.io|shellJobsIO)\(\s*\{([^}]*)\}/g)) if (/\bname\s*:/.test(m[1] ?? '')) bad.push(`${f}: ${m[0].replace(/\s+/g, ' ')}`);
    }
    expect(bad).toEqual([]);
  });
});
