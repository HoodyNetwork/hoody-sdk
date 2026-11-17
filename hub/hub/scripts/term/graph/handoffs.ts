// handoffs.ts: the ONE hand-off list, derived from the code (it drifts).
//   names  kit barrel names whose terminal sibling's OWN declaration draws <Handoff> (directly or through a top-level
//          helper of that file: scan.ts handoffExports). A name with no sibling is needs-sibling, never a hand-off.
//   sites  every module that draws the kit Handoff (scan.ts drawsHandoff).
//   pages  page ids whose page.ts sets `handoff: { reason, what? }` (the shell draws term/app/pageHandoff.tsx instead).
//   problems (graph R6) a <Handoff> with no reason, an empty literal reason, or a strings key whose text is empty; a
//          page `handoff` whose reason (or what) key has no text in pages/<id>/strings.en.json.
// The R1 "base is not web-only" warning does not apply to a sibling that draws Handoff (rules.ts).
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import type { ModuleGraph } from './build';

export interface Handoffs { names: string[]; sites: string[]; pages: string[]; problems: string[] }

/** The `handoff` object of a page.ts: its reason/what string literals (null when not a literal), or null when unset. */
export function pageHandoff(text: string, file = 'page.ts'): { reason: string | null; what: string | null } | null {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  let found: { reason: string | null; what: string | null } | null = null;
  const visit = (n: ts.Node): void => {
    if (ts.isPropertyAssignment(n) && ts.isIdentifier(n.name) && n.name.text === 'handoff') {
      const r = { reason: null as string | null, what: null as string | null };
      if (ts.isObjectLiteralExpression(n.initializer)) {
        for (const pr of n.initializer.properties) {
          if (!ts.isPropertyAssignment(pr) || !ts.isIdentifier(pr.name)) continue;
          const v = ts.isStringLiteralLike(pr.initializer) ? pr.initializer.text : null;
          if (pr.name.text === 'reason') r.reason = v;
          if (pr.name.text === 'what') r.what = v;
        }
      }
      found = r;
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return found;
}

const readJson = (f: string): unknown => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return undefined; } };

/** A key's text in one strings table: flat key first, then the dotted path. undefined = not in the table. */
function lookup(table: unknown, key: string): string | undefined {
  if (!table || typeof table !== 'object') return undefined;
  const t = table as Record<string, unknown>;
  if (typeof t[key] === 'string') return t[key] as string;
  let cur: unknown = t;
  for (const part of key.split('.')) {
    if (!cur || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return typeof cur === 'string' ? cur : undefined;
}

/** Every English text a key has in the strings tables beside `abs` and in each folder above it, up to `src`. */
export function keyTexts(abs: string, key: string, src: string): string[] {
  const out: string[] = [];
  for (let dir = path.dirname(abs); dir.startsWith(src); dir = path.dirname(dir)) {
    let ents: string[] = [];
    try { ents = fs.readdirSync(dir); } catch { /* gone */ }
    for (const e of ents) {
      if (!/(^|\.)strings\.en\.json$/.test(e)) continue;
      const v = lookup(readJson(path.join(dir, e)), key);
      if (v !== undefined) out.push(v);
    }
    if (dir === src) break;
  }
  return out;
}

export function deriveHandoffs(g: ModuleGraph, barrel: string, pagesDir: string): Handoffs {
  const out: Handoffs = { names: [], sites: [], pages: [], problems: [] };
  const termBarrel = g.termOf(barrel);
  for (const [name, kind] of g.exportsOf('web', barrel)) {
    if (kind === 'type') continue;
    const rt = g.resolveName('term', termBarrel, name);
    const m = rt.identity ? g.mods.get(rt.identity.file) : undefined;
    if (m?.isSibling && m.facts?.handoffExports?.includes(rt.identity!.name)) out.names.push(name);
  }
  for (const m of g.mods.values()) {
    if (m.excluded || !m.facts) continue;
    if (m.facts.drawsHandoff) out.sites.push(m.id);
    for (const r of m.facts.handoffReasons ?? []) {
      const at = `${m.id}:${r.line}`;
      if (r.missing) out.problems.push(`${at} draws <Handoff> with no reason: say why this needs the web, in the caller's strings`);
      else if (r.literal !== undefined && r.literal.trim() === '') out.problems.push(`${at} draws <Handoff> with an empty reason: say why this needs the web, in the caller's strings`);
      else if (r.key !== undefined) {
        const texts = keyTexts(m.abs, r.key, g.src);
        if (texts.length > 0 && texts.every((t) => t.trim() === '')) out.problems.push(`${at} draws <Handoff> with reason key '${r.key}', whose English text is empty: write the reason in its strings file`);
      }
    }
  }
  const pages = path.join(g.hub, pagesDir);
  let ids: string[] = [];
  try { ids = fs.readdirSync(pages).sort(); } catch { /* no pages */ }
  for (const id of ids) {
    const file = path.join(pages, id, 'page.ts');
    let text: string;
    try { text = fs.readFileSync(file, 'utf8'); } catch { continue; }
    const h = pageHandoff(text, file);
    if (!h) continue;
    out.pages.push(id);
    const table = readJson(path.join(pages, id, 'strings.en.json'));
    const text0 = (k: string | null) => (k === null ? '' : (lookup(table, k) ?? '').trim());
    if (text0(h.reason) === '') out.problems.push(`${pagesDir}/${id}/page.ts: handoff.reason must be a string key with text in ${pagesDir}/${id}/strings.en.json`);
    if (h.what !== null && text0(h.what) === '') out.problems.push(`${pagesDir}/${id}/page.ts: handoff.what must be a string key with text in ${pagesDir}/${id}/strings.en.json`);
  }
  out.names.sort();
  out.sites.sort();
  return out;
}
