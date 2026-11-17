// A search answer read in hoody-run's own shape. Its candidate has no `path`: the
// program is the first word of an argv plan (the system provider sends the absolute binary alone).
// Its source warnings are upper-case codes: SOURCE_WARMING and SOURCE_BACKOFF while a source
// is skipped for now, SOURCE_TIMEOUT and SOURCE_FAILED when it did not answer.
import { describe, expect, it } from 'vitest';
import { searchRows } from './data';

/** A candidate as the system provider sends it, with `over` on top. */
const cand = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  kind: 'any',
  candidate_id: 'system:/usr/bin/htop',
  title: 'htop',
  description: 'Local executable at /usr/bin/htop',
  tags: ['local', 'system', 'linux'],
  provider: 'system',
  source_id: 'system',
  score: 200,
  reasons: ['found in $PATH'],
  integrity: null,
  run_plan: { command: '/usr/bin/htop', env: {}, cwd: null },
  execution_plan: { mode: 'argv', argv: ['/usr/bin/htop'], env: {}, cwd: null, side_effect_hints: [] },
  verified: false,
  href_path: null,
  ...over,
});
const answer = (candidates: unknown[], codes: string[] = []) => ({
  set_id: 'set-1',
  candidates,
  warnings: codes.map((code) => ({ code, message: `${code} message`, source_id: 'nixpkgs' })),
});
const pathOf = (c: Record<string, unknown>): string | undefined => searchRows(answer([c]), 'htop').rows[0]?.path;

describe('a search row names the program its argv plan runs (hoody-run sends no path)', () => {
  it('the system provider’s row: the binary of its argv plan', () => {
    expect(pathOf(cand())).toBe('/usr/bin/htop');
  });

  it('an argv plan with arguments: still its first word, the binary', () => {
    expect(pathOf(cand({ execution_plan: { mode: 'argv', argv: ['/usr/bin/python3', '-m', 'http.server'], env: {} } }))).toBe('/usr/bin/python3');
  });

  it('a path a kit also sends is kept only when it names that same binary', () => {
    expect(pathOf(cand({ path: '/usr/bin/htop' }))).toBe('/usr/bin/htop');
    expect(pathOf(cand({ path: '/opt/other/htop' }))).toBe('');
  });

  it('no program without an argv plan of an absolute path: shell text, a shell-inline plan, a bare name', () => {
    expect(pathOf(cand({ execution_plan: undefined }))).toBe('');
    expect(pathOf(cand({ execution_plan: { mode: 'shell-inline', shell: '/bin/sh', shell_command: 'htop', env: {} } }))).toBe('');
    expect(pathOf(cand({ execution_plan: { mode: 'argv', argv: ['htop'], env: {} } }))).toBe('');
    expect(pathOf(cand({ execution_plan: { mode: 'argv', argv: [], env: {} } }))).toBe('');
    // a top-level path alone, with no plan that runs it, names nothing either
    expect(pathOf(cand({ execution_plan: undefined, path: '/usr/bin/htop' }))).toBe('');
  });

  it('a path longer than the row keeps is left out, never cut to another path', () => {
    const long = `/${'d'.repeat(200)}/htop`;
    expect(pathOf(cand({ execution_plan: { mode: 'argv', argv: [long], env: {} } }))).toBe('');
  });
});

describe('the kit’s upper-case source warnings mark a source as getting ready or failed', () => {
  const flags = (codes: string[]) => {
    const { partial, warming, failed } = searchRows(answer([cand()], codes), 'htop');
    return { partial, warming, failed };
  };

  it('SOURCE_WARMING and SOURCE_BACKOFF: skipped for now, so getting ready (asked again)', () => {
    expect(flags(['SOURCE_WARMING'])).toEqual({ partial: false, warming: true, failed: false });
    expect(flags(['SOURCE_BACKOFF'])).toEqual({ partial: false, warming: true, failed: false });
  });

  it('SOURCE_TIMEOUT and SOURCE_FAILED: the source did not answer', () => {
    expect(flags(['SOURCE_TIMEOUT'])).toEqual({ partial: false, warming: false, failed: true });
    expect(flags(['SOURCE_FAILED'])).toEqual({ partial: false, warming: false, failed: true });
  });

  it('the older words still count, and no warning is a whole answer', () => {
    expect(flags(['partial'])).toEqual({ partial: true, warming: false, failed: false });
    expect(flags(['unavailable'])).toEqual({ partial: false, warming: false, failed: true });
    expect(flags([])).toEqual({ partial: false, warming: false, failed: false });
  });
});

describe('any warning marks the answer as maybe not whole (the agents badge never says Not installed from it)', () => {
  it('a code not named above, or a warnings field that does not read, is warned; none is not', () => {
    expect(searchRows(answer([cand()], ['SOURCE_SOMETHING_NEW']), 'htop').warned).toBe(true);
    expect(searchRows(answer([cand()], ['SOURCE_WARMING']), 'htop').warned).toBe(true);
    expect(searchRows({ ...answer([cand()]), warnings: 'oops' }, 'htop').warned).toBe(true);
    expect(searchRows({ ...answer([cand()]), warnings: { code: 'x' } }, 'htop').warned).toBe(true);
    expect(searchRows(answer([cand()]), 'htop').warned).toBeUndefined();
    expect(searchRows({ set_id: 's', candidates: [] }, 'htop').warned).toBeUndefined();
  });
});
