// Vitest: core's path reads for a chat's path link. A stat says folder, file or
// other from the files program's path_type; a 404 is "no such path", a 403 a refusal, anything else a failure. The agent's
// home folder is read once per computer and realm and kept; `~/…` expands only against it, never to anything unclean.
import { describe, expect, it } from 'vitest';
import type { CoreSnapshot } from './ctx';
import { agentHome, expandHome, fileStat, homeOfCwds, kindOfStat, statParts, statProblem } from './pathProbe';

const P = 'a'.repeat(24);
const t = (id: string) => ({ project: { id: P }, container: { id, server_name: 'sg1' } });
const A = t('b'.repeat(24));
const B = t('c'.repeat(24));
// A signed-in core, given to key() so no session is read.
const SNAP = { account: 'u1', realm: 'global', gen: 1, target: null, identity: null, switching: null, loggingOut: false, vgen: 0 } as unknown as CoreSnapshot;

describe('fileStat', () => {
  it('reads path_type as folder, file or other; a symlink is what it points at', () => {
    expect(kindOfStat({ path_type: 'Dir' })).toBe('folder');
    expect(kindOfStat({ path_type: 'SymlinkDir' })).toBe('folder');
    expect(kindOfStat({ path_type: 'File' })).toBe('file');
    expect(kindOfStat({ path_type: 'SymlinkFile' })).toBe('file');
    for (const o of ['Fifo', 'Socket', 'CharDevice', 'BlockDevice']) expect(kindOfStat({ path_type: o })).toBe('other');
  });
  it('an answer without a known path_type is not an answer', () => {
    for (const raw of [null, {}, { path_type: 'dir' }, { path_type: 1 }, 'File', []]) expect(() => kindOfStat(raw)).toThrow('NOT_A_STAT');
  });
  it('says why a stat told nothing: 404 no such path, 403 refused, anything else failed', () => {
    expect(statProblem({ status: 404 })).toBe('missing');
    expect(statProblem({ status: 403 })).toBe('refused');
    for (const e of [{ status: 500 }, { status: 401 }, { kind: 'not_sent', notSent: true }, null, new Error('x')]) expect(statProblem(e)).toBe('failed');
  });
  it('sends a clean absolute path only, folded as the files program takes it', () => {
    expect(statParts('/srv/app')).toEqual(['srv', 'app']);
    expect(statParts('/srv//app/./x/')).toEqual(['srv', 'app', 'x']);
    expect(statParts('/')).toEqual([]);
    for (const bad of ['srv/app', '~/x', '/srv/../etc', '/a\u0000b', '']) expect(statParts(bad)).toBeNull();
  });
  it('keys one read per computer and path', () => {
    expect(fileStat.key({ target: A, path: '/srv' }, SNAP)).toEqual(fileStat.key({ target: A, path: '/srv' }, SNAP));
    expect(fileStat.key({ target: A, path: '/srv' }, SNAP)).not.toEqual(fileStat.key({ target: B, path: '/srv' }, SNAP));
    expect(fileStat.key({ target: A, path: '/srv' }, SNAP)).not.toEqual(fileStat.key({ target: A, path: '/etc' }, SNAP));
  });
});

describe('agentHome', () => {
  it('takes a clean absolute folder only', () => {
    expect(homeOfCwds({ home: '/home/ada' })).toBe('/home/ada');
    expect(homeOfCwds({ home: '/home/ada/' })).toBe('/home/ada');
    expect(homeOfCwds({ home: '/' })).toBe('/');
    for (const raw of [{}, { home: null }, { home: '' }, { home: 'home/ada' }, { home: '/home/../root' }, { home: '/a\nb' }, { home: '/a//b' }, null]) expect(homeOfCwds(raw)).toBeNull();
  });
  it('is read once per computer and realm, then kept', () => {
    expect(agentHome.options({ target: A, realm: 'global' }, SNAP).staleTime).toBe(Infinity);
    expect(agentHome.key({ target: A, realm: 'global' }, SNAP)).toEqual(agentHome.key({ target: A, realm: 'global' }, SNAP));
    expect(agentHome.key({ target: A, realm: 'global' }, SNAP)).not.toEqual(agentHome.key({ target: B, realm: 'global' }, SNAP));
    expect(agentHome.key({ target: A, realm: 'global' }, SNAP)).not.toEqual(agentHome.key({ target: A, realm: 'd'.repeat(24) }, SNAP));
  });
});

describe('expandHome', () => {
  it('writes ~ and ~/… against the home', () => {
    expect(expandHome('~', '/home/ada')).toBe('/home/ada');
    expect(expandHome('~/', '/home/ada')).toBe('/home/ada');
    expect(expandHome('~/src/app.ts', '/home/ada')).toBe('/home/ada/src/app.ts');
    expect(expandHome('~/x', '/')).toBe('/x');
  });
  it('anything else, or a result that is not clean, is null', () => {
    for (const p of ['~ada/x', '/home/ada', 'x/~/y', '~/../etc', '~//x']) expect(expandHome(p, '/home/ada')).toBeNull();
  });
});
