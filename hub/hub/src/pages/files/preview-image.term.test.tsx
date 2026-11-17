// Files in a terminal, a picture's preview: a terminal draws no picture (an <img> draws nothing), so the preview of a
// picture says so in words (PreviewImage.term.tsx) and keeps its other ways: Download in the foot and the computer's
// viewer in the rows below. Without the words the preview's body is blank.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { act, queryAllByRole, semanticsOf, type Role } from '../../term/prim/semantics';
import strings from './strings.en.json';
import words from './PreviewImage.term.strings.en.json';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

const tree = () => { const r = s!.renderer as unknown as { root: never; stdin: never }; return semanticsOf({ root: r.root, stdin: r.stdin }); };

/** Presses the `i`-th node of that role and name, then settles. */
async function press(role: Role, name: string | RegExp, i = 0): Promise<void> {
  const found = queryAllByRole(tree(), role, { name });
  expect(found.length).toBeGreaterThan(i);
  act(found[i]!, 'press');
  await s!.settle();
}

test('preview of a picture says pictures cannot be shown here, and keeps Download and the viewer', async () => {
  // thumbsOn: the thumbnail read answers a picture, so the preview reaches its image state.
  s = await renderPage({ page: 'files', fx: 'thumbsOn', path: '/files?a=atlas.00a1&ap=%2Fsrv%2Fmedia', cols: 140, rows: 60 });
  await s.settle();
  // photo-001.jpg is the folder's first row.
  await press('button', /Row actions/, 0);
  await press('menuitem' as Role, /^Preview/);
  let frame = await s.settle();
  for (let i = 0; i < 30 && !frame.includes(words['preview.term.noPicture']); i++) { await new Promise((r) => setTimeout(r, 100)); frame = await s.settle(); }
  expect(s.failures).toEqual([]);
  expect(frame).toContain('photo-001.jpg');
  expect(frame).toContain(words['preview.term.noPicture']);
  expect(frame).toContain(words['preview.term.noPictureBody']);
  // The image state, not one of the states that already say something.
  for (const k of ['preview.off', 'preview.notImage', 'preview.failed'] as const) expect(frame).not.toContain(strings[k]);
  // The preview's other ways are still there.
  expect(frame).toContain(strings['preview.ways']);
  expect(queryAllByRole(tree(), 'button', { name: strings['action.download'] }).length).toBeGreaterThan(0);
  expect(queryAllByRole(tree(), 'button', { name: strings['action.view'] }).length).toBeGreaterThan(0);
}, 240_000);
