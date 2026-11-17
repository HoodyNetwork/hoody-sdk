// Behaviour contract of ListDetailPage (web and terminal). The page owns the list and the detail; the
// layout owns the panes, Esc, the list toggle and the pane widths.
import { createElement as h, useState, type ReactElement } from 'react';
import { scenarios } from '../scenario-types';
import { atRoute, loose } from './scenarioRoute';
import { DetailHeader, ListDetailPage } from './ListDetailPage';

// Raw HTML through the platform's builder (`html`): the terminal draws it via the compat runtime.
type P = Record<string, unknown>;
const withParts = (p: P, html: (t: string, a: null, ...c: unknown[]) => unknown, open = true): P =>
  ({ ...p, list: html('p', null, 'the rows'), detail: open ? html('p', null, 'the detail') : null });

type Html = (t: string, a: Record<string, unknown> | null, ...c: unknown[]) => ReactElement;
/** A page that opens a row's detail from a row button and closes it through onClose (the layout's Back / Esc). */
const Opening = ({ C, html, p }: { C: (p: P) => ReactElement | null; html: Html; p: P }): ReactElement => {
  const [sel, setSel] = useState<string | null>(null);
  const row = (id: string) => html('button', { type: 'button', onClick: () => setSel(id) }, `row ${id}`);
  return h(C, { ...p, selected: sel ?? undefined, onClose: () => setSel(null),
    list: html('div', null, row('a'), row('b'), row('c')),
    detail: sel ? html('p', null, `detail of ${sel}`) : null } as never);
};

const page = scenarios('ListDetailPage', loose(ListDetailPage), {
  ignored: {},
  unsupported: {
    onFollow: 'side mode following a row: the page drives it from its own rows (no keyboard of the layout)',
    mode: 'side vs fill: layout only; both modes close on Esc (covered with the default)',
  },
  cases: [
    {
      name: 'one pane: "‹ <page>" goes back to the list; Esc does the same',
      props: (s) => ({ header: { title: 'Things' }, onClose: s.fn('onClose') }),
      mount: (C, p, _s, html) => atRoute(() => h(C, withParts(p as P, html as never) as never)),
      covers: ['list', 'detail'],
      steps: [{ press: { role: 'button', name: 'Things' } }, { expect: { calls: { onClose: 1 } } }, { focus: { role: 'button', name: 'Things' } }, { key: 'escape' }],
      expect: { calls: { onClose: 2 } },
      only: { platform: 'term', why: 'the one-pane back row is the terminal form of the phone layout; the web test viewport is wide' },
    },
    {
      name: 'open from a row, close with Esc: the focus is back on that row',
      props: { header: { title: 'Things' } },
      mount: (C, p, _s, html) => atRoute(() => h(Opening, { C: C as never, html: html as never, p: p as P })),
      covers: ['list', 'detail', 'selected', 'onClose'],
      steps: [
        { press: { role: 'button', name: 'row b' } },
        { expect: { nodes: [{ target: { text: 'detail of b' } }] } },
        { key: 'escape' },
      ],
      expect: { focused: { role: 'button', name: 'row b' }, nodes: [{ target: { text: 'detail of b' }, absent: true }] },
      only: { platform: 'term', why: 'Esc closing is the terminal layout key; the web closes by its Back/× control, covered by its own tests' },
    },
    {
      name: 'list and detail are named regions',
      props: (s) => ({ header: { title: 'Things' }, onClose: s.fn('onClose') }),
      mount: (C, p, _s, html) => atRoute(() => h(C, withParts(p as P, html as never) as never)),
      covers: ['list', 'detail'],
      steps: [],
      expect: { nodes: [{ target: { role: 'region', name: 'Details' } }, { target: { text: 'the detail' } }] },
    },
    {
      name: 'no detail: only the list, no detail region',
      props: { header: { title: 'Things' } },
      mount: (C, p, _s, html) => atRoute(() => h(C, withParts(p as P, html as never, false) as never)),
      covers: ['list', 'detail'],
      steps: [],
      expect: { nodes: [{ target: { role: 'region', name: 'Details' }, absent: true }, { target: { text: 'the rows' } }] },
    },
  ],
});

const head = scenarios('DetailHeader', loose(DetailHeader), {
  ignored: {
    accent: "the computer's colour is any hex; a terminal draws only theme tokens (approximation, listed in the report)",
    menuLabel: "the ⋯ menu's spoken name; the terminal ⋯ keeps the menu's default name",
    leading: 'look only: a mark beside the title (a colour mark, an avatar); the terminal header draws the title alone',
  },
  unsupported: {},
  cases: [
    {
      name: "the detail's title is its heading, one level under the page",
      props: { title: 'ping-api' },
      steps: [],
      expect: { nodes: [{ target: { role: 'heading', name: 'ping-api', level: 2 } }] },
    },
  ],
});

export default [page, head];
