// The agent's skills list → rows, and what a fresh list proves about a lost on/off answer.
import { describe, expect, it } from 'vitest';
import {
  canSwitch, commitUrl, hubPreviewOf, hubSearchOf, publisherOf, shortCommit, sortedFrontmatter, sourceUrl, importable, importProved, importResultOf, importScanOf, installProved, installTimes, rootOf, rowOf, skillsOf, toggleProved,
  type SkillList,
  takenIn,
} from './logic';
import { skillsTable } from './data';

const base = { name: 'pdf-tools', root_id: 'user', root_dir: '/u', rel_dir: 'pdf-tools', dir: '/u/pdf-tools', realm: 'global' };
const at = { computer: 'c1', realm: 'global' };

describe('rows', () => {
  it('state: on, off, shadowed, broken (a broken one has no known on/off)', () => {
    expect(rowOf(base)!.state).toBe('on');
    expect(rowOf({ ...base, disabled: true })!.state).toBe('off');
    expect(rowOf({ ...base, shadowed: true })!.state).toBe('shadowed');
    const broken = rowOf({ ...base, parse_err: 'bad', disabled: true })!;
    expect(broken.state).toBe('broken');
    expect(broken.disabled).toBeNull();
    expect(canSwitch(broken)).toBe(false);
    expect(canSwitch(rowOf({ ...base, shadowed: true })!)).toBe(false);
  });

  it('trust is apart from on/off: none = made here, a record = trusted or not, tampered = changed', () => {
    expect(rowOf(base)!.trust).toBe('local');
    expect(rowOf({ ...base, trust: { level: 'trusted' } })!.trust).toBe('trusted');
    expect(rowOf({ ...base, trust: { level: 'untrusted' } })!.trust).toBe('untrusted');
    expect(rowOf({ ...base, trust: { level: 'trusted', tampered: true } })!.trust).toBe('changed');
    expect(rowOf({ ...base, disabled: true, trust: { level: 'trusted' } })!).toMatchObject({ state: 'off', trust: 'trusted' });
  });

  it('a field of the wrong type drops the row: disabled, shadowed, trust.tampered and trust.level are what the agent sends', () => {
    expect(rowOf({ ...base, disabled: 'false' })).toBeNull();
    expect(rowOf({ ...base, shadowed: 1 })).toBeNull();
    expect(rowOf({ ...base, trust: { level: 'trusted', tampered: 'no' } })).toBeNull();
    expect(rowOf({ ...base, trust: { level: 'weird' } })).toBeNull();
    expect(rowOf({ ...base, trust: 'trusted' })).toBeNull();
    // absent is false, a null trust is made here
    expect(rowOf({ ...base, disabled: undefined, shadowed: undefined })!.state).toBe('on');
    expect(rowOf({ ...base, trust: null })!.trust).toBe('local');
    expect(skillsOf({ items: [{ ...base, disabled: 'false' }], meta: { total: 1 } }, at).complete).toBe(false);
  });

  it('a row without a name or folder is dropped; the list is complete only when it holds the total', () => {
    expect(rowOf({ ...base, dir: '' })).toBeNull();
    expect(skillsOf({ items: [base, { name: 'x' }], meta: { total: 1 } }, at).items).toHaveLength(1);
    expect(skillsOf({ items: [base], meta: { total: 2 } }, at).complete).toBe(false);
    expect(skillsOf({ items: [base], meta: { total: 1 } }, at).complete).toBe(true);
    expect(skillsOf({}, at).complete).toBe(false);
  });
});

describe('toggleProved', () => {
  const list = (rows: unknown[], where = at): SkillList => skillsOf({ items: rows, meta: { total: rows.length } }, where);
  const id = { computer: 'c1', realm: 'global', name: 'pdf-tools', disabled: true };

  it('applied only when a list of the same computer and realm shows the copy in use with the value sent', () => {
    expect(toggleProved(id, [[list([{ ...base, disabled: true }])]])).toBe('applied');
    expect(toggleProved(id, [[list([base])]])).toBeUndefined();
    expect(toggleProved(id, [[list([{ ...base, disabled: true }], { computer: 'c2', realm: 'global' })]])).toBeUndefined();
    expect(toggleProved(id, [[list([{ ...base, disabled: true }], { computer: 'c1', realm: 'a'.repeat(24) })]])).toBeUndefined();
  });

  it('a shadowed or broken copy never proves it; the name gone proves nothing (never not_applied)', () => {
    expect(toggleProved(id, [[list([{ ...base, disabled: true, shadowed: true }])]])).toBeUndefined();
    expect(toggleProved(id, [[list([{ ...base, disabled: true, parse_err: 'bad' }])]])).toBeUndefined();
    expect(toggleProved(id, [[list([])]])).toBeUndefined();
    expect(toggleProved({ ...id, disabled: false }, [[list([base])]])).toBe('applied');
    // a row whose on/off is not a boolean is no row: the list is incomplete, so it proves nothing
    expect(toggleProved({ ...id, disabled: false }, [[list([{ ...base, disabled: 'false' }])]])).toBeUndefined();
  });
});

// Skill Hub, installs and imports
const ref = { provider: 'skills.sh', source: 'atlas/skills', skillId: 'changelog' };
const hubRow = (installedAt: string, over: Record<string, unknown> = {}) => ({
  ...base, name: 'changelog', rel_dir: 'changelog', dir: '/u/changelog',
  trust: { level: 'untrusted', provider: 'skills.sh', ref_source: 'atlas/skills', ref_skill_id: 'changelog', installed_at: installedAt, ...over },
});
const listOf = (rows: unknown[], where = at): SkillList => skillsOf({ items: rows, meta: { total: rows.length } }, where);

describe('rows carry their folder and install record', () => {
  it('relDir and origin as recorded; a skill made here has none', () => {
    const r = rowOf(hubRow('2026-10-27T12:00:01Z'))!;
    expect(r.relDir).toBe('changelog');
    expect(r.origin).toEqual({ provider: 'skills.sh', refSource: 'atlas/skills', refSkillId: 'changelog', installedAt: '2026-10-27T12:00:01Z', tampered: false });
    expect(rowOf(base)!.origin).toBeNull();
    // The folder is its own field, not the name (a skill's name may differ from its folder).
    expect(rowOf({ ...base, name: 'pdf', rel_dir: 'pdf-tools-2' })!.relDir).toBe('pdf-tools-2');
  });
});

describe('hub answers', () => {
  it('search: hits with a full ref only; stale or degraded is old', () => {
    const s = hubSearchOf({ results: [{ ref: { provider: 'skills.sh', source: 'a/b', skill_id: 'x' }, name: 'x', installs: 3 }, { ref: { provider: 'skills.sh' }, name: 'y' }], envelope: { stale: false } });
    expect(s.hits).toEqual([{ ref: { provider: 'skills.sh', source: 'a/b', skillId: 'x' }, name: 'x', source: 'a/b', installs: 3 }]);
    expect(s.old).toBe(false);
    expect(hubSearchOf({ results: [], envelope: { stale: true } }).old).toBe(true);
    expect(hubSearchOf({ results: [], degraded: 'upstream down' }).old).toBe(true);
    expect(hubSearchOf(null).hits).toEqual([]);
  });

  it('preview: only with a digest and a body, for the skill asked; files and commands as sent', () => {
    const raw = { package_digest: 'sha256:abcdef0123', name: 'changelog', source: 'atlas/skills', provider: 'skills.sh', body: '# x', frontmatter: { name: 'changelog' }, files: [{ path: 'SKILL.md', size: 3 }, { path: 't.md', size: 5 }], dynamic_cmd_list: ['ls'], total_bytes: 8 };
    const p = hubPreviewOf(raw, ref)!;
    expect(p.digest).toBe('sha256:abcdef0123');
    expect(p.files).toEqual([{ path: 'SKILL.md', size: 3 }, { path: 't.md', size: 5 }]);
    expect(p.commands).toEqual(['ls']);
    expect(p.frontmatter).toEqual([['name', 'changelog']]);
    expect(hubPreviewOf({ ...raw, package_digest: '' }, ref)).toBeNull();
    expect(hubPreviewOf({ ...raw, package_digest: 'bad digest!' }, ref)).toBeNull();
    expect(hubPreviewOf({ ...raw, body: undefined }, ref)).toBeNull();
    expect(hubPreviewOf({ ...raw, name: 'other' }, ref)).toBeNull();
    expect(hubPreviewOf({ ...raw, source: 'other/src' }, ref)).toBeNull();
    expect(hubPreviewOf({ ...raw, total_bytes: undefined }, ref)!.totalBytes).toBe(8);
  });
});

describe('import answers', () => {
  it('scan: that tool\'s skills; no list is null (never "none found"); importable = parsed with a folder to land in', () => {
    const e = importScanOf({ skills: [{ source: 'claude', name: 'r', rel_dir: 'r', dest_rel_dir: 'r', dynamic_cmds: ['ls'], sensitive: ['.env'] }, { source: 'codex', rel_dir: 'x' }, { source: 'claude', rel_dir: 'h', dest_rel_dir: 'h', parse_err: 'bad' }] }, 'claude')!;
    expect(e.map((x) => x.relDir)).toEqual(['r', 'h']);
    expect(e[0]!.commands).toEqual(['ls']);
    expect(e[0]!.sensitive).toEqual(['.env']);
    expect(importable(e[0]!)).toBe(true);
    expect(importable(e[1]!)).toBe(false);
    expect(importScanOf({}, 'claude')).toBeNull();
  });

  it('apply: that item\'s own result; exists by kind; none for it is null', () => {
    const raw = { results: [{ rel_dir: 'a', ok: true, name: 'A' }, { rel_dir: 'b', ok: false, kind: 'exists', err: 'x' }] };
    expect(importResultOf(raw, 'a')).toEqual({ ok: true, name: 'A', kind: '' });
    expect(importResultOf(raw, 'b')).toEqual({ ok: false, name: '', kind: 'exists' });
    expect(importResultOf({ results: [{ rel_dir: 'c', ok: false, kind: 'dup_in_batch', err: 'y' }] }, 'c')).toEqual({ ok: false, name: '', kind: 'dup_in_batch' });
    expect(importResultOf(raw, 'c')).toBeNull();
    expect(importResultOf({}, 'a')).toBeNull();
  });
});

describe('proofs of a lost install or import', () => {
  const inst = { computer: 'c1', realm: 'global', rel: 'changelog', provider: 'skills.sh', source: 'atlas/skills', skillId: 'changelog', before: ['2026-10-27T12:00:01Z'] };
  it('install: applied only for that folder with this hub skill\'s record and an install time not there at the press', () => {
    expect(installProved(inst, [[listOf([hubRow('2026-10-27T12:00:02Z')])]])).toBe('applied');
    expect(installProved(inst, [[listOf([hubRow('2026-10-27T12:00:01Z')])]])).toBeUndefined();
    expect(installProved(inst, [[listOf([hubRow('2026-10-27T12:00:02Z', { ref_source: 'other/src' })])]])).toBeUndefined();
    expect(installProved(inst, [[listOf([hubRow('2026-10-27T12:00:02Z', { ref_skill_id: 'other' })])]])).toBeUndefined();
    expect(installProved(inst, [[listOf([hubRow('2026-10-27T12:00:02Z')], { computer: 'c2', realm: 'global' })]])).toBeUndefined();
    expect(installProved(inst, [[listOf([hubRow('2026-10-27T12:00:02Z')], { computer: 'c1', realm: 'aaaaaaaaaaaaaaaaaaaaaaaa' })]])).toBeUndefined();
    expect(installProved(inst, [[listOf([hubRow('')])]])).toBeUndefined();
    expect(installProved({ ...inst, before: undefined }, [[listOf([hubRow('2026-10-27T12:00:02Z')])]])).toBeUndefined();
    expect(installProved(inst, [[listOf([])]])).toBeUndefined();
  });

  it('import: that folder with a record of that tool\'s folder and a new install time', () => {
    const imp = { computer: 'c1', realm: 'global', dest: 'review', source: 'claude', relDir: 'review', before: [] };
    const row = (o: Record<string, unknown>) => ({ ...base, name: 'review', rel_dir: 'review', dir: '/u/review', trust: { level: 'untrusted', provider: 'claude', ref_source: 'review', installed_at: '2026-10-27T12:00:03Z', ...o } });
    expect(importProved(imp, [[listOf([row({})])]])).toBe('applied');
    expect(importProved(imp, [[listOf([row({ provider: 'codex' })])]])).toBeUndefined();
    expect(importProved(imp, [[listOf([row({ ref_source: 'other' })])]])).toBeUndefined();
    expect(importProved({ ...imp, before: ['2026-10-27T12:00:03Z'] }, [[listOf([row({})])]])).toBeUndefined();
  });

  it('installTimes: the folder\'s recorded install times now', () => {
    expect(installTimes(listOf([hubRow('t1'), { ...base, rel_dir: 'other', dir: '/u/other' }]), 'changelog')).toEqual(['t1']);
    expect(installTimes(undefined, 'changelog')).toEqual([]);
  });
});

describe('one change per folder on a computer', () => {
  type Keyed = { lockKey: (v: unknown) => unknown };
  const target = { container: { id: 'c1' } };
  it('an install locks its folder (another folder is free); an import locks the folder it lands in', () => {
    const install = (skillsTable.changes as Record<string, Keyed>).install!;
    const k = (skillId: string) => JSON.stringify(install.lockKey({ target, realm: 'global', digest: 'd', overwrite: false, before: [], ref: { provider: 'p', source: 's', skillId } }));
    expect(k('a')).not.toBe(k('b'));
    expect(k('a')).toBe(k('a'));
    const imp = (skillsTable.changes as Record<string, Keyed>).import!;
    const j = (dest: string) => JSON.stringify(imp.lockKey({ target, realm: 'global', source: 'claude', relDir: 'r', dest, overwrite: false, before: [] }));
    expect(j('a')).not.toBe(j('b'));
  });
});

describe('proofs read the folder the agent writes, untampered', () => {
  const at = { computer: 'c1', realm: 'global' };
  const ref = { provider: 'skills.sh', source: 'atlas/skills', skillId: 'changelog' };
  const id = { ...at, rel: 'changelog', ...ref, before: [] as string[] };
  const listOf = (rows: unknown[]) => skillsOf({ items: rows, meta: { total: rows.length } }, at);
  it('a tampered record or a copy in another root proves nothing; the write root with an untampered record does', () => {
    const row = hubRow('2026-10-27T12:00:09Z') as Record<string, unknown>;
    const tampered = { ...row, trust: { ...(row.trust as object), tampered: true } };
    const project = { ...row, root_id: 'project' };
    expect(installProved(id, [[listOf([tampered])]])).toBeUndefined();
    expect(installProved(id, [[listOf([project])]])).toBeUndefined();
    expect(installProved(id, [[listOf([row])]])).toBe('applied');
    expect(takenIn(listOf([project]), 'changelog')).toBe(false);
    expect(takenIn(listOf([row]), 'changelog')).toBe(true);
    expect(installTimes(listOf([project]), 'changelog')).toEqual([]);
  });
});

describe('whole lists and item results', () => {
  const at = { computer: 'c1', realm: 'global' };
  it('whole only with a total covering every row, each with its root and folder; a record without a time is still readable', () => {
    const row = hubRow('2026-10-27T12:00:09Z') as Record<string, unknown>;
    expect(skillsOf({ items: [row], meta: { total: 1 } }, at).complete).toBe(true);
    expect(skillsOf({ items: [row] }, at).complete).toBe(false);
    expect(skillsOf({ items: [row], meta: { total: '1' } }, at).complete).toBe(false);
    expect(skillsOf({ items: [{ ...row, rel_dir: undefined }], meta: { total: 1 } }, at).complete).toBe(false);
    expect(skillsOf({ items: [{ ...row, root_id: '' }], meta: { total: 1 } }, at).complete).toBe(false);
    expect(skillsOf({ items: [{ ...row, trust: { ...(row.trust as object), installed_at: 5 } }], meta: { total: 1 } }, at).complete).toBe(false);
    const old = { ...row, trust: { level: 'trusted', provider: 'p', ref_source: 's' } };
    expect(skillsOf({ items: [old], meta: { total: 1 } }, at).complete).toBe(true);
  });
  it('an item result is its own only with a boolean ok', () => {
    expect(importResultOf({ results: [{ rel_dir: 'r' }] }, 'r')).toBeNull();
    expect(importResultOf({ results: [{ rel_dir: 'r', ok: 'yes' }] }, 'r')).toBeNull();
    expect(importResultOf({ results: [{ rel_dir: 'r', ok: false, err: 'x' }] }, 'r')).toEqual({ ok: false, name: '', kind: '' });
  });
});

describe('hub addresses', () => {
  it('sourceUrl: owner/repo is its GitHub page, a bare domain its https site, anything else no link', () => {
    expect(sourceUrl('atlas/skills')).toBe('https://github.com/atlas/skills');
    expect(sourceUrl('Atlas-1/my_skills.v2')).toBe('https://github.com/Atlas-1/my_skills.v2');
    expect(sourceUrl('skills.example.com')).toBe('https://skills.example.com');
    expect(sourceUrl('Skills.Example.COM')).toBe('https://skills.example.com');
    for (const bad of ['', 'atlas', 'a/b/c', '../x', 'a/..', './b', 'a b/c', 'a/b?x=1', 'a/b#c', 'http://x.com', 'x.com/path', 'x.com:8080', '-x.com', 'x..com', 'user@x.com', 'localhost', '1.2.3.4', 'a/b\\c']) {
      expect(sourceUrl(bad), bad).toBe('');
    }
  });

  it('commitUrl: a hex commit of a GitHub source links its commit page; any other shape, none', () => {
    expect(commitUrl('atlas/skills', 'ABCDEF0123456789abcdef0123456789abcdef01')).toBe('https://github.com/atlas/skills/commit/ABCDEF0123456789abcdef0123456789abcdef01');
    expect(commitUrl('atlas/skills', 'abc1234')).toBe('https://github.com/atlas/skills/commit/abc1234');
    expect(commitUrl('skills.example.com', 'abc1234')).toBe('');
    expect(commitUrl('atlas/skills', 'fixture0commit')).toBe('');
    expect(commitUrl('atlas/skills', 'abc12')).toBe('');
    expect(commitUrl('atlas/skills', '')).toBe('');
    expect(commitUrl('atlas/skills', 'abc1234/../x')).toBe('');
  });

  it('shortCommit: the first 7 of a hex commit; any other text as given', () => {
    expect(shortCommit('abcdef0123456789')).toBe('abcdef0');
    expect(shortCommit('fixture0commit')).toBe('fixture0commit');
    expect(shortCommit('')).toBe('');
  });

  it('publisherOf: the owner of owner/repo, a domain itself, else the source', () => {
    expect(publisherOf('atlas/skills')).toBe('atlas');
    expect(publisherOf('skills.example.com')).toBe('skills.example.com');
    expect(publisherOf('odd source')).toBe('odd source');
  });

  it('sortedFrontmatter: by key, never the order the reply happened to carry', () => {
    expect(sortedFrontmatter([['name', 'x'], ['allowed-tools', 'a'], ['description', 'd']])).toEqual([['allowed-tools', 'a'], ['description', 'd'], ['name', 'x']]);
  });
});

describe('rootOf', () => {
  it('names the agent\'s bundled root (a realm\'s Hoody skills); any root it does not know is other', () => {
    expect(rootOf('bundled')).toBe('bundled');
    expect(['project', 'user', 'config'].map(rootOf)).toEqual(['project', 'user', 'config']);
    expect(rootOf('')).toBe('other');
    expect(rootOf('Bundled')).toBe('other');
  });
});
