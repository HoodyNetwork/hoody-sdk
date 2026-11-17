// The SSH key tab's rules. The key is a
// container field (PUT /computers/:id {ssh_public_key} on the realm host); there is no account-level SSH key.
//
// Rules kept: nothing that is not a plausible public key leaves the page (a private key least of all, checked
// first); one change per computer at a time; a write for a computer the Hub no longer shows is refused before
// sending; an unknown outcome reads the computer back and never resends.
// One public key is ONE line: the type, the body, then at most a comment, to the end of the text. Nothing may follow
// on a further line (a second key, or the body of a private key pasted under its .pub line).
const KEY_RE =
  /^(ssh-ed25519|ssh-rsa|ecdsa-sha2-nistp(256|384|521))[ \t]+AAAA[A-Za-z0-9+/]+={0,3}([ \t][^\r\n\v\f\u0085\u2028\u2029]*)?$/;
// Every character that ends a line.
const LINE_END_RE = /[\r\n\v\f\u0085\u2028\u2029]+/;
// A comment holding a run of 64+ key body characters is a private key line joined onto the public one (OpenSSH writes
// 70 per line, PEM 64). Shorter runs are real comments: a SHA256: fingerprint, 40 hex, a path, a long CamelCase name.
const COMMENT_BODY_RE = /^\S+[ \t]+\S+[ \t].*[A-Za-z0-9+/=]{64,}/;
const PRIVATE_RE = /PRIVATE KEY|PuTTY-User-Key-File|b3BlbnNzaC1rZXktdjE/i;
const HOST_RE = /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i;

// The key body read as the SSH wire blob of its type: the type string, then that type's fields (ed25519: 32 bytes;
// rsa: e, n; ecdsa: curve name, point). Returns the bytes left after them, or null when the fields do not decode (a
// made-up body: judged as before). A real public key leaves nothing; a private key body glued onto it leaves a lot.
function blobTail(type: string, body: string): number | null {
  // Decode the longest whole-group prefix: a glued tail that breaks base64 (a cut or a stray '=') still counts.
  const plain = body.replace(/=+$/, "");
  const cut = plain.length - (plain.length % 4);
  let bin: string;
  try {
    bin = atob(plain.slice(0, cut));
  } catch {
    return null;
  }
  const extra = plain.length - cut;
  let o = 0;
  const field = (): string | null => {
    if (o + 4 > bin.length) return null;
    const n = bin.charCodeAt(o) * 16777216 + bin.charCodeAt(o + 1) * 65536 + bin.charCodeAt(o + 2) * 256 + bin.charCodeAt(o + 3);
    o += 4;
    if (n > bin.length - o) return null;
    o += n;
    return bin.slice(o - n, o);
  };
  if (field() !== type) return null;
  if (type === "ssh-ed25519") {
    if (field()?.length !== 32) return null;
  } else if (type === "ssh-rsa") {
    if (field() === null || field() === null) return null;
  } else if (field() !== type.slice("ecdsa-sha2-".length) || field() === null) return null;
  return bin.length - o + extra;
}

export type SshCheck =
  | { ok: true; key: string }
  | { ok: false; code: "empty" | "private" | "notkey" };

/**
 * A private key is refused first and never sent or shown again; then the format: exactly one public key line (blank
 * lines around it are dropped). Text with a further line is never sent: it is "private" when a further line may be
 * part of a private key (secretLike), else "notkey" (two public keys, a note under the key).
 */
export function checkSshKey(text: unknown): SshCheck {
  const key = typeof text === "string" ? text.trim() : "";
  if (!key) return { ok: false, code: "empty" };
  if (PRIVATE_RE.test(key)) return { ok: false, code: "private" };
  if (!KEY_RE.test(key)) return { ok: false, code: LINE_END_RE.test(key) && secretLike(key, false) ? "private" : "notkey" };
  if (COMMENT_BODY_RE.test(key)) return { ok: false, code: "private" };
  const [type = "", body = ""] = key.split(/[ \t]+/);
  const tail = blobTail(type, body);
  if (tail !== null && tail >= 30) return { ok: false, code: "private" };
  if (tail) return { ok: false, code: "notkey" };
  return { ok: true, key };
}

// What a public key line starts with (KEY_RE's types).
const PUBLIC_STARTS = ["ssh-ed25519", "ssh-rsa", "ecdsa-sha2-nistp"];
// A run of key body: 40 or more base64 characters with nothing between them.
const BODY_RE = /[A-Za-z0-9+/=]{40,}/;

// A public key type, then what follows it on its line. Every public key body starts AAAA (the length of its type name).
const TYPED_RE = /^(?:ssh-ed25519|ssh-rsa|ecdsa-sha2-nistp(?:256|384|521))[ \t]+([^ \t\r\n]+)/;

/**
 * True while `text` can still become a public key line: empty, a public key type, or the start of one being typed.
 * Once a body follows the type it must be a public key's (AAAA…): a private key body typed or pasted after a public
 * key type does not start like a public key.
 */
export function startsLikePublicKey(text: string): boolean {
  const t = text.trimStart();
  if (t === "") return true;
  if (!PUBLIC_STARTS.some((p) => p.startsWith(t) || t.startsWith(p))) return false;
  const body = TYPED_RE.exec(t)?.[1];
  return body === undefined || "AAAA".startsWith(body) || body.startsWith("AAAA");
}

/**
 * Text the key box must not keep on screen: a private key, or what may be part of one. A terminal without bracketed
 * paste delivers a paste as typed characters, in pieces: the armour line is refused by its words, but the pieces
 * after it (or a body pasted with no BEGIN line) hold no such word.
 * - any text with the armour words;
 * - a long base64 run in text that does not start as a public key line;
 * - `strict` (the box has already refused a private key): anything that does not start as a public key line;
 * - under a public key line, the same two rules for every further line: a .pub line does not cover a private key
 *   body pasted below it.
 */
export function secretLike(text: string, strict: boolean): boolean {
  if (PRIVATE_RE.test(text)) return true;
  if (!startsLikePublicKey(text)) return strict || BODY_RE.test(text);
  const [, ...more] = text.trimStart().split(LINE_END_RE);
  return more.some((line) => line.trim() !== "" && !startsLikePublicKey(line) && (strict || BODY_RE.test(line)));
}

export interface SshDisplay {
  /** The comment, cleaned and at most 24 characters; null when there is none. */
  name: string | null;
  /** The algorithm and the TAIL of the body: its head is a per-algorithm constant and identifies nothing. */
  detail: string;
}

/** Comment-first display of a public key, with control and bidi characters stripped. null for anything else. */
export function sshKeyDisplay(key: unknown): SshDisplay | null {
  if (typeof key !== "string") return null;
  const parts = key.trim().split(/\s+/);
  if (parts.length < 2 || !parts[1]) return null;
  const algo = parts[0] as string;
  const body = parts[1];
  const tail = body.length > 8 ? `…${body.slice(-8)}` : body;
  let name: string | null = null;
  if (parts.length > 2) {
    const comment = parts
      .slice(2)
      .join(" ")
      // C0 controls and DEL, then bidi and directional formatting characters.
      .replace(/[\u0000-\u001F\u007F]/g, "")
      .replace(/[‎‏‪-‮⁦-⁩]/g, "")
      .trim();
    if (comment)
      name = comment.length > 24 ? `${comment.slice(0, 21)}…` : comment;
  }
  return { name, detail: `${algo} ${tail}` };
}

/** The host to connect to, only when it is a plain host name. */
export function sshHost(host: unknown): string {
  return typeof host === "string" && HOST_RE.test(host) ? host : "";
}

/** A key as the server may store it: the algorithm and the base64 body (the comment and spacing left out). */
export function keyBody(key: string | null | undefined): string | null {
  const parts = typeof key === "string" ? key.trim().split(/\s+/) : [];
  return parts.length >= 2 && parts[0] && parts[1] ? `${parts[0]} ${parts[1]}` : null;
}

/** The read-back after an unknown outcome: did the computer end up holding what was sent? (want null = removed.)
 *  Only the algorithm and body count: a server that drops the comment or spacing still holds the key sent. */
export function applied(
  read: string | null | undefined,
  want: string | null,
): boolean {
  const now = typeof read === "string" && read.trim() ? read : null;
  if (now === null || want === null) return now === want;
  return now.trim() === want.trim() || keyBody(now) === keyBody(want);
}

/**
 * A short print of a public key, the identity of a change under the shared `computer.ssh_key` lock: the same
 * function as computers/data.ts keyPrint (both pages record and prove each other's changes with it). Not a
 * secret's protection: a public key is not secret; the print only tells changes apart. '' and null are 'none'.
 */
export function keyPrint(key: string | null | undefined): string {
  const k = (key ?? "").trim();
  if (!k) return "none";
  let h = 0x811c9dc5;
  for (let n = 0; n < k.length; n++)
    h = Math.imul(h ^ k.charCodeAt(n), 0x01000193) >>> 0;
  return h.toString(16);
}
