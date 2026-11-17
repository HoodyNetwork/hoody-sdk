// The conformance row files themselves: pages/<page>/conformance.allow.ts and allow.shared.ts.
// A row names a rule that exists, a file that exists in its own page (or outside pages/ for a shared row),
// and a value of the rule's shape. The rules' own tests judge whether a row is still needed.
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ANATOMY_RULES, COUNT_RULES, DOM_RULES, FILE_RULES, PAGE_RULES, RULE_IDS, pageAllows, sharedAllow, splitLayoutKey } from './allow';

const SRC = join(import.meta.dirname, '..', '..');
// `hub:check --page <id>` (HUB_CHECK_PAGE) judges only that page's row file; shared rows only in whole-hub runs.
const only = process.env.HUB_CHECK_PAGE;
const isFile = (p: string): boolean => existsSync(p) && statSync(p).isFile();
const isCount = (v: unknown): boolean => typeof v === 'number' && Number.isInteger(v) && v >= 1;
const isWhy = (v: unknown): boolean => typeof v === 'string' && v.trim() !== '';
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Problems of one rule's rows: `base` is the folder its keys are relative to (hub/src for shared rows). */
function problems(where: string, rule: string, rows: unknown, base: string, shared: boolean): string[] {
  const bad = (row: string, why: string) => `${where}: ${rule}${row ? ` '${row}'` : ''}: ${why}`;
  if (!RULE_IDS.has(rule)) return [bad('', `no such rule (known: ${[...RULE_IDS].join(', ')})`)];
  if ((PAGE_RULES as readonly string[]).includes(rule)) {
    if (shared) return [bad('', 'a whole-page rule belongs in that page\'s file')];
    return rows === true ? [] : [bad('', 'the value is true (the whole page)')];
  }
  if (shared && !(FILE_RULES as readonly string[]).includes(rule) && !(COUNT_RULES as readonly string[]).includes(rule) && !(ANATOMY_RULES as readonly string[]).includes(rule) && rule !== 'literal.hubText')
    return [bad('', 'a pages/ scanner rule belongs in the page\'s file')];
  if (!isObject(rows)) return [bad('', 'rows are an object keyed by file')];
  if ((DOM_RULES as readonly string[]).includes(rule)) return domProblems(where, rule, rows, shared);
  const out: string[] = [];
  if (Object.keys(rows).length === 0) out.push(bad('', 'no rows: drop the rule'));
  // layout.* and ui.* rows share one shape: '<file>[ overlay:<id>]' -> count (allow.ts ANATOMY_RULES).
  const isAnatomy = (ANATOMY_RULES as readonly string[]).includes(rule);
  for (const [key, value] of Object.entries(rows)) {
    if (isAnatomy && key.includes(' ') && !/^[^ ]+ overlay:[A-Za-z0-9][A-Za-z0-9._-]*$/.test(key)) out.push(bad(key, 'the key is <file> or <file> overlay:<overlayId>'));
    const file = isAnatomy ? splitLayoutKey(key).file : rule === 'dataTable.noRefresh' ? key.replace(/:\d+$/, '') : key;
    if (rule === 'dataTable.noRefresh' && file === key) out.push(bad(key, 'the key is <file>:<line>'));
    if (file.startsWith('/') || file.split('/').includes('..') || file.split('/').includes('.')) out.push(bad(key, 'a plain relative path'));
    else if (shared && file.startsWith('pages/')) out.push(bad(key, 'a page row belongs in pages/<page>/conformance.allow.ts'));
    else if (!isFile(join(base, file))) out.push(bad(key, `no such file ${shared ? 'hub/src/' : `hub/src/${base.slice(SRC.length + 1)}/`}${file}`));
    const shape =
      isAnatomy ? isCount(value)
      : (FILE_RULES as readonly string[]).includes(rule) ? value === true
      : (COUNT_RULES as readonly string[]).includes(rule) ? isCount(value)
      : rule === 'literal.hubText' ? Array.isArray(value) && value.length === 2 && isCount(value[0]) && isWhy(value[1])
      : rule === 'dataView' ? Array.isArray(value) && value.length > 0 && value.every(isWhy)
      : rule === 'dataTable.noRefresh' ? isWhy(value)
      : rule === 'noarg.allowed' ? isObject(value) && Object.keys(value).length > 0 && Object.values(value).every(isWhy)
      : rule === 'noarg.pending' ? isObject(value) && isWhy(value.owner) && Array.isArray(value.calls) && value.calls.length > 0 && value.calls.every(isWhy)
      : false;
    if (!shape) {
      const want: Record<string, string> = {
        'literal.hubText': '[count >= 1, a non-empty why]',
        dataView: 'a non-empty list of function names',
        'dataTable.noRefresh': 'a non-empty why',
        'noarg.allowed': '{ call: why } with a non-empty why for each call',
        'noarg.pending': "{ owner: '<owner>', calls: [...] }",
      };
      out.push(bad(key, `the value is ${(FILE_RULES as readonly string[]).includes(rule) ? 'true' : (COUNT_RULES as readonly string[]).includes(rule) || isAnatomy ? 'a whole count >= 1' : want[rule]}`));
    }
  }
  return out;
}

/** layout.dom / layout.dom.browser rows (the DOM gate fills them): { caseId: { signature: count >= 1 } }, on a page's own file only. */
function domProblems(where: string, rule: string, rows: Record<string, unknown>, shared: boolean): string[] {
  const bad = (row: string, why: string) => `${where}: ${rule}${row ? ` '${row}'` : ''}: ${why}`;
  if (shared) return [bad('', 'DOM debt belongs in the page\'s file')];
  const out: string[] = [];
  if (Object.keys(rows).length === 0) out.push(bad('', 'no rows: drop the rule'));
  for (const [id, sigs] of Object.entries(rows)) {
    if (!isObject(sigs) || Object.keys(sigs).length === 0) out.push(bad(id, 'a case holds { signature: count } rows'));
    else for (const [sig, n] of Object.entries(sigs)) if (!isCount(n)) out.push(bad(`${id} ${sig}`, 'the value is a whole count >= 1'));
  }
  return out;
}

describe('conformance allow-list rows', () => {
  it('every page row file has rows of known rules, naming files of its own page, with the rule\'s value shape', () => {
    const bad = pageAllows.filter(({ page }) => !only || page === only).flatMap(({ page, file, allow }) => {
      const rules = Object.entries(allow as Record<string, unknown>);
      if (rules.length === 0) return [`${file}: no rows: delete the file`];
      return rules.flatMap(([rule, rows]) => problems(file, rule, rows, join(SRC, 'pages', page), false));
    });
    expect(bad, 'fix these rows in the named file (rule ids and value shapes: hub/src/app/conformance/allow.ts)').toEqual([]);
  });

  it('allow.shared.ts holds only rows outside pages/, of known rules, with the rule\'s value shape', () => {
    const bad = only ? [] : Object.entries(sharedAllow as Record<string, unknown>).flatMap(([rule, rows]) => problems('app/conformance/allow.shared.ts', rule, rows, SRC, true));
    expect(bad, 'fix these rows in hub/src/app/conformance/allow.shared.ts').toEqual([]);
  });

  it('every row file is where the loader looks (pages/<page>/conformance.allow.ts)', () => {
    // The loader globs pages/*/conformance.allow.ts: a nested or misnamed row file would be ignored silently.
    const files = readdirSync(join(SRC, 'pages'), { recursive: true, encoding: 'utf8' }).map((f) => `pages/${f.split(sep).join('/')}`);
    const stray = files.filter((f) => (!only || f.startsWith(`pages/${only}/`)) && /(?:^|\/)(?:conformance[.-]?allow|[^/]*\.allow)\.[cm]?[jt]sx?$/.test(f) && !/^pages\/[^/]+\/conformance\.allow\.ts$/.test(f));
    expect(stray, 'name the row file pages/<page>/conformance.allow.ts').toEqual([]);
    expect(pageAllows.map(({ file }) => file).sort()).toEqual(files.filter((f) => /^pages\/[^/]+\/conformance\.allow\.ts$/.test(f)).sort());
  });
});
