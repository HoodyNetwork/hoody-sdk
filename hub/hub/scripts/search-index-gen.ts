// The Jump to deep index: hub/src/pages sources → the virtual module
// virtual:hub-search-index (vite.config.mts searchIndexPlugin), which the palette loads on its first open.
// The palette holds the page titles and manifest commands from the manifests; this adds what only the views render:
// settings sections (SettingsPage), their setting rows (SettingRow), the page tabs, and the FAQ questions (faq.ts). Each
// entry names its page and the tail the palette appends to the page path (?section=, ?tab=, #faq-, a sub-path).
//
// Read from the shared sources, never a hand list: the section objects, rows, tab items and FAQ items are read where the
// views define them, their text from the strings tables the views translate with, at each build, dev load and test
// run: there is no committed copy to go stale. searchIndex is pure (files come through `read`; shell/search tests).
// The one hand-kept part is HOSTS and TAB_HOSTS: where a file is drawn (a view can sit below its page's path, as the AI
// settings view does at /ai/models). Every file that draws a SettingsPage, a whole FAQ or Tabs must be listed.
//
// Fails closed: a SettingsPage, FAQ list or Tabs in a file not listed, a section, row, tab or question whose text is not a
// literal string key, a call that looks like a translator this script cannot resolve, a key its table lacks, an object
// that looks like a section but was not read, a listed file that is gone: throws, and nothing is served.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DeepEntry } from '../src/shell/search/types.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const SRC_DIR = path.join(HERE, '../src');

/** Where a file that draws a SettingsPage or a page's whole FAQ is shown: the tail after its page's path. */
export const HOSTS: Readonly<Record<string, string>> = {
  'pages/account/view.tsx': '',
  // Settings → Models & keys: the AI tab's tab.tsx routes view.tsx at /ai/models.
  'pages/ai/view.tsx': '/models',
  'pages/billing/view.tsx': '',
  'pages/bots/view.tsx': '',
  'pages/computers/view.tsx': '',
  'pages/files/view.tsx': '',
  // The API keys tab (the page path); Frame draws the same FAQ on the SSH and Shared tabs too.
  'pages/keys/parts/KeysTab.tsx': '',
  'pages/keys/parts/Frame.tsx': '',
  'pages/notifications/parts/Learn.tsx': '/learn',
  'pages/programs/view.tsx': '',
  // New realm (/realms/new) draws its page FAQ under the wizard, at the page path.
  'pages/realms/view.tsx': '',
  'pages/referrals/view.tsx': '',
  'pages/scripts/view.tsx': '',
  'pages/support/view.tsx': '',
  'pages/tunnels/view.tsx': '',
  'pages/vault/view.tsx': '',
  'pages/vms/view.tsx': '',
};

/** Every file that draws Tabs: a tail per tab id (the first tab's is the page itself), or null when the tabs are no place
 *  to jump to (they belong to one item, or sit in a drawer or a card). */
export const TAB_HOSTS: Readonly<Record<string, Readonly<Record<string, string>> | null>> = {
  'pages/files/view.tsx': { browse: '', storage: '?tab=storage', transfers: '?tab=transfers', pc: '?tab=pc' },
  'pages/programs/parts/NameCell.tsx': { running: '', apps: '?tab=apps', ports: '?tab=ports' }, // TabsBlock (moved out of view.tsx for the terminal)
  'pages/programs/parts/NameCell.term.tsx': null, // the terminal sibling of TabsBlock: the web file above holds the places
  'pages/notifications/parts/PageTabs.tsx': { inbox: '', notices: '/notices', learn: '/learn' },
  'pages/keys/parts/Frame.tsx': { keys: '', ssh: '/ssh', shared: '/shared' },
  'pages/bots/parts/BotPane.tsx': null, // one Bot's tabs
  'pages/ai/folders/FolderPage.tsx': null, // one folder's tabs
  'pages/board/parts/Strip.tsx': null, // the Board's own strip of boards
  'pages/board/parts/Picker.tsx': null, // the kinds of thing to add, inside the Add to Board picker
  'pages/computers/parts/ConnectProxy.tsx': null, // browser choice inside a drawer
  'pages/computers/parts/ProjectPerms.tsx': null, // one project's tabs, in a drawer
};

/** Row text a translator reads from a value (a state's key), so no word of it can be indexed: listed, never skipped
 *  silently. `<file>|<call as written>`. */
export const VALUE_TEXT: ReadonlySet<string> = new Set([
  'pages/ai/parts/Claude.tsx|tk(card.state)', // the Claude Code status words (installed, needs an update, …)
  'pages/ai/parts/Claude.tsx|tk(card.sel)', // the Use Claude Code choice's words
]);

export type Read = (rel: string) => string | undefined;

/** The two host tables (tests pass their own). */
export interface Hosts {
  hosts: Readonly<Record<string, string>>;
  tabHosts: Readonly<Record<string, Readonly<Record<string, string>> | null>>;
}

const LISTED: Hosts = { hosts: HOSTS, tabHosts: TAB_HOSTS };

const STOP = new Set(
  ('the a an and or of to in on for with by is are be it its this that you your can at as from not no if when then ' +
    'than so do does any all one each what which who how there here will was has have more only also into out up').split(' '),
);

/** NFKD, marks dropped, lowercase: the same fold the palette applies to what is typed (shell/search/match.ts). */
export function fold(text: string): string {
  return text.normalize('NFKD').replace(/\p{M}+/gu, '').toLowerCase();
}

/** Folded words worth matching: placeholders out, short and common words out, each once. */
export function wordsOf(...texts: string[]): string {
  const out = new Set<string>();
  for (const text of texts) {
    const folded = fold(text.replace(/\{\{[^}]*\}\}/g, ' '));
    for (const w of folded.split(/[^\p{L}\p{N}]+/u)) if (w.length >= 3 && !STOP.has(w)) out.add(w);
    // A hyphenated word also as one word (sign-in → signin), so the palette's joined forms find it.
    for (const m of folded.matchAll(/(\p{L}+)-(\p{L}+)/gu)) out.add(m[1]! + m[2]!);
  }
  return [...out].join(' ');
}

const fail = (msg: string): never => {
  throw new Error(`search-index-gen: ${msg}`);
};

/** A string literal, either quote. */
const Q = String.raw`['"]([^'"]+)['"]`;
/** A translator call with a literal key: T('key') → [T, key]. */
const CALL = String.raw`(\w+)\(\s*${Q}`;
/** Names that read as a translator (t, tp, tk, tKeys): a call of one this script cannot resolve fails. */
const TRANSLATOR = /^t(?:[a-z]|[A-Z]\w*)?$/;

/** The end of the brace group that opens at `open` (src[open] === '{'). Counts braces only. */
function groupEnd(src: string, open: number): number {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return i + 1;
  }
  return fail(`unbalanced braces from offset ${open}`);
}

function resolveImport(from: string, spec: string): string | undefined {
  if (spec.startsWith('@kit/')) return path.posix.join('kit', spec.slice(5));
  if (!spec.startsWith('.')) return undefined;
  return path.posix.normalize(path.posix.join(path.posix.dirname(from), spec));
}

function moduleFile(base: string, read: Read): string | undefined {
  for (const ext of ['', '.tsx', '.ts', '/index.tsx', '/index.ts']) if (/\.tsx?$/.test(base + ext) && read(base + ext) !== undefined) return base + ext;
  return undefined;
}

interface Source {
  rel: string;
  src: string;
  /** translator name → its strings table */
  tables: Map<string, Record<string, string>>;
  /** imported name → module path (relative to src, no extension) */
  imports: Map<string, string>;
}

function loadSource(rel: string, read: Read, cache: Map<string, Source>): Source {
  const hit = cache.get(rel);
  if (hit) return hit;
  const src = read(rel) ?? fail(`cannot read ${rel}`);
  const jsons = new Map<string, Record<string, string>>();
  const imports = new Map<string, string>();
  for (const m of src.matchAll(/import\s+(?:type\s+)?(\w+)\s+from\s+['"]([^'"]+\.json)['"]/g)) {
    const file = resolveImport(rel, m[2]!);
    if (!file || !file.endsWith('strings.en.json')) continue;
    jsons.set(m[1]!, JSON.parse(read(file) ?? fail(`${rel}: cannot read ${file}`)) as Record<string, string>);
  }
  for (const m of src.matchAll(/import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+['"](\.[^'"]+)['"]/g)) {
    const file = resolveImport(rel, m[2]!)!;
    for (const name of m[1]!.split(',')) {
      const local = name.trim().replace(/^type\s+/, '').split(/\s+as\s+/).pop()!.trim();
      if (local) imports.set(local, file);
    }
  }
  const tables = new Map<string, Record<string, string>>();
  for (const m of src.matchAll(/(?:const|let)\s+(\w+)\s*=\s*(?:useStrings|makeT)\s*(?:<[^>]*>)?\s*\(\s*(\w+)\s*\)/g)) {
    const table = jsons.get(m[2]!);
    if (table) tables.set(m[1]!, table);
  }
  // A file handed its translator (faq.ts: pageFaq(t: T)) reads with its one table.
  if (!tables.has('t') && jsons.size === 1) tables.set('t', [...jsons.values()][0]!);
  const out: Source = { rel, src, tables, imports };
  cache.set(rel, out);
  // A translator another module exports (ai's logic.ts: `export const tk = (key, vars) => t(key, vars)`): its table.
  for (const [name, base] of imports) {
    if (tables.has(name) || !TRANSLATOR.test(name)) continue;
    const file = moduleFile(base, read);
    if (!file || file === rel) continue;
    const mod = loadSource(file, read, cache);
    const def = new RegExp(String.raw`export\s+const\s+${name}\s*=\s*\([^)]*\)\s*(?::\s*\w+\s*)?=>\s*(\w+)\(`).exec(mod.src);
    const table = def ? mod.tables.get(def[1]!) : undefined;
    if (table) tables.set(name, table);
  }
  return out;
}

function keyText(s: Source, tr: string, key: string, where: string): string {
  const table = s.tables.get(tr) ?? fail(`${s.rel}: ${where}: translator ${tr} reads no strings table this script can find`);
  // A counted key is read as its plural form (the words are the same for every count).
  const value = table[key] ?? table[`${key}_other`];
  if (typeof value !== 'string') fail(`${s.rel}: ${where}: key "${key}" is not in its strings table`);
  return value as string;
}

/** The end of the parenthesised group that opens at `open` (src[open] === '('). Counts parentheses only. */
function parenEnd(src: string, open: number): number {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '(') depth++;
    else if (src[i] === ')' && --depth === 0) return i + 1;
  }
  return fail(`unbalanced parentheses from offset ${open}`);
}

/** The first argument of a call's argument text (top-level comma). */
function firstArg(args: string): string {
  let depth = 0;
  for (let i = 0; i < args.length; i++) {
    const c = args[i];
    if ('([{'.includes(c!)) depth++;
    else if (')]}'.includes(c!)) depth--;
    else if (c === ',' && depth === 0) return args.slice(0, i);
  }
  return args;
}

/** The keys a translator argument can take: a literal, or every branch of a (nested) `cond ? A : B` whose branches are
 *  keys; undefined when some branch is a value. */
function keysOf(arg: string): string[] | undefined {
  const a = arg.trim();
  const lit = /^['"]([^'"]+)['"]$/.exec(a);
  if (lit) return [lit[1]!];
  let depth = 0;
  let quote = '';
  let q = -1;
  let nested = 0;
  for (let i = 0; i < a.length; i++) {
    const c = a[i]!;
    if (quote) {
      if (c === quote) quote = '';
      continue;
    }
    if (c === "'" || c === '"' || c === '`') quote = c;
    else if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) depth--;
    else if (depth === 0 && c === '?' && a[i + 1] !== '.' && a[i + 1] !== '?' && a[i - 1] !== '?') {
      if (q < 0) q = i;
      else nested++;
    } else if (depth === 0 && c === ':' && q >= 0) {
      if (nested > 0) nested--;
      else {
        const yes = keysOf(a.slice(q + 1, i));
        const no = keysOf(a.slice(i + 1));
        return yes && no ? [...yes, ...no] : undefined;
      }
    }
  }
  return undefined;
}

/** The texts of every translator call inside an expression: T('key'), T(cond ? 'a' : 'b'), the plural form of a counted
 *  key. A call of a translator-like name it cannot resolve, a key its table lacks, or a key read from a value (unless
 *  VALUE_TEXT lists the call) fails. */
function literalTexts(s: Source, expr: string): string[] {
  const out: string[] = [];
  for (const m of expr.matchAll(/\b(\w+)\(/g)) {
    const name = m[1]!;
    if (!s.tables.has(name) && !TRANSLATOR.test(name)) continue;
    const open = m.index + m[0].length - 1;
    const arg = firstArg(expr.slice(open + 1, parenEnd(expr, open) - 1)).trim();
    // Every branch must be a key: t(on ? 'a' : 'b') reads both; t(on ? 'a' : state) is a value.
    const keys = keysOf(arg);
    if (!keys) {
      if (VALUE_TEXT.has(`${s.rel}|${name}(${arg})`)) continue;
      return fail(`${s.rel}: ${name}(${arg}) reads its key from a value: list it in VALUE_TEXT, or name the key`);
    }
    for (const k of keys) out.push(keyText(s, name, k, 'row text'));
  }
  return out;
}

/** The props of the JSX tag that starts at `at` (src[at] === '<'): its text up to the tag's own '>'. */
function tagText(src: string, at: number): string {
  let depth = 0;
  for (let i = at + 1; i < src.length; i++) {
    const c = src[i];
    if (c === '{') depth++;
    else if (c === '}') depth--;
    else if (c === '>' && depth === 0) return src.slice(at, i + 1);
  }
  return fail(`unclosed tag at offset ${at}`);
}

/** The expression of prop `name` in a tag's text, without its braces, or undefined. */
function propExpr(tag: string, name: string): string | undefined {
  const m = new RegExp(`\\s${name}=\\{`).exec(tag);
  if (!m) return undefined;
  const open = m.index + m[0].length - 1;
  return tag.slice(open + 1, groupEnd(tag, open) - 1);
}

interface Row {
  label: string;
  words: string[];
}

/** The setting rows a section's content draws: in its own text and in the page's components it uses, three deep. */
function rowsOf(host: Source, span: string, read: Read, cache: Map<string, Source>, pageDir: string): Row[] {
  const rows: Row[] = [];
  const seen = new Set<string>();
  const add = (value: string, words: string[]) => {
    // A label with a placeholder names one item ("Model of {{agent}}"): no place of its own.
    if (value.includes('{{')) return;
    const prev = rows.find((r) => r.label === value);
    if (prev) prev.words.push(...words);
    else rows.push({ label: value, words });
  };
  const visit = (s: Source, text: string, depth: number) => {
    for (const m of text.matchAll(/<SettingRow\b/g)) {
      const tag = tagText(text, m.index);
      const label = propExpr(tag, 'label') ?? fail(`${s.rel}: a SettingRow without a label`);
      const lit = new RegExp(String.raw`^\s*${CALL}\s*(,[\s\S]*)?\)\s*$`).exec(label);
      if (lit) {
        add(
          keyText(s, lit[1]!, lit[2]!, 'SettingRow label'),
          ['help', 'hint', 'info'].flatMap((p) => {
            const e = propExpr(tag, p);
            return e ? literalTexts(s, e) : [];
          }),
        );
        continue;
      }
      // Rows drawn from a list (label={r.label}): the list's own objects, each { label: t('…'), help/hint: … }.
      if (!/^\s*\w+\.label\s*$/.test(label)) fail(`${s.rel}: SettingRow label {${label.trim()}} is neither a literal string key nor a row list's label`);
      let n = 0;
      for (const o of s.src.matchAll(new RegExp(String.raw`\blabel:\s*${CALL}\s*\)`, 'g'))) {
        const open = s.src.lastIndexOf('{', o.index);
        const obj = s.src.slice(open, groupEnd(s.src, open));
        const words = [...obj.matchAll(/\b(?:help|hint|info):\s*([^\n]*?)(?=,\s*\w+:|\s*\}$)/g)].flatMap((e) => literalTexts(s, e[1]!));
        add(keyText(s, o[1]!, o[2]!, 'row list label'), words);
        n++;
      }
      if (n === 0) fail(`${s.rel}: SettingRow label {${label.trim()}} names a row list this script cannot read`);
    }
    if (depth === 3) return;
    for (const m of text.matchAll(/<([A-Z]\w*)\b/g)) {
      const base = s.imports.get(m[1]!);
      if (!base || !base.startsWith(pageDir)) continue;
      const file = moduleFile(base, read);
      if (!file || seen.has(`${file}:${m[1]}`)) continue;
      seen.add(`${file}:${m[1]}`);
      const next = loadSource(file, read, cache);
      visit(next, next.src, depth + 1);
    }
  };
  visit(host, span, 0);
  return rows;
}

const hostOf = (h: Hosts, rel: string, what: string): string => h.hosts[rel] ?? fail(`${rel} draws ${what}: add where it is shown to HOSTS`);

function sections(h: Hosts, rel: string, read: Read, cache: Map<string, Source>, page: string, out: DeepEntry[]): void {
  const tail = hostOf(h, rel, 'a SettingsPage');
  const s = loadSource(rel, read, cache);
  if (/<SettingsPage\b[^>]*\ssectionParam=/.test(s.src)) fail(`${rel}: a SettingsPage with its own sectionParam`);
  const spans: Array<[number, number]> = [];
  const rx = new RegExp(String.raw`\{\s*id:\s*['"]([a-z0-9-]+)['"],\s*(?:wide:\s*true,\s*)?title:\s*${CALL}\s*\)`, 'g');
  for (const m of s.src.matchAll(rx)) {
    const end = groupEnd(s.src, m.index);
    spans.push([m.index, end]);
    const title = keyText(s, m[2]!, m[3]!, `section ${m[1]}`);
    const to = `${tail}${tail.includes('?') ? '&' : '?'}section=${m[1]}`;
    const span = s.src.slice(m.index, end);
    const description = new RegExp(String.raw`description:\s*${CALL}\s*\)`).exec(span);
    const section: DeepEntry = { page, kind: 'section', label: title, to, words: wordsOf(description ? keyText(s, description[1]!, description[2]!, 'section description') : '') };
    out.push(section);
    for (const r of rowsOf(s, span, read, cache, path.posix.join('pages', page))) {
      // A row named as its section (Password in Password) is the section: its words join the section's.
      if (fold(r.label) === fold(title)) section.words = wordsOf(section.words, ...r.words);
      else out.push({ page, kind: 'setting', label: r.label, to, under: title, words: wordsOf(...r.words) });
    }
  }
  if (spans.length === 0) fail(`${rel}: a SettingsPage whose sections this script cannot read`);
  // An object with an id and content that was not read as a section (its title not a literal key): fail, never skip.
  for (const m of s.src.matchAll(/\{\s*id:\s*['"]([^'"]+)['"]/g)) {
    if (spans.some(([a, b]) => m.index >= a && m.index < b)) continue;
    const obj = s.src.slice(m.index, groupEnd(s.src, m.index));
    if (/^\{[^{]*\bcontent:/.test(obj) && /\btitle:/.test(obj)) fail(`${rel}: section "${m[1]}" has a title that is not a literal string key`);
  }
}

function tabs(h: Hosts, rel: string, read: Read, cache: Map<string, Source>, page: string, out: DeepEntry[]): void {
  if (!(rel in h.tabHosts)) fail(`${rel} draws Tabs: add it to TAB_HOSTS (its tabs' tails, or null when they are no place)`);
  const tails = h.tabHosts[rel];
  if (!tails) return;
  const s = loadSource(rel, read, cache);
  const items = [...s.src.matchAll(/<Tabs\b/g)].map((m) => propExpr(tagText(s.src, m.index), 'items') ?? '').join('\n');
  const found = new Set<string>();
  // `{ id: 'x', label: t('…') }`, or a local helper `item('x', t('…'))` (keys' Frame).
  const rx = new RegExp(String.raw`(?:\{\s*id:\s*|\b\w+\s*\(\s*)['"]([a-z0-9-]+)['"],\s*(?:label:\s*)?${CALL}\s*\)`, 'g');
  for (const m of items.matchAll(rx)) {
    const tail = tails[m[1]!] ?? fail(`${rel}: tab "${m[1]}" has no tail in TAB_HOSTS`);
    found.add(m[1]!);
    out.push({ page, kind: 'tab', label: keyText(s, m[2]!, m[3]!, `tab ${m[1]}`), to: tail, words: '' });
  }
  for (const id of Object.keys(tails)) if (!found.has(id)) fail(`${rel}: TAB_HOSTS names tab "${id}", which the file does not draw as a literal item`);
  // An item left after the read ones are taken out is one this script could not read: fail, never skip.
  const rest = items.replace(rx, '');
  // A helper read once (item('ssh', t('…'))) called again with an id that is not a literal is unread too.
  const helpers = [...new Set([...items.matchAll(/\b(\w+)\s*\(\s*['"][a-z0-9-]+['"]\s*,/g)].map((m) => m[1]!))];
  const again = helpers.length > 0 && new RegExp(String.raw`\b(?:${helpers.join('|')})\s*\(`).test(rest);
  if (again || /\bid:|\b\w+\(\s*['"][a-z0-9-]+['"]\s*,/.test(rest)) fail(`${rel}: a tab this script cannot read (each as { id: '…', label: t('…') })`);
}

/** A file draws the page's whole FAQ: faq={{ items }}, faq={cond ? { items: … } : …}, <Faq faq={{ items: … }} />. */
const WHOLE_FAQ = /\bfaq=\{[^}]*?\{\s*items\b/;

function faq(h: Hosts, page: string, files: readonly string[], read: Read, cache: Map<string, Source>, out: DeepEntry[]): void {
  const rel = `pages/${page}/faq.ts`;
  if (read(rel) === undefined) return;
  const s = loadSource(rel, read, cache);
  const drawn = files.filter((f) => f.startsWith(`pages/${page}/`) && f.endsWith('.tsx') && WHOLE_FAQ.test(read(f) ?? ''));
  if (drawn.length === 0) fail(`${rel}: no file of the page draws its questions as a list (faq={{ items }})`);
  const tails = [...new Set(drawn.map((f) => hostOf(h, f, 'the page FAQ')))];
  // The page path when one of them is shown there, else the one place they are shown.
  const tail = tails.includes('') ? '' : tails.length === 1 ? tails[0]! : fail(`${rel}: its questions are drawn at ${tails.join(', ')}, none at the page path`);
  let n = 0;
  // An answer is one key, or a condition choosing between two keys (the form the page FAQ contract allows, e.g. a
  // host's own answer: `a: cond ? t('…') : t('…')`); a two-key answer's words are both texts'.
  const rx = new RegExp(String.raw`\{\s*id:\s*['"]([a-zA-Z0-9]+)['"],\s*q:\s*${CALL}\s*\),\s*a:\s*(?:${CALL}\s*\)|[^?{}\n]*\?\s*${CALL}\s*\)\s*:\s*${CALL}\s*\))`, 'g');
  for (const m of s.src.matchAll(rx)) {
    n++;
    const where = `faq ${m[1]}`;
    const words = m[4] !== undefined ? wordsOf(keyText(s, m[4], m[5]!, where)) : wordsOf(keyText(s, m[6]!, m[7]!, where), keyText(s, m[8]!, m[9]!, where));
    out.push({ page, kind: 'faq', label: keyText(s, m[2]!, m[3]!, where), to: `${tail}#faq-${m[1]}`, words });
  }
  const questions = [...s.src.matchAll(/\bq:\s/g)].length;
  if (questions !== n) fail(`${rel}: ${questions} questions, ${n} read (each item as { id: '…', q: t('…'), a: t('…') }, or a: cond ? t('…') : t('…'))`);
}

/** Every file under pages/ (sources only, no tests), as paths relative to src. */
export function pageFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(path.join(SRC_DIR, dir), { withFileTypes: true })) {
      const rel = path.posix.join(dir, e.name);
      if (e.isDirectory()) walk(rel);
      else if (/\.tsx?$/.test(e.name) && !/\.(test|spec)\.tsx?$/.test(e.name) && !/(^|\/)(shots|fixtures)\.ts$/.test(rel)) out.push(rel);
    }
  };
  walk('pages');
  return out.sort();
}

/** The deep index of the pages in `files` (paths relative to src), read through `read`. */
export function searchIndex(files: readonly string[], read: Read, h: Hosts = LISTED): DeepEntry[] {
  const cache = new Map<string, Source>();
  const out: DeepEntry[] = [];
  const pages = [...new Set(files.filter((f) => /^pages\/[^/]+\/page\.ts$/.test(f)).map((f) => f.split('/')[1]!))].sort();
  for (const page of pages) {
    for (const rel of files.filter((f) => f.startsWith(`pages/${page}/`))) {
      const src = read(rel) ?? '';
      if (/<SettingsPage\b/.test(src)) sections(h, rel, read, cache, page, out);
      if (/<Tabs\b/.test(src)) tabs(h, rel, read, cache, page, out);
    }
    faq(h, page, files, read, cache, out);
  }
  return out;
}

/** A host named here whose file is gone: the plugin and the command line refuse it, so the tables stay true. */
export function checkHosts(files: readonly string[]): void {
  for (const f of [...Object.keys(HOSTS), ...Object.keys(TAB_HOSTS), ...[...VALUE_TEXT].map((x) => x.split('|')[0]!)])
    if (!files.includes(f)) fail(`${f} is named here but is gone`);
}

/** The virtual module's text: plain JavaScript, one frozen array. */
export function searchIndexModule(entries: readonly DeepEntry[]): string {
  return `export const DEEP = Object.freeze(${JSON.stringify(entries)});\n`;
}

export function readSrc(rel: string): string | undefined {
  try {
    return fs.readFileSync(path.join(SRC_DIR, rel), 'utf8');
  } catch {
    return undefined;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // `bun hub/scripts/search-index-gen.ts`: what the palette would hold, one line per entry (a check by eye).
  checkHosts(pageFiles());
  for (const e of searchIndex(pageFiles(), readSrc)) process.stdout.write(`${e.page}\t${e.kind}\t${e.label}\t${e.to}\n`);
}
