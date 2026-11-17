// Vitest: the GitHub install's pure parts (github.ts). The address is parsed strictly (https or no scheme, github.com
// only, GitHub's owner and repository name rules, an optional /tree/<ref>[/<path>]); the prompt splices the parsed
// repository in as data; the agent's reply counts only when its last line is one RESULT line of a known kind.
import { describe, expect, it } from 'vitest';
import { parseRepo, promptFor, resultOf, cloneUrl } from './github';

describe('parseRepo: a GitHub address, strictly', () => {
  it('takes owner/repo with https or no scheme, a trailing slash or .git, and keeps the canonical address', () => {
    for (const s of ['https://github.com/hoody/run', 'github.com/hoody/run', ' https://github.com/hoody/run/ ', 'https://github.com/hoody/run.git', 'GitHub.com/hoody/run']) {
      expect(parseRepo(s)).toEqual({ ok: true, repo: { owner: 'hoody', name: 'run' } });
    }
    expect(parseRepo('https://github.com/a-b9/x.y_z-1')).toEqual({ ok: true, repo: { owner: 'a-b9', name: 'x.y_z-1' } });
    expect(cloneUrl({ owner: 'hoody', name: 'run' })).toBe('https://github.com/hoody/run.git');
  });

  it('takes /tree/<ref> and /tree/<ref>/<path>', () => {
    expect(parseRepo('https://github.com/hoody/run/tree/v1.2.0')).toEqual({ ok: true, repo: { owner: 'hoody', name: 'run', ref: 'v1.2.0' } });
    expect(parseRepo('github.com/hoody/run/tree/main/apps/web/')).toEqual({ ok: true, repo: { owner: 'hoody', name: 'run', ref: 'main', path: 'apps/web' } });
  });

  it('refuses other schemes, hosts, ports, sign-ins, queries, fragments and escapes', () => {
    for (const s of [
      'http://github.com/hoody/run', 'ftp://github.com/hoody/run', 'git@github.com:hoody/run.git', 'ssh://github.com/hoody/run',
      'https://www.github.com/hoody/run', 'https://gist.github.com/hoody/run', 'https://github.com.evil.io/hoody/run', 'https://evil.io/github.com/hoody/run',
      'https://github.com:443/hoody/run', 'https://me@github.com/hoody/run', 'https://github.com/hoody/run?tab=x', 'https://github.com/hoody/run#readme',
      'https://github.com/hoody/run%2F..', 'https://github.com/hoody', 'https://github.com/', '', '   ', 'hoody/run',
      'https://github.com/hoody/run/blob/main/README.md', 'https://github.com/hoody/run/tree', 'https://github.com/hoody/run/tree/', 'https://github.com/hoody//run',
    ]) {
      expect(parseRepo(s), s).toMatchObject({ ok: false });
    }
  });

  it('follows GitHub\'s owner and repository name rules', () => {
    for (const bad of ['-hoody', 'hoody-', 'ho--ody', 'ho_ody', 'ho.ody', 'a'.repeat(40)]) {
      expect(parseRepo(`github.com/${bad}/run`), bad).toMatchObject({ ok: false });
    }
    expect(parseRepo(`github.com/${'a'.repeat(39)}/run`)).toMatchObject({ ok: true });
    for (const bad of ['.', '..', 'r un', 'r$', 'r;x', 'a'.repeat(101), '.git']) {
      expect(parseRepo(`github.com/hoody/${encodeURI(bad)}`), bad).toMatchObject({ ok: false });
    }
  });

  it('refuses a ref or path that could leave the repository or be read as an option', () => {
    for (const s of ['tree/-x', 'tree/..', 'tree/a..b', 'tree/.hidden', 'tree/main/..', 'tree/main/a/../b', 'tree/main/./a', 'tree/ma in', 'tree/main/a$b', 'tree/main/a;rm']) {
      expect(parseRepo(`https://github.com/hoody/run/${s}`), s).toMatchObject({ ok: false });
    }
    expect(parseRepo(`https://github.com/hoody/run/tree/main/${'a/'.repeat(300)}`)).toMatchObject({ ok: false });
  });

  it('refuses an address too long to be one', () => {
    expect(parseRepo(`https://github.com/hoody/run/tree/main/${'a'.repeat(700)}`)).toMatchObject({ ok: false });
  });
});

describe('promptFor: a fixed template with the repository as data', () => {
  it('names the clone address, the folder, the ref and path when given, and asks for exactly one RESULT line', () => {
    const p = promptFor({ owner: 'hoody', name: 'run', ref: 'v1', path: 'apps/web' });
    expect(p).toContain('https://github.com/hoody/run.git');
    expect(p).toContain('~/apps/run');
    expect(p).toContain('"ref":"v1"');
    expect(p).toContain('"path":"apps/web"');
    expect(p).toContain('RESULT {"kind":"web","port":N}');
    expect(p).toContain('RESULT {"kind":"terminal","terminal":N}');
    expect(p).toContain('RESULT {"kind":"failed","why":"');
    expect(promptFor({ owner: 'hoody', name: 'run' })).not.toContain('"ref"');
  });
  it('is the same text for the same repository (one send, one key)', () => {
    expect(promptFor({ owner: 'a', name: 'b' })).toBe(promptFor({ owner: 'a', name: 'b' }));
  });
});

describe('resultOf: the last line of the reply, one RESULT line of a known kind', () => {
  it('reads a web port, a terminal and a failure', () => {
    expect(resultOf('Cloned.\nStarted.\nRESULT {"kind":"web","port":8080}')).toEqual({ kind: 'web', port: 8080 });
    expect(resultOf('ok\nRESULT {"kind":"terminal","terminal":3}\n\n')).toEqual({ kind: 'terminal', terminal: 3 });
    expect(resultOf('RESULT {"kind":"failed","why":"npm install failed: missing python3"}')).toEqual({ kind: 'failed', why: 'npm install failed: missing python3' });
  });

  it('is none (never a failure) without a RESULT last line, with two RESULT lines, or with a malformed one', () => {
    for (const s of [
      '', 'Done, it runs on port 8080.', 'RESULT {"kind":"web","port":8080}\nThen I checked it.', 'RESULT {"kind":"web","port":1}\nRESULT {"kind":"web","port":2}',
      'RESULT {"kind":"web","port":0}', 'RESULT {"kind":"web","port":65536}', 'RESULT {"kind":"web","port":"80"}', 'RESULT {"kind":"web","port":80.5}',
      'RESULT {"kind":"terminal","terminal":-1}', 'RESULT {"kind":"other"}', 'RESULT {kind:web}', 'RESULT {"kind":"failed"}', 'result {"kind":"web","port":80}',
      '  RESULT {"kind":"web","port":80} trailing',
    ]) {
      expect(resultOf(s), s).toEqual({ kind: 'none' });
    }
  });

  it('cleans and bounds a failure reason (it is the agent\'s text)', () => {
    const r = resultOf(`RESULT {"kind":"failed","why":"bad\\u001b[31m red\\u0007 ${'x'.repeat(600)}"}`);
    expect(r.kind).toBe('failed');
    const why = (r as { why: string }).why;
    expect(why).not.toMatch(/[\u0000-\u001f\u007f]/);
    expect(why.length).toBeLessThanOrEqual(300);
  });

  // The reason is shown in the result banner, so a key in it
  // is hidden as the gate card hides it, over the whole raw text before the cut.
  const KEY = 'sk-live0123456789abcdefghij';
  const FRAG = /sk-li|live0|0123456/;
  const near = (bound: number, lead: string) => {
    const n = bound - 11 - lead.length;
    return lead + (n % 2 ? ' ' : '') + 'a '.repeat(Math.floor(n / 2));
  };
  const whyOf = (raw: string) => {
    const r = resultOf(`RESULT ${JSON.stringify({ kind: 'failed', why: raw })}`);
    expect(r.kind).toBe('failed');
    return (r as { why: string }).why;
  };
  it.each([
    ['a key in the reason', `auth failed with ${KEY} here`, 'auth failed with [hidden] here'],
    ['a key glued by a BEL', `auth failed\u0007${KEY} here`, 'auth failed [hidden] here'],
    ['a key glued by ESC', `auth failed\u001b${KEY} here`, null],
    ['a key glued by a CSI', `auth failed\u001b[31m${KEY}\u001b[0m here`, null],
  ])('hides %s', (_name, raw, want) => {
    const why = whyOf(raw);
    expect(why).not.toMatch(FRAG);
    expect(why).toContain('[hidden]');
    expect(why).toContain('auth failed');
    if (want !== null) expect(why).toBe(want);
  });
  it('hides a key that starts 11 characters before the 300 bound: no piece is left after the cut', () => {
    const lead = near(300, 'clone failed');
    const why = whyOf(`${lead}${KEY} and more after it`);
    expect(why).not.toMatch(FRAG);
    expect(why.startsWith('clone failed')).toBe(true);
    expect(why.length).toBeLessThanOrEqual(300);
  });
});
