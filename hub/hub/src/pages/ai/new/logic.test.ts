// New chat's choices, pure. The remembered choice fails closed to the first run; until the person picks an agent a new
// chat starts on the computer's configured default agent (General as shipped), never on a guess; product-owned agents
// are never offered; an agent's line follows its effective tools and never guesses; Claude Code only when ready; the
// default model is the free Hoody model, never an Anthropic one.
import { providers } from '@core';
import { describe, expect, it } from 'vitest';
import type { AgentRow } from '../agents/logic';
import type { CatalogTool } from '../agents/tools';
import type { ClaudeCode } from '../types';
import {
  FIRST, agentLine, agentName, approvalsStart, claudeReady, defaultAgent, defaultModel, folderChoices, folderName, folderOk, foldersOf, homeOf, linkedAgent, noModelReady, otherAgents, parseRemembered,
  pickFilterValues, pickRows, reconcileAgent, rememberedOf,
  acpWire, claudeView, parseAcpAgents, runsWithNow, startOptsOf, type Choices,
  modelName,
} from './logic';

const row = (name: string, o: Partial<AgentRow> = {}): AgentRow => ({
  name, description: '', path: '', provenance: 'shipped default (embedded)', provenanceRaw: 'shipped default (embedded)', productOwned: false, yours: false,
  model: '', effort: '', maxTurns: null, labels: [], tools: null, strict: false, mcpTools: null, skills: null, unknownTools: [], unknownSkills: [],
  missingVsDefault: [], isDefault: false, ...o,
});
const cat: CatalogTool[] = [
  { name: 'read_file', description: '', readOnly: true },
  { name: 'grep', description: '', readOnly: true },
  { name: 'bash', description: '', readOnly: false },
];
const claude = (o: Partial<ClaudeCode> = {}): ClaudeCode => ({
  state: 'signed_in', enabled: true, selected: false, startable: true, inUse: false, loginVerified: true, setupUser: null, installHint: null, loginHint: null, ...o,
} as ClaudeCode);

describe('remembered choice', () => {
  it('nothing stored, or anything malformed, is the first run: no agent picked, Default, Hoody models', () => {
    for (const raw of [null, undefined, 'x', 1, [], {}, { agent: { kind: 'chat' } }, { agent: 'chat', approvals: 'default', runsWith: 'hoody' }, { agent: 'nope', approvals: 'default', runsWith: 'hoody' },
      { agent: 'chat', approvals: 'always', runsWith: 'hoody' }, { agent: 'chat', approvals: 'default', runsWith: 'acp' },
      // an unmarked value always held an agent; a mark this Hub does not know is not read
      { approvals: 'default', runsWith: 'hoody' }, { agent: null, approvals: 'default', runsWith: 'hoody' }, { v: 3, agent: { kind: 'general' }, approvals: 'default', runsWith: 'hoody' },
      { v: 2, agent: { kind: 'chat' }, approvals: 'always', runsWith: 'hoody' }, { v: 2, agent: 'general', approvals: 'default', runsWith: 'hoody' }]) {
      expect(parseRemembered(raw)).toBe(FIRST);
    }
    expect(FIRST).toEqual({ v: 2, agent: null, approvals: 'default', runsWith: 'hoody' });
  });

  it('a stored choice round-trips; the folder and the model are never stored', () => {
    const c = { agent: { kind: 'other' as const, name: 'reviewer' }, approvals: 'strict' as const, runsWith: 'claude' as const };
    const stored = rememberedOf({ ...c, folder: '/srv/x', model: 'openai/gpt' } as never);
    expect(Object.keys(stored).sort()).toEqual(['agent', 'approvals', 'runsWith', 'v']);
    expect(parseRemembered(JSON.parse(JSON.stringify(stored)))).toEqual({ v: 2, ...c });
    expect(parseRemembered(rememberedOf({ agent: { kind: 'general' }, approvals: 'default', runsWith: 'hoody' }))).toEqual({ v: 2, agent: { kind: 'general' }, approvals: 'default', runsWith: 'hoody' });
  });

  it('no agent picked is stored as none, and a picked Just chat as a pick: both come back as stored', () => {
    const none = rememberedOf({ agent: null, approvals: 'strict', runsWith: 'hoody' });
    expect(none).toEqual({ v: 2, agent: null, approvals: 'strict', runsWith: 'hoody' });
    expect(parseRemembered(JSON.parse(JSON.stringify(none)))).toEqual(none);
    const chat = rememberedOf({ agent: { kind: 'chat' }, approvals: 'default', runsWith: 'hoody' });
    expect(parseRemembered(JSON.parse(JSON.stringify(chat)))).toEqual({ v: 2, agent: { kind: 'chat' }, approvals: 'default', runsWith: 'hoody' });
  });

  it('an unmarked value: its Just chat is not kept as a pick (and says so); General and a named agent stay picks; approvals and runs with carry over', () => {
    expect(parseRemembered({ agent: { kind: 'chat' }, approvals: 'strict', runsWith: 'claude' })).toEqual({ v: 2, agent: null, approvals: 'strict', runsWith: 'claude', chatDropped: true });
    expect(parseRemembered({ agent: { kind: 'general' }, approvals: 'default', runsWith: 'hoody' })).toEqual({ v: 2, agent: { kind: 'general' }, approvals: 'default', runsWith: 'hoody' });
    expect(parseRemembered({ agent: { kind: 'other', name: 'reviewer' }, approvals: 'default', runsWith: 'hoody' })).toEqual({ v: 2, agent: { kind: 'other', name: 'reviewer' }, approvals: 'default', runsWith: 'hoody' });
    // What is stored next never carries the note.
    expect(rememberedOf(parseRemembered({ agent: { kind: 'chat' }, approvals: 'strict', runsWith: 'claude' }))).toEqual({ v: 2, agent: null, approvals: 'strict', runsWith: 'claude' });
  });

  it('a stored product-owned agent, or chat/general spelled as another agent, is the first run', () => {
    for (const name of ['bot', 'script-writer', 'github-installer', 'chat', 'general', 'Bad Name', '']) {
      expect(parseRemembered({ agent: { kind: 'other', name }, approvals: 'default', runsWith: 'hoody' })).toBe(FIRST);
      expect(parseRemembered({ v: 2, agent: { kind: 'other', name }, approvals: 'default', runsWith: 'hoody' })).toBe(FIRST);
    }
  });

  it('agentName names the agent a create would send', () => {
    expect(agentName({ kind: 'chat' })).toBe('chat');
    expect(agentName({ kind: 'general' })).toBe('general');
    expect(agentName({ kind: 'other', name: 'reviewer' })).toBe('reviewer');
  });
});

describe('agents offered and their lines', () => {
  it('the other agents are the rest: never chat, general, bot, script-writer or any product-owned agent', () => {
    const rows = [row('chat'), row('general'), row('bot', { productOwned: true }), row('script-writer', { productOwned: true }), row('owned', { productOwned: true }),
      row('reviewer'), row('mine', { provenance: 'user', yours: true })];
    expect(otherAgents(rows).map((r) => r.name)).toEqual(['reviewer', 'mine']);
    // Even if the agent forgot to mark them product-owned.
    expect(otherAgents([row('bot'), row('script-writer')])).toEqual([]);
  });

  it('the line follows the effective tools: none, read-only, acting, Hoody default', () => {
    const rows = [row('chat', { tools: [] }), row('general'), row('ro', { tools: ['grep', 'read_file'], strict: true }), row('loose', { tools: ['grep'] }),
      row('sd', { strict: true })];
    expect(agentLine('chat', rows, cat, { failed: false })).toEqual({ kind: 'reach', reach: 'none', changed: false });
    expect(agentLine('general', rows, cat, { failed: false })).toEqual({ kind: 'reach', reach: 'acts', changed: false });
    expect(agentLine('ro', rows, cat, { failed: false })).toEqual({ kind: 'reach', reach: 'read', changed: false });
    // A list on an agent that is not strict is only a base: it may act.
    expect(agentLine('loose', rows, cat, { failed: false })).toEqual({ kind: 'reach', reach: 'acts', changed: false });
    expect(agentLine('sd', rows, cat, { failed: false })).toEqual({ kind: 'reach', reach: 'unknown', changed: false });
  });

  it('a chat someone gave a tool stops promising no tools and says it was changed', () => {
    const rows = [row('chat', { tools: ['bash'], strict: true, provenance: 'user', yours: true })];
    expect(agentLine('chat', rows, cat, { failed: false })).toEqual({ kind: 'reach', reach: 'acts', changed: true });
  });

  it('no line is guessed: loading, a failed read, a partial catalogue, a missing agent', () => {
    const rows = [row('chat', { tools: [] })];
    expect(agentLine('chat', undefined, cat, { failed: false })).toEqual({ kind: 'loading' });
    expect(agentLine('chat', rows, undefined, { failed: false })).toEqual({ kind: 'loading' });
    expect(agentLine('chat', rows, cat, { failed: true })).toEqual({ kind: 'unread' });
    expect(agentLine('chat', undefined, undefined, { failed: true })).toEqual({ kind: 'unread' });
    expect(agentLine('chat', rows, null, { failed: false })).toEqual({ kind: 'unread' });
    expect(agentLine('general', rows, cat, { failed: false })).toEqual({ kind: 'missing' });
  });
});

describe('the agent a new chat starts on', () => {
  const shipped = [row('chat', { tools: [] }), row('general', { isDefault: true }), row('reviewer'), row('bot', { productOwned: true })];

  it('with no pick: the computer\'s configured default, General as shipped', () => {
    expect(defaultAgent(shipped)).toEqual({ kind: 'general' });
    expect(defaultAgent([row('chat'), row('general'), row('reviewer', { isDefault: true })])).toEqual({ kind: 'other', name: 'reviewer' });
    expect(defaultAgent([row('chat', { isDefault: true }), row('general')])).toEqual({ kind: 'chat' });
  });

  it('General when the list is unread, marks none, marks two, or marks an agent New chat never offers', () => {
    expect(defaultAgent(undefined)).toEqual({ kind: 'general' });
    expect(defaultAgent([])).toEqual({ kind: 'general' });
    expect(defaultAgent([row('chat'), row('general'), row('reviewer')])).toEqual({ kind: 'general' });
    expect(defaultAgent([row('chat', { isDefault: true }), row('reviewer', { isDefault: true })])).toEqual({ kind: 'general' });
    expect(defaultAgent([row('general'), row('bot', { productOwned: true, isDefault: true })])).toEqual({ kind: 'general' });
    expect(defaultAgent([row('general'), row('script-writer', { isDefault: true })])).toEqual({ kind: 'general' });
  });

  it('a picked agent the computer no longer offers is no pick; an unread list keeps it', () => {
    const gone = { kind: 'other' as const, name: 'gone' };
    const kept = { kind: 'other' as const, name: 'reviewer' };
    expect(reconcileAgent(gone, shipped)).toBeNull();
    expect(reconcileAgent({ kind: 'other', name: 'bot' }, shipped)).toBeNull();
    expect(reconcileAgent(kept, shipped)).toBe(kept);
    expect(reconcileAgent(gone, undefined)).toBe(gone);
    expect(reconcileAgent({ kind: 'chat' }, [])).toEqual({ kind: 'chat' });
    expect(reconcileAgent({ kind: 'general' }, [])).toEqual({ kind: 'general' });
  });

  it('a link\'s agent: offered names pick it, others say why not', () => {
    expect(linkedAgent('reviewer', shipped)).toEqual({ pick: { kind: 'other', name: 'reviewer' }, note: null });
    expect(linkedAgent('chat', shipped)).toEqual({ pick: { kind: 'chat' }, note: null });
    expect(linkedAgent('gone', shipped)).toEqual({ pick: null, note: { kind: 'missing', name: 'gone' } });
    expect(linkedAgent('bot', shipped)).toEqual({ pick: null, note: { kind: 'missing', name: 'bot' } });
    expect(linkedAgent('Not A Name', shipped)).toEqual({ pick: null, note: { kind: 'bad' } });
  });
});

describe('the agent picker\'s rows', () => {
  const rows = [
    row('bot', { productOwned: true, provenance: 'product-owned (read-only)' }),
    row('chat', { tools: [], description: 'Answers in the chat.' }),
    row('folder-helper', { provenance: 'project', yours: true, tools: ['bash'] }),
    row('general', { isDefault: true, description: 'Works on this computer.' }),
    row('mine', { provenance: 'user', yours: true, tools: ['grep'], strict: true, model: 'openai/gpt-5' }),
    row('odd', { provenance: null, provenanceRaw: 'something new' }),
    row('reviewer', { strict: true, tools: ['read_file', 'grep'], provenance: 'user (shipped default)' }),
    row('sd', { strict: true }),
  ];

  it('General and Just chat first, then the other offered agents by name; product-owned agents are never listed', () => {
    expect(pickRows(rows, cat).map((r) => r.name)).toEqual(['general', 'chat', 'folder-helper', 'mine', 'odd', 'reviewer', 'sd']);
    expect(pickRows([row('reviewer'), row('bot')], cat).map((r) => r.name)).toEqual(['reviewer']);
    // A general or chat the agent marks product-owned is not offered either.
    expect(pickRows([row('general', { productOwned: true }), row('reviewer')], cat).map((r) => r.name)).toEqual(['reviewer']);
  });

  it('each row: the pick a press makes, its group, what it can do, its model, the default mark', () => {
    const by = Object.fromEntries(pickRows(rows, cat).map((r) => [r.name, r]));
    expect(by.general).toMatchObject({ pick: { kind: 'general' }, group: 'start', reach: 'acts', isDefault: true, model: '', description: 'Works on this computer.' });
    expect(by.chat).toMatchObject({ pick: { kind: 'chat' }, group: 'start', reach: 'none', changed: false, isDefault: false });
    expect(by.mine).toMatchObject({ pick: { kind: 'other', name: 'mine' }, group: 'yours', reach: 'read', yours: true, model: 'openai/gpt-5' });
    expect(by['folder-helper']).toMatchObject({ group: 'folder', reach: 'acts', yours: true });
    expect(by.reviewer).toMatchObject({ group: 'builtin', reach: 'read', yours: false });
    expect(by.sd).toMatchObject({ group: 'builtin', reach: 'unknown' });
    expect(by.odd).toMatchObject({ group: 'other' });
  });

  it('a chat someone changed says so and stops promising no tools', () => {
    const r = pickRows([row('chat', { tools: ['bash'], strict: true, provenance: 'user', yours: true })], cat)[0]!;
    expect(r).toMatchObject({ group: 'start', reach: 'acts', changed: true });
  });

  it('what an agent can do is not guessed: unknown while the catalogue is unread, failed or partial', () => {
    for (const c of [undefined, null]) expect(pickRows(rows, c).map((r) => r.reach)).toEqual([null, null, null, null, null, null, null]);
  });

  it('the filter matches a row on its reach and on Yours; a row whose reach is not known matches no reach', () => {
    const by = Object.fromEntries(pickRows(rows, cat).map((r) => [r.name, pickFilterValues(r)]));
    expect(by.general).toEqual(['acts']);
    expect(by.chat).toEqual(['none']);
    expect(by.mine).toEqual(['read', 'yours']);
    expect(by['folder-helper']).toEqual(['acts', 'yours']);
    expect(pickFilterValues(pickRows(rows, null).find((r) => r.name === 'mine')!)).toEqual(['yours']);
  });
});

describe('runs with and the model', () => {
  it('Claude Code only when installed, signed in, turned on and startable', () => {
    expect(claudeReady(claude())).toBe(true);
    expect(claudeReady(null)).toBe(false);
    for (const o of [{ state: 'signed_out' }, { state: 'unknown' }, { enabled: false }, { startable: false }, { state: 'not_installed' }] as Partial<ClaudeCode>[]) {
      expect(claudeReady(claude(o))).toBe(false);
    }
  });

  it('Claude Code: an unchecked state is unknown, never a setup problem; only a known state is "not ready"', () => {
    expect(claudeView(claude(), false)).toBe('ready');
    expect(claudeView(null, false)).toBe('checking');
    expect(claudeView(null, true)).toBe('unknown');
    for (const state of ['unknown', 'check_failed', 'sign_in_unknown'] as const) expect(claudeView(claude({ state }), false)).toBe('unknown');
    for (const state of ['not_installed', 'signed_out', 'outdated', 'unavailable'] as const) expect(claudeView(claude({ state }), false)).toBe('notReady');
  });

  it('a wanted Claude Code that cannot run here shows as Hoody models', () => {
    expect(runsWithNow('claude', claude())).toBe('claude');
    expect(runsWithNow('claude', null)).toBe('hoody');
    expect(runsWithNow('claude', claude({ state: 'signed_out' }))).toBe('hoody');
    expect(runsWithNow('hoody', claude())).toBe('hoody');
  });

  it('the default model is the free Hoody model, never an Anthropic one; Claude Code starts on its own default', () => {
    expect(defaultModel('hoody')).toBe('hoody-ai/hoody-free');
    expect(defaultModel('hoody').startsWith('anthropic/')).toBe(false);
    expect(defaultModel('claude')).toBe('');
  });

  it('no model ready only on a trusted ready list that names none', () => {
    const ev = (o: { am1?: boolean; readySpecs?: Record<string, 1> | null; state?: 'ok' | 'failed' }) =>
      ({
        catalogue: o.state === 'failed' ? { state: 'failed', err: providers.GONE } : { state: 'ok', value: { cat: { am1: o.am1 ?? true, readySpecs: o.readySpecs === undefined ? {} : o.readySpecs, bySpec: {}, byPrefix: {}, auth: {} } } },
        claude: null,
      }) as unknown as providers.Evidence;
    expect(noModelReady(ev({}))).toBe(true);
    expect(noModelReady(ev({ readySpecs: { 'hoody-ai/hoody-free': 1 } }))).toBe(false);
    expect(noModelReady(ev({ readySpecs: null }))).toBe(false);
    expect(noModelReady(ev({ am1: false }))).toBe(false);
    expect(noModelReady(ev({ state: 'failed' }))).toBe(false);
    expect(noModelReady(null)).toBe(false);
  });
});

describe('folders', () => {
  it('only absolute, valid folders', () => {
    expect(folderOk('/home/me/shop')).toBe(true);
    expect(folderOk('/')).toBe(true);
    for (const bad of ['', 'home/me', '~/shop', './x', '/a\nb', '/a\u0000', '/a\u007f', '/\uD800x', `/${'a'.repeat(4096)}`]) expect(folderOk(bad)).toBe(false);
  });

  it('the folders chats ran in, valid and once each, in order', () => {
    expect(folderChoices(['/srv/b', 'rel', '/srv/a', '/srv/b', '/x\ny'])).toEqual(['/srv/b', '/srv/a']);
    expect(folderName('/home/me/shop/')).toBe('shop');
    expect(folderName('/')).toBe('/');
  });

  it('the home folder is an absolute path the agent reported, else unknown (null), never \'\'', () => {
    expect(homeOf({ cwds: [], home: '/home/ada' })).toBe('/home/ada');
    // An older agent leaves it out; one that could not read it leaves it out too.
    expect(homeOf({ cwds: ['/srv/a'] })).toBeNull();
    for (const bad of ['', 'home/ada', null, 7, ['/home/ada'], '/a\nb']) expect(homeOf({ cwds: [], home: bad })).toBeNull();
    expect(homeOf(null)).toBeNull();
    // A home the Hub cannot read never makes the folders unreadable.
    expect(foldersOf({ cwds: ['/srv/a'], home: 'x' })).toEqual(['/srv/a']);
  });
});

describe('parseAcpAgents / acpWire: the classifier sees only parsed fields', () => {
  it('rebuilds the row from the parsed value: a field the parser does not read never reaches claudeOf', () => {
    const p = parseAcpAgents({ status: 'ok', report: { agents: [{ name: 'claude', installed: true, startable: true, logged_in: 'logged_in', enabled: true, extra: 'x', model: 'sonnet' }] } });
    expect(p).not.toBeNull();
    expect(acpWire(p!)).toEqual({ report: { agents: [{ name: 'claude', installed: true, enabled: true, startable: true, logged_in: 'logged_in', missing_launcher: false, login_verified: false }] } });
  });
  it('omitempty fields read as their zero value; no Claude Code row is { claude: null }', () => {
    expect(parseAcpAgents({ report: { agents: [{ name: 'claude', installed: false, startable: false, logged_in: 'unknown' }] } })?.claude).toMatchObject({ enabled: false, missingLauncher: false, loginVerified: false, installState: '', installHint: '' });
    expect(parseAcpAgents({ report: { agents: [{ name: 'codex', installed: true }] } })).toEqual({ claude: null });
    expect(acpWire({ claude: null })).toEqual({ report: { agents: [] } });
  });
  it('a value the agent never sends is unknown (null), even where the classifier would fall back the same way', () => {
    const r = { name: 'claude', installed: true, startable: true, logged_in: 'logged_in' };
    expect(parseAcpAgents({ report: { agents: [r] } })).not.toBeNull();
    for (const bad of [{ logged_in: 'yes' }, { logged_in: 'LOGGED_IN' }, { install_state: 'ready' }, { install_state: 'OK' }]) {
      expect(parseAcpAgents({ report: { agents: [{ ...r, ...bad }] } })).toBeNull();
    }
  });
});

describe('startOptsOf: what a start is handed', () => {
  const base: Choices = { agent: { kind: 'chat' }, folder: '', approvals: 'default', runsWith: 'hoody', model: providers.FREE };
  it('Just chat on the free Hoody model in the home folder, Default approvals', () => {
    expect(startOptsOf(base)).toEqual({ agent: 'chat', model: providers.FREE, strict: false });
  });
  it('General, another agent, Strict and a folder', () => {
    expect(startOptsOf({ ...base, agent: { kind: 'general' }, approvals: 'strict', folder: '/srv/shop' })).toEqual({ agent: 'general', model: providers.FREE, cwd: '/srv/shop', strict: true });
    expect(startOptsOf({ ...base, agent: { kind: 'other', name: 'reviewer' } })?.agent).toBe('reviewer');
  });
  it('Claude Code carries its model ("" = its default) and no Hoody model', () => {
    expect(startOptsOf({ ...base, runsWith: 'claude', model: '' })).toEqual({ agent: 'chat', claude: { model: '' }, strict: false });
    expect(startOptsOf({ ...base, runsWith: 'claude', model: 'claude-code/sonnet' })).toEqual({ agent: 'chat', claude: { model: 'claude-code/sonnet' }, strict: false });
  });
  it('nothing can start on a folder that is not one yet, or Hoody models without a model', () => {
    expect(startOptsOf({ ...base, folder: null })).toBeNull();
    expect(startOptsOf({ ...base, folder: 'srv/shop' })).toBeNull();
    expect(startOptsOf({ ...base, model: '' })).toBeNull();
  });
});

describe('modelName, the chip', () => {
  it('a Hoody AI spec with no name to show reads the word, never the spec', () => {
    expect(modelName(null, 'hoody-ai/upstream', 'A model')).toBe('A model');
    expect(modelName(null, 'hoody-ai/hoody-fast', 'A model')).toBe('hoody-fast');
    expect(modelName(null, 'openai/gpt-5', 'A model')).toBe('openai/gpt-5');
  });
});

describe('what a start does about approvals, as the page says it', () => {
  it('Strict is Strict whatever the place says', () => {
    for (const auto of ['on', 'off', 'none', 'unknown', undefined] as const) expect(approvalsStart('strict', auto)).toBe('strict');
  });
  it('Default follows what the start does: on is Allow everything, off or no switch asks, and anything else promises neither', () => {
    expect(approvalsStart('default', 'on')).toBe('everything');
    expect(approvalsStart('default', 'off')).toBe('asks');
    expect(approvalsStart('default', 'none')).toBe('asks');
    expect(approvalsStart('default', 'unknown')).toBe('unknown');
    expect(approvalsStart('default', undefined)).toBe('unknown');
  });
});
