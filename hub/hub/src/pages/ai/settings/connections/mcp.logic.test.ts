// The MCP servers' pure rules: one strict reading of an entry (a missing or malformed field is Invalid, never a default); a
// list holds names only; what a change sends (a typed value only for the name it sets, null to remove one, nothing for a kept
// one, saved arguments byte for byte while untouched); which saved names a re-point clears, whatever the transport; and what
// one fresh list proves about a change whose answer was lost (applied, notApplied or unknown; core is told applied only).
import { describe, expect, it } from 'vitest';
import {
  clearedBy, decodeServer, draftArgs, draftProblem, effectOf, isInvalid, listOf, looksLikeCredential, mcpProved, nameProblem, proveWrite,
  layersOf, reconnectOf, repoints, sameLayers, serverBody, shapeAfter, shapeOf, stillReviewed, toolModeOf, toolNamesOf, toolsBody, toolsLocked, toolsProblem,
  type Draft, type McpList, type McpServer, type Proof, type WriteIntent,
} from './mcp.logic';

const place = { realm: 'global', cwd: null, sid: 's1' };
const entry = (o: Record<string, unknown> = {}) => ({
  name: 'pg', scope: 'user', transport: 'stdio', enabled: true, require_confirmation: false, connected: true, command: 'npx', args: ['-y', '@mcp/pg'],
  env_keys: ['PGPASSWORD'], header_keys: [], tool_count: 4, ...o,
});
const addr = (o: Record<string, unknown> = {}) => ({
  name: 'linear', scope: 'user', transport: 'http', enabled: false, require_confirmation: false, connected: false, url: 'https://mcp.linear.app/mcp',
  env_keys: [], header_keys: ['Authorization'], ...o,
});
const files = [{ scope: 'user', path: '/home/ada/.hoody/settings.json', exists: true, hash: 'h-user' }];
const raw = (servers: unknown[], f: unknown[] = files, w: unknown = []) => ({ status: 'ok', servers, files: f, warnings: w });
const without = (o: Record<string, unknown>, k: string) => { const c = { ...o }; delete c[k]; return c; };

const server = (o: Partial<McpServer> = {}): McpServer => ({
  name: 'pg', scope: 'user', transport: 'stdio', enabled: true, requireConfirmation: false, command: 'npx', args: ['-y', '@mcp/pg'], url: null,
  envKeys: ['PGPASSWORD'], headerKeys: [], allowedTools: null, connected: true, toolCount: 4, revoked: false, revokedReason: null, stderrTail: null, ...o,
});
const list = (servers: McpServer[], hash = 'h-new', o: Partial<McpList> = {}): McpList => ({
  servers, unreadable: [], files: { user: { scope: 'user', path: '/p', exists: true, hash } }, warnings: [], realm: 'global', cwd: null, sid: 's1', ...o,
});
const draft = (o: Partial<Draft> = {}): Draft => ({
  name: 'pg', transport: 'stdio', command: 'npx', args: '-y\n@mcp/pg', origArgs: null, argsEdited: false, url: '', requireConfirmation: false, env: [], headers: [], tools: 'all', toolNames: '', toolsEdited: false, ...o,
});
const edit = (s: McpServer, o: Partial<Draft> = {}): Draft => draft({
  name: s.name, transport: s.transport, command: s.command ?? '', args: s.args.join('\n'), origArgs: [...s.args], url: s.url ?? '',
  requireConfirmation: s.requireConfirmation, env: s.envKeys.map((name) => ({ name, kind: 'kept' as const })),
  headers: s.headerKeys.map((name) => ({ name, kind: 'kept' as const })), tools: toolModeOf(s.allowedTools), toolNames: (s.allowedTools ?? []).join('\n'), toolsEdited: false, ...o,
});

describe('decodeServer: one strict reading, Invalid never a default', () => {
  it('reads a command entry and an address entry whole', () => {
    expect(decodeServer(entry())).toMatchObject({ name: 'pg', scope: 'user', command: 'npx', args: ['-y', '@mcp/pg'], envKeys: ['PGPASSWORD'], connected: true, toolCount: 4 });
    expect(decodeServer(addr())).toMatchObject({ name: 'linear', transport: 'http', url: 'https://mcp.linear.app/mcp', headerKeys: ['Authorization'], toolCount: null });
  });
  it.each([
    ['env_keys missing', without(entry(), 'env_keys')],
    ['header_keys missing', without(entry(), 'header_keys')],
    ['args missing on a command', without(entry(), 'args')],
    ['command missing on a command', without(entry(), 'command')],
    ['url missing on an address', without(addr(), 'url')],
    ['require_confirmation missing', without(entry(), 'require_confirmation')],
    ['require_confirmation not a boolean', entry({ require_confirmation: 'yes' })],
    ['enabled missing', without(entry(), 'enabled')],
    ['connected missing', without(entry(), 'connected')],
    ['scope missing', without(entry(), 'scope')],
    ['transport unknown', entry({ transport: 'ws' })],
    ['env_keys not a list of names', entry({ env_keys: 'PGPASSWORD' })],
    ['args with a number', entry({ args: ['-y', 1] })],
    ['allowed_tools malformed', entry({ allowed_tools: 'all' })],
    ['tool_count negative', entry({ tool_count: -1 })],
    ['revoked not a boolean', entry({ revoked: 'no' })],
    ['enabled not a boolean', entry({ enabled: 1 })],
    ['connected not a boolean', entry({ connected: 'true' })],
    ['scope not a string', entry({ scope: 1 })],
    ['header_keys not a list of names', addr({ header_keys: [1] })],
    ['command empty', entry({ command: '' })],
    ['url empty', addr({ url: '' })],
    ['allowed_tools with a number', entry({ allowed_tools: ['query', 2] })],
    ['tool_count not a whole number', entry({ tool_count: 1.5 })],
    ['revoked_reason not a string', entry({ revoked: true, revoked_reason: 3 })],
    ['stderr_tail not a string', entry({ stderr_tail: ['x'] })],
    ['a command entry that also names a url (contradiction)', entry({ url: 'https://h' })],
    ['an address entry that also names a command (contradiction)', addr({ command: 'npx' })],
    ['an address entry that also carries args (contradiction)', addr({ args: [] })],
  ])('%s is Invalid, keeping its name', (_why, x) => {
    const d = decodeServer(x);
    expect(isInvalid(d)).toBe(true);
    expect(d).toEqual({ invalid: true, name: (x as { name?: string }).name ?? null });
  });
  it('an entry without a readable name is Invalid with no name', () => {
    expect(decodeServer(entry({ name: '' }))).toEqual({ invalid: true, name: null });
    expect(decodeServer(null)).toEqual({ invalid: true, name: null });
  });
  it('an empty scope is a readable entry with no layer (read only); any other string is Invalid, never "no layer"', () => {
    expect((decodeServer(entry({ scope: '' })) as McpServer).scope).toBeNull();
    for (const sc of ['team', 'User', ' user', 'managed']) expect(decodeServer(entry({ scope: sc }))).toEqual({ invalid: true, name: 'pg' });
  });
});

describe('listOf', () => {
  it('keeps unreadable entries apart, by name', () => {
    const l = listOf(raw([entry(), without(addr(), 'url')]), place)!;
    expect(l.servers.map((s) => s.name)).toEqual(['pg']);
    expect(l.unreadable).toEqual(['linear']);
    expect(l.files.user?.hash).toBe('h-user');
  });
  it('is null when the answer itself cannot be read: status, a file, or the warnings', () => {
    expect(listOf(raw([entry()], [{ scope: 'user', path: '/p', exists: true, hash: '' }]), place)).toBeNull();
    expect(listOf(raw([entry()], [{ scope: 'user', path: '/p', hash: 'h' }]), place)).toBeNull();
    expect(listOf({ status: 'error', servers: [], files: [] }, place)).toBeNull();
    expect(listOf({ status: 'ok', servers: [entry()], files }, place)).toBeNull();
    expect(listOf(raw([entry()], files, [1]), place)).toBeNull();
    expect(listOf({ status: 'ok', servers: {}, files, warnings: [] }, place)).toBeNull();
    expect(listOf({ status: 'ok', servers: [], files: {}, warnings: [] }, place)).toBeNull();
    expect(listOf(raw([entry()], [{ scope: 'team', path: '/p', exists: true, hash: 'h' }]), place)).toBeNull();
    expect(listOf(raw([entry()], [{ scope: 'user', path: 1, exists: true, hash: 'h' }]), place)).toBeNull();
  });
  it('is null when the answer contradicts itself: a name twice (readable or not), or a layer twice', () => {
    expect(listOf(raw([entry(), entry({ scope: 'project' })]), place)).toBeNull();
    expect(listOf(raw([entry(), without(entry(), 'args')]), place)).toBeNull();
    expect(listOf(raw([entry()], [...files, { ...files[0], hash: 'h-other' }]), place)).toBeNull();
    expect(listOf(raw([entry(), without(entry({ name: '' }), 'args'), without(addr({ name: '' }), 'url')]), place)?.unreadable).toEqual([null, null]);
  });
});

describe('reconnectOf: the reconnect answer read at the boundary', () => {
  const ok = (o: Record<string, unknown> = {}) => ({
    status: 'ok', sessions: 2, revoked: 0, partial_sessions: 0, deferred_sessions: 1, deferred_started: true, servers: [], warnings: [], ...o,
  });
  it.each([
    ['other chats queued in the background', ok(), { partial: 0, deferred: 1, started: true }],
    // Class 3: the agent skipped the background pass (its slots were busy): kept, so it is never read as completed.
    ['other chats skipped', ok({ deferred_started: false }), { partial: 0, deferred: 1, started: false }],
    ['a layer that did not load', ok({ partial_sessions: 1, warnings: ['settings.json: bad json'] }), { partial: 1, deferred: 1, started: true }],
    ['nothing deferred', ok({ sessions: 1, deferred_sessions: 0, deferred_started: false }), { partial: 0, deferred: 0, started: false }],
    ['status not ok', ok({ status: 'error' }), null],
    ['sessions missing', without(ok(), 'sessions'), null],
    ['partial_sessions missing', without(ok(), 'partial_sessions'), null],
    ['partial_sessions not a whole number', ok({ partial_sessions: '1' }), null],
    ['revoked missing', without(ok(), 'revoked'), null],
    ['deferred_sessions negative', ok({ deferred_sessions: -1 }), null],
    ['deferred_started not a boolean', ok({ deferred_started: 'yes' }), null],
    ['servers missing', without(ok(), 'servers'), null],
    ['warnings malformed', ok({ warnings: [1] }), null],
    ['more sessions deferred than visited (contradiction)', ok({ sessions: 1, deferred_sessions: 2 }), null],
    ['not an object', [ok()], null],
  ])('%s', (_why, x, want) => {
    expect(reconnectOf(x)).toEqual(want);
  });
});

describe('layers: every hash a merged entry depends on', () => {
  it('a list gives each listed layer its hash; two captures match only when every layer does', () => {
    const l = list([], 'h1', { files: { user: { scope: 'user', path: '/u', exists: true, hash: 'h1' }, local: { scope: 'local', path: '/l', exists: false, hash: 'l1' } } });
    expect(layersOf(l)).toEqual({ user: 'h1', local: 'l1' });
    expect(sameLayers({ user: 'h1', local: 'l1' }, layersOf(l))).toBe(true);
    expect(sameLayers({ user: 'h1' }, layersOf(l))).toBe(false);
    expect(sameLayers({ user: 'h1', local: 'l1', project: 'p1' }, layersOf(l))).toBe(false);
    expect(sameLayers({ user: 'h1', local: 'l2' }, layersOf(l))).toBe(false);
  });
});

describe('what a server does', () => {
  it('a command names the command line, an address names its host', () => {
    expect(effectOf(server())).toEqual({ kind: 'runs', command: 'npx -y @mcp/pg' });
    expect(effectOf(server({ transport: 'http', command: null, args: [], url: 'https://mcp.linear.app/sse?x=1' }))).toEqual({ kind: 'sends', host: 'mcp.linear.app' });
    expect(effectOf(server({ transport: 'sse', command: null, url: 'ftp://x' }))).toEqual({ kind: 'unknown' });
  });
  it('warns about a credential typed into an address or an argument', () => {
    expect(looksLikeCredential({ url: 'https://h/mcp?token=abc', args: [] })).toBe(true);
    expect(looksLikeCredential({ url: 'https://ada:pw@h/mcp', args: [] })).toBe(true);
    expect(looksLikeCredential({ url: null, args: ['--api-key=sk-123'] })).toBe(true);
    expect(looksLikeCredential({ url: null, args: ['ghp_abcdefghijkl'] })).toBe(true);
    expect(looksLikeCredential({ url: 'https://h/mcp?page=1', args: ['-y', '@mcp/pg'] })).toBe(false);
  });
});

describe('what a change sends', () => {
  it('a new server sends a typed value for the name it sets and is on', () => {
    const b = serverBody(draft({ env: [{ name: 'PGPASSWORD', kind: 'set', value: 'hunter2' }] }), null);
    expect(b).toEqual({ name: 'pg', type: 'stdio', command: 'npx', args: ['-y', '@mcp/pg'], require_confirmation: false, env: { PGPASSWORD: 'hunter2' }, enabled: true });
  });
  it('an edit leaves a kept name out, removes one with null, and never sends enabled', () => {
    const b = serverBody(draft({ env: [{ name: 'A', kind: 'kept' }, { name: 'B', kind: 'removed' }, { name: 'C', kind: 'set', value: 'v' }] }), server());
    expect(b.env).toEqual({ B: null, C: 'v' });
    expect('enabled' in b).toBe(false);
  });
  it('an address server sends headers, never env', () => {
    const b = serverBody(draft({ transport: 'http', url: ' https://h/mcp ', headers: [{ name: 'Authorization', kind: 'set', value: 'Bearer x' }] }), null);
    expect(b).toMatchObject({ type: 'http', url: 'https://h/mcp', headers: { Authorization: 'Bearer x' } });
    expect('env' in b || 'command' in b).toBe(false);
  });
  it('saved arguments go back byte for byte until the person edits them; an untouched edit is no re-point', () => {
    const odd = server({ args: ['', ' padded ', 'two\nlines'] });
    const d = edit(odd, { requireConfirmation: true });
    expect(draftArgs(d)).toEqual(['', ' padded ', 'two\nlines']);
    expect(serverBody(d, odd).args).toEqual(['', ' padded ', 'two\nlines']);
    expect(repoints(odd, d)).toBe(false);
    expect(clearedBy(odd, d)).toEqual({ env: [], headers: [] });
    expect(draftArgs({ ...d, args: 'a\n b ', argsEdited: true })).toEqual(['a', 'b']);
  });
  it('a change of what runs or where it sends is a re-point; restating it is not', () => {
    expect(repoints(server(), edit(server()))).toBe(false);
    expect(repoints(server(), edit(server(), { args: '-y\n@mcp/other', argsEdited: true }))).toBe(true);
    expect(repoints(server(), edit(server(), { command: 'node' }))).toBe(true);
    expect(repoints(server(), edit(server(), { transport: 'http', url: 'https://h' }))).toBe(true);
  });
  it('a re-point clears every saved name the write does not set again, env and header names kept apart, either transport', () => {
    const both = server({ envKeys: ['PGPASSWORD'], headerKeys: ['X-Key'] });
    expect(clearedBy(both, edit(both, { command: 'node' }))).toEqual({ env: ['PGPASSWORD'], headers: ['X-Key'] });
    expect(clearedBy(server(), edit(server(), { transport: 'http', url: 'https://h' }))).toEqual({ env: ['PGPASSWORD'], headers: [] });
    const web = server({ transport: 'http', command: null, args: [], url: 'https://h', envKeys: [], headerKeys: ['Authorization'] });
    expect(clearedBy(web, edit(web, { transport: 'stdio', command: 'npx' }))).toEqual({ env: [], headers: ['Authorization'] });
    expect(clearedBy(both, edit(both, { command: 'node', env: [{ name: 'PGPASSWORD', kind: 'set', value: 'v' }] }))).toEqual({ env: [], headers: ['X-Key'] });
    // A header set again counts whatever its case; an env name only exactly, and never across maps (a command sends env only).
    expect(clearedBy(web, edit(web, { url: 'https://other', headers: [{ name: 'authorization', kind: 'set', value: 'v' }] }))).toEqual({ env: [], headers: [] });
    const envOnly = server({ envKeys: ['Token'] });
    expect(clearedBy(envOnly, edit(envOnly, { command: 'node', env: [{ name: 'TOKEN', kind: 'set', value: 'v' }] }))).toEqual({ env: ['Token'], headers: [] });
    const sameName = server({ envKeys: [], headerKeys: ['X-Key'] });
    expect(clearedBy(sameName, edit(sameName, { command: 'node', env: [{ name: 'X_Key', kind: 'set', value: 'v' }] }))).toEqual({ env: [], headers: ['X-Key'] });
    expect(clearedBy(null, draft())).toEqual({ env: [], headers: [] });
  });
  it('every accepted name is its own key in the request, __proto__ included, set or removed, env or headers', () => {
    const setEnv = serverBody(draft({ env: [{ name: '__proto__', kind: 'set', value: 'v' }] }), null);
    expect(Object.keys(setEnv.env as object)).toEqual(['__proto__']);
    expect(JSON.parse(JSON.stringify(setEnv)).env).toEqual(JSON.parse('{"__proto__":"v"}'));
    const rmEnv = serverBody(draft({ env: [{ name: '__proto__', kind: 'removed' }] }), server());
    expect(JSON.stringify(rmEnv.env)).toBe('{"__proto__":null}');
    const hdr = serverBody(draft({ transport: 'http', url: 'https://h', headers: [{ name: '__proto__', kind: 'set', value: 'v' }, { name: 'constructor', kind: 'removed' }] }), server());
    expect(JSON.stringify(hdr.headers)).toBe('{"__proto__":"v","constructor":null}');
  });
  it('checks names before anything is sent', () => {
    expect(nameProblem('', [])).toBe('empty');
    expect(nameProblem('a__b', [])).toBe('chars');
    expect(nameProblem('Hoody', [])).toBe('reserved');
    expect(nameProblem('PG', ['pg'])).toBe('taken');
    expect(draftProblem(draft({ command: ' ' }), [], false)).toBe('command');
    expect(draftProblem(draft({ transport: 'http', url: 'mcp.example' }), [], false)).toBe('url');
    expect(draftProblem(draft({ env: [{ name: '1X', kind: 'set', value: '' }] }), [], false)).toBe('env_key');
    expect(draftProblem(draft({ transport: 'http', url: 'https://h', headers: [{ name: 'X-A', kind: 'kept' }, { name: 'x-a', kind: 'set', value: '' }] }), [], false)).toBe('duplicate_key');
    // forms-required, "MCP server add/edit dialog": a header the agent keeps for itself (400 bad_request) is named here first.
    for (const name of ['Accept', 'content-type', 'Last-Event-ID', 'MCP-Protocol-Version', 'Mcp-Session-Id', 'mcp-x']) {
      expect(draftProblem(draft({ transport: 'http', url: 'https://h', headers: [{ name, kind: 'set', value: 'v' }] }), [], false)).toBe('header_reserved');
    }
    expect(draftProblem(draft({ transport: 'sse', url: 'https://h', headers: [{ name: 'Accept', kind: 'set', value: 'v' }] }), [], false)).toBe('header_reserved');
    // Names the agent takes are never held back, and an env name is not a header.
    for (const name of ['Authorization', 'X-Api-Key', 'Accept-Language', 'Mcpx', 'X-Mcp-Key']) {
      expect(draftProblem(draft({ transport: 'http', url: 'https://h', headers: [{ name, kind: 'set', value: 'v' }] }), [], false)).toBeNull();
    }
    expect(draftProblem(draft({ env: [{ name: 'ACCEPT', kind: 'set', value: 'v' }] }), [], false)).toBeNull();
  });
});

describe('proveWrite: one fresh list judged against what the person reviewed', () => {
  const base = { computer: 'c1', realm: 'global', cwd: '', scope: 'user' as const, name: 'pg', expectHash: 'h-old', layers: { user: 'h-old' } };
  const proj = (hash: string) => ({ project: { scope: 'project' as const, path: '/pp', exists: true, hash } });
  const twoLayers = (servers: McpServer[], userHash: string, projectHash: string): McpList =>
    list(servers, userHash, { files: { ...list([], userHash).files, ...proj(projectHash) } });
  const was = shapeOf(server());
  const newArgs = edit(server(), { args: '-y\n@mcp/pg@2', argsEdited: true });
  const up: WriteIntent = { ...base, op: 'upsert', before: was, shape: shapeAfter(newArgs, server()), setsValues: false };
  // A re-point: the agent clears the saved names the write does not set again.
  const shown = server({ args: ['-y', '@mcp/pg@2'], envKeys: [] });
  const add: WriteIntent = { ...base, op: 'upsert', before: null, shape: shapeAfter(draft({ name: 'pg' }), null), setsValues: false };
  const del: WriteIntent = { ...base, op: 'delete', before: was };
  const off: WriteIntent = { ...base, op: 'set_enabled', before: was, enabled: false };
  const warned = (l: McpList) => ({ ...l, warnings: ['dropped server "pg": bad args'] });
  const partial = (l: McpList) => ({ ...l, unreadable: ['other'] });
  // The list shows an entry's last declaring layer, not which layer supplied each field or
  // which top-level key the loader read, so no list proves any op applied; only an unchanged layer hash reads notApplied.
  const rows: [string, WriteIntent, McpList, Proof][] = [
    ['upsert shown as asked under a new hash', up, list([shown]), 'unknown'],
    ['an add shown as asked', add, list([server({ envKeys: [] })]), 'unknown'],
    // Class 1: a proof binds to the merged entry and every layer it is merged from.
    ['an add shown off (it asked for on)', add, list([server({ envKeys: [], enabled: false })]), 'unknown'],
    ['upsert shown as asked, but another layer changed too', { ...up, layers: { user: 'h-old', project: 'p-old' } }, twoLayers([shown], 'h-new', 'p-new'), 'unknown'],
    ['upsert shown as asked, another layer unchanged', { ...up, layers: { user: 'h-old', project: 'p-old' } }, twoLayers([shown], 'h-new', 'p-old'), 'unknown'],
    ['upsert shown as asked, a layer appeared that was not reviewed', up, twoLayers([shown], 'h-new', 'p-new'), 'unknown'],
    ['upsert shown as asked, a reviewed layer is no longer listed', { ...up, layers: { user: 'h-old', project: 'p-old' } }, list([shown]), 'unknown'],
    ['turn off shown off, but another layer changed', { ...off, layers: { user: 'h-old', project: 'p-old' } }, twoLayers([server({ enabled: false })], 'h-new', 'p-new'), 'unknown'],
    ['delete gone, but another layer changed', { ...del, layers: { user: 'h-old', project: 'p-old' } }, twoLayers([], 'h-new', 'p-new'), 'unknown'],
    ['upsert, same hash', up, list([server()], 'h-old'), 'notApplied'],
    ['upsert, entry unchanged under an unrelated new hash', up, list([server()]), 'unknown'],
    ['upsert shown from another layer', up, list([server({ ...shown, scope: 'project' })]), 'unknown'],
    ['upsert, another realm', up, list([shown], 'h-new', { realm: 'aaaaaaaaaaaaaaaaaaaaaaa1' }), 'unknown'],
    ['upsert, another folder', up, list([shown], 'h-new', { cwd: '/home/ada/shop' }), 'unknown'],
    ['upsert, a loader warning', up, warned(list([shown])), 'unknown'],
    ['upsert, an unreadable entry', up, partial(list([shown])), 'unknown'],
    ['upsert that sets a credential value, shown with its name', { ...up, setsValues: true }, list([shown]), 'unknown'],
    ['upsert that changes nothing visible (a value only)', { ...up, shape: was, setsValues: false }, list([server()]), 'unknown'],
    ['delete, gone', del, list([]), 'unknown'],
    ['delete with no reviewed entry, gone', { ...del, before: null }, list([]), 'unknown'],
    ['delete, a lower layer of the same name shows', { ...del, scope: 'project', layers: { project: 'h-old' } }, list([server({ scope: 'user' })], 'h-new', { files: { project: { scope: 'project', path: '/p', exists: true, hash: 'h-new' } } }), 'unknown'],
    ['delete, same hash', del, list([], 'h-old'), 'notApplied'],
    ['delete, still there', del, list([server()]), 'unknown'],
    ['delete, a higher layer hides it', del, list([server({ scope: 'project' })]), 'unknown'],
    ['delete, the loader dropped the entry with a warning', del, warned(list([])), 'unknown'],
    ['delete, an unreadable entry of that name', del, { ...list([]), unreadable: ['pg'] }, 'unknown'],
    // The list cannot show which layer declares the state (fields merge across layers, and a top-level key no hash
    // covers merges too), so a state shown is never a proof.
    ['turn off, shown off', off, list([server({ enabled: false })]), 'unknown'],
    ['turn on, shown on', { ...off, before: { ...was, enabled: false }, enabled: true }, list([server()]), 'unknown'],
    ['turn off, still on under a new hash', off, list([server()]), 'unknown'],
    ['turn off, reviewed already off', { ...off, before: { ...was, enabled: false } }, list([server({ enabled: false })]), 'unknown'],
    ['turn off, same hash', off, list([server()], 'h-old'), 'notApplied'],
    ['turn off, a warning', off, warned(list([server({ enabled: false })])), 'unknown'],
  ];
  it.each(rows)('%s', (_why, intent, l, want) => {
    expect(proveWrite(intent, l)).toBe(want);
  });
  it('core is told applied only: notApplied and unknown free nothing', () => {
    // no list proves a change (the list cannot show a layer's own bytes), so core is never told applied
    expect(mcpProved(up, [[list([shown])]])).toBeUndefined();
    expect(mcpProved(del, [[list([])]])).toBeUndefined();
    expect(mcpProved(add, [[list([server({ envKeys: [] })])]])).toBeUndefined();
    expect(mcpProved(up, [[list([server()], 'h-old')]])).toBeUndefined();
    expect(mcpProved(up, [[list([server()])]])).toBeUndefined();
    expect(mcpProved({ ...up, expectHash: '' }, [[list([shown])]])).toBeUndefined();
    // The layers travel with the held change: missing, malformed, or not agreeing with its own hash, nothing is proved.
    expect(mcpProved({ ...up, layers: undefined }, [[list([shown])]])).toBeUndefined();
    expect(mcpProved({ ...up, layers: { user: 'h-other' } }, [[list([shown])]])).toBeUndefined();
    expect(mcpProved({ ...up, layers: { user: 'h-old', team: 'x' } }, [[list([shown])]])).toBeUndefined();
    expect(mcpProved({ ...up, layers: { user: 'h-old', project: '' } }, [[list([shown])]])).toBeUndefined();
    expect(mcpProved({ ...up, shape: undefined }, [[list([shown])]])).toBeUndefined();
    expect(mcpProved(null, [[list([shown])]])).toBeUndefined();
  });
});

describe('stillReviewed: a fresh list still shows what the person reviewed', () => {
  const layers = { user: 'h-new' };
  const seen = { layers, name: 'pg', before: shapeOf(server()), from: 'user' as const };
  const rows: [string, Parameters<typeof stillReviewed>[1], McpList, boolean][] = [
    ['the same entry, the same layers', seen, list([server()]), true],
    ['a loader warning', seen, { ...list([server()]), warnings: ['project settings: unsupported version'] }, false],
    ['an unreadable entry (another name)', seen, { ...list([server()]), unreadable: ['other'] }, false],
    ['a layer hash changed', seen, list([server()], 'h-other'), false],
    ['the entry is gone', seen, list([]), false],
    ['the entry comes from another layer now', seen, list([server({ scope: 'project' })]), false],
    ['the arguments differ (same hashes)', seen, list([server({ args: ['B'] })]), false],
    ['the command differs', seen, list([server({ command: 'node' })]), false],
    ['the transport and address differ', seen, list([server({ transport: 'http', command: null, args: [], url: 'https://x.example/mcp' })]), false],
    ['an env name differs', seen, list([server({ envKeys: ['OTHER'] })]), false],
    ['a header name appears', seen, list([server({ headerKeys: ['Authorization'] })]), false],
    ['the confirmation differs', seen, list([server({ requireConfirmation: true })]), false],
    ['the state differs', seen, list([server({ enabled: false })]), false],
    ['runtime facts only differ (connected, tools)', seen, list([server({ connected: false, toolCount: null })]), true],
    ['an add: still no entry of that name', { ...seen, before: null, from: null }, list([server({ name: 'other' })]), true],
    ['an add: an entry of that name appeared', { ...seen, before: null, from: null }, list([server()]), false],
  ];
  it.each(rows)('%s', (_why, r, l, want) => {
    expect(stillReviewed(l, r)).toBe(want);
  });
});

// Absent allowed_tools is every tool, an empty list is none; the two never meet. The agent keeps a
// saved list that a write leaves out and refuses null, so a restricted server cannot go back to every tool from here.
describe('the tools a server gives agents: no list, a list, an empty list', () => {
  it('a saved entry reads as all (no list), none (empty list) or only (names)', () => {
    expect(toolModeOf(null)).toBe('all');
    expect(toolModeOf([])).toBe('none');
    expect(toolModeOf(['query'])).toBe('only');
    expect((decodeServer(entry({ allowed_tools: [] })) as McpServer).allowedTools).toEqual([]);
    expect((decodeServer(entry()) as McpServer).allowedTools).toBeNull();
  });
  it('typed names: one per line (a comma is part of a name), trimmed, blanks dropped, each once in the order typed', () => {
    expect(toolNamesOf(' query \n\nlist_tables\r\nquery\ndescribe ')).toEqual(['query', 'list_tables', 'describe']);
    expect(toolNamesOf(' \n \r\n')).toEqual([]);
    expect(toolNamesOf('a,b\nc')).toEqual(['a,b', 'c']);
  });
  it('a new server: every tool sends no allowed_tools at all; none sends []; only sends the names', () => {
    expect('allowed_tools' in serverBody(draft(), null)).toBe(false);
    expect(serverBody(draft({ tools: 'none', toolNames: 'query' }), null).allowed_tools).toEqual([]);
    expect(serverBody(draft({ tools: 'only', toolNames: 'query\nlist_tables' }), null).allowed_tools).toEqual(['query', 'list_tables']);
  });
  it('an edit sends a list only when it changes the saved one: unrestricted and left at every tool, or the same names in any order, sends none', () => {
    const open = server();
    expect('allowed_tools' in serverBody(edit(open), open)).toBe(false);
    const some = server({ allowedTools: ['query', 'list_tables'] });
    expect('allowed_tools' in serverBody(edit(some), some)).toBe(false);
    expect('allowed_tools' in serverBody(edit(some, { toolNames: 'list_tables\nquery', toolsEdited: true }), some)).toBe(false);
    expect(serverBody(edit(some, { toolNames: 'query', toolsEdited: true }), some).allowed_tools).toEqual(['query']);
    expect(serverBody(edit(some, { tools: 'none', toolsEdited: true }), some).allowed_tools).toEqual([]);
    const none = server({ allowedTools: [] });
    expect('allowed_tools' in serverBody(edit(none), none)).toBe(false);
    expect(serverBody(edit(none, { tools: 'only', toolNames: 'query', toolsEdited: true }), none).allowed_tools).toEqual(['query']);
    expect(serverBody(edit(open, { tools: 'none', toolsEdited: true }), open).allowed_tools).toEqual([]);
    expect(toolsBody(edit(open, { tools: 'only', toolNames: 'query', toolsEdited: true }), open)).toEqual(['query']);
  });
  it('never sends null; an "only" with no name is refused before anything is sent (the dialog sends nothing while a problem stands)', () => {
    const some = server({ allowedTools: ['query'] });
    for (const d of [draft(), draft({ tools: 'none', toolsEdited: true }), draft({ tools: 'only', toolNames: 'query', toolsEdited: true })]) {
      expect(serverBody(d, some).allowed_tools === null).toBe(false);
      expect(serverBody(d, null).allowed_tools === null).toBe(false);
    }
    for (const typed of ['', ' \n ', '\r\n\n']) {
      expect(toolsProblem(draft({ tools: 'only', toolNames: typed }), null)).toBe('tools_empty');
      expect(toolsProblem(draft({ tools: 'only', toolNames: typed, toolsEdited: true }), some)).toBe('tools_empty');
    }
  });
  it('a restricted server cannot be set back to every tool here: tools_locked; an unrestricted or new one can', () => {
    expect(toolsLocked(server({ allowedTools: ['query'] }))).toBe(true);
    expect(toolsLocked(server({ allowedTools: [] }))).toBe(true);
    expect(toolsLocked(server())).toBe(false);
    expect(toolsLocked(null)).toBe(false);
    expect(toolsProblem(draft({ tools: 'all', toolsEdited: true }), server({ allowedTools: [] }))).toBe('tools_locked');
    expect(toolsProblem(draft({ tools: 'all' }), server())).toBeNull();
    expect(toolsProblem(draft({ tools: 'all' }), null)).toBeNull();
  });
  it('a name with a space or a control character, or over 128 characters, is refused before anything is sent', () => {
    expect(toolsProblem(draft({ tools: 'only', toolNames: 'list tables' }), null)).toBe('tool_name');
    expect(toolsProblem(draft({ tools: 'only', toolNames: 'q\u0007' }), null)).toBe('tool_name');
    expect(toolsProblem(draft({ tools: 'only', toolNames: 'x'.repeat(129) }), null)).toBe('tool_name');
    expect(toolsProblem(draft({ tools: 'only', toolNames: 'x'.repeat(128) }), null)).toBeNull();
  });
  // A control character anywhere on a line is refused before trimming (a trailing vertical tab must never be trimmed away
  // and sent bare), C1 included (U+0080..U+009F); only the line break itself separates names.
  it('a control character is refused wherever it stands on the line, C0, DEL and C1 alike, never trimmed away', () => {
    for (const typed of ['q\u000b', '\u000bq', 'q\t', '\tq', 'q\u0080', 'q\u009f', 'q\u007f', 'a\nq\u0085'])
      expect(toolsProblem(draft({ tools: 'only', toolNames: typed }), null)).toBe('tool_name');
    expect(toolsProblem(draft({ tools: 'only', toolNames: ' query \r\nlist_tables ' }), null)).toBeNull();
  });
  // An edit that never touches the tools keeps the saved list exactly: the agent matches raw names and the list is
  // part of the server's identity, so a saved "a,b" must not become "a" and "b", and saved duplicates must not be collapsed.
  it('an edit that leaves the tools alone sends no list and asks nothing of the saved names, whatever they hold', () => {
    for (const saved of [['a,b'], ['query', 'query'], ['list tables'], ['q\u0007']]) {
      const s = server({ allowedTools: saved });
      const d = edit(s, { command: 'npx2' });
      expect('allowed_tools' in serverBody(d, s)).toBe(false);
      expect(toolsProblem(d, s)).toBeNull();
      expect(shapeAfter(d, s).allowedTools).toEqual([...saved].sort());
    }
    const s = server({ allowedTools: ['a,b'] });
    expect(serverBody(edit(s, { toolNames: 'a,b', toolsEdited: true }), s).allowed_tools).toBeUndefined();
    expect(serverBody(edit(s, { toolNames: 'a,b\nc', toolsEdited: true }), s).allowed_tools).toEqual(['a,b', 'c']);
  });
  it('the shape holds the allow-list, so a confirm closes when only the list changed meanwhile, and shapeAfter is what the agent will hold', () => {
    const some = server({ allowedTools: ['query', 'list_tables'] });
    expect(shapeOf(some).allowedTools).toEqual(['list_tables', 'query']);
    expect(shapeOf(server()).allowedTools).toBeNull();
    const seen = { layers: { user: 'h-new' }, name: 'pg', before: shapeOf(some), from: 'user' as const };
    expect(stillReviewed(list([some]), seen)).toBe(true);
    expect(stillReviewed(list([server({ allowedTools: ['query'] })]), seen)).toBe(false);
    expect(stillReviewed(list([server({ allowedTools: null })]), seen)).toBe(false);
    expect(shapeAfter(edit(some), some).allowedTools).toEqual(['list_tables', 'query']);
    expect(shapeAfter(edit(some, { tools: 'none', toolsEdited: true }), some).allowedTools).toEqual([]);
    expect(shapeAfter(edit(some, { tools: 'none' }), some).allowedTools).toEqual(['list_tables', 'query']); // untouched: the saved list stays
    expect(shapeAfter(draft(), null).allowedTools).toBeNull();
    expect(shapeAfter(draft({ tools: 'only', toolNames: 'b\na' }), null).allowedTools).toEqual(['a', 'b']);
  });
});
