// @vitest-environment node
// hub/page-boundaries (eslint.config.js): another page's fixtures.links.ts is a fixture-only entry. A page's
// fixtures.ts and its test/spec files may import it; a production page file may not, and no other path into another
// page opens beside links.ts. Linted through the Hub's own config, reading only that rule's messages.
import path from 'node:path';
import { ESLint } from 'eslint';
import { beforeAll, describe, expect, it } from 'vitest';
import { lintMs } from './conformance/budget';

const HUB = path.resolve(__dirname, '..', '..');
// The real config, running only the two rules read here: no lint pays for the others (the anatomy rule's whole-tree scan above all).
const RULES = ['hub/page-boundaries', 'no-restricted-imports'];
const eslint = new ESLint({ cwd: HUB, overrideConfigFile: path.join(HUB, 'eslint.config.js'), ruleFilter: ({ ruleId }) => RULES.includes(ruleId) });

/** The message ids this rule reports for a whole source text. */
async function boundaryIds(file: string, source: string): Promise<string[]> {
  const [r] = await eslint.lintText(source, { filePath: path.join(HUB, 'src', 'pages', file) });
  return (r?.messages ?? []).filter((m) => m.ruleId === 'hub/page-boundaries').map((m) => m.messageId ?? '');
}

async function refusals(file: string, spec: string): Promise<number> {
  const [r] = await eslint.lintText(`import { storageRules } from '${spec}';\nexport const x = storageRules;\n`, { filePath: path.join(HUB, 'src', 'pages', file) });
  return (r?.messages ?? []).filter((m) => m.ruleId === 'hub/page-boundaries').length;
}

// The first lint pays the Hub config load. Warm it once here, under its own timeout, so no test carries the cold cost.
beforeAll(async () => {
  await refusals('computers/fixtures.ts', '../files/fixtures.links');
}, lintMs(120_000));

describe('hub/page-boundaries: fixtures.links.ts', () => {
  it.each([
    ['computers/fixtures.ts', 'fixtures.ts'],
    ['computers/storage.mount.test.tsx', 'a test'],
    ['computers/parts/deep.test.ts', 'a nested test'],
    ['computers/storage.spec.ts', 'a spec'],
  ])('allows ../files/fixtures.links from %s (%s)', async (file) => {
    const spec = file.includes('/parts/') ? '../../files/fixtures.links' : '../files/fixtures.links';
    expect(await refusals(file, spec)).toBe(0);
    expect(await refusals(file, `${spec}.ts`)).toBe(0);
  });

  it.each(['computers/DetailView.tsx', 'computers/data.ts', 'computers/parts/fixtures.ts', 'computers/fixtures.links.ts'])(
    'refuses ../files/fixtures.links from the production or nested file %s',
    async (file) => {
      const spec = file.includes('/parts/') ? '../../files/fixtures.links' : '../files/fixtures.links';
      expect(await refusals(file, spec)).toBe(1);
    },
  );

  it.each(['../files/storage', '../files/storage/fixtures', '../files/fixtures', '../files/storage/fixtures.links', '../files/other.links', '../files/links.extra'])(
    'refuses any other path into another page from fixtures.ts and tests: %s',
    async (spec) => {
      expect(await refusals('computers/fixtures.ts', spec)).toBe(1);
      expect(await refusals('computers/storage.mount.test.tsx', spec)).toBe(1);
    },
  );

  it('keeps links.ts open to every page file', async () => {
    expect(await refusals('computers/DetailView.tsx', '../files/links')).toBe(0);
    expect(await refusals('computers/fixtures.ts', '../files/links')).toBe(0);
  });
});

// The page test and spec blocks match page tests at any depth, so a nested test (pages/files/transfers/*.test.tsx)
// may use @app/testing and a nested spec @app/e2e, as top-level ones may; a nested production file still may not.
async function appRefusals(file: string, spec: string): Promise<number> {
  const [r] = await eslint.lintText(`import * as m from '${spec}';\nexport const x = m;\n`, { filePath: path.join(HUB, 'src', 'pages', file) });
  return (r?.messages ?? []).filter((m) => m.ruleId === 'no-restricted-imports').length;
}

describe('page tests at any depth: @app/testing and @app/e2e', () => {
  it.each(['files/transfers.test.tsx', 'files/transfers/routes.test.tsx', 'files/transfers/deep/x.test.ts'])('allows @app/testing from the test %s', async (file) => {
    expect(await appRefusals(file, '@app/testing')).toBe(0);
  });

  it.each(['files/page.spec.ts', 'files/transfers/transfers.spec.ts'])('allows @app/e2e from the spec %s', async (file) => {
    expect(await appRefusals(file, '@app/e2e')).toBe(0);
  });

  it.each(['files/transfers/Transfers.tsx', 'files/transfers/routes.ts'])('refuses @app/testing from the production file %s', async (file) => {
    expect(await appRefusals(file, '@app/testing')).toBe(1);
  });

  it('refuses @app/e2e from a nested test (specs only)', async () => {
    expect(await appRefusals('files/transfers/routes.test.tsx', '@app/e2e')).toBe(1);
  });

  // Only a file whose name ends in .test.ts(x) / .spec.ts is a test: a helper named like a test and a production file
  // in a folder named like one keep the page bans.
  it.each(['files/transfers/routes.test.helpers.ts', 'files/x.test/Panel.tsx', 'files/transfers/x.spec/data.ts'])('refuses @app/testing from %s (not a test file)', async (file) => {
    expect(await appRefusals(file, '@app/testing')).toBe(1);
  });

  it.each(['files/transfers/Transfers.tsx', 'files/x.spec.helpers.ts'])('refuses @app/e2e from the production file %s', async (file) => {
    expect(await appRefusals(file, '@app/e2e')).toBe(1);
  });
});

// The rule judges where a specifier resolves (path.resolve), not how it is spelled: a dot segment or a climb and
// return changes nothing. A backslash is not judged by where it resolves: path.resolve reads it as a file-name character on
// POSIX and a separator on Windows, so the rule reports any specifier containing one as an escape (the last test below).
describe('hub/page-boundaries: a specifier is judged where it resolves', () => {
  it.each([
    '../files/./fixtures.links',
    '../files/x/../fixtures.links',
    '../computers/../files/fixtures.links',
    '.././files/fixtures.links.ts',
  ])('allows %s from a fixtures.ts and a test (it resolves to the other page\'s fixtures.links)', async (spec) => {
    expect(await refusals('computers/fixtures.ts', spec)).toBe(0);
    expect(await refusals('computers/storage.mount.test.tsx', spec)).toBe(0);
  });

  it.each([
    '../files/./storage',
    '../files/x/../storage',
    '../computers/../files/storage',
    '../files/fixtures.links/../storage',
  ])('refuses %s from a fixtures.ts and a test (it resolves into the other page)', async (spec) => {
    expect(await refusals('computers/fixtures.ts', spec)).toBe(1);
    expect(await refusals('computers/storage.mount.test.tsx', spec)).toBe(1);
  });

  it('refuses a production file the same spelling of the fixtures entry, and a normalised climb out of pages', async () => {
    expect(await refusals('computers/DetailView.tsx', '../files/./fixtures.links')).toBe(1);
    expect(await refusals('computers/fixtures.ts', '../../kit/x')).toBe(1);
    expect(await refusals('computers/fixtures.ts', '../files/../../kit/x')).toBe(1);
  });

  // Written with doubled backslashes: refusals() puts the spec into the source of a string literal, which would read
  // '\f' as a form feed. A Windows spelling into another page, into the own page and in an alias are all refused, from a
  // production file and from fixtures.ts / a test alike.
  it.each(['..\\files\\storage', '..\\files\\fixtures.links', '.\\parts\\Row', '@core\\x'])('refuses the backslash specifier %s as an escape', async (spec) => {
    const source = spec.replace(/\\/g, '\\\\');
    expect(await refusals('computers/DetailView.tsx', source)).toBe(1);
    expect(await refusals('computers/fixtures.ts', source)).toBe(1);
    expect(await refusals('computers/storage.mount.test.tsx', source)).toBe(1);
  });

  // The message is 'escape' whatever form names the module: an import, an export-from, an export-all, a dynamic import
  // with a string and with a template (the rule sends each through the same check).
  it('reports a backslash specifier as the escape message from every module-naming form', async () => {
    const text = '..\\files\\storage'.replace(/\\/g, '\\\\');
    const sources = [
      `import { a } from '${text}';\nexport const x = a;\n`,
      `export { a } from '${text}';\n`,
      `export * from '${text}';\n`,
      `export const x = import('${text}');\n`,
      `export const x = import(\`${text}\`);\n`,
    ];
    for (const source of sources) expect(await boundaryIds('computers/DetailView.tsx', source), source).toEqual(['escape']);
  });
});

// `@term/prim`: the page-facing terminal barrel (src/term/prim/page.ts, layout and text only).
// Only a page's .term file imports it; any deeper alias path is refused; a relative path into src/term or scripts/term
// is refused, except the term test helpers (scripts/term/*, prim/testing, prim/semantics) from a .term test.
// The resolver and barrel half: scripts/term/page-prim-alias.term.test.ts.
describe('hub/page-boundaries: @term/prim', () => {
  const imp = (spec: string, name = 'Box'): string => `import { ${name} } from '${spec}';\nexport const x = ${name};\n`;
  it('allows @term/prim in a page .term file and a .term test', async () => {
    expect(await boundaryIds('computers/parts/Flag.term.tsx', imp('@term/prim'))).toEqual([]);
    expect(await boundaryIds('computers/Detail.term.ts', imp('@term/prim'))).toEqual([]);
    expect(await boundaryIds('computers/parts/Flag.term.test.tsx', imp('@term/prim'))).toEqual([]);
  });
  it.each(['computers/parts/Flag.tsx', 'computers/data.ts', 'computers/parts/Flag.test.tsx'])('refuses @term/prim in the web file %s', async (file) => {
    expect(await boundaryIds(file, imp('@term/prim'))).toEqual(['termAliasWeb']);
  });
  it.each(['@term/prim/Box', '@term/prim/focus', '@term/prim/otui', '@term', '@term/jsx', '@term/prim/page'])('refuses the deeper alias %s, even in a .term file', async (spec) => {
    expect(await boundaryIds('computers/parts/Flag.term.tsx', imp(spec))).toEqual(['termAliasDeep']);
  });
  it.each([
    ['computers/parts/Flag.term.tsx', '../../../term/prim', 'Box', ['termRelative']],
    ['computers/parts/Flag.term.tsx', '../../../term/prim/semantics', 'useSem', ['termRelative']],
    ['computers/parts/Flag.term.tsx', '../../../../scripts/term/render', 'renderPage', ['termRelative']],
    ['computers/parts/Flag.test.tsx', '../../../../scripts/term/render', 'renderPage', ['termRelative']],
    ['computers/parts/Flag.term.test.tsx', '../../../term/prim/focus', 'useFocusable', ['termRelative']],
    ['computers/parts/Flag.term.test.tsx', '../../../term/prim/testingX', 'drawTest', ['termRelative']],
    ['computers/parts/Flag.term.test.tsx', '../../../../scripts/term/render', 'renderPage', []],
    ['computers/parts/Flag.term.test.tsx', '../../../term/prim/testing', 'drawTest', []],
    ['computers/parts/Flag.term.test.tsx', '../../../term/prim/semantics.ts', 'semanticsOf', []],
  ] as const)('%s importing %s: %j', async (file, spec, name, want) => {
    expect(await boundaryIds(file, imp(spec, name))).toEqual([...want]);
  });
});
