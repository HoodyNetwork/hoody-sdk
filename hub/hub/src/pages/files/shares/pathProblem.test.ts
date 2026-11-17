// @vitest-environment node
// Whether a folder can be shared: the API's own path vectors
// (from the API's own tests), read in the API's order, plus connected storage.
import { describe, expect, it } from 'vitest';
import { sharePathOf, sharePathProblem } from './pathProblem';

describe('sharePathProblem: the API vectors', () => {
  it.each([
    ['/data/projects/my-app', null],
    ['//data//projects/my-app', null],
    ['//data//projects/./my-app', 'dots'],
    ['data/projects', 'relative'],
    ['/data; rm -rf /', 'chars'],
    ['/data && evil', 'chars'],
    ['/data | tee', 'chars'],
    ['/data$VAR', 'chars'],
    ['/data/safe\0/etc/passwd', 'chars'],
    ['/data/../etc', 'dots'],
    ['/data/../proc/self', 'dots'],
    ['/proc', 'system'],
    ['/proc/self/mem', 'system'],
    ['/sys/class', 'system'],
    ['/dev/sda', 'system'],
    ['/boot/grub', 'system'],
    ['/run/secrets', 'system'],
    ['/var/run/docker.sock', 'system'],
    ['/proc/../proc/self', 'dots'],
    ['//proc/self', 'system'],
    ['', 'empty'],
    ['relative', 'relative'],
  ] as const)('%j → %s', (path, problem) => {
    expect(sharePathProblem(path)).toBe(problem);
  });
});

describe('sharePathProblem: the Hub cases', () => {
  it('a space or a non-English letter in any folder name refuses (the API takes A-Z a-z 0-9 / - _ . ( ) only)', () => {
    expect(sharePathProblem('/home/ada/My Photos')).toBe('chars');
    expect(sharePathProblem('/home/ada/café')).toBe('chars');
    expect(sharePathProblem('/home/ada/report(1)')).toBeNull();
  });
  it('the computer root and /hoody are refused as whole roots', () => {
    expect(sharePathProblem('/')).toBe('root');
    expect(sharePathProblem('//')).toBe('root');
    expect(sharePathProblem('/hoody')).toBe('root');
    expect(sharePathProblem('/hoody/')).toBe('root');
  });
  it('a received share, now or before /hoody/shares, is never shared on', () => {
    expect(sharePathProblem('/hoody/shares')).toBe('received');
    expect(sharePathProblem('/hoody/shares/data-0123abcd/sub')).toBe('received');
    expect(sharePathProblem('/hoody/containers/x')).toBe('received');
  });
  it('a name that only begins like a refused folder is fine', () => {
    expect(sharePathProblem('/procedures')).toBeNull();
    expect(sharePathProblem('/hoody/sharesx')).toBeNull();
    expect(sharePathProblem('/hoody/mine')).toBeNull();
    expect(sharePathProblem('/var/running')).toBeNull();
  });
  it('a name holding two dots is refused, as the API refuses it', () => {
    expect(sharePathProblem('/data/a..b')).toBe('dots');
    expect(sharePathProblem('/data/.hidden')).toBeNull();
  });
  it('length: 1000 characters pass, 1001 do not', () => {
    expect(sharePathProblem('/' + 'a'.repeat(999))).toBeNull();
    expect(sharePathProblem('/' + 'a'.repeat(1000))).toBe('long');
  });
  it('a folder on connected storage is another disk, not this computer’s', () => {
    expect(sharePathProblem('/hoody/mounts/permanent/drive/docs')).toBe('connected');
    expect(sharePathProblem('/mnt/usb/docs', [{ path: '/mnt/usb', label: 'USB' }])).toBe('connected');
    expect(sharePathProblem('/mnt/usb/docs')).toBeNull();
  });
});

describe('sharePathOf', () => {
  it('collapses repeated and trailing slashes as the API stores the path', () => {
    expect(sharePathOf('//data//projects/my-app/')).toBe('/data/projects/my-app');
    expect(sharePathOf('/')).toBe('/');
  });
});
