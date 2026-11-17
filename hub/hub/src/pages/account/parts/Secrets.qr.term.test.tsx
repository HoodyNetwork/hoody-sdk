// The 2FA key's QR on the account page, in the terminal (a server-made QR image is a secret code,
// no exemption). KeyQr draws the kit's QrImage inside its QrSecret: the key badge on top and the caption under it, the
// modules as cells only (never text in the semantics tree, never the otpauth URI or the key anywhere), and nothing left
// once the drawer drops its HeldSecret and unmounts it (route change, realm switch, sign-out, page hide all go there).
import { afterEach, expect, test } from 'bun:test';
import { useState } from 'react';
import QRCode from 'qrcode';
import { drawTest, type TestTerm } from '../../../term/prim/testing';
import { FocusRoot, PaneSize } from '../../../term/prim';
import { OverlayHost } from '../../../term/prim/Overlay';
import { semanticsOf, semText } from '../../../term/prim/semantics';
import { KeyQr } from './Secrets';

let t: TestTerm | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; });
const KEY = 'JBSWY3DPEHPK3PXP';
const tree = () => semText(semanticsOf(t!.renderer as never));
let drop: (() => void) | null = null;

function Holder({ src }: { src: string }) {
  const [held, setHeld] = useState<string | null>(src);
  drop = () => setHeld(null);
  return held ? <KeyQr src={held} alt="QR code for your authenticator app" /> : null;
}

test('KeyQr: the 2FA QR wears the key badge and caption, its modules are cells only, and it is gone once dropped', async () => {
  const png = await QRCode.toDataURL(`otpauth://totp/Hoody%20(ada)?secret=${KEY}&issuer=Hoody`, { errorCorrectionLevel: 'M' });
  t = await drawTest(<FocusRoot><OverlayHost><PaneSize><Holder src={png} /></PaneSize></OverlayHost></FocusRoot>, { width: 80, height: 40 });
  await new Promise((r) => setTimeout(r, 80));
  let f = await t.settle();
  const lines = f.split('\n');
  // The badge (a plain word on its own line) and the caption, which the code is described by.
  expect(lines[0]!.trimEnd()).toBe('Key');
  expect(lines.some((l) => l.startsWith('! '))).toBe(true);
  expect(f).toMatch(/[▀▄]/);
  const s = tree();
  expect(s).toContain('QR code for your authenticator app');
  expect(s).toContain('filled');
  // Never as text: no module glyph, no URI, no key in the tree or in the frame's words.
  expect(s).not.toMatch(/[▀▄█]/);
  for (const secret of [KEY, 'otpauth', 'data:image']) {
    expect({ secret, inTree: s.includes(secret) }).toEqual({ secret, inTree: false });
    expect({ secret, inFrame: f.includes(secret) }).toEqual({ secret, inFrame: false });
  }
  drop!();
  await new Promise((r) => setTimeout(r, 30));
  f = await t.settle();
  expect(f).not.toMatch(/[▀▄]/);
  expect(f).not.toContain('Key');
  expect(tree()).not.toContain('QR code for your authenticator app');
});
