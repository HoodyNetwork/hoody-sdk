// @vitest-environment node
// hub/retired-alias: danger is a `tone` (Button, LinkButton, IconButton, Dialog's
// primaryTone). The old spellings still draw the same, so they stay as aliases with a lint warning (variant="danger" or
// "dangerSolid" on a kit button, primaryVariant="danger"), and their count in the Hub's sources only shrinks:
// a caller that moves lowers CEILING in the same change, and at zero the old names are retired. One detector: the count
// is the lint's own, never a second regex. CEILING is a guard row a maintainer signs off.
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';
import { lintMs } from './conformance/budget';

const HUB = path.resolve(__dirname, '..', '..');
const RULE = 'hub/retired-alias';
/** The most hits the Hub's sources (tests and specs left out) may hold. Every caller is on `tone` now, so it is 0: the old
 *  names may be retired. It never goes up. */
const CEILING = 0;

// Only the rule under test runs (ruleFilter), with the Hub's own config: which files it is on is the config's choice.
const eslint = new ESLint({ cwd: HUB, overrideConfigFile: path.join(HUB, 'eslint.config.js'), ruleFilter: ({ ruleId }) => ruleId === RULE });

async function hits(file: string, source: string): Promise<string[]> {
  const [r] = await eslint.lintText(source, { filePath: path.join(HUB, 'src', file) });
  return (r?.messages ?? []).filter((m) => m.ruleId === RULE).map((m) => `${m.messageId ?? ''}:${m.severity}`);
}

const page = (body: string) => `import { Badge, Button, Dialog, IconButton, LinkButton } from '@kit';\nexport function P({ x }: { x: boolean }) { return <>${body}</>; }\n`;
const PROBE = 'pages/demo/aliasprobe.tsx';

describe('hub/retired-alias: the old names warn', () => {
  it.each([
    ['variant="danger" on a Button', '<Button variant="danger">x</Button>', 'variant'],
    ['variant={"dangerSolid"} on a Button', '<Button variant={"dangerSolid"}>x</Button>', 'variant'],
    ['variant="danger" on a LinkButton', '<LinkButton href="#/" variant="danger">x</LinkButton>', 'variant'],
    ['variant="danger" on an IconButton', '<IconButton icon="trash" label="x" variant="danger" />', 'variant'],
    ['a conditional variant on a Button', '<Button variant={x ? "danger" : "primary"}>x</Button>', 'variant'],
    ['a logical variant on an IconButton', '<IconButton icon="trash" label="x" variant={x && "danger"} />', 'variant'],
    ['variant: "danger" as const spread onto a Button', '<Button {...(x ? { variant: "danger" as const } : { variant: "secondary" as const })}>x</Button>', 'variant'],
    ['primaryVariant="danger" on a Dialog', '<Dialog isOpen onOpenChange={() => {}} title="x" primaryVariant="danger" />', 'primaryVariant'],
    ['primaryVariant: "danger" in a spread props object', '<Dialog isOpen onOpenChange={() => {}} title="x" {...{ primaryVariant: "danger" as const }} />', 'primaryVariant'],
  ])('reports %s, as a warning', async (_what, body, id) => {
    expect(await hits(PROBE, page(body))).toEqual([`${id}:1`]);
  });

  it('leaves the new spellings, other components and test files alone', async () => {
    const fine = page(
      '<Button tone="danger">x</Button><Button variant="primary" tone="danger">x</Button><IconButton icon="trash" label="x" tone="danger" isDisabled disabledReason="y" />' +
        '<Badge variant="danger">x</Badge><Badge {...{ variant: "danger" }}>x</Badge><Dialog isOpen onOpenChange={() => {}} title="x" primaryVariant="secondary" primaryTone="danger" />' +
        '<Button variant={x ? "secondary" : "primary"} tone={x ? "danger" : "default"}>x</Button>',
    );
    expect(await hits(PROBE, fine)).toEqual([]);
    expect(await hits('pages/demo/aliasprobe.test.tsx', page('<Button variant="danger">x</Button>'))).toEqual([]);
  });
});

// The rule reads a literal's decoded value, so an old name can be written with no "danger" in the file's text: an escape
// (\u0067), a JSX character entity (&#103;). No text prefilter is a superset of that, so the scan below
// lints every source the rule is on, and the lint alone decides what counts.
const ESCAPED = page('<Button variant={"dan\\u0067er"}>x</Button>');
const ENTITY = page('<Button variant="dan&#103;er">x</Button>');
const MTS = 'export const props = { primaryVariant: "danger" as const };\n';

describe('hub/retired-alias: the scan sees what the rule sees', () => {
  it('an old name written with an escape or a JSX entity warns (so the scan lints every source, not a text match)', async () => {
    expect(await hits(PROBE, ESCAPED)).toEqual(['variant:1']);
    expect(await hits(PROBE, ENTITY)).toEqual(['variant:1']);
  });

  it('an .mts source warns (so the scan below reads .mts sources too)', async () => {
    expect(await hits('pages/demo/aliasprobe.mts', MTS)).toEqual(['primaryVariant:1']);
  });
});

// The sources the rule is on (eslint.config.js: src/**/*.{ts,tsx,mts}, off in **/*.test.{ts,tsx,mts} and **/*.spec.ts; a
// .d.ts holds no values, and the glob skips dot-directories, of which src has none: the test below checks both ways).
const sources = import.meta.glob(['../**/*.{ts,tsx,mts}', '!../**/*.test.{ts,tsx,mts}', '!../**/*.spec.ts'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
// A glob key is relative to this file: '../kit/x.tsx', and './x.tsx' for a file beside it in app/.
const scanned = new Set(Object.keys(sources).map((k) => path.resolve(__dirname, k)));

/** True when ESLint, with the Hub's config, has the rule on for a file (a calculated rule is [severity, ...options]). */
async function ruleOn(file: string): Promise<boolean> {
  const v = ((await eslint.calculateConfigForFile(file)) as { rules?: Record<string, unknown> } | undefined)?.rules?.[RULE];
  const sev = Array.isArray(v) ? v[0] : v;
  return sev !== undefined && sev !== 0 && sev !== 'off';
}

/** Every .ts/.tsx/.mts file under a directory, dot-directories included, node_modules and dist left out. */
function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === 'node_modules' || e.name === 'dist' ? [] : walk(p);
    return /\.(ts|tsx|mts)$/.test(e.name) ? [p] : [];
  });
}

// The scan and the rule's scope are one set, asked of ESLint itself, so they cannot drift.
describe('hub/retired-alias: the scan reads exactly the files the rule is on', () => {
  it('ESLint has the rule on for every file the scan reads, and the scan reads every src file the rule is on', async () => {
    const off: string[] = [];
    for (const f of scanned) if (!(await ruleOn(f))) off.push(path.relative(HUB, f));
    expect(off, 'scanned, but the rule is off there').toEqual([]);
    const missed: string[] = [];
    for (const f of walk(path.join(HUB, 'src'))) if (!scanned.has(f) && (await ruleOn(f))) missed.push(path.relative(HUB, f));
    expect(missed, 'the rule is on there, but the scan never reads it').toEqual([]);
  }, lintMs(300_000));

  it('the rule is off outside src: configs, scripts and the live e2e harness render no kit button', async () => {
    for (const f of ['vite.config.mts', 'vite.term.config.mts', 'playwright.config.ts', 'scripts/text-scan.ts', 'e2e-live/mock.ts']) expect(await ruleOn(path.join(HUB, f)), f).toBe(false);
  });
});

describe('hub/retired-alias only shrinks', () => {
  it(`the Hub holds at most ${CEILING} old spellings (lower CEILING when one moves)`, async () => {
    const found: string[] = [];
    for (const [key, src] of Object.entries(sources)) {
      const file = path.relative(path.join(HUB, 'src'), path.resolve(__dirname, key));
      for (const h of await hits(file, src)) found.push(`${file} ${h}`);
    }
    expect(found.length, `hub/retired-alias hits:\n${found.join('\n')}`).toBeLessThanOrEqual(CEILING);
    // The scan reaches the sources: while any caller is left on an old name, it is found.
    if (CEILING > 0) expect(found.length).toBeGreaterThan(0);
  }, lintMs(180_000));
});
