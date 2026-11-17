// Behaviour contract of SectionMenuItem (web and terminal).
import { createElement as h } from 'react';
import { loose } from './scenarioRoute';
import { scenarios } from '../scenario-types';
import { SectionMenuItem, SectionMenuList } from './SectionMenu';

const HTML = 'an HTML attribute or element event of the underlying <ul>/<button>/<a>: no meaning in a terminal';
const DESCRIBED = 'a description or id reference for assistive tech: the terminal semantics carry the name (aria-label or the text) only';
const LINK = 'an <a> attribute (download, ping, rel, target...): the terminal never opens the address itself (href is unsupported)';
const FORM = 'a <button> form attribute: a section item submits no form';

const item = scenarios('SectionMenuItem', loose(SectionMenuItem), {
  ignored: {
    about: HTML, accessKey: HTML, autoCorrect: HTML, autoSave: HTML, color: HTML, content: HTML, contentEditable: HTML, contextMenu: HTML,
    dangerouslySetInnerHTML: HTML, datatype: HTML, draggable: HTML, exportparts: HTML, hidden: HTML, id: HTML, inert: HTML, inlist: HTML, is: HTML,
    'item*': HTML, nonce: HTML, part: HTML, popover: HTML, 'popoverTarget*': HTML, prefix: HTML, property: HTML, radioGroup: HTML, ref: HTML,
    resource: HTML, results: HTML, rev: HTML, role: HTML, security: HTML, spellCheck: HTML, suppressContentEditableWarning: HTML, title: HTML,
    typeof: HTML, unselectable: HTML, vocab: HTML, name: FORM, 'form*': FORM,
    'aria-describedby': DESCRIBED, 'aria-description': DESCRIBED, 'aria-labelledby': DESCRIBED,
    download: LINK, hrefLang: LINK, media: LINK, ping: LINK, referrerPolicy: LINK, rel: LINK, target: LINK,
    'on*': HTML, autoFocus: 'the menu decides the focus (roving stop), never an item', defaultChecked: HTML, defaultValue: HTML, type: HTML, value: HTML },
  unsupported: { href: 'a link navigates: the route is the app\'s (useGoTerm / the browser), not the item\'s behaviour' },
  cases: [
    {
      name: 'a section button calls onClick once and says which one is current',
      props: (s) => ({ current: true, 'aria-current': 'true', onClick: s.fn('onClick'), children: 'Security' }),
      steps: [{ press: { role: 'button', name: 'Security' } }],
      expect: { calls: { onClick: 1 }, nodes: [{ target: { role: 'button', name: 'Security' }, states: { current: true } }] },
    },
    {
      name: 'aria-label names the item when its children are not the name',
      props: (s) => ({ 'aria-label': 'Security settings', onClick: s.fn('onClick'), children: 'Sec' }),
      steps: [{ press: { role: 'button', name: 'Security settings' } }],
      expect: { calls: { onClick: 1 } },
    },
    {
      name: 'a disabled section is inert',
      props: (s) => ({ disabled: true, onClick: s.fn('onClick'), children: 'Billing' }),
      steps: [{ press: { role: 'button', name: 'Billing' }, force: true }],
      expect: { calls: { onClick: 0 } },
    },
  ],
});

const list = scenarios('SectionMenuList', loose(SectionMenuList), {
  ignored: { '*': HTML },
  unsupported: {},
  cases: [
    {
      name: 'it draws its items',
      props: {},
      mount: (C, p, s) => h(C, p as never, h(SectionMenuItem, { onClick: s.fn('onClick') } as never, 'Profile')),
      covers: ['children'],
      steps: [{ press: { role: 'button', name: 'Profile' } }],
      expect: { calls: { onClick: 1 } },
    },
  ],
});

export default [item, list];
