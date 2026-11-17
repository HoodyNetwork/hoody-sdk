// Page keys go through
// usePageShortcuts, every var(--x) exists, pages import the @core/@kit barrels only, and layout
// follows the frame's width (no viewport media queries in pages).
// Rules that started with offenders carry an allow-list that may only shrink: a stale entry fails. The rows live in
// pages/<page>/conformance.allow.ts (outside pages/: app/conformance/allow.shared.ts); see app/conformance/allow.ts.
// `hub:check --page <id>` sets HUB_CHECK_PAGE; the per-page checks then judge only that page.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import postcss from 'postcss';
import ts from 'typescript';
import { pageSpecs } from '../../scripts/lib';
import { allowCounts, allowFileOf, allowFiles, allowHubText, allowPages } from './conformance/allow';
import { EXCEPTIONS, NON_VISUAL_KIT_EXPORTS } from './conformance/exceptions';
import { webDrawn } from './conformance/termFiles';

// Read from disk: eager ?raw globs over this many css/ts files fail to load in vitest ("symbol is not a function").
const SRC = join(import.meta.dirname, '..');
const ALL = readdirSync(SRC, { recursive: true, encoding: 'utf8' }).map((f) => f.split(sep).join('/'));
const read = (keep: (file: string) => boolean): Record<string, string> =>
  Object.fromEntries(ALL.filter(keep).map((f) => [f, readFileSync(join(SRC, f), 'utf8')]));
// conformance.allow.ts holds allow-list rows (data naming files), not page code.
const isSource = (f: string) => /\.tsx?$/.test(f) && !/\.(test|spec)\.tsx?$/.test(f) && !f.endsWith('/conformance.allow.ts');
const only = process.env.HUB_CHECK_PAGE;
/** A file is judged in a page-scoped run when it belongs to that page; files outside pages/ only in whole-hub runs. */
const inScope = (file: string): boolean => !only || file.startsWith(`pages/${only}/`);
const lineOf = (text: string, index: number): number => text.slice(0, index).split('\n').length;

const code = read((f) => isSource(f) && (/^pages\/[^/]+\//.test(f) || f.startsWith('kit/layouts/')));
const pageCss = read((f) => f.endsWith('.css') && /^pages\/[^/]+\//.test(f));

// Drops line and block comments: a quoted '--x' in a comment declares nothing. Naive about comment
// markers inside strings, but the `://` of a URL is kept.
const stripComments = (text: string): string => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/.*$/gm, '$1');

/** Fails the files that break a rule and are not allowed, and the allowed files that no longer break it. */
function ratchet(hits: Map<string, string[]>, allowed: ReadonlySet<string>, fix: string) {
  const bad = [...hits.entries()].filter(([file]) => inScope(file) && !allowed.has(file)).flatMap(([file, where]) => where.map((w) => `${file}:${w}`));
  // Soft: a red offender list must not hide the stale entries below it.
  expect.soft(bad, fix).toEqual([]);
  const stale = [...allowed].filter((file) => inScope(file) && !hits.has(file)).map((file) => `${file} (row in ${allowFileOf(file)})`);
  expect(stale, 'these files are clean now: remove their rows from the allow-list file named on each').toEqual([]);
}
function collect(files: Record<string, string>, re: RegExp, keep: (m: RegExpMatchArray) => boolean = () => true): Map<string, string[]> {
  const hits = new Map<string, string[]>();
  for (const [file, text] of Object.entries(files)) {
    for (const m of text.matchAll(re)) if (keep(m)) hits.set(file, [...(hits.get(file) ?? []), String(lineOf(text, m.index ?? 0))]);
  }
  return hits;
}

// A mistyped `--page` would judge zero files and pass: the page must exist.
if (only)
  it('HUB_CHECK_PAGE names a page folder', () =>
    expect(ALL.includes(`pages/${only}/page.ts`), `no hub/src/pages/${only}/page.ts: check the --page id`).toBe(true));

describe('page keys go through usePageShortcuts (std sweep)', () => {
  // A window/document keydown listener ignores the shell's key owner (palette, dialogs, the
  // shortcuts sheet). An element's onKeyDown on a focused widget stays allowed.
  const ALLOWED = allowFiles('std.pageKeys');
  it('no new window/document keydown listener in pages/** or kit/layouts', () => {
    ratchet(
      collect(code, /\b(?:window|document)\.addEventListener\(\s*['"]key(?:down|up|press)['"]/g),
      ALLOWED,
      'register page keys with usePageShortcuts (@kit) instead of a window/document keydown listener',
    );
  });
});

describe('pages follow the frame, not the viewport', () => {
  // The page column changes width with the sidebar and the Ask dock: a viewport query lies about it.
  // Non-viewport media features (prefers-reduced-motion, display-mode, hover, pointer) stay allowed.
  const ALLOWED = allowFiles('std.viewport');
  const VIEWPORT = /\b(?:min-|max-)?(?:width|height|aspect-ratio|orientation)\b/;
  it('no new viewport @media or matchMedia in pages', () => {
    const media = collect(pageCss, /@media([^{]*)\{/g, (m) => VIEWPORT.test(m[1] ?? ''));
    // matchMedia with a literal non-viewport query is fine; a variable query is judged as viewport.
    // The whole literal is judged (a compound query may open with a non-viewport condition).
    const mm = collect(code, /\bmatchMedia\(\s*(?:(['"`])((?:\\.|(?!\1)[^\\])*)\1|([^)]*))/g, (m) => (m[1] === undefined ? true : VIEWPORT.test(m[2] ?? '')));
    ratchet(
      new Map([...media, ...[...mm].filter(([f]) => f.startsWith('pages/'))]),
      ALLOWED,
      'size from the frame: container queries (@container) or the layout props of the kit, not viewport @media / matchMedia',
    );
  });
});

describe('every var(--x) exists (std sweep: --z-dialog, --hx-panel)', () => {
  // An unknown custom property silently falls back (or to nothing): a misspelt token looks fine in
  // review. Known = declared in any hub/src stylesheet, set from code ({ ['--x' as string]: … },
  // setProperty), or set by a library.
  const LIBRARY = new Set(['--trigger-width', '--visual-viewport-height']); // react-aria
  const css = read((f) => f.endsWith('.css'));
  const ts = read(isSource);
  const known = new Set(LIBRARY);
  for (const text of Object.values(css)) for (const m of text.matchAll(/(--[\w-]+)\s*:/g)) known.add(m[1] ?? '');
  for (const text of Object.values(ts).map(stripComments)) {
    for (const m of text.matchAll(/['"`](--[\w-]+)['"`]\s*(?:as\s+\w+\s*)?[\]:,)]/g)) known.add(m[1] ?? '');
    for (const m of text.matchAll(/setProperty\(\s*['"`](--[\w-]+)/g)) known.add(m[1] ?? '');
  }
  it('no stylesheet or style uses a custom property nothing defines', () => {
    const bad: string[] = [];
    for (const [file, text] of Object.entries({ ...css, ...ts })) {
      if (!inScope(file)) continue;
      for (const m of text.matchAll(/var\(\s*(--[\w-]+)/g)) {
        const name = m[1] ?? '';
        // `var(--hx-r-${n})`: a prefix the code completes.
        if (name.endsWith('-') || known.has(name)) continue;
        bad.push(`${file}:${lineOf(text, m.index ?? 0)} ${name}`);
      }
    }
    expect(bad, 'use a token from kit/tokens.css (or declare the property where it is set); a fallback does not excuse a misspelt name').toEqual([]);
  });
});

describe('pages import @core and @kit only (std sweep)', () => {
  // A deep path (@core/changes, @kit/forms/Secret) couples a page to a file layout that the core and
  // kit owners move freely. Strings tables (*.strings.en.json) are data and stay importable, and so do the named
  // entries @kit/pure and @kit/hooks and @core/pure; kit/entries.closure.test.ts
  // keeps them browser-free.
  const ALLOWED = allowFiles('std.deepImport');
  it('no new deep @core/… or @kit/… import in pages', () => {
    const pages = Object.fromEntries(Object.entries(code).filter(([f]) => f.startsWith('pages/')));
    ratchet(
      collect(pages, /\bfrom\s*['"]@(?:core|kit)\/([^'"]+)['"]/g, (m) => !/\.strings\.en\.json$/.test(m[1] ?? '') && !/['"]@(?:kit\/(?:pure|hooks)|core\/pure)['"]$/.test(m[0])),
      ALLOWED,
      "import from '@core' or '@kit' (ask the owner to export it from the barrel if it is missing)",
    );
  });
});

describe('no deprecated DataTable props', () => {
  // hideBelow → meta.priority (2-4), rowActions= → actions with hover: true, rowMenu= → actions,
  // noColumnMenu → noViewMenu. Pages on the list are migrating; the props are deleted from the
  // kit once the list is empty.
  const ALLOWED_PAGES = allowPages('std.dataTableDeprecated');
  const OLD = /\bhideBelow\s*:|\browActions=|\browMenu=|\bnoColumnMenu\b(?=[\s=/>{])/g;
  const comment = /^\s*(\/\/|\*|\/\*)/;
  const users = read((f) => isSource(f) && !/^kit\/data\/DataTable/.test(f));
  const hitsIn = (file: string, text: string) =>
    [...text.matchAll(OLD)]
      .filter((m) => !comment.test(text.slice(text.lastIndexOf('\n', m.index ?? 0) + 1, m.index)))
      .map((m) => `${file}:${lineOf(text, m.index ?? 0)} ${m[0].replace(/[=:]$/, '')}`);
  const pageOf = (f: string) => /^pages\/([^/]+)\//.exec(f)?.[1] ?? null;
  const all = Object.entries(users).flatMap(([f, t]) => hitsIn(f, t));
  it('no deprecated DataTable prop outside the migrating pages', () => {
    const bad = all.filter((h) => {
      const page = pageOf(h);
      return (page === null ? !only : inScope(h)) && !(page !== null && ALLOWED_PAGES.has(page));
    });
    expect(bad, 'use meta.priority, actions (hover: true for hover icons) and noViewMenu').toEqual([]);
  });
  it('the migrating-page list only names pages that still use them (shrink it, then tell the kit tables owner)', () => {
    const stale = [...ALLOWED_PAGES].filter((p) => (!only || p === only) && !all.some((h) => pageOf(h) === p));
    expect(stale, 'drop std.dataTableDeprecated from these pages\' hub/src/pages/<page>/conformance.allow.ts (the props go from the kit once this list is empty)').toEqual([]);
  });
});

// Count ratchets: a file may keep at most its listed number of hits, and a lower count must be
// written back (the list only shrinks). Files not listed may have none.
function ratchetCounts(counts: Map<string, number>, allowed: Readonly<Record<string, number>>, fix: string) {
  const over = [...counts.entries()].filter(([f, n]) => inScope(f) && n > (allowed[f] ?? 0)).map(([f, n]) => `${f}: ${n} (allowed ${allowed[f] ?? 0})`);
  expect.soft(over, fix).toEqual([]);
  const lower = Object.entries(allowed)
    .filter(([f, n]) => inScope(f) && (counts.get(f) ?? 0) < n)
    .map(([f, n]) => `${f}: ${counts.get(f) ?? 0} now (listed ${n} in ${allowFileOf(f)})`);
  expect(lower, 'lower (or remove) these counts in the allow-list file named on each').toEqual([]);
}
const countBy = (entries: Array<[string, number]>) => new Map(entries.filter(([, n]) => n > 0));

describe('cross-page links go through usePageLink (std)', () => {
  // A literal route to another page skips the page registry: a hidden page then 404s instead of
  // showing no control. Same-page routes (?sel=, /scripts/new) stay allowed.
  // The rule also covers <Link>/<LinkButton>: a literal href="/other", an href or go()
  // built from another page's links module (../other/links), and a usePageLink result's .href fed to
  // a router Link (follow a page link with followPageLink).
  // Seeded counts.
  const ALLOWED = allowCounts('std.pageLink');
  const ROUTE = /\b(?:go|navigate)\(\s*['"`](\/[^'"`$?#]*)|href=\{?\s*['"`]#(\/[^'"`$?#]*)/g;
  const LINK = String.raw`<(?:Link|LinkButton)\b[^>]*?\bhref=`;
  const LINK_LITERAL = new RegExp(`${LINK}\\{?\\s*['"\`](\\/[^'"\`$?#]*)`, 'g');
  /** Links into another page that bypass usePageLink: its links module, or a page link's raw href on a router Link. */
  const borrowed = (t: string, id: string): number => {
    let n = 0;
    for (const imp of t.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"](?:\.\.\/)+([\w-]+)\/links['"]/g)) {
      if (imp[2] === id) continue;
      for (const part of (imp[1] ?? '').split(',')) {
        const name = part.trim().split(/\s+as\s+/).pop()?.trim();
        if (!name || name.startsWith('type ')) continue;
        // Inside the hub branch of a kind test (`link.kind === 'hub' ? go(other.item(x)) : followPageLink(…)`) a deep path is fine.
        n += [...t.matchAll(new RegExp(`${LINK}\\{\\s*${name}\\b|\\b(?:go|navigate)\\(\\s*${name}\\b`, 'g'))].filter(
          (m) => !/\.kind\s*===\s*['"]hub['"]/.test(t.slice(t.lastIndexOf('\n', m.index ?? 0) + 1, m.index ?? 0)),
        ).length;
      }
    }
    for (const decl of t.matchAll(/\b(?:const|let)\s+(\w+)\s*=\s*usePageLink\(/g)) {
      n += [...t.matchAll(new RegExp(`${LINK}\\{[^}]*\\b${decl[1]}\\??\\.href\\b`, 'g'))].length;
    }
    return n;
  };
  const pagePath = (id: string) => /\bpath:\s*['"]([^'"]+)['"]/.exec(read((f) => f === `pages/${id}/page.ts`)[`pages/${id}/page.ts`] ?? '')?.[1] ?? `/${id}`;
  const paths = new Map<string, string>();
  it('no new literal route to another page', () => {
    const counts = countBy(
      Object.entries(code)
        .filter(([f]) => f.startsWith('pages/'))
        .map(([f, text]) => {
          const t = stripComments(text);
          const id = f.split('/')[1] ?? '';
          if (!paths.has(id)) paths.set(id, pagePath(id));
          const own = paths.get(id) ?? '';
          return [
            f,
            [...t.matchAll(ROUTE), ...t.matchAll(LINK_LITERAL)].filter((m) => {
              const to = m[1] ?? m[2] ?? '';
              return to !== own && !to.startsWith(`${own}/`);
            }).length + borrowed(t, id),
          ];
        }),
    );
    ratchetCounts(counts, ALLOWED, "link to another page with usePageLink('<page>') + followPageLink (@kit), never go('/other')");
  });
});

describe('flags come from countryFlag (std)', () => {
  const ALLOWED = allowCounts('std.flag');
  const FLAG = /0x1f1e6|127397|127462/gi;
  // countryFlag's home is kit/flag.ts (moved verbatim from format.ts, which re-exports it).
  it('no regional-indicator arithmetic outside kit/flag.ts', () => {
    const src = read((f) => isSource(f) && f !== 'kit/flag.ts');
    ratchetCounts(countBy(Object.entries(src).map(([f, t]) => [f, [...stripComments(t).matchAll(FLAG)].length])), ALLOWED, "use countryFlag(code) from '@kit'");
  });
});

describe('spec locators are unique, or say why not (std)', () => {
  // .first()/.nth() on a role, text or label locator hides a duplicate control. Make the locator
  // unique (a name, exact: true, a within region), or keep the call with a // reason on that line.
  // A reason must be specific: the same reason text on more than 2 such lines of one
  // file explains none of them, and every one of those lines counts.
  // Repeated reasons.
  const ALLOWED = allowCounts('std.locator');
  /** The reason of each locator line ('' when none), normalized so pasted copies compare equal. */
  const reasons = (text: string): string[] =>
    text.split('\n').flatMap((line) => {
      const at = line.indexOf('//');
      const codePart = at === -1 ? line : line.slice(0, at);
      // The .first()/.nth() must follow the role/text/label locator: `rows.first().getByText(x)` picks a row, not a duplicate control.
      if (!/(?:getBy(?:Role|Text|Label)\b|['"](?:role|text)=)[\s\S]*\.(?:first\(\)|nth\()/.test(codePart)) return [];
      const reason = at === -1 ? '' : line.slice(at + 2);
      return [reason.toLowerCase().replace(/^\s*reason\s*:?/, '').replace(/[\s.;,]+/g, ' ').trim()];
    });
  const unexplained = (text: string): number => {
    const all = reasons(text);
    const uses = new Map<string, number>();
    for (const r of all) if (r) uses.set(r, (uses.get(r) ?? 0) + 1);
    return all.filter((r) => !r || (uses.get(r) ?? 0) > 2).length;
  };
  it('no new .first()/.nth() on a role/text/label locator without a reason comment', () => {
    const specs = read((f) => f.endsWith('.spec.ts'));
    const counts = countBy(
      Object.entries(specs).map(([f, t]) => [
        f,
        unexplained(t),
      ]),
    );
    ratchetCounts(counts, ALLOWED, 'make the locator unique (name, exact: true, within a region), or add a specific // reason on the same line (one reason text on at most 2 lines per file)');
  });
});

describe('copy goes through the kit (std)', () => {
  // A copy never toasts; the control itself turns into "Copied". The kit owns that:
  // CopyButton (text or getValue, isDisabled), CopyField, IdChip, and a menu item's `copy:`.
  // Page-local copyText/useCopy/navigator.clipboard and local *Copy*Button components fork it.
  // ALLOWED holds the page-local copy sites still to move to the kit.
  const ALLOWED = allowCounts('std.copy');
  const COPY = /\bnavigator\.clipboard\b|\bcopyText\(|\b(?:function|const)\s+\w*Copy\w*Button\b/g;
  const KIT_USE_COPY = /\buseCopy\(/g;
  const importsKitUseCopy = (text: string) => /import\s*\{[^}]*\buseCopy\b[^}]*\}\s*from\s*['"]@kit['"]/.test(text);
  it('no page-local copy button, copy toast or clipboard call', () => {
    const counts = countBy(
      Object.entries(code)
        .filter(([f]) => f.startsWith('pages/'))
        .map(([f, text]) => {
          const t = stripComments(text);
          return [f, [...t.matchAll(COPY)].length + (importsKitUseCopy(t) ? [...t.matchAll(KIT_USE_COPY)].length : 0)];
        }),
    );
    ratchetCounts(
      counts,
      ALLOWED,
      "use CopyButton (text, or getValue for a secret; isDisabled), CopyField or IdChip from '@kit', or a menu item's copy: field; never copyText + showToast",
    );
  });
});

// A comment on the same line is the reason an inline hint keeps its own markup (a URL's :// is not one).
// Reasons must be specific: one reason text on more than 2 such lines of a file explains none.
/** The comment text on a line ('' when none), normalized so pasted copies compare equal. */
const reasonOf = (line: string): string =>
  (/\/\*\s*([\s\S]*?)\*\//.exec(line)?.[1] ?? /(?:^|[^:])\/\/\s*(.*)$/.exec(line)?.[1] ?? '')
    .toLowerCase()
    .replace(/^\s*reason\s*:?/, '')
    .replace(/[\s.;,]+/g, ' ')
    .trim();
/** Lines whose reason is missing, or repeated on more than 2 of the given lines (a pasted reason explains none). */
const unreasoned = (lines: readonly string[]): number => {
  const all = lines.map(reasonOf);
  const uses = new Map<string, number>();
  for (const r of all) if (r) uses.set(r, (uses.get(r) ?? 0) + 1);
  return all.filter((r) => !r || (uses.get(r) ?? 0) > 2).length;
};
const pageJson = read((f) => f.endsWith('.json') && /^pages\/[^/]+\//.test(f));

describe('states come from the kit (std)', () => {
  // A raw role="alert"/"status" line or a "Loading…" text forks the kit's states: no retry, no
  // unknown outcome, no skeleton shape. A one-line inline hint may stay with a reason comment.
  // ALLOWED holds the raw state lines still to move to the kit.
  const ALLOWED = allowCounts('std.states');
  const ROLE = /<(?:span|p|div)\b[^>]*?\brole=\{?\s*['"](?:alert|status)['"]/g;
  const LOADING = /Loading(?:…|\.\.\.)/g;
  it('no raw role="alert"/"status" element or "Loading…" text in pages', () => {
    const counts = new Map<string, number>();
    const add = (f: string, n: number) => n > 0 && counts.set(f, (counts.get(f) ?? 0) + n);
    for (const [f, text] of Object.entries(code)) {
      if (!f.startsWith('pages/')) continue;
      const lines = text.split('\n');
      // Each live (not commented-out) element is excused only by a specific reason on its role= line.
      const live = [...stripComments(text).matchAll(ROLE)].length;
      const roleLines = [...text.matchAll(ROLE)].map((m) => lines[lineOf(text, (m.index ?? 0) + m[0].length) - 1] ?? '');
      add(f, Math.min(live, unreasoned(roleLines)));
      add(f, [...stripComments(text).matchAll(LOADING)].length);
    }
    for (const [f, text] of Object.entries(pageJson)) add(f, [...text.matchAll(/:\s*"Loading(?:…|\.\.\.)"/g)].length);
    ratchetCounts(
      counts,
      ALLOWED,
      "use OutcomeBanner / Outcome (failed, unknown, busy), ErrorState (with Try again), Skeleton or Spinner from '@kit'; a one-line inline hint may keep role= with a reason comment on that line",
    );
  });
});

describe('meters come from the kit (std)', () => {
  // A hand-rolled bar re-decides thresholds, tones and the accessible name: the kit Meter owns them.
  const ALLOWED = allowCounts('std.meter');
  const METER = /\brole=\{?\s*['"](?:meter|progressbar)['"]|\baria-valuenow\b|\b(?:function|const)\s+\w*(?:Meter|ProgressBar|UsageBar)\b/;
  it('no role="meter"/"progressbar", aria-valuenow or local Meter component in pages', () => {
    const counts = countBy(
      Object.entries(code)
        .filter(([f]) => f.startsWith('pages/'))
        .map(([f, text]) => [f, stripComments(text).split('\n').filter((l) => METER.test(l)).length]),
    );
    ratchetCounts(counts, ALLOWED, "use Meter from '@kit' (value, tone thresholds, label; indeterminate for an unknown end), or Spinner when no bar is needed");
  });
});

describe('tags and tiles come from the kit (std)', () => {
  // A <span> styled by a page class named tag/pill/chip/monogram/logo is a local Tag, StatusPill or
  // Monogram. Plural and wrapper names (chips, tagList, chipRow, pillGroup…) are layout and pass.
  const ALLOWED = allowCounts('std.tag');
  const SPAN = /<span\b[^>]*?className=\{([^}]*)\}/g;
  const CLASS = /\bs(?:\.(\w+)|\[\s*['"]([\w-]+)['"]\s*\])/g;
  const TAGGY = /(?:^(?:tag|pill|chip|monogram|logo)|[a-z0-9](?:Tag|Pill|Chip|Monogram|Logo))(?![a-z])(?!(?:List|Row|Group|Wrap|Bar|Strip|Box)(?![a-z]))/;
  it('no <span> with a page tag/pill/chip/monogram/logo class', () => {
    const counts = countBy(
      Object.entries(code)
        .filter(([f]) => f.startsWith('pages/'))
        .map(([f, text]) => [f, [...stripComments(text).matchAll(SPAN)].filter((m) => [...(m[1] ?? '').matchAll(CLASS)].some((c) => TAGGY.test(c[1] ?? c[2] ?? ''))).length]),
    );
    ratchetCounts(counts, ALLOWED, "use Tag (labels; tone), StatusPill (states) or Monogram (letter tiles) from '@kit'");
  });
});

describe('only a null page link hides a control (std)', () => {
  // usePageLink gives { kind: 'hub' } when this load serves the page and null when it hides it (there is no
  // { kind: 'classic' } link): `!link` is the one test that hides or disables a control, and a
  // control whose page is hidden must hide (a shown control with a null link does nothing). A kind test never
  // gates a control; the rule (when a classic link existed) keeps pages from adding one back.
  const ALLOWED = allowCounts('std.classicLink');
  const KIND = /\.kind\s*(?:===|!==|==|!=)\s*['"](?:hub|classic|served)['"]/g;
  const EMPTY = /^(?:undefined|null|false|''|""|\(\s*\))?$/;
  /** The two branches of the ternary that starts at `text` (which begins at its `?`), split at depth 0. */
  const branches = (text: string): [string, string] | null => {
    let depth = 0;
    let colon = -1;
    for (let i = 1; i < text.length; i++) {
      const c = text[i];
      if ('([{'.includes(c ?? '')) depth++;
      else if (')]}'.includes(c ?? '')) {
        if (depth === 0) return colon === -1 ? null : [text.slice(1, colon), text.slice(colon + 1, i)];
        depth--;
      } else if (depth === 0 && c === ':' && colon === -1) colon = i;
      else if (depth === 0 && colon !== -1 && (c === ',' || c === ';' || c === '?' || c === '\n')) return [text.slice(1, colon), text.slice(colon + 1, i)];
    }
    return colon === -1 ? null : [text.slice(1, colon), text.slice(colon + 1)];
  };
  /** A kind test is fine when it picks between two ways to go: a ternary with two real branches, or an `if` that does not bail out. */
  const choosesHowToGo = (before: string, after: string): boolean => {
    if (/^\s*\)/.test(after) && /\bif\s*\(\s*[\w.?]*$/.test(before)) return !/^\s*\)\s*(?:return\s*(?:null|undefined|false)?\s*;|\{\s*return\s*(?:null|undefined|false)?\s*;)/.test(after);
    if (!/^\s*\?/.test(after)) return false;
    const b = branches(after.trimStart());
    return b !== null && !b.some((x) => EMPTY.test(x.trim()));
  };
  it('no control is hidden or disabled by a link kind (only !link hides)', () => {
    const counts = countBy(
      Object.entries(code)
        .filter(([f]) => f.startsWith('pages/'))
        .map(([f, text]) => {
          const t = stripComments(text);
          return [f, [...t.matchAll(KIND)].filter((m) => !choosesHowToGo(t.slice(0, m.index ?? 0), t.slice((m.index ?? 0) + m[0].length))).length];
        }),
    );
    ratchetCounts(
      counts,
      ALLOWED,
      "keep the control for every link: onPress={() => followPageLink(link, go)}; hide only on !link",
    );
  });
});

describe('Logs links come from pages/logs/links (std)', () => {
  // A hand-built '/logs?…' drifts from the keys Logs reads (program, computer, cursor): only
  // pages/logs builds them. ALLOWED holds the hand-built links still to move to the helpers.
  const ALLOWED = allowCounts('std.logsLink');
  const HAND = /['"`][^'"`\n]*\/logs\?/g;
  it("no hand-built '/logs?' href outside pages/logs", () => {
    const counts = countBy(
      Object.entries(code)
        .filter(([f]) => f.startsWith('pages/') && !f.startsWith('pages/logs/'))
        .map(([f, text]) => [f, [...stripComments(text).matchAll(HAND)].length]),
    );
    ratchetCounts(counts, ALLOWED, "build Logs links with logsLinkFor from '../logs/links'");
  });
});

describe('one phone breakpoint: --bp-phone', () => {
  // CSS cannot read a custom property inside @media or @container, so those conditions write the number, and this rule holds it equal to
  // the token in kit/tokens.css (the one place it is declared). A width condition in the phone band, 560 <= v < 640, must be written exactly
  // `width < <token>` or `width >= <token>`; `<= 600px`, `max-width: 599px`, `min-width: 600px` and `width < 560px` are the same decision
  // written four ways. Component breakpoints outside the band (480, 640, 768, ...) are left alone. Kit and shell carry no rows.
  const ALLOWED = allowCounts('std.breakpoint');
  const BAND = [560, 640] as const;
  const tokenOf = (css: string): number => {
    const m = /--bp-phone\s*:\s*(\d+(?:\.\d+)?)px\s*;/.exec(css);
    if (!m) throw new Error('kit/tokens.css has no parsable --bp-phone: <n>px');
    return Number(m[1]);
  };
  /** The width conditions of an at-rule's params: each parenthesised leaf, however deep (`(a) and ((b) or (c))`), a function's own parentheses (`calc(600px + 1px)`) staying inside its leaf. */
  function leaves(params: string): string[] {
    const out: string[] = [];
    const groups = (text: string): string[] => {
      const found: string[] = [];
      let depth = 0;
      let from = -1;
      for (let i = 0; i < text.length; i++) {
        if (text[i] === '(') {
          if (depth === 0) from = i + 1;
          depth++;
        } else if (text[i] === ')') {
          depth = Math.max(0, depth - 1);
          if (depth === 0 && from >= 0) found.push(text.slice(from, i));
        }
      }
      return found;
    };
    const visit = (text: string): void => {
      for (const g of groups(text)) {
        if (/^\s*(?:not\s*)?\(/.test(g)) visit(g);
        else out.push(g.trim());
      }
    };
    visit(params);
    return out;
  }
  /** The lines of the @media / @container width conditions of `css` that fall in the phone band without being written exactly `width < bp` or `width >= bp` (one per condition). */
  function breakpointHits(css: string, bp: number): number[] {
    const out: number[] = [];
    postcss.parse(css).walkAtRules(/^(?:media|container)$/i, (rule) => {
      for (const cond of leaves(rule.params)) {
        if (!/\b(?:width|inline-size)\b/.test(cond)) continue;
        // The operands are what the feature is compared with; each is evaluated (`calc(100px * 6)` is 600, `37.5em` is 600). One that does not evaluate is counted.
        const operands = cond.split(/\s*(?:<=|>=|<|>|=|:)\s*/).map((o) => o.trim()).filter((o) => o && !/^(?:min-|max-)?(?:width|inline-size)$/.test(o));
        const widths = operands.map((o) => cssPx(o.replace(/(\d)em\b/g, '$1rem'), {}));
        if (widths.includes(null)) {
          out.push(rule.source?.start?.line ?? 0);
          continue;
        }
        const inBand = widths.filter((v): v is number => v !== null && v >= BAND[0] && v < BAND[1]);
        if (inBand.length === 0) continue;
        if (inBand.length === 1 && inBand[0] === bp && new RegExp(`^(?:width|inline-size)\\s*(?:<|>=)\\s*${bp}px$`).test(cond)) continue;
        out.push(rule.source?.start?.line ?? 0);
      }
    });
    return out;
  }
  const { cssPx } = createRequire(import.meta.url)('../../scripts/lint/anatomy.cjs') as { cssPx: (value: string, vars: Record<string, string | null>) => number | null };
  const tokens = read((f) => f === 'kit/tokens.css')['kit/tokens.css'] ?? '';

  it('the token is declared in kit/tokens.css', () => {
    expect(tokenOf(tokens)).toBe(600);
    expect(() => tokenOf(':root { --sp-1: 4px; }')).toThrow(/--bp-phone/);
  });
  it('finds each way of writing the phone breakpoint (the seven measured sites)', () => {
    for (const q of [
      '@media (width <= 600px)',
      '@container setting-group (width < 560px)',
      '@container (width < 560px)',
      '@container content (max-width: 599px)',
      '@container rail-drawer (max-width: 639px)',
      '@media (min-width: 600px)',
      '@media (width > 600px)',
      '@media (max-width: 37.5rem)',
      '@media screen and (width < 580px) and (hover: none)',
      '@container (400px < width < 600px)',
      '@media (width < calc(600px + 1px))',
      '@media ((width < 580px) or (hover: none))',
      '@media not (width < 580px)',
    ]) {
      expect(breakpointHits(`${q} { .a { color: red; } }`, 600), q).toHaveLength(1);
    }
  });
  it('passes the canonical forms and every condition outside the band or not about width', () => {
    for (const q of [
      '@media (width < 600px)',
      '@container content (width >= 600px)',
      '@container (inline-size < 600px)',
      '@media (width < 480px)',
      '@media (width < 559px)',
      '@media (width < 640px)',
      '@media (width < 768px)',
      '@media (width < 30em)',
      '@container (min-width: 1180px)',
      '@media (height < 600px)',
      '@media (hover: none)',
      '@media (prefers-reduced-motion: reduce)',
    ]) {
      expect(breakpointHits(`${q} { .a { color: red; } }`, 600), q).toEqual([]);
    }
  });
  it('counts one hit per condition, however many numbers it holds', () => {
    expect(breakpointHits('@media (560px <= width < 600px) { .a { color: red; } }', 600)).toHaveLength(1);
    expect(breakpointHits('@media (width < 580px) and (width >= 560px) { .a { color: red; } }', 600)).toHaveLength(2);
    expect(breakpointHits('@media (width < calc(100px * 2)) { .a { color: red; } }', 600)).toEqual([]);
    expect(breakpointHits('@media (width < calc(100px * 6)) { .a { color: red; } }', 600)).toHaveLength(1);
    expect(breakpointHits('@media (width < 37.5rem) { .a { color: red; } }', 600)).toHaveLength(1);
    expect(breakpointHits('@media (width < 37.5em) { .a { color: red; } }', 600)).toHaveLength(1);
    expect(breakpointHits('@media (width < env(viewport-segment-width 0 0)) { .a { color: red; } }', 600)).toHaveLength(1);
    expect(breakpointHits('@media ((width < 580px) or (width < 590px)) { .a { color: red; } }', 600)).toHaveLength(2);
  });
  it('reads the token: with another value the old canonical form is a hit and the new one passes', () => {
    expect(breakpointHits('@media (width < 600px) { .a { color: red; } }', 580)).toHaveLength(1);
    expect(breakpointHits('@media (width < 580px) { .a { color: red; } }', 580)).toEqual([]);
  });
  it('reports the line of the at-rule', () => {
    expect(breakpointHits('.a { color: red; }\n\n@media (width <= 600px) { .a { color: blue; } }', 600)).toEqual([3]);
  });
  it('no width condition in the phone band that is not the canonical form', () => {
    const bp = tokenOf(tokens);
    const css = read((f) => f.endsWith('.css') && /^(?:kit|pages|shell)\//.test(f));
    const counts = countBy(Object.entries(css).map(([f, text]) => [f, breakpointHits(text, bp).length]));
    ratchetCounts(counts, ALLOWED, 'write the phone breakpoint exactly `width < 600px` or `width >= 600px` (the value of --bp-phone in kit/tokens.css), or move the query out of the 560-639 band if it is a component breakpoint');
  });
});

describe('every page spec runs', () => {
  // A page spec Playwright never matches passes by never running: hub:check (whole-hub and
  // --page) must pick up every *.spec.ts a page has.
  const config = readFileSync(join(SRC, '..', 'playwright.config.ts'), 'utf8');
  const testMatch = [...(/testMatch:\s*\[([^\]]*)\]/.exec(config)?.[1] ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1] ?? '');
  const globToRegExp = (glob: string): RegExp =>
    new RegExp(`^${glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*\//g, '\u0000').replace(/\*/g, '[^/]*').replace(/\u0000/g, '(?:.*/)?')}$`);
  const specs = ALL.filter((f) => /^pages\/[^/]+\/.*\.spec\.ts$/.test(f) && inScope(f));
  it('playwright.config.ts testMatch is readable', () => {
    expect(testMatch.length, 'playwright.config.ts: keep testMatch a literal array of quoted globs').toBeGreaterThan(0);
  });
  it('playwright.config.ts testMatch matches every pages/<page>/**/*.spec.ts', () => {
    const unmatched = specs.filter((f) => !testMatch.some((g) => globToRegExp(g).test(f)));
    expect(unmatched, 'put page specs directly in the page folder (pages/<page>/<name>.spec.ts), or widen testMatch').toEqual([]);
  });
  it('hub:check --page runs every spec of the page (scripts/lib.ts pageSpecs)', () => {
    const picked = new Set(
      [...new Set(specs.map((f) => f.split('/')[1] ?? ''))].flatMap((id) => pageSpecs(id).map((p) => relative(SRC, p).split(sep).join('/'))),
    );
    const missed = specs.filter((f) => !picked.has(f));
    expect(missed, 'put page specs directly in the page folder (pages/<page>/<name>.spec.ts), or widen pageSpecs in hub/scripts/lib.ts').toEqual([]);
  });
});

describe('Button, TextButton and LinkButton with data pass literal (theme-a uppercase)', () => {
  // The theme uppercases Button, TextButton and LinkButton labels; user data (a name, a label, a
  // t('...', { name }) interpolation) must keep its case, so such a button passes `literal`
  // (data-literal resets the case). A label made only of t('key') strings needs nothing.
  // Labels the owners checked: a prop or variable that only ever holds Hub text, rule
  // literal.hubText with its why. Not debt; a new data label in these files still needs literal.
  const HUB_TEXT_ONLY = allowHubText();
  // Debt (literal.debt): shrink only; each row file notes what its rows are.
  const ALLOWED = allowCounts('literal.debt');
  // Terminal files skipped: the terminal buttons draw labels as written in every theme (termFiles.test.ts pins it).
  const web = webDrawn('std.literal', 'the case reset is for the web theme\'s uppercase labels; terminal buttons never change case');
  const tsx = read((f) => f.endsWith('.tsx') && isSource(f) && web(f) && f !== 'kit/controls/Button.tsx' && f !== 'kit/controls/Link.tsx');
  /** Index just past the `>` that ends the tag opening at `from` (braces and quotes skipped), and whether it self-closes. */
  const tagEnd = (text: string, from: number): { end: number; selfClosing: boolean } => {
    let depth = 0;
    let quote = '';
    for (let i = from; i < text.length; i++) {
      const c = text[i];
      if (quote) {
        if (c === '\\') i++;
        else if (c === quote) quote = '';
      } else if (c === '"' || c === "'" || c === '`') quote = c;
      else if (c === '{') depth++;
      else if (c === '}') depth--;
      else if (c === '>' && depth === 0) return { end: i + 1, selfClosing: text[i - 1] === '/' };
    }
    return { end: text.length, selfClosing: true };
  };
  /** The balanced `{…}` expression starting at `from` (without its braces), and the index past it. */
  const braced = (text: string, from: number): { expr: string; end: number } => {
    let depth = 0;
    let quote = '';
    for (let i = from; i < text.length; i++) {
      const c = text[i];
      if (quote) {
        if (c === '\\') i++;
        else if (c === quote) quote = '';
      } else if (c === '"' || c === "'" || c === '`') quote = c;
      else if (c === '{') depth++;
      else if (c === '}' && --depth === 0) return { expr: text.slice(from + 1, i), end: i + 1 };
    }
    return { expr: text.slice(from + 1), end: text.length };
  };
  /** Index past the `)` closing the call whose `(` is at `from`, and its top-level arguments. */
  const callArgs = (text: string, from: number): { end: number; args: string[] } => {
    const args: string[] = [];
    let depth = 0;
    let quote = '';
    let last = from + 1;
    for (let i = from; i < text.length; i++) {
      const c = text[i];
      if (quote) {
        if (c === '\\') i++;
        else if (c === quote) quote = '';
      } else if (c === '"' || c === "'" || c === '`') quote = c;
      else if (c === '(' || c === '{' || c === '[') depth++;
      else if (c === ',' && depth === 1) {
        args.push(text.slice(last, i));
        last = i + 1;
      } else if ((c === ')' || c === '}' || c === ']') && --depth === 0) {
        args.push(text.slice(last, i));
        return { end: i + 1, args: args.map((a) => a.trim()).filter(Boolean) };
      }
    }
    return { end: text.length, args };
  };
  // Interpolations that carry no letters of user data: counts, numbers, durations.
  const CASELESS_ARGS = new Set(['count', 'n', 's', 'time']);
  const KEY_CALL = /\b(?:[A-Za-z_$][\w$]*\.)?(?:t|ts|kt|tt)\(/g;
  /** Replaces translation calls with \u0001 (keys only, or caseless interpolations) or \u0002 (user data interpolated). */
  const markKeys = (expr: string): string => {
    let out = '';
    let at = 0;
    for (const m of expr.matchAll(KEY_CALL)) {
      const start = m.index ?? 0;
      if (start < at) continue;
      const call = callArgs(expr, start + m[0].length - 1);
      const vars = call.args[1];
      // Only an object literal without spread can be judged by its keys; a variable or spread may carry data.
      const judged = !vars || (/^\{[\s\S]*\}$/.test(vars) && !vars.includes('...'));
      const keys = vars ? [...vars.replace(/^\{|\}$/g, '').matchAll(/(?:^|,)\s*([\w$]+)/g)].map((k) => k[1] ?? '') : [];
      out += expr.slice(at, start) + (judged && keys.every((k) => CASELESS_ARGS.has(k)) ? '\u0001' : '\u0002');
      at = call.end;
    }
    return out + expr.slice(at);
  };
  /** Splits `cond ? a : b` at top level; null when the expression is not a ternary. */
  const ternary = (expr: string): [string, string] | null => {
    let depth = 0;
    let q = -1;
    let nested = 0;
    for (let i = 0; i < expr.length; i++) {
      const c = expr[i];
      if (c === '(' || c === '{' || c === '[') depth++;
      else if (c === ')' || c === '}' || c === ']') depth--;
      else if (depth === 0 && c === '?' && expr[i + 1] !== '?' && expr[i - 1] !== '?' && expr[i + 1] !== '.') {
        if (q < 0) q = i;
        else nested++;
      } else if (depth === 0 && c === ':' && q >= 0) {
        if (nested > 0) nested--;
        else return [expr.slice(q + 1, i), expr.slice(i + 1)];
      }
    }
    return null;
  };
  /** True when the expression renders only translated strings (whatever the condition), a number, or a bare space. */
  const keysOnly = (expr: string): boolean => {
    let e = expr.trim();
    while (e.startsWith('(') && callArgs(e, 0).end === e.length) e = e.slice(1, -1).trim();
    // Glyphs joined on with + (' ▸') have no case.
    const marked = markKeys(e).replace(/(['"])[^A-Za-z'"\n]*\1/g, '').replace(/[\s+]/g, '');
    if (marked === '\u0001' || /^['"]\s*['"]$/.test(e) || /^[\w$.]+\.toLocaleString\([^)]*\)$/.test(e)) return true;
    const arms = ternary(e);
    return arms !== null && keysOnly(arms[0]) && keysOnly(arms[1]);
  };
  // A nested component renders its props: <ContextLine realm={{ name }} /> inside a Button shows
  // the name in the button's capitals. Props that carry no text are skipped.
  const CASELESS_COMPONENTS = new Set(['Icon', 'Shortcut', 'Spinner', 'Kbd']);
  const CASELESS_PROP = /^(?:on[A-Z]\w*|is[A-Z]\w*|has[A-Z]\w*|className|style|key|ref|id|icon|iconEnd|tone|size|variant|width|height|role|tabIndex|href|to|keys|level|aria-[\w-]+|data-[\w-]+)$/;
  /** True when a nested component tag (`<Name …>`, not a DOM tag) passes a prop that shows data. */
  const propsShowData = (tag: string): boolean => {
    const comp = /^<([A-Z][\w.]*)/.exec(tag)?.[1];
    if (!comp || CASELESS_COMPONENTS.has(comp)) return false;
    for (const m of tag.matchAll(/\s([\w-]+)=\{/g)) {
      if (CASELESS_PROP.test(m[1] ?? '')) continue;
      const expr = braced(tag, (m.index ?? 0) + m[0].length - 1).expr.trim();
      if (/^(?:-?\d[\d._]*|true|false|null|undefined)$/.test(expr) || keysOnly(expr)) continue;
      return true;
    }
    return false;
  };
  /** `literal`, `literal={expr}` (a forwarded flag) or a spread naming literal; `literal={false}` does not pass. */
  const passesLiteral = (openTag: string): boolean =>
    /\sliteral(?:\s|\/?>|=\{(?!\s*false\s*\}))/.test(openTag) || /\{\s*\.\.\.[^{}]*\{[^{}]*\bliteral\b/.test(openTag);
  const OPEN = /<(Button|TextButton|LinkButton)\b/g;
  it('a Button/TextButton/LinkButton whose label shows data passes literal', () => {
    const counts = countBy(
      Object.entries(tsx).map(([f, raw]) => {
        const text = stripComments(raw);
        let n = 0;
        for (const m of text.matchAll(OPEN)) {
          const start = m.index ?? 0;
          const name = m[1] ?? '';
          const open = tagEnd(text, start + m[0].length);
          if (open.selfClosing || passesLiteral(text.slice(start, open.end))) continue;
          // Walk the children up to the matching close tag, skipping nested tags' attributes.
          let depth = 1;
          let shows = false;
          for (let i = open.end; i < text.length && depth > 0; ) {
            if (text.startsWith(`</${name}>`, i)) {
              depth--;
              i += name.length + 3;
            } else if (text[i] === '<' && /[A-Za-z]/.test(text[i + 1] ?? '')) {
              const nested = tagEnd(text, i + 1);
              if (new RegExp(`^<${name}\\b`).test(text.slice(i)) && !nested.selfClosing) depth++;
              else if (depth === 1 && propsShowData(text.slice(i, nested.end))) shows = true;
              i = nested.end;
            } else if (text[i] === '{') {
              const b = braced(text, i);
              if (depth === 1 && !keysOnly(b.expr)) shows = true;
              i = b.end;
            } else i++;
          }
          if (shows) n++;
        }
        return [f, n];
      }),
    );
    ratchetCounts(
      counts,
      Object.fromEntries([...new Set([...Object.keys(ALLOWED), ...Object.keys(HUB_TEXT_ONLY)])].map((f) => [f, (ALLOWED[f] ?? 0) + (HUB_TEXT_ONLY[f] ?? 0)])),
      "pass literal on a Button/TextButton whose label shows data (a variable, a prop, t('…', { name })): <Button literal …>; labels made only of t('key') need nothing",
    );
  });
});

describe('the case reset goes through literal only', () => {
  // data-literal resets text-transform and letter-spacing inside Button/TextButton's own modules;
  // a page that resets them on a button by CSS forks the theme.
  const RULE = /([^{}]+)\{([^{}]*)\}/g;
  const css = read((f) => f.endsWith('.css') && (/^pages\/[^/]+\//.test(f) || f.startsWith('ask/')));
  it('no page or Ask CSS sets text-transform or letter-spacing on a button or [data-literal]', () => {
    const hits = new Map<string, string[]>();
    for (const [f, raw] of Object.entries(css)) {
      const text = raw.replace(/\/\*[\s\S]*?\*\//g, '');
      for (const m of text.matchAll(RULE)) {
        const selector = m[1] ?? '';
        if (/\bbutton\b|[a-z]Button\b|data-literal|\[data-variant/.test(selector) && /\b(?:text-transform|letter-spacing)\s*:/.test(m[2] ?? ''))
          hits.set(f, [...(hits.get(f) ?? []), String(lineOf(text, (m.index ?? 0) + (m[0].length - (m[2] ?? '').length)))]);
      }
    }
    ratchet(hits, new Set<string>(), 'drop the case reset from page CSS; mark the button <Button literal> (or the wrapper action literal: true)');
  });
});

// The kit's own viewer, its highlighter and the code editor are the implementation, not users of it.
const JSON_VIEW_KIT = new Set(['kit/data/Ids.tsx', 'kit/data/highlight.ts', 'kit/forms/CodeEditor.tsx']);
type JsonViewHit = { line: number; kind: 'pretty JSON outside a CodeBlock with lang' | 'CodeBlock of JSON without lang' | 'raw <pre>' };
/** Where a file shows structured text uncoloured, from the TypeScript syntax tree: comments and strings are not code. */
function jsonViewHits(file: string, text: string): JsonViewHit[] {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const lineAt = (n: ts.Node) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
  const isStringify = (n: ts.Node): n is ts.CallExpression =>
    ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === 'stringify' &&
    ts.isIdentifier(n.expression.expression) && n.expression.expression.text === 'JSON';
  const attr = (el: ts.JsxOpeningLikeElement, name: string) =>
    el.attributes.properties.find((p): p is ts.JsxAttribute => ts.isJsxAttribute(p) && p.name.getText(sf) === name);
  /** A lang that names a language: not bare, empty, null or undefined. */
  const hasLang = (el: ts.JsxOpeningLikeElement): boolean => {
    const init = attr(el, 'lang')?.initializer;
    if (!init) return false;
    let e = ts.isJsxExpression(init) ? init.expression : init;
    while (e && ts.isParenthesizedExpression(e)) e = e.expression;
    if (!e) return false;
    if (ts.isStringLiteralLike(e)) return e.text !== '';
    return e.kind !== ts.SyntaxKind.NullKeyword && !(ts.isIdentifier(e) && e.text === 'undefined');
  };
  /** The attribute holding n directly, and its element: an element or fragment in between (a prop's own JSX) owns n instead. */
  const ownerOf = (n: ts.Node): { el: ts.JsxOpeningLikeElement; prop: string } | undefined => {
    for (let p: ts.Node | undefined = n.parent; p; p = p.parent) {
      if (ts.isJsxAttribute(p)) return { el: p.parent.parent, prop: p.name.getText(sf) };
      if (ts.isJsxElement(p) || ts.isJsxSelfClosingElement(p) || ts.isJsxFragment(p)) return undefined;
    }
    return undefined;
  };
  // The CodeBlock props that are shown as code: a stringify there makes a lang-less CodeBlock show JSON plain.
  const CODE_PROPS = ['code', 'lines'];
  const contains = (n: ts.Node, test: (x: ts.Node) => boolean): boolean => test(n) || (ts.forEachChild(n, (c) => contains(c, test) || undefined) ?? false);
  const out: JsonViewHit[] = [];
  const visit = (n: ts.Node): void => {
    if (isStringify(n) && n.arguments.length >= 3) {
      const own = ownerOf(n);
      const codeBlock = own !== undefined && own.el.tagName.getText(sf) === 'CodeBlock';
      // Shown by a CodeBlock with lang: coloured. In a lang-less CodeBlock's code or lines, the element's own hit below says what to fix.
      const covered = codeBlock && CODE_PROPS.includes(own.prop);
      if (!covered) out.push({ line: lineAt(n), kind: 'pretty JSON outside a CodeBlock with lang' });
    }
    if (ts.isJsxSelfClosingElement(n) || ts.isJsxOpeningElement(n)) {
      const name = n.tagName.getText(sf);
      if (name === 'pre') out.push({ line: lineAt(n), kind: 'raw <pre>' });
      if (name === 'CodeBlock' && !hasLang(n)) {
        const shown = CODE_PROPS.map((p) => attr(n, p)?.initializer).filter((i): i is ts.JsxAttributeValue => i !== undefined);
        if (shown.some((i) => contains(i, isStringify))) out.push({ line: lineAt(n), kind: 'CodeBlock of JSON without lang' });
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

describe('JSON and code show in the kit CodeBlock (uncoloured JSON in an Ask card)', () => {
  // Every JSON, code or argument block a person reads goes through the kit CodeBlock with a lang, which colours it.
  // Flagged in pages/**, kit/**, ask/** and shell/** (the kit viewer, highlighter and editor excepted): a pretty
  // JSON.stringify(x, r, n) outside a CodeBlock attribute whose element has a lang; a CodeBlock whose code is a
  // JSON.stringify and that has no lang (it shows plain); a raw <pre>. The only exemption is a specific // reason:
  // comment on the flagged line, and one reason text excuses at most 2 flagged lines of a file.
  const FIX =
    "show JSON, code and arguments with <CodeBlock code={…} lang=\"json\"> (or js, ts, yaml, http, python, shell) from '@kit'. " +
    'A value built for a file, an editor or the clipboard, or a helper whose caller passes it to <CodeBlock lang=…>, ' +
    'keeps its line with a specific // reason: comment on that line; one reason text excuses at most 2 flagged lines per file';
  const viewer = read((f) => isSource(f) && /^(pages\/[^/]+|kit|ask|shell)\//.test(f) && !JSON_VIEW_KIT.has(f));
  const linesOf = (src: string) => jsonViewHits('case.tsx', src).map((h) => h.line);

  it('finds every form a text scan missed or misread', () => {
    // Pretty forms the text scan missed.
    expect(linesOf('const a = JSON.stringify(normalize(read()), null, 2);')).toEqual([1]);
    expect(linesOf('const a = JSON.stringify(x, null, options.indent);')).toEqual([1]);
    expect(linesOf('const a = JSON.stringify(x, null, `  `);')).toEqual([1]);
    expect(linesOf('const a = JSON.stringify (x, null, 2);')).toEqual([1]);
    expect(linesOf('const a = JSON.stringify(x, null, 2,);')).toEqual([1]);
    expect(linesOf('const a = JSON.stringify(x);')).toEqual([]);
    // Element bounds come from JSX, not the first "/>".
    expect(linesOf('const e = <CodeBlock label="example />"\n  code={JSON.stringify(x, null, 2)} lang="json" />;')).toEqual([]);
    expect(linesOf('const e = <>\n<CodeBlock code={JSON.stringify(x)}></CodeBlock>\n<CodeBlock code="hello" lang="json" />\n</>;')).toEqual([2]);
    expect(linesOf('const e = <CodeBlock code={JSON.stringify(x)}></CodeBlock>;')).toEqual([1]);
    // The lang attribute itself, not text that looks like it.
    expect(linesOf('const e = <CodeBlock label="lang=json" code={JSON.stringify(x)} />;')).toEqual([1]);
    expect(linesOf('const e = <CodeBlock code={JSON.stringify(x, null, 2)} lang = "json" />;')).toEqual([]);
    expect(linesOf('const e = <CodeBlock code={JSON.stringify(x, null, 2)} lang={undefined} />;')).toEqual([1]);
    expect(linesOf('const e = <CodeBlock code={JSON.stringify(x, null, 2)} lang="" />;')).toEqual([1]);
    // Comments and strings are not code.
    expect(linesOf('/*\n JSON.stringify(x, null, 2)\n*/')).toEqual([]);
    expect(linesOf('const s = "<pre>";')).toEqual([]);
    expect(linesOf('// <CodeBlock code={JSON.stringify(x)}\nconst s = JSON.stringify(x, null, 2);\nconst icon = <Icon />;')).toEqual([2]);
    // A prop's nested element is not the CodeBlock; a raw <pre> is found.
    expect(linesOf('const e = <CodeBlock code="a" lang="json" footer={<span title={JSON.stringify(x, null, 2)} />} />;')).toEqual([1]);
    expect(linesOf('const e = <pre>{t}</pre>;')).toEqual([1]);
  });

  it('finds JSON shown through lines, prop children or a label, and an empty lang in parentheses', () => {
    // lines is shown as code too.
    expect(linesOf('const e = <CodeBlock lines={[{ code: JSON.stringify(x, null, 2) }]} />;')).toEqual([1]);
    expect(linesOf('const e = <CodeBlock lines={[{ code: JSON.stringify(x, null, 2) }]} lang="json" />;')).toEqual([]);
    // A prop's own children and fragments are not the CodeBlock.
    expect(linesOf('const e = <CodeBlock\n  code="a"\n  lang="json"\n  footer={<span>{JSON.stringify(x, null, 2)}</span>}\n/>;')).toEqual([4]);
    expect(linesOf('const e = <CodeBlock code="a" lang="json" footer={<>{JSON.stringify(x, null, 2)}</>} />;')).toEqual([1]);
    // Inside code or lines too, only the direct value is shown as code: a nested element's text shows plain.
    expect(linesOf('const e = <CodeBlock lang="json" lines={[{ code: "a", caption: <span>{JSON.stringify(x, null, 2)}</span> }]} />;')).toEqual([1]);
    // A label is not shown as code, lang or not.
    expect(linesOf('const e = <CodeBlock code="a" lang="json" label={JSON.stringify(x, null, 2)} />;')).toEqual([1]);
    // Parentheses do not hide an empty lang.
    expect(linesOf('const e = <CodeBlock code={JSON.stringify(x)} lang={(undefined)} />;')).toEqual([1]);
    expect(linesOf('const e = <CodeBlock code={JSON.stringify(x)} lang={("")} />;')).toEqual([1]);
    expect(linesOf('const e = <CodeBlock code={JSON.stringify(x)} lang={("json")} />;')).toEqual([]);
  });

  it('no pretty JSON, lang-less JSON CodeBlock or raw <pre> outside the kit viewer, unless the line says why', () => {
    const hits = new Map<string, string[]>();
    for (const [f, text] of Object.entries(viewer)) {
      if (!inScope(f)) continue;
      const lines = text.split('\n');
      const byLine = new Map<number, string>();
      for (const h of jsonViewHits(f, text)) if (!byLine.has(h.line)) byLine.set(h.line, h.kind);
      const flagged = [...byLine.keys()].sort((a, b) => a - b);
      const reasons = flagged.map((n) => reasonOf(lines[n - 1] ?? ''));
      const uses = new Map<string, number>();
      for (const r of reasons) if (r) uses.set(r, (uses.get(r) ?? 0) + 1);
      const bad = flagged.filter((_, k) => { const r = reasons[k] ?? ''; return !r || (uses.get(r) ?? 0) > 2; });
      if (bad.length) hits.set(f, bad.map((n) => `${n} (${byLine.get(n) ?? ''})`));
    }
    ratchet(hits, new Set<string>(), FIX);
  });
});

// Code languages: every CodeBlock names a language the guard can prove.
// The JSON rule above sees only stringified JSON; a command block, a skill body or a key with no lang showed plain and
// passed. Here the lang value is resolved from the syntax tree (and one import hop): a missing or unprovable value is a
// hit, and a value that can be 'plain' needs a // reason: comment on the <CodeBlock line or on the lang line.
/** The kit's language type names. Pinned against the kit's exports by the test below. */
const CODE_LANG_TYPES = {
  ColouredLang: 'kit/data/codeLang.ts',
  KitLang: 'kit/agent/code.ts',
  HlLang: 'kit/data/highlight.ts',
  CodeLang: 'kit/data/Ids.pure.ts',
} as const;
const HL_LANGS = [...(/HL_LANGS = \[([^\]]*)\]/.exec(readFileSync(join(SRC, 'kit/data/highlight.ts'), 'utf8'))?.[1] ?? '').matchAll(/'([a-z]+)'/g)].map((m) => m[1]!);
/** CodeLang's members (kit/data/Ids.pure.ts): 'plain', the shell names, 'ansi' (terminal output) and the highlighter's languages. */
const CODE_LANGS: ReadonlySet<string> = new Set(['plain', 'shell', 'bash', 'sh', 'ansi', ...HL_LANGS]);
const NONPLAIN_LANGS = [...CODE_LANGS].filter((l) => l !== 'plain' && l !== 'bash' && l !== 'sh');
/** The values each type name stands for: ColouredLang = KitLang = CodeLang without plain and the shell aliases. */
const TYPE_VALUES: Readonly<Record<keyof typeof CODE_LANG_TYPES, readonly string[]>> = {
  ColouredLang: NONPLAIN_LANGS,
  KitLang: NONPLAIN_LANGS,
  HlLang: HL_LANGS,
  CodeLang: [...CODE_LANGS],
};
/** Object.prototype names: a lookup by one of these keys finds a function, not a language. */
const PROTO_NAMES = new Set(['constructor', 'toString', 'toLocaleString', 'valueOf', 'hasOwnProperty', 'isPrototypeOf', 'propertyIsEnumerable', '__proto__', '__defineGetter__', '__defineSetter__', '__lookupGetter__', '__lookupSetter__']);
const NULLISH = '\u0000nullish';
type LangVals = ReadonlySet<string> | null;
type CodeLangHit = { line: number; kind: 'no lang' | 'lang not provable' | "'plain' without a // reason:" };
/** The source of a module one import hop away ('./x', '../x', '@kit/…', '@core/…', '@app/…'), or undefined. */
type ModuleText = (from: string, spec: string) => { file: string; text: string } | undefined;
const diskModule: ModuleText = (from, spec) => {
  const base = spec.startsWith('.') ? join(from.split('/').slice(0, -1).join('/'), spec) : /^@(kit|core|app)\//.test(spec) ? spec.slice(1) : null;
  if (base === null) return undefined;
  const rel = base.split(sep).join('/');
  for (const f of [`${rel}.ts`, `${rel}.tsx`, `${rel}/index.ts`, `${rel}/index.tsx`]) {
    try { return { file: f, text: readFileSync(join(SRC, f), 'utf8') }; } catch { /* next */ }
  }
  return undefined;
};

function codeLangHits(file: string, text: string, moduleText: ModuleText = diskModule): CodeLangHit[] {
  const parse = (f: string, t: string) => ts.createSourceFile(f, t, ts.ScriptTarget.Latest, true, f.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const sf = parse(file, text);
  const lineAt = (n: ts.Node) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
  const strip = (e: ts.Expression): ts.Expression => {
    while (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isSatisfiesExpression(e) || ts.isNonNullExpression(e)) e = e.expression;
    return e;
  };
  /** A top-level declaration of `name` in a source file: a const/let, a function, a type alias, or an import. */
  type Decl = { sf: ts.SourceFile; node: ts.VariableDeclaration | ts.FunctionDeclaration | ts.TypeAliasDeclaration | ts.InterfaceDeclaration } | { sf: ts.SourceFile; imported: string; spec: string };
  const topDecl = (src: ts.SourceFile, name: string): Decl | undefined => {
    for (const st of src.statements) {
      if (ts.isVariableStatement(st)) for (const d of st.declarationList.declarations) if (ts.isIdentifier(d.name) && d.name.text === name) return { sf: src, node: d };
      if ((ts.isFunctionDeclaration(st) || ts.isTypeAliasDeclaration(st) || ts.isInterfaceDeclaration(st)) && st.name?.text === name) return { sf: src, node: st };
      if (ts.isImportDeclaration(st) && st.importClause?.namedBindings && ts.isNamedImports(st.importClause.namedBindings) && ts.isStringLiteral(st.moduleSpecifier)) {
        for (const el of st.importClause.namedBindings.elements) if (el.name.text === name) return { sf: src, imported: (el.propertyName ?? el.name).text, spec: st.moduleSpecifier.text };
      }
    }
    return undefined;
  };
  /** The declaration of a name: in this file, or (one hop) the module it is imported from, never further. The hop is the
   *  whole resolution's: a module reached by it never follows its own imports (a key type imported there is not proven). */
  const declOf = (src: ts.SourceFile, name: string): Exclude<Decl, { imported: string }> | undefined => {
    const d = topDecl(src, name);
    if (!d || !('imported' in d)) return d;
    if (src !== sf) return undefined;
    const m = moduleText(src.fileName, d.spec);
    if (!m) return undefined;
    const there = topDecl(parse(m.file, m.text), d.imported);
    return there && !('imported' in there) ? there : undefined;
  };
  /** The kit module path an import names ('@kit', '@kit/…', or relative), without extension or /index; else undefined. */
  const kitPath = (from: string, spec: string): string | undefined => {
    const base = spec.startsWith('.') ? join(from.split('/').slice(0, -1).join('/'), spec) : spec === '@kit' || spec.startsWith('@kit/') ? spec.slice(1) : undefined;
    return base?.split(sep).join('/').replace(/\.tsx?$/, '').replace(/\/index$/, '');
  };
  /** A kit type name is the kit's only where it is that type: imported under its own name from the kit's index or the
   *  owner file, or declared at the top of the owner file itself. An alias, an import from anywhere else, an undeclared
   *  name, and any type parameter or local type of that name in the file are not (conservative: no scope resolution). */
  const kitType = (src: ts.SourceFile, name: keyof typeof CODE_LANG_TYPES): boolean => {
    const owner = CODE_LANG_TYPES[name];
    const d = topDecl(src, name);
    const ok = !d ? false
      // A `.pure` owner (the pure split) is also reached through its public module, which re-exports it (pinned below).
      : 'imported' in d ? d.imported === name && [owner.replace(/\.tsx?$/, ''), owner.replace(/(\.pure)?\.tsx?$/, ''), 'kit'].includes(kitPath(src.fileName, d.spec) ?? '')
      : src.fileName.endsWith(owner);
    if (!ok) return false;
    let shadowed = false;
    const walk = (n: ts.Node): void => {
      if ((ts.isTypeParameterDeclaration(n) || ts.isTypeAliasDeclaration(n) || ts.isInterfaceDeclaration(n) || ts.isClassLike(n) || ts.isEnumDeclaration(n)) &&
        n.name?.text === name && !(n.parent === src && d && !('imported' in d) && d.node === n)) shadowed = true;
      if (!shadowed) ts.forEachChild(n, walk);
    };
    walk(src);
    return !shadowed;
  };
  const isConst = (d: ts.VariableDeclaration) => ts.isVariableDeclarationList(d.parent) && (d.parent.flags & ts.NodeFlags.Const) !== 0;
  /** The values a type allows: literal unions, null/undefined, the kit's type names, CodeBlockProps['lang']; else null. */
  const typeVals = (t: ts.TypeNode, src: ts.SourceFile): LangVals => {
    if (ts.isParenthesizedTypeNode(t)) return typeVals(t.type, src);
    if (ts.isUnionTypeNode(t)) {
      const out = new Set<string>();
      for (const m of t.types) { const v = typeVals(m, src); if (!v) return null; v.forEach((x) => out.add(x)); }
      return out;
    }
    if (ts.isLiteralTypeNode(t)) {
      if (ts.isStringLiteral(t.literal)) return new Set([t.literal.text]);
      if (t.literal.kind === ts.SyntaxKind.NullKeyword) return new Set([NULLISH]);
      return null;
    }
    if (t.kind === ts.SyntaxKind.UndefinedKeyword) return new Set([NULLISH]);
    if (ts.isTypeReferenceNode(t) && ts.isIdentifier(t.typeName) && !t.typeArguments && t.typeName.text in TYPE_VALUES) {
      const name = t.typeName.text as keyof typeof CODE_LANG_TYPES;
      return kitType(src, name) ? new Set(TYPE_VALUES[name]) : null;
    }
    // CodeBlockProps['lang'] is `lang: CodeLang` (required; the pin test below holds it): CodeLang's
    // members. A Partial<Record<…, CodeBlockProps['lang']>> still reads undefined for a missing key (the map's own rule).
    if (ts.isIndexedAccessTypeNode(t) && ts.isTypeReferenceNode(t.objectType) && t.objectType.typeName.getText(src) === 'CodeBlockProps' &&
      ts.isLiteralTypeNode(t.indexType) && ts.isStringLiteral(t.indexType.literal) && t.indexType.literal.text === 'lang') return new Set(CODE_LANGS);
    return null;
  };
  /** The keys of a finite key type: a literal union, or a named type alias of one (same file or one hop); else null. */
  const keyType = (t: ts.TypeNode, src: ts.SourceFile, depth = 0): ReadonlySet<string> | null => {
    if (depth > 4) return null;
    if (ts.isParenthesizedTypeNode(t)) return keyType(t.type, src, depth);
    if (ts.isUnionTypeNode(t)) {
      const out = new Set<string>();
      for (const m of t.types) { const k = keyType(m, src, depth); if (!k) return null; k.forEach((x) => out.add(x)); }
      return out;
    }
    if (ts.isLiteralTypeNode(t) && ts.isStringLiteral(t.literal)) return new Set([t.literal.text]);
    if (ts.isTypeReferenceNode(t) && ts.isIdentifier(t.typeName) && !t.typeArguments) {
      const d = declOf(src, t.typeName.text);
      return d && ts.isTypeAliasDeclaration(d.node) ? keyType(d.node.type, d.sf, depth + 1) : null;
    }
    return null;
  };
  /** Record<K, V> / Partial<Record<K, V>> of a map const: its value type, whether partial, and its finite keys (null if not finite). */
  const recordOf = (t: ts.TypeNode | undefined, src: ts.SourceFile): { v: ts.TypeNode; partial: boolean; keys: ReadonlySet<string> | null; src: ts.SourceFile } | undefined => {
    if (!t || !ts.isTypeReferenceNode(t) || !ts.isIdentifier(t.typeName)) return undefined;
    if (t.typeName.text === 'Partial' && t.typeArguments?.length === 1) {
      const inner = recordOf(t.typeArguments[0], src);
      return inner && !inner.partial ? { ...inner, partial: true } : undefined;
    }
    if (t.typeName.text !== 'Record' || t.typeArguments?.length !== 2) return undefined;
    return { v: t.typeArguments[1]!, partial: false, keys: keyType(t.typeArguments[0]!, src), src };
  };
  const mapRecord = (m: ts.Expression) => {
    if (!ts.isIdentifier(m)) return undefined;
    const b = binding(m);
    if (b.kind === 'local') return isConst(b.decl) ? recordOf(b.decl.type, sf) : undefined;
    if (b.kind !== 'module') return undefined;
    const d = declOf(sf, m.text);
    return d && ts.isVariableDeclaration(d.node) && isConst(d.node) ? recordOf(d.node.type, d.sf) : undefined;
  };
  const union = (...vs: LangVals[]): LangVals => {
    const out = new Set<string>();
    for (const v of vs) { if (!v) return null; v.forEach((x) => out.add(x)); }
    return out;
  };
  /** The values a parameter-bound name may hold: its declared type's, plus undefined when the parameter is optional
   *  (`lang?: T` with no default: the resolver leaves an optional marker unresolved standing alone). */
  const paramVals = (id: ts.Identifier): LangVals => {
    const t = paramType(id);
    const v = t ? typeVals(t, sf) : null;
    const p = id.parent;
    return v && ts.isParameter(p) && p.questionToken && !p.initializer ? union(v, new Set([NULLISH])) : v;
  };
  /** The declared type of a parameter-bound name, a tuple element included (`([lang, code]: readonly [L, string])`). */
  const paramType = (id: ts.Identifier): ts.TypeNode | undefined => {
    for (let n: ts.Node = id; n.parent; n = n.parent) {
      const p = n.parent;
      if (ts.isParameter(p) && p.name === n) return p.type;
      if (ts.isParameter(p) && ts.isArrayBindingPattern(p.name) && n === p.name) return undefined;
      if (ts.isBindingElement(p) && p.name === n && ts.isArrayBindingPattern(p.parent) && ts.isParameter(p.parent.parent)) {
        let t = p.parent.parent.type;
        while (t && (ts.isTypeOperatorNode(t) || ts.isParenthesizedTypeNode(t))) t = t.type;
        const i = p.parent.elements.indexOf(p);
        if (!t || !ts.isTupleTypeNode(t)) return undefined;
        const el = t.elements[i];
        return el && ts.isNamedTupleMember(el) ? (el.questionToken ? undefined : el.type) : el;
      }
      if (ts.isFunctionLike(p) || ts.isSourceFile(p) || ts.isBlock(p)) return undefined;
    }
    return undefined;
  };
  /** The binding identifiers a parameter declares (its name, or the names of a destructuring pattern). */
  const bindings = (n: ts.BindingName): ts.Identifier[] =>
    ts.isIdentifier(n) ? [n] : n.elements.flatMap((el) => (ts.isBindingElement(el) ? bindings(el.name) : []));
  /** What a name is bound to where it is used, innermost scope first: a parameter, a local variable (in a function, a
   *  block or a for/catch head), a local function, something else local (class, enum, a destructured name), or the module
   *  scope (its top-level declarations and imports, read by declOf). Only the first binding found counts: a parameter or
   *  local of the same name shadows the module's. */
  type Binding =
    | { kind: 'param'; id: ts.Identifier }
    | { kind: 'local'; decl: ts.VariableDeclaration }
    | { kind: 'fn'; decl: ts.FunctionDeclaration }
    | { kind: 'other' }
    | { kind: 'module' };
  const declares = (list: ts.VariableDeclarationList, name: string): ts.VariableDeclaration | 'other' | undefined => {
    for (const d of list.declarations) {
      if (ts.isIdentifier(d.name)) { if (d.name.text === name) return d; }
      else if (bindings(d.name).some((x) => x.text === name)) return 'other';
    }
    return undefined;
  };
  /** Every declaration of a name a use could see besides the module's top-level ones: the parameters and name of each
   *  enclosing function, and a declaration anywhere else in the file outside functions that do not enclose the use (a var
   *  is function-wide, a case clause's declaration is the whole switch's). */
  const visibleDecls = (id: ts.Identifier): Set<ts.Identifier> => {
    const name = id.text, out = new Set<ts.Identifier>(), top = new Set<ts.Node>(), enclosing = new Set<ts.Node>();
    for (let n: ts.Node | undefined = id.parent; n; n = n.parent) enclosing.add(n);
    for (const st of sf.statements) {
      if (ts.isVariableStatement(st)) for (const d of st.declarationList.declarations) bindings(d.name).forEach((x) => top.add(x));
      if ((ts.isFunctionDeclaration(st) || ts.isClassDeclaration(st) || ts.isEnumDeclaration(st)) && st.name) top.add(st.name);
    }
    const add = (x: ts.Identifier | undefined) => { if (x && x.text === name && !top.has(x)) out.add(x); };
    const walk = (n: ts.Node): void => {
      if (ts.isFunctionLike(n) && !enclosing.has(n)) { if (ts.isFunctionDeclaration(n)) add(n.name); return; }
      if (ts.isFunctionLike(n)) { for (const p of n.parameters) bindings(p.name).forEach(add); if (ts.isFunctionExpression(n)) add(n.name); }
      if (ts.isVariableDeclaration(n)) bindings(n.name).forEach(add);
      if ((ts.isFunctionDeclaration(n) || ts.isClassDeclaration(n) || ts.isEnumDeclaration(n)) && n.name) add(n.name);
      ts.forEachChild(n, walk);
    };
    walk(sf);
    return out;
  };
  /** The binding a use resolves to, only when it is the one declaration of that name the use could see; any other
   *  (another case clause, a var in a sibling block, a named function expression, a parameter) leaves it unresolved. */
  const binding = (id: ts.Identifier): Binding => {
    const b = nearestBinding(id);
    const seen = visibleDecls(id);
    if (seen.size === 0) return b;
    const own = b.kind === 'param' ? b.id : b.kind === 'local' && ts.isIdentifier(b.decl.name) ? b.decl.name : b.kind === 'fn' ? b.decl.name : undefined;
    return seen.size === 1 && own && seen.has(own) ? b : { kind: 'other' };
  };
  const nearestBinding = (id: ts.Identifier): Binding => {
    for (let s: ts.Node | undefined = id.parent; s && !ts.isSourceFile(s); s = s.parent) {
      if (ts.isFunctionLike(s)) for (const p of s.parameters) { const b = bindings(p.name).find((x) => x.text === id.text); if (b) return { kind: 'param', id: b }; }
      if ((ts.isForStatement(s) || ts.isForOfStatement(s) || ts.isForInStatement(s)) && s.initializer && ts.isVariableDeclarationList(s.initializer)) {
        const d = declares(s.initializer, id.text);
        if (d) return d === 'other' ? { kind: 'other' } : { kind: 'local', decl: d };
      }
      if (ts.isCatchClause(s) && s.variableDeclaration && bindings(s.variableDeclaration.name).some((x) => x.text === id.text)) return { kind: 'other' };
      const stmts = ts.isBlock(s) || ts.isModuleBlock(s) || ts.isCaseClause(s) || ts.isDefaultClause(s) ? s.statements : undefined;
      if (stmts) for (const st of stmts) {
        if (ts.isVariableStatement(st)) { const d = declares(st.declarationList, id.text); if (d) return d === 'other' ? { kind: 'other' } : { kind: 'local', decl: d }; }
        if (ts.isFunctionDeclaration(st) && st.name?.text === id.text) return { kind: 'fn', decl: st };
        if ((ts.isClassDeclaration(st) || ts.isEnumDeclaration(st)) && st.name?.text === id.text) return { kind: 'other' };
      }
    }
    return { kind: 'module' };
  };
  /** The possible values of a lang expression; null = not provable. `left`: the left side of ?? or || (a Partial map's missing key is removed there). */
  const vals = (e0: ts.Expression, hops: number, left: boolean): LangVals => {
    const e = strip(e0);
    if (ts.isStringLiteralLike(e)) return new Set([e.text]);
    if (e.kind === ts.SyntaxKind.NullKeyword || ts.isVoidExpression(e)) return new Set([NULLISH]);
    if (ts.isConditionalExpression(e)) {
      // An own-property lookup: Object.hasOwn(M, k) ? M[k] : e, or the negated form.
      const own = hasOwnLookup(e);
      if (own) return own;
      return union(vals(e.whenTrue, hops, false), vals(e.whenFalse, hops, false));
    }
    if (ts.isBinaryExpression(e) && (e.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken || e.operatorToken.kind === ts.SyntaxKind.BarBarToken)) {
      const l = vals(e.left, hops, true);
      if (!l) return null;
      const kept = [...l].filter((x) => x !== NULLISH && (e.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken || x !== ''));
      return union(new Set(kept), vals(e.right, hops, false));
    }
    if (ts.isIdentifier(e)) {
      if (e.text === 'undefined') return new Set([NULLISH]);
      if (hops >= 4) return null;
      const b = binding(e);
      if (b.kind === 'param') return paramVals(b.id);
      if (b.kind === 'local') {
        if (b.decl.type) return typeVals(b.decl.type, sf);
        return isConst(b.decl) && b.decl.initializer ? vals(b.decl.initializer, hops + 1, left) : null;
      }
      if (b.kind !== 'module') return null;
      const d = declOf(sf, e.text);
      if (!d || !ts.isVariableDeclaration(d.node)) return null;
      if (d.node.type) return typeVals(d.node.type, d.sf);
      return d.sf === sf && isConst(d.node) && d.node.initializer ? vals(d.node.initializer, hops + 1, left) : null;
    }
    if (ts.isCallExpression(e) && ts.isIdentifier(e.expression)) {
      const b = binding(e.expression);
      const d = b.kind === 'module' ? declOf(sf, e.expression.text) : b.kind === 'fn' ? { sf, node: b.decl } : b.kind === 'local' ? { sf, node: b.decl } : undefined;
      if (!d) return null;
      const n = d.node;
      const ret = ts.isFunctionDeclaration(n) ? n.type
        : ts.isVariableDeclaration(n) && n.initializer && (ts.isArrowFunction(n.initializer) || ts.isFunctionExpression(n.initializer)) ? n.initializer.type : undefined;
      return ret ? typeVals(ret, d.sf) : null;
    }
    if (ts.isElementAccessExpression(e)) {
      // A lookup: a const Record<K, V> with finite keys, none a prototype name. Partial only on the left of ?? / ||.
      const r = mapRecord(strip(e.expression));
      if (!r || !r.keys || [...r.keys].some((k) => PROTO_NAMES.has(k))) return null;
      if (r.partial && !left) return null;
      const v = typeVals(r.v, r.src);
      return v && r.partial ? union(v, new Set([NULLISH])) : v;
    }
    return null;
  };
  /** A key the own-property check can prove: a const binding ("the same const identifiers"); a let, var or parameter
   *  could be reassigned between the check and the lookup. */
  const constKey = (k: ts.Identifier): boolean => {
    const b = binding(k);
    if (b.kind === 'local') return isConst(b.decl);
    if (b.kind !== 'module') return false;
    const d = topDecl(sf, k.text);
    return !!d && !('imported' in d) && ts.isVariableDeclaration(d.node) && isConst(d.node);
  };
  const hasOwnLookup = (e: ts.ConditionalExpression): LangVals | undefined => {
    let cond = strip(e.condition);
    let proven = e.whenTrue, other = e.whenFalse;
    if (ts.isPrefixUnaryExpression(cond) && cond.operator === ts.SyntaxKind.ExclamationToken) { cond = strip(cond.operand); proven = e.whenFalse; other = e.whenTrue; }
    if (!ts.isCallExpression(cond) || cond.expression.getText(sf) !== 'Object.hasOwn' || cond.arguments.length !== 2) return undefined;
    const [m, k] = cond.arguments.map(strip);
    const p = strip(proven);
    if (!m || !k || !ts.isIdentifier(m) || !ts.isIdentifier(k) || !ts.isElementAccessExpression(p)) return undefined;
    const pm = strip(p.expression), pk = strip(p.argumentExpression);
    if (!ts.isIdentifier(pm) || !ts.isIdentifier(pk) || pm.text !== m.text || pk.text !== k.text) return undefined;
    if (!constKey(k)) return undefined;
    const r = mapRecord(m);
    if (!r) return undefined;
    return union(typeVals(r.v, r.src), vals(other, 0, false));
  };
  // Every comment of the file (leading and trailing trivia of each token; JSX text is text, never a comment), by line.
  const comments = new Map<number, string[]>();
  const seen = new Set<number>();
  const jsxText: Array<[number, number]> = [];
  const openEnds = new Set<number>();
  const textSpans = (n: ts.Node): void => {
    if (ts.isJsxText(n)) jsxText.push([n.pos, n.end]);
    if (ts.isJsxOpeningElement(n) || ts.isJsxOpeningFragment(n)) openEnds.add(n.end);
    ts.forEachChild(n, textSpans);
  };
  textSpans(sf);
  const inJsxText = (p: number) => openEnds.has(p) || jsxText.some(([a, b]) => p >= a && p < b);
  const take = (rs: readonly ts.CommentRange[] | undefined) => {
    for (const r of rs ?? []) {
      if (seen.has(r.pos) || inJsxText(r.pos)) continue;
      seen.add(r.pos);
      const line = sf.getLineAndCharacterOfPosition(r.pos).line + 1;
      comments.set(line, [...(comments.get(line) ?? []), text.slice(r.pos, r.end)]);
    }
  };
  const scan = (n: ts.Node): void => {
    if (!ts.isJsxText(n)) { take(ts.getLeadingCommentRanges(text, n.getFullStart())); take(ts.getTrailingCommentRanges(text, n.getEnd())); }
    ts.forEachChild(n, scan);
  };
  scan(sf);
  take(ts.getLeadingCommentRanges(text, sf.endOfFileToken.getFullStart()));
  /** The reason a `// reason:` comment on line n gives ('' when there is none). */
  const reasonAt = (n: number) => {
    const c = (comments.get(n) ?? []).find((x) => /^\/\/\s*reason\s*:/i.test(x));
    return c ? reasonOf(c) : '';
  };
  const out: CodeLangHit[] = [];
  const reasoned: Array<{ line: number; reason: string }> = [];
  const visit = (n: ts.Node): void => {
    if ((ts.isJsxSelfClosingElement(n) || ts.isJsxOpeningElement(n)) && n.tagName.getText(sf) === 'CodeBlock') {
      const line = lineAt(n);
      const a = n.attributes.properties.find((p): p is ts.JsxAttribute => ts.isJsxAttribute(p) && p.name.getText(sf) === 'lang');
      const init = a?.initializer;
      const expr = init && (ts.isJsxExpression(init) ? init.expression : init);
      const v = expr ? vals(expr as ts.Expression, 0, false) : new Set([NULLISH]);
      const missing = !v || v.size === 0 ? false : [...v].every((x) => x === NULLISH || x === '');
      if (missing) out.push({ line, kind: 'no lang' });
      else if (!v || [...v].some((x) => !CODE_LANGS.has(x))) out.push({ line, kind: 'lang not provable' });
      else if (v.has('plain')) {
        const reason = reasonAt(line) || (a ? reasonAt(lineAt(a)) : '');
        if (!reason) out.push({ line, kind: "'plain' without a // reason:" });
        else reasoned.push({ line, reason });
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  // One reason text explains at most 2 'plain' blocks of a file (the JSON rule's cap).
  const uses = new Map<string, number>();
  for (const r of reasoned) uses.set(r.reason, (uses.get(r.reason) ?? 0) + 1);
  for (const r of reasoned) if ((uses.get(r.reason) ?? 0) > 2) out.push({ line: r.line, kind: "'plain' without a // reason:" });
  return out.sort((x, y) => x.line - y.line);
}

/** The tags whose action props kitDuplicateHits reads (the whole-hub prefilter uses the same list). */
const KIT_DUPLICATE_TAGS = /<(ActionMenu|ActionBar|DataTable|ListRow)\b/;
/** Array literals of menu and row actions (ActionMenu items, ActionBar actions, DataTable and ListRow row actions) with two entries of one id. */
function kitDuplicateHits(file: string, text: string): number[] {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const KIT = new Map<string, ReadonlySet<string>>([
    ['ActionMenu', new Set(['items'])],
    ['ActionBar', new Set(['actions', 'items'])],
    ['DataTable', new Set(['actions', 'rowActions', 'toolbarActions'])],
    ['ListRow', new Set(['actions', 'rowActions'])],
  ]);
  const out: number[] = [];
  /** The array literals a prop value stands for: itself, an arrow's returned literal, or a same-file const's literal. */
  const arrays = (e0: ts.Expression | undefined, hop = 0): ts.ArrayLiteralExpression[] => {
    let e = e0;
    while (e && (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isSatisfiesExpression(e))) e = e.expression;
    if (!e) return [];
    if (ts.isArrayLiteralExpression(e)) return [e];
    if ((ts.isArrowFunction(e) || ts.isFunctionExpression(e))) {
      if (!ts.isBlock(e.body)) return arrays(e.body, hop);
      const found: ts.ArrayLiteralExpression[] = [];
      const walk = (n: ts.Node): void => { if (ts.isReturnStatement(n)) found.push(...arrays(n.expression, hop)); else if (!ts.isFunctionLike(n)) ts.forEachChild(n, walk); };
      ts.forEachChild(e.body, walk);
      return found;
    }
    if (ts.isIdentifier(e) && hop === 0) {
      for (let s: ts.Node | undefined = e.parent; s; s = s.parent) {
        const stmts = ts.isBlock(s) || ts.isSourceFile(s) ? s.statements : undefined;
        if (stmts) for (const st of stmts) if (ts.isVariableStatement(st)) for (const d of st.declarationList.declarations) if (ts.isIdentifier(d.name) && d.name.text === e.text) return arrays(d.initializer, 1);
      }
    }
    return [];
  };
  const visit = (n: ts.Node): void => {
    if (ts.isJsxSelfClosingElement(n) || ts.isJsxOpeningElement(n)) {
      const props = KIT.get(n.tagName.getText(sf));
      if (props) for (const p of n.attributes.properties) {
        if (!ts.isJsxAttribute(p) || !props.has(p.name.getText(sf)) || !p.initializer || !ts.isJsxExpression(p.initializer)) continue;
        for (const arr of arrays(p.initializer.expression)) {
          const seen = new Set<string>();
          for (const el of arr.elements) {
            if (!ts.isObjectLiteralExpression(el)) continue;
            const id = el.properties.find((q): q is ts.PropertyAssignment => ts.isPropertyAssignment(q) && q.name.getText(sf) === 'id');
            const v = id && (ts.isStringLiteralLike(id.initializer) ? id.initializer.text : undefined);
            if (v === undefined) continue;
            if (seen.has(v)) out.push(sf.getLineAndCharacterOfPosition(el.getStart(sf)).line + 1);
            seen.add(v);
          }
        }
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

describe('every CodeBlock names a language the guard can prove', () => {
  const FIX =
    "give every <CodeBlock> a lang the guard can prove: a literal (shell, ansi for terminal output, json, ts, js, yaml, http, python, diff), a same-file const, " +
    'a conditional of those, `x ?? y`, a const Record<K, V> lookup with finite keys, or a value declared as ColouredLang, KitLang, HlLang or CodeLang. ' +
    "A block that may show as 'plain' keeps a specific // reason: comment on its <CodeBlock line or its lang line";
  // Terminal files are NOT skipped: the terminal CodeBlock (kit/data/Ids.term.tsx) colours by the same lang through the
  // shared highlighter, so a missing language is wrong there too (not a web-drawing rule; termFiles.ts).
  const scope = read((f) => isSource(f) && /^(pages\/[^/]+|kit|ask|shell)\//.test(f) && !JSON_VIEW_KIT.has(f));
  /** Fixtures: `files` maps a module path to its text; the case is case.tsx beside them. */
  /** A case that uses the kit's type names, with their imports on a last line (an import may stand anywhere at the top). */
  const kit = (src: string) => `${src}\nimport type { KitLang } from '@kit/agent/code'; import type { CodeLang } from '@kit/data/Ids'; import type { HlLang } from '@kit/data/highlight';`;
  const at = (src: string, files: Record<string, string> = {}) =>
    codeLangHits('pages/x/case.tsx', src, (from, spec) => {
      const rel = spec.startsWith('./') ? `pages/x/${spec.slice(2)}` : spec;
      for (const f of [`${rel}.ts`, `${rel}.tsx`]) if (f in files) return { file: f, text: files[f]! };
      return undefined;
    }).map((h) => h.line);

  it('missing languages: none, bare, empty, null, undefined, void, and SshKeyHelp\'s SavedSteps shape', () => {
    expect(at('const e = <CodeBlock code="a" />;')).toEqual([1]);
    expect(at('const e = <CodeBlock code="a" lang />;')).toEqual([1]);
    expect(at('const e = <CodeBlock code="a" lang="" />;')).toEqual([1]);
    expect(at('const e = <CodeBlock code="a" lang={null} />;')).toEqual([1]);
    expect(at('const e = <CodeBlock code="a" lang={undefined} />;')).toEqual([1]);
    expect(at('const e = <CodeBlock code="a" lang={void 0} />;')).toEqual([1]);
    expect(at('const e = <CodeBlock code="a" lang={(void 0)} />;')).toEqual([1]);
    expect(at([
      'const e = (',
      '  <CodeBlock',
      "    label={t('ssh.steps')}",
      '    prompt',
      '    lines={[',
      "      { caption: t('a'), code: 'mkdir -p ~/.ssh' },",
      "      { caption: t('b'), code: 'mv key ~/.ssh/id' },",
      '    ]}',
      '  />',
      ');',
    ].join('\n'))).toEqual([2]);
    expect(at('const e = <CodeBlock code="a" lang="shell" />;')).toEqual([]);
    expect(at('const e = <CodeBlock code="a" lang="ansi" />;')).toEqual([]);
    expect(at('const e = <CodeBlock code="a" lang="cobol" />;')).toEqual([1]);
    const kinds = (src: string) => codeLangHits('pages/x/case.tsx', src).map((h) => h.kind);
    for (const v of ['', ' lang', ' lang=""', ' lang={null}', ' lang={undefined}', ' lang={void 0}']) expect(kinds(`const e = <CodeBlock code="a"${v} />;`), v).toEqual(['no lang']);
    expect(kinds('const e = <CodeBlock code="a" lang="cobol" />;')).toEqual(['lang not provable']);
  });

  it("'plain' needs a reason on the tag line or the lang line, reached directly, by alias or by a branch; one reason text at most twice", () => {
    expect(at('const e = <CodeBlock code="a" lang="plain" />;')).toEqual([1]);
    expect(at("const e = (\n  <CodeBlock\n    label={t('hint.ask')}\n    lang=\"plain\"\n    lines={[{ caption: t('hint.ask'), code: t('hint.p.prompt') }]}\n  />\n);")).toEqual([2]);
    expect(at("const e = (\n  <CodeBlock\n    label={t('hint.ask')}\n    lang=\"plain\" // reason: English prompt for an agent, not a command\n    lines={[{ caption: t('hint.ask'), code: t('hint.p.prompt') }]}\n  />\n);")).toEqual([]);
    expect(at('const e = <CodeBlock code="a" lang="plain" /> // reason: a key is data, not code\n;')).toEqual([]);
    expect(at('const e = (\n  <CodeBlock code="a"\n    lang="plain" // reason: a key is data, not code\n  />\n);')).toEqual([]);
    expect(at('const e = (\n  <CodeBlock code="a" // reason: a key is data, not code\n    lang="plain"\n  />\n);')).toEqual([]);
    expect(at('const e = (\n  <CodeBlock code="a" // just a note\n    lang="plain"\n  />\n);')).toEqual([2]);
    // A string that reads like a reason is not a comment.
    expect(at('const e = <CodeBlock code="// reason: looks like one" lang="plain" />;')).toEqual([1]);
    expect(at('const e = (\n  <CodeBlock code="a"\n    lang="plain" label="// reason: in a string"\n  />\n);')).toEqual([2]);
    expect(at("const e = <CodeBlock code={'x // reason: in a string'} lang=\"plain\" />;")).toEqual([1]);
    expect(at('const e = (\n  <CodeBlock code="a" lang="plain">// reason: text, not a comment\n  </CodeBlock>\n);')).toEqual([2]);
    expect(at("const P = 'plain';\nconst Q = P;\nconst e = <CodeBlock code=\"a\" lang={Q} />;")).toEqual([3]);
    expect(at('const e = <CodeBlock code="a" lang={c ? \'shell\' : \'plain\'} />;')).toEqual([1]);
    expect(at('const e = <CodeBlock code="a" lang={c ? \'shell\' : \'plain\'} /> // reason: a prompt shows as typed\n;')).toEqual([]);
    const three = [1, 2, 3].map((i) => `const e${i} = <CodeBlock code="a" lang="plain" /> // reason: same words`).join('\n');
    expect(at(three)).toEqual([1, 2, 3]);
    const two = [1, 2].map((i) => `const e${i} = <CodeBlock code="a" lang="plain" /> // reason: same words`).join('\n');
    expect(at(two)).toEqual([]);
  });

  it('aliases follow up to 4 hops; conditionals need both branches', () => {
    expect(at("const A = 'json';\nconst B = A;\nconst C = B;\nconst D = C;\nconst e = <CodeBlock code=\"a\" lang={D} />;")).toEqual([]);
    expect(at("const A = 'json';\nconst B = A;\nconst C = B;\nconst D = C;\nconst E = D;\nconst e = <CodeBlock code=\"a\" lang={E} />;")).toEqual([6]);
    expect(at('const e = <CodeBlock code="a" lang={c ? \'json\' : other} />;')).toEqual([1]);
    expect(at('const e = <CodeBlock code="a" lang={c ? \'json\' : \'yaml\'} />;')).toEqual([]);
  });

  it('lookups: a const Record<K, V> with finite keys, one import hop; Partial, string keys, prototype names and unannotated maps fail', () => {
    const logic = { 'pages/x/logic.ts': "export type SnippetKind = 'curl' | 'openai' | 'anthropic' | 'mcp';\nexport const SNIPPET_LANG: Record<SnippetKind, 'shell' | 'python' | 'json'> = { curl: 'shell', openai: 'python', anthropic: 'python', mcp: 'json' };" };
    expect(at("import { SNIPPET_LANG } from './logic';\nconst e = <CodeBlock code=\"a\" lang={SNIPPET_LANG[snippet]} />;", logic)).toEqual([]);
    const door = "type DoorId = 'coding' | 'cli' | 'ssh' | 'web';\nconst LANG: Partial<Record<DoorId, CodeBlockProps['lang']>> = { coding: 'shell', cli: 'shell', ssh: 'shell' };\n";
    expect(at(`${door}const e = <CodeBlock code="a" lang={LANG[selected]} />;`)).toEqual([3]);
    expect(at(`${door}const e = <CodeBlock code="a" lang={LANG[selected] ?? 'plain'} />;`)).toEqual([3]);
    expect(at(`${door}const e = <CodeBlock code="a" lang={LANG[selected] ?? 'plain'} /> // reason: doors without a command block show their text as is\n;`)).toEqual([]);
    // A complete map of CodeBlockProps['lang'] (the Guide's DoorPanel): every key has a CodeLang, so the lookup is provable;
    // its 'plain' members still need the reason.
    const full = "type DoorId = 'coding' | 'cli' | 'ssh' | 'web';\nconst LANG: Record<DoorId, CodeBlockProps['lang']> = { coding: 'shell', cli: 'shell', ssh: 'shell', web: 'plain' };\n";
    expect(at(`${full}const e = <CodeBlock code="a" lang={LANG[selected]} /> // reason: the web door shows an address\n;`)).toEqual([]);
    expect(at(`${full}const e = <CodeBlock code="a" lang={LANG[selected]} />;`)).toEqual([3]);
    expect(at("const LANG: Record<string, 'shell'> = {};\nconst e = <CodeBlock code=\"a\" lang={LANG[k]} />;")).toEqual([2]);
    expect(at("const SOME: Partial<Record<'a' | 'b', 'shell'>> = { a: 'shell' };\nconst e = <CodeBlock code=\"a\" lang={SOME[k]} />;")).toEqual([2]);
    expect(at("const SOME: Partial<Record<'a' | 'b', 'shell'>> = { a: 'shell' };\nconst e = <CodeBlock code=\"a\" lang={SOME[k] ?? 'json'} />;")).toEqual([]);
    expect(at("const LANG = { a: 'shell', b: 'json' };\nconst e = <CodeBlock code=\"a\" lang={LANG[k]} />;")).toEqual([2]);
    for (const op of ['??', '||']) for (const key of ["'toString'", "'constructor'"]) {
      expect(at(`const LANG: Record<string, 'shell'> = {};\nconst key: string = ${key};\nconst e = <CodeBlock code="a" lang={LANG[key] ${op} 'shell'} />;`)).toEqual([3]);
    }
    expect(at("type K = 'a' | 'constructor';\nconst LANG: Record<K, 'shell'> = { a: 'shell', constructor: 'shell' };\nconst e = <CodeBlock code=\"a\" lang={LANG[k]} />;")).toEqual([3]);
    expect(at("const LANG: Record<string, 'shell'> = {};\nconst key: string = pick();\nconst e = <CodeBlock code=\"a\" lang={Object.hasOwn(LANG, key) ? LANG[key] : 'shell'} />;")).toEqual([]);
    expect(at("const LANG: Record<string, 'shell'> = {};\nconst key: string = pick();\nconst e = <CodeBlock code=\"a\" lang={!Object.hasOwn(LANG, key) ? 'shell' : LANG[key]} />;")).toEqual([]);
    // A key that can change between the check and the lookup proves nothing: a let, a parameter, an undeclared name.
    expect(at("const LANG: Record<string, 'shell'> = {};\nlet key: string = pick();\nconst e = <CodeBlock code=\"a\" lang={Object.hasOwn(LANG, key) ? LANG[key] : 'shell'} />;")).toEqual([3]);
    expect(at("const LANG: Record<string, 'shell'> = {};\nconst f = (key: string) => <CodeBlock code=\"a\" lang={Object.hasOwn(LANG, key) ? LANG[key] : 'shell'} />;")).toEqual([2]);
    expect(at("const LANG: Record<string, 'shell'> = {};\nconst e = <CodeBlock code=\"a\" lang={Object.hasOwn(LANG, key) ? LANG[key] : 'shell'} />;")).toEqual([2]);
    // A Partial lookup inside a branch is standing alone even when the whole conditional is the left of ??.
    expect(at("const SOME: Partial<Record<'a' | 'b', 'shell'>> = { a: 'shell' };\nconst e = <CodeBlock code=\"a\" lang={(c ? SOME[k] : 'shell') ?? 'json'} />;")).toEqual([2]);
    // The lexical binding: a local const map passes; a parameter or local that shadows a module map is not that map.
    expect(at("function f(k: 'a' | 'b') {\n  const LOCAL: Record<'a' | 'b', 'json'> = { a: 'json', b: 'json' };\n  return <CodeBlock code=\"a\" lang={LOCAL[k]} />;\n}")).toEqual([]);
    expect(at("const LANG: Record<'a' | 'b', 'shell'> = { a: 'shell', b: 'shell' };\nfunction f(LANG: Record<string, string>, k: 'a') {\n  return <CodeBlock code=\"a\" lang={LANG[k]} />;\n}")).toEqual([3]);
    expect(at("const LANG: Record<'a' | 'b', 'shell'> = { a: 'shell', b: 'shell' };\nfunction f(k: 'a') {\n  const LANG = { a: 'plain' };\n  return <CodeBlock code=\"a\" lang={LANG[k]} />;\n}")).toEqual([4]);
    // Another binding of the name the use could see leaves the lookup unresolved.
    expect(at("const LANG: Record<'a', 'shell'> = { a: 'shell' };\nfunction f() {\n  if (c) { var LANG: Record<'a', 'plain'> = { a: 'plain' }; }\n  return <CodeBlock code=\"a\" lang={LANG['a']} />;\n}")).toEqual([4]);
    expect(at("const LANG: Record<'a', 'shell'> = { a: 'shell' };\nfunction f(k: 'a') {\n  switch (k) {\n    case 'a': const LANG: Record<'a', 'plain'> = { a: 'plain' }; break;\n    default: return <CodeBlock code=\"a\" lang={LANG[k]} />;\n  }\n}")).toEqual([5]);
    expect(at("const LANG: Record<string, 'shell'> = {};\nconst key: string = pick();\nfunction f() {\n  if (c) { var key = 'toString'; }\n  return <CodeBlock code=\"a\" lang={Object.hasOwn(LANG, key) ? LANG[key] : 'shell'} />;\n}")).toEqual([5]);
    expect(at("const LANG: Record<'a', 'shell'> = { a: 'shell' };\nfunction g() { const LANG = { a: 'plain' }; return LANG; }\nfunction f() { return <CodeBlock code=\"a\" lang={LANG['a']} />; }")).toEqual([]);
    // One import hop for the whole resolution: a key type the map's module imports from a second module is not followed.
    const chain = {
      'pages/x/a.ts': "import type { K } from './b';\nexport const MAP: Record<K, 'shell'> = { x: 'shell' };",
      'pages/x/b.ts': "export type K = 'x';",
    };
    expect(at("import { MAP } from './a';\nconst e = <CodeBlock code=\"a\" lang={MAP[k]} />;", chain)).toEqual([2]);
    expect(at("import { MAP } from './a';\nconst e = <CodeBlock code=\"a\" lang={MAP[k]} />;", { 'pages/x/a.ts': "type K = 'x';\nexport const MAP: Record<K, 'shell'> = { x: 'shell' };" })).toEqual([]);
    expect(at("const LANG: Record<string, 'shell'> = {};\nconst e = <CodeBlock code=\"a\" lang={Object.hasOwn(LANG, key) ? LANG[other] : 'shell'} />;")).toEqual([2]);
    // The check and the lookup name the same map (and the same const key, declared here so only the map differs).
    expect(at("const LANG: Record<string, 'shell'> = {};\nconst OTHER: Record<string, 'shell'> = {};\nconst key: string = pick();\nconst e = <CodeBlock code=\"a\" lang={Object.hasOwn(LANG, key) ? OTHER[key] : 'shell'} />;")).toEqual([4]);
    expect(at("const LANG: Record<string, 'shell'> = {};\nconst key: string = pick();\nconst other: string = pick();\nconst e = <CodeBlock code=\"a\" lang={Object.hasOwn(LANG, key) ? LANG[other] : 'shell'} />;")).toEqual([4]);
  });

  it('declared types: the kit language names resolve, | undefined alone does not; ?? and || read both sides', () => {
    expect(at(kit("function kitLang(t: unknown): KitLang | undefined { return undefined; }\nconst e = <CodeBlock code=\"a\" lang={kitLang(x)} />;"))).toEqual([2]);
    expect(at(kit("function kitLang(t: unknown): KitLang | 'plain' { return 'plain'; }\nconst e = <CodeBlock code=\"a\" lang={kitLang(x)} />;"))).toEqual([2]);
    expect(at(kit("function kitLang(t: unknown): KitLang | 'plain' { return 'plain'; }\nconst e = <CodeBlock code=\"a\" lang={kitLang(x)} /> // reason: a reply block with no known language shows as text\n;"))).toEqual([]);
    expect(at(kit("function kitLangOld(t: unknown): KitLang | undefined { return undefined; }\nconst e = <CodeBlock code=\"a\" lang={kitLangOld(x) ?? 'shell'} />;"))).toEqual([]);
    for (const op of ['??', '||']) {
      expect(at(kit(`function chooseLang(): CodeLang | undefined { return undefined; }\nconst e = <CodeBlock code="a" lang={chooseLang() ${op} 'shell'} />;`))).toEqual([2]);
      expect(at(kit(`function chooseLang(): CodeLang | undefined { return undefined; }\nconst e = <CodeBlock code="a" lang={chooseLang() ${op} 'shell'} /> // reason: a chosen language may be plain\n;`))).toEqual([]);
    }
    expect(at("const x = pick();\nconst e = <CodeBlock code=\"a\" lang={x ?? 'shell'} />;")).toEqual([2]);
    expect(at("type OtherLang = string;\nfunction pick(): OtherLang { return 'x'; }\nconst e = <CodeBlock code=\"a\" lang={pick()} />;")).toEqual([3]);
    expect(at("function f(lang: Lang) { return <CodeBlock code=\"a\" lang={lang} />; }")).toEqual([1]);
    expect(at(kit("function f(lang: HlLang) { return <CodeBlock code=\"a\" lang={lang} />; }"))).toEqual([]);
    // An optional parameter may be undefined: refused standing alone, its undefined covered on the left of ??.
    expect(at(kit("function f(lang?: HlLang) { return <CodeBlock code=\"a\" lang={lang} />; }"))).toEqual([1]);
    expect(at(kit("function f(lang?: HlLang) { return <CodeBlock code=\"a\" lang={lang ?? 'shell'} />; }"))).toEqual([]);
    expect(at(kit("function f(lang: HlLang = 'json') { return <CodeBlock code=\"a\" lang={lang} />; }"))).toEqual([]);
    // A call resolves its lexical binding: a parameter or local function that shadows a module function is not it.
    expect(at(kit("function pick(): HlLang { return 'json'; }\nconst f = (pick: () => string) => <CodeBlock code=\"a\" lang={pick()} />;"))).toEqual([2]);
    expect(at(kit("function pick(): HlLang { return 'json'; }\nfunction f() {\n  function pick(): string { return 'cobol'; }\n  return <CodeBlock code=\"a\" lang={pick()} />;\n}"))).toEqual([4]);
    expect(at(kit("function pick(): HlLang { return 'json'; }\nconst f = function pick(): string { return <CodeBlock code=\"a\" lang={pick()} />; };"))).toEqual([2]);
    expect(at(kit("function f() {\n  const pick = (): HlLang => 'json';\n  return <CodeBlock code=\"a\" lang={pick()} />;\n}"))).toEqual([]);
    // A file's own type named like a kit type is not the kit's.
    expect(at("type KitLang = string;\nfunction pick(): KitLang { return 'x'; }\nconst e = <CodeBlock code=\"a\" lang={pick()} />;")).toEqual([3]);
    // Only an import of that name from the kit (its index or the owner file) is the kit's type.
    const pickKit = "function pick(): KitLang { return 'json'; }\nconst e = <CodeBlock code=\"a\" lang={pick()} />;";
    expect(at(`import type { KitLang } from '@kit/agent/code';\n${pickKit}`)).toEqual([]);
    expect(at(`import type { KitLang } from '../../kit/agent/code';\n${pickKit}`)).toEqual([]);
    expect(at("import { type ColouredLang } from '@kit';\nfunction pick(): ColouredLang { return 'json'; }\nconst e = <CodeBlock code=\"a\" lang={pick()} />;")).toEqual([]);
    expect(at(`import type { KitLang } from './other';\n${pickKit}`, { 'pages/x/other.ts': "export type KitLang = 'plain';" })).toEqual([3]);
    expect(at(`import type { Other as KitLang } from '@kit/agent/code';\n${pickKit}`)).toEqual([3]);
    expect(at(pickKit)).toEqual([2]);
    expect(at("import type { KitLang } from '@kit/agent/code';\nfunction f<KitLang extends 'plain'>(lang: KitLang) { return <CodeBlock code=\"a\" lang={lang} />; }")).toEqual([2]);
    expect(at("import type { KitLang } from '@kit/agent/code';\nfunction f() {\n  type KitLang = 'plain';\n  const pick = (): KitLang => 'plain';\n  return <CodeBlock code=\"a\" lang={pick()} />;\n}")).toEqual([5]);
    expect(at("const f = (lang: string) => <CodeBlock code=\"a\" lang={lang} />;")).toEqual([1]);
    expect(at("const e = S.map(([lang, code]) => <CodeBlock key={lang} code={code} lang={lang} />);")).toEqual([1]);
    expect(at(kit("const e = S.map(([lang, code]: readonly [HlLang | 'bash', string]) => <CodeBlock key={lang} code={code} lang={lang} />);"))).toEqual([]);
    expect(at("import { previewLang } from './lang';\nconst e = <CodeBlock code=\"a\" lang={previewLang(n, t)} />;", { 'pages/x/lang.ts': "import { type ColouredLang } from '@kit';\n" + 'export function previewLang(name: string, text: string): ColouredLang | undefined { return undefined; }' })).toEqual([2]);
  });

  it('the kit language type names are the kit\'s: each is exported where the constant says, with the members the guard assumes', () => {
    for (const [name, f] of Object.entries(CODE_LANG_TYPES)) expect(readFileSync(join(SRC, f), 'utf8'), `${name} in ${f}`).toMatch(new RegExp(`export type ${name}\\b`));
    // The type lives in Ids.pure.ts since the pure split (Ids.tsx re-exports it); the required prop stays in Ids.tsx.
    expect(/export type CodeLang = ([^;]+);/.exec(readFileSync(join(SRC, 'kit/data/Ids.pure.ts'), 'utf8'))?.[1]).toBe("'plain' | 'shell' | 'bash' | 'sh' | 'ansi' | HlLang");
    const ids = readFileSync(join(SRC, 'kit/data/Ids.tsx'), 'utf8');
    expect(ids).toMatch(/export type \{[^}]*\bCodeLang\b[^}]*\} from '\.\/Ids\.pure';/);
    // Required: a block with no lang does not compile.
    expect(ids).toMatch(/\n  lang: CodeLang;/);
    expect(readFileSync(join(SRC, 'kit/data/codeLang.ts'), 'utf8')).toMatch(/export type ColouredLang = Exclude<CodeLang, 'plain' \| 'bash' \| 'sh'>;/);
    expect(readFileSync(join(SRC, 'kit/agent/code.ts'), 'utf8')).toMatch(/export type KitLang = ColouredLang;/);
    expect(HL_LANGS.length).toBeGreaterThan(0);
    const hl = readFileSync(join(SRC, 'kit/data/highlight.ts'), 'utf8');
    expect(/export type HlLang = ([^;]+);/.exec(hl)?.[1]).toBe('(typeof HL_LANGS)[number]');
    const hsf = ts.createSourceFile('highlight.ts', hl, ts.ScriptTarget.Latest, true);
    const decl = hsf.statements.filter(ts.isVariableStatement).flatMap((st) => [...st.declarationList.declarations]).find((d) => ts.isIdentifier(d.name) && d.name.text === 'HL_LANGS');
    const init = decl?.initializer && ts.isAsExpression(decl.initializer) ? decl.initializer : undefined;
    expect(init && ts.isTypeReferenceNode(init.type) ? init.type.typeName.getText(hsf) : init?.type.getText(hsf)).toBe('const');
    const arr = init && ts.isArrayLiteralExpression(init.expression) ? init.expression : undefined;
    expect(arr?.elements.every((el) => ts.isStringLiteral(el))).toBe(true);
    expect(arr?.elements.map((el) => (el as ts.StringLiteral).text)).toEqual(HL_LANGS);
    expect(HL_LANGS).not.toContain('plain');
  });

  it('no CodeBlock without a provable language, and no unexplained plain one, beyond the counted rows', () => {
    const counts = new Map<string, number>();
    for (const [f, text] of Object.entries(scope)) {
      if (!text.includes('<CodeBlock')) continue;
      const n = codeLangHits(f, text).length;
      if (n) counts.set(f, n);
    }
    ratchetCounts(counts, allowCounts('std.codeLang'), FIX);
  });
});

describe('menu and row actions have one entry per id (std.kitDuplicates)', () => {
  const scope = read((f) => isSource(f) && /^(pages\/[^/]+|kit|ask|shell)\//.test(f));
  it('finds two entries with one id in an ActionMenu, ActionBar or DataTable actions literal', () => {
    expect(kitDuplicateHits('c.tsx', "const e = <ActionMenu label=\"m\" items={[\n{ id: 'a', label: 'A' },\n{ id: 'a', label: 'B' },\n]} />;")).toEqual([3]);
    expect(kitDuplicateHits('c.tsx', "const e = <ActionBar actions={[{ id: 'go' }, { id: 'go' }]} />;")).toEqual([1]);
    expect(kitDuplicateHits('c.tsx', "const e = <DataTable actions={(r) => [{ id: 'x' }, '-', { id: 'x' }]} />;")).toEqual([1]);
    expect(kitDuplicateHits('c.tsx', "const items = [{ id: 'a' }, { id: 'a' }];\nconst e = <ActionMenu label=\"m\" items={items} />;")).toEqual([1]);
    expect(kitDuplicateHits('c.tsx', "const e = <DataTable rowActions={(r) => [{ id: 'open' }, { id: 'open' }]} />;")).toEqual([1]);
    expect(kitDuplicateHits('c.tsx', "const e = <ListRow actions={[{ id: 'go' }, { id: 'go' }]} />;")).toEqual([1]);
    expect(kitDuplicateHits('c.tsx', "const e = <ListRow rowActions={[{ id: 'go' }, { id: 'go' }]} />;")).toEqual([1]);
    expect(kitDuplicateHits('c.tsx', "const e = <ListRow actions={[{ id: 'go' }, { id: 'stop' }]} />;")).toEqual([]);
    expect(kitDuplicateHits('c.tsx', "const e = <ActionMenu label=\"m\" items={[{ id: 'a' }, { id: 'b' }]} />;")).toEqual([]);
    expect(kitDuplicateHits('c.tsx', "const e = <><ActionMenu label=\"m\" items={[{ id: 'a' }]} /><ActionMenu label=\"n\" items={[{ id: 'a' }]} /></>;")).toEqual([]);
    expect(kitDuplicateHits('c.tsx', "const e = <ActionMenu label=\"m\" items={[{ id: k }, { id: k }]} />;")).toEqual([]);
  });
  it('the whole-hub run reads every tag the guard knows (the prefilter is the guard\'s list)', () => {
    for (const tag of ['ActionMenu', 'ActionBar', 'DataTable', 'ListRow']) expect(KIT_DUPLICATE_TAGS.test(`<${tag} x />`), tag).toBe(true);
  });
  it('no menu or row-action literal repeats an id', () => {
    const hits = new Map<string, string[]>();
    for (const [f, text] of Object.entries(scope)) {
      if (!inScope(f) || !KIT_DUPLICATE_TAGS.test(text)) continue;
      const lines = kitDuplicateHits(f, text);
      if (lines.length) hits.set(f, lines.map(String));
    }
    ratchet(hits, new Set<string>(), 'give each menu item and row action its own id: two entries with one id open the same action twice');
  });
});

// Lint-flip guards. The design lint rules fail; a rule that cannot fit a file gets
// an entry in app/conformance/exceptions.ts (scripts/lint/exceptions.cjs); app/conformance.lintflip.test.ts runs the
// configs. Here: the list's own shape, no inline disable of a hub/ rule, chat names through the ChatNames slot, and no
// internal request header in any strings value.
const { EXCEPTABLE, UI } = createRequire(import.meta.url)('../../scripts/lint/exceptions.cjs') as { EXCEPTABLE: Set<string>; UI: string[] };
/** A ui.* rule id in a comment: every id the detector's ui family has (exceptions.cjs UI), so a new ui rule is covered when it lands.
 * Ids are regex-escaped; a following `.word` (a file name such as ui.rawUrl.tsx) is no mention; an empty list matches nothing. */
const uiRuleNamed = (ids: readonly string[]): RegExp =>
  !ids.length ? /(?!)/ : new RegExp(`\\bui\\.(?:${ids.map((r) => r.slice('ui.'.length).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?![\\w$]|\\.\\w)`);
const UI_RULE_NAMED = uiRuleNamed(UI);

/** Lines of the comments that disable a hub/ rule inline, or name a ui.* rule. A bare directive counts: it switches the hub rules off too. */
function inlineDisableHits(text: string, css = false, file = 'x.tsx'): number[] {
  const lines: number[] = [];
  // Cheap pre-filter: every hit names a linter directive or a ui.* rule, so most files are never parsed.
  if (!/(?:eslint|stylelint)\b/.test(text) && !UI_RULE_NAMED.test(text)) return lines;
  for (const { body, block, pos } of commentsOf(text, css, file)) {
    const directive = /^\s*(?:eslint|stylelint)-disable(?:-next-line|-line)?(?=\s|$)([\s\S]*)/.exec(body);
    let hit = false;
    if (directive) {
      const rules = (directive[1] ?? '').split(/\s--(?:\s|$)/)[0]!.trim();
      hit = !rules || rules.split(/[\s,]+/).some((r) => r.replace(/^['"`]|['"`]$/g, '').startsWith('hub/'));
    } else if (block && /^\s*eslint\s/.test(body) && /\bhub\//.test(body)) hit = true;
    if (UI_RULE_NAMED.test(body)) hit = true;
    if (hit) lines.push(lineOf(text, pos));
  }
  return lines;
}
/** The comments of a source (a TS/TSX syntax walk, so a `//` inside a string or URL is not one) or stylesheet (postcss). */
function commentsOf(text: string, css: boolean, file: string): Array<{ body: string; block: boolean; pos: number }> {
  if (css) {
    const out: Array<{ body: string; block: boolean; pos: number }> = [];
    const root = postcss.parse(text);
    root.walkComments((c) => {
      out.push({ body: c.text, block: true, pos: c.source?.start?.offset ?? 0 });
    });
    return out;
  }
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.ES2022, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const seen = new Map<number, { body: string; block: boolean; pos: number }>();
  const take = (ranges: ts.CommentRange[] | undefined) => {
    for (const r of ranges ?? []) {
      const block = r.kind === ts.SyntaxKind.MultiLineCommentTrivia;
      seen.set(r.pos, { body: text.slice(r.pos + 2, block ? r.end - 2 : r.end), block, pos: r.pos });
    }
  };
  // JSX text is not trivia: a `//` there is text, even though the token before it would scan it as a comment.
  const jsxText: Array<[number, number]> = [];
  const visit = (n: ts.Node) => {
    if (n.kind === ts.SyntaxKind.JsxText) jsxText.push([n.pos, n.end]);
    take(ts.getLeadingCommentRanges(text, n.pos));
    take(ts.getTrailingCommentRanges(text, n.end));
    for (const c of n.getChildren(sf)) visit(c);
  };
  visit(sf);
  return [...seen.values()].filter((c) => !jsxText.some(([a, b]) => c.pos >= a && c.pos < b));
}
/** A strings value that names Telegram, Slack or Discord in words once the ChatNames slot placeholders are removed. */
const chatNameHit = (value: string): boolean => /\b(?:telegram|slack|discord)\b/i.test(value.replace(/\{\{\s*(?:telegram|slack|discord)\s*\}\}/gi, ''));
/** The internal request-header prefix (core/world.test.ts); the AI tab names its products, so those stay out. */
const publicTextHit = (value: string): boolean => /X-Hoody-Bot/i.test(value);
const stringValues = (json: unknown): string[] =>
  typeof json === 'string' ? [json] : json && typeof json === 'object' ? Object.values(json).flatMap(stringValues) : [];

const CHAT_FILE = /^(?:pages|shell|ask|kit)\/(?:.*\/)?(?:[^/]*\.)?strings\.en\.json$/;
const chatJson = read((f) => CHAT_FILE.test(f) && f !== 'kit/widgets/ChatNames.strings.en.json');
const underEntry = (file: string, path: string) => (path.endsWith('/') ? file.startsWith(path) : file === path);
const chatExcepted = (file: string) => EXCEPTIONS.some((e) => e.rules.includes('std.chatName') && underEntry(file, e.path));
const chatCount = (text: string): number => stringValues(JSON.parse(text)).filter(chatNameHit).length;

describe('the lint exception list is well formed', () => {
  it('every entry has only known keys, an existing path of the kind it says, known rules, and a why and by', () => {
    const bad: string[] = [];
    for (const e of EXCEPTIONS) {
      const at = `${e.path}`;
      if (!Object.keys(e).every((k) => ['path', 'rules', 'why', 'by', 'until', 'sites'].includes(k))) bad.push(`${at}: unknown key`);
      if (e.sites && !(e.sites.length && e.rules.every((r) => r.startsWith('ui.')))) bad.push(`${at}: sites need a non-empty list on an entry whose rules are all ui.*`);
      let kind: 'file' | 'dir' | 'none' = 'none';
      try {
        kind = statSync(join(SRC, e.path)).isDirectory() ? 'dir' : 'file';
      } catch {
        /* stays 'none' */
      }
      if (kind !== (e.path.endsWith('/') ? 'dir' : 'file')) bad.push(`${at}: not a ${e.path.endsWith('/') ? 'folder' : 'file'} under hub/src (stale?)`);
      if (!e.rules.length || !e.rules.every((r) => EXCEPTABLE.has(r))) bad.push(`${at}: rules are not all in EXCEPTABLE`);
      if (!e.why.trim() || !e.by.trim()) bad.push(`${at}: why and by are required`);
    }
    expect(bad, 'fix the entry in app/conformance/exceptions.ts (each row needs a recorded reason)').toEqual([]);
  });
  it('no (path, rule) pair repeats and the entries are sorted by path', () => {
    const pairs = EXCEPTIONS.flatMap((e) => e.rules.map((r) => `${e.path} ${r}`));
    expect(pairs.filter((p, i) => pairs.indexOf(p) !== i)).toEqual([]);
    const paths = EXCEPTIONS.map((e) => e.path);
    expect(paths).toEqual([...paths].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
  });
  it('NON_VISUAL_KIT_EXPORTS holds unique, non-empty names', () => {
    expect(NON_VISUAL_KIT_EXPORTS.every((n) => n.trim() !== '')).toBe(true);
    expect(new Set(NON_VISUAL_KIT_EXPORTS).size).toBe(NON_VISUAL_KIT_EXPORTS.length);
  });
  it('a std.chatName entry names a file that still has a chat name', () => {
    const stale = EXCEPTIONS.filter((e) => e.rules.includes('std.chatName')).filter(
      (e) => !ALL.filter((f) => CHAT_FILE.test(f) && underEntry(f, e.path)).some((f) => chatCount(readFileSync(join(SRC, f), 'utf8')) > 0),
    );
    expect(stale.map((e) => e.path), 'these files hold no chat name now: remove the entry').toEqual([]);
  });
});

describe('a hub/ lint rule is never disabled inline', () => {
  const FIX = 'a hub/ rule is never disabled inline: fix the site, or add an entry with a recorded reason in app/conformance/exceptions.ts';
  it('finds the directives and rule names it must, and leaves other disables alone', () => {
    const hit = (s: string, css = false) => inlineDisableHits(s, css).length;
    for (const s of [
      '// eslint-disable-next-line hub/no-raw-color -- x',
      '/* eslint-disable */',
      '// eslint-disable-line',
      '/* eslint-disable react-hooks/exhaustive-deps, hub/no-raw-color */',
      '/* eslint hub/no-raw-color: "off" */',
      '// see ui.pageLook',
    ])
      expect(hit(s), s).toBe(1);
    for (const s of ['/* stylelint-disable hub/no-dashed */', '/* stylelint-disable-next-line */']) expect(hit(s, true), s).toBe(1);
    // Every ui rule the detector has counts (ids such as ui.rawUrl are in exceptions.cjs UI too); a file name is not a rule.
    for (const r of UI) expect(hit(`// see ${r}`), r).toBe(1);
    for (const s of ['// conformance.anatomy.ui.test.ts', '// the ui.* family', '// ui.kitClassName', '// see ui.rawUrl.tsx']) expect(hit(s), s).toBe(0);
    expect(hit('// see ui.rawUrl.')).toBe(1);
    // an empty id list names no rule (it never compiles to an empty alternation that matches every `ui.`)
    for (const s of ['// see ui.rawUrl', '// ui.', '// see ui.x']) expect(uiRuleNamed([]).test(s), s).toBe(false);
    for (const s of ['// eslint-disable-next-line react-hooks/exhaustive-deps -- x', '/* eslint-enable */', 'const s = "eslint-disable";']) expect(hit(s), s).toBe(0);
    expect(hit('/* stylelint-disable-next-line declaration-no-important */', true)).toBe(0);
    // A hub/ name after the reason separator is the reason, not a rule.
    expect(hit('// eslint-disable-next-line react-hooks/exhaustive-deps -- not hub/no-raw-color')).toBe(0);
    // Quoted rule names and a directive after a URL string still disable the rule; string content is not a comment.
    expect(hit('/* eslint-disable "hub/no-raw-color" */')).toBe(1);
    expect(hit('const url = "https://example.com"; /* eslint-disable hub/no-raw-color */')).toBe(1);
    expect(hit('const text = "/* eslint-disable */";')).toBe(0);
    expect(hit('const t = `// eslint-disable-line`;')).toBe(0);
    expect(hit('const e = <p>// eslint-disable-line</p>;')).toBe(0);
    expect(hit('const e = (\n  <p>\n    // eslint-disable-line\n    /* eslint-disable */\n  </p>\n);')).toBe(0);
    // A .ts file is parsed as TS: a generic arrow or a type assertion is not JSX that swallows the comment after it.
    expect(inlineDisableHits('export const identity = <T>(value: T) => value;\n/* eslint-disable hub/no-raw-color */\nexport const color = "#ff0000";', false, 'x.ts')).toEqual([2]);
    expect(inlineDisableHits('export const value = <number>1;\n/* eslint-disable hub/no-raw-color */\nexport const color = "#ff0000";', false, 'x.ts')).toEqual([2]);
    // CSS has no line comments: a // there is text.
    expect(hit('a { background: url(//x); } /* ok */', true)).toBe(0);
    expect(hit('x\n\n// eslint-disable-line')).toBe(1);
    expect(inlineDisableHits('x\n\n// eslint-disable-line')).toEqual([3]);
  });
  it('no source or stylesheet disables a hub/ rule or names a ui.* rule in a comment', () => {
    const files = read((f) => isSource(f) || f.endsWith('.css'));
    const hits = new Map<string, string[]>();
    for (const [f, text] of Object.entries(files)) {
      const lines = inlineDisableHits(text, f.endsWith('.css'), f);
      if (lines.length) hits.set(f, lines.map(String));
    }
    ratchet(hits, new Set<string>(), FIX);
  });
});

describe('chat names come with their logo', () => {
  const FIX = 'chat names come with their logo: use the ChatNames slot ({{telegram}}, {{slack}}, {{discord}})';
  it('finds a bare name and skips the slot placeholders and lookalike words', () => {
    for (const v of ['Telegram', 'your slack workspace', 'Discord logins']) expect(chatNameHit(v), v).toBe(true);
    for (const v of ['{{telegram}} bots', '{{ Slack }}', 'Telegraph', 'slacker', '{{discord}} and {{slack}}']) expect(chatNameHit(v), v).toBe(false);
  });
  it('the scope reaches root-level and nested strings files, not other json', () => {
    for (const f of ['shell/strings.en.json', 'ask/strings.en.json', 'kit/strings.en.json', 'kit/perf.strings.en.json', 'pages/bots/strings.en.json', 'kit/forms/A.strings.en.json']) expect(CHAT_FILE.test(f), f).toBe(true);
    for (const f of ['core/listing-facts.en.json', 'pages/bots/other.json', 'kit/xstrings.en.json']) expect(CHAT_FILE.test(f), f).toBe(false);
  });
  it('strings keep at most their listed chat names', () => {
    const counts = countBy(Object.entries(chatJson).filter(([f]) => !chatExcepted(f)).map(([f, text]) => [f, chatCount(text)]));
    ratchetCounts(counts, allowCounts('std.chatName'), FIX);
  });
});

describe('no internal header in strings', () => {
  it('finds the internal header prefix, not the products', () => {
    for (const v of ['X-Hoody-Bot-Uid', 'x-hoody-bot']) expect(publicTextHit(v), v).toBe(true);
    for (const v of ['Claude Code', 'Anthropic']) expect(publicTextHit(v), v).toBe(false);
  });
  it('no strings value names an internal header', () => {
    const hits = new Map<string, string[]>();
    for (const [f, text] of Object.entries(read((x) => x.endsWith('.en.json')))) {
      const bad = stringValues(JSON.parse(text)).filter(publicTextHit);
      if (bad.length) hits.set(f, bad);
    }
    ratchet(hits, new Set<string>(), 'public text names no internal header: reword the value');
  });
});
