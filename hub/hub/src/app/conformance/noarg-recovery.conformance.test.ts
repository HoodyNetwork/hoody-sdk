// A page never calls a core source/query hook's no-argument settle() or
// dismiss() to free a hold it SHOWS. Those free only what this very mount sent and still holds, so a
// banner showing an earlier mount's (or a reopened drawer's) hold does nothing on its Dismiss. Pages pass the shown
// hold: dismiss(vars, hold), or held() + dismissHeld(row).
//
// A static scan cannot see a receiver's type, so every page call of `.settle()` / `.dismiss()` with no arguments
// must be listed in its page's conformance.allow.ts, either as noarg.allowed (its receiver is not a
// core source/query hook: a locked.ts control, a page wrapper that names its variables, a page-local machine) or as
// noarg.pending (a core hook still to migrate, with its owner). A new call that is in neither list fails this
// test. A listed call that is gone (a page migrated) passes, so migrating a page needs no edit here; drop its line when
// convenient.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { allowNoargAllowed, allowNoargPending } from './allow';

// `hub:check --page <id>` (HUB_CHECK_PAGE) judges only that page's calls.
const only = process.env.HUB_CHECK_PAGE;
const ALLOWED = allowNoargAllowed();
const PENDING = allowNoargPending();

const NOARG = /[A-Za-z_$][\w$]*(?:\??\.[A-Za-z_$][\w$]*)*\??\.(?:settle|dismiss)\(\s*\)/g;
function sources(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { if (name !== 'test' && name !== 'node_modules') out.push(...sources(p)); continue; }
    if (/\.(ts|tsx)$/.test(name) && !/\.(test|spec)\.(ts|tsx)$/.test(name) && !name.endsWith('.d.ts') && name !== 'conformance.allow.ts') out.push(p);
  }
  return out;
}
/** file → the distinct no-argument settle()/dismiss() expressions it contains. */
function noArgCalls(pagesDir: string): Record<string, string[]> {
  const found: Record<string, string[]> = {};
  for (const f of sources(pagesDir)) {
    const text = readFileSync(f, 'utf8');
    const hits = [...new Set(text.match(NOARG) ?? [])].sort();
    if (hits.length) found[relative(pagesDir, f).split(sep).join('/')] = hits;
  }
  return found;
}

describe('conformance: no page frees a shown hold with a core hook\'s no-argument settle()/dismiss()', () => {
  const found = noArgCalls(join(import.meta.dirname, '..', '..', 'pages'));
  it('every no-argument call is listed as allowed (not a core source/query hook) or pending migration (with its owner)', () => {
    const unlisted: string[] = [];
    for (const [f, calls] of Object.entries(found)) {
      if (only && !f.startsWith(`${only}/`)) continue;
      for (const c of calls) if (!ALLOWED[f]?.[c] && !PENDING[f]?.calls.includes(c)) unlisted.push(`pages/${f}: ${c}`);
    }
    expect(unlisted, 'pass the shown hold (dismiss(vars, hold) or held() + dismissHeld(row)); list a non-core receiver under noarg.allowed, with why, in pages/<page>/conformance.allow.ts').toEqual([]);
  });
});
