// Behaviour contract of the address pieces (web and terminal). An address a browser may open is a link (or, when its
// shape is secret, a button that shows only its scheme): its full text never reaches the screen or the semantics tree.
// Copy takes the whole address. What each side cannot share is listed below with its reason.
import { createElement as h } from 'react';
import { scenarios } from '../scenario-types';
import { Button } from '../controls/Button';
import { AddressField, AddressList, AddressRow, AddressText } from './Address';

const plain = 'https://shop.example.com/admin';
// A program address: its host holds a 24-hex id, so it is secret by shape.
const secret = 'https://0123456789abcdef01234567-8080.example.com/';

export default [
  scenarios('AddressText', AddressText, {
    ignored: { className: 'no CSS classes in a terminal' },
    unsupported: {},
    cases: [
      {
        name: 'an address it may open is a link named by what it is',
        props: { url: plain, open: true, name: 'shop admin' },
        steps: [],
        expect: { nodes: [{ target: { role: 'link', name: /shop admin/ } }] },
      },
      {
        name: 'a secret-shaped address shows nothing of its id, on screen or to a reader',
        props: { url: secret, open: true, name: 'port 8080' },
        steps: [],
        expect: { nodes: [{ target: { role: 'button', name: /port 8080/ } }], neverShown: ['0123456789abcdef01234567'] },
      },
      {
        name: 'a secret-shaped address opens whole, while nothing of its id shows',
        props: { url: secret, open: true, name: 'port 8080' },
        steps: [{ press: { role: 'button', name: /port 8080/ } }],
        expect: { opened: [secret], neverShown: ['0123456789abcdef01234567'] },
      },
      {
        name: 'a link to an address it may open opens it whole',
        only: { platform: 'web', why: 'the terminal draws it as a terminal hyperlink (OSC 8): the terminal itself opens it on a click, not the Hub' },
        props: { url: plain, open: true, name: 'shop admin' },
        steps: [{ press: { role: 'link', name: /shop admin/ } }],
        expect: { opened: [plain] },
      },
      {
        name: 'without open it is text, not a link',
        props: { url: plain },
        steps: [],
        expect: { nodes: [{ target: { role: 'link' }, absent: true }] },
      },
    ],
  }),
  scenarios('AddressField', AddressField, {
    ignored: {
      className: 'no CSS classes in a terminal',
      idle: 'only the wording of the web Open button; the terminal opens through the address hyperlink itself',
      resetKey: 'closes an open QR code; the terminal has no QR code',
      reach: 'the QR code\'s access note; the terminal has no QR code',
    },
    unsupported: {},
    cases: [
      {
        name: 'the address opens as a link and Copy is named by what it copies; the id never shows',
        props: { url: secret, label: 'port 8080' },
        steps: [],
        expect: { nodes: [{ target: { role: 'button', name: 'Copy port 8080' } }], neverShown: ['0123456789abcdef01234567'] },
      },
      {
        name: 'Open opens the whole address; the id never shows',
        only: { platform: 'web', why: 'the terminal has no Open button: the address itself opens (AddressText cases)' },
        props: { url: secret, label: 'port 8080' },
        steps: [{ press: { role: 'button', name: /^Open port 8080/ } }],
        expect: { opened: [secret], neverShown: ['0123456789abcdef01234567'] },
      },
    ],
  }),
  scenarios('AddressList', AddressList, {
    ignored: { className: 'no CSS classes in a terminal' },
    unsupported: {},
    cases: [
      {
        name: 'a named list of address rows (presentational: no behaviour of its own)',
        props: { label: 'Addresses', children: h(AddressRow, { name: 'Shop', url: plain, open: true }) },
        steps: [],
        expect: { nodes: [{ target: { role: 'list', name: 'Addresses' } }, { target: { role: 'link', name: /shop\.example\.com/ } }] },
      },
    ],
  }),
  scenarios('AddressRow', AddressRow, {
    ignored: {},
    unsupported: {},
    cases: [
      {
        name: 'name, the address as a link, and the row\'s own actions',
        props: (s) => ({ name: 'Storefront', url: plain, open: true, label: 'the shop', actions: h(Button, { onPress: s.fn('edit') }, 'Edit') }),
        steps: [{ click: { role: 'button', name: 'Edit' } }],
        expect: { calls: { edit: 1 }, nodes: [{ target: { text: 'Storefront' } }, { target: { role: 'link', name: /the shop/ } }] },
      },
    ],
  }),
];
