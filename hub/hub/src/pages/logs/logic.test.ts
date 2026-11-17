// Vitest: the view's URL mapping, the deep link from Computers, and the plain-word helpers.
import { describe, expect, it } from 'vitest';
import { SOURCE_IDS } from './rules';
import { DEFAULT_VIEW, MAIN, findLines, leadOf, filtersOff, hasViewParams, hrefFor, keptSearch, normalizeView, sameView, searchFromView, sourceHasVisitor, botRows, sourceItems, techGroups, techRows, titleOf, viewFromSearch, visitorOf, type DataItem } from './logic';
import { links, logsLinkFor } from './links';

describe('view and URL', () => {
  it('a bare /logs names no view, so it opens the default view', () => {
    expect(hasViewParams({})).toBe(false);
    expect(hasViewParams({ sel: 'k1' })).toBe(false);
    expect(hasViewParams({ src: 'bots' })).toBe(true);
  });

  it('the default view leaves the URL empty and round-trips', () => {
    expect(searchFromView(DEFAULT_VIEW)).toEqual({});
    expect(viewFromSearch({})).toEqual(DEFAULT_VIEW);
  });

  it('keeps a chosen view through the URL, all but its search text', () => {
    // A link's q still opens a search...
    const v = viewFromSearch({ src: 'visits', sev: 'failed', win: '24h', q: '/report' });
    expect(v).toMatchObject({ source: 'visits', severity: 'failed', window: '24h', search: '/report' });
    // ...but the URL a view writes never holds it: the data view keeps the text in memory.
    expect(searchFromView(v)).toEqual({ src: 'visits', sev: 'failed', win: '24h' });
    expect(searchFromView(v, { share: true })).not.toHaveProperty('q');
    expect(sameView(viewFromSearch(searchFromView(v)), { ...v, search: '' })).toBe(true);
  });

  it('an around window uses at= and a checked number', () => {
    expect(viewFromSearch({ at: '1700000000000' }).window).toEqual({ around: 1700000000000 });
    expect(viewFromSearch({ at: 'x' }).window).toBe('1h');
  });

  it('ignores values it does not know', () => {
    expect(viewFromSearch({ src: 'nope', sev: 'loud', win: '9y' })).toEqual(DEFAULT_VIEW);
  });

  it('a Computers deep link opens the program output', () => {
    const v = viewFromSearch({ computer: 'atlas.00a1', program: '2' });
    expect(v.source).toBe('programs');
    expect(v.program).toBe('2');
    expect(hasViewParams({ computer: 'atlas.00a1', program: '2' })).toBe(true);
  });

  it('a program is kept in the URL only on the Programs source', () => {
    expect(searchFromView({ ...DEFAULT_VIEW, source: 'programs', program: '2' })).toEqual({ src: 'programs', program: '2' });
    expect(searchFromView({ ...DEFAULT_VIEW, program: '2' })).toEqual({});
  });

  it('a shared link never carries search text, a run or a port', () => {
    const v = { ...DEFAULT_VIEW, search: 'secret-term', port: 8001, exec: 'run1' };
    expect(searchFromView(v, { share: true })).toEqual({});
  });

  it('a source that cannot search or take a severity loses them', () => {
    const n = normalizeView({ ...DEFAULT_VIEW, source: 'changes', severity: 'failed', search: 'x' });
    expect(n.severity).toBe('all');
    expect(n.search).toBe('');
  });

  it('builds hrefs without empty parameters', () => {
    expect(hrefFor('/logs', { src: 'bots', q: '', x: undefined })).toBe('/logs?src=bots');
    expect(hrefFor('/logs', {})).toBe('/logs');
  });

  it('links.ts builds the deep links other pages use', () => {
    expect(links.program('atlas.00a1', '2')).toBe('/logs?computer=atlas.00a1&program=2');
    expect(links.script('deploy-site.sh')).toBe('/logs?src=scripts&script=deploy-site.sh');
  });
});

describe('find in output', () => {
  it('keeps the lines holding the text, ignoring case, and all of them without text', () => {
    const lines = ['Error: boom', 'ok', 'another ERROR'];
    expect(findLines(lines, 'error')).toEqual(['Error: boom', 'another ERROR']);
    expect(findLines(lines, '  ')).toEqual(lines);
    expect(findLines(lines, 'zzz')).toEqual([]);
  });

  it('matches every word in any order, folding case and accents', () => {
    const lines = ['GET /api/users 200', 'POST /api/users 500', 'caf\u00e9 opened'];
    expect(findLines(lines, 'users get')).toEqual(['GET /api/users 200']);
    expect(findLines(lines, '500 post')).toEqual(['POST /api/users 500']);
    expect(findLines(lines, 'cafe')).toEqual(['caf\u00e9 opened']);
    expect(findLines(lines, 'users zzz')).toEqual([]);
  });
});

describe('logsLinkFor: every key survives the view', () => {
  const parse = (href: string) => viewFromSearch(Object.fromEntries(new URL(href, 'http://x').searchParams));
  it('script and run alone open the Scripts source and keep both', () => {
    const v = parse(logsLinkFor({ computer: 'atlas.00a1', script: 'orders/[id].ts', exec: 'run-1' }));
    expect(v).toMatchObject({ source: 'scripts', script: 'orders/[id].ts', exec: 'run-1' });
  });
  it('program, port, severity, window, search and source are kept', () => {
    expect(parse(logsLinkFor({ program: '2', port: 8001 }))).toMatchObject({ source: 'programs', program: '2', port: 8001 });
    expect(parse(logsLinkFor({ source: 'visits', severity: 'failed', window: '24h', search: 'a b' }))).toMatchObject({ source: 'visits', severity: 'failed', window: '24h', search: 'a b' });
  });
  it('names the computer for the page to read', () => {
    expect(logsLinkFor({ computer: 'atlas.00a1', severity: 'failed' })).toBe('/logs?computer=atlas.00a1&sev=failed');
  });
});

describe('keptSearch', () => {
  it('keeps hub=v3 and preview=1 and nothing else of the outer address', () => {
    expect(keptSearch('?hub=v3&preview=1&fxrealm=abc&theme=dark')).toBe('?hub=v3&preview=1');
    expect(keptSearch('?hub=v3')).toBe('?hub=v3');
    expect(keptSearch('?fxrealm=abc&hub=v2&preview=0')).toBe('');
    expect(keptSearch('')).toBe('');
  });
});

describe('one source control', () => {
  it('lists the main sources, and a More source while it is the chosen one', () => {
    expect(sourceItems('everything')).toEqual([...MAIN]);
    expect(sourceItems('visits')).toEqual([...MAIN]);
    expect(sourceItems('account')).toEqual([...MAIN, 'account']);
    expect(sourceItems('decisions')).toEqual([...MAIN, 'decisions']);
    expect(sourceItems('execVisits')).toEqual([...MAIN, 'execVisits']);
  });
  it('every source the URL or a saved view accepts is in the group exactly once', () => {
    for (const id of SOURCE_IDS) expect(sourceItems(id).filter((x) => x === id)).toHaveLength(1);
  });
  it('a view is off the defaults when any filter moved; a one-time run hand-off is not a filter', () => {
    expect(filtersOff(DEFAULT_VIEW)).toBe(false);
    expect(filtersOff({ ...DEFAULT_VIEW, exec: 'run0001' })).toBe(false);
    expect(filtersOff({ ...DEFAULT_VIEW, source: 'account' })).toBe(true);
    expect(filtersOff({ ...DEFAULT_VIEW, severity: 'failed' })).toBe(true);
    expect(filtersOff({ ...DEFAULT_VIEW, window: '24h' })).toBe(true);
    expect(filtersOff({ ...DEFAULT_VIEW, window: { around: 5 } })).toBe(true);
    expect(filtersOff({ ...DEFAULT_VIEW, search: 'x' })).toBe(true);
    expect(filtersOff({ ...DEFAULT_VIEW, source: 'programs', program: '3' })).toBe(true);
  });
});

describe('the Visitor column', () => {
  const item = (kind: DataItem['kind'], row: DataItem['row']): DataItem => ({ kind, k: 'x1', row, t: 0 });

  it('reads the address a proxy row or an account row carries, and nothing else', () => {
    expect(visitorOf(item('kit', { clientIp: '203.0.113.7' }))).toBe('203.0.113.7');
    expect(visitorOf(item('account', { ip_address: '198.51.100.2' }))).toBe('198.51.100.2');
    expect(visitorOf(item('account', { ip: '198.51.100.9' }))).toBe('198.51.100.9');
    expect(visitorOf(item('kit', {}))).toBe('');
    expect(visitorOf(item('kit', { clientIp: 7 as unknown as string }))).toBe('');
    // A row kind that never carries a visitor shows none, even when a field of that name is present.
    expect(visitorOf(item('helper', { clientIp: '203.0.113.7' }))).toBe('');
    expect(visitorOf(item('script', { clientIp: '203.0.113.7' }))).toBe('');
    expect(visitorOf(item('changes', { ip_address: '203.0.113.7' }))).toBe('');
  });

  it('exists for exactly the sources whose rows can carry an address', () => {
    const on = SOURCE_IDS.filter(sourceHasVisitor).sort();
    expect(on).toEqual(['account', 'bots', 'decisions', 'everything', 'execVisits', 'visits']);
    for (const off of ['changes', 'scripts', 'programs', 'helper'] as const) expect(sourceHasVisitor(off)).toBe(false);
  });
});

describe('the request lead of a list row', () => {
  const item = (kind: DataItem['kind'], row: DataItem['row']): DataItem => ({ kind, k: 'x1', row, t: 0 });

  it('reads method, status and path of a visit or an account row, and drops the query string and fragment', () => {
    expect(leadOf(item('kit', { method: 'GET', status: 429, url: '/files/a.txt' }))).toEqual({ method: 'GET', status: 429, path: '/files/a.txt' });
    expect(leadOf(item('kit', { method: 'POST', url: '/api/x?token_ref=abc&redirect=/y#frag' }))).toEqual({ method: 'POST', status: null, path: '/api/x' });
    expect(leadOf(item('kit', { method: 'GET', url: '/api/x#frag' }))).toEqual({ method: 'GET', status: null, path: '/api/x' });
    expect(leadOf(item('account', { method: 'DELETE', status_code: 204, path: '/users/auth/keys/1?x=1' }))).toEqual({ method: 'DELETE', status: 204, path: '/users/auth/keys/1' });
    expect(leadOf(item('kit', { method: 'GET', url: '/' + 'a'.repeat(300) }))?.path.length).toBe(200);
  });

  it('is null where a row names no request', () => {
    expect(leadOf(item('kit', { method: 'GET', url: '/bots/x', serviceName: 'bots' }))).toBeNull();
    expect(leadOf(item('kit', { method: 'GET', url: '/admin', source: 'backend' }))).toBeNull();
    expect(leadOf(item('kit', { method: 'GET', url: '/x', truncated: true }))).toBeNull();
    expect(leadOf(item('kit', { method: 'get', url: '/x' }))).toBeNull();
    expect(leadOf(item('kit', { method: 'GET' }))).toBeNull();
    expect(leadOf(item('kit', { method: 'GET', url: '?only=query' }))).toBeNull();
    for (const kind of ['changes', 'helper', 'script'] as const) expect(leadOf(item(kind, { method: 'GET', url: '/x', path: '/x' }))).toBeNull();
  });
});

describe('the technical details in two blocks', () => {
  const item = (kind: DataItem['kind'], row: DataItem['row']): DataItem => ({ kind, k: 'x1', row, t: 1_700_000_000_000 });
  const ID = 'a1b2c3d4e5f6a1b2c3d4e5f6';
  const rows: DataItem[] = [
    item('kit', { serviceName: 'files', serviceIndex: 2, method: 'GET', url: '/files/a.txt', status: 200, traceId: 'trace-1', clientIp: '203.0.113.7', level: 'info' }),
    item('account', { method: 'POST', path: '/users/auth/keys', status_code: 201, ip_address: '203.0.113.8' }),
    item('changes', { event_type: 'file.opened', resource_id: ID, resource_type: 'file' }),
    item('script', { path: '/run/x', method: 'POST', status: 500, executionId: 'exec-1', error: 'boom' }),
    item('helper', { level: 'warn', component: 'ai', message: 'slow' }),
  ];

  it('puts every row techRows returns in exactly one group, in techRows order', () => {
    for (const it of rows) {
      const flat = techGroups(it).flatMap((g) => g.rows);
      const all = techRows(it);
      expect(flat.map((r) => r.key).sort()).toEqual(all.map((r) => r.key).sort());
      expect(new Set(flat.map((r) => r.key)).size).toBe(flat.length);
      for (const g of techGroups(it)) {
        const at = g.rows.map((r) => all.findIndex((a) => a.key === r.key));
        expect(at).toEqual([...at].sort((a, b) => a - b));
      }
    }
  });

  it('keeps the request fields apart from the rest', () => {
    const [visit, account, change, script, helper] = rows.map((it) => Object.fromEntries(techGroups(it).map((g) => [g.id, g.rows.map((r) => r.key)])));
    expect(visit).toEqual({ request: ['time', 'address', 'method', 'status', 'request', 'ip', 'program'], details: ['level'] });
    expect(account).toEqual({ request: ['time', 'address', 'method', 'status', 'ip'] });
    expect(change).toEqual({ request: ['time'], details: ['event', 'item', 'kind'] });
    expect(script).toEqual({ request: ['time', 'address', 'method', 'status', 'exec'], details: ['error'] });
    expect(helper).toEqual({ request: ['time'], details: ['level', 'part', 'message'] });
  });
});

describe('the Bot call facts of the Inspector', () => {
  const bot = (data: Record<string, unknown>, extra: DataItem['row'] = {}): DataItem => ({ kind: 'kit', k: 'b1', t: 1_700_000_000_000, row: { serviceName: 'bots', method: 'POST', url: '/bots/x', status: 200, traceId: 'trace-1', data, ...extra } });
  const ID = 'a1b2c3d4e5f6a1b2c3d4e5f6';

  it('reads only the allowlisted keys of a Bot row and flattens the limit', () => {
    const it = bot({ bot_door: 'chat', bot_caller_name: 'Ada', bot_caller: ID, bot_exposure: 'public', bot_result: 'failed', bot_limit: { scope: 'bot', kind: 'daily', max: 200, retry_at: '2026-10-31T00:00:00Z', extra: 'x' }, bot_label: 'Support', other: 'never', secret_note: 'never' });
    expect(botRows(it)).toEqual([
      { key: 'door', value: 'chat' }, { key: 'caller', value: 'Ada' }, { key: 'bot_url', value: 'public' }, { key: 'result', value: 'failed' },
      { key: 'limit_scope', value: 'bot' }, { key: 'limit_kind', value: 'daily' }, { key: 'limit_max', value: '200' }, { key: 'limit_retry', value: '2026-10-31T00:00:00Z' },
    ]);
  });

  it('shows a caller id as an id, a scalar limit as one fact, and nothing nested', () => {
    expect(botRows(bot({ bot_caller: ID }))).toEqual([{ key: 'caller', value: ID, id: true }]);
    expect(botRows(bot({ bot_caller: 'someone' }))).toEqual([{ key: 'caller', value: 'someone' }]);
    expect(botRows(bot({ bot_limit: 'daily' }))).toEqual([{ key: 'limit', value: 'daily' }]);
    expect(botRows(bot({ bot_door: { a: 1 }, bot_result: ['x'], bot_limit: [1] }))).toEqual([]);
  });

  it('scrubs and cuts each value', () => {
    const rows = botRows(bot({ bot_door: 'Bearer abcdefghijklmnopqrstuvwxyz0123456789', bot_result: 'x'.repeat(500) }));
    expect(rows.find((r) => r.key === 'door')?.value).not.toContain('abcdefghijklmnopqrstuvwxyz0123456789');
    expect(rows.find((r) => r.key === 'result')?.value.length).toBe(200);
  });

  it('is empty for every other row, and the Bot block sits between Request and Details', () => {
    expect(botRows({ kind: 'kit', k: 'v', t: 0, row: { serviceName: 'files', data: { bot_door: 'chat' } } })).toEqual([]);
    expect(botRows(bot({ bot_door: 'chat' }, { source: 'backend' }))).toEqual([]);
    expect(botRows({ kind: 'account', k: 'a', t: 0, row: { data: { bot_door: 'chat' } } })).toEqual([]);
    expect(techGroups(bot({ bot_door: 'chat' }, { level: 'info' })).map((g) => g.id)).toEqual(['request', 'bot', 'details']);
    expect(techGroups(bot({})).map((g) => g.id)).toEqual(['request']);
  });
});

describe('titleOf: a change names known abbreviations in capitals', () => {
  const item = (event_type: string): DataItem => ({ kind: 'changes', k: 'c1', row: { event_type }, t: 0 });
  const t = (k: string) => k;
  it('ssh_key.replaced reads "SSH key replaced"; other words keep sentence case', () => {
    expect(titleOf(item('ssh_key.replaced'), t)).toBe('SSH key replaced');
    expect(titleOf(item('api_token.created'), t)).toBe('API token created');
    expect(titleOf(item('computer.started'), t)).toBe('Computer started');
    expect(titleOf(item('realm.assigned'), t)).toBe('Realm assigned');
  });
});
