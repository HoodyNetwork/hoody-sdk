// QR matrices for QrButton / QrPanel. Only https addresses that fit a QR code get one.
// Every code carries the Hoody mark (or a Bot's B) in its middle when it can do so safely: the code is
// made at error correction level H (30% of it can be lost) and a centred square of LOGO_SIDE[version] modules is
// left clear for the mark. Up to version 6 no reserved module may lie in that square (finder, separator, timing,
// alignment, format or version: the qrcode library's own map, never a guess). From version 7 a code has an alignment
// pattern at its centre: the mark may cover alignment modules there (a reader finds the code by its finders and the
// alignment pattern nearest the bottom right corner, never by the centre one), but nothing within 11 modules of an
// edge, where finders, separators, format, version and the timing rows live. Text that needs more than version 12 at
// level H (a dense code) gets level M and no mark.
import QRCode from 'qrcode';

/** What an address that grants access reaches, for the caption's InfoTip under its code: the whole computer
 *  (terminal), its desktop, its files, its browser, its AI agent, the app on a port, or (not known) one program on it. */
export type QrReachKind = 'terminal' | 'desktop' | 'files' | 'browser' | 'agent' | 'port' | 'alias' | 'program';
/** The reach of a computer program's address by its service name (the address's `<program>-<n>` part); any other
 *  program reaches only itself, as far as the Hub knows. */
const REACH_BY_SERVICE: Readonly<Record<string, QrReachKind>> = { terminal: 'terminal', display: 'desktop', desktop: 'desktop', files: 'files', browser: 'browser', agent: 'agent' };
export function qrReachOf(service: string): QrReachKind {
  return Object.hasOwn(REACH_BY_SERVICE, service) ? REACH_BY_SERVICE[service]! : 'program';
}

/** The cleared square for the mark, in modules: rows and columns `at` .. `at + side - 1`. */
export interface QrLogo {
  at: number;
  side: number;
}

export interface QrMatrix {
  size: number;
  /** Row-major, 1 = dark module. Always false inside the logo square. */
  dark: (row: number, col: number) => boolean;
  /** The square left clear for the mark, or null when the code has no mark. */
  logo?: QrLogo | null;
}

/**
 * The mark's square side per version: as large as decoding stays solid. The floor is the weakest small code (version 4,
 * side 9), which decodes in 30 of 40 seeded jsQR runs with 1% of its data modules flipped. Versions 5 and 6 (Bot and
 * program addresses) take the largest side that decodes with nothing flipped and keeps at least that margin: 13 (12.3%
 * of the modules, 34 of 40) and 15 (13.4%, 32 of 40). Versions 7 to 12 (the longer program and share addresses) take
 * about a quarter of the code's width, 6 to 8% of its modules, and decode in at least 36 of 40 such runs. The margin
 * test in qr.logo.test.tsx keeps it.
 */
export const LOGO_SIDE: Readonly<Record<number, number>> = { 1: 5, 2: 7, 3: 7, 4: 9, 5: 13, 6: 15, 7: 11, 8: 13, 9: 13, 10: 15, 11: 15, 12: 17 };
/** The last version that carries a mark: past it a code at level H is too dense, so it gets level M and no mark. */
const LOGO_MAX_VERSION = 12;
/** The last version whose centre square may hold no reserved module at all. */
const STRICT_MAX_VERSION = 6;
/** From version 7, a reserved module in the square must lie at least this far from every edge (alignment modules only). */
const EDGE_RESERVED = 11;

/** The centred square for the mark in a code of `size` modules (version = (size - 17) / 4), or null when none. */
export function logoSquare(size: number): QrLogo | null {
  const side = LOGO_SIDE[(size - 17) / 4];
  if (!side) return null;
  return { at: (size - side) / 2, side };
}

/** True when module (`r`, `c`) lies in the cleared square; no square clears nothing. */
const inSquare = (sq: QrLogo | null, r: number, c: number) => sq !== null && r >= sq.at && r < sq.at + sq.side && c >= sq.at && c < sq.at + sq.side;

type Made = ReturnType<typeof QRCode.create>;

/** `made` with its centre cleared, or null when the code is too big for a mark or the square would erase a reserved module
 *  it may not (any, up to version 6; one near an edge, from version 7). */
function withLogo(made: Made): QrMatrix | null {
  const { modules, version } = made;
  if (version > LOGO_MAX_VERSION) return null;
  const n = modules.size;
  const sq = logoSquare(n);
  if (!sq) return null;
  const nearEdge = (k: number) => k < EDGE_RESERVED || k >= n - EDGE_RESERVED;
  for (let r = sq.at; r < sq.at + sq.side; r++)
    for (let c = sq.at; c < sq.at + sq.side; c++)
      if (modules.reservedBit[r * n + c] && (version <= STRICT_MAX_VERSION || nearEdge(r) || nearEdge(c))) return null;
  return { size: n, dark: (r, c) => !inSquare(sq, r, c) && modules.data[r * n + c] === 1, logo: sq };
}

/** The code for `text`: with the mark at level H when it is safe (up to version 12), else level M with none; null when it
 *  does not fit. */
function codeOf(text: string): QrMatrix | null {
  try {
    const h = withLogo(QRCode.create(text, { errorCorrectionLevel: 'H' }));
    if (h) return h;
  } catch {
    // Too long at level H: level M below.
  }
  try {
    const { modules } = QRCode.create(text, { errorCorrectionLevel: 'M' });
    return { size: modules.size, dark: (r, c) => modules.data[r * modules.size + c] === 1, logo: null };
  } catch {
    return null;
  }
}

/** The QR matrix of an https address, or null when it is not https or too long for a code. */
export function qrMatrix(url: string | undefined): QrMatrix | null {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:') return null;
  return codeOf(url);
}

/**
 * The QR matrix of plain text (a hand-over message, a share token), or null when empty or too long for a code. No URL
 * rule: the text is coded as given. A Bot key is not coded alone: it rides its Bot's address (`/#key=`, through qrMatrix).
 */
export function qrTextMatrix(text: string | undefined): QrMatrix | null {
  if (!text) return null;
  return codeOf(text);
}

/** True when `url` can be shown as a QR code. */
export function canQr(url: string | undefined): boolean {
  return qrMatrix(url) !== null;
}

/**
 * A stand-in code for a hidden secret address: a fixed pattern with finder squares, never
 * derived from the address, so nothing about it reaches the page before Show. It wears the mark like a real code.
 */
export function standInMatrix(size = 29): QrMatrix {
  let seed = 0x5eed1234;
  const bits: boolean[] = [];
  for (let i = 0; i < size * size; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    bits.push((seed >> 16) % 2 === 1);
  }
  const finder = (r: number, c: number) => {
    for (const [fr, fc] of [
      [0, 0],
      [0, size - 7],
      [size - 7, 0],
    ] as const) {
      const y = r - fr;
      const x = c - fc;
      if (y >= 0 && y < 7 && x >= 0 && x < 7) {
        return y === 0 || y === 6 || x === 0 || x === 6 || (y >= 2 && y <= 4 && x >= 2 && x <= 4) ? 1 : 0;
      }
      if (y >= -1 && y <= 7 && x >= -1 && x <= 7) return 0;
    }
    return -1;
  };
  const logo = logoSquare(size);
  return {
    size,
    dark: (r, c) => {
      if (inSquare(logo, r, c)) return false;
      const f = finder(r, c);
      return f === -1 ? (bits[r * size + c] ?? false) : f === 1;
    },
    logo,
  };
}

/** One SVG path drawing every dark module as a 1×1 square, offset by the quiet zone. */
export function matrixPath(m: QrMatrix, quiet = 4): string {
  const parts: string[] = [];
  for (let r = 0; r < m.size; r++) {
    for (let c = 0; c < m.size; c++) {
      if (m.dark(r, c)) parts.push(`M${c + quiet} ${r + quiet}h1v1h-1z`);
    }
  }
  return parts.join('');
}

/** The kit logo (icons.tsx FILLED.logo, 24 × 24 grid, its square at 1..23): the brand's pixel h is cut out of the
 *  square. */
export const LOGO_PATH = 'M1 1h22v22H1zM4.4375 4.4375h2.75v8.25h-2.75zM4.4375 15.4375h2.75v4.125h-2.75zM7.1875 12.6875h12.375v6.875h-2.75v-4.125H7.1875z';
/** The Bot B, verbatim from the brand's 24 px dark logo file: a 0..24 square in the ink with this path in the ground
 *  (drawn like the Hoody mark). Never redrawn. */
export const BOT_LOGO_PATH = 'M17 20H7V17H17V20ZM7 10H17V13H7V17H4V4H7V10ZM20 17H17V13H20V17Z';
/** The key on the badge above a code that carries a secret (a code with a token is branded with the key on top, outside
 *  the code): a pixel key on a 12 × 12 grid, drawn in the code's ground on a square of its ink. */
export const KEY_PATH = 'M1 3h6v6H1zM3 5v2h2V5zM7 5h4v2H7zM9 7h2v2H9z';
