// linkRead.ts: what a link in text is, read from the address alone. Pure: no I/O, no
// page state, the environment comes in as an argument.
//
// The rules are about hostile text in a link, whoever wrote it: a reply can carry words from a page the agent read, a Bot
// row a guest's words. Nothing here limits what an agent may link.
//
//   text    opening the address could make a program act, so it is never a link: a name on the acting lists, in the query or
//           a query-like fragment, directly or inside a nested address; or a known action on GET.
//   bare    no frame and no mark, even when it stays a link: every `text` address, a nested address in a value, a program's
//           API path, embedded credentials.
//   href    what a link may open: without credentials; a Hub page rebuilt to a fixed shape (page and selection key only).
//
// ACTING_NAMES is kept by hand on purpose and is not the catalogue's refused list: that list mixes danger with "the builder
// owns this choice" (terminal_id), and the catalogue accepts `panel` and `iframe_url`, which frame any site. A test sorts
// every catalogue parameter, so a new one cannot arrive unread.
import { familyDomains } from './hosts';

export const LINK_PROGRAMS: readonly string[] = ['agent', 'terminal', 'display', 'files', 'browser', 'code', 'sqlite', 'notes'];
export const LINK_KIT_HOSTS: readonly string[] = ['daemon', 'watch', 'pipe', 'cron', 'notifications', 'curl', 'run', 'logs', 'tunnel', 'vm', 'ssh', 'cdp', 'egress'];

/** Acting on any Hoody host, in any family. Written as normalised names (lower case, `-` as `_`, no `[]`); a final `*` is a prefix. */
export const ACTING_NAMES: readonly string[] = [
  'arg', 'cmd', 'cwd_auto_create', 'desktop_env', 'env_inject', 'iframe_url', 'notification_server_url', 'open_url',
  'page_loader_path', 'panel', 'proxy_domain', 'remote_logging', 'shell', 'socks5_*', 'ssh_*', 'startup_script',
  'welcome_iframe_url',
];
/** Acting on a program's own host only. Ordinary words elsewhere: `?user=` or `?reset=1` on someone's own site on a port is theirs.
 *  An alias stays a plain link with these until its target is resolved. */
export const PROGRAM_ACTING_NAMES: readonly string[] = [
  'action', 'agent', 'app', 'debug', 'desktop', 'env', 'ephemeral', 'pid', 'redirect', 'reset', 'restart', 'sharing', 'sql', 'steal',
  'user', 'welcome',
];
/** The program-host names too common for every port, still acting on the terminal's own port. */
const TERMINAL_PORT = '7681';
const TERMINAL_PORT_NAMES: readonly string[] = ['env', 'redirect', 'reset'];
/** The actions a program answers on GET (hoody-browser openapi.json): an address that runs one when opened. */
const ACTION_PATHS: readonly string[] = ['/api/v1/browser/restart', '/api/v1/browser/start', '/api/v1/browser/stop'];

/** A Hub page's query keeps only what selects something. `open_realm`, `add`, `cid`, `do`, `drawer`, `edit`, `new`, `connect`,
 *  `share`, `settings` and anything else are gone. */
const HUB_KEEP: readonly string[] = ['b', 'computer', 'realm', 'sel'];
const HUB_PAGE = '/auth/home';

export type LinkFamily = 'alias' | 'hub' | 'kit' | 'local' | 'outside' | 'port' | 'program' | 'script' | 'shaped';

export interface LinkEnv {
  /** The page's proxy domain, '' when it has none. */
  readonly proxy: string;
  /** This Hub's origin, '' outside a browser. */
  readonly origin: string;
}

export interface LinkRead {
  readonly family: LinkFamily;
  /** The real host: lower case, no trailing dot. */
  readonly host: string;
  readonly href: string;
  /** From the host label, when it has that shape. `name` is the program, kit, `http`, `https` or `exec`; the `t` alias reads `terminal`. */
  readonly project?: string;
  readonly computer?: string;
  readonly name?: string;
  readonly n?: string;
  readonly server?: string;
  /** The acting name found, normalised. */
  readonly acting: string | null;
  readonly action: boolean;
  readonly nested: boolean;
  readonly api: boolean;
  readonly credentials: boolean;
  readonly text: boolean;
  readonly bare: boolean;
}

const LOCAL = (h: string) => h === 'localhost' || h.endsWith('.localhost') || /^127\./.test(h) || h === '0.0.0.0' || h === '[::1]';
const NAMES = ['http', 'https', 'exec', 't', ...LINK_PROGRAMS, ...LINK_KIT_HOSTS].join('|');
const LABEL = new RegExp(`^(.+)-([^-]+)-(${NAMES})-(\\d+)$`);
const SHAPED = new RegExp(`^([0-9a-f]{24})-([0-9a-f]{24})-(${NAMES})-(\\d+)$`);
const MAX_NESTING = 3;
const DECODE_ROUNDS = 4;

const normalName = (raw: string) => raw.trim().toLowerCase().replace(/-/g, '_').replace(/(?:\[\])+$/, '');
const onList = (list: readonly string[], name: string) => list.some((x) => (x.endsWith('*') ? name.startsWith(x.slice(0, -1)) : x === name));

const decode = (s: string): string => {
  try { return decodeURIComponent(s); } catch { return s; }
};

/** Name and value pairs of a query, split on `&` and `;`, each decoded once. */
function pairs(query: string): [string, string][] {
  const out: [string, string][] = [];
  for (const part of query.split(/[&;]/)) {
    if (!part) continue;
    const at = part.indexOf('=');
    const spaced = (x: string) => decode(x.replace(/\+/g, ' '));
    out.push(at < 0 ? [spaced(part), ''] : [spaced(part.slice(0, at)), spaced(part.slice(at + 1))]);
  }
  return out;
}

/** The query of a URL, and of its fragment when that holds name=value pairs: a page can read either. */
function allPairs(u: URL): [string, string][] {
  const hash = u.hash.slice(1);
  const q = hash.indexOf('?');
  const inHash = q >= 0 ? hash.slice(q + 1) : hash.includes('=') ? hash : '';
  return [...pairs(u.search.slice(1)), ...pairs(inHash)];
}

// The URL parser removes tabs and newlines and reads backslashes as slashes, so the shapes here do too.
const URL_LIKE = /^(?:[a-z][a-z0-9+.-]*:[\\/]{2}|[\\/]{2}[^\\/]|(?:javascript|data|vbscript):)/i;
const urlLike = (raw: string): string | null => {
  let s = raw.replace(/[\t\n\r]/g, '');
  let i = 0;
  while (i < s.length && s.charCodeAt(i) <= 32) i++;
  s = s.slice(i);
  return URL_LIKE.test(s) ? s : null;
};
const base64Text = (s: string): string | null => {
  const t = s.replace(/ /g, '+').replace(/-/g, '+').replace(/_/g, '/');
  if (!/^[A-Za-z0-9+/]{8,}={0,2}$/.test(t)) return null;
  try { return atob(t.replace(/=+$/, '').padEnd(Math.ceil(t.replace(/=+$/, '').length / 4) * 4, '=')); } catch { return null; }
};

/** The address a query value decodes to, percent-encoded or base64 a few times over, or null. */
function nestedAddress(value: string): string | null {
  let v = value;
  for (let i = 0; i < DECODE_ROUNDS; i++) {
    const found = urlLike(v);
    if (found) return found;
    const b64 = base64Text(v);
    const inB64 = b64 === null ? null : nestedAddress(b64);
    if (inB64) return inB64;
    const next = decode(v);
    if (next === v) return null;
    v = next;
  }
  return urlLike(v);
}

const pathOf = (u: URL) => decode(u.pathname).toLowerCase().replace(/\/{2,}/g, '/').replace(/(.)\/$/, '$1');

const hostIdentity = (host: string, proxy: string): Pick<LinkRead, 'family' | 'project' | 'computer' | 'name' | 'n' | 'server'> => {
  if (LOCAL(host)) return { family: 'local' };
  const domain = familyDomains(proxy).find((d) => host.endsWith('.' + d));
  if (!domain && host !== '' && !familyDomains(proxy).includes(host)) {
    const m = SHAPED.exec(host.split('.')[0] ?? '');
    return m ? { family: 'shaped', project: m[1], computer: m[2], name: m[3] === 't' ? 'terminal' : m[3], n: m[4], server: host.split('.').slice(1).join('.') } : { family: 'outside' };
  }
  if (!domain) return { family: 'alias' };
  const labels = host.slice(0, -domain.length - 1).split('.');
  const m = labels.length >= 2 ? LABEL.exec(labels[0] as string) : null;
  if (!m) return { family: 'alias' };
  const name = m[3] === 't' ? 'terminal' : (m[3] as string);
  const family: LinkFamily = name === 'http' || name === 'https' ? 'port' : name === 'exec' ? 'script' : LINK_PROGRAMS.includes(name) ? 'program' : 'kit';
  return { family, project: m[1], computer: m[2], name, n: m[4], server: labels.slice(1).join('.') };
};

/** An origin as the browser reaches it, a trailing dot on the host dropped: `hub.example.` is the Hub too. */
const originKey = (u: URL) => `${u.protocol}//${u.hostname.toLowerCase().replace(/\.+$/, '')}${u.port ? ':' + u.port : ''}`;
const sameOrigin = (u: URL, origin: string): boolean => {
  try { return originKey(u) === originKey(new URL(origin)); } catch { return false; }
};

/** A Hub page's address in its fixed shape: this origin, the page path, and the selection keys in the order they came. */
function hubHref(u: URL, origin: string): string {
  const hash = u.hash.slice(1);
  const q = hash.indexOf('?');
  const page = q >= 0 ? hash.slice(0, q) : hash;
  const base = origin + HUB_PAGE;
  if (!/^(?:\/[\w.~%:@-]+)+\/?$/.test(page)) return base;
  const keep = new URLSearchParams();
  for (const [k, v] of pairs(q >= 0 ? hash.slice(q + 1) : '')) if (HUB_KEEP.includes(k) && !keep.has(k)) keep.set(k, v);
  const query = keep.toString();
  return `${base}#${page}${query ? '?' + query : ''}`;
}

function read(raw: string, env: LinkEnv, depth: number): LinkRead | null {
  let u: URL;
  try { u = new URL(raw.trim()); } catch { return null; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  const credentials = u.username !== '' || u.password !== '';
  u.username = '';
  u.password = '';
  const host = u.hostname.toLowerCase().replace(/\.+$/, '');
  const isHub = env.origin !== '' && sameOrigin(u, env.origin) && u.pathname.replace(/\/$/, '') === HUB_PAGE;
  if (isHub) return { family: 'hub', host, href: hubHref(u, env.origin), acting: null, action: false, nested: false, api: false, credentials, text: false, bare: credentials };
  const id = hostIdentity(host, env.proxy);
  let acting: string | null = null;
  let action = false;
  let nested = false;
  let api = false;
  if (id.family !== 'outside') {
    const path = pathOf(u);
    action = ACTION_PATHS.includes(path);
    api = id.family === 'program' && /^\/api(?:\/|$)/.test(path);
    const onProgram = id.name !== undefined && LINK_PROGRAMS.includes(id.name);
    const onTerminalPort = id.name === 'http' || id.name === 'https' ? id.n === TERMINAL_PORT : id.family === 'local' && u.port === TERMINAL_PORT;
    for (const [k, v] of allPairs(u)) {
      const name = normalName(k);
      if (acting === null && (onList(ACTING_NAMES, name) || (onProgram && PROGRAM_ACTING_NAMES.includes(name)) || (onTerminalPort && TERMINAL_PORT_NAMES.includes(name)))) acting = name;
      const inner = nestedAddress(v);
      if (inner === null) continue;
      nested = true;
      if (depth >= MAX_NESTING) continue;
      const seen = read(inner.startsWith('/') || inner.startsWith('\\') ? 'https:' + inner : inner, env, depth + 1);
      if (seen?.text) {
        acting ??= seen.acting;
        action ||= seen.action;
      }
    }
  }
  const text = acting !== null || action;
  return { ...id, host, href: u.href, acting, action, nested, api, credentials, text, bare: text || nested || api || credentials };
}

/** What an address is and what the hard blocks say about it, or null for anything but a parseable http(s) address. */
export function readLink(url: string, env: LinkEnv): LinkRead | null {
  return read(url, env, 0);
}

// File names read like domains: `README.md` is not a claim about where a link goes. Some are real top-level domains too; a
// label naming a host there goes unread, the price of `checkout.ts` not gaining a host in every reply.
const FILE_ENDS = new Set(['bash', 'c', 'cfg', 'cjs', 'conf', 'cpp', 'css', 'csv', 'env', 'gif', 'go', 'gz', 'h', 'htm', 'html', 'ini', 'java', 'jpeg', 'jpg', 'js', 'json', 'jsx', 'lock', 'log', 'md', 'mjs', 'pdf', 'php', 'png', 'py', 'rb', 'rs', 'sh', 'sql', 'svg', 'tar', 'toml', 'ts', 'tsx', 'txt', 'vue', 'xml', 'yaml', 'yml', 'zip']);
const HOST_TOKEN = /(?<![\p{L}\p{N}.-])([a-z][a-z0-9+.-]*:\/\/)?(?:[^\s/@]*@)?((?:[\p{L}\p{N}-]+\.)+[\p{L}\p{N}-]+)/gu;
const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/;

const hostOf = (name: string): string => {
  try { return new URL('https://' + name).hostname.toLowerCase(); } catch { return ''; }
};

/** The first host a link's label names that is not the real host or its parent, or null (a subdomain is named: `hub.hoody.com.evil.org`
 *  is evil.org's, but it reads as something else). Compatibility
 *  forms, invisible characters and full stops of other scripts read as what they look like. */
export function labelNamesOtherHost(label: string, host: string): string | null {
  const real = host.toLowerCase().replace(/\.+$/, '');
  const seen = label.normalize('NFKC').replace(/[。｡]/g, '.').replace(/\p{Cf}/gu, '').toLowerCase();
  for (const m of seen.matchAll(HOST_TOKEN)) {
    const name = m[2] as string;
    const end = name.slice(name.lastIndexOf('.') + 1);
    if (!IPV4.test(name) && !/^(?:\p{L}{2,}|xn--[a-z0-9-]+)$/u.test(end)) continue;
    if (!m[1] && FILE_ENDS.has(end)) continue;
    const named = hostOf(name);
    if (named && named !== real && !real.endsWith('.' + named)) return named;
  }
  return null;
}
