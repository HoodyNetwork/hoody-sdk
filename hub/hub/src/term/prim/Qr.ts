// Qr: a QR code drawn in cells. Each cell is one module wide and two modules high (a cell is about twice as tall as it
// is wide, so the modules come out square), drawn with the half blocks ▀ ▄ █ and space.
// - The code is light ink on dark ground of the TERMINAL's colours only in mono; at every other tier it is forced to
//   black on white (as the web draws it in both themes) so a phone camera reads it on any terminal theme. These two
//   colours are the one place a QR draws a colour that is not a Hub token (the web's QR exception, app/conformance).
// - The quiet zone (4 modules on every side) is part of the drawing: without it a scanner does not find the code.
// - It draws nothing the semantics tree reads: the caller names it (role img) and the modules are never text there.
import type { ReactElement } from 'react';
import { el } from './otui';
import { colourTier } from './tokens';

/** A code's modules: `dark(row, col)` for row, col in 0 .. size - 1. */
export interface QrModules {
  size: number;
  dark: (row: number, col: number) => boolean;
}

/** Modules of quiet zone on every side (QR's own minimum). */
export const QR_QUIET = 4;

/** The cells a code takes, quiet zone included. */
export function qrCells(size: number, quiet = QR_QUIET): { cols: number; rows: number } {
  const side = size + quiet * 2;
  return { cols: side, rows: Math.ceil(side / 2) };
}

/**
 * The rows of half blocks for a code. Each character draws the LIGHT parts of its two modules in the foreground
 * colour (█ both light, ▀ the top one, ▄ the bottom one, space neither); the background colour is the dark. Outside
 * the code (the quiet zone, and the half row under an odd side) is light.
 */
export function qrRows(m: QrModules, quiet = QR_QUIET): string[] {
  const side = m.size + quiet * 2;
  const light = (r: number, c: number): boolean => {
    const y = r - quiet;
    const x = c - quiet;
    return y < 0 || x < 0 || y >= m.size || x >= m.size || !m.dark(y, x);
  };
  const out: string[] = [];
  for (let r = 0; r < side; r += 2) {
    let line = '';
    for (let c = 0; c < side; c++) {
      const top = light(r, c);
      const bottom = r + 1 >= side || light(r + 1, c);
      line += top && bottom ? '█' : top ? '▀' : bottom ? '▄' : ' ';
    }
    out.push(line);
  }
  return out;
}

/** The light and dark a code is drawn with at the current tier; none in mono (the terminal's own fg on its own bg). */
function qrInk(): { fg?: string; bg?: string } {
  const t = colourTier();
  if (t === 'mono') return {};
  // Pure white and black are the same in truecolor and in xterm's 16 (bright white, black).
  return { fg: '#ffffff', bg: '#000000' };
}

export interface QrProps {
  modules: QrModules;
  quiet?: number;
}

/** The code, quiet zone included, exactly `qrCells()` in size; never shrinks or wraps (a cut code does not scan). */
export function Qr({ modules, quiet = QR_QUIET }: QrProps): ReactElement {
  const ink = qrInk();
  const lines = qrRows(modules, quiet);
  const { cols } = qrCells(modules.size, quiet);
  return el(
    'box',
    { flexDirection: 'column', flexShrink: 0, flexGrow: 0, width: cols, height: lines.length },
    ...lines.map((l, i) => el('text', { key: i, ...ink, wrapMode: 'none', flexShrink: 0, width: cols }, l)),
  );
}
