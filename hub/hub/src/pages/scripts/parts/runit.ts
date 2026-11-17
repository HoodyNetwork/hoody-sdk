// How to call a script from a terminal: the hoody CLI command and a curl line, built from
// the script's own computer, folder and address. Facts:
// - `hoody exec <name>` mounts each script of folder 1 as a command named from its route (the CLI's
//   openApiPathToName, typed or not); names the exec group reserves are dropped. Folder 1 only: the CLI has no
//   exec folder parameter.
// - A script with a schema (a `<name>.openapi.json` beside it, as hoody-exec reads it) gets typed flags and no --header,
//   so the Hub shows its curl line only.
// - A script with a Key checks X-Token (hoody-exec's own check). The Hub never shows a key: the line carries a
//   placeholder, on screen and in the copy.
// - Nothing is ever typed into a terminal: which file a route reaches depends on the kit's
//   resolver (foo.ts before foo/index.ts, .ts before .js) and on files the listing may leave out, so the Hub can't prove a line
//   reaches this script alone. The person reads the lines, copies one and runs it.
import { cliCommand, maskId, type PlatformHosts } from '@kit';
import { execOf, inFolder, isCatchAll, isScript, routeOf } from '../logic';

export const KEY_PLACEHOLDER = '<your key>';
const MAX_NAME = 64;
const NAME_RE = /^[a-z0-9-]+$/;
const RESERVED = new Set([
  'scripts', 'namespaces', 'logs', 'templates', 'schedules', 'sdk', 'magic-comments', 'packages', 'openapi', 'routes', 'state', 'validate', 'system', 'health', 'open', 'help',
  'admin', 'internal', 'private', 'hidden', 'staff', 'ops', 'root', 'sudo',
]);

/** A route's variable part as the exec scanner reads it (`[name]`, dots included; `[...rest]` is a catch-all). */
const PARAM = /\[(?!\.\.\.)([^\]/]+)\]/g;
/** Every variable part of a route, catch-alls included (`[name]`, `[...name]`, `[[...name]]`). Each one
 *  is a value the person fills in: the line shows it as <name> and sets `fill`. */
const ANY_PARAM = /\[\[\.\.\.([^\]/]+)\]\]|\[\.\.\.([^\]/]+)\]|\[([^\]/]+)\]/g;
/** A variable part the Hub writes into a command: plain characters only, so a placeholder never carries shell syntax. */
const PARAM_SAFE = /^[A-Za-z0-9_.-]+$/;
/** The methods that name a typed route's commands when it has more than one operation: `<name>-<method>`, and then no bare
 *  `<name>`. */
const METHODS = ['get', 'post', 'put', 'patch', 'delete'];

/** The exec route as the CLI's discovery names it: `[id]` segments become `{id}`. */
const routePathOf = (route: string): string => route.replace(PARAM, '{$1}');

/** A route's name as the CLI's openApiPathToName makes it, before the exec group drops a reserved one. */
function baseName(route: string): string {
  let n = routePathOf(route)
    .replace(/\{\.{0,3}([^}]+)\}/g, '$1')
    .replace(/[/\\]+/g, '-')
    .replace(/[^a-zA-Z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
  if (n.length > MAX_NAME) n = n.slice(0, MAX_NAME).replace(/-$/, '');
  return n;
}

/** The CLI's command name for a route (openApiPathToName), or null when it mounts none. */
export function execCommandName(route: string): string | null {
  const n = baseName(route);
  if (!n || !NAME_RE.test(n) || RESERVED.has(n)) return null;
  return n;
}

/** The route's variable parts, in order (`/orders/[id]` → ['id']). */
const paramsOf = (route: string): string[] => [...route.matchAll(PARAM)].map((m) => m[1]!);

/** Whether the script has a schema: true when the listing shows its companion, else null. The listing can skip files it
 *  cannot read (hoody-exec's own behaviour), so a missing companion never proves there is none. */
export function typedOf(path: string, rows: readonly { path: string }[]): true | null {
  const companion = path.replace(/\.(?:ts|js)$/i, '') + '.openapi.json';
  return rows.some((r) => r.path === companion) ? true : null;
}

/** Whether another folder-1 script can get the same command name. Catch-alls count too: the scanner reads `[...foo]` as
 *  `{foo*}`, which the CLI names `foo`. The CLI mounts the first claim only, and it mounts typed
 *  commands before the rest, so the command could call the other script. A typed route
 *  with several operations claims `<name>-<method>`. The listing never proves a script untyped (typedOf), so every
 *  other script claims its name and its five method names. */
function nameClash(path: string, name: string, rows: readonly { path: string }[]): boolean {
  return rows.some((r) => {
    if (r.path === path || !isScript(r.path) || execOf(r.path) !== 1) return false;
    const route = routeOf(r.path);
    if (route === null) return false;
    const other = baseName(route);
    return other !== '' && (other === name || METHODS.some((m) => `${other}-${m}` === name));
  });
}

export type RunNote = 'folder' | 'typed' | 'typedKeyed' | 'unknownKeyed' | 'noName' | 'clash' | 'unroutable';
export interface RunLine { code: string; copy: string }
export interface RunLines {
  /** The CLI command, or null with a note saying why only curl is shown. */
  cli: RunLine | null;
  /** The curl line, or null when the script can't be reached by address (note 'unroutable'). */
  curl: RunLine | null;
  note: RunNote | null;
  /** The line has `<name>` placeholders to fill in (a dynamic route, a catch-all included). */
  fill: boolean;
}

/** The characters the exec router serves in an address (hoody-exec's own rule); anything else answers 400, and in
 *  a curl line `#`, `?` and `%` would also change the path it reaches. A variable part counts as one plain character here. */
const ROUTABLE = /^[A-Za-z0-9_./-]*$/;

const q = (s: string): string => `'${s.replace(/'/g, `'\\''`)}'`;

/** The lines for one script. `origin`: the computer's exec address (https://…-exec-1.…, no path). */
export function runLines(
  item: { path: string; route: string; keyed: boolean },
  comp: { id: string; origin: string; rows: readonly { path: string }[] },
  hosts: PlatformHosts,
): RunLines {
  const params = paramsOf(item.route);
  const fill = [...item.route.matchAll(ANY_PARAM)].length > 0;
  const shownRoute = item.route.replace(ANY_PARAM, (_m, a?: string, b?: string, c?: string) => `<${a ?? b ?? c}>`);
  if (!ROUTABLE.test(item.route.replace(ANY_PARAM, 'x'))) return { cli: null, curl: null, note: 'unroutable', fill: false };
  const keyH = item.keyed ? ` -H ${q(`X-Token: ${KEY_PLACEHOLDER}`)}` : '';
  // -g: curl reads [] and {} in an address as ranges and lists, even quoted; the line means the one address it shows.
  const curlCode = `curl -g${keyH} ${q(comp.origin + shownRoute)}`;
  const curl = { code: curlCode, copy: curlCode };

  const name = inFolder(item.path) !== null && !isCatchAll(item.path) && params.every((p) => PARAM_SAFE.test(p)) ? execCommandName(item.route) : null;
  let note: RunNote | null = null;
  if (execOf(item.path) !== 1) note = 'folder';
  else if (!name) note = 'noName';
  else if (nameClash(item.path, name, comp.rows)) note = 'clash';
  else {
    const typed = typedOf(item.path, comp.rows);
    if (typed === true) note = item.keyed ? 'typedKeyed' : 'typed';
    else if (item.keyed) note = 'unknownKeyed';
  }
  if (note) return { cli: null, curl, note, fill };

  // A keyed script never gets here: its schema is never proven absent, and a typed command takes no --header.
  const args = params.map((p) => ` <${p}>`).join('');
  const cmd = (id: string) => cliCommand(`--computer ${id} exec ${name}${args}`, hosts);
  const copy = cmd(comp.id);
  return { cli: { code: cmd(maskId(comp.id)), copy }, curl, note: null, fill };
}
