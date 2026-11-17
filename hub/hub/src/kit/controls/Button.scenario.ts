// Behaviour contract of Button and IconButton, run on the web and in the terminal (src/term/scenario).
import { scenarios, type Html, type Spies } from '../scenario-types';
import { Button, ButtonFace, ButtonSpinner, IconButton, LinkButton, ReasonTip } from './Button';

const LOOK = 'look only: the terminal draws its own face';

const button = scenarios('Button', Button, {
  // Web-platform plumbing (className, DOM events, aria-*) is ignored by default: contract.ts DOM_PLUMBING.
  ignored: {
    ref: 'no DOM element; the focus handle is internal', icon: 'read: drawn as its glyph (icons.glyphs.ts); look only', iconEnd: 'read: drawn as its glyph; look only', literal: LOOK, chip: LOOK, chipIcon: LOOK,
    nameTooltip: 'no hover tooltips; the name is in the semantics tree', 'aria-keyshortcuts': 'no assistive-tech attribute in a terminal',
    'onHover*': 'no hover in a terminal', 'onPress[SEUC]*': 'press lifecycle (start/end/up/change) not modelled: onPress fires',
    'onFocus*': 'focus events not modelled', onBlur: 'focus events not modelled', onKeyUp: 'key releases are not reported by a terminal',
    excludeFromTabOrder: 'not modelled: no terminal caller takes a control out of the Tab order', preventFocusOnPress: 'not modelled: a terminal press always moves the focus', 'form[A-Z]*': 'no form overrides (action, method, target...)', name: 'no HTML form data', value: 'no HTML form data',
    hidden: 'a hidden control is not rendered by its page', inert: 'no inert subtrees in the terminal',
  },
  unsupported: {},
  cases: [
    {
      name: 'type="submit" inside a form: a press calls onPress, then submits the form once',
      props: (s) => ({ children: 'Save', type: 'submit', onPress: s.fn('onPress') }),
      mount: (C: unknown, p: Record<string, unknown>, s: Spies, html: Html) => {
        const sent = s.fn('onSubmit');
        return html('form', { onSubmit: (e: { preventDefault?: () => void }) => { e.preventDefault?.(); sent(); } }, html(C as never, p));
      },
      steps: [{ press: { role: 'button', name: 'Save' } }],
      expect: { calls: { onPress: 1, onSubmit: 1 } },
    },
    {
      name: 'form="id": a submit button outside the form submits that form',
      props: (s) => ({ children: 'Continue', type: 'submit', form: 'step-one' }),
      mount: (C: unknown, p: Record<string, unknown>, s: Spies, html: Html) => {
        const sent = s.fn('onSubmit');
        return html('div', null, html('form', { id: 'step-one', onSubmit: (e: { preventDefault?: () => void }) => { e.preventDefault?.(); sent(); } }, html('p', null, 'Step one')), html(C as never, p));
      },
      steps: [{ press: { role: 'button', name: 'Continue' } }],
      expect: { calls: { onSubmit: 1 } },
    },
    {
      name: 'a plain button inside a form never submits it',
      props: (s) => ({ children: 'Add row', onPress: s.fn('onPress') }),
      mount: (C: unknown, p: Record<string, unknown>, s: Spies, html: Html) => {
        const sent = s.fn('onSubmit');
        return html('form', { onSubmit: (e: { preventDefault?: () => void }) => { e.preventDefault?.(); sent(); } }, html(C as never, p));
      },
      steps: [{ press: { role: 'button', name: 'Add row' } }],
      expect: { calls: { onPress: 1, onSubmit: 0 } },
    },
    {
      name: 'an icon-only button is named by aria-label',
      props: (s) => ({ icon: 'plus', 'aria-label': 'Add a key', onPress: s.fn('onPress') }),
      steps: [{ press: { role: 'button', name: 'Add a key' } }],
      expect: { calls: { onPress: 1 } },
    },
    {
      name: 'a key other than Enter and Space on the focused button reaches onKeyDown (Escape closing a bar it sits in)',
      props: (s) => ({ children: 'Save', onKeyDown: s.fn('onKeyDown'), onPress: s.fn('onPress') }),
      steps: [{ focus: { role: 'button', name: 'Save' } }, { key: 'escape' }],
      expect: { calls: { onKeyDown: 1, onPress: 0 }, focused: { role: 'button', name: 'Save' } },
    },
    {
      name: 'id: another element names itself by the button (aria-labelledby its id)',
      props: () => ({ children: 'Save', id: 'save-step' }),
      mount: (C: unknown, p: Record<string, unknown>, _s: Spies, html: Html) => html('div', { role: 'group', 'aria-labelledby': 'save-step' }, html(C as never, p)),
      steps: [],
      expect: { nodes: [{ target: { role: 'group', name: 'Save' } }] },
    },
    {
      name: 'pressed reads as a toggle state',
      props: { children: 'Ask', pressed: true },
      steps: [],
      expect: { nodes: [{ target: { role: 'button', name: 'Ask' }, states: { pressed: true } }] },
    },
    {
      name: 'Enter on the focused button presses it once',
      props: (s) => ({ children: 'Save', onPress: s.fn('onPress') }),
      steps: [{ press: { role: 'button', name: 'Save' } }],
      expect: { calls: { onPress: 1 }, focused: { role: 'button', name: 'Save' } },
    },
    {
      name: 'Space presses it too',
      props: (s) => ({ children: 'Save', onPress: s.fn('onPress') }),
      steps: [{ focus: { role: 'button', name: 'Save' } }, { key: 'space' }],
      expect: { calls: { onPress: 1 } },
    },
    {
      name: 'a click presses it once and focuses nothing else',
      props: (s) => ({ children: 'Save', onPress: s.fn('onPress') }),
      steps: [{ click: { role: 'button', name: 'Save' } }],
      expect: { calls: { onPress: 1 } },
    },
    {
      name: 'disabled: neither click nor keys press it',
      props: (s) => ({ children: 'Save', isDisabled: true, onPress: s.fn('onPress') }),
      steps: [{ click: { role: 'button', name: 'Save' }, force: true }, { press: { role: 'button', name: 'Save' }, force: true }],
      expect: { calls: { onPress: 0 }, nodes: [{ target: { role: 'button', name: 'Save' }, states: { disabled: true } }] },
    },
    {
      name: 'disabled with a reason: says why, stays reachable, still refuses presses',
      props: (s) => ({ children: 'Delete', isDisabled: true, disabledReason: 'Stop the computer first.', onPress: s.fn('onPress') }),
      steps: [
        { focus: { role: 'button', name: 'Delete' } },
        { key: 'enter' },
        { click: { role: 'button', name: 'Delete' }, force: true },
      ],
      expect: {
        calls: { onPress: 0 },
        focused: { role: 'button', name: 'Delete' },
        nodes: [{ target: { role: 'button', name: 'Delete' }, states: { disabled: true }, description: 'Stop the computer first.' }],
      },
    },
    {
      name: 'a disabled reason is not shown while enabled',
      props: { children: 'Delete', disabledReason: 'Stop the computer first.' },
      steps: [],
      expect: { nodes: [{ target: { role: 'button', name: 'Delete' }, states: { disabled: false }, description: '' }], neverShown: ['Stop the computer first.'] },
    },
    {
      name: 'busy: keeps its label and refuses presses',
      props: (s) => ({ children: 'Saving', busy: true, onPress: s.fn('onPress') }),
      steps: [{ click: { role: 'button', name: 'Saving' }, force: true }, { press: { role: 'button', name: 'Saving' }, force: true }],
      expect: { calls: { onPress: 0 } },
    },
    {
      name: 'busy ends: presses work again',
      props: (s) => ({ children: 'Save', busy: true, onPress: s.fn('onPress') }),
      steps: [{ rerender: { busy: false } }, { press: { role: 'button', name: 'Save' } }],
      expect: { calls: { onPress: 1 } },
    },
    {
      name: 'a press inside a pressable row presses the button, not the row',
      props: (s) => ({ children: 'Edit', onPress: s.fn('onPress') }),
      mount: (C, p, s, h) => h('div', { role: 'button', 'aria-label': 'Row', tabIndex: 0, onClick: s.fn('rowPress') }, h(C, p)),
      steps: [{ click: { role: 'button', name: 'Edit' } }, { press: { role: 'button', name: 'Edit' } }],
      expect: { calls: { onPress: 2, rowPress: 0 } },
    },
    {
      name: 'autoFocus takes the focus on mount',
      props: { children: 'Continue', autoFocus: true },
      steps: [],
      expect: { focused: { role: 'button', name: 'Continue' } },
    },
    {
      name: 'Tab reaches it; Tab skips a disabled one without a reason',
      props: { children: 'B' },
      mount: (C, p, _s, h) => h('div', null, h(C, { ...p, children: 'A', autoFocus: true }), h(C, { ...p, children: 'Off', isDisabled: true }), h(C, p)),
      covers: ['isDisabled'],
      steps: [{ key: 'tab' }],
      expect: { focused: { role: 'button', name: 'B' } },
    },
  ],
});

const iconButton = scenarios('IconButton', IconButton, {
  ignored: {
    icon: 'read: icon "info" with no action draws "ⓘ" named by its label, its tip on focus (the web\'s ⓘ; Button.term.test.tsx); any other icon is look only', ref: 'no DOM element', more: LOOK, dropTarget: 'drop-target look (drag and drop is not in the terminal)', tooltipPlacement: 'no hover tooltips',
    tooltip: 'read: a tooltip keeps an info icon a button; no hover tooltips, the label is the name', shortcut: 'the terminal draws the label in place of the icon, so a key hint would cost the row its width', 'aria-keyshortcuts': 'no assistive-tech attribute',
    'onHover*': 'no hover in a terminal', 'onPress[SEUC]*': 'press lifecycle not modelled', 'onFocus*': 'focus events are not modelled in the terminal', onBlur: 'focus events are not modelled in the terminal', 'onKey*': 'keys go through the focus store',
    excludeFromTabOrder: 'not modelled: no terminal caller takes a control out of the Tab order', preventFocusOnPress: 'not modelled: a terminal press always moves the focus', 'form[A-Z]*': 'no form overrides', name: 'no HTML form data', value: 'no HTML form data',
    form: 'read: submits like Button (cases there)', id: 'the semantics id comes from sem', hidden: 'a hidden control is not rendered by its page', inert: 'no inert subtrees in the terminal',
  },
  cases: [
    {
      name: 'type="submit" inside a form: a press calls onPress, then submits the form once',
      props: (s) => ({ label: 'Send', icon: 'x', type: 'submit', onPress: s.fn('onPress') }),
      mount: (C: unknown, p: Record<string, unknown>, s: Spies, html: Html) => {
        const sent = s.fn('onSubmit');
        return html('form', { onSubmit: (e: { preventDefault?: () => void }) => { e.preventDefault?.(); sent(); } }, html(C as never, p));
      },
      steps: [{ press: { role: 'button', name: 'Send' } }],
      expect: { calls: { onPress: 1, onSubmit: 1 } },
    },
    {
      name: 'no type inside a form: a press never submits it',
      props: (s) => ({ label: 'Send', icon: 'x', onPress: s.fn('onPress') }),
      mount: (C: unknown, p: Record<string, unknown>, s: Spies, html: Html) => {
        const sent = s.fn('onSubmit');
        return html('form', { onSubmit: (e: { preventDefault?: () => void }) => { e.preventDefault?.(); sent(); } }, html(C as never, p));
      },
      steps: [{ press: { role: 'button', name: 'Send' } }],
      expect: { calls: { onPress: 1, onSubmit: 0 } },
    },
    {
      name: 'its label is its name; Enter presses it',
      props: (s) => ({ label: 'Close', icon: 'x', onPress: s.fn('onPress') }),
      steps: [{ press: { role: 'button', name: 'Close' } }],
      expect: { calls: { onPress: 1 } },
    },
    {
      name: 'disabled: inert',
      props: (s) => ({ label: 'Close', icon: 'x', isDisabled: true, onPress: s.fn('onPress') }),
      steps: [{ click: { role: 'button', name: 'Close' }, force: true }],
      expect: { calls: { onPress: 0 }, nodes: [{ target: { role: 'button', name: 'Close' }, states: { disabled: true } }] },
    },
    {
      name: 'disabled with a reason: says why, refuses presses',
      props: (s) => ({ label: 'Delete', icon: 'x', isDisabled: true, disabledReason: 'Stop the computer first.', onPress: s.fn('onPress') }),
      steps: [{ click: { role: 'button', name: 'Delete' }, force: true }, { press: { role: 'button', name: 'Delete' }, force: true }],
      expect: { calls: { onPress: 0 }, nodes: [{ target: { role: 'button', name: 'Delete' }, states: { disabled: true }, description: 'Stop the computer first.' }] },
    },
    {
      name: 'description is its accessible description',
      props: { label: 'Refresh', icon: 'x', description: 'Last refreshed a minute ago.' },
      steps: [],
      expect: { nodes: [{ target: { role: 'button', name: 'Refresh' }, description: 'Last refreshed a minute ago.' }] },
    },
    {
      name: 'busy: refuses presses',
      props: (s) => ({ label: 'Refresh', icon: 'x', busy: true, onPress: s.fn('onPress') }),
      steps: [{ click: { role: 'button', name: 'Refresh' }, force: true }, { press: { role: 'button', name: 'Refresh' }, force: true }],
      expect: { calls: { onPress: 0 } },
    },
    {
      name: 'pressed reads as a toggle state',
      props: { label: 'Bold', icon: 'x', pressed: true },
      steps: [],
      expect: { nodes: [{ target: { role: 'button', name: 'Bold' }, states: { pressed: true } }] },
    },
    {
      name: 'autoFocus takes the focus',
      props: { label: 'Close', icon: 'x', autoFocus: true },
      steps: [],
      expect: { focused: { role: 'button', name: 'Close' } },
    },
  ],
});

const linkButton = scenarios('LinkButton', LinkButton, {
  ignored: {
    ref: 'no DOM element', icon: LOOK, iconEnd: LOOK, literal: LOOK, chip: LOOK, chipIcon: LOOK, id: 'semantics id comes from sem',
    hidden: 'a hidden control is not rendered by its page', inert: 'no inert subtrees in the terminal', 'aria-*': 'semantics come from sem',
    'onHover*': 'no hover in a terminal', 'onPress[SEUC]*': 'press lifecycle not modelled: onPress fires', 'onFocus*': 'focus events not modelled',
    onBlur: 'focus events not modelled', 'onKey*': 'keys go through the focus store', download: 'no downloads from the terminal',
    hrefLang: 'anchor attribute: no browser', ping: 'anchor attribute: no browser', referrerPolicy: 'anchor attribute: no browser',
    rel: 'anchor attribute: no browser', target: 'new-tab targets: no browser', routerOptions: 'the terminal router takes the path only',
  },
  unsupported: {},
  cases: [
    {
      name: 'a link named by its label; Enter reports the press once',
      props: (s) => ({ href: '/billing', children: 'Add funds', onPress: s.fn('onPress') }),
      steps: [{ press: { role: 'link', name: 'Add funds' } }],
      expect: { calls: { onPress: 1 } },
    },
    {
      name: 'disabled with a reason: says why, stays reachable, refuses presses',
      props: (s) => ({ href: '/billing', children: 'Add funds', isDisabled: true, disabledReason: 'Verify your email first.', onPress: s.fn('onPress') }),
      steps: [{ focus: { role: 'link', name: 'Add funds' } }, { key: 'enter' }, { click: { role: 'link', name: 'Add funds' }, force: true }],
      expect: { calls: { onPress: 0 }, focused: { role: 'link', name: 'Add funds' }, nodes: [{ target: { role: 'link', name: 'Add funds' }, states: { disabled: true }, description: 'Verify your email first.' }] },
    },
    {
      name: 'a Hub path: the press goes there',
      props: { href: '/billing', children: 'Add funds' },
      steps: [{ press: { role: 'link', name: 'Add funds' } }],
      expect: { location: '/billing', opened: 0 },
    },
    {
      name: 'an http(s) address: the press opens it outside the Hub, whole, and the Hub stays where it is',
      props: { href: 'https://pay.example.com/checkout?id=7', children: 'Pay' },
      steps: [{ press: { role: 'link', name: 'Pay' } }],
      expect: { opened: ['https://pay.example.com/checkout?id=7'], location: '/page' },
    },
    {
      name: 'autoFocus takes the focus',
      props: { href: '/billing', children: 'Add funds', autoFocus: true },
      steps: [],
      expect: { focused: { role: 'link', name: 'Add funds' } },
    },
  ],
});

const reasonTip = scenarios('ReasonTip', ReasonTip, {
  ignored: {
    id: 'the hidden description element: the terminal reads the reason from the control\'s sem (disabledReason)',
    setOpen: 'the tip closes with its control in the terminal (SoftPress)', trigger: 'no anchor element: the terminal tip is placed by its control',
  },
  unsupported: {},
  cases: [
    {
      name: 'not shown: nothing of the reason is drawn',
      props: { reason: 'Stop the computer first.', shown: false, id: 'r1', open: false, setOpen: () => {}, trigger: { current: null } },
      steps: [],
      expect: { neverShown: ['Stop the computer first.'] },
    },
    {
      name: 'shown and open: the reason is drawn',
      props: { reason: 'Stop the computer first.', shown: true, id: 'r1', open: true, setOpen: () => {}, trigger: { current: null } },
      steps: [],
      expect: { nodes: [{ target: { text: 'Stop the computer first.' } }] },
      only: { platform: 'term', why: 'an open tip needs its control\'s trigger element on the web: covered through Button\'s disabled-with-reason cases' },
    },
    {
      name: 'shown but not open: nothing is drawn yet',
      props: { reason: 'Stop the computer first.', shown: true, id: 'r1', open: false, setOpen: () => {}, trigger: { current: null } },
      steps: [],
      expect: { neverShown: ['Stop the computer first.'] },
      only: { platform: 'term', why: 'the web tip keeps its description element mounted for aria-describedby while closed' },
    },
  ],
});

const spinner = scenarios('ButtonSpinner', ButtonSpinner, {
  ignored: { marked: 'look only: the terminal busy mark is one glyph either way' },
  cases: [{ name: 'a mark only: nothing to press', props: { marked: true }, steps: [], expect: { nodes: [{ target: { role: 'button' }, absent: true }] } }],
});

const face = scenarios('ButtonFace', ButtonFace, {
  ignored: { chipped: 'look only: the G6 chip is not drawn in the terminal' },
  cases: [{ name: 'the label is drawn', props: { chipped: false, children: 'Save' }, steps: [], expect: { nodes: [{ target: { text: 'Save' } }] } }],
});

export default [button, iconButton, linkButton, reasonTip, spinner, face];
