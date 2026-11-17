// An open note in the terminal: the web frame's place is a hand-off (parts/NoteFrame.term.tsx), never a frame that
// waits for a load event the terminal cannot give ("Loading…" for ever). The hand-off names the Notes page (its address
// is the web Hub's Notes page, not the note), and the note's own address stays one control: the header's "Open outside
// the Hub", which opens it whole.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { act, queryAllByRole, semanticsOf, type Role } from '../../term/prim/semantics';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

const NOTE = '/notes?sel=c0a7150000000000000000a1~a1b2c3d4e5f6a7b8c9d0e1f1';
const NOTE_URL = 'https://6a0000000000000000000001-c0a7150000000000000000a1-notes-1.n12.fixture.invalid/notebook/a1b2c3d4e5f6a7b8c9d0e1f2/a1b2c3d4e5f6a7b8c9d0e1f1';

function all(role: Role, name: string | RegExp) {
  const r = s!.renderer as unknown as { root: never; stdin: never };
  return queryAllByRole(semanticsOf({ root: r.root, stdin: r.stdin }), role, { name });
}

for (const [cols, rows] of [[120, 40], [80, 24]] as const) {
  test(`an open note is a hand-off, not a frame that never loads (${cols}x${rows})`, async () => {
    const opened: string[] = [];
    s = await renderPage({ page: 'notes', path: NOTE, cols, rows, openExternal: (u) => { opened.push(u); } });
    const frame = await s.settle();
    expect(frame).toContain('Weekly plan');
    expect(frame).not.toContain('Loading');
    expect(frame).not.toContain('▁▁▁');
    expect(frame).toContain('A note is a page of the Notes program');
    expect(frame).toContain('Open the Notes page on the web:');
    expect(all('group', 'Continue on the web').length).toBe(1);
    // One "Open outside the Hub" on screen: the header's button (the body adds no second one). It opens the note's own
    // address, whole.
    expect(all('link', 'Open outside the Hub').length).toBe(0);
    const buttons = all('button', 'Open outside the Hub');
    expect(buttons.length).toBe(1);
    act(buttons[0]!, 'press');
    await s.settle();
    expect(opened).toEqual([NOTE_URL]);
  }, 180_000);
}

// The Notes page lists across computers, so the shell's computer may be another one. The hand-off names
// the NOTE's computer: a link naming the shell's would land on a list without this note.
test('the hand-off names the note\'s computer, not the shell\'s', async () => {
  const opened: string[] = [];
  s = await renderPage({ page: 'notes', path: '/notes?sel=c0a7150000000000000000b2~a1b2c3d4e5f6a7b8c9d0e1f7', cols: 120, rows: 40, openExternal: (u) => { opened.push(u); } });
  const frame = await s.settle();
  expect(frame).toContain('Staging release notes');
  act(all('button', 'Open')[0]!, 'press');
  await s.settle();
  // borealis (Acme client) is not in the shell's list of this realm (Personal), so no computer travels (placeQuery);
  // before, the link named the shell's atlas. The kit case (Handoff.term.test.tsx) shows a listed one travelling.
  expect(opened).toEqual(['https://hub.example.test/auth/home?realm=f1f1f1f1f1f1f1f1f1f1f1f1#/notes']);
  expect(opened[0]).not.toContain('c0a7150000000000000000a1');
}, 180_000);
