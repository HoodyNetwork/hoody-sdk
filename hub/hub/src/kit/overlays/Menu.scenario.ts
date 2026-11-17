// Behaviour contract of ActionMenu and MenuThumb (web and terminal).
import { scenarios } from '../scenario-types';
import { ActionMenu, MenuThumb } from './Menu';

const items = (s: { fn: (n: string) => () => void }) => [
  { id: 'run', label: 'Run now', shortcut: 'R', onAction: s.fn('run') },
  { id: 'edit', label: 'Edit', opens: true, onAction: s.fn('edit') },
  { id: 'pause', label: 'Pause', isDisabled: true, disabledReason: 'It is not running', onAction: s.fn('pause') },
  { id: 'delete', label: 'Delete', tone: 'danger' as const, opens: true, onAction: s.fn('delete') },
];

const menu = scenarios('ActionMenu', ActionMenu, {
  ignored: {
    anchor: 'a DOM element ref; the terminal places the menu against its trigger',
    icon: 'read: look only: the default trigger draws the icon as its mark (⋯ ⋮ + ▾) or, for any other icon, its label; the name is the label on both (Menu.trigger.term.test.tsx)',
    size: 'height of the default trigger in pixels (sm, md, toolbar); a terminal trigger is one row at every size',
    plain: 'drops the three-dot glyph look of the default trigger on the web; the terminal trigger opens and names the menu the same',
    phone: 'the phone tray: a narrow terminal keeps the anchored list',
    title: 'the phone tray title; no tray in a terminal',
  },
  unsupported: {
    trigger: 'a custom trigger gets the opener as its press on both; covered by the default trigger cases',
  },
  cases: [
    {
      name: 'the trigger opens a named menu; an item runs once and the menu closes',
      props: (s) => ({ items: items(s), label: 'Schedule actions' }),
      steps: [{ press: { role: 'button', name: 'Schedule actions' } }, { expect: { nodes: [{ target: { role: 'menu' } }] } }, { press: { role: 'menuitem', name: 'Edit…' } }],
      expect: { calls: { edit: 1, run: 0, delete: 0 }, nodes: [{ target: { role: 'menu' }, absent: true }] },
    },
    {
      name: 'a disabled item says why and does nothing',
      props: (s) => ({ items: items(s), label: 'Schedule actions' }),
      steps: [{ press: { role: 'button', name: 'Schedule actions' } }, { click: { role: 'menuitem', name: 'Pause' }, force: true }],
      expect: { calls: { pause: 0 }, nodes: [{ target: { role: 'menuitem', name: 'Pause' }, states: { disabled: true }, description: 'It is not running' }] },
    },
    {
      name: 'Escape closes without choosing',
      props: (s) => ({ items: items(s), label: 'Schedule actions' }),
      steps: [{ press: { role: 'button', name: 'Schedule actions' } }, { key: 'escape' }],
      expect: { calls: { run: 0, edit: 0, delete: 0 }, nodes: [{ target: { role: 'menu' }, absent: true }] },
    },
    {
      name: 'controlled: isOpen shows it; Escape asks to close',
      props: (s) => ({ items: items(s), label: 'Schedule actions', isOpen: true, onOpenChange: s.fn('onOpenChange'), placement: 'bottom start' }),
      steps: [{ key: 'escape' }],
      expect: { calls: { onOpenChange: [[false]] } },
    },
    {
      name: 'controlled without a parent update: Escape reports close once, the menu stays as the parent says',
      props: (s) => ({ items: items(s), label: 'Schedule actions', isOpen: true, onOpenChange: s.fn('onOpenChange') }),
      steps: [{ key: 'escape' }],
      expect: { calls: { onOpenChange: [[false]], run: 0 }, nodes: [{ target: { role: 'menu' } }] },
    },
    {
      name: 'controlled closed: the trigger asks to open and nothing opens until the parent says',
      props: (s) => ({ items: items(s), label: 'Schedule actions', isOpen: false, onOpenChange: s.fn('onOpenChange') }),
      steps: [{ press: { role: 'button', name: 'Schedule actions' } }],
      expect: { calls: { onOpenChange: [[true]] }, nodes: [{ target: { role: 'menu' }, absent: true }] },
    },
    {
      name: 'controlled by a parent that stores it: open, choose, closed, each change reported once',
      props: (s) => ({ items: items(s), label: 'Schedule actions', isOpen: false, onOpenChange: s.fn('onOpenChange') }),
      control: { value: 'isOpen', onChange: 'onOpenChange' },
      steps: [{ press: { role: 'button', name: 'Schedule actions' } }, { press: { role: 'menuitem', name: 'Run now' } }],
      expect: { calls: { run: 1, onOpenChange: [[true], [false]] }, nodes: [{ target: { role: 'menu' }, absent: true }] },
    },
    {
      name: 'uncontrolled: opening and Escape are each reported once',
      props: (s) => ({ items: items(s), label: 'Schedule actions', onOpenChange: s.fn('onOpenChange') }),
      steps: [{ press: { role: 'button', name: 'Schedule actions' } }, { key: 'escape' }],
      expect: { calls: { onOpenChange: [[true], [false]] }, nodes: [{ target: { role: 'menu' }, absent: true }] },
    },
    {
      name: 'a footer action runs like an item',
      props: (s) => ({ items: items(s), label: 'Schedule actions', footer: [{ id: 'all', label: 'See all runs', onAction: s.fn('all') }] }),
      steps: [{ press: { role: 'button', name: 'Schedule actions' } }, { press: { role: 'menuitem', name: 'See all runs' } }],
      expect: { calls: { all: 1 } },
    },
  ],
});

const thumb = scenarios('MenuThumb', MenuThumb, {
  ignored: { cells: 'a picture of a layout; the terminal row keeps its label and draws no thumbnail' },
  unsupported: {},
  cases: [
    {
      name: 'decorative: nothing a reader or a key can reach',
      props: () => ({ cells: [[0, 0, 1, 1], [1, 0, 1, 1]] }),
      steps: [],
      expect: { nodes: [{ target: { role: 'img' }, absent: true }, { target: { role: 'button' }, absent: true }] },
    },
  ],
});

export default [menu, thumb];
