// A span whose class makes it a block (`display: block`) starts its own line (schedules Editor choiceTitle/choiceBody).
import { afterEach, expect, test } from 'bun:test';
import { drawTest } from '../prim/testing';
import { FocusRoot } from '../prim';
import { resolverFor } from '../jsx/css-table';
import { setStyleTable } from '../jsx/style';
import type { Table } from '../../../scripts/term/css-translate/types';

const id = 'pages/x/x.module.css#title';
const table = { version: 1, generated: '', widthClass: {}, unitModel: {}, modules: {}, classes: {
  [id]: { id, style: { flexDirection: 'column' }, status: 'full', outcomes: [] },
} } as unknown as Table;
afterEach(() => setStyleTable(null));

test('block-class spans inside a button draw as two lines, not one run', async () => {
  setStyleTable(resolverFor(table));
  const t = await drawTest(<FocusRoot><button><span><span className={id}>Web request</span><span className={id}>Send a request</span></span></button></FocusRoot>, { width: 40, height: 4 });
  const f = t.captureCharFrame();
  expect(f).not.toContain('Web requestSend');
  expect(f).toContain('Web request');
  expect(f).toContain('Send a request');
  t.renderer.destroy();
});
