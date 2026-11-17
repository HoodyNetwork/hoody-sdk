// Shortcut hints at their callers: a button's name is its label alone, and aria-keyshortcuts names only a key
// that works from that button. A hint whose key works elsewhere keeps its badge and passes aria-keyshortcuts="".
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { render, screen } from '@testing-library/react';
import { createColumnHelper } from '@tanstack/react-table';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { DataTable } from '../data/DataTable';

vi.mock('../nav', () => ({
  useSearchParam: () => [undefined, () => undefined],
}));

type Row = { id: string; name: string };
const ROWS: Row[] = [
  { id: 'a', name: 'alpha' },
  { id: 'b', name: 'bravo' },
];
const col = createColumnHelper<Row>();
const COLUMNS = [col.accessor('name', { header: 'Name' })];
const SRC = join(import.meta.dirname, '..', '..');

function tsxFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return tsxFiles(p);
    return e.isFile() && p.endsWith('.tsx') && !p.endsWith('.test.tsx') ? [p] : [];
  });
}

type ButtonSite = { line: number; attrs: Map<string, string>; holdsShortcut: boolean };

/** Every <Button> in tsx, read from the JSX tree: its attributes (string values unquoted, expressions as source) and
 *  whether a <Shortcut> sits anywhere inside its label. A self-closing Button has no label. */
function buttonSites(file: string, text: string): ButtonSite[] {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX);
  const isShortcut = (n: ts.Node): boolean =>
    ((ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) && n.tagName.getText(sf) === 'Shortcut') ||
    (ts.forEachChild(n, isShortcut) ?? false);
  const sites: ButtonSite[] = [];
  const visit = (n: ts.Node): void => {
    const open = ts.isJsxElement(n) ? n.openingElement : ts.isJsxSelfClosingElement(n) ? n : undefined;
    if (open && open.tagName.getText(sf) === 'Button') {
      const attrs = new Map<string, string>();
      for (const a of open.attributes.properties) {
        if (!ts.isJsxAttribute(a)) continue;
        const v = a.initializer;
        attrs.set(a.name.getText(sf), !v ? 'true' : ts.isStringLiteral(v) ? v.text : v.getText(sf));
      }
      const holdsShortcut = ts.isJsxElement(n) && n.children.some(isShortcut);
      sites.push({ line: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1, attrs, holdsShortcut });
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return sites;
}

/** Lines of the Buttons in tsx whose label holds a <Shortcut>. */
function shortcutInsideButton(file: string, text: string): number[] {
  return buttonSites(file, text).filter((b) => b.holdsShortcut).map((b) => b.line);
}

describe('shortcut hints at their callers', () => {
  it('the bulk Clear shows Esc but does not announce it: Escape clears from a row, not from the button', () => {
    render(
      <DataTable
        label="Things"
        data={ROWS}
        columns={COLUMNS}
        getRowId={(r) => r.id}
        selectable
        selectedIds={new Set(['a'])}
        onSelectionChange={() => {}}
        bulkActions={() => null}
      />,
    );
    const clear = screen.getByRole('button', { name: 'Clear' });
    expect(clear).not.toHaveAttribute('aria-keyshortcuts');
    expect(clear.querySelector('kbd'), 'the Esc badge stays visible').not.toBeNull();
  });

  it('Scripts Save carries Mod+S as its badge, unannounced (the editor binds it), never as a child of its label', () => {
    const file = join(SRC, 'pages/scripts/parts/Detail.tsx');
    const saves = buttonSites(file, readFileSync(file, 'utf8')).filter((b) => /\bed\.save\(\)/.test(b.attrs.get('onPress') ?? ''));
    expect(saves, 'one Save button').toHaveLength(1);
    expect(saves[0]!.attrs.get('shortcut')).toBe('Mod+S');
    expect(saves[0]!.attrs.get('aria-keyshortcuts')).toBe('');
    expect(saves[0]!.holdsShortcut).toBe(false);
  });

  it('no Button in the Hub puts a <Shortcut> inside its label (use the shortcut prop)', () => {
    const hits = tsxFiles(SRC).flatMap((f) =>
      shortcutInsideButton(f, readFileSync(f, 'utf8')).map((line) => `${relative(SRC, f)}:${line}`),
    );
    expect(hits).toEqual([]);
  }, 60_000);

  it('the guard reads JSX, not text: only a Shortcut inside a Button label is blamed', () => {
    const lines = (tsx: string) => shortcutInsideButton('fixture.tsx', tsx);
    // A self-closing Button before prose with a Shortcut, then another Button.
    expect(lines('<>\n<Button aria-label="Close" />\n<p><Shortcut keys="N" /> adds an item</p>\n<Button>Continue</Button>\n</>')).toEqual([]);
    expect(lines('<Link to="/x"><Shortcut keys="N" /></Link>'), 'another tag is not a Button').toEqual([]);
    expect(lines('<Button icon={<Shortcut keys="N" />}>Go</Button>'), 'a prop is not the label').toEqual([]);
    expect(lines('<Button onPress={() => go()}>Go <Shortcut keys="G" /></Button>'), 'an arrow prop hides nothing').toEqual([1]);
    expect(lines('<>\n<Button>\n  Go <span><Shortcut keys="G" /></span>\n</Button>\n</>'), 'a nested child counts').toEqual([2]);
  });
});
