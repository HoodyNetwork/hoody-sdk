// Behaviour contract of PathField, run on the web and in the terminal (src/term/scenario).
// The typed text is always the value (onChange(path, 'typed')); the field never refuses it, a page's errorMessage
// shows. The entries of the folder being typed are offered (web: the combobox popover; terminal: rows under the
// field), ↓ then Enter picks one (onChange(path, 'picked'), a folder ending in "/"). The host is asked for one folder
// at a time through read.want. Enter and leaving the box tell onCommit. Browse (the web's folder dialog) is not exercised
// here: it is a Handoff in the terminal.
import { createElement as h, Fragment, useState } from 'react';
import { scenarios, type Html } from '../scenario-types';
import { PathField } from './PathField';
import type { PathEntry } from './pathPick';

const FIELD = { role: 'combobox' } as const;
const TREE: Record<string, PathEntry[]> = {
  '': [{ name: 'src', dir: true }, { name: 'README.md', dir: false }, { name: '.env', dir: false }],
  'src/': [{ name: 'kit', dir: true }, { name: 'main.ts', dir: false }],
};

/** A host that reads the folder asked for from TREE at once (want is stable, as the contract asks). */
function Host({ C, p }: { C: (p: never) => unknown; p: Record<string, unknown> }) {
  const [dir, setDir] = useState<string | null>(null);
  const [want] = useState(() => (d: string | null) => { if (d !== null) setDir(d); });
  const read = { entries: dir !== null ? (TREE[dir] ?? []) : [], dir, want };
  return h(C as never, { ...p, read } as never);
}
const hosted = (C: unknown, p: Record<string, unknown>, _s: unknown, html: Html) =>
  h(Fragment, null, h(Host, { C: C as never, p }), html('button', null, 'Next'));
const noRead = { entries: [], dir: null, want: () => {} };

export default scenarios('PathField', PathField, {
  ignored: {
    className: 'no CSS classes in a terminal',
    browseComputer: 'Browse is a Handoff in the terminal: the whole-computer dialog it widens is the web one',
    computerName: "only Browse's dialog title reads it, and Browse is a Handoff in the terminal",
  },
  unsupported: {},
  cases: [
    {
      name: 'typed text is the value, reported as typed',
      props: (s) => ({ label: 'Folder', rootLabel: '~', value: '', onChange: s.fn('onChange') }),
      control: { value: 'value', onChange: 'onChange' },
      mount: hosted,
      steps: [{ type: [{ role: 'combobox', name: 'Folder' }, 'zz'] }],
      expect: { calls: { onChange: [['z', 'typed'], ['zz', 'typed']] }, nodes: [{ target: { role: 'combobox', name: 'Folder' }, value: 'zz' }] },
    },
    {
      name: '↓ then Enter picks the offered folder',
      props: (s) => ({ label: 'Folder', rootLabel: '~', value: '', onChange: s.fn('onChange'), mode: 'folder' }),
      control: { value: 'value', onChange: 'onChange' },
      mount: hosted,
      steps: [{ type: [{ role: 'combobox', name: 'Folder' }, 'sr'] }, { key: 'down' }, { key: 'enter' }],
      expect: { calls: { onChange: [['s', 'typed'], ['sr', 'typed'], ['src/', 'picked']] }, nodes: [{ target: { role: 'combobox', name: 'Folder' }, value: 'src/' }] },
    },
    {
      name: 'mode folder offers folders only: a file is never picked',
      props: (s) => ({ label: 'Folder', rootLabel: '~', value: '', onChange: s.fn('onChange'), mode: 'folder' }),
      control: { value: 'value', onChange: 'onChange' },
      mount: hosted,
      steps: [{ type: [{ role: 'combobox', name: 'Folder' }, 'RE'] }, { key: 'down' }, { key: 'enter' }],
      expect: { calls: { onChange: [['R', 'typed'], ['RE', 'typed']] }, nodes: [{ target: { role: 'combobox', name: 'Folder' }, value: 'RE' }] },
    },
    {
      name: 'mode any offers files too',
      props: (s) => ({ label: 'Folder', rootLabel: '~', value: '', onChange: s.fn('onChange'), mode: 'any' }),
      control: { value: 'value', onChange: 'onChange' },
      mount: hosted,
      steps: [{ type: [{ role: 'combobox', name: 'Folder' }, 'RE'] }, { key: 'down' }, { key: 'enter' }],
      expect: { calls: { onChange: [['R', 'typed'], ['RE', 'typed'], ['README.md', 'picked']] }, nodes: [{ target: { role: 'combobox', name: 'Folder' }, value: 'README.md' }] },
    },
    {
      name: 'Enter and leaving the box each tell onCommit; typing does not',
      props: (s) => ({ label: 'Folder', rootLabel: '~', value: '', onChange: s.fn('onChange'), onCommit: s.fn('onCommit') }),
      control: { value: 'value', onChange: 'onChange' },
      mount: hosted,
      steps: [{ type: [{ role: 'combobox', name: 'Folder' }, 'zz'] }, { expect: { calls: { onCommit: 0 } } }, { key: 'enter' }, { key: 'tab' }],
      expect: { calls: { onCommit: 2 } },
    },
    {
      name: "a page's error shows; the text is kept",
      props: { label: 'Folder', rootLabel: '~', value: '../etc', onChange: () => {}, read: noRead, errorMessage: 'Pick a folder inside your home.' },
      steps: [],
      expect: { nodes: [{ target: FIELD, value: '../etc', states: { invalid: true }, description: 'Pick a folder inside your home.' }] },
    },
    {
      name: 'disabled: typing changes nothing',
      props: (s) => ({ label: 'Folder', rootLabel: '~', value: 'src', onChange: s.fn('onChange'), read: noRead, isDisabled: true }),
      steps: [{ type: [FIELD, 'x'], force: true }],
      expect: { calls: { onChange: 0 }, nodes: [{ target: FIELD, value: 'src', states: { disabled: true } }] },
    },
    {
      name: 'required reads as required',
      props: { label: 'Folder', rootLabel: '~', value: '', onChange: () => {}, read: noRead, isRequired: true },
      steps: [],
      expect: { nodes: [{ target: FIELD, states: { required: true } }] },
    },
  ],
});
