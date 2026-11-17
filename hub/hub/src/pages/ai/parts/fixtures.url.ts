// From a URL… in the AI tab's fixture world: the chat computer's two programs as attachUrl.ts calls them, answered in their own
// shapes. The hidden page-reading browser is not running until its start arrives (the kit's 404 NOT_FOUND for a read with
// start=false), then it answers every read. Addresses pick the case:
//   - a path with "long": a page longer than one text file (Markdown cut by maxChars, truncated true; as it is, 40 KB of text);
//   - a path with "missing": the site answers 404;
//   - a path ending ".png": a small PNG image (as it is);
//   - a path ending ".zip": bytes that are neither text nor an image (as it is);
//   - "/moved": a redirect to /notes.txt on the same site; "/to-private": a redirect to a private address; "/loop": a redirect to
//     itself (as it is). A Markdown read of "/to-private" reports the private address it ended on;
//   - any other: a short article (Markdown, with front matter) or its HTML (as it is).
import { answers, reply, type FixtureRequest } from '@core';
import { urlRoutes } from './attachUrl';

const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==';
const ZIP_B64 = 'UEsDBBQAAAAIAAAAIQAAAAAAAAAAAAAAAAAAAAAA';
// The fake site's page titles (data the site sends, not Hub text).
const PAGE_TITLE = 'Release notes';
const MISSING_TITLE = 'Not found';
const ARTICLE = '# Release notes\n\nVersion 2 adds dark mode, faster search and a new export.\n\n## Dark mode\n\nTurn it on in Settings.\n';

const pathOf = (url: string) => { try { return new URL(url).pathname; } catch { return ''; } };

export function urlRules() {
  let started = false;
  return [
    reply(urlRoutes.readerStart, () => { started = true; return answers.ok({ sessionId: 'r1', browserName: 'chromium' }); }),
    reply(urlRoutes.markdown, (r: FixtureRequest) => {
      if (!started) return answers.refused(404, 'NOT_FOUND');
      const url = String(r.query.url ?? '');
      const p = pathOf(url);
      if (p.includes('missing')) return answers.ok({ markdown: '# Not found\n', title: MISSING_TITLE, url, httpStatus: 404, truncated: false, chars: 12, fetchedAt: '2026-11-12T09:00:00Z', metadata: {} });
      if (p.includes('to-private')) return answers.ok({ markdown: '# Router\n', title: PAGE_TITLE, url: 'http://192.168.1.1/', httpStatus: 200, truncated: false, chars: 9, fetchedAt: '2026-11-12T09:00:00Z', metadata: {} });
      const long = p.includes('long');
      const markdown = `---\ntitle: "Release notes"\nsource: "${url}"\n---\n\n${long ? `${ARTICLE}\n`.repeat(200) : ARTICLE}`;
      return answers.ok({ markdown, title: PAGE_TITLE, url, httpStatus: 200, truncated: long, chars: markdown.length, fetchedAt: '2026-11-12T09:00:00Z', metadata: {} });
    }),
    reply(urlRoutes.asIs, (r: FixtureRequest) => {
      const p = pathOf(String(r.query.url ?? ''));
      const res = (status: number, type: string, body: string, binary = false, location?: string) => answers.ok({ success: status < 400, status_code: status, headers: { 'content-type': type, ...(location ? { location } : {}) }, raw_headers: [], body, is_binary: binary, timing: {}, metadata: {} });
      if (p === '/moved') return res(301, 'text/html', '', false, '/notes.txt');
      if (p === '/to-private') return res(302, 'text/html', '', false, 'http://10.0.0.7/admin');
      if (p === '/loop') return res(302, 'text/html', '', false, '/loop');
      if (p === '/notes.txt') return res(200, 'text/plain; charset=utf-8', 'Moved notes.\n');
      if (p.includes('missing')) return res(404, 'text/html', '<h1>Not found</h1>');
      if (p.endsWith('.png')) return res(200, 'image/png', PNG_B64, true);
      if (p.endsWith('.zip')) return res(200, 'application/zip', ZIP_B64, true);
      if (p.includes('long')) return res(200, 'text/plain; charset=utf-8', 'A line of the log.\n'.repeat(2200));
      return res(200, 'text/html; charset=utf-8', `<!doctype html><title>Release notes</title><h1>Release notes</h1><p>Version 2 adds dark mode.</p>`);
    }),
  ];
}
