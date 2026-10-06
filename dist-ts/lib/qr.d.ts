/**
 * QR codes for terminals, with no dependency.
 *
 * `qrMatrix(text)` encodes text (UTF-8, byte mode) at the smallest version
 * 1-40, raising the error correction to the highest level that fits that
 * version. It is the encoder of the pipe kit's pages
 * (hoody-pipe/src/pages/common.ts, checked there against qrcode@1.5.4 for
 * every version and level), ported to TypeScript. It follows Project Nayuki's
 * QR Code generator (MIT License, Copyright (c) Project Nayuki,
 * https://www.nayuki.io/page/qr-code-generator-library), condensed.
 *
 * `qrTerminal(text)` draws it with half-block characters, two module rows per
 * line, inside a 4-module quiet zone.
 */
export type QrEcl = 'L' | 'M' | 'Q' | 'H';
export interface QrMatrix {
    version: number;
    ecl: QrEcl;
    /** Mask pattern 0-7. */
    mask: number;
    /** Modules per side: version * 4 + 17. */
    size: number;
    /** modules[y][x], true = dark. */
    modules: boolean[][];
}
/**
 * The QR code of `text`, or null when it does not fit version 40 at `minEcl`
 * (2953 bytes at L). The error correction starts at `minEcl` (default L) and
 * is raised while the version stays the same.
 */
export declare function qrMatrix(text: string, minEcl?: QrEcl): QrMatrix | null;
/** Quiet zone around the code, in modules (the QR standard's minimum). */
export declare const QR_QUIET_ZONE = 4;
export interface QrTerminalOptions {
    /**
     * Wrap each line in ANSI colours (bright white on black) so the code reads
     * dark-on-light on any terminal theme. Without colour, light modules are
     * drawn and dark ones left blank, which is right on a dark terminal.
     */
    color?: boolean;
}
/**
 * `text` as a QR code drawn with half blocks, one line per two module rows,
 * with a 4-module quiet zone; "" when the text is too long for a QR code.
 * The lines end in "\n".
 */
export declare function qrTerminal(text: string, options?: QrTerminalOptions): string;
