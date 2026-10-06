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
const ECC_PER_BLOCK = [
    [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
    [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
];
const EC_BLOCKS = [
    [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
    [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
    [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
    [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
];
const ECL_NAMES = ['L', 'M', 'Q', 'H'];
/** Format-information bits of L, M, Q, H. */
const ECL_FORMAT = [1, 0, 3, 2];
function rawModules(ver) {
    let r = (16 * ver + 128) * ver + 64;
    if (ver >= 2) {
        const na = Math.floor(ver / 7) + 2;
        r -= (25 * na - 10) * na - 55;
        if (ver >= 7)
            r -= 36;
    }
    return r;
}
function dataCodewords(ver, e) {
    return Math.floor(rawModules(ver) / 8) - ECC_PER_BLOCK[e][ver] * EC_BLOCKS[e][ver];
}
function gfMul(x, y) {
    let z = 0;
    for (let i = 7; i >= 0; i--) {
        z = (z << 1) ^ ((z >>> 7) * 0x11d);
        z ^= ((y >>> i) & 1) * x;
    }
    return z;
}
function rsDivisor(degree) {
    const r = new Array(degree - 1).fill(0);
    r.push(1);
    let root = 1;
    for (let i = 0; i < degree; i++) {
        for (let j = 0; j < r.length; j++) {
            r[j] = gfMul(r[j], root);
            if (j + 1 < r.length)
                r[j] = r[j] ^ r[j + 1];
        }
        root = gfMul(root, 2);
    }
    return r;
}
function rsRemainder(data, div) {
    const r = div.map(() => 0);
    for (const b of data) {
        const f = b ^ r.shift();
        r.push(0);
        div.forEach((c, i) => { r[i] = r[i] ^ gfMul(c, f); });
    }
    return r;
}
function bit(x, i) {
    return ((x >>> i) & 1) !== 0;
}
/**
 * The QR code of `text`, or null when it does not fit version 40 at `minEcl`
 * (2953 bytes at L). The error correction starts at `minEcl` (default L) and
 * is raised while the version stays the same.
 */
export function qrMatrix(text, minEcl = 'L') {
    const bytes = Array.from(new TextEncoder().encode(String(text)));
    const e0 = Math.max(0, ECL_NAMES.indexOf(minEcl));
    const bitsNeeded = (v) => 4 + (v < 10 ? 8 : 16) + bytes.length * 8;
    let ver = 1;
    while (ver <= 40 && bitsNeeded(ver) > dataCodewords(ver, e0) * 8)
        ver++;
    if (ver > 40)
        return null;
    let e = e0;
    for (let i = e0 + 1; i < 4; i++)
        if (bitsNeeded(ver) <= dataCodewords(ver, i) * 8)
            e = i;
    const bb = [];
    const put = (val, len) => { for (let k = len - 1; k >= 0; k--)
        bb.push((val >>> k) & 1); };
    put(4, 4);
    put(bytes.length, ver < 10 ? 8 : 16);
    for (const b of bytes)
        put(b, 8);
    const cap = dataCodewords(ver, e) * 8;
    put(0, Math.min(4, cap - bb.length));
    put(0, (8 - (bb.length % 8)) % 8);
    for (let pad = 0xec; bb.length < cap; pad ^= 0xec ^ 0x11)
        put(pad, 8);
    const data = [];
    for (let i = 0; i < bb.length; i += 8) {
        let v = 0;
        for (let j = 0; j < 8; j++)
            v = (v << 1) | bb[i + j];
        data.push(v);
    }
    // Split into blocks, add Reed-Solomon codewords, interleave.
    const nb = EC_BLOCKS[e][ver];
    const eccLen = ECC_PER_BLOCK[e][ver];
    const raw = Math.floor(rawModules(ver) / 8);
    const nShort = nb - (raw % nb);
    const shortLen = Math.floor(raw / nb);
    const div = rsDivisor(eccLen);
    const blocks = [];
    for (let i = 0, k = 0; i < nb; i++) {
        const dat = data.slice(k, k + shortLen - eccLen + (i < nShort ? 0 : 1));
        k += dat.length;
        const ecc = rsRemainder(dat, div);
        if (i < nShort)
            dat.push(0);
        blocks.push(dat.concat(ecc));
    }
    const cw = [];
    for (let i = 0; i < blocks[0].length; i++) {
        for (let j = 0; j < blocks.length; j++) {
            if (i !== shortLen - eccLen || j >= nShort)
                cw.push(blocks[j][i]);
        }
    }
    const size = ver * 4 + 17;
    const mod = Array.from({ length: size }, () => new Array(size).fill(false));
    const fn = Array.from({ length: size }, () => new Array(size).fill(false));
    const setF = (x, y, d) => { mod[y][x] = d; fn[y][x] = true; };
    const finder = (cx, cy) => {
        for (let dy = -4; dy <= 4; dy++)
            for (let dx = -4; dx <= 4; dx++) {
                const d = Math.max(Math.abs(dx), Math.abs(dy));
                const xx = cx + dx;
                const yy = cy + dy;
                if (xx >= 0 && xx < size && yy >= 0 && yy < size)
                    setF(xx, yy, d !== 2 && d !== 4);
            }
    };
    const align = (cx, cy) => {
        for (let dy = -2; dy <= 2; dy++)
            for (let dx = -2; dx <= 2; dx++) {
                setF(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
            }
    };
    const formatBits = (mask) => {
        const d = (ECL_FORMAT[e] << 3) | mask;
        let r = d;
        for (let t = 0; t < 10; t++)
            r = (r << 1) ^ ((r >>> 9) * 0x537);
        const b = ((d << 10) | r) ^ 0x5412;
        for (let q = 0; q <= 5; q++)
            setF(8, q, bit(b, q));
        setF(8, 7, bit(b, 6));
        setF(8, 8, bit(b, 7));
        setF(7, 8, bit(b, 8));
        for (let q = 9; q < 15; q++)
            setF(14 - q, 8, bit(b, q));
        for (let q = 0; q < 8; q++)
            setF(size - 1 - q, 8, bit(b, q));
        for (let q = 8; q < 15; q++)
            setF(8, size - 15 + q, bit(b, q));
        setF(8, size - 8, true);
    };
    for (let i = 0; i < size; i++) {
        setF(6, i, i % 2 === 0);
        setF(i, 6, i % 2 === 0);
    }
    finder(3, 3);
    finder(size - 4, 3);
    finder(3, size - 4);
    if (ver > 1) {
        const na = Math.floor(ver / 7) + 2;
        const step = Math.floor((ver * 8 + na * 3 + 5) / (na * 4 - 4)) * 2;
        const pos = [6];
        for (let p = size - 7; pos.length < na; p -= step)
            pos.splice(1, 0, p);
        for (let i = 0; i < na; i++)
            for (let j = 0; j < na; j++) {
                if (!((i === 0 && j === 0) || (i === 0 && j === na - 1) || (i === na - 1 && j === 0)))
                    align(pos[i], pos[j]);
            }
    }
    formatBits(0);
    if (ver >= 7) {
        let r = ver;
        for (let i = 0; i < 12; i++)
            r = (r << 1) ^ ((r >>> 11) * 0x1f25);
        const vb = (ver << 12) | r;
        for (let i = 0; i < 18; i++) {
            const c = bit(vb, i);
            const a = size - 11 + (i % 3);
            const b2 = Math.floor(i / 3);
            setF(a, b2, c);
            setF(b2, a, c);
        }
    }
    // Codewords in the zigzag order, skipping function modules.
    let n = 0;
    for (let right = size - 1; right >= 1; right -= 2) {
        if (right === 6)
            right = 5;
        for (let vert = 0; vert < size; vert++)
            for (let j = 0; j < 2; j++) {
                const x = right - j;
                const y = ((right + 1) & 2) === 0 ? size - 1 - vert : vert;
                if (!fn[y][x] && n < cw.length * 8) {
                    mod[y][x] = bit(cw[n >>> 3], 7 - (n & 7));
                    n++;
                }
            }
    }
    const applyMask = (m) => {
        for (let yy = 0; yy < size; yy++)
            for (let xx = 0; xx < size; xx++) {
                let inv;
                switch (m) {
                    case 0:
                        inv = (xx + yy) % 2 === 0;
                        break;
                    case 1:
                        inv = yy % 2 === 0;
                        break;
                    case 2:
                        inv = xx % 3 === 0;
                        break;
                    case 3:
                        inv = (xx + yy) % 3 === 0;
                        break;
                    case 4:
                        inv = (Math.floor(xx / 3) + Math.floor(yy / 2)) % 2 === 0;
                        break;
                    case 5:
                        inv = ((xx * yy) % 2) + ((xx * yy) % 3) === 0;
                        break;
                    case 6:
                        inv = (((xx * yy) % 2) + ((xx * yy) % 3)) % 2 === 0;
                        break;
                    default: inv = (((xx + yy) % 2) + ((xx * yy) % 3)) % 2 === 0;
                }
                if (!fn[yy][xx] && inv)
                    mod[yy][xx] = !mod[yy][xx];
            }
    };
    const addHistory = (len, h) => {
        if (h[0] === 0)
            len += size;
        h.pop();
        h.unshift(len);
    };
    const countFinder = (h) => {
        const u = h[1];
        const core = u > 0 && h[2] === u && h[3] === u * 3 && h[4] === u && h[5] === u;
        return (core && h[0] >= u * 4 && h[6] >= u ? 1 : 0) + (core && h[6] >= u * 4 && h[0] >= u ? 1 : 0);
    };
    const penalty = () => {
        let score = 0;
        let dark = 0;
        for (let pass = 0; pass < 2; pass++)
            for (let a = 0; a < size; a++) {
                let color = false;
                let run = 0;
                const h = [0, 0, 0, 0, 0, 0, 0];
                for (let b = 0; b < size; b++) {
                    const cell = pass === 0 ? mod[a][b] : mod[b][a];
                    if (cell === color) {
                        run++;
                        if (run === 5)
                            score += 3;
                        else if (run > 5)
                            score++;
                    }
                    else {
                        addHistory(run, h);
                        if (!color)
                            score += countFinder(h) * 40;
                        color = cell;
                        run = 1;
                    }
                }
                if (color) {
                    addHistory(run, h);
                    run = 0;
                }
                addHistory(run + size, h);
                score += countFinder(h) * 40;
            }
        for (let a = 0; a < size; a++)
            for (let b = 0; b < size; b++) {
                if (mod[a][b])
                    dark++;
                if (a < size - 1 && b < size - 1) {
                    const color = mod[a][b];
                    if (color === mod[a][b + 1] && color === mod[a + 1][b] && color === mod[a + 1][b + 1])
                        score += 3;
                }
            }
        const total = size * size;
        return score + (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
    };
    let best = 0;
    let bestScore = Infinity;
    for (let i = 0; i < 8; i++) {
        applyMask(i);
        formatBits(i);
        const s = penalty();
        if (s < bestScore) {
            best = i;
            bestScore = s;
        }
        applyMask(i);
    }
    applyMask(best);
    formatBits(best);
    return { version: ver, ecl: ECL_NAMES[e], mask: best, size, modules: mod };
}
/** Quiet zone around the code, in modules (the QR standard's minimum). */
export const QR_QUIET_ZONE = 4;
/**
 * `text` as a QR code drawn with half blocks, one line per two module rows,
 * with a 4-module quiet zone; "" when the text is too long for a QR code.
 * The lines end in "\n".
 */
export function qrTerminal(text, options = {}) {
    const q = qrMatrix(text);
    if (!q)
        return '';
    const n = q.size + 2 * QR_QUIET_ZONE;
    // Light (drawn) = the quiet zone or a light module.
    const light = (x, y) => {
        const mx = x - QR_QUIET_ZONE;
        const my = y - QR_QUIET_ZONE;
        if (mx < 0 || my < 0 || mx >= q.size || my >= q.size)
            return true;
        return !q.modules[my][mx];
    };
    let out = '';
    for (let y = 0; y < n; y += 2) {
        let line = '';
        for (let x = 0; x < n; x++) {
            const top = light(x, y);
            // An odd total leaves the last line's lower half outside the code: blank.
            const bottom = y + 1 < n ? light(x, y + 1) : false;
            line += top ? (bottom ? '█' : '▀') : bottom ? '▄' : ' ';
        }
        out += (options.color ? `\x1b[97;40m${line}\x1b[0m` : line) + '\n';
    }
    return out;
}
