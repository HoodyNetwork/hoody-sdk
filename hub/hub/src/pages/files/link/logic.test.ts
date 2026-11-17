// Vitest: Download from a link, the pure rules (link/logic.ts).
import { describe, expect, it } from 'vitest';
import { defaultName, hasLinkFeature, linkProblem, recordOf, recordsOf, savedStateOf, usableName, verdictOf } from './logic';

const D = 'example.test';

describe('linkProblem', () => {
  it('takes an http(s) link with a host outside the program domain', () => {
    expect(linkProblem('https://downloads.example/file.iso', D)).toBeNull();
    expect(linkProblem('  http://example.org/a  ', D)).toBeNull();
  });
  it('refuses another scheme, a relative link or no host', () => {
    for (const l of ['ftp://x/y', 'file:///etc/passwd', 'javascript:alert(1)', '/a/b', 'example.org/x', 'data:text/plain,hi']) expect(linkProblem(l, D)).toBe('scheme');
  });
  it('refuses a link to a computer program: the domain itself and any host under it, case and dots ignored', () => {
    expect(linkProblem('https://example.test/x', D)).toBe('computer');
    expect(linkProblem('https://files-abc.EXAMPLE.test./x', D)).toBe('computer');
    expect(linkProblem('https://a.b.example.test/x', 'Example.TEST.')).toBe('computer');
    expect(linkProblem('https://notexample.test/x', D)).toBeNull();
  });
  it('refuses a link on either host family when the program domain carries a family label', () => {
    for (const d of ['computers.example.test', 'containers.example.test', 'Computers.Example.TEST.']) {
      expect(linkProblem('https://p-c-files-1.srv.computers.example.test/x', d)).toBe('computer');
      expect(linkProblem('https://p-c-files-1.srv.containers.example.test/x', d)).toBe('computer');
      expect(linkProblem('https://P-C-FILES-1.SRV.CONTAINERS.EXAMPLE.TEST./x', d)).toBe('computer');
      expect(linkProblem('https://computers.example.test/x', d)).toBe('computer');
    }
  });
  it('the twin is an exact suffix: look-alikes and other realms stay outside', () => {
    const d = 'computers.example.test';
    expect(linkProblem('https://a.evilcomputers.example.test/x', d)).toBeNull();
    expect(linkProblem('https://a.containers.example.test.evil.org/x', d)).toBeNull();
    expect(linkProblem('https://a.containers.example.org/x', d)).toBeNull();
    expect(linkProblem('https://example.test/x', d)).toBeNull();
    // a domain with no family label stands for itself (and its subdomains) only
    expect(linkProblem('https://a.computers.other.example/x', 'example.test')).toBeNull();
  });
  it('refuses when no program domain is known', () => {
    expect(linkProblem('https://example.org/x', '')).toBe('unknown');
    expect(linkProblem('https://example.org/x', ' . ')).toBe('unknown');
  });
});

describe('names', () => {
  it('usableName refuses empty, dots, slashes, control characters, edge spaces and over 255', () => {
    expect(usableName('a.iso')).toBe(true);
    for (const n of ['', '.', '..', 'a/b', 'a\\b', 'a\u0001', ' a', 'a ', 'x'.repeat(256)]) expect(usableName(n)).toBe(false);
    expect(usableName('x'.repeat(255))).toBe(true);
  });
  it('defaultName is the decoded last path part, else download', () => {
    expect(defaultName('https://e.x/dir/My%20File.tar.gz?token=SECRET#f')).toBe('My File.tar.gz');
    expect(defaultName('https://e.x/')).toBe('download');
    expect(defaultName('https://e.x/a/%2F')).toBe('download');
    expect(defaultName('https://e.x/a/%E0%A4%A')).toBe('%E0%A4%A');
    expect(defaultName('not a link')).toBe('download');
  });
});

describe('records', () => {
  const raw = { id: 'd1', status: 'downloading', filename: 'a.iso', directory: '/tmp', current_size: 10, expected_size: 40, progress_percentage: 25, start_time: 5, url: 'https://e.x/?token=SECRET', error_message: 'SECRET' };
  it('recordOf keeps the page fields and never the link or the program text', () => {
    const r = recordOf(raw)!;
    expect(r).toEqual({ id: 'd1', status: 'downloading', filename: 'a.iso', directory: '/tmp', fileSize: null, current: 10, expected: 40, percent: 25, startedAt: 5, endedAt: null });
    expect(JSON.stringify(r)).not.toContain('SECRET');
  });
  it('a row without a status or starting is running; unknown status, no id or not an object is null', () => {
    expect(recordOf({ id: 'x' })?.status).toBe('downloading');
    expect(recordOf({ id: 'x', status: 'starting' })?.status).toBe('downloading');
    expect(recordOf({ id: 'x', status: 'paused' })).toBeNull();
    expect(recordOf({ status: 'completed' })).toBeNull();
    expect(recordOf([])).toBeNull();
    expect(recordOf(null)).toBeNull();
  });
  it('percent is capped at 100; negative or non-numbers read as unknown', () => {
    expect(recordOf({ id: 'x', progress_percentage: 140, current_size: -1 })).toMatchObject({ percent: 100, current: null });
  });
  it('recordsOf keeps records and throws on a body without its list', () => {
    expect(recordsOf({ downloads: [raw, { nope: 1 }] }).map((r) => r.id)).toEqual(['d1']);
    expect(() => recordsOf({})).toThrow('NOT_A_LIST');
    expect(() => recordsOf(null)).toThrow('NOT_A_LIST');
  });
  it('hasLinkFeature reads download_client_id from features', () => {
    expect(hasLinkFeature({ features: ['download_client_id'] })).toBe(true);
    expect(hasLinkFeature({ features: ['put_chmod'] })).toBe(false);
    expect(hasLinkFeature({ features: 'download_client_id' })).toBe(false);
    expect(hasLinkFeature(null)).toBe(false);
  });
});

describe('verdicts', () => {
  const rej = (status: number, code = '') => ({ kind: 'rejected', status, code });
  it('a first send: id exists arrived, 429 busy, refusals before any effect refused, the rest unknown', () => {
    expect(verdictOf(rej(409, 'DOWNLOAD_ID_EXISTS'))).toBe('arrived');
    expect(verdictOf(rej(429, 'JOB_COUNT_LIMIT'))).toBe('busy');
    for (const s of [400, 403, 404, 413]) expect(verdictOf(rej(s))).toBe('refused');
    expect(verdictOf(rej(409, 'FILE_PATH_BUSY'))).toBe('refused');
    expect(verdictOf({ kind: 'not_sent' })).toBe('refused');
    expect(verdictOf(rej(409, 'OTHER'))).toBe('unknown');
    expect(verdictOf(rej(500))).toBe('unknown');
    expect(verdictOf(rej(502))).toBe('unknown');
    expect(verdictOf({ kind: 'pending' })).toBe('unknown');
    expect(verdictOf({ kind: 'stale' })).toBe('unknown');
    expect(verdictOf(new Error('x'))).toBe('unknown');
    expect(verdictOf(null)).toBe('unknown');
  });
});

describe('savedStateOf (a completed download, its folder read now)', () => {
  const f = (name: string, dir = false) => ({ name, dir, size: dir ? null : 1, modified: 1, lossy: false });
  it('the file shown: done, on any listing', () => {
    expect(savedStateOf({ entries: [f('big.iso')], whole: true }, 'big.iso')).toBe('done');
    expect(savedStateOf({ entries: [f('big.iso')], whole: false }, 'big.iso')).toBe('done');
  });
  it('not shown: missing only on a whole listing; one that leaves an entry out, or the top folder, is unchecked', () => {
    expect(savedStateOf({ entries: [], whole: true }, 'big.iso')).toBe('missing');
    expect(savedStateOf({ entries: [], whole: false }, 'big.iso')).toBe('unchecked');
    expect(savedStateOf({ entries: [f('big.iso', true)], whole: true }, 'big.iso')).toBe('missing');
  });
  it('a failed read: unchecked', () => {
    expect(savedStateOf('failed', 'big.iso')).toBe('unchecked');
  });
});
