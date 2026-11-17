// An SSH key made in the browser: Ed25519 through WebCrypto, written in OpenSSH's own formats so
// ssh and ssh-keygen read it as one ssh-keygen -t ed25519 made. The private key exists only in memory until the
// person downloads it; nothing here stores, logs or sends it. It is built as bytes, never as a string, so its holder
// can wipe it (fill(0)) once saved. Where WebCrypto has no Ed25519, makeSshKey() gives null and the page shows the
// ssh-keygen steps instead.

/** A key pair: the public line to paste ("ssh-ed25519 AAAA… comment") and the private file's bytes (ASCII). */
export interface SshKeyPair {
  publicLine: string;
  /** The holder wipes it with fill(0) as soon as it is saved or no longer wanted. */
  privateFile: Uint8Array;
}

const enc = new TextEncoder();

function u32(n: number): Uint8Array {
  return new Uint8Array([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
}

function cat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** An SSH wire string: a 4-byte length, then the bytes. */
function sshString(v: Uint8Array | string): Uint8Array {
  const b = typeof v === 'string' ? enc.encode(v) : v;
  return cat(u32(b.length), b);
}

const ALPHABET = enc.encode('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/');
const EQ = 61;
const NL = 10;

/** Base64 of b as bytes, a newline after every `width` characters when width > 0 (none after the last). */
function b64Bytes(b: Uint8Array, width = 0): Uint8Array {
  const chars = Math.ceil(b.length / 3) * 4;
  const breaks = width > 0 && chars > 0 ? Math.ceil(chars / width) - 1 : 0;
  const out = new Uint8Array(chars + breaks);
  let o = 0;
  let col = 0;
  const put = (c: number) => {
    if (width > 0 && col === width) {
      out[o++] = NL;
      col = 0;
    }
    out[o++] = c;
    col++;
  };
  for (let i = 0; i < b.length; i += 3) {
    const x = b[i] ?? 0;
    const y = b[i + 1] ?? 0;
    const z = b[i + 2] ?? 0;
    put(ALPHABET[x >> 2] ?? 0);
    put(ALPHABET[((x & 3) << 4) | (y >> 4)] ?? 0);
    put(i + 1 < b.length ? (ALPHABET[((y & 15) << 2) | (z >> 6)] ?? 0) : EQ);
    put(i + 2 < b.length ? (ALPHABET[z & 63] ?? 0) : EQ);
  }
  return out;
}

const ascii = (b: Uint8Array) => String.fromCharCode(...b);

const TYPE = 'ssh-ed25519';

/** The public key blob (type, then the 32-byte key). */
function publicBlob(pub: Uint8Array): Uint8Array {
  return cat(sshString(TYPE), sshString(pub));
}

/** The one-line public key, as in id_ed25519.pub. */
export function openSshPublic(pub: Uint8Array, comment: string): string {
  return `${TYPE} ${ascii(b64Bytes(publicBlob(pub)))}${comment ? ` ${comment}` : ''}`;
}

/**
 * The unencrypted private key file (openssh-key-v1, PROTOCOL.key) as bytes: cipher and kdf "none", one key, then the
 * private section padded to a block of 8, base64 wrapped at 70 like ssh-keygen. `check` is the random check number
 * repeated twice in that section. Every buffer here that held the seed is wiped before it returns.
 */
export function openSshPrivate(seed: Uint8Array, pub: Uint8Array, comment: string, check: number): Uint8Array {
  const pair = cat(seed, pub);
  const pairStr = sshString(pair);
  const priv = cat(u32(check), u32(check), sshString(TYPE), sshString(pub), pairStr, sshString(comment));
  const pad = new Uint8Array((8 - (priv.length % 8)) % 8).map((_, i) => i + 1);
  const section = cat(priv, pad);
  const sectionStr = sshString(section);
  const body = cat(
    enc.encode('openssh-key-v1\0'),
    sshString('none'),
    sshString('none'),
    sshString(new Uint8Array(0)),
    u32(1),
    sshString(publicBlob(pub)),
    sectionStr,
  );
  const text = b64Bytes(body, 70);
  // The header is joined at run time so no file (source or bundle) carries a private-key header followed by data.
  const out = cat(enc.encode(['-----BEGIN', 'OPENSSH PRIVATE KEY-----\n'].join(' ')), text, enc.encode('\n-----END OPENSSH PRIVATE KEY-----\n'));
  for (const b of [pair, pairStr, priv, section, sectionStr, body, text]) b.fill(0);
  return out;
}

/** A new Ed25519 key pair, or null where this browser cannot make one (the page then shows ssh-keygen). */
export async function makeSshKey(comment = 'hoody', subtle: SubtleCrypto | undefined = globalThis.crypto?.subtle): Promise<SshKeyPair | null> {
  if (!subtle) return null;
  try {
    const pair = (await subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])) as CryptoKeyPair;
    const pub = new Uint8Array(await subtle.exportKey('raw', pair.publicKey));
    // PKCS#8 for Ed25519 ends with the 32-byte seed (RFC 8410).
    const pk8 = new Uint8Array(await subtle.exportKey('pkcs8', pair.privateKey));
    if (pub.length !== 32 || pk8.length < 32) {
      pk8.fill(0);
      return null;
    }
    const seed = pk8.slice(pk8.length - 32);
    const check = crypto.getRandomValues(new Uint32Array(1))[0] ?? 0;
    const out = { publicLine: openSshPublic(pub, comment), privateFile: openSshPrivate(seed, pub, comment, check) };
    seed.fill(0);
    pk8.fill(0);
    return out;
  } catch {
    return null;
  }
}

/** A short random tag (4 lowercase letters or digits) that keeps each new key's file name its own. */
export function sshKeyTag(): string {
  const abc = 'abcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => abc[b % abc.length]).join('');
}

/**
 * The file and comment name for a computer's key: "hoody-" plus the name in lowercase letters, digits and dashes
 * (at most 40), or "key" when nothing is left, then "-<tag>" when given. One file per key: a computer refuses a key
 * another uses, and a new key never lands on an older key's file.
 */
export function sshKeyFileName(computer?: string, tag?: string): string {
  const slug = (computer ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '');
  return `hoody-${slug || 'key'}${tag ? `-${tag}` : ''}`;
}
