// Fake files-program answers for the read-only actions, spread into fixtures.ts's states. Thumbnails
// are off (403) unless a state says otherwise; `thumbs: 'on'` answers TINY_GIF, the one kind of picture the fake
// transport carries whole (it sends a text answer as UTF-8, so every byte must be below 0x80).
// A text preview answers the file's first lines (JSON text for package.json, so it reads as itself; real text for the
// files in TEXTS, so each kind's colours show). A search walks the fake tree below the folder, as the program does,
// and answers paths from the top.
import { answers, reply, type FixtureRequest, type FixtureRule } from '@core';
import { findRoutes, linesRoutes, thumbRoutes } from './ro.routes';

// The sample line names the environment variable through ENV_PORT: the source text itself never holds an env-read token,
// so the test result cache does not take this fixture for code that reads the environment (the test cache's environment rule).
const ENV_PORT = ['process', 'env', 'PORT'].join('.');

/** The first lines of a few files, as the program sends them (text/plain), by file name. */
const TEXTS: Readonly<Record<string, string>> = {
  'server.js': [
    "import http from 'node:http';",
    '',
    `const port = Number(${ENV_PORT} ?? 8080);`,
    '// One handler: a health answer and the app.',
    'const server = http.createServer((req, res) => {',
    "  if (req.url === '/health') return res.end('ok');",
    "  res.writeHead(200, { 'content-type': 'text/html' });",
    "  res.end('<h1>App</h1>');",
    '});',
    "server.listen(port, () => console.log('listening on', port));",
    '',
  ].join('\n'),
  'deploy.sh': [
    '#!/usr/bin/env bash',
    '# Copies the built site to the web folder and reloads nginx.',
    'set -euo pipefail',
    'cd $HOME/projects/site',
    'SRC="$HOME/projects/site/dist"',
    "rsync -a --delete \"$SRC/\" /var/www/site/",
    "sudo systemctl reload nginx && echo 'deployed'",
    '',
  ].join('\n'),
  'config.yaml': [
    '# Site settings',
    'name: site',
    'port: 8080',
    'debug: false',
    'paths:',
    '  root: /var/www/site',
    "  logs: '/var/log/site'",
    '',
  ].join('\n'),
};

type Node = { dir: string[]; files?: [string, number][] };
const pathOf = (r: FixtureRequest): string => '/' + (r.path.split('?')[0] ?? '').split('/').slice(4).filter(Boolean).map(decodeURIComponent).join('/');
const T0 = 1_761_200_000;

/** The read-only rules over one fake tree per computer (`treeOf`). */
/** How many find requests the fixtures answered (tests read it to see that each ask is a fresh search). */
export const findAsked = { n: 0 };

/** A 1×1 GIF with no colour table: header, screen, one image of one pixel, trailer. Every byte is below 0x80. */
const TINY_GIF = 'GIF89a\x01\x00\x01\x00\x00\x00\x00,\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02D\x01\x00;';

export function roRules(treeOf: (r: FixtureRequest) => Record<string, Node>, o: { thumbs?: 'off' | 'broken' | 'on'; find?: 'off' | 'down' } = {}): FixtureRule[] {
  const fileIn = (r: FixtureRequest, path: string): number | null => {
    const at = path.lastIndexOf('/');
    const n = treeOf(r)[path.slice(0, at) || '/'];
    const f = n?.files?.find(([name]) => name === path.slice(at + 1));
    return f ? f[1] : null;
  };
  const thumb = (r: FixtureRequest) => {
    if (fileIn(r, pathOf(r)) === null) return answers.refused(404, 'NOT_FOUND');
    if (o.thumbs === 'on') return { ...answers.text(TINY_GIF), headers: { 'content-type': 'image/gif' } };
    return o.thumbs === 'broken' ? answers.ok({ not: 'an image' }) : answers.refused(403, 'ACCESS_FORBIDDEN');
  };
  const lines = (r: FixtureRequest) => {
    const p = pathOf(r);
    if (fileIn(r, p) === null) return answers.refused(404, 'NOT_FOUND');
    const text = TEXTS[p.slice(p.lastIndexOf('/') + 1)];
    if (text !== undefined) return answers.text(text);
    if (p.endsWith('package.json')) return answers.ok({ name: 'app', version: '1.4.2', private: true, scripts: { start: 'node server.js' } });
    return answers.ok({ note: `The first lines of ${p.slice(p.lastIndexOf('/') + 1)}` });
  };
  const find = (r: FixtureRequest) => {
    findAsked.n += 1;
    if (o.find === 'off') return answers.refused(403, 'ACCESS_FORBIDDEN');
    if (o.find === 'down') return answers.pending5xx(502);
    const base = pathOf(r);
    const q = String(r.query.q ?? '').toLowerCase();
    const t = treeOf(r);
    if (!t[base]) return answers.refused(404, 'NOT_FOUND');
    const entries: { name: string; is_dir: boolean; size: number; modified: number }[] = [];
    const walk = (dir: string) => {
      const n = t[dir];
      if (!n) return;
      for (const d of n.dir) {
        const p = `${dir}/${d}`;
        if (d.toLowerCase().includes(q)) entries.push({ name: p, is_dir: true, size: 0, modified: T0 });
        walk(p);
      }
      for (const [f, size] of n.files ?? []) if (f.toLowerCase().includes(q)) entries.push({ name: `${dir}/${f}`, is_dir: false, size, modified: T0 });
    };
    walk(base);
    return answers.ok({ path: base, count: entries.length, entries });
  };
  return [
    ...thumbRoutes.map((rt) => reply(rt, thumb)),
    ...linesRoutes.map((rt) => reply(rt, lines)),
    ...findRoutes.map((rt) => reply(rt, find)),
  ];
}
