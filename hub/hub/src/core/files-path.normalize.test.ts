// normalizeDirPath: the one canonical folder path. Every documented case, idempotence,
// agreement with pathPartsProblem, and the AI E4 case (the page's value and DirPicker's commit compare equal).
import { describe, expect, it } from 'vitest';
import { MAX_PATH_BYTES, normalizeDirPath, partsOfPath, pathPartsProblem } from './files-path';

const long = '/' + 'a'.repeat(MAX_PATH_BYTES + 1);
const ROWS: [string, unknown, string | null][] = [
  ['not a string', 42, null],
  ['undefined', undefined, null],
  ['empty', '', null],
  ['relative', 'srv', null],
  ['tilde', '~/x', null],
  ['dot relative', './x', null],
  ['leading space', ' /srv', null],
  ['NUL', '/srv/a\u0000b', null],
  ['root', '/', '/'],
  ['double slash', '//', '/'],
  ['triple slash', '///', '/'],
  ['trailing slash', '/srv/', '/srv'],
  ['collapsed then trailing dropped', '/srv//www///', '/srv/www'],
  ['dot part', '/srv/./www', '/srv/www'],
  ['root dot', '/./', '/'],
  ['trailing dot', '/srv/.', '/srv'],
  ['dotdot inside', '/srv/../home', null],
  ['dotdot at root', '/..', null],
  ['trailing dotdot', '/srv/..', null],
  ['backslash inside', '/a\\b', '/a\\b'],
  ['space in name', '/my folder', '/my folder'],
  ['accent kept', '/café', '/café'],
  ['decomposed accent kept as typed', '/café', '/café'],
  ['replacement char kept', '/x�', '/x�'],
  ['trailing space kept', '/srv ', '/srv '],
  ['case kept', '/SRV/App', '/SRV/App'],
  ['leading backslash first part', '/\\x', null],
  ['over the byte bound', long, null],
];

describe('normalizeDirPath: the table', () => {
  for (const [label, input, want] of ROWS) {
    it(`${label}: ${JSON.stringify(input)} -> ${JSON.stringify(want)}`, () => {
      expect(normalizeDirPath(input)).toBe(want);
    });
  }
});

describe('normalizeDirPath: properties', () => {
  const results = ROWS.map(([, , want]) => want).filter((w): w is string => w !== null);

  it('is idempotent on every non-null result', () => {
    expect(results.length).toBeGreaterThan(5);
    for (const p of results) expect(normalizeDirPath(normalizeDirPath(p))).toBe(normalizeDirPath(p));
    for (const p of results) expect(normalizeDirPath(p)).toBe(p);
  });

  it('agrees with pathPartsProblem: every non-null result can be asked about', () => {
    for (const p of results) expect(pathPartsProblem(partsOfPath(p))).toBeNull();
  });

  it('a path at the byte bound passes and one byte over fails', () => {
    const at = '/' + 'a'.repeat(MAX_PATH_BYTES);
    expect(normalizeDirPath(at)).toBe(at);
    expect(normalizeDirPath(at + 'a')).toBeNull();
  });

  it('the AI E4 case: every spelling of /srv gives /srv', () => {
    for (const s of ['/srv', '/srv/', '//srv', '/srv/.', '/./srv//']) expect(normalizeDirPath(s)).toBe('/srv');
  });

  it('is exported from core', async () => {
    const core = await import('./index');
    expect(core.normalizeDirPath).toBe(normalizeDirPath);
  });
});
