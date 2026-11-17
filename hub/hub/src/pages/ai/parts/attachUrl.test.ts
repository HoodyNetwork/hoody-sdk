// From a URL… (attachUrl.ts): which addresses go, what each program's answer becomes, the hidden reader's one start, the cut
// of a long text, and the answer parsers (one malformed row per field read).
import { FIXTURE_TARGET, answers, api, bootFixtureCore, reply, type FixtureRequest, type FixtureRule } from '@core';
import { beforeEach, describe, expect, it } from 'vitest';
import { attach as A } from '@ask/io';
import { CURL_TIMEOUT_S, READER_BROWSER, REDIRECTS, checkAddress, readerStartHeld, resetReaderHoldsForTests, curlAnswer, fitText, markdownAnswer, readUrl, urlFileName, urlFrom, urlRoutes } from './attachUrl';
import { urlRules } from './fixtures.url';

const T = FIXTURE_TARGET;
let sent: { route: string; query: Record<string, unknown> }[] = [];

function boot(extra: FixtureRule[] = [], framed = false) {
  sent = [];
  resetReaderHoldsForTests();
  const watch = (name: string, r: FixtureRequest) => { sent.push({ route: name, query: { ...r.query } }); };
  const base = urlRules();
  // Each fixture rule, wrapped so every request that reaches the computer is recorded.
  const routes = [['start', urlRoutes.readerStart], ['markdown', urlRoutes.markdown], ['asIs', urlRoutes.asIs]] as const;
  const wrapped = routes.map(([name, route]) => reply(route, async (r: FixtureRequest) => {
    watch(name, r);
    const own = extra.find((x) => x.route === route) ?? base.find((x) => x.route === route);
    const h = own!.answer;
    return typeof h === 'function' ? h(r) : h;
  }));
  bootFixtureCore({ rules: wrapped, framed });
}

beforeEach(() => boot());

describe('checkAddress', () => {
  it.each([
    ['', 'empty'], ['   ', 'empty'], ['example.com', 'scheme'], ['ftp://example.com/x', 'scheme'], ['javascript:alert(1)', 'scheme'],
    ['http://localhost/', 'local'], ['http://127.0.0.1/', 'local'], ['http://10.0.0.5/x', 'local'], ['http://192.168.1.2/', 'local'],
    ['https://router.lan/', 'local'], ['https://user:pw@example.com/', 'local'], ['http://[::1]/', 'local'],
  ])('refuses %j (%s)', (raw, why) => {
    expect(checkAddress(raw)).toEqual({ ok: false, why });
  });
  it('takes a public address as the parser writes it', () => {
    expect(checkAddress('  HTTPS://Example.com/docs?a=1 ')).toEqual({ ok: true, url: 'https://example.com/docs?a=1', host: 'example.com' });
  });
});

describe('the routes refuse what the dialog never sends', () => {
  it('a private address, another mode or another timeout never leaves', async () => {
    const tries = [
      api(urlRoutes.asIs, { target: T, query: { url: 'http://127.0.0.1/', response: 'json', timeout: CURL_TIMEOUT_S, follow_redirects: false } }),
      api(urlRoutes.asIs, { target: T, query: { url: 'https://example.com/', response: 'transparent', timeout: CURL_TIMEOUT_S, follow_redirects: false } }),
      api(urlRoutes.asIs, { target: T, query: { url: 'https://example.com/', response: 'json', timeout: 600, follow_redirects: false } }),
      // The program would follow redirects to private ranges itself: a fetch that lets it is never sent.
      api(urlRoutes.asIs, { target: T, query: { url: 'https://example.com/', response: 'json', timeout: CURL_TIMEOUT_S } }),
      api(urlRoutes.asIs, { target: T, query: { url: 'https://example.com/', response: 'json', timeout: CURL_TIMEOUT_S, follow_redirects: true } }),
      api(urlRoutes.markdown, { target: T, query: { url: 'https://example.com/', start: true, maxChars: A.TXT_BYTES, frontmatter: true } }),
      api(urlRoutes.markdown, { target: T, query: { url: 'http://10.1.2.3/', start: false, maxChars: A.TXT_BYTES, frontmatter: true } }),
      api(urlRoutes.readerStart, { target: T, query: { showBrowser: true } }),
    ];
    for (const p of tries) await expect(p).rejects.toMatchObject({ kind: 'not_sent' });
    expect(sent).toEqual([]);
  });
  it('reads only through the hidden browser: an id no Board browser (1-7500) or launch display (browser 7501-9499) names, within 9999', () => {
    expect(READER_BROWSER).toBeGreaterThan(9499);
    expect(READER_BROWSER).toBeLessThanOrEqual(9999);
    expect(urlRoutes.markdown.index).toBe(READER_BROWSER);
    expect(urlRoutes.readerStart.index).toBe(READER_BROWSER);
  });
});

describe('readUrl as Markdown', () => {
  it('starts the hidden browser once (headless) when none runs, then reads the page', async () => {
    const r = await readUrl(T, 'https://example.com/notes', 'markdown');
    expect(r).toMatchObject({ ok: true, kind: 'text', name: 'Release notes.md', type: 'text/markdown', long: false, from: 'example.com/notes' });
    expect(r.ok && r.kind === 'text' && r.text).toContain('# Release notes');
    expect(sent.map((x) => x.route)).toEqual(['markdown', 'start', 'markdown']);
    expect(sent[1]!.query).toEqual({ showBrowser: 'false' });
    expect(sent[0]!.query).toMatchObject({ start: 'false', frontmatter: 'true', maxChars: String(A.TXT_BYTES) });
    // Running now: the next read starts nothing.
    await readUrl(T, 'https://example.com/other', 'markdown');
    expect(sent.map((x) => x.route)).toEqual(['markdown', 'start', 'markdown', 'markdown']);
  });
  it('a page cut by the reader is long', async () => {
    expect(await readUrl(T, 'https://example.com/long-page', 'markdown')).toMatchObject({ ok: true, long: true });
  });
  it('an error status of the site attaches nothing', async () => {
    expect(await readUrl(T, 'https://example.com/missing', 'markdown')).toEqual({ ok: false, why: 'status', status: 404 });
  });
  it('a start whose answer was lost holds the computer: later presses only read, until a read proves the reader runs', async () => {
    let up = false;
    boot([
      reply(urlRoutes.readerStart, answers.pending5xx()),
      reply(urlRoutes.markdown, (r: FixtureRequest) => (up ? answers.ok({ markdown: '# x\n', title: 'x', url: String(r.query.url), httpStatus: 200, truncated: false }) : answers.refused(404, 'NOT_FOUND'))),
    ]);
    expect(await readUrl(T, 'https://example.com/notes', 'markdown')).toEqual({ ok: false, why: 'starting' });
    expect(readerStartHeld(T)).toBe(true);
    expect(await readUrl(T, 'https://example.com/notes', 'markdown')).toEqual({ ok: false, why: 'starting' });
    expect(sent.map((x) => x.route)).toEqual(['markdown', 'start', 'markdown']);
    up = true;
    expect(await readUrl(T, 'https://example.com/notes', 'markdown')).toMatchObject({ ok: true });
    expect(readerStartHeld(T)).toBe(false);
    expect(sent.map((x) => x.route)).toEqual(['markdown', 'start', 'markdown', 'markdown']);
  });
  it('in a frame the start is refused unsent', async () => {
    boot([], true);
    expect(await readUrl(T, 'https://example.com/notes', 'markdown')).toMatchObject({ ok: false, why: 'failed', error: { code: 'FRAMED_ACTION_REFUSED' } });
    expect(sent.map((x) => x.route)).toEqual(['markdown']);
    expect(readerStartHeld(T)).toBe(false);
  });
  it('a page that ended on a private address after the browser\'s redirects is not attached', async () => {
    expect(await readUrl(T, 'https://example.com/to-private', 'markdown')).toEqual({ ok: false, why: 'redirected' });
  });
  it('a page too large to convert is too big', async () => {
    boot([reply(urlRoutes.markdown, answers.refused(422, 'PAGE_TOO_LARGE'))]);
    expect(await readUrl(T, 'https://example.com/huge', 'markdown')).toEqual({ ok: false, why: 'tooBig' });
  });
  it('any other refusal is a failure with its cause', async () => {
    boot([reply(urlRoutes.markdown, answers.refused(502, 'NAVIGATION_ERROR'))]);
    expect(await readUrl(T, 'https://example.com/x', 'markdown')).toMatchObject({ ok: false, why: 'failed' });
    expect(sent.map((x) => x.route)).toEqual(['markdown']);
  });
});

describe('readUrl as it is', () => {
  it('HTML stays HTML, named after the host', async () => {
    const r = await readUrl(T, 'https://example.com/', 'asis');
    expect(r).toMatchObject({ ok: true, kind: 'text', name: 'example.com.html', type: 'text/html', long: false });
    expect(sent).toEqual([{ route: 'asIs', query: { url: 'https://example.com/', response: 'json', timeout: String(CURL_TIMEOUT_S), follow_redirects: 'false' } }]);
  });
  it('the Hub follows a redirect itself, checking the next address', async () => {
    expect(await readUrl(T, 'https://example.com/moved', 'asis')).toMatchObject({ ok: true, kind: 'text', name: 'notes.txt', text: 'Moved notes.\n', from: 'example.com/notes.txt' });
    expect(sent.map((x) => x.query.url)).toEqual(['https://example.com/moved', 'https://example.com/notes.txt']);
  });
  it('a redirect to a private address is never fetched', async () => {
    expect(await readUrl(T, 'https://example.com/to-private', 'asis')).toEqual({ ok: false, why: 'redirected' });
    expect(sent.map((x) => x.query.url)).toEqual(['https://example.com/to-private']);
  });
  it('a redirect loop stops after REDIRECTS hops', async () => {
    expect(await readUrl(T, 'https://example.com/loop', 'asis')).toEqual({ ok: false, why: 'redirected' });
    expect(sent).toHaveLength(REDIRECTS + 1);
  });
  it('an image comes back as its bytes', async () => {
    const r = await readUrl(T, 'https://example.com/logo.png', 'asis');
    expect(r).toMatchObject({ ok: true, kind: 'image', name: 'logo.png', type: 'image/png' });
  });
  it('bytes that are neither text nor an image are refused', async () => {
    expect(await readUrl(T, 'https://example.com/a.zip', 'asis')).toEqual({ ok: false, why: 'notText' });
  });
  it('a long text is long; a 404 is a status', async () => {
    expect(await readUrl(T, 'https://example.com/long.log', 'asis')).toMatchObject({ ok: true, kind: 'text', long: true });
    expect(await readUrl(T, 'https://example.com/missing', 'asis')).toEqual({ ok: false, why: 'status', status: 404 });
  });
});

describe('fitText', () => {
  const note = '[cut]';
  it('keeps text that fits whole', () => {
    expect(fitText('abc\n', 10, note)).toBe('abc\n');
  });
  it('cuts at the last line end and adds the note, within the bytes', () => {
    const out = fitText('one\ntwo\nthree\nfour\n', 16, note);
    expect(out).toBe('one\ntwo\n\n[cut]\n');
    expect(new TextEncoder().encode(out).length).toBeLessThanOrEqual(16);
  });
  it('never splits a character', () => {
    const out = fitText('é'.repeat(100), 51, note);
    expect(out).not.toContain('�');
    expect(new TextEncoder().encode(out).length).toBeLessThanOrEqual(51);
    expect(out.endsWith('[cut]\n')).toBe(true);
  });
  it('text the reader already cut keeps the note even when it fits', () => {
    expect(fitText('abc\n', 64, note, true)).toBe('abc\n\n[cut]\n');
  });
  it('fits one text file of the composer', () => {
    const out = fitText('a line of text\n'.repeat(5000), A.TXT_BYTES, note);
    expect(new TextEncoder().encode(out).length).toBeLessThanOrEqual(A.TXT_BYTES);
  });
});

describe('names and origins', () => {
  it('names files and keeps the query out of the origin', () => {
    expect(urlFileName('https://example.com/a/b', 'markdown', '', 'text/markdown')).toBe('example.com.md');
    expect(urlFileName('https://example.com/a/b', 'markdown', 'A/B test', 'text/markdown')).toBe('A-B test.md');
    expect(urlFileName('https://example.com/data', 'asis', '', 'application/json')).toBe('data.json');
    expect(urlFileName('https://example.com/r.csv', 'asis', '', 'text/plain')).toBe('r.csv');
    expect(urlFrom('https://example.com/p?key=secret')).toBe('example.com/p');
  });
});

describe('answer parsers', () => {
  const md = { markdown: '# x', title: 't', url: 'https://example.com/', httpStatus: 200, truncated: false };
  it.each([
    ['not an object', null], ['markdown missing', { ...md, markdown: undefined }], ['markdown a number', { ...md, markdown: 1 }],
    ['truncated a string', { ...md, truncated: 'no' }], ['title a number', { ...md, title: 5 }], ['status a string', { ...md, httpStatus: '200' }],
    ['status out of range', { ...md, httpStatus: 42 }], ['url missing', { ...md, url: undefined }],
  ])('markdownAnswer refuses: %s', (_n, v) => { expect(markdownAnswer(v)).toBeNull(); });
  it('markdownAnswer reads a real answer (httpStatus null for the current tab)', () => {
    expect(markdownAnswer({ ...md, httpStatus: null, title: null })).toEqual({ markdown: '# x', title: '', url: 'https://example.com/', httpStatus: null, truncated: false });
  });
  const cu = { status_code: 200, headers: { 'content-type': 'text/html; charset=utf-8' }, body: '<p>', is_binary: false };
  it.each([
    ['not an object', 'x'], ['body missing', { ...cu, body: undefined }], ['is_binary missing', { ...cu, is_binary: undefined }],
    ['headers missing', { ...cu, headers: undefined }], ['status a string', { ...cu, status_code: '200' }], ['content-type a number', { ...cu, headers: { 'content-type': 1 } }],
    ['location a number', { ...cu, headers: { location: 3 } }],
  ])('curlAnswer refuses: %s', (_n, v) => { expect(curlAnswer(v)).toBeNull(); });
  it('curlAnswer reads a real answer', () => {
    expect(curlAnswer(cu)).toEqual({ status: 200, type: 'text/html', body: '<p>', binary: false, location: null });
  });
});
