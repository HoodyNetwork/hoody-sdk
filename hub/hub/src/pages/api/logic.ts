// The API page's snippets: how to call one operation, in cURL, JavaScript (the SDK, or fetch where the SDK has no
// method), Python (requests), the CLI and a URL (the request wrapped into one GET link by the computer's cURL
// program). Pure: the page passes the catalog, the computer (or the placeholder) and the proxy domain.
//
// Contract:
//   - Never a snippet that is wrong. An operation whose request this page does not model (a body that is not a JSON
//     list of fields, a `{path}` that takes slashes, a host its siblings disagree on) gets none: the row says "See the
//     docs". One with a parameter that names the program's instance (instanceBy: path, query or body) gets no plain HTTP:
//     its host would have to carry that number, and the proxy obeys the host. The SDK and the CLI route it themselves.
//   - A placeholder never poses as a value: a string field is `"<name>"`, any other field a bare `<name>`, which fails
//     until it is replaced.
//   - Auth (catalog.build.ts rules 2 and 3): an account operation sends `Authorization: Bearer $HOODY_TOKEN` (from the
//     environment, never a value), a public one nothing. A program on a computer never gets the account token: kit
//     snippets send no credential, Notes snippets its own identity header with a placeholder value.
//   - The URL: a program operation only (the link runs on a computer's cURL program, which never gets the account
//     token, so no account operation has one), and never the cURL program's own request. One link, from the same
//     request as the cURL tab, encoded as the docs site's URL tab does.
//   - The account API: the platform the Hub runs on (`hosts`, kit currentPlatformHosts().api), the catalogue's base only
//     when the page passes none: another platform's page never shows hoody.com's address.
//   - The computer: placeholders (`<project-id>`, `<computer-id>`, `<server>`) until the visitor picks one of theirs.
//     `code` is what the screen shows (every 24-hex run masked, maskAddress); `copy` is the whole text.
import { hostSegment, maskAddress } from '@core';
import { cliCommand, type PlatformHosts } from '@kit';
import type { Catalog, CatalogHost, CatalogOp } from './catalog';

export type Lang = 'curl' | 'js' | 'python' | 'cli' | 'url';
export const LANGS: readonly Lang[] = ['curl', 'js', 'python', 'cli', 'url'];

/** One computer as the snippets name it. */
export interface Place {
  readonly project: string;
  readonly computer: string;
  readonly server: string;
}
export const PLACEHOLDER: Place = { project: '<project-id>', computer: '<computer-id>', server: '<server>' };
const NOTES_VALUE = '<notes-identity>';
const TOKEN_ENV = 'HOODY_TOKEN';

export interface Snippet {
  readonly code: string;
  readonly copy: string;
}

/** The program instance the snippets address: the first, as withComputer() does. */
const INSTANCE = 1;

/** The host of a program operation, or null (account API, or a host the catalog does not know). */
export function hostFor(c: Catalog, o: CatalogOp): CatalogHost | null {
  if (o.host === null) return null;
  return c.services.find((s) => s.id === o.service)?.hosts[o.host] ?? null;
}

/** The account API's base: the platform's own API (`hosts`) when given, else the catalogue's (hoody.com's). */
export function accountBase(c: Catalog, hosts?: PlatformHosts): string {
  return hosts ? `https://${hosts.api}` : c.accountBase;
}

/** The base URL an operation is sent to, or null when it has none this page can name. */
export function baseFor(c: Catalog, o: CatalogOp, place: Place, domain: string, hosts?: PlatformHosts): string | null {
  if (o.service === 'api') return accountBase(c, hosts);
  const h = hostFor(c, o);
  if (!h || !domain) return null;
  return hostBase(h, place, domain);
}

function hostBase(h: CatalogHost, place: Place, domain: string): string {
  const n = String(INSTANCE);
  // The terminal's long label is `t` (hosts.ts hostSegment, the SDK's terminalHostLabel rule).
  const seg = h.seg === 'terminal' ? hostSegment(place.project, place.computer, 'terminal', n) : h.seg;
  return `https://${place.project}-${place.computer}-${seg}${h.indexed ? '-' + n : ''}.${place.server}.${domain}`;
}

/** Whether this page models the operation's request: no body or a JSON one, and no slash-taking `{path}`. */
export function modelled(o: CatalogOp): boolean {
  if (o.body && o.body.type !== 'json') return false;
  return !o.pathParams.includes('path');
}

function pathWith(o: CatalogOp): string {
  const filled = o.path.replace(/\{([^}]+)\}/g, (_, n: string) => `<${n}>`);
  // A required query the path does not already carry (the route selectors `/?download_history` do).
  const own = new Set([...o.path.matchAll(/[?&]([^=&]+)/g)].map((m) => m[1]));
  const q = o.query.filter((n) => !own.has(n)).map((n) => `${n}=<${n}>`);
  return q.length ? filled + (filled.includes('?') ? '&' : '?') + q.join('&') : filled;
}

/** The body's text: valid in JSON, a JavaScript object and a Python dict once the placeholders are filled. */
const bodyText = (o: CatalogOp): string | null =>
  o.body ? `{${o.body.required.map((f) => `${JSON.stringify(f)}:${o.body!.bare?.includes(f) ? `<${f}>` : JSON.stringify(`<${f}>`)}`).join(',')}}` : null;

interface Request {
  readonly method: string;
  readonly url: string;
  /** Header name and value; `token` means the value is `Bearer $HOODY_TOKEN` from the environment. */
  readonly headers: ReadonlyArray<{ readonly name: string; readonly value: string; readonly token?: true }>;
  readonly body: string | null;
}

function request(c: Catalog, o: CatalogOp, place: Place, domain: string, hosts?: PlatformHosts): Request | null {
  if (!modelled(o) || o.instanceBy !== null) return null;
  const base = baseFor(c, o, place, domain, hosts);
  if (!base) return null;
  const headers: Array<Request['headers'][number]> = [];
  if (o.auth === 'account') headers.push({ name: 'Authorization', value: 'Bearer', token: true });
  if (o.auth === 'notes') headers.push({ name: c.notesAuth.name, value: `${c.notesAuth.prefix} ${NOTES_VALUE}` });
  for (const h of o.headers) if (h.toLowerCase() !== 'authorization') headers.push({ name: h, value: `<${h}>` });
  const body = bodyText(o);
  if (body) headers.push({ name: 'Content-Type', value: 'application/json' });
  return { method: o.method, url: base + pathWith(o), headers, body };
}

const sq = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;
const js = (s: string) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
const py = (s: string) => JSON.stringify(s);

function curl(r: Request): string {
  const lines = [`curl -X ${r.method} ${sq(r.url)}`];
  for (const h of r.headers) lines.push(h.token ? `  -H "${h.name}: Bearer $${TOKEN_ENV}"` : `  -H ${sq(`${h.name}: ${h.value}`)}`);
  if (r.body) lines.push(`  -d ${sq(r.body)}`);
  return lines.join(' \\\n');
}

function python(r: Request): string {
  const hs = r.headers.map((h) => (h.token ? `    ${py(h.name)}: "Bearer " + os.environ[${py(TOKEN_ENV)}],` : `    ${py(h.name)}: ${py(h.value)},`));
  let call = `r = requests.request(${py(r.method)}, ${py(r.url)}`;
  if (hs.length) call += ', headers={\n' + hs.join('\n') + '\n}';
  if (r.body) call += `, json=${r.body}`;
  return ['import os, requests', '', call + ')', 'print(r.status_code, r.text)'].join('\n');
}

function fetchJs(r: Request): string {
  const hs = r.headers.map((h) => (h.token ? `    ${js(h.name)}: \`Bearer \${process.env.${TOKEN_ENV}}\`,` : `    ${js(h.name)}: ${js(h.value)},`));
  const opts = [`  method: ${js(r.method)},`];
  if (hs.length) opts.push('  headers: {', ...hs, '  },');
  if (r.body) opts.push(`  body: JSON.stringify(${r.body}),`);
  return [`const res = await fetch(${js(r.url)}, {`, ...opts, '});', 'console.log(res.status, await res.text());'].join('\n');
}

/** The SDK call's arguments in order ('' for an optional one skipped), or null when the call cannot be written whole
 *  (it then shows fetch): each required one is a path or query parameter or the body; every path parameter, required
 *  query and header has its place among them; and a body with required fields goes in `data`, even an optional `data?`. */
function sdkArgs(o: CatalogOp): string[] | null {
  if (!o.sdk || !modelled(o)) return null;
  const names = o.sdk.args.map((a) => a.replace(/\?$/, ''));
  const needsData = !!o.body && (o.body.required.length > 0 || !o.body.optional);
  const need = new Set([...o.pathParams, ...o.query, ...o.headers, ...(needsData ? ['data'] : [])]);
  if (!o.sdk.args.every((a) => a.endsWith('?') || o.pathParams.includes(a) || o.query.includes(a) || (a === 'data' && !!o.body))) return null;
  if (![...need].every((n) => names.includes(n))) return null;
  for (const a of o.sdk.args) if (!a.endsWith('?')) need.add(a);
  const last = names.reduce((at, n, i) => (need.has(n) ? i : at), -1);
  return names.slice(0, last + 1).map((n) => (need.has(n) ? n : ''));
}

/** The SDK call, or null when it has none this page can write. */
function sdkJs(c: Catalog, o: CatalogOp, place: Place, hosts?: PlatformHosts): string | null {
  const base = js(accountBase(c, hosts));
  const required = sdkArgs(o);
  if (!o.sdk || !required) return null;
  const args = required.map((a) => (a === '' ? 'undefined' : a === 'data' ? bodyText(o)! : js(`<${a}>`)));
  const lines = [`import { HoodyClient } from 'hoody-sdk';`, ''];
  if (o.service === 'api') {
    lines.push(o.auth === 'public'
      ? `const hoody = new HoodyClient({ baseURL: ${base} });`
      : `const hoody = new HoodyClient({ baseURL: ${base}, token: process.env.${TOKEN_ENV} });`);
    lines.push(`console.log(await hoody.${o.sdk.call}(${args.join(', ')}));`);
  } else {
    lines.push(`const hoody = new HoodyClient({ baseURL: ${base} });`);
    const computer = `{ id: ${js(place.computer)}, project_id: ${js(place.project)}, server_name: ${js(place.server)} }`;
    lines.push(o.auth === 'notes'
      ? `const box = await hoody.withComputer(${computer}, { kitAuth: { type: 'token', value: ${js(NOTES_VALUE)} } });`
      : `const box = await hoody.withComputer(${computer});`);
    lines.push(`console.log(await box.${o.sdk.call}(${args.join(', ')}));`);
  }
  return lines.join('\n');
}

/**
 * A query value as the docs site's URL tab encodes it: only what form decoding would eat (`%`, `&`, `+`, `#`, space), every
 * control byte, and everything above 0x7E. Slashes, colons, braces and quotes stay readable.
 */
function urlValue(v: string): string {
  return v
    .replace(/%/g, '%25')
    .replace(/&/g, '%26')
    .replace(/\+/g, '%2B')
    .replace(/#/g, '%23')
    .replace(/ /g, '%20')
    .replace(/[\x00-\x1F\x7F]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0'))
    .replace(/\p{Surrogate}/gu, '\uFFFD')
    .replace(/[^\x00-\x7F]/gu, (c) => encodeURIComponent(c));
}

/** The request as one GET link through the computer's cURL program, or null (account API, or the cURL program itself). */
function url(c: Catalog, o: CatalogOp, r: Request, place: Place, domain: string): string | null {
  if (o.service === 'api' || o.service === 'curl') return null;
  const h = c.services.find((s) => s.id === 'curl')?.hosts[0];
  if (!h || !domain) return null;
  const q = [`url=${urlValue(r.url)}`, `method=${urlValue(r.method)}`];
  // json= sets the content type itself.
  for (const x of r.headers) if (!x.token && !(r.body && x.name === 'Content-Type')) q.push(`header=${urlValue(`${x.name}: ${x.value}`)}`);
  if (r.body) q.push(`json=${urlValue(r.body)}`);
  q.push('response=transparent');
  return `${hostBase(h, place, domain)}/api/v1/curl/request?${q.join('&')}`;
}

/** The catalogue's `hoody …` line; with `hosts` it names the platform the Hub runs on only off the CLI's default one (kit
 *  cliCommand: a reader may copy this one line alone, with no sign-in before it). */
function cli(o: CatalogOp, place: Place, hosts?: PlatformHosts): string | null {
  if (!o.cli || o.auth === 'notes') return null;
  const line = o.service === 'api' ? o.cli : `${o.cli} --computer ${place === PLACEHOLDER ? sq(place.computer) : place.computer}`;
  return hosts && line.startsWith('hoody ') ? cliCommand(line.slice('hoody '.length), hosts) : line;
}

/** Whether the JavaScript tab is the SDK or plain fetch (its label). */
export function jsKind(o: CatalogOp): 'sdk' | 'fetch' {
  return sdkArgs(o) ? 'sdk' : 'fetch';
}

/** The languages an operation has a snippet in, in tab order. */
export function langsFor(c: Catalog, o: CatalogOp, domain: string): Lang[] {
  return LANGS.filter((l) => snippet(c, o, l, PLACEHOLDER, domain) !== null);
}

export function snippet(c: Catalog, o: CatalogOp, lang: Lang, place: Place, domain: string, hosts?: PlatformHosts): Snippet | null {
  let text: string | null = null;
  if (lang === 'cli') text = cli(o, place, hosts);
  else {
    const r = request(c, o, place, domain, hosts);
    if (lang === 'js') text = sdkJs(c, o, place, hosts) ?? (r && fetchJs(r));
    else if (r) text = lang === 'curl' ? curl(r) : lang === 'url' ? url(c, o, r, place, domain) : python(r);
  }
  return text === null ? null : { code: maskAddress(text), copy: text };
}
