// Terminal QR: the half-block drawing holds every module (read back from the cells), the PNG an API answer carries reads
// back to the exact matrix, a secret stays out of the frame and the semantics tree until Show and is wiped on close, and
// a code that does not fit is never drawn cut.
import { afterEach, expect, test } from 'bun:test';
import QRCode from 'qrcode';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { FocusRoot, PaneSize } from '../../term/prim';
import { OverlayHost } from '../../term/prim/Overlay';
import { qrRows, qrCells, QR_QUIET } from '../../term/prim/Qr';
import { semanticsOf, semText } from '../../term/prim/semantics';
import { QrButton, QrCode, QrImage, QrSecret } from './Qr';
import { qrMatrix, standInMatrix } from './qr';
import { qrImageMatrix } from './qrImage';

let t: TestTerm | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; });
const draw = async (node: React.ReactNode, w: number, h: number) => {
  t = await drawTest(<FocusRoot><OverlayHost><PaneSize>{node}</PaneSize></OverlayHost></FocusRoot>, { width: w, height: h });
  return t.settle();
};
const tree = () => semText(semanticsOf(t!.renderer as never));
const URL_ = 'https://example.com/terminal/0123456789abcdef';

/** The modules drawn in a frame's half blocks (light = false), inside the quiet zone. */
function readBack(lines: string[], size: number): boolean[] {
  const out: boolean[] = [];
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
    const y = r + QR_QUIET;
    const ch = lines[y >> 1]![c + QR_QUIET]!;
    const light = (y & 1) === 0 ? ch === '█' || ch === '▀' : ch === '█' || ch === '▄';
    out.push(!light);
  }
  return out;
}

test('the half blocks hold every module, and the quiet zone is light all round', () => {
  const m = qrMatrix(URL_)!;
  const lines = qrRows(m);
  const { cols, rows } = qrCells(m.size);
  expect(lines.length).toBe(rows);
  expect(lines.every((l) => [...l].length === cols)).toBe(true);
  const want: boolean[] = [];
  for (let r = 0; r < m.size; r++) for (let c = 0; c < m.size; c++) want.push(m.dark(r, c));
  expect(readBack(lines, m.size)).toEqual(want);
  expect(lines[0]).toBe('█'.repeat(cols));
  expect(lines.every((l) => l.startsWith('████') && l.endsWith('████'))).toBe(true);
});

test('a PNG data URL (the 2FA answer\'s form) reads back to the exact matrix; anything else is null', async () => {
  const text = 'otpauth://totp/Hoody%20(ada)?secret=JBSWY3DPEHPK3PXP&issuer=Hoody';
  const ref = QRCode.create(text, { errorCorrectionLevel: 'M' }).modules;
  for (const opts of [{}, { margin: 1, scale: 3 }, { width: 300 }]) {
    const png = await QRCode.toDataURL(text, { errorCorrectionLevel: 'M', ...opts });
    const m = await qrImageMatrix(png);
    expect(m?.size).toBe(ref.size);
    let same = true;
    for (let r = 0; r < ref.size; r++) for (let c = 0; c < ref.size; c++) if (m!.dark(r, c) !== (ref.data[r * ref.size + c] === 1)) same = false;
    expect(same).toBe(true);
  }
  expect(await qrImageMatrix('data:image/png;base64,AAAA')).toBeNull();
  expect(await qrImageMatrix('https://example.com/qr.png')).toBeNull();
  expect(await qrImageMatrix(undefined)).toBeNull();
});

test('QrCode in a QrSecret: the tree names an image, filled, described by the caption; no module is text there', async () => {
  const m = qrMatrix(URL_)!;
  const f = await draw(<QrSecret note="Holds your sign-in key"><QrCode matrix={m} label="QR code for this address" secret /></QrSecret>, 80, 40);
  // The badge is a plain word on its own line (never an inverse block that reads as more quiet zone).
  const lines = f.split('\n');
  expect(lines[0]!.trimEnd()).toBe('Key');
  // The light field is the code plus exactly its 4-module quiet zone: qrCells() wide and high, nothing more.
  const need = qrCells(m.size);
  const code = lines.slice(1, 1 + need.rows);
  for (const l of code) expect(l.replace(/ +$/, '').length).toBe(need.cols);
  expect(code[0]!.slice(0, need.cols)).toBe('█'.repeat(need.cols));
  expect(code[1]!.slice(0, need.cols)).toBe('█'.repeat(need.cols));
  expect(code[2]!.slice(0, QR_QUIET)).toBe('████');
  expect(code[2]![QR_QUIET]).not.toBe('█');
  expect(lines[1 + need.rows]!.startsWith('! ')).toBe(true);
  expect(f).toContain('Holds your sign-in key');
  expect(f).toMatch(/[▀▄]/);
  const s = tree();
  expect(s).toContain('QR code for this address');
  expect(s).toContain('filled');
  expect(s).not.toMatch(/[▀▄█]/);
});

test('a code that does not fit its pane is never drawn cut: a line says why and offers the web', async () => {
  const m = qrMatrix(URL_)!;
  const f = await draw(<QrCode matrix={m} label="QR code for this address" />, 40, 20);
  expect(f).not.toMatch(/[▀▄]/);
  expect(f).toContain('needs');
  expect(f).toContain('Copy link'); // the hand-off: the same page's web address and a copy key
});

// A code holding a key (a Bot key share, the 2FA setup) that does not fit offered "open it on the web",
// whose page cannot show that key again (it is shown once, here). Inside a QrSecret: the line why, and how to get it here.
test('a code holding a key that does not fit: no web hand-off, the way to get it here instead', async () => {
  const m = qrMatrix(URL_)!;
  const f = await draw(<QrSecret><QrCode matrix={m} label="QR code with the key" secret /></QrSecret>, 40, 20);
  expect(f).not.toMatch(/[▀▄]/);
  expect(f).toContain('needs');
  expect(f.replace(/\s+/g, ' ')).toContain('shown only here');
  expect(f).not.toContain('Copy link');
  expect(f).not.toContain('example.com');
});

test('QrButton: a secret address stays out of frame and tree until Show (s); Esc closes and wipes it', async () => {
  await draw(<QrButton url={URL_} name="Terminal" reach="terminal" />, 100, 45);
  t!.mockInput.pressTab();
  await t!.settle();
  t!.mockInput.pressEnter();
  let f = await t!.settle();
  expect(f).toContain('QR code: Terminal');
  expect(f).toContain('Hidden until you press Show');
  expect(f).not.toContain(URL_);
  expect(f).not.toMatch(/[▀▄]/);
  expect(tree()).not.toContain(URL_);
  t!.mockInput.pressKey('s');
  f = await t!.settle();
  expect(f).toContain(URL_);
  expect(f).toMatch(/[▀▄]/);
  expect(tree()).not.toMatch(/[▀▄█]/);
  t!.mockInput.pressEscape();
  await new Promise((r) => setTimeout(r, 80)); // the engine waits to tell Esc from an escape sequence
  f = await t!.settle();
  expect(f).not.toContain(URL_);
  expect(f).not.toMatch(/[▀▄]/);
  // Opened again: hidden again (the reveal was wiped with the surface).
  t!.mockInput.pressEnter();
  f = await t!.settle();
  expect(f).toContain('Hidden until you press Show');
  expect(f).not.toContain(URL_);
});

test('QrButton without a usable address is disabled and says why', async () => {
  await draw(<QrButton url="http://plain.example.com/" name="Plain" />, 60, 10);
  expect(tree()).toContain('No QR code for this address');
});

test('QrImage: the 2FA answer\'s image is drawn as cells; an unreadable one says so in words', async () => {
  const text = 'otpauth://totp/Hoody%20(ada)?secret=JBSWY3DPEHPK3PXP&issuer=Hoody';
  const png = await QRCode.toDataURL(text, { errorCorrectionLevel: 'M' });
  let f = await draw(<QrSecret note="Holds your sign-in key"><QrImage src={png} alt="QR code for your authenticator app" /></QrSecret>, 80, 40);
  await new Promise((r) => setTimeout(r, 50));
  f = await t!.settle();
  const ref = QRCode.create(text, { errorCorrectionLevel: 'M' }).modules;
  const lines = f.split('\n').filter((l) => /[▀▄]/.test(l) || /^█{20}/.test(l));
  expect(lines.length).toBe(Math.ceil((ref.size + 8) / 2));
  const want: boolean[] = [];
  for (let r = 0; r < ref.size; r++) for (let c = 0; c < ref.size; c++) want.push(ref.data[r * ref.size + c] === 1);
  expect(readBack(lines, ref.size)).toEqual(want);
  expect(tree()).toContain('QR code for your authenticator app');
  t!.renderer.destroy();
  f = await draw(<QrImage src="data:image/png;base64,AAAA" alt="QR" />, 80, 10);
  await new Promise((r) => setTimeout(r, 50));
  f = await t!.settle();
  expect(f).toContain('type the key below');
});

test('a long QrSecret note wraps at the code width: the column is never wider than the code', async () => {
  const m = qrMatrix(URL_)!;
  const need = qrCells(m.size);
  const note = 'Holds your sign-in key: anyone who scans it can add this account to their authenticator app, so keep it to yourself';
  const f = await draw(<QrSecret note={note}><QrCode matrix={m} label="QR code for this address" secret /></QrSecret>, 160, 60);
  const lines = f.split('\n').map((l) => l.trimEnd());
  const after = lines.slice(1 + need.rows).filter((l) => l !== '');
  expect(after.length).toBeGreaterThan(1);
  for (const l of after) expect(l.length).toBeLessThanOrEqual(Math.max(need.cols, 24));
  expect(after.join(' ').replace(/\s+/g, ' ')).toBe(`! ${note}`);
});

// Bot key drawer: the stand-in a page shows before "Show the code with the key" was drawn crisp under
// "Contains a key", so it read as the real code. The web blurs it; here it is the hatched box of a hidden code.
test('the stand-in (standInMatrix) in a QrSecret draws hatched, never as modules; the real code after Show draws crisp', async () => {
  let f = await draw(<QrSecret><QrCode matrix={standInMatrix()} label="QR code (hidden until Show)" secret /></QrSecret>, 80, 40);
  expect(f).not.toMatch(/[▀▄]/);
  expect(f).toContain('░░░░');
  expect(f).toContain('Hidden until you press Show');
  expect(f).toContain('Key');
  // Room for a keyed code (80x40): the box takes the code's size.
  expect(f.split('\n').filter((l) => l.includes('░')).length).toBeGreaterThan(10);
  const s = tree();
  expect(s).toContain('QR code (hidden until Show)');
  expect(s).toContain('hidden');
  expect(s).not.toContain('filled');
  t!.renderer.destroy();
  f = await draw(<QrSecret><QrCode matrix={qrMatrix(URL_)!} label="QR code" secret /></QrSecret>, 80, 40);
  expect(f).toMatch(/[▀▄]/);
  expect(f).not.toContain('░');
});

// In an 80x24 drawer (a pane under 23 rows) the real keyed code never fits ("needs 45 × 23"), so a full-size hatched box only pushed the
// caption and buttons out of view. There the hidden box is compact (3 rows), says what it is, and the hatch is visible ink.
test('a hidden code where the real one cannot fit: a compact 3-row box with its words; caption right under it', async () => {
  const f = await draw(<QrSecret><QrCode matrix={standInMatrix()} label="QR code (hidden until Show)" secret /></QrSecret>, 80, 20);
  const lines = f.split('\n');
  const hatched = lines.filter((l) => l.includes('░'));
  expect(hatched.length).toBe(3);
  expect(hatched[1]).toContain('Hidden until you press Show');
  const last = lines.findIndex((l) => l.includes('░')) + 3;
  expect(lines[last]!.startsWith('! ')).toBe(true);
});
