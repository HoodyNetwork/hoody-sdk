// The SSH public key check shared by Get a computer, Copy and the SSH key drawer (the same rule the
// Keys page applies): a private key is refused first and never sent or shown again; then the format.
// One public key is ONE line: the type, the body, then at most a comment, to the end of the text (the Keys page's rule).
const KEY_RE =
  /^(ssh-ed25519|ssh-rsa|ecdsa-sha2-nistp(256|384|521))[ \t]+AAAA[A-Za-z0-9+/]+={0,3}([ \t][^\r\n\v\f\u0085\u2028\u2029]*)?$/;
// A comment holding a run of 64+ key body characters is a private key line joined onto the public one (OpenSSH writes
// 70 per line, PEM 64). Shorter runs are real comments: a SHA256: fingerprint, 40 hex, a path, a long CamelCase name.
const COMMENT_BODY_RE = /^\S+[ \t]+\S+[ \t].*[A-Za-z0-9+/=]{64,}/;
const PRIVATE_RE = /PRIVATE KEY|PuTTY-User-Key-File|b3BlbnNzaC1rZXktdjE/i;
// Every character that ends a line; a public key type; a run of key body (40 or more base64 characters).
const LINE_END_RE = /[\r\n\v\f\u0085\u2028\u2029]+/;
const PUBLIC_LINE_RE = /^\s*(ssh-ed25519|ssh-rsa|ecdsa-sha2-nistp(256|384|521))[ \t]+AAAA/;
const BODY_RE = /[A-Za-z0-9+/=]{40,}/;

// What blobTail answers when the text ends inside the blob: the start of a key, being typed or cut short.
const CUT = -1;
const CERT = '-cert-v01@openssh.com';
// The ECDSA point of each curve (uncompressed, as OpenSSH writes it).
const POINT = new Map([
  ['ecdsa-sha2-nistp256', 65],
  ['ecdsa-sha2-nistp384', 97],
  ['ecdsa-sha2-nistp521', 133],
]);

// The key body read as the SSH wire blob of its type: the type string, then that type's fields (ed25519: 32 bytes;
// rsa: e, n; ecdsa: curve name, point; and the types this page does not take: dss: p, q, g, y; a security key's:
// its key, then the application; a certificate of an accepted type: nonce, key, serial, type, id, principals, validity,
// options, extensions, reserved, signing key, signature). Returns the bytes left after them; CUT when the text ends
// inside a field it could still complete; null when the fields do not decode. A real public key leaves nothing; a
// private key body glued onto it leaves a lot.
function blobTail(type: string, body: string): number | null {
  // Base64 without its padding; one stray character past the last whole group is not decoded and counts as left.
  const plain = body.replace(/=+$/, '');
  const whole = plain.length % 4 === 1 ? plain.length - 1 : plain.length;
  let bin: string;
  try {
    bin = atob(plain.slice(0, whole));
  } catch {
    return null;
  }
  const ENDS = new Error('ends');
  const BAD = new Error('bad');
  let o = 0;
  const take = (n: number): void => {
    if (o + n > bin.length) throw ENDS;
    o += n;
  };
  const size = (): number => {
    take(4);
    return ((bin.charCodeAt(o - 4) * 256 + bin.charCodeAt(o - 3)) * 256 + bin.charCodeAt(o - 2)) * 256 + bin.charCodeAt(o - 1);
  };
  // A field of at most `max` bytes, or of exactly `max` with `exact`.
  const field = (max: number, exact = false): void => {
    const n = size();
    if (n > max || (exact && n !== max)) throw BAD;
    take(n);
  };
  // A field holding exactly `text`; a cut one must be its start.
  const is = (text: string): void => {
    const n = size();
    if (n !== text.length || !text.startsWith(bin.slice(o, o + n))) throw BAD;
    take(n);
  };
  const key = (t: string): void => {
    if (t === 'ssh-ed25519') field(32, true);
    else if (t === 'ssh-rsa') {
      field(64);
      field(2049);
    } else if (t === 'ssh-dss') {
      field(1025);
      field(33);
      field(1025);
      field(1025);
    } else if (t === 'sk-ssh-ed25519@openssh.com') {
      field(32, true);
      field(255);
    } else if (t === 'sk-ecdsa-sha2-nistp256@openssh.com') {
      is('nistp256');
      field(65, true);
      field(255);
    } else {
      const point = POINT.get(t);
      if (point === undefined) throw BAD;
      is(t.slice('ecdsa-sha2-'.length));
      field(point, true);
    }
  };
  try {
    is(type);
    if (type.endsWith(CERT)) {
      const base = type.slice(0, -CERT.length);
      if (base !== 'ssh-ed25519' && base !== 'ssh-rsa' && !POINT.has(base)) throw BAD;
      field(64);
      key(base);
      take(12);
      field(4096);
      field(65536);
      take(16);
      field(65536);
      field(65536);
      field(65536);
      field(8192);
      field(8192);
    } else key(type);
  } catch (e) {
    return e === ENDS ? CUT : null;
  }
  return bin.length - o + (plain.length - whole);
}

export type SshCheck = { ok: true; key: string } | { ok: false; code: 'empty' | 'private' | 'notkey' };

/**
 * A private key is refused first; then the format: exactly one public key line (blank lines around it are dropped).
 * Text with a further line is never sent: "private" when a further line holds a key body that is not a public key
 * line's (a private key pasted under its .pub line, with no BEGIN line), else "notkey".
 */
export function checkSshKey(text: unknown): SshCheck {
  const key = typeof text === 'string' ? text.trim() : '';
  if (!key) return { ok: false, code: 'empty' };
  if (PRIVATE_RE.test(key)) return { ok: false, code: 'private' };
  if (!KEY_RE.test(key)) {
    const [, ...more] = key.split(LINE_END_RE);
    return { ok: false, code: more.some((l) => BODY_RE.test(l) && !PUBLIC_LINE_RE.test(l)) ? 'private' : 'notkey' };
  }
  if (COMMENT_BODY_RE.test(key)) return { ok: false, code: 'private' };
  const [type = '', body = ''] = key.split(/[ \t]+/);
  const tail = blobTail(type, body);
  if (tail !== null && tail >= 30) return { ok: false, code: 'private' };
  if (tail !== null && tail > 0) return { ok: false, code: 'notkey' };
  return { ok: true, key };
}

// What a public key line starts with (KEY_RE's types).
const PUBLIC_STARTS = ['ssh-ed25519', 'ssh-rsa', 'ecdsa-sha2-nistp'];
// The public key types this page does not take (a security key's, DSA; a certificate of a KEY_RE type already starts
// as its type). A line of those is not a private key: it stays in the box and the check answers "notkey". Whole
// names: nothing may be glued onto one.
const OTHER_TYPES = ['ssh-dss', 'sk-ssh-ed25519@openssh.com', 'sk-ecdsa-sha2-nistp256@openssh.com'];
// The first word of a line, then what follows it. Every public key body starts AAAA (the length of its type name).
const TYPED_RE = /^\S+\s+(\S+)/;
// A key line in its parts: what stands before the type, the type, the body, the rest. At the start of a line any
// first word is read as the type; behind an options prefix (authorized_keys style) only a whole type name is one.
const KEY_LINE_RE = /^(\s*)(\S+)\s+(AAAA\S*)(.*)$/;
const OPTIONS_LINE_RE =
  /^(.*?[ \t])(ssh-ed25519|ssh-rsa|ecdsa-sha2-nistp(?:256|384|521)|ssh-dss|sk-ssh-ed25519@openssh\.com|sk-ecdsa-sha2-nistp256@openssh\.com)[ \t]+(AAAA\S*)(.*)$/;
// A key body in its parts: the base64 run with its padding, then whatever is glued onto it (a quote, more text).
const BODY_PARTS_RE = /^([A-Za-z0-9+/]*={0,3})(.*)$/;
// A run of key body no comment holds (COMMENT_BODY_RE's bound): a private key's line joined onto a public key line.
const JOINED_RE = /[A-Za-z0-9+/=]{64,}/;

/**
 * True while `text` can still become a public key line: empty, a public key type, or the start of one being typed.
 * Once a body follows the type it must be a public key's (AAAA…).
 */
export function startsLikePublicKey(text: string): boolean {
  const t = text.trimStart();
  if (t === '') return true;
  const [word = ''] = t.split(/\s/, 1);
  if (!PUBLIC_STARTS.some((p) => p.startsWith(t) || t.startsWith(p)) && !OTHER_TYPES.some((p) => p.startsWith(t) || p === word)) return false;
  const body = TYPED_RE.exec(t)?.[1];
  return body === undefined || 'AAAA'.startsWith(body) || body.startsWith('AAAA');
}

/**
 * Text the SSH key drawer's box must not keep on screen (the Keys page's rule): a private key, or what may be part of
 * one. Any text with the armour words; a long base64 run in text that does not start as a public key line; `strict`
 * (the box has already refused a private key): anything that does not start as a public key line; under a public key
 * line, the same two rules for every further line. A public key line of a type this page does not take, or behind an
 * options prefix, is not private: it stays, for the check to answer; with a long run of key body after its own body
 * (a private key's lines joined onto it in a one-line field) it is refused.
 */
export function secretLike(text: string, strict: boolean): boolean {
  if (PRIVATE_RE.test(text)) return true;
  const kept = (line: string): boolean => keyLine(line) || !(strict || BODY_RE.test(line));
  const [first = '', ...more] = text.trimStart().split(LINE_END_RE);
  return !kept(first) || more.some((line) => line.trim() !== '' && !kept(line));
}

// A line the box keeps as a key line: it starts as one, or is one behind an options prefix, and no key body stands
// on it beyond the public key's own. No 40+ run of key body before the type or glued onto the body (after its padding,
// a quote or any other character); after it no 40+ run either, except on an accepted key at the start of its line,
// whose comment keeps what the check takes (a run under 64: a fingerprint, 40 hex, a long path or name). The body itself must
// be proven a public key's: read as its type's wire blob it leaves under 30 bytes (40 characters). A body that does
// not decode is not proven: kept only while it holds no 40+ run (as before this check knew any blob). A body that
// ends inside its blob is the start of a key: kept for an accepted type at the start of its line (typed, or the
// field still filling), else judged like one that does not decode. With no key body yet (a type being typed) the line
// holds no run of key body at all.
function keyLine(line: string): boolean {
  const own = startsLikePublicKey(line);
  const m = (own ? KEY_LINE_RE : OPTIONS_LINE_RE).exec(line);
  if (!m) return own && !BODY_RE.test(line);
  const [, before = '', type = '', body = '', rest = ''] = m;
  const [, lead = '', glued = ''] = BODY_PARTS_RE.exec(body) ?? [];
  const accepted = own && PUBLIC_LINE_RE.test(line);
  if (BODY_RE.test(before) || BODY_RE.test(glued) || (accepted ? JOINED_RE : BODY_RE).test(rest)) return false;
  const tail = blobTail(type, lead);
  if (tail === CUT && accepted) return true;
  if (tail === null || tail === CUT) return !BODY_RE.test(lead);
  return tail < 30;
}
