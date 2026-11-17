// Vitest: the AI page's "/" commands are what the agent reports, never a Hub list: an open chat reads its own
// list (GET /sessions/{id}/slash-commands, tui_only entries left out); otherwise (New chat, or that read failed: an agent from
// before the route answers 404) the skills come from GET /skills as the chat's folder sees them, plus the host's built-ins.
// Untrusted skills stay offered, with their mark.
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { skillsOf } from '../knowledge/skills/logic';
import { skillsTable, useSkillsIn } from '../knowledge/skills/data';
import type * as DataModule from '../knowledge/skills/data';
import { skillRoutes } from '../knowledge/skills/routes';
import { menuOf, skillCommands, useSlashCommands } from './slashCommands';
import { agentCommands, slashRoutes, slashTable, useAgentSlash, type AgentBuiltin } from './slashData';
import strings from './Conversation.strings.en.json';
import type * as SlashDataModule from './slashData';

// The reads themselves are core's; here only what the hook asks of them.
vi.mock('../knowledge/skills/data', async (real) => ({ ...(await real<typeof DataModule>()), useSkillsIn: vi.fn() }));
vi.mock('./slashData', async (real) => ({ ...(await real<typeof SlashDataModule>()), useAgentSlash: vi.fn(() => ({ k: 'reading' })) }));

const S = strings as Record<string, string>;
const row = (name: string, o: Record<string, unknown> = {}) => ({ name, root_id: 'user', root_dir: '/u', rel_dir: name, dir: `/u/${name}`, realm: 'global', ...o });
const list = (rows: unknown[]) => skillsOf({ items: rows, meta: { total: rows.length } }, { computer: 'c1', realm: 'global' });

describe('skillCommands', () => {
  it('only skills in use, each name once, by name; the first line of the description', () => {
    const got = skillCommands(list([
      row('pdf', { description: 'Read PDFs\nand more' }),
      row('alpha', { description: '  Starts things  ' }),
      row('off', { disabled: true }),
      row('hidden', { shadowed: true }),
      row('bad', { parse_err: 'x' }),
    ]));
    expect(got).toEqual([{ name: 'alpha', description: 'Starts things' }, { name: 'pdf', description: 'Read PDFs' }]);
  });
  it('a skill not trusted, or changed since it was, is offered with its mark; a trusted or local one without', () => {
    const got = skillCommands(list([
      row('a', { trust: { level: 'untrusted' } }),
      row('b', { trust: { level: 'trusted' } }),
      row('c'),
    ]));
    expect(got.map((c) => [c.name, c.untrusted === true])).toEqual([['a', true], ['b', false], ['c', false]]);
  });
  it('no list yet: no skills', () => {
    expect(skillCommands(undefined)).toEqual([]);
  });
});

describe('the read the menu uses', () => {
  it('is GET /skills with the chat folder as X-Hoody-Cwd; no folder sends none', () => {
    expect(skillRoutes.listIn.cwd).toBe(true);
    expect(skillRoutes.listIn.path).toBe(skillRoutes.list.path);
    const read = skillsTable.reads!.skillsIn!;
    const target = { project: { id: 'p' }, container: { id: 'c1' } } as never;
    expect(read.input!({ target, realm: 'global', cwd: '/w/app' })).toMatchObject({ cwd: '/w/app', query: { limit: 0 } });
    expect('cwd' in read.input!({ target, realm: 'global', cwd: '' })).toBe(false);
  });
});

describe('useSlashCommands', () => {
  const at = { target: { project: { id: 'p' }, container: { id: 'c1' } } as never, realm: 'global', cwd: '/w/app' };
  const compact = [{ name: 'compact', description: 'Compact' }];
  it('reads nothing until the menu opens; then the folder\'s skills follow the built-ins (a skill named as a built-in is not listed twice)', () => {
    const q = vi.mocked(useSkillsIn);
    q.mockImplementation((p) => (p ? { data: list([row('compact'), row('pdf')]), isPending: false, isError: false } : { data: undefined, isPending: true, isError: false }) as never);
    const { result } = renderHook(() => useSlashCommands(at, compact));
    expect(q.mock.calls.every(([p]) => p === null), 'no read before the menu opened').toBe(true);
    expect(result.current.items.map((c) => c.name)).toEqual(['compact']);
    act(() => result.current.open!());
    expect(q).toHaveBeenLastCalledWith(at);
    expect(result.current.items.map((c) => c.name)).toEqual(['compact', 'pdf']);
    expect(result.current.reading).toBe(false);
  });
  it('a read that fails says so, the built-ins kept; no place to read (null) is neither reading nor failed', () => {
    const q = vi.mocked(useSkillsIn);
    q.mockImplementation((p) => (p ? { data: undefined, isPending: false, isError: true } : { data: undefined, isPending: true, isError: false }) as never);
    const { result } = renderHook(() => useSlashCommands(at, compact));
    act(() => result.current.open!());
    expect(result.current).toMatchObject({ items: compact, failed: true });
    const none = renderHook(() => useSlashCommands(null, compact)).result;
    act(() => none.current.open!());
    expect(none.current.reading).toBe(false);
    expect(none.current.failed).toBe(false);
  });
});

const cmd = (name: string, o: Record<string, unknown> = {}) => ({ name, description: `${name} words`, kind: 'builtin', category: 'session', args: 'none', tui_only: false, ...o });

describe('agentCommands (the agent\'s list)', () => {
  it('keeps every built-in (the terminal\'s own marked terminal) and skill, each name once, in the agent\'s order; first line of each description', () => {
    const got = agentCommands({ items: [
      cmd('fork', { tui_only: true }),
      cmd('clear'),
      cmd('compact', { description: 'Summarize\nmore' }),
      cmd('clear', { description: 'again' }),
      cmd('usage', { tui_only: undefined }),
      cmd('pdf', { kind: 'skill', category: 'skills', args: 'optional' }),
      cmd('odd', { kind: 'plugin' }),
      cmd('has space'),
      cmd('/slashed'),
      { description: 'no name', tui_only: false, kind: 'builtin' },
      'junk',
    ], meta: { total: 11 } });
    const b = (name: string, description: string, o: Record<string, unknown> = {}) => ({ name, description, category: 'session', args: 'none', terminal: false, ...o });
    expect(got).toEqual({
      builtins: [b('fork', 'fork words', { terminal: true }), b('clear', 'clear words'), b('compact', 'Summarize'), b('usage', 'usage words', { terminal: true })],
      skills: [{ name: 'pdf', description: 'pdf words' }],
    });
  });
  it('a category or argument shape the Hub does not know reads as no category and optional text', () => {
    expect(agentCommands({ items: [cmd('x', { category: 'future', args: 'many' })] })!.builtins).toEqual([{ name: 'x', description: 'x words', category: '', args: 'optional', terminal: false }]);
  });
  it('an answer of another shape is no list (the caller falls back)', () => {
    expect(agentCommands({ commands: [] })).toBeUndefined();
    expect(agentCommands([cmd('clear')]), 'a bare array is not the documented {items}').toBeUndefined();
    expect(agentCommands([])).toBeUndefined();
    expect(agentCommands({ items: [] }), 'an empty list is a list').toEqual({ builtins: [], skills: [] });
    expect(agentCommands(null)).toBeUndefined();
    expect(agentCommands('x')).toBeUndefined();
  });
  it('the route is GET /sessions/{id}/slash-commands on the agent', () => {
    expect(slashRoutes.commands.method).toBe('GET');
    expect(slashRoutes.commands.path).toBe('/sessions/:id/slash-commands');
    expect(slashRoutes.commands.scope).toBe('agent');
  });
  it('the read names the chat by id, on its computer, in its own realm', () => {
    const target = { project: { id: 'p' }, container: { id: 'c1' } } as never;
    expect(slashTable.reads!['slash.commands']!.input!({ target, realm: 'r1', sid: 's1' })).toEqual({ target, params: { id: 's1' }, realm: 'r1' });
    expect('realm' in slashTable.reads!['slash.commands']!.input!({ target, realm: '', sid: 's1' })).toBe(false);
  });
});

describe('useSlashCommands on an open chat', () => {
  const target = { project: { id: 'p' }, container: { id: 'c1' } } as never;
  const at = { target, realm: 'global', cwd: '/w/app', sid: 's1' };
  const compact = [{ name: 'compact', description: 'Compact' }];
  const skillsRead = () => vi.mocked(useSkillsIn).mock.calls.filter(([p]) => p !== null).length;
  const setup = (own: ReturnType<typeof useAgentSlash>) => {
    vi.mocked(useSkillsIn).mockReset();
    vi.mocked(useSkillsIn).mockImplementation((p) => (p ? { data: list([row('pdf')]), isPending: false, isError: false } : { data: undefined, isPending: true, isError: false }) as never);
    vi.mocked(useAgentSlash).mockReset().mockImplementation((_t, _r, _s, enabled) => (enabled ? own : { k: 'reading' }));
  };
  const bi = (name: string, description: string, o: Partial<AgentBuiltin> = {}): AgentBuiltin => ({ name, description, category: 'conversation', args: 'none', terminal: false, ...o });
  const agentList = { k: 'ok' as const, builtins: [bi('clear', 'Clear'), bi('compact', 'Agent compact', { args: 'optional' })], skills: [{ name: 'clear', description: 'shadow' }, { name: 'deploy', description: 'Deploy' }] };

  it('the agent\'s list (built-ins first, a skill named as a built-in once); /skills is read beside it for the marks only', () => {
    setup(agentList);
    const { result } = renderHook(() => useSlashCommands(at, compact));
    expect(vi.mocked(useAgentSlash).mock.calls.every(([, , , on]) => on === false), 'nothing read before the menu opened').toBe(true);
    act(() => result.current.open!());
    expect(vi.mocked(useAgentSlash)).toHaveBeenLastCalledWith(target, 'global', 's1', true);
    expect(result.current.items.map((c) => [c.name, c.description])).toEqual([['clear', 'Clear'], ['compact', 'Agent compact'], ['deploy', 'Deploy']]);
    expect(result.current).toMatchObject({ reading: false, failed: false });
    expect(skillsRead(), 'the /skills join').toBeGreaterThan(0);
    expect(result.current.items.map((c) => c.name), 'a /skills row the agent did not list is not added').not.toContain('pdf');
  });
  it('the agent\'s /compact shows only while the host offers compact for this chat', () => {
    setup(agentList);
    const { result } = renderHook(() => useSlashCommands(at, []));
    act(() => result.current.open!());
    expect(result.current.items.map((c) => c.name)).toEqual(['clear', 'deploy']);
  });
  it('while the agent\'s list is read: reading, the host\'s built-ins shown (no skills, no fallback commands yet)', () => {
    setup({ k: 'reading' });
    const { result } = renderHook(() => useSlashCommands(at, compact));
    act(() => result.current.open!());
    expect(result.current.reading).toBe(true);
    expect(result.current.items.map((c) => c.name)).toEqual(['compact']);
  });
  it('the host\'s runs are there before any list is read (hidden, never listed): a typed /memory wipe is the host\'s at once', () => {
    setup({ k: 'reading' });
    const runs = { memory: vi.fn(), clear: vi.fn() };
    const { result } = renderHook(() => useSlashCommands(at, compact, undefined, runs));
    expect(result.current.items.filter((c) => !c.hidden).map((c) => c.name)).toEqual(['compact']);
    const hidden = result.current.items.filter((c) => c.hidden);
    expect(hidden.map((c) => c.name).sort()).toEqual(['clear', 'memory']);
    hidden.find((c) => c.name === 'memory')!.run!('wipe');
    expect(runs.memory).toHaveBeenCalledWith('wipe');
  });
  it('the agent\'s list fails (an agent from before the route answers 404): its /clear, /skills, /hooks and /memory and the folder\'s skills', () => {
    setup({ k: 'failed' });
    const runs = { clear: vi.fn() };
    const { result } = renderHook(() => useSlashCommands(at, compact, undefined, runs));
    act(() => result.current.open!());
    expect(result.current.items.map((c) => c.name)).toEqual(['compact', 'clear', 'skills', 'hooks', 'memory', 'pdf']);
    const clear = result.current.items.find((c) => c.name === 'clear')!;
    expect(clear).toMatchObject({ description: S['slash.desc.clear'], group: S['slash.group.conversation'] });
    expect(clear.hint, '/clear takes nothing: the pick runs the host\'s confirm at once').toBeUndefined();
    clear.run!('');
    expect(runs.clear).toHaveBeenCalledWith('');
    expect(result.current.items.find((c) => c.name === 'skills')).toMatchObject({ description: S['slash.desc.skills'], group: S['slash.group.session'] });
    expect(result.current.items.find((c) => c.name === 'skills')!.hint, '/skills takes nothing: the pick writes it, Send sends it exact').toBeUndefined();
    expect(vi.mocked(useSkillsIn)).toHaveBeenLastCalledWith(at);
    expect(result.current.failed).toBe(false);
  });
  it('a /skills join whose refresh failed is not believed: an older agent\'s skill is Your skills, no stale root or mark', () => {
    setup({ k: 'ok', builtins: [], skills: [{ name: 'deploy', description: 'Deploy' }] });
    const stale = list([row('deploy', { root_id: 'bundled' })]);
    vi.mocked(useSkillsIn).mockImplementation((p) => (p ? { data: stale, isPending: false, isError: true } : { data: undefined, isPending: true, isError: false }) as never);
    const { result } = renderHook(() => useSlashCommands(at, []));
    act(() => result.current.open!());
    expect(result.current.items.find((c) => c.name === 'deploy')).toMatchObject({ group: S['slash.group.skills'] });
    vi.mocked(useSkillsIn).mockImplementation((p) => (p ? { data: stale, isPending: false, isError: false } : { data: undefined, isPending: true, isError: false }) as never);
    const fresh = renderHook(() => useSlashCommands(at, [])).result;
    act(() => fresh.current.open!());
    expect(fresh.current.items.find((c) => c.name === 'deploy'), 'the same data, read fine, is believed').toMatchObject({ group: S['slash.group.hoody'] });
  });
  it('no chat yet (no id): the folder\'s skills, the agent\'s list never read', () => {
    setup(agentList);
    const { result } = renderHook(() => useSlashCommands({ ...at, sid: '' }, compact));
    act(() => result.current.open!());
    expect(vi.mocked(useAgentSlash).mock.calls.every(([, , , on]) => on === false)).toBe(true);
    expect(result.current.items.map((c) => c.name), 'no chat: none of the chat\'s daemon commands').toEqual(['compact', 'pdf']);
  });
});

describe('menuOf: the grouped menu', () => {
  const t = (k: string) => S[k] ?? k;
  const bi = (name: string, o: Partial<AgentBuiltin> = {}): AgentBuiltin => ({ name, description: `${name} words`, category: 'session', args: 'none', terminal: false, ...o });
  const g = (k: string) => S[`slash.group.${k}`];
  it('built-ins by the agent\'s categories (its order inside each), unknown ones after, then Your skills, then Hoody platform', () => {
    const items = menuOf({
      builtins: [bi('usage', { category: 'session' }), bi('todo', { category: 'automation' }), bi('odd', { category: '' }), bi('clear', { category: 'conversation' }), bi('compact', { category: 'conversation' })],
      skills: [{ name: 'deploy', description: 'Deploy' }, { name: 'hoody-cli', description: 'CLI' }],
      join: list([row('hoody-cli', { root_id: 'bundled' }), row('deploy')]),
    }, t);
    expect(items.map((c) => [c.name, c.group])).toEqual([
      ['clear', g('conversation')], ['compact', g('conversation')], ['usage', g('session')], ['todo', g('automation')], ['odd', g('other')],
      ['deploy', g('skills')], ['hoody-cli', g('hoody')],
    ]);
  });
  it('Hoody platform only when the /skills read proves the copy in use is bundled; a same-named skill of the person\'s own, or no read, is Your skills', () => {
    const skills = [{ name: 'hoody-cli', description: 'CLI' }, { name: 'hoody-sdk', description: 'SDK' }];
    const own = menuOf({ builtins: [], skills, join: list([row('hoody-cli', { root_id: 'user' }), row('hoody-sdk', { root_id: 'other-root' })]) }, t);
    expect(own.map((c) => c.group)).toEqual([g('skills'), g('skills')]);
    expect(menuOf({ builtins: [], skills, join: undefined }, t).map((c) => c.group)).toEqual([g('skills'), g('skills')]);
    // the copy in use decides: a shadowed bundled copy under the person's own proves nothing
    const shadowed = menuOf({ builtins: [], skills: [skills[0]!], join: list([row('hoody-cli', { root_id: 'project', dir: '/p/hoody-cli' }), row('hoody-cli', { root_id: 'bundled', dir: '/b/hoody-cli', shadowed: true })]) }, t);
    expect(shadowed[0]!.group).toBe(g('skills'));
  });
  it('the agent\'s skills take their "Not trusted" mark from the /skills read', () => {
    const items = menuOf({ builtins: [], skills: [{ name: 'a', description: '' }, { name: 'b', description: '' }], join: list([row('a', { trust: { level: 'untrusted' } }), row('b', { trust: { level: 'trusted' } })]) }, t);
    expect(items.map((c) => [c.name, c.untrusted === true])).toEqual([['a', true], ['b', false]]);
  });
  it('hints: sent built-ins by name or by shape; a skill takes words; a built-in taking nothing has none', () => {
    const items = menuOf({ builtins: [bi('compact', { args: 'optional' }), bi('skills'), bi('rename', { args: 'required' }), bi('x', { args: 'optional' })], skills: [{ name: 'pdf', description: '' }], join: undefined }, t);
    expect(items.map((c) => [c.name, c.hint])).toEqual([
      ['compact', S['slash.hint.compact']], ['skills', undefined], ['rename', S['slash.hint.required']], ['x', S['slash.hint.optional']], ['pdf', S['slash.hint.skill']],
    ]);
  });
  it('a terminal-only built-in is listed for a host that can say so: picking or sending it tells the host and sends nothing; no host, not listed', () => {
    const say = vi.fn();
    const items = menuOf({ builtins: [bi('fork', { category: 'conversation', args: 'optional', terminal: true }), bi('clear', { category: 'conversation' })], skills: [], join: undefined, terminalOnly: say }, t);
    const fork = items.find((c) => c.name === 'fork')!;
    expect(fork).toMatchObject({ opens: S['slash.terminalOnly'], group: g('conversation') });
    expect(fork.hint, 'no hint: the pick runs it at once').toBeUndefined();
    expect(fork.run!('3')).not.toBe(false);
    expect(say).toHaveBeenCalledWith('fork');
    expect(items.find((c) => c.name === 'clear')!.run, 'a sent built-in is the agent\'s').toBeUndefined();
    expect(menuOf({ builtins: [bi('fork', { terminal: true })], skills: [], join: undefined }, t)).toEqual([]);
  });
  it('the host\'s own runs: a sent built-in it names is carried out by the host; one terminal-only is too, with no note', () => {
    const say = vi.fn();
    const clear = vi.fn(() => undefined), memory = vi.fn((a: string) => (a === 'wipe' ? undefined : false)), fork = vi.fn();
    const items = menuOf({ builtins: [bi('clear'), bi('memory', { args: 'optional' }), bi('fork', { args: 'optional', terminal: true }), bi('hooks', { args: 'optional' })], skills: [], join: undefined, terminalOnly: say, runs: { clear, memory, fork } }, t);
    const by = (n: string) => items.find((c) => c.name === n)!;
    expect(by('clear').run).toBe(clear);
    expect(by('clear').hint).toBeUndefined();
    expect(by('memory').run).toBe(memory);
    expect(by('memory').hint, 'words may follow: the pick writes "/memory "').toBe(S['slash.hint.memory']);
    expect(by('fork').run).toBe(fork);
    expect(by('fork').opens, 'carried out by the host: not the terminal-only note').toBeUndefined();
    by('fork').run!('2');
    expect(say).not.toHaveBeenCalled();
    expect(by('hooks').run, 'a built-in the host does not name stays the agent\'s').toBeUndefined();
  });
  it('a skill named as a built-in is listed once, as the built-in; a skill listed twice once', () => {
    const items = menuOf({ builtins: [bi('clear')], skills: [{ name: 'clear', description: 's' }, { name: 'pdf', description: '1' }, { name: 'pdf', description: '2' }], join: undefined }, t);
    expect(items.map((c) => [c.name, c.description])).toEqual([['clear', 'clear words'], ['pdf', '1']]);
  });
  it('an agent that names each skill\'s source is believed over the /skills join; an older one falls back to the join', () => {
    const join = list([row('hoody-cli', { root_id: 'user' }), row('mine', { root_id: 'bundled', trust: { level: 'untrusted' } })]);
    const items = menuOf({ builtins: [], skills: [{ name: 'hoody-cli', description: '', source: 'bundled' }, { name: 'mine', description: '', source: 'user' }, { name: 'x', description: '', source: 'user', untrusted: true }], join }, t);
    expect(items.map((c) => [c.name, c.group, c.untrusted === true])).toEqual([['mine', g('skills'), false], ['x', g('skills'), true], ['hoody-cli', g('hoody'), false]]);
  });
});

describe('agentCommands reads the per-skill source fields when present', () => {
  it('source and untrusted from the agent; untrusted without a source is not believed (no such agent); absent stays absent', () => {
    const got = agentCommands({ items: [
      cmd('a', { kind: 'skill', source: 'bundled' }), cmd('b', { kind: 'skill', source: 'user', untrusted: true }), cmd('c', { kind: 'skill' }), cmd('d', { kind: 'skill', untrusted: true }), cmd('e', { kind: 'skill', source: 7 }),
    ] })!.skills;
    expect(got).toEqual([
      { name: 'a', description: 'a words', source: 'bundled' }, { name: 'b', description: 'b words', source: 'user', untrusted: true },
      { name: 'c', description: 'c words' }, { name: 'd', description: 'd words' }, { name: 'e', description: 'e words' },
    ]);
  });
});
