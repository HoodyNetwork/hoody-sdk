// Behaviour contract of the code editor (src/term/scenario). Both sides edit: a textbox named by the
// label that typing changes (onChange), Ctrl+S saving the code shown (onSave), problems with a line that move the keyboard
// to the code. Read-only: a textbox holding the code that no key changes, invalid and described while problems show.
// The web's find bar, colours and gutter have no terminal form (the terminal field shows the text as it is).
import { scenarios } from '../scenario-types';
import { CodeEditor } from './CodeEditor';

const ce = scenarios('CodeEditor', CodeEditor, {
  ignored: {
    className: 'look only: CSS classes mean nothing in a terminal',
    ref: 'handle: focus and jumpTo move the keyboard to the code in both, find counts matches (handoffs.term.test.tsx)',
  },
  unsupported: {},
  cases: [
    {
      name: 'read-only: a textbox holding the code; typing changes nothing',
      props: (s) => ({ value: 'a = 1\nb = 2', label: 'Config', readOnly: true, onChange: s.fn('onChange'), onSave: s.fn('onSave') }),
      steps: [{ type: [{ role: 'textbox', name: 'Config' }, 'zz'], force: true }],
      expect: { calls: { onChange: 0, onSave: 0 }, nodes: [{ target: { role: 'textbox', name: 'Config' }, value: 'a = 1\nb = 2', states: { readonly: true } }] },
    },
    {
      name: 'read-only with problems: invalid, described by them',
      props: { value: 'a = 1\nb = a', readOnly: true, onChange: () => undefined, problems: [{ line: 2, message: 'Unused name.' }] },
      steps: [],
      expect: { nodes: [{ target: { role: 'textbox', name: 'Code' }, states: { invalid: true }, description: 'Unused name.' }] },
    },
    {
      name: 'editable: a textbox named by the label; typing calls onChange, never onSave',
      props: (s) => ({ value: 'a = 1', label: 'Script', rows: 6, onChange: s.fn('onChange'), onSave: s.fn('onSave') }),
      steps: [{ type: [{ role: 'textbox', name: 'Script' }, '2'] }],
      expect: { calls: { onChange: 1, onSave: 0 }, nodes: [{ target: { role: 'textbox', name: 'Script' }, states: { readonly: false } }] },
    },
    {
      name: 'editable: Ctrl+S saves the code shown',
      props: (s) => ({ value: 'a = 1', label: 'Script', onChange: s.fn('onChange'), onSave: s.fn('onSave') }),
      steps: [{ focus: { role: 'textbox', name: 'Script' } }, { key: 'ctrl+s' }],
      expect: { calls: { onSave: [['a = 1']], onChange: 0 } },
    },
    {
      name: 'editable with problems: invalid, described by them; a problem with a line moves the keyboard to the code',
      props: (s) => ({ value: 'a = 1\nb = a', onChange: s.fn('onChange'), problems: [{ line: 2, message: 'Unused name.' }] }),
      steps: [{ press: { role: 'button', name: /Unused name/ } }],
      expect: {
        calls: { onChange: 0 },
        focused: { role: 'textbox', name: 'Code' },
        nodes: [{ target: { role: 'textbox', name: 'Code' }, states: { invalid: true }, description: 'Unused name.' }],
      },
    },
  ],
});

export default [ce];
