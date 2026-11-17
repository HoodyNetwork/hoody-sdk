// Vitest: the scripts page's rules and its interaction in the fixture states.
import { describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent, within } from '@app/testing';
import { agentRealmFor, instanceOf, REDACTED, addressOk, addressProblem, approval, approvalHolds, aliasesFor, changesOf, createPreview, deleteBlock, deletePreview, diff, extract, header, instantiateBody, isRootRel, keyProven, logsHref, normRel, pathFor, presetOf, probeRoute, resendNeedsConfirm, riskOf, routeOf, settleDelay, settleView, shareCheck, splitKey, statusOf, suggestAddress, verdictOf, withKey, withoutKey, writable } from './logic';
import { mask, scrubAll, unmask, newKey, checkPersist, detectLiterals, isSensitiveName } from './secrets';
import page from './page';
import strings from './strings.en.json';

const KEY = newKey((n) => new Uint8Array(n).fill(7));
const R = 'default/1/';

describe('paths and routes', () => {
  it('normalises like the kit and refuses escapes', () => {
    expect(normRel('/default//1/a.ts')).toBeNull();
    expect(normRel('./default/1/a.ts')).toBe('default/1/a.ts');
    expect(normRel('default/1/../x')).toBeNull();
    expect(normRel('a\\b')).toBeNull();
    expect(isRootRel('default/1/a.ts')).toBe(true);
    expect(isRootRel('default/1/')).toBe(false);
    expect(isRootRel('other/a.ts')).toBe(false);
  });
  it('maps files to addresses and probes dynamic ones', () => {
    expect(routeOf(`${R}index.ts`)).toBe('/');
    expect(routeOf(`${R}orders/index.ts`)).toBe('/orders');
    expect(routeOf(`${R}orders/[id].ts`)).toBe('/orders/[id]');
    expect(probeRoute(`${R}orders/[id].ts`)).toBe('/orders/hub-probe');
    expect(probeRoute(`${R}a/[[...rest]].ts`)).toBe('/a/hub-probe');
  });
  it('accepts only static addresses the Hub may create', () => {
    expect(addressOk('/weather')).toBe(true);
    expect(addressOk('/api/v1/x')).toBe(false);
    expect(addressOk('/a/index')).toBe(false);
    expect(addressOk('/a/[id]')).toBe(false);
    expect(addressOk('/_hoody/x')).toBe(false);
    // hoody-exec strips a final .js/.ts from the URL before matching, so /foo.js is /foo: the file
    // pathFor would write (foo.js.ts) never answers it, and the write's route guard refuses every deploy.
    for (const r of ['/foo.js', '/foo.ts', '/a/b.JS', '/x.Ts']) expect(addressOk(r), r).toBe(false);
    expect(pathFor('/foo.js')).toBeNull();
    expect(addressOk('/foo.json')).toBe(true);
    expect(addressOk('/v1.ts/x')).toBe(true);
    // pre/post are hoody-exec's middleware basenames (exact case): pre.ts never
    // answers /pre, and would run as middleware for the scripts beside it.
    for (const r of ['/pre', '/post', '/a/pre', '/a/b/post']) expect(addressOk(r), r).toBe(false);
    expect(pathFor('/a/post')).toBeNull();
    for (const r of ['/Pre', '/POST', '/pre/x', '/preview', '/post-it']) expect(addressOk(r), r).toBe(true);
    // hoody-exec answers these itself before any script runs (/favicon.ico, /openapi.json, /openapi.yaml exactly;
    // any path ending .md is a doc or a 404), so a script there would never be called.
    for (const r of ['/favicon.ico', '/openapi.json', '/openapi.yaml', '/notes.md', '/a/foo.system.md', '/_system.md']) expect(addressOk(r), r).toBe(false);
    for (const r of ['/a/favicon.ico', '/a/openapi.json', '/Favicon.ico', '/openapi.yml', '/notes.MD', '/md', '/notes-md']) expect(addressOk(r), r).toBe(true);
    // Nearby addresses hoody-exec does route to a script: other case, another segment after, or a longer name.
    for (const r of ['/OPENAPI.JSON', '/OpenAPI.yaml', '/favicon.ico/x', '/openapi.json/v1', '/notes.md/x', '/favicon.icon', '/openapi.jsonx', '/readme.mdx']) expect(addressOk(r), r).toBe(true);
    expect(pathFor('/notes.md')).toBeNull();
    expect(pathFor('/openapi.yaml')).toBeNull();
    expect(pathFor('/notes.md/x')).toBe(`${R}notes.md/x.ts`);
    // The words shown: 'chars' for shape or characters, 'reserved' for a well-formed address no script can answer.
    for (const r of ['', '/', 'x', '/bad path', '/a//b', '/a/..', '/é']) expect(addressProblem(r), r).toBe('chars');
    for (const r of ['/api/v1/x', '/a/node_modules/b', '/index', '/pre', '/a/post', '/foo.js', '/x.TS', '/favicon.ico', '/openapi.yaml', '/notes.md']) expect(addressProblem(r), r).toBe('reserved');
    for (const r of ['/weather', '/favicon.ico/x', '/notes.MD']) expect(addressProblem(r), r).toBeNull();
    expect(pathFor('/weather')).toBe(`${R}weather.ts`);
    expect(pathFor('/weather', 'js')).toBe(`${R}weather.js`);
  });
  it('suggests a plain address and avoids taken ones and secrets', () => {
    expect(suggestAddress('Send me the weather for a city', [])).toBe('/send-weather-city');
    expect(suggestAddress('weather', ['/weather'])).toBe('/weather-2');
    expect(suggestAddress('', [])).toBe('/my-script');
    expect(suggestAddress('use sk-abcdef0123456789abcd now', [], ['sk-abcdef0123456789abcd'])).not.toContain('sk-');
  });
});

describe('route previews', () => {
  it('free, general and taken', () => {
    expect(createPreview({ matched: false }).state).toBe('free');
    expect(createPreview({ matched: true, type: 'fallback', scriptPath: 'x' }).state).toBe('general');
    expect(createPreview({ matched: true, type: 'static', scriptPath: `${R}a.ts` }).state).toBe('taken');
    expect(createPreview({ matched: true, type: 'static', scriptPath: 'outside/a.ts' }).state).toBe('general');
  });
  it('delete preview never trusts an answer that still names the script', () => {
    expect(deletePreview({ matched: false }, `${R}a.ts`).state).toBe('stops');
    expect(deletePreview({ matched: true, scriptPath: `${R}a.ts`, type: 'static' }, `${R}a.ts`).state).toBe('self');
  });
  it('a link check needs the script itself to answer, not a fallback', () => {
    expect(shareCheck('/a', { matched: true, type: 'static', scriptPath: `${R}a.ts` }, `${R}a.ts`)).toBe(true);
    expect(shareCheck('/a', { matched: true, type: 'fallback', scriptPath: `${R}a.ts` }, `${R}a.ts`)).toBe(false);
    expect(shareCheck('/a?x=1', { matched: true, type: 'static', scriptPath: `${R}a.ts` }, `${R}a.ts`)).toBe(false);
  });
  it('lists the links that open a script and skips path-override ones', () => {
    const rows = [
      { id: '1', url: 'u1', target_path: '/orders/42' },
      { id: '2', url: 'u2', target_path: '/orders/7?x=1' },
      { id: '3', url: 'u3', target_path: '/orders/9', allow_path_override: true },
      { id: '4', url: 'u4', target_path: '/health' },
    ];
    expect(aliasesFor(rows, `${R}orders/[id].ts`).map((a) => a.id)).toEqual(['1', '2']);
    expect(aliasesFor(rows, `${R}health.ts`).map((a) => a.id)).toEqual(['4']);
  });
});

describe('status and writability', () => {
  const sum = (calls: number, failed: number, lastOutcome = 'ok') => ({ scriptPath: 'x', calls, failed, lastOutcome });
  it('is off, failing, working or none, never zero', () => {
    expect(statusOf({ path: 'x', magicComments: { enabled: false } }, undefined, true)).toBe('off');
    expect(statusOf({ path: 'x' }, sum(100, 1), true)).toBe('working');
    expect(statusOf({ path: 'x' }, sum(10, 5), true)).toBe('failing');
    expect(statusOf({ path: 'x' }, sum(1, 0, 'failed'), true)).toBe('failing');
    expect(statusOf({ path: 'x' }, sum(0, 0), true)).toBeNull();
    expect(statusOf({ path: 'x' }, sum(10, 0), false)).toBeNull();
    expect(statusOf({ path: 'x' }, { ...sum(10, 9), truncated: true }, true)).toBeNull();
  });
  it('an unknown owner is never "not managed"', () => {
    const caps = { now: null, revisions: true, history: true, env: true, executions: true, tests: true, publishable: true };
    expect(writable({ managed: null, ownershipUnknown: true }, caps)).toBe('unknown');
    expect(writable({ managed: { template: 't', elsewhere: false }, ownershipUnknown: false }, caps)).toBe('managed');
    expect(writable({ managed: null, ownershipUnknown: false }, { ...caps, revisions: false })).toBe('old');
    expect(deleteBlock({ managed: { template: 't', elsewhere: true }, ownershipUnknown: false }, caps, true)).toBe('elsewhere');
    expect(deleteBlock({ managed: { template: 't', elsewhere: false }, ownershipUnknown: false }, caps, false)).toBe('noGuard');
    expect(deleteBlock({ managed: null, ownershipUnknown: false }, caps, false)).toBeNull();
  });
});

describe('the caller key', () => {
  const body = '// @label A\nexport default () => new Response("x");\n';
  it('places exactly one key in the header and proves it by reading it back', () => {
    const w = withKey(body, KEY);
    if ('error' in w) throw new Error(w.error);
    expect(w.replaced).toBe(false);
    expect(header(w.text).d.tokens).toBe(1);
    expect(w.text).toContain(`// @token ${KEY}`);
  });
  it('replaces an existing key and drops duplicates', () => {
    const two = `// @token old1\n// @token old2\n${body}`;
    const w = withKey(two, KEY);
    if ('error' in w) throw new Error(w.error);
    expect(w.replaced).toBe(true);
    expect(header(w.text).d.tokens).toBe(1);
    expect(w.text).not.toContain('old1');
  });
  it('refuses a malformed key and a header it cannot place into', () => {
    expect(withKey(body, 'short')).toEqual({ error: 'bad_key' });
    expect(withKey(`#!/usr/bin/env bun\n${body}`, KEY)).toEqual({ error: 'unplaceable' });
    expect(withKey(`/* open\n${body}`, KEY)).toEqual({ error: 'unplaceable' });
  });
  it('splits the key out of the editor text and back', () => {
    const w = withKey(body, KEY);
    if ('error' in w) throw new Error(w.error);
    const { body: shown, key } = splitKey(w.text);
    expect(key).toBe(KEY);
    expect(shown).not.toContain(KEY);
    expect(withoutKey(w.text)).toBe(shown);
    const back = withKey(shown, key as string);
    if ('error' in back) throw new Error(back.error);
    expect(back.text).toBe(w.text);
  });
  it('reads a key from the kit parse', () => {
    expect(keyProven({ results: { magicComments: { tokens: ['x'] } } })).toBe(true);
    expect(keyProven({ results: {} })).toBe(false);
    expect(keyProven(null)).toBe(false);
  });
});

describe('AI proposals', () => {
  it('takes exactly one fenced block and its summary and path', () => {
    const r = extract('Summary: Adds a check.\nPath: /weather\n```ts\nexport default () => 1;\n```\n', true);
    expect(r).toEqual({ summary: 'Adds a check.', route: '/weather', code: 'export default () => 1;\n' });
  });
  it('refuses none, two, unclosed and empty', () => {
    expect(extract('no code here', false)).toEqual({ error: 'no_block' });
    expect(extract('```a\n1\n```\n```b\n2\n```', false)).toEqual({ error: 'two_blocks' });
    expect(extract('```ts\nstill going', false)).toEqual({ error: 'unclosed' });
    expect(extract('```ts\n   \n```', false)).toEqual({ error: 'empty' });
  });
  it('flags what a public script could cost, in words only', () => {
    expect(riskOf('await hoodyAi.summarize(x)').ai).toBe(true);
    expect(riskOf('sharedState.set("a", 1)').data).toBe(true);
    expect(riskOf('return new Response("ok")')).toEqual({ ai: false, data: false });
  });
  it('lists what changed for the review', () => {
    const before = `// @token ${KEY}\nexport default () => 1;\n`;
    const after = '// @schedule 0 * * * *\nimport x from "left-pad";\nexport default () => hoodyAi.ask("x");\n';
    const codes = changesOf(before, after).map((c) => c.code);
    expect(codes).toEqual(expect.arrayContaining(['protection_removed', 'schedule_added', 'public_spends_ai', 'new_package']));
    expect(changesOf(null, 'export default () => 1;\n')).toEqual([]);
    expect(changesOf(null, 'export default () => 1;\n', { taken: true }).map((c) => c.code)).toEqual(['address_taken']);
  });
  it('diffs lines', () => {
    const d = diff('a\nb\nc', 'a\nB\nc\nd');
    if ('tooBig' in d) throw new Error('too big');
    expect(d.added).toBe(2);
    expect(d.removed).toBe(1);
    expect(diff('same', 'same')).toMatchObject({ added: 0, removed: 0 });
    expect(diff('a\nb\nc', 'x\ny\nz', 1)).toEqual({ tooBig: true });
  });
});

describe('approval and outcomes', () => {
  const ok = { ticket: 't', computer: 'c', path: `${R}a.ts`, baseRevision: null, digest: 'a'.repeat(64), verdict: 'ready', route: '/a', answeredBy: null };
  it('one click approves one tuple; any change clears it', () => {
    const A = approval(ok);
    expect(A).not.toBeNull();
    expect(approvalHolds(A, ok)).toBe(true);
    expect(approvalHolds(A, { ...ok, digest: 'b'.repeat(64) })).toBe(false);
    expect(approvalHolds(A, { ...ok, route: '/b' })).toBe(false);
    expect(approval({ ...ok, verdict: 'needs_fix' })).toBeNull();
    expect(approval({ ...ok, path: 'elsewhere/a.ts' })).toBeNull();
  });
  it('only "fenced" proves nothing ran; everything unclear stays unknown', () => {
    expect(settleView({ outcome: 'committed', revision: 'r1' })).toEqual({ state: 'done', revision: 'r1' });
    expect(settleView({ outcome: 'fenced' })).toEqual({ state: 'not_sent' });
    expect(settleView({ outcome: 'in_progress' })).toEqual({ state: 'checking' });
    expect(settleView({ outcome: 'refused', code: 'X' })).toEqual({ state: 'failed', code: 'X' });
    expect(settleView({ outcome: 'forgotten' })).toEqual({ state: 'unknown', forgotten: true });
    expect(settleView(null)).toEqual({ state: 'unknown', forgotten: false });
    expect(settleView({ outcome: 'nonsense' })).toEqual({ state: 'unknown', forgotten: false });
  });
});

describe('verdicts, presets, ideas, hand-offs', () => {
  it('backs off to 30 seconds', () => {
    expect([0, 1, 2, 3, 9].map(settleDelay)).toEqual([2000, 5000, 10000, 30000, 30000]);
  });
  it('a missing package is a warning; a syntax error blocks', () => {
    expect(verdictOf(null).verdict).toBe('unknown');
    expect(verdictOf({ publishable: true, results: { dependencies: { missingModules: ['left-pad'] } } })).toMatchObject({ verdict: 'ready', missing: ['left-pad'] });
    const bad = verdictOf({ publishable: false, results: { syntax: { valid: false, error: 'Unexpected token (3:12)' } } });
    expect(bad.verdict).toBe('needs_fix');
    expect(bad.errors[0]).toMatchObject({ line: 3 });
  });
  it('names the schedule presets', () => {
    expect(presetOf('')).toBe('off');
    expect(presetOf('0 8 * * *')).toBe('daily');
    expect(presetOf('  0   * * * * ')).toBe('hourly');
    expect(presetOf('*/5 * * * *')).toBe('custom');
  });
  it('builds an idea body: generated secrets are returned once, never typed in', () => {
    const r = instantiateBody('webhook-to-notification', { containerId: 'c', path: `${R}n.ts` }, (n) => new Uint8Array(n).fill(3));
    if ('error' in r) throw new Error(r.error);
    expect(Object.keys(r.secrets)).toEqual(['webhook_secret']);
    expect(r.body.vars.webhook_secret).toBe(r.secrets.webhook_secret);
    expect(instantiateBody('nope', { containerId: 'c', path: `${R}n.ts` }, (n) => new Uint8Array(n))).toEqual({ error: 'unknown_template' });
    expect(instantiateBody('kv-note', { containerId: 'c', path: `${R}[x].ts` }, (n) => new Uint8Array(n))).toEqual({ error: 'bad_target' });
  });
  it('builds Logs hand-offs only for well-formed input', () => {
    expect(logsHref({ computerHandle: 'atlas.79b1', rootRel: `${R}orders/[id].ts`, status: 'failed' })).toContain('script=orders%2F%5Bid%5D.ts');
    expect(logsHref({ computerHandle: 'x', rootRel: 'bad' })).toBeNull();
    expect(logsHref({ computerHandle: 'x', rootRel: `${R}a.ts`, executionId: 'a b' })).toBeNull();
  });
});

describe('secrets', () => {
  const S = ['sk-live-abcdefghijklmnop'];
  it('scrubs every spelling of a known secret from text shown on screen', () => {
    expect(scrubAll(`token ${S[0]} used`, S)).toBe('token [hidden] used');
    expect(scrubAll(`b64 ${btoa(S[0] as string)}`, S)).toContain('[hidden]');
    expect(scrubAll('nothing here', S)).toBe('nothing here');
  });
  it('masks for the assistant and restores byte-exactly', () => {
    const m = mask(`const k = "${S[0]}";`, S);
    if ('error' in m) throw new Error(m.error);
    expect(m.text).not.toContain('sk-live');
    const u = unmask(m.text, m.map);
    expect(u.text).toBe(`const k = "${S[0]}";`);
    expect(u.vanished).toEqual([]);
    expect(unmask('__HOODY_SECRET_9__', m.map).unknown).toEqual(['__HOODY_SECRET_9__']);
    expect(mask('__HOODY_SECRET_0__', S)).toEqual({ error: 'placeholder_in_text' });
  });
  it('refuses to store a field holding a known secret, naming the field only', () => {
    expect(checkPersist([{ name: 'note', value: `x ${S[0]}` }], S)).toEqual({ ok: false, field: 'note' });
    expect(checkPersist([{ name: 'note', value: 'fine' }], S)).toEqual({ ok: true });
  });
  it('spots secrets kept in code and sensitive names', () => {
    expect(detectLiterals('const apiKey = "abcdefghijklmnopqrstuv";').length).toBe(1);
    expect(detectLiterals('const title = "hello world friend";')).toEqual([]);
    expect(isSensitiveName('STRIPE_SECRET')).toBe(true);
    expect(isSensitiveName('REGION')).toBe(false);
  });
});

describe('scripts page', () => {
  it('lists scripts of every ready computer and opens one with the keyboard', async () => {
    const { router } = await renderPage(page);
    const table = await screen.findByRole('table', { name: strings.title }, { timeout: 5000 });
    await within(table).findAllByRole('row', { name: /Weather lookup/ });
    const row = within(table).getAllByRole('row').find((r) => /Weather lookup/.test(r.textContent ?? ''));
    if (!row) throw new Error('no row');
    row.focus();
    await userEvent.keyboard('{Enter}');
    expect(String((router.state.location.search as { sel?: string }).sel ?? '')).toMatch(/^(atlas\.00a1|borealis\.00b2)~weather\.ts$/);
  });

  it('says which computers could not be read and how to fix each', async () => {
    await renderPage(page);
    // Each in its own computer's group (problems.groups.test.tsx pins where).
    expect(await screen.findByText(/^Turned off\. Start it/)).toBeInTheDocument();
    expect(screen.getByText(/^Keeps its scripts private/)).toBeInTheDocument();
    expect(screen.getByText(/^Runs an older Scripts program/)).toBeInTheDocument();
  });

  it('offers "Use with your agent" in the header (AgentHint)', async () => {
    await renderPage(page);
    expect(await screen.findByRole('button', { name: 'Use with your agent' }, { timeout: 5000 })).toBeTruthy();
  });
  it('shows the empty state with the way to make a script', async () => {
    await renderPage(page, { state: 'empty' });
    expect(await screen.findByText(strings['empty.title'])).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: strings['action.new'] }).length).toBeGreaterThan(0);
  });

  it('the empty state offers three ideas as plain buttons to the flow, not blue text links', async () => {
    await renderPage(page, { state: 'empty' });
    await screen.findByText(strings['empty.title']);
    const idea = screen.getByRole('link', { name: strings['idea.kv-note'] });
    expect(idea.getAttribute('data-variant')).toBe('secondary');
    expect(idea.getAttribute('href') ?? '').toContain('/scripts/new?idea=kv-note');
    expect(within(screen.getByRole('group', { name: strings['new.ideas'] })).getAllByRole('link')).toHaveLength(3);
  });

  it('shows the error state with a retry', async () => {
    await renderPage(page, { state: 'error' });
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('explains an old kit as read only', async () => {
    await renderPage(page, { state: 'oldKit', path: '/scripts?sel=borealis.00b2~weather.ts' });
    expect((await screen.findAllByText(/older Scripts program/)).length).toBeGreaterThan(0);
  });
});

describe('send again after a pending test send', () => {
  it('asks for anything but a GET', () => {
    expect(resendNeedsConfirm('GET')).toBe(false);
    for (const m of ['POST', 'PUT', 'PATCH', 'DELETE', 'post']) expect(resendNeedsConfirm(m)).toBe(true);
  });
});

describe('key, realm, aliases, read-back', () => {
  const file = `// @token ${REDACTED}\n// @label x\nexport default 1;\n`;
  it('saves a keyed script: the kit shows the key as the sentinel and keeps the stored one', () => {
    const { body, key } = splitKey(file);
    expect(key).toBe(REDACTED);
    const placed = withKey(body + '// edited\n', key as string);
    expect('error' in placed).toBe(false);
    if (!('error' in placed)) expect(placed.text).toContain(`// @token ${REDACTED}`);
    expect(withKey(body, 'not-a-key')).toEqual({ error: 'bad_key' });
  });
  it('picks one realm for the agent: the chosen one, else the computer\'s only one, else asks', () => {
    const r1 = 'a'.repeat(24);
    const r2 = 'b'.repeat(24);
    expect(agentRealmFor(r2, [r1])).toBe(r2);
    expect(agentRealmFor('global', [])).toBe('global');
    expect(agentRealmFor('all', [r1])).toBe(r1);
    expect(agentRealmFor('all', [r1, r2])).toBeNull();
    expect(agentRealmFor('all', [])).toBeNull();
  });
  it('maps a managed_elsewhere row to elsewhere and an own row to its token and link', () => {
    expect(instanceOf({ path: 'p.ts', state: 'managed_elsewhere' })?.elsewhere).toBe(true);
    expect(instanceOf({ path: 'p.ts', state: 'active', has_token: true, alias_id: 'al1', template: 't' })).toEqual({ path: `${R}p.ts`, template: 't', state: 'active', elsewhere: false, hasToken: true, aliasId: 'al1' });
    expect(instanceOf({ state: 'active' })).toBeNull();
  });
});
