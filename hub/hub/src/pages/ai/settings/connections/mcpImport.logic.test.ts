// The import's pure rules: the agent's preview read strictly (names of env and headers only: an entry carrying a value
// map, or anything that contradicts "imports land off", makes the whole preview unreadable); which previewed names are already
// in the list (case-insensitive: the agent compares names that way); what a fresh list must still show for the reviewed import
// to be sent; the size the agent takes; the import's answer. No list proves an import applied (mcpProved).
import { describe, expect, it } from 'vitest';
import {
  advisoriesOf, importBlocks, importDocProblem, importedOf, importPreviewOf, importStillReviewed, mcpProved, MAX_IMPORT_BYTES, sameLayerNames, seenOf,
  shapeOf, type McpList, type McpServer,
} from './mcp.logic';

const cmd = (o: Record<string, unknown> = {}) => ({ name: 'files', enabled: false, command: 'npx', args: ['-y', '@mcp/fs'], env_keys: ['ROOT'], ...o });
const web = (o: Record<string, unknown> = {}) => ({ name: 'docs', enabled: false, type: 'http', url: 'https://docs.example/mcp', header_keys: ['Authorization'], ...o });
const reply = (servers: unknown[], o: Record<string, unknown> = {}) => ({ status: 'ok', dialect: 'claude', servers, count: servers.length, warnings: [], ...o });
const without = (o: Record<string, unknown>, k: string) => { const c = { ...o }; delete c[k]; return c; };

const server = (o: Partial<McpServer> = {}): McpServer => ({
  name: 'pg', scope: 'user', transport: 'stdio', enabled: true, requireConfirmation: false, command: 'npx', args: [], url: null,
  envKeys: [], headerKeys: [], allowedTools: null, connected: true, toolCount: null, revoked: false, revokedReason: null, stderrTail: null, ...o,
});
const list = (servers: McpServer[], o: Partial<McpList> = {}): McpList => ({
  servers, unreadable: [], files: { user: { scope: 'user', path: '/p', exists: true, hash: 'h1' } }, warnings: [], realm: 'global', cwd: null, sid: 's1', ...o,
});

describe('MCP import: importPreviewOf', () => {
  it('reads a command server and an address server, names only', () => {
    const p = importPreviewOf(reply([cmd(), web()], { warnings: ['`${input:token}` was left literal'] }));
    expect(p).toEqual({
      dialect: 'claude',
      warnings: ['`${input:token}` was left literal'],
      servers: [
        { name: 'files', transport: 'stdio', command: 'npx', args: ['-y', '@mcp/fs'], url: null, envKeys: ['ROOT'], headerKeys: [] },
        { name: 'docs', transport: 'http', command: null, args: [], url: 'https://docs.example/mcp', envKeys: [], headerKeys: ['Authorization'] },
      ],
    });
  });

  it('a command server without a type is a command; one without args runs with none; an sse type is kept', () => {
    expect(importPreviewOf(reply([without(cmd(), 'args')]))!.servers[0]).toMatchObject({ transport: 'stdio', args: [] });
    expect(importPreviewOf(reply([cmd({ type: 'stdio' })]))!.servers[0]!.transport).toBe('stdio');
    expect(importPreviewOf(reply([web({ type: 'sse' })]))!.servers[0]!.transport).toBe('sse');
  });

  it.each([['streamable-http', 'http'], ['streamable', 'http'], ['url', 'http'], ['HTTP', 'http'], [' Sse ', 'sse'], ['STDIO', 'stdio']])('the type %s reads as the agent reads it (%s)', (type, want) => {
    const e = want === 'stdio' ? cmd({ type }) : web({ type });
    expect(importPreviewOf(reply([e]))!.servers[0]!.transport).toBe(want);
  });

  it('absent key lists are no keys (the agent writes them only for a map it had)', () => {
    expect(importPreviewOf(reply([without(cmd(), 'env_keys')]))!.servers[0]!.envKeys).toEqual([]);
  });

  const bad: [string, unknown][] = [
    ['not ok', { ...reply([cmd()]), status: 'error' }],
    ['no dialect', without(reply([cmd()]), 'dialect')],
    ['servers not a list', { ...reply([]), servers: {} }],
    ['count disagrees', { ...reply([cmd()]), count: 2 }],
    ['warnings not strings', reply([cmd()], { warnings: [1] })],
    ['an entry that is on (imports land off)', reply([cmd({ enabled: true })])],
    ['an entry without enabled', reply([without(cmd(), 'enabled')])],
    ['an env map (a value would be in it)', reply([cmd({ env: { ROOT: 'v' } })])],
    ['an Env map in another case', reply([cmd({ Env: { ROOT: 'v' } })])],
    ['a headers map', reply([web({ headers: { Authorization: 'v' } })])],
    ['a HEADERS map in another case', reply([web({ HEADERS: { Authorization: 'v' } })])],
    ['env_keys not strings', reply([cmd({ env_keys: [{ ROOT: 'v' }] })])],
    ['header_keys not strings', reply([web({ header_keys: 'Authorization' })])],
    ['no name', reply([without(cmd(), 'name')])],
    ['an unknown type', reply([web({ type: 'websocket' })])],
    ['a command server without a command', reply([without(cmd(), 'command')])],
    ['a command server with a url too', reply([cmd({ url: 'https://x.example' })])],
    ['an address server without a url', reply([without(web(), 'url')])],
    ['an address server with a command too', reply([web({ command: 'npx' })])],
    ['args not strings', reply([cmd({ args: ['-y', 2] })])],
    ['two names differing only in case', reply([cmd(), cmd({ name: 'FILES' })])],
  ];
  it.each(bad)('unreadable as a whole: %s', (_why, raw) => {
    expect(importPreviewOf(raw)).toBeNull();
  });

  it('carries no field the page does not show (an unknown key of the document never travels on)', () => {
    const p = importPreviewOf(reply([cmd({ auth: { token: 'hunter2' }, cwd: '/tmp' })]))!;
    expect(JSON.stringify(p)).not.toContain('hunter2');
  });
});

describe('MCP import: importBlocks and sameLayerNames', () => {
  it('refuses a name set in another layer, or in no stated layer: it would override the imported entry', () => {
    const l = list([server({ name: 'pg', scope: 'project' }), server({ name: 'odd', scope: null })]);
    expect(importBlocks([{ name: 'pg' }, { name: 'odd' }, { name: 'files' }], l, 'user')).toEqual([
      { kind: 'other_layer', name: 'pg', layer: 'project' },
      { kind: 'other_layer', name: 'odd', layer: null },
    ]);
  });
  it('a name saved in the layer written is no block (Replace decides), and is named as such', () => {
    const l = list([server({ name: 'pg', scope: 'user' })]);
    expect(importBlocks([{ name: 'pg' }], l, 'user')).toEqual([]);
    expect(sameLayerNames([{ name: 'pg' }, { name: 'files' }], l, 'user')).toEqual(['pg']);
  });
  it('refuses a name that differs only in case from a listed one (the writer matches names exactly)', () => {
    const l = list([server({ name: 'pg', scope: 'user' })]);
    expect(importBlocks([{ name: 'PG' }], l, 'user')).toEqual([{ kind: 'case', name: 'PG', existing: 'pg' }]);
    expect(sameLayerNames([{ name: 'PG' }], l, 'user')).toEqual([]);
  });
  it.each([['exact match first', ['pg', 'PG']], ['case-only match first', ['PG', 'pg']]])('every match in any case is checked (%s)', (_why, order) => {
    const l = list(order.map((n) => server({ name: n, scope: n === 'pg' ? 'user' : 'project' })));
    expect(importBlocks([{ name: 'pg' }], l, 'user')).toEqual([{ kind: 'case', name: 'pg', existing: 'PG' }]);
    expect(importBlocks([{ name: 'PG' }], l, 'project')).toEqual([{ kind: 'case', name: 'PG', existing: 'pg' }]);
  });
  it('an exact match in another layer and a case-only one are both named', () => {
    const l = list([server({ name: 'pg', scope: 'project' }), server({ name: 'Pg', scope: 'user' })]);
    expect(importBlocks([{ name: 'pg' }], l, 'user')).toEqual([{ kind: 'other_layer', name: 'pg', layer: 'project' }, { kind: 'case', name: 'pg', existing: 'Pg' }]);
  });
  it('an incomplete list blocks every import (a warning, or an entry it could not read)', () => {
    expect(importBlocks([{ name: 'files' }], list([], { warnings: ['skipped a layer'] }), 'user')).toEqual([{ kind: 'incomplete' }]);
    expect(importBlocks([{ name: 'files' }], list([], { unreadable: ['x'] }), 'user')).toEqual([{ kind: 'incomplete' }]);
  });
});

describe('MCP import: importStillReviewed binds the effective entries', () => {
  const pg = server({ name: 'pg', scope: 'user', enabled: false });
  const base = list([pg]);
  const r = { layers: { user: 'h1' }, names: ['files', 'pg'], seen: seenOf(['files', 'pg'], base) };
  it('records the effective entry of each previewed name, names only', () => {
    expect(r.seen).toEqual([{ name: 'pg', scope: 'user', shape: shapeOf(pg) }]);
  });
  const rows: [string, McpList, boolean][] = [
    ['the same entries', list([pg]), true],
    ['the entry turned on, every hash unchanged', list([{ ...pg, enabled: true }]), false],
    ['the entry now from another layer', list([{ ...pg, scope: 'project' }]), false],
    ['the entry re-pointed', list([{ ...pg, command: 'evil' }]), false],
    ['a previewed name appeared', list([pg, server({ name: 'files' })]), false],
    ['the same name in another case appeared', list([pg, server({ name: 'FILES' })]), false],
    ['the entry went', list([]), false],
    ['the written layer moved', list([pg], { files: { user: { scope: 'user', path: '/p', exists: true, hash: 'h2' } } }), false],
    ['another layer appeared', list([pg], { files: { user: { scope: 'user', path: '/p', exists: true, hash: 'h1' }, project: { scope: 'project', path: '/q', exists: true, hash: 'hp' } } }), false],
    ['a loader warning', list([pg], { warnings: ['skipped a layer'] }), false],
    ['an unreadable entry', list([pg], { unreadable: ['x'] }), false],
  ];
  it.each(rows)('%s', (_why, l, ok) => {
    expect(importStillReviewed(l, r)).toBe(ok);
  });
});

describe('MCP import: advisoriesOf, fixed words, never the agent text', () => {
  const names = ['files', 'docs'];
  it('maps each advisory the parser writes to a kind, keeping only a previewed name', () => {
    expect(advisoriesOf([
      'files: env.TOKEN references ${input:hunter2-value}, which hoody cannot resolve — it would expand to EMPTY; replace it with a value or a ${VAR} before enabling',
      'docs: url contains ${HOST_SECRET} — hoody expands ${…} only in env and headers, so it would be passed LITERALLY; replace it with the value before enabling',
      'files: envFile (/home/ada/.secret.env) is not supported — hoody does not read env files; move its variables into env before enabling',
      'the document declares VS Code inputs (token-id); hoody does not prompt for them — replace each ${input:…} reference with a value or a ${VAR} before enabling',
    ], names)).toEqual([
      { kind: 'unresolved', name: 'files' }, { kind: 'literal', name: 'docs' }, { kind: 'env_file', name: 'files' }, { kind: 'inputs', name: null },
    ]);
  });
  it('a name that is not a previewed server is dropped; anything unknown is one generic line; repeats merge', () => {
    const a = advisoriesOf([
      'stranger: env.X references ${input:a}, which hoody cannot resolve — it would expand to EMPTY; replace it',
      'files: env.A references ${input:a}, which hoody cannot resolve — it would expand to EMPTY; replace it',
      'files: env.B references ${input:b}, which hoody cannot resolve — it would expand to EMPTY; replace it',
      'something new with sk-live-value',
      'another new thing',
    ], names);
    expect(a).toEqual([{ kind: 'unresolved', name: null }, { kind: 'unresolved', name: 'files' }, { kind: 'other', name: null }]);
    expect(JSON.stringify(a)).not.toMatch(/sk-live|input:|stranger/);
  });
});

describe('MCP import: the document and the answer', () => {
  it('a paste that is not JSON, or carries the reserved name fields, is never previewed', () => {
    expect(importDocProblem('{"mcpServers": {')).toBe('not_json');
    expect(importDocProblem('// a comment\n{}')).toBe('not_json');
    expect(importDocProblem('['.repeat(200000))).toBe('not_json');
    expect(importDocProblem(JSON.stringify({ mcpServers: { a: { command: 'x', env: { T: 'v' }, env_keys: [] } } }))).toBe('reserved');
    expect(importDocProblem(JSON.stringify({ mcp_servers: [{ name: 'a', url: 'https://a.example', header_keys: ['X'] }] }))).toBe('reserved');
    expect(importDocProblem(JSON.stringify([{ deep: [{ deeper: { env_keys: 1 } }] }]))).toBe('reserved');
    // an environment variable that happens to be spelled in capitals is not the reserved field
    expect(importDocProblem(JSON.stringify({ mcpServers: { a: { command: 'x', env: { ENV_KEYS: 'v' } } } }))).toBeNull();
  });

  it('an empty paste or one over the agent limit is never sent', () => {
    expect(importDocProblem('  \n')).toBe('empty');
    const json = (n: number) => JSON.stringify('x'.repeat(n - 2));
    expect(importDocProblem(json(MAX_IMPORT_BYTES))).toBeNull();
    expect(importDocProblem(json(MAX_IMPORT_BYTES + 1))).toBe('too_big');
    // the agent counts bytes: two-byte characters reach the limit at half the length
    expect(importDocProblem(JSON.stringify('é'.repeat(MAX_IMPORT_BYTES / 2)))).toBe('too_big');
    expect(importDocProblem('{"mcpServers":{}}')).toBeNull();
  });

  it('reads the hash and the count of an import answer, else null', () => {
    expect(importedOf({ status: 'ok', hash: 'h2', imported: 2, servers: [], warnings: [] })).toEqual({ hash: 'h2', imported: 2 });
    expect(importedOf({ status: 'ok', hash: 'h2' })).toBeNull();
    expect(importedOf({ status: 'ok', hash: '', imported: 2 })).toBeNull();
    expect(importedOf({ status: 'ok', hash: 'h2', imported: -1 })).toBeNull();
    expect(importedOf({ status: 'ok', hash: 'h2', imported: 1.5 })).toBeNull();
    expect(importedOf({ status: 'error', hash: 'h2', imported: 2 })).toBeNull();
  });

  it('no list proves an import applied', () => {
    const identity = { computer: 'c1', realm: 'global', cwd: '', scope: 'user', op: 'import', name: '', expectHash: 'h1', layers: { user: 'h1' }, before: null, names: ['files'], replace: false };
    const l = list([server({ name: 'files', enabled: false })], { files: { user: { scope: 'user', path: '/p', exists: true, hash: 'h2' } } });
    expect(mcpProved(identity, [[l]])).toBeUndefined();
  });
});
