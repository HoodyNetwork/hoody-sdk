// QR codes: what a person can do with them and what must never show. A secret address stays out of everything a person
// or an agent can read until Show; Show reveals the address; Close reports. The drawing itself (half blocks in the
// terminal, SVG on the web) is pinned in Qr.term.test.tsx and qr.*.test.ts, not here.
import { createElement as h } from 'react';
import { scenarios } from '../scenario-types';
import { loose } from '../layouts/scenarioRoute';
import { QrButton, QrCode, QrImage, QrPanel, QrSecret } from './Qr';
import { qrMatrix } from './qr';

const URL_ = 'https://example.com/terminal/0123456789abcdef';
const ONE_SIZE = 'a terminal has one size for the code (the pane decides; a code that does not fit is not drawn), no popover/large/sheet';
/** A real QR code as a PNG (a demo authenticator address), as the 2FA setup answer sends it: the terminal reads its
 *  modules back (qrImage.ts). */
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAB8AAAAfCAYAAAAfrhY5AAAAAklEQVR4AewaftIAAAI9SURBVMXBUYrbUBAAwW6j+1+5owEPPIS92Xylym78Jxc3lW8qPlFZFUtlVKh8U3HxVvGkclKpUDmpVIwKlVXxpDIuDiqrYqkslVWhUjFUKp5UVsV68Q8qVoXKUlkVv/HilypUThVDZVSoqPzGxaHiG5VRcao4VTxVfHLxpvKTCpWhUqFSoVKhUqFSMVS+ubhV/EbFTypUKkbFT+ymUqHyVDFURsWTyqpQqVB5qlgXbyoVKqtiVSyVU8VQUfmkYqiMihcHlYqKobJUVFQqTiqrYlWMCpVRUTFe3CpGxVAZFSoqFU8Vo2KpVKh8orLsxhcqo0KlQqViqIyKv1FZFePFm4rKUqlYFSoVKqNiqAwVFZWhoqIyKipUht1UKobKqFCpGCoVKhVPKqNCZVQMlVFxenFQWSoVQ2WoDJWhMlQqKp5UTirrxa1iVIyKoaKyKipWxahQWRWniqFSsS5uKp9UqFQMlYqhsioqVE4qQ2VUDJWKF28VFUNlqFSoqFSofKIyKkbFqqhYFePFDypUThWr4kml4kllqYyLLypUKpZKRcVQeapQOalUqFQsu/EXKqeKpVIxVFbFUqlQWRUXN5VvKipOKhVLpeJJpWJVnF68VVRUVFQslVPFUBkVKhWniieVdXFQWRVPKquiQkWlQqVCReWkslQqLn5JZVQslYpVoTIqnlQq1otfqvhERUXlSWWoLJX14lBRUXGqGBUqq+IblaFSMSpOF28q36hUqFQMlU8qhkqFylKpWHbjP/kDyYsNSvY6eGcAAAAASUVORK5CYII=';
const KEY_NOTE = 'Contains a key. Only share it with people you trust.';
const MARK = 'the centre mark is left light in cells (error correction covers it): there is nothing to tell the H from the B by';

const button = scenarios('QrButton', loose(QrButton), {
  ignored: {
    shortcut: 'the tooltip hint for a key the PAGE binds (openRef); a terminal button has no tooltip to show it in',
    size: 'the web button box (28 or 32 px); a terminal button is one row',
    logo: 'read only to hand on to QrPanel, which leaves the centre mark light in cells (nothing tells the H from the B)',
  },
  unsupported: {},
  cases: [
    {
      name: 'a secret address opens hidden: neither the address nor the code is readable before Show',
      props: () => ({ url: URL_, name: 'Terminal', reach: 'terminal' }),
      covers: ['url', 'secret', 'reach'],
      steps: [{ press: { role: 'button', name: 'QR code' } }],
      expect: { nodes: [{ target: { text: 'Hidden until you press Show' } }, { target: { role: 'button', name: 'Only share it with people you trust.' } }], neverShown: [URL_] },
    },
    {
      name: 'the surface is titled with what the address opens',
      props: () => ({ url: URL_, name: 'Terminal' }),
      covers: ['name'],
      steps: [{ press: { role: 'button', name: 'QR code' } }],
      expect: { nodes: [{ target: { text: 'QR code: Terminal' } }] },
    },
    {
      name: 'an address that grants nothing (keyed false) has no key caption, secret or not',
      props: () => ({ url: URL_, name: 'Terminal', keyed: false }),
      steps: [{ press: { role: 'button', name: 'QR code' } }, { press: { role: 'button', name: 'Show' } }],
      expect: { nodes: [{ target: { role: 'button', name: 'Hide' } }], neverShown: ['Contains a key'] },
    },
    {
      name: 'a new resetKey (a realm switch) closes the open surface',
      props: () => ({ url: URL_, name: 'Terminal', resetKey: 'realm-a' }),
      covers: ['resetKey'],
      steps: [{ press: { role: 'button', name: 'QR code' } }, { expect: { nodes: [{ target: { text: 'QR code: Terminal' } }] } }, { rerender: { url: URL_, name: 'Terminal', resetKey: 'realm-b' } }],
      expect: { nodes: [{ target: { text: 'QR code: Terminal' }, absent: true }] },
    },
    {
      name: 'Show reveals the address; a secret address is keyed by default, so its code wears the key caption',
      props: () => ({ url: URL_, name: 'Terminal' }),
      covers: ['url', 'keyed'],
      steps: [{ press: { role: 'button', name: 'QR code' } }, { press: { role: 'button', name: 'Show' } }],
      only: { platform: 'web', why: 'on the web the shown address is page text; the terminal tree keeps a secret address out, see the term case below' },
      expect: { nodes: [{ target: { text: URL_ } }, { target: { text: 'Contains a key' } }] },
    },
    {
      name: 'Show reveals the address on screen only: the tree holds a secret group, never the address; the key caption shows',
      props: () => ({ url: URL_, name: 'Terminal' }),
      covers: ['url', 'keyed'],
      steps: [{ press: { role: 'button', name: 'QR code' } }, { press: { role: 'button', name: 'Show' } }],
      only: { platform: 'term', why: 'the terminal semantics tree is agent-readable: a shown secret is a secret group there (the web case above reads the page text)' },
      expect: { nodes: [{ target: { role: 'group', name: 'QR code: Terminal' }, states: { secret: true } }, { target: { text: 'Contains a key' } }], treeNever: [URL_, '0123456789abcdef'] },
    },
    {
      name: 'an address that is not https gets no code: the button says so and opens nothing',
      props: () => ({ url: 'http://plain.example.com/', name: 'Plain' }),
      covers: ['openRef'],
      steps: [{ press: { role: 'button', name: 'No QR code for this address' }, force: true }],
      expect: { nodes: [{ target: { text: 'QR code: Plain' }, absent: true }] },
    },
  ],
});

const panel = scenarios('QrPanel', loose(QrPanel), {
  ignored: { variant: ONE_SIZE, onToggleLarge: ONE_SIZE, logo: MARK },
  unsupported: {},
  cases: [
    {
      name: 'Show asks to reveal; Close reports; the hidden address is never readable',
      props: (s) => ({ url: URL_, name: 'Terminal', revealed: false, onRevealedChange: s.fn('onRevealedChange'), onClose: s.fn('onClose') }),
      covers: ['secret', 'revealed'],
      steps: [{ press: { role: 'button', name: 'Show' } }, { press: { role: 'button', name: 'Close' } }],
      expect: { calls: { onRevealedChange: [[true]], onClose: 1 }, neverShown: [URL_] },
    },
    {
      name: 'Open opens the whole address while it is still hidden',
      only: { platform: 'web', why: 'the terminal panel has no Open: it shows the code and copies the address' },
      props: () => ({ url: URL_, name: 'Terminal', revealed: false, onRevealedChange: () => {} }),
      steps: [{ press: { role: 'button', name: 'Open' } }],
      expect: { opened: [URL_], neverShown: [URL_] },
    },
    {
      name: 'titled by name; the trust sentence says what the address reaches',
      props: () => ({ url: URL_, name: 'Terminal', revealed: false, onRevealedChange: () => {}, onClose: () => {}, reach: 'terminal' }),
      covers: ['name', 'reach'],
      steps: [],
      expect: { nodes: [{ target: { text: 'QR code: Terminal' } }, { target: { role: 'button', name: 'Only share it with people you trust.' } }] },
    },
    {
      name: 'revealed: the address and its code show; a keyed code is described by the key caption',
      props: () => ({ url: URL_, name: 'Terminal', revealed: true, onRevealedChange: () => {}, onClose: () => {} }),
      covers: ['url', 'keyed'],
      steps: [],
      only: { platform: 'web', why: 'on the web the shown address is page text; the terminal tree keeps a secret address out, see the term case below' },
      expect: { nodes: [{ target: { text: URL_ } }, { target: { role: 'img', name: 'QR code for this address' }, description: KEY_NOTE }] },
    },
    {
      name: 'revealed: the address shows on screen only (a secret group in the tree); a keyed code is described by the key caption',
      props: () => ({ url: URL_, name: 'Terminal', revealed: true, onRevealedChange: () => {}, onClose: () => {} }),
      covers: ['url', 'keyed'],
      steps: [],
      only: { platform: 'term', why: 'the terminal semantics tree is agent-readable: a shown secret is a secret group there (the web case above reads the page text)' },
      expect: { nodes: [{ target: { role: 'group', name: 'QR code: Terminal' }, states: { secret: true } }, { target: { role: 'img', name: 'QR code for this address' }, description: KEY_NOTE }], treeNever: [URL_, '0123456789abcdef'] },
    },
    {
      name: 'an address that grants access but is not secret (keyed, secret false) still wears the key caption',
      props: () => ({ url: URL_, name: 'Terminal', secret: false, keyed: true, revealed: false, onRevealedChange: () => {}, onClose: () => {} }),
      covers: ['keyed', 'secret'],
      steps: [],
      expect: { nodes: [{ target: { text: URL_ } }, { target: { role: 'img', name: 'QR code for this address' }, description: KEY_NOTE }] },
    },
  ],
});

const code = scenarios('QrCode', loose(QrCode), {
  ignored: { logo: MARK },
  unsupported: {},
  cases: [
    {
      name: 'the code is an image named by its label',
      props: () => ({ matrix: qrMatrix(URL_), label: 'QR code for this address', secret: false }),
      covers: ['matrix', 'label'],
      steps: [],
      expect: { nodes: [{ target: { role: 'img', name: 'QR code for this address' } }] },
    },
    {
      name: 'a secret code inside a QrSecret is described by its caption',
      props: () => ({ matrix: qrMatrix(URL_), label: 'QR code for this address', secret: true }),
      mount: (C, p) => h(QrSecret as never, { note: 'Holds your sign-in key', children: h(C as never, p as never) } as never),
      covers: ['secret'],
      steps: [],
      expect: { nodes: [{ target: { role: 'img', name: 'QR code for this address' }, description: 'Holds your sign-in key' }] },
    },
  ],
});

const secret = scenarios('QrSecret', loose(QrSecret), {
  ignored: { boxClassName: 'a web size class for the code\'s box; in cells the code is its own size' },
  unsupported: {},
  cases: [
    {
      name: 'the key badge and the caption around the code; the code is described by the caption',
      props: () => ({ note: 'Holds your sign-in key' }),
      mount: (C, p) => h(C, { ...(p as Record<string, unknown>), children: h(QrCode as never, { matrix: qrMatrix(URL_), label: 'QR code for this address', secret: true }) } as never),
      covers: ['note', 'children'],
      steps: [],
      expect: { nodes: [{ target: { text: 'Holds your sign-in key' } }, { target: { role: 'img', name: 'QR code for this address' }, description: 'Holds your sign-in key' }] },
    },
  ],
});

const image = scenarios('QrImage', loose(QrImage), {
  ignored: {},
  unsupported: {},
  cases: [
    {
      name: 'an image that is not a QR the terminal can read never shows its address; the web shows the image by its name',
      only: { platform: 'web', why: 'the terminal reads the image asynchronously; its drawing and the unreadable line are pinned in Qr.term.test.tsx' },
      props: () => ({ src: 'data:image/png;base64,AAAA', alt: 'QR code for your authenticator app' }),
      steps: [],
      expect: { nodes: [{ target: { role: 'img', name: 'QR code for your authenticator app' } }] },
    },
    {
      name: 'a code the API sent as an image is an image named by its alt (the terminal draws its modules)',
      props: () => ({ src: PNG, alt: 'QR code for your authenticator app' }),
      mount: (C, p) => h(QrSecret as never, { note: 'Holds your sign-in key', children: h(C as never, p as never) } as never),
      covers: ['src', 'alt'],
      steps: [],
      expect: { nodes: [{ target: { role: 'img', name: 'QR code for your authenticator app' }, description: 'Holds your sign-in key' }] },
    },
  ],
});

export default [button, panel, code, secret, image];
