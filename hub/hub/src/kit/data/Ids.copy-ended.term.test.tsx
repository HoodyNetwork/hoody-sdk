// A copy from an ended mount reaches nothing: prim has no global copy; every
// terminal copy path takes the copy of the component that handles it (useClipboard, bound to its renderer).
//
// | # | Behaviour | Test |
// |---|---|---|
// | 1 | useCopy (CopyButton, IdChip, SecretField's c), useBoundCopyText (SecretField's load path, Menu's choose) and kit/states useCopyText (Handoff's c, ErrorDetails): kept past the end of mount A, with mount B live, they copy nothing to A or B; B's own copy works | 'kept hook copies after the end' |
// | 2 | The module-level copyText answers false in the terminal (no unbound copy) | 'module copyText refuses' |
// | 3 | No global copy is left: prim exports none, and no terminal file calls the module copyText or imports a copy from prim other than useClipboard; DataTable's row actions take the table's own copy | 'no unbound copy path' |
import { expect, test } from 'bun:test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createElement, useState, type ReactElement } from 'react';
import * as prim from '../../term/prim';
import { ClipboardHost } from '../../term/prim/clipboard';
import { copiesOf, drawTest } from '../../term/prim/testing';
import { el } from '../../term/prim/otui';
import { copyText, useCopy } from './Ids.term';
import { useBoundCopyText } from './termCopyText';
import { useCopyText as useStatesCopy } from '../states/termCopy';

type Kept = { copy?: (t: string | null) => void; text?: (t: string) => Promise<boolean>; hand?: (t: string) => boolean; state?: string; end?: () => void };
function Grab({ out }: { out: Kept }): ReactElement {
  const [state, copy] = useCopy();
  out.copy = copy;
  out.state = state;
  out.text = useBoundCopyText();
  out.hand = useStatesCopy()[0];
  return el('box', null);
}
function Mount({ out }: { out: Kept }): ReactElement {
  const [on, setOn] = useState(true);
  out.end = () => { setOn(false); };
  return el('box', null, createElement(Grab, { out }), on ? createElement(ClipboardHost) : null);
}

test('kept hook copies after the end', async () => {
  const a: Kept = {};
  const ta = await drawTest(createElement(Mount, { out: a }), { width: 20, height: 3 });
  const sentA = copiesOf(ta.renderer);
  a.end!();
  await ta.settle();
  const b: Kept = {};
  const tb = await drawTest(createElement(Mount, { out: b }), { width: 20, height: 3 });
  const sentB = copiesOf(tb.renderer);
  a.copy!('hbk_CANARY_A1');
  expect(await a.text!('hbk_CANARY_A2')).toBe(false);
  expect(a.hand!('hbk_CANARY_A3')).toBe(false);
  await ta.settle();
  expect(a.state).toBe('failed');
  expect(sentA).toEqual([]);
  expect(sentB).toEqual([]);
  await b.text!('in B'); // the headless renderer answers false itself; what was sent is the proof
  expect(sentB).toEqual(['in B']);
  b.hand!('in B too');
  expect(sentB).toEqual(['in B', 'in B too']);
  ta.renderer.destroy();
  tb.renderer.destroy();
});

test('module copyText refuses', async () => {
  expect(await copyText('anything')).toBe(false);
});

test('no unbound copy path', () => {
  expect('copy' in prim).toBe(false);
  const root = join(import.meta.dir, '..', '..');
  const files: string[] = [];
  const walk = (d: string) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) { if (n !== 'node_modules') walk(p); } else if (/\.term\.tsx?$/.test(n) && !/\.test\./.test(n)) files.push(p); } };
  walk(root);
  const bad: string[] = [];
  for (const f of files) {
    const s = readFileSync(f, 'utf8');
    if (/import\s*\{[^}]*\bcopy\b[^}]*\}\s*from\s*'[^']*term\/prim'/.test(s)) bad.push(f + ': imports copy from prim');
    if (/\bimport\s*\{[^}]*\bcopyText\b[^}]*\}\s*from\s*'[^']*data\/Ids'/.test(s) && /[^.\w]copyText\(/.test(s) && !/const copyText = useBoundCopyText\(\)/.test(s)) bad.push(f + ': calls the module copyText');
  }
  expect(bad).toEqual([]);
  const table = readFileSync(join(root, 'kit/data/DataTable.term.tsx'), 'utf8');
  expect(table).toMatch(/function runAction\(a: RowAction, \w+: CopyFn\)/);
  expect(table).toMatch(/useClipboard\(\)/);
  expect(table).not.toMatch(/runAction\([a-z]+\)/);
});
