// The agent's answers read strictly, what each feature row may offer, and what a fresh read proves about a sent change.
import { describe, expect, it } from 'vitest';
import { featureProved, featuresOf, featureView, whereOf } from './features.logic';

const row = (name: string, value: boolean, writable: boolean, extra: Record<string, unknown> = {}) => ({ name, value, default: true, set: false, writable, ...extra });
const ALL = [row('read_agents_md', true, true), row('read_claude_md', false, true), row('account_rotation', true, true), row('hooks_agent_self_trust', false, false)];

describe('featuresOf', () => {
  it('keeps the agent\'s order and each value', () => {
    expect(featuresOf({ features: ALL })).toEqual([
      { name: 'read_agents_md', value: true, writable: true },
      { name: 'read_claude_md', value: false, writable: true },
      { name: 'account_rotation', value: true, writable: true },
      { name: 'hooks_agent_self_trust', value: false, writable: false },
    ]);
  });
  it('writable only when the Hub allows the name AND the agent says so', () => {
    const f = featuresOf({ features: [row('hooks_agent_self_trust', true, true), row('account_rotation', true, false)] })!;
    expect(f.find((x) => x.name === 'hooks_agent_self_trust')!.writable).toBe(false);
    expect(f.find((x) => x.name === 'account_rotation')!.writable).toBe(false);
  });
  it('drops a name the Hub does not know, never shows it', () => {
    expect(featuresOf({ features: [...ALL, row('show_thinking', true, true)] })!.map((x) => x.name)).not.toContain('show_thinking');
  });
  it.each([
    ['no features', {}],
    ['features not a list', { features: {} }],
    ['a row not an object', { features: [...ALL, 3] }],
    ['a name not a string', { features: [row('read_agents_md', true, true, { name: 5 })] }],
    ['a value not a boolean', { features: [row('read_agents_md', true, true, { value: 'true' })] }],
    ['writable not a boolean', { features: [row('read_agents_md', true, true, { writable: 1 })] }],
    ['a known name twice', { features: [...ALL, row('read_claude_md', true, true)] }],
    ['not an object', null],
  ])('fails the read on %s', (_n, raw) => {
    expect(featuresOf(raw)).toBeNull();
  });
});

describe('whereOf', () => {
  it('reads both lists and the hidden count', () => {
    expect(whereOf({ allowed_directories: ['/srv/data'], deny_paths: ['/etc/secrets'], deny_paths_hidden: 2 })).toEqual({ allowed: ['/srv/data'], deny: ['/etc/secrets'], hidden: 2 });
    expect(whereOf({ allowed_directories: [], deny_paths: [], deny_paths_hidden: 0 })).toEqual({ allowed: [], deny: [], hidden: 0 });
  });
  it.each([
    ['allowed missing', { deny_paths: [], deny_paths_hidden: 0 }],
    ['deny missing', { allowed_directories: [], deny_paths_hidden: 0 }],
    ['hidden missing', { allowed_directories: [], deny_paths: [] }],
    ['a path not a string', { allowed_directories: [1], deny_paths: [], deny_paths_hidden: 0 }],
    ['an empty path', { allowed_directories: [], deny_paths: [''], deny_paths_hidden: 0 }],
    ['hidden negative', { allowed_directories: [], deny_paths: [], deny_paths_hidden: -1 }],
    ['hidden not whole', { allowed_directories: [], deny_paths: [], deny_paths_hidden: 1.5 }],
    ['null', null],
  ])('fails the read on %s', (_n, raw) => {
    expect(whereOf(raw)).toBeNull();
  });
});

describe('featureView: the CLAUDE.md / AGENTS.md switches reach only Global-realm chats', () => {
  const f = (name: 'read_agents_md' | 'read_claude_md' | 'account_rotation' | 'hooks_agent_self_trust', writable = true) => ({ name, value: true, writable });
  it('Global: every writable feature is a switch', () => {
    for (const n of ['read_agents_md', 'read_claude_md', 'account_rotation'] as const) expect(featureView(f(n), 'global')).toBe('switch');
  });
  it('another realm or All realms: CLAUDE.md / AGENTS.md show no value and no switch; account rotation stays a switch', () => {
    for (const realm of ['0123456789abcdef01234567', 'all']) {
      expect(featureView(f('read_agents_md'), realm)).toBe('perRealm');
      expect(featureView(f('read_claude_md'), realm)).toBe('perRealm');
      expect(featureView(f('account_rotation'), realm)).toBe('switch');
    }
  });
  it('a feature the agent does not let the Hub change shows its value only', () => {
    expect(featureView(f('hooks_agent_self_trust', false), 'global')).toBe('value');
    expect(featureView(f('account_rotation', false), 'global')).toBe('value');
    expect(featureView(f('read_claude_md', false), 'global')).toBe('value');
  });
});

describe('featureProved', () => {
  const answers = (rows: unknown) => [[rows]] as const;
  const id = { computer: 'c1', name: 'read_claude_md', value: false };
  it('applied when a fresh read shows the value sent', () => {
    expect(featureProved(id, answers(featuresOf({ features: ALL })))).toBe('applied');
  });
  it('proves nothing when it shows the other value: the agent reads the file without the lock its write waits on, so the change may still save', () => {
    expect(featureProved({ ...id, value: true }, answers(featuresOf({ features: ALL })))).toBeUndefined();
  });
  it('proves nothing without the row, without a read, or with a malformed identity', () => {
    expect(featureProved(id, answers([]))).toBeUndefined();
    expect(featureProved(id, [[]])).toBeUndefined();
    expect(featureProved(id, [])).toBeUndefined();
    expect(featureProved({ name: 'read_claude_md' }, answers(featuresOf({ features: ALL })))).toBeUndefined();
  });
});
