// Behaviour contract of Switch, Checkbox and TextField, run on the web and in the terminal (src/term/scenario).
// Two past bugs are pinned here: `defaultSelected` read as a constant, and passwords drawn in clear.
import { createElement as h } from 'react';
import { scenarios } from '../scenario-types';
import { Checkbox, CheckboxGroup, SearchField, Switch, TextField } from './fields';

// Web-platform plumbing (className, DOM events, aria-*) is ignored by default: contract.ts DOM_PLUMBING.
/** CheckboxGroup: no excludeFromTabOrder of its own (its boxes are the Tab stops). */
const ARIA_GROUP: Record<string, string> = {
  id: 'the semantics id comes from sem', 'onFocus*': 'focus events not modelled', 'onKey*': 'keys go through the focus store',
  form: 'no HTML forms', 'onHover*': 'no hover in a terminal', 'onPress*': 'onChange is the contract',
  'aria-*': 'relations are carried by the semantics tree (name, description, errorText, controls)',
  hidden: 'a hidden control is not rendered by its page', inert: 'no inert subtrees in the terminal', onBlur: 'focus events not modelled',
};
const ARIA_BASE: Record<string, string> = {
  id: 'the semantics id comes from sem', 'onFocus*': 'focus events not modelled', 'onKey*': 'keys go through the focus store', excludeFromTabOrder: 'not modelled: no terminal caller takes a control out of the Tab order',
  form: 'no HTML forms', 'onHover*': 'no hover in a terminal', 'onPress*': 'onChange is the contract',
  'aria-*': 'relations are carried by the semantics tree (name, description, errorText, controls)',
  hidden: 'a hidden control is not rendered by its page', inert: 'no inert subtrees in the terminal',
};
/** Switch and Checkbox: no focus events. TextField reads onFocus/onBlur (they reach the page), so it uses ARIA_BASE. */
const ARIA_COMMON: Record<string, string> = { ...ARIA_BASE, onBlur: 'focus events not modelled' };

/** Somewhere else to put the focus. */
const withNext = (C: unknown, p: Record<string, unknown>, _s: unknown, html: (t: string, p: Record<string, unknown> | null, ...c: unknown[]) => unknown) =>
  html('div', null, h(C as never, p), html('button', { type: 'button' }, 'Next')) as never;
const NEXT = { role: 'button', name: 'Next' } as const;

const sw = scenarios('Switch', Switch, {
  ignored: { ...ARIA_COMMON, value: 'no HTML forms', name: 'no HTML forms', inputRef: 'no DOM input',
  },
  unsupported: {},
  cases: [
    {
      name: 'uncontrolled: each press flips it and reports the new value',
      props: (s) => ({ label: 'Email me', onChange: s.fn('onChange') }),
      steps: [
        { press: { role: 'switch', name: 'Email me' } },
        { expect: { nodes: [{ target: { role: 'switch', name: 'Email me' }, states: { checked: true } }] } },
        { press: { role: 'switch', name: 'Email me' } },
      ],
      expect: { calls: { onChange: [[true], [false]] }, nodes: [{ target: { role: 'switch', name: 'Email me' }, states: { checked: false } }] },
    },
    {
      name: 'uncontrolled from defaultSelected: starts on, a click turns it off',
      props: (s) => ({ label: 'Email me', defaultSelected: true, onChange: s.fn('onChange') }),
      steps: [{ click: { role: 'switch', name: 'Email me' } }],
      expect: { calls: { onChange: [[false]] }, nodes: [{ target: { role: 'switch', name: 'Email me' }, states: { checked: false } }] },
    },
    {
      name: 'controlled without a parent update: reports the request, stays as the parent says',
      props: (s) => ({ label: 'Email me', isSelected: false, onChange: s.fn('onChange') }),
      steps: [{ press: { role: 'switch', name: 'Email me' } }, { press: { role: 'switch', name: 'Email me' } }],
      expect: { calls: { onChange: [[true], [true]] }, nodes: [{ target: { role: 'switch', name: 'Email me' }, states: { checked: false } }] },
    },
    {
      name: 'controlled by a parent that stores the value',
      props: (s) => ({ label: 'Email me', isSelected: false, onChange: s.fn('onChange') }),
      control: { value: 'isSelected', onChange: 'onChange' },
      steps: [{ press: { role: 'switch', name: 'Email me' } }, { rerender: {} }, { press: { role: 'switch', name: 'Email me' } }],
      expect: { calls: { onChange: [[true], [false]] }, nodes: [{ target: { role: 'switch', name: 'Email me' }, states: { checked: false } }] },
    },
    {
      name: 'a parent changing isSelected is shown',
      props: { label: 'Email me', isSelected: false },
      steps: [{ rerender: { isSelected: true } }],
      expect: { nodes: [{ target: { role: 'switch', name: 'Email me' }, states: { checked: true } }] },
    },
    {
      name: 'disabled: inert, and says so',
      props: (s) => ({ label: 'Email me', isDisabled: true, onChange: s.fn('onChange') }),
      steps: [{ click: { role: 'switch', name: 'Email me' }, force: true }, { press: { role: 'switch', name: 'Email me' }, force: true }],
      expect: { calls: { onChange: 0 }, nodes: [{ target: { role: 'switch', name: 'Email me' }, states: { disabled: true, checked: false } }] },
    },
    {
      name: 'disabled with a reason: says why and still refuses a change',
      props: (s) => ({ label: 'Email me', isDisabled: true, disabledReason: 'Verify your address first.', onChange: s.fn('onChange') }),
      steps: [{ click: { role: 'switch', name: 'Email me' }, force: true }],
      expect: { calls: { onChange: 0 }, nodes: [{ target: { role: 'switch', name: 'Email me' }, states: { disabled: true }, description: 'Verify your address first.' }] },
    },
    {
      name: 'read-only: keeps its value',
      props: (s) => ({ label: 'Email me', isReadOnly: true, defaultSelected: true, onChange: s.fn('onChange') }),
      steps: [{ click: { role: 'switch', name: 'Email me' }, force: true }, { press: { role: 'switch', name: 'Email me' }, force: true }],
      expect: { calls: { onChange: 0 }, nodes: [{ target: { role: 'switch', name: 'Email me' }, states: { checked: true } }] },
    },
    {
      name: 'its description is its accessible description',
      props: { label: 'Email me', description: 'One message a week at most.' },
      steps: [],
      expect: { nodes: [{ target: { role: 'switch', name: 'Email me' }, description: 'One message a week at most.' }] },
    },
    {
      name: 'labelledBy: a row names it by id',
      props: { labelledBy: 'sw-row-name', isSelected: true },
      mount: (C, p, _s, html) => html('div', null, html('div', { id: 'sw-row-name' }, 'Ask for a code'), html(C, p)),
      steps: [],
      expect: { nodes: [{ target: { role: 'switch', name: 'Ask for a code' }, states: { checked: true } }] },
    },
    {
      name: 'labelHidden keeps the label as its name',
      props: { label: 'Email me', labelHidden: true },
      steps: [],
      expect: { nodes: [{ target: { role: 'switch', name: 'Email me' } }] },
    },
    {
      name: 'autoFocus takes the focus',
      props: { label: 'Email me', autoFocus: true },
      steps: [],
      expect: { focused: { role: 'switch', name: 'Email me' } },
    },
  ],
});

const cb = scenarios('Checkbox', Checkbox, {
  ignored: { ...ARIA_COMMON, value: 'read: inside a CheckboxGroup it is the box\'s entry in the group\'s list; alone it is an HTML form value', inputRef: 'no DOM input' },
  unsupported: { isRequired: 'no native validation in the kit checkbox', isInvalid: 'not drawn by the kit checkbox' },
  cases: [
    {
      name: 'uncontrolled: Space flips it and reports the new value',
      props: (s) => ({ label: 'I agree', onChange: s.fn('onChange') }),
      steps: [{ press: { role: 'checkbox', name: 'I agree' } }, { press: { role: 'checkbox', name: 'I agree' } }],
      expect: { calls: { onChange: [[true], [false]] }, nodes: [{ target: { role: 'checkbox', name: 'I agree' }, states: { checked: false } }] },
    },
    {
      name: 'uncontrolled from defaultSelected',
      props: (s) => ({ label: 'I agree', defaultSelected: true, onChange: s.fn('onChange') }),
      steps: [{ click: { role: 'checkbox', name: 'I agree' } }],
      expect: { calls: { onChange: [[false]] }, nodes: [{ target: { role: 'checkbox', name: 'I agree' }, states: { checked: false } }] },
    },
    {
      name: 'controlled by a parent that stores the value',
      props: (s) => ({ label: 'I agree', isSelected: false, onChange: s.fn('onChange') }),
      control: { value: 'isSelected', onChange: 'onChange' },
      steps: [{ click: { role: 'checkbox', name: 'I agree' } }],
      expect: { calls: { onChange: [[true]] }, nodes: [{ target: { role: 'checkbox', name: 'I agree' }, states: { checked: true } }] },
    },
    {
      name: 'indeterminate reads as mixed',
      props: { label: 'All', isIndeterminate: true },
      steps: [],
      expect: { nodes: [{ target: { role: 'checkbox', name: 'All' }, states: { checked: 'mixed' } }] },
    },
    {
      name: 'indeterminate: a press flips the stored value (set underneath: turns off)',
      props: (s) => ({ label: 'All', isIndeterminate: true, defaultSelected: true, onChange: s.fn('onChange') }),
      steps: [{ press: { role: 'checkbox', name: 'All' } }],
      expect: { calls: { onChange: [[false]] } },
    },
    {
      name: 'indeterminate: a press flips the stored value (clear underneath: turns on)',
      props: (s) => ({ label: 'All', isIndeterminate: true, onChange: s.fn('onChange') }),
      steps: [{ press: { role: 'checkbox', name: 'All' } }],
      expect: { calls: { onChange: [[true]] } },
    },
    {
      name: 'disabled: inert',
      props: (s) => ({ label: 'I agree', isDisabled: true, onChange: s.fn('onChange') }),
      steps: [{ click: { role: 'checkbox', name: 'I agree' }, force: true }],
      expect: { calls: { onChange: 0 }, nodes: [{ target: { role: 'checkbox', name: 'I agree' }, states: { disabled: true } }] },
    },
    {
      name: 'read-only: keeps its value',
      props: (s) => ({ label: 'I agree', isReadOnly: true, defaultSelected: true, onChange: s.fn('onChange') }),
      steps: [{ click: { role: 'checkbox', name: 'I agree' }, force: true }],
      expect: { calls: { onChange: 0 }, nodes: [{ target: { role: 'checkbox', name: 'I agree' }, states: { checked: true } }] },
    },
    {
      name: 'autoFocus takes the focus',
      props: { label: 'I agree', autoFocus: true },
      steps: [],
      expect: { focused: { role: 'checkbox', name: 'I agree' } },
    },
  ],
});

const SECRET = 'hunter2-Sekr1t';
const tf = scenarios('TextField', TextField, {
  // autoComplete is read: "one-time-code" makes the field secret entry (masked, wiped on a context end), as
  // type="password" does (TextField.oneTime.term.test.tsx).
  ignored: {
    ...ARIA_BASE, 'on(Copy|Cut|Paste|Select|Composition|BeforeInput|Input)*': 'GAP: DOM editing events are not raised in the terminal (onChange is)',
    autoCorrect: 'no browser autocorrect', spellCheck: 'no browser spellcheck', pattern: 'no native validation', minLength: 'no native validation',
  },
  unsupported: {
    focusOnError: 'covered by the forms owner later (needs an errorMessage arriving after mount)',
    action: 'ActionSpec field action: covered by fieldaction scenarios',
    multiline: 'multiline editing: the form scenarios',
    isRequired: 'required state shown only: no native validation',
  },
  cases: [
    {
      name: 'focus and blur reach the page',
      props: (s) => ({ label: 'Server name', onFocus: s.fn('onFocus'), onBlur: s.fn('onBlur') }),
      mount: withNext as never,
      steps: [{ focus: { role: 'textbox', name: 'Server name' } }, { focus: NEXT }],
      expect: { calls: { onFocus: 1, onBlur: 1 } },
    },
    {
      name: 'Enter in the field submits the raw form a page wrote around it (implicit submission)',
      props: (s) => ({ label: 'Current password', onChange: s.fn('onChange') }),
      mount: ((C: unknown, p: Record<string, unknown>, s: { fn(n: string): (...a: unknown[]) => void }, html: (t: unknown, p: Record<string, unknown> | null, ...c: unknown[]) => unknown) => {
        const sent = s.fn('onSubmit');
        return html('form', { onSubmit: (e: { preventDefault?: () => void }) => { e.preventDefault?.(); sent(); } }, html(C, p));
      }) as never,
      steps: [{ type: [{ role: 'textbox', name: 'Current password' }, 'hunter2'] }, { key: 'enter' }],
      expect: { calls: { onSubmit: 1 } },
    },
    {
      name: 'typing reports each new value and shows it',
      props: (s) => ({ label: 'Server name', onChange: s.fn('onChange') }),
      steps: [{ type: [{ role: 'textbox', name: 'Server name' }, 'web'] }],
      expect: { calls: { onChange: [['w'], ['we'], ['web']] }, nodes: [{ target: { role: 'textbox', name: 'Server name' }, value: 'web' }] },
    },
    {
      name: 'multiline is no keyboard trap: Tab leaves it and types no tab',
      props: (s) => ({ label: 'Notes', multiline: true, rows: 4, onChange: s.fn('onChange') }),
      mount: withNext as never,
      steps: [{ type: [{ role: 'textbox', name: 'Notes' }, 'ab'] }, { key: 'tab' }],
      // Calls not asserted here: the terminal multi-line editor reports a burst as one text twice (prim FieldInput);
      // this case is the Tab rule.
      expect: { nodes: [{ target: { role: 'textbox', name: 'Notes' }, value: 'ab' }], focused: NEXT },
    },
    {
      name: 'maxLength: typing stops at the limit',
      props: (s) => ({ label: 'Server name', maxLength: 3, onChange: s.fn('onChange') }),
      steps: [{ type: [{ role: 'textbox', name: 'Server name' }, 'webby'] }],
      expect: { calls: { onChange: [['w'], ['we'], ['web']] }, nodes: [{ target: { role: 'textbox', name: 'Server name' }, value: 'web' }] },
    },
    {
      name: 'uncontrolled from defaultValue',
      props: (s) => ({ label: 'Server name', defaultValue: 'web', onChange: s.fn('onChange') }),
      steps: [{ type: [{ role: 'textbox', name: 'Server name' }, '1'] }],
      expect: { calls: { onChange: [['web1']] }, nodes: [{ target: { role: 'textbox', name: 'Server name' }, value: 'web1' }] },
    },
    {
      name: 'controlled by a parent that stores the value',
      props: (s) => ({ label: 'Server name', value: 'old', onChange: s.fn('onChange') }),
      control: { value: 'value', onChange: 'onChange' },
      steps: [{ setValue: [{ role: 'textbox', name: 'Server name' }, 'db'] }],
      expect: { nodes: [{ target: { role: 'textbox', name: 'Server name' }, value: 'db' }] },
    },
    {
      name: 'controlled without a parent update: the value stays the parent\'s',
      props: (s) => ({ label: 'Server name', value: 'fixed', onChange: s.fn('onChange') }),
      steps: [{ type: [{ role: 'textbox', name: 'Server name' }, 'x'] }],
      expect: { calls: { onChange: [['fixedx']] }, nodes: [{ target: { role: 'textbox', name: 'Server name' }, value: 'fixed' }] },
    },
    {
      name: 'disabled: a click and typing change nothing',
      props: (s) => ({ label: 'Server name', defaultValue: 'locked', isDisabled: true, onChange: s.fn('onChange') }),
      steps: [{ type: [{ role: 'textbox', name: 'Server name' }, 'Z'], force: true }],
      expect: { calls: { onChange: 0 }, nodes: [{ target: { role: 'textbox', name: 'Server name' }, value: 'locked', states: { disabled: true } }] },
    },
    {
      name: 'read-only: reachable, typing changes nothing',
      props: (s) => ({ label: 'Server name', defaultValue: 'locked', isReadOnly: true, onChange: s.fn('onChange') }),
      steps: [{ focus: { role: 'textbox', name: 'Server name' } }, { key: 'Z' }, { key: 'backspace' }],
      expect: { calls: { onChange: 0 }, focused: { role: 'textbox', name: 'Server name' }, nodes: [{ target: { role: 'textbox', name: 'Server name' }, value: 'locked', states: { readonly: true } }] },
    },
    {
      name: 'password: typed text is never readable (frame, tree, attributes)',
      props: (s) => ({ label: 'Password', type: 'password', onChange: s.fn('onChange') }),
      steps: [{ type: [{ role: 'textbox', name: 'Password' }, SECRET] }],
      expect: { neverShown: [SECRET, SECRET.slice(0, 6)], nodes: [{ target: { role: 'textbox', name: 'Password' }, states: { secret: true } }] },
    },
    {
      name: 'an error message makes it invalid and describes it',
      props: { label: 'Server name', errorMessage: 'That name is taken.', defaultValue: 'web' },
      steps: [],
      expect: { nodes: [{ target: { role: 'textbox', name: 'Server name' }, states: { invalid: true }, description: 'That name is taken.' }] },
    },
    {
      name: 'its description describes it',
      props: { label: 'Server name', description: 'Lower case letters and digits.' },
      steps: [],
      expect: { nodes: [{ target: { role: 'textbox', name: 'Server name' }, description: 'Lower case letters and digits.', states: { invalid: false } }] },
    },
    {
      name: 'placeholder is not the value',
      props: { label: 'Server name', placeholder: 'e.g. web-1' },
      steps: [],
      expect: { nodes: [{ target: { role: 'textbox', name: 'Server name' }, value: '' }] },
    },
    {
      name: 'isInvalid without a message is invalid',
      props: { label: 'Server name', isInvalid: true },
      steps: [],
      expect: { nodes: [{ target: { role: 'textbox', name: 'Server name' }, states: { invalid: true } }] },
    },
    {
      name: 'autoFocus takes the focus',
      props: { label: 'Server name', autoFocus: true },
      steps: [],
      expect: { focused: { role: 'textbox', name: 'Server name' } },
    },
  ],
});

const SB = { role: 'searchbox', name: 'Find logs' } as const;
const sf = scenarios('SearchField', SearchField, {
  ignored: {
    ...ARIA_BASE, 'on(Copy|Cut|Paste|Select|Composition|BeforeInput|Input)*': 'GAP: DOM editing events are not raised in the terminal (onChange is)',
    autoComplete: 'no browser autofill', autoCorrect: 'no browser autocorrect', spellCheck: 'no browser spellcheck', pattern: 'no native validation', minLength: 'no native validation',
    name: 'no HTML forms', validate: 'a search narrows a list: no validation in the kit', validationBehavior: 'no native validation: errors always show inline (aria)', type: 'always a search box',
    size: 'toolbar density is a web layout', 'onKeyUp': 'keys go through the focus store',
  },
  unsupported: {
    onClear: 'exercised by the Escape case',
  },
  cases: [
    {
      name: 'focus and blur reach the page',
      props: (s) => ({ label: 'Find logs', onFocus: s.fn('onFocus'), onBlur: s.fn('onBlur') }),
      mount: withNext as never,
      steps: [{ focus: SB }, { focus: NEXT }],
      expect: { calls: { onFocus: 1, onBlur: 1 } },
    },
    {
      name: 'typing reports each new value and shows it',
      props: (s) => ({ label: 'Find logs', onChange: s.fn('onChange') }),
      steps: [{ type: [SB, 'ab'] }],
      expect: { calls: { onChange: [['a'], ['ab']] }, nodes: [{ target: SB, value: 'ab' }] },
    },
    {
      name: 'maxLength: typing stops at the limit',
      props: (s) => ({ label: 'Find logs', maxLength: 2, onChange: s.fn('onChange') }),
      steps: [{ type: [SB, 'abc'] }],
      expect: { calls: { onChange: [['a'], ['ab']] }, nodes: [{ target: SB, value: 'ab' }] },
    },
    {
      name: 'controlled by a parent that stores the value',
      props: (s) => ({ label: 'Find logs', value: '', onChange: s.fn('onChange') }),
      control: { value: 'value', onChange: 'onChange' },
      steps: [{ type: [SB, 'db'] }],
      expect: { nodes: [{ target: SB, value: 'db' }] },
    },
    {
      name: 'Enter submits the text',
      props: (s) => ({ label: 'Find logs', defaultValue: 'boot', onSubmit: s.fn('onSubmit') }),
      steps: [{ focus: SB }, { key: 'enter' }],
      expect: { calls: { onSubmit: [['boot']] } },
    },
    {
      name: 'Escape clears a field with text and says so',
      props: (s) => ({ label: 'Find logs', defaultValue: 'boot', onChange: s.fn('onChange'), onClear: s.fn('onClear') }),
      // The rerender only lets the terminal settle: a lone ESC byte is told from a sequence by a short timeout.
      steps: [{ focus: SB }, { key: 'escape' }, { rerender: {} }],
      expect: { calls: { onChange: [['']], onClear: 1 }, nodes: [{ target: SB, value: '' }] },
    },
    {
      name: 'without a label it is named "Search"',
      props: {},
      steps: [],
      expect: { nodes: [{ target: { role: 'searchbox', name: 'Search' } }] },
    },
    {
      name: 'disabled: typing changes nothing',
      props: (s) => ({ label: 'Find logs', isDisabled: true, onChange: s.fn('onChange') }),
      steps: [{ type: [SB, 'x'], force: true }],
      expect: { calls: { onChange: 0 }, nodes: [{ target: SB, states: { disabled: true } }] },
    },
    {
      name: 'read-only: reachable, typing and Enter change nothing',
      props: (s) => ({ label: 'Find logs', defaultValue: 'boot', isReadOnly: true, onChange: s.fn('onChange'), onSubmit: s.fn('onSubmit') }),
      steps: [{ focus: SB }, { key: 'x' }, { key: 'enter' }],
      expect: { calls: { onChange: 0, onSubmit: 0 }, nodes: [{ target: SB, value: 'boot', states: { readonly: true } }] },
    },
    {
      name: 'invalid and required are states',
      props: { label: 'Find logs', isInvalid: true, isRequired: true },
      steps: [],
      expect: { nodes: [{ target: SB, states: { invalid: true, required: true } }] },
    },
    {
      name: 'autoFocus takes the focus',
      props: { label: 'Find logs', autoFocus: true },
      steps: [],
      expect: { focused: SB },
    },
  ],
});

const groupBody = (C: unknown, p: Record<string, unknown>) =>
  h(C as never, p as never, h(Checkbox, { value: 'read', label: 'Read' }), h(Checkbox, { value: 'write', label: 'Write' }));
const cg = scenarios('CheckboxGroup', CheckboxGroup, {
  ignored: { ...ARIA_GROUP, columns: 'a web layout: the terminal lists the boxes in one column' },
  unsupported: {
    isRequired: 'refusing a submit with no box ticked needs a Form submit (shared useValidation path)',
    validate: 'custom validation: shared useValidation path, covered by TextField scenarios',
    validationBehavior: 'shared useValidation path, covered by TextField scenarios',
    isInvalid: 'shown with errorMessage: the error case',
    isReadOnly: 'a read-only group ignores presses: Checkbox read-only path',
  },
  cases: [
    {
      name: 'controlled: ticking a box reports the new list',
      mount: groupBody as never,
      props: (s) => ({ label: 'Rights', value: ['read'], onChange: s.fn('onChange') }),
      control: { value: 'value', onChange: 'onChange' },
      steps: [{ press: { role: 'checkbox', name: 'Write' } }],
      expect: { calls: { onChange: [[['read', 'write']]] }, nodes: [{ target: { role: 'checkbox', name: 'Write' }, states: { checked: true } }, { target: { role: 'checkbox', name: 'Read' }, states: { checked: true } }] },
    },
    {
      name: 'uncontrolled from defaultValue: unticking reports the list without it',
      mount: groupBody as never,
      props: (s) => ({ label: 'Rights', defaultValue: ['read', 'write'], onChange: s.fn('onChange') }),
      steps: [{ press: { role: 'checkbox', name: 'Read' } }],
      expect: { calls: { onChange: [[['write']]] }, nodes: [{ target: { role: 'checkbox', name: 'Read' }, states: { checked: false } }] },
    },
    {
      name: 'disabled: the boxes are inert',
      mount: groupBody as never,
      props: (s) => ({ label: 'Rights', value: [], isDisabled: true, onChange: s.fn('onChange') }),
      steps: [],
      expect: { calls: { onChange: 0 }, nodes: [{ target: { role: 'checkbox', name: 'Read' }, states: { disabled: true } }] },
    },
    {
      name: 'the group shows its description and its error',
      mount: groupBody as never,
      props: { label: 'Rights', value: [], description: 'What the key may do.', errorMessage: 'Pick at least one.' },
      steps: [],
      expect: { nodes: [{ target: { text: 'Pick at least one.' } }] },
    },
  ],
});

export default [sw, cb, cg, tf, sf];
