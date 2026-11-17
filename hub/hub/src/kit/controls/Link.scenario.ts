// Behaviour contract of Link, TextButton and ExtLink, run on the web and in the terminal (src/term/scenario).
// Link is React Aria's Link (role link), TextButton React Aria's Button drawn as text, ExtLink an
// anchor named "<words> (opens in a new tab)".
import { scenarios, type Html, type Spies } from '../scenario-types';
import { ExtLink, Link, TextButton } from './Link';

const COMMON: Record<string, string> = {
  'aria-*': 'relations are carried by the semantics tree (name, description)', hidden: 'a hidden control is not rendered by its page',
  inert: 'no inert subtrees in the terminal', id: 'semantics id comes from sem',
  'onHover*': 'no hover in a terminal', 'onPress[SEUC]*': 'press lifecycle (start/end/up/change) not modelled: onPress fires',
  'onFocus*': 'focus events not modelled', onBlur: 'focus events not modelled', 'onKey*': 'keys go through the focus store',
};
// Props of the button-shaped TextButton only (the web Link has none of them).
const BUTTON_LOOKS: Record<string, string> = { icon: 'look only: icons are not drawn', literal: 'look only: the words are drawn as given either way', ref: 'no DOM element in the terminal' };
const ANCHOR: Record<string, string> = {
  download: 'no downloads from the terminal', hrefLang: 'anchor attribute: no browser', ping: 'anchor attribute: no browser',
  referrerPolicy: 'anchor attribute: no browser', rel: 'anchor attribute: no browser', target: 'new-tab targets: no browser',
  routerOptions: 'browser router options: the terminal router takes the path only', iconEnd: 'look only: icons are not drawn',
  variant: 'look only (inline / plain / nav): the terminal draws one link look',
  underlined: 'look only: a terminal link is always underlined, at rest too',
};

const SECRET_ID = '0123456789abcdef01234567';
const SECRET_HOST = `https://${SECRET_ID}.bots.example.com/v1`;

const link = scenarios('Link', Link, {
  ignored: { ...COMMON, ...ANCHOR },
  unsupported: {},
  cases: [
    {
      name: 'its words name a link; Enter follows it and reports the press once',
      props: (s) => ({ href: '/bots', children: 'Your bots', onPress: s.fn('onPress') }),
      steps: [{ press: { role: 'link', name: 'Your bots' } }],
      expect: { calls: { onPress: 1 } },
    },
    {
      name: 'a Hub path goes there and opens nothing outside',
      props: { href: '/bots', children: 'Your bots' },
      steps: [{ press: { role: 'link', name: 'Your bots' } }],
      expect: { location: '/bots', opened: 0 },
    },
    {
      name: 'an http(s) address opens outside the Hub, whole',
      props: { href: 'https://docs.example.com/guide', children: 'The guide' },
      steps: [{ press: { role: 'link', name: 'The guide' } }],
      expect: { opened: ['https://docs.example.com/guide'], location: '/page' },
    },
    {
      name: 'an address holding an id: the id is never shown, the press opens the whole address (terminal: a link)',
      only: { platform: 'term', why: 'the web draws a secret address as a button (opens by script, no href): the web case below' },
      props: { href: SECRET_HOST, children: 'Your bot' },
      steps: [{ press: { role: 'link', name: 'Your bot' } }],
      expect: { opened: [SECRET_HOST], neverShown: [SECRET_ID] },
    },
    {
      name: 'an address holding an id: the id is never shown, the press opens the whole address (web: a button)',
      only: { platform: 'web', why: 'the terminal draws it as a link: the case above' },
      props: { href: SECRET_HOST, children: 'Your bot' },
      steps: [{ click: { role: 'button', name: /^Your bot/ } }],
      expect: { opened: [SECRET_HOST], neverShown: [SECRET_ID] },
    },
    {
      name: 'disabled: inert',
      props: (s) => ({ href: '/bots', children: 'Your bots', isDisabled: true, onPress: s.fn('onPress') }),
      steps: [{ click: { role: 'link', name: 'Your bots' }, force: true }],
      expect: { calls: { onPress: 0 }, nodes: [{ target: { role: 'link', name: 'Your bots' }, states: { disabled: true } }] },
    },
    {
      name: 'autoFocus takes the focus',
      props: { href: '/bots', children: 'Your bots', autoFocus: true },
      steps: [],
      expect: { focused: { role: 'link', name: 'Your bots' } },
    },
  ],
});


const textButton = scenarios('TextButton', TextButton, {
  ignored: {
    ...COMMON, ...BUTTON_LOOKS, excludeFromTabOrder: 'not modelled: no terminal caller takes a control out of the Tab order', preventFocusOnPress: 'not modelled: a terminal press always moves the focus', 'form[A-Z]*': 'no form overrides', form: 'read: submits like Button (cases in Button.scenario.ts)', name: 'no HTML forms',
    value: 'no HTML forms', tone: 'read: look only (danger colour); the words carry the meaning',
  },
  unsupported: {},
  cases: [
    {
      name: 'type="submit" inside a form: a press calls onPress, then submits the form once',
      props: (s) => ({ children: 'Send', type: 'submit', onPress: s.fn('onPress') }),
      mount: (C: unknown, p: Record<string, unknown>, s: Spies, html: Html) => {
        const sent = s.fn('onSubmit');
        return html('form', { onSubmit: (e: { preventDefault?: () => void }) => { e.preventDefault?.(); sent(); } }, html(C as never, p));
      },
      steps: [{ press: { role: 'button', name: 'Send' } }],
      expect: { calls: { onPress: 1, onSubmit: 1 } },
    },
    {
      name: 'no type inside a form: a press never submits it',
      props: (s) => ({ children: 'Send', onPress: s.fn('onPress') }),
      mount: (C: unknown, p: Record<string, unknown>, s: Spies, html: Html) => {
        const sent = s.fn('onSubmit');
        return html('form', { onSubmit: (e: { preventDefault?: () => void }) => { e.preventDefault?.(); sent(); } }, html(C as never, p));
      },
      steps: [{ press: { role: 'button', name: 'Send' } }],
      expect: { calls: { onPress: 1, onSubmit: 0 } },
    },
    {
      name: 'Enter presses it once',
      props: (s) => ({ children: 'Forget', onPress: s.fn('onPress') }),
      steps: [{ press: { role: 'button', name: 'Forget' } }],
      expect: { calls: { onPress: 1 }, focused: { role: 'button', name: 'Forget' } },
    },
    {
      name: 'disabled with a reason: says why, stays reachable, refuses presses',
      props: (s) => ({ children: 'Forget', isDisabled: true, disabledReason: 'It is in use.', onPress: s.fn('onPress') }),
      steps: [{ focus: { role: 'button', name: 'Forget' } }, { key: 'enter' }, { click: { role: 'button', name: 'Forget' }, force: true }],
      expect: { calls: { onPress: 0 }, focused: { role: 'button', name: 'Forget' }, nodes: [{ target: { role: 'button', name: 'Forget' }, states: { disabled: true }, description: 'It is in use.' }] },
    },
    {
      name: 'tone="danger" changes the look only: Enter and a click press it once each',
      props: (s) => ({ children: 'Forget', tone: 'danger', onPress: s.fn('onPress') }),
      steps: [{ press: { role: 'button', name: 'Forget' } }, { click: { role: 'button', name: 'Forget' } }],
      expect: { calls: { onPress: 2 } },
    },
    {
      name: 'busy: refuses presses',
      props: (s) => ({ children: 'Forget', busy: true, onPress: s.fn('onPress') }),
      steps: [{ click: { role: 'button', name: 'Forget' }, force: true }, { press: { role: 'button', name: 'Forget' }, force: true }],
      expect: { calls: { onPress: 0 } },
    },
    {
      name: 'autoFocus takes the focus',
      props: { children: 'Forget', autoFocus: true },
      steps: [],
      expect: { focused: { role: 'button', name: 'Forget' } },
    },
  ],
});

const extLink = scenarios('ExtLink', ExtLink, {
  ignored: {
    look: 'look only (inline / nav): the terminal draws one link look',
    inText: 'coarse-pointer text line: no pointer in the terminal',
    revealed: 'set only by the web QR panel after its Show; the terminal QR panel keeps a secret address masked',
  },
  unsupported: {},
  cases: [
    {
      name: 'named by its words, the extra name, and that it opens a new tab',
      props: { url: 'https://example.com/docs', children: 'Program rules', name: 'the signup link' },
      steps: [],
      expect: { nodes: [{ target: { role: 'link', name: 'Program rules: the signup link (opens in a new tab)' } }] },
    },
    {
      name: 'a secret address never shows or speaks its id',
      props: { url: SECRET_HOST },
      steps: [],
      expect: { neverShown: [SECRET_ID] },
    },
    {
      name: 'a secret address is a button: pressing it opens the whole address, the id never shown',
      props: { url: SECRET_HOST },
      steps: [{ press: { role: 'button', name: /opens in a new tab/ } }],
      expect: { opened: [SECRET_HOST], neverShown: [SECRET_ID] },
    },
    {
      name: 'an address made secret by the caller opens whole from its words',
      props: { url: 'https://example.com/share/abc', secret: true, children: 'Shared page' },
      steps: [{ press: { role: 'button', name: /^Shared page/ } }],
      expect: { opened: ['https://example.com/share/abc'] },
    },
  ],
});

export default [link, textButton, extLink];
