/**
 * redact — secret pattern detection for on-disk writes.
 *
 * SECRET_PATTERNS detects common secret shapes (API keys, tokens, private
 * keys, connection strings) and redacts them before any on-disk write, so the
 * local redaction matches the Hoody chat service's own detection.
 *
 * Plus a sanitizeArgv-style pass that replaces values following sensitive
 * CLI flags (`--token`, `--password`, `--username`, …) with `<REDACTED>`.
 *
 * Applied to:
 *   - Session JSONL turn content AND meta-line title (derived from first
 *     user message).
 *   - REPL readline history file.
 *   - HOODY_CHAT_DEBUG=1 stderr output.
 *
 * Known residuals: base64-wrapped secrets, secrets split across multiple
 * turns, novel token shapes not in the pattern set, non-ASCII tokens.
 * In-memory API history keeps raw text so the LLM still sees what the
 * user typed, except Bot URL key secrets: service-client.ts removes those
 * from the question and history before they are sent, and the renderer
 * removes them from answers (redactBotKeys).
 */

import { redactBotKeys as redactBotKeyValues, maskChallengeLinks } from '../redact.js';

// Common secret-shape patterns, kept in sync with the Hoody chat service.
export const SECRET_PATTERNS: readonly RegExp[] = Object.freeze([
  // Real Hoody token shape is hdy_<24hex>_<48hex> — the `_` separator (and JWT
  // base64url `-`) are NOT in [a-zA-Z0-9], so the old class stopped at the first
  // underscore and left the high-entropy second half in the clear. Match the full value.
  /hdy_[A-Za-z0-9_-]{20,}/,
  /sk-[a-zA-Z0-9_\-]{20,}/,
  /Bearer\s+[a-zA-Z0-9._\-]{20,}/i,
  // A JWT: a run of token characters holding `eyJ` and 30 more before a dot, then 10 or more.
  // Matched once per run (the left boundary), not once per `eyJ`, so the scan is linear.
  /(?<![A-Za-z0-9_-])(?=[A-Za-z0-9_-]*?eyJ[A-Za-z0-9_-]{30})[A-Za-z0-9_-]*\.[A-Za-z0-9_-]{10,}/,
  /[0-9a-fA-F]{65,}/,
  /ghp_[a-zA-Z0-9]{30,}/,
  /gho_[a-zA-Z0-9]{30,}/,
  /github_pat_[a-zA-Z0-9_]{20,}/,
  /glpat-[a-zA-Z0-9\-_]{20,}/,
  /AKIA[A-Z0-9]{16}/,
  // AWS STS temporary session credentials (sts:AssumeRole, EC2 instance roles,
  // Lambda execution roles). Structurally identical suffix to AKIA; different prefix.
  /ASIA[A-Z0-9]{16}/,
  /xox[bpras]-[a-zA-Z0-9\-]{20,}/,
  // Bot URL key secret (BOT_KEY_VALUE_RE): group 1, the 12-character prefix
  // that `key_prefix` shows, stays in front of the placeholder.
  /(hbk_[A-Za-z0-9]{8})[A-Za-z0-9]{35}/,
]);

/**
 * Sensitive flag names — value following any of these is redacted.
 * MUST match the shared argv sanitizer's sensitive set verbatim so the two
 * code paths agree on which flag values to redact. Parity is locked by
 * a dedicated unit test.
 */
export const SENSITIVE_FLAGS: ReadonlySet<string> = new Set([
  // Authentication — user-facing CLI flags the chat surface can observe.
  '--token', '-t', '--password', '-p', '--username', '-u',
  // The generated CLI reference carries these credential flags in its
  // instruction corpus; without redaction, raw values persist in on-disk
  // session logs.
  '--api-key', '--api-secret', '--private-key', '--secret-access-key',
  '--access-key', '--access-key-id', '--session-token',
  '--bearer', '--bearer-token', '--auth-token', '--auth', '--authorization',
  '--refresh-token', '--client-secret', '--client-id',
  '--kit-token', '--kit-token-header', '--kit-password', '--kit-pass',
  '--passphrase', '--pass',
  '--webhook', '--webhook-url',
  // Terminal / tunnel flags that carry inline credentials.
  '--ssh-password', '--ssh-pass', '--ssh-key', '--ssh-keyfile',
  '--socks5-pass', '--socks5-password',
  '--proxy-password', '--proxy-pass', '--proxy-auth',
  '--auth-password', '--auth-pass',
  '--cur-password', '--cur-pass',
  '--db-password', '--db-pass',
  '--local-password',
  // hoody exec remote: the script token.
  '--remote-token',
  // A proxy URL can carry `user:pass@`; the JWT signing key; cookies and one-time codes.
  '--proxy', '--secret', '--cookie', '--otp', '--otp-code',
  // Credentials whose name does not end in a credential word: a private key's PEM, the header
  // that carries --auth-token, an SSE-C key, comment write tokens, session cookies.
  '--key-pem', '--auth-header', '--sse-customer-key-base64', '--comments-tokens', '--cookies',
  // `hoody signup --challenge <token>.<secret>`: carries on with a browser check.
  '--challenge',
]);

/**
 * Switches (no value) whose name ends in a credential word: the last-word rule of isSensitiveFlag
 * would take the NEXT token, a command word or an operand, for their value. A test walks the
 * generated commands' option declarations and fails on a switch the rule matches that is not here.
 */
const NON_VALUE_FLAGS: ReadonlySet<string> = new Set([
  '--ask-password', '--client-credentials', '--comments-cors-credentials', '--env-auth',
  '--exclude-creds', '--persist-credentials', '--pin-host-key', '--print-token', '--v2-auth',
  '--allow-ephemeral-token',
]);

// Matches the shared argv sanitizer literal for consistency across both redaction paths.
export const REDACTED = '<REDACTED>';

/**
 * A flag name whose LAST word names a credential (`--access-token`, `--request-auth-password`,
 * `--sse-customer-key`, `--service-account-credentials`). The last word only: `--token-file` and
 * `--remote-token-file` take a path, and `--tokenize` is not a credential at all.
 */
const SECRET_FLAG_NAME_RE = /(?:^|-)(?:token|secret|pass|passwd|password|passphrase|pwd|key|apikey|creds?|credentials?|otp|otp-code|cookie|bearer|auth|authorization)$/;

/** `--kitToken`, `--kit_token`, `--KIT-TOKEN` → `--kit-token`. */
function kebabFlag(flag: string): string {
  const dashes = /^-+/.exec(flag)?.[0] ?? '';
  const name = flag.slice(dashes.length).replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/_/g, '-').toLowerCase();
  return dashes + name;
}

/**
 * Whether the value of `flag` (the name only, no `=value`) is a secret: the flag is in `names` as
 * typed or in its kebab-case spelling, or it is a long flag whose last word names a credential.
 * A `--no-…` negation never takes a value.
 */
export function isSensitiveFlag(flag: string, names: ReadonlySet<string> = SENSITIVE_FLAGS): boolean {
  if (names.has(flag)) return true;
  if (!flag.startsWith('--')) return false;
  const kebab = kebabFlag(flag);
  if (names.has(kebab)) return true;
  if (NON_VALUE_FLAGS.has(kebab)) return false;
  const name = kebab.slice(2);
  return !name.startsWith('no-') && SECRET_FLAG_NAME_RE.test(name);
}

/** A config key (`token`, `kitToken`, `auth.refresh_token`) whose value is a credential: its last word names one. */
function isSecretKeyName(key: string): boolean {
  const leaf = key.split('.').pop() ?? '';
  if (!/^[A-Za-z][\w-]*$/.test(leaf)) return false;
  return SECRET_FLAG_NAME_RE.test(kebabFlag(leaf));
}

/** The last word of a key that names a credential (`API_KEY`, `"password"`, `refreshToken`). */
const SECRET_KEY_WORD = '(?:token|secret|passwd|password|passphrase|pwd|key|creds?|credentials?|otp|cookies?|bearer|auth|authorization)';
/**
 * `KEY=value`, `"password":"x"`, `?api_key=x` inside one token: the value goes when the key's last
 * word names a credential. A quoted value may hold escaped quotes (`"alpha\"omega"`).
 */
const KEYED_SECRET_RE = new RegExp(
  `((?:^|[\\s,;&{?"'])["']?[A-Za-z0-9_.-]*?${SECRET_KEY_WORD}["']?\\s*[=:]\\s*)("(?:[^"\\\\]|\\\\.)*"|'(?:[^'\\\\]|\\\\.)*'|[^\\s,;&}"']+)`,
  'gi',
);
const SECRET_JSON_KEY_RE = new RegExp(`${SECRET_KEY_WORD}$`, 'i');
/** `scheme://user:pass@host` and `scheme://token@host`. The scheme is bounded, so the scan stays linear. */
const URL_USERINFO_RE = /([a-z][a-z0-9+.-]{0,31}:\/\/)[^\s/?#@]+@/gi;

/** A parsed JSON value with every value under a credential-named key replaced, and every string redacted. */
function redactJsonValue(value: unknown): unknown {
  if (typeof value === 'string') return redactValueShapes(value);
  if (Array.isArray(value)) return value.map(redactJsonValue);
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = SECRET_JSON_KEY_RE.test(k) ? REDACTED : redactJsonValue(v);
    return out;
  }
  return value;
}

/**
 * The secrets a single token can carry whatever flag it follows: URL credentials, keyed values
 * (`API_KEY=x`, `{"password":"x"}`) and the SECRET_PATTERNS shapes. A token that is a JSON object
 * or array is parsed, so a value with escaped quotes goes whole; it comes back re-serialised when
 * something in it was redacted, and byte-unchanged otherwise.
 */
export function redactValueShapes(token: string): string {
  if (!token) return token;
  const lead = token.trimStart()[0];
  if (lead === '{' || lead === '[') {
    try {
      const parsed: unknown = JSON.parse(token);
      const redacted = JSON.stringify(redactJsonValue(parsed));
      // Nothing redacted: the token as typed (a re-serialisation rewrites 10.50, 1e3, escapes, big ints).
      return redactSecrets(redacted === JSON.stringify(parsed) ? token : redacted);
    } catch {
      // Not JSON: the keyed pattern below still applies.
    }
  }
  return redactSecrets(
    token
      .replace(URL_USERINFO_RE, `$1${REDACTED}@`)
      .replace(KEYED_SECRET_RE, (_m, head: string) => `${head}${REDACTED}`),
  );
}

export interface RedactArgvOptions {
  /**
   * After `set <key>` where the key names a credential (`config set token X`, `confg set kitToken X`),
   * which positionals are the value: every later one (`rest`, a command line: options may sit
   * between) or the next one only (`one`, prose).
   */
  setValue?: 'rest' | 'one';
  /**
   * Which `set` starts that rule: any (`any`, a command line, where a mistyped group still counts)
   * or only one right after `config` (`config`, prose: "how do I set key bindings" is not a command).
   */
  setAfter?: 'any' | 'config';
}

/**
 * Redact an argv-like array (one command line, no `--` payload handling): the value after a
 * sensitive flag (`--token V`, `--kitToken V`, `-vt V`), the value inside one (`--token=V`,
 * `-tV`, `-vtV`), the value of `set <credential key>` (`config set token V`), and the shapes
 * {@link redactValueShapes} knows in every other token. Short flags in `names` (`-t`, `-p`, `-u`)
 * are matched inside a cluster too: Commander reads `-vtS` as `-v -t S`.
 */
export function redactArgvTokens(
  argv: readonly string[],
  names: ReadonlySet<string> = SENSITIVE_FLAGS,
  options: RedactArgvOptions = {},
): string[] {
  const shorts = new Set<string>();
  for (const s of names) if (/^-[^-]$/.test(s)) shorts.add(s[1]!);
  const setSpan = options.setValue ?? 'rest';
  const setAfter = options.setAfter ?? 'any';
  let nextIsSecret = false;
  /** `set` seen (1), then a credential key (2): the positionals after it are its value. */
  let setState = 0;
  let prevWord = '';
  return argv.map((arg) => {
    if (nextIsSecret) {
      nextIsSecret = false;
      return REDACTED;
    }
    if (arg.startsWith('--') && arg.length > 2) {
      const eq = arg.indexOf('=');
      const name = eq === -1 ? arg : arg.slice(0, eq);
      if (isSensitiveFlag(name, names)) {
        if (eq === -1) {
          nextIsSecret = true;
          return arg;
        }
        return `${name}=${REDACTED}`;
      }
      return eq === -1 ? arg : `${name}=${redactValueShapes(arg.slice(eq + 1))}`;
    }
    if (arg.length >= 2 && arg[0] === '-' && arg[1] !== '-') {
      // A short flag or a cluster of them: the first sensitive short takes the rest of the token
      // as its value, or the next token when it ends the cluster.
      for (let i = 1; i < arg.length; i++) {
        if (!shorts.has(arg[i]!)) continue;
        if (i === arg.length - 1) {
          nextIsSecret = true;
          return arg;
        }
        return `${arg.slice(0, i + 1)}${arg[i + 1] === '=' ? '=' : ''}${REDACTED}`;
      }
      return arg;
    }
    // A positional.
    if (setState === 2) {
      if (setSpan === 'one') setState = 0;
      return REDACTED;
    }
    if (setState === 1 && isSecretKeyName(arg)) {
      setState = 2;
      return arg;
    }
    setState = arg.toLowerCase() === 'set' && (setAfter === 'any' || prevWord === 'config') ? 1 : 0;
    prevWord = arg.toLowerCase();
    return redactValueShapes(arg);
  });
}

/**
 * Apply SECRET_PATTERNS to a string. Every match of every pattern (regardless
 * of original flags) is found in the original text and the matches are
 * replaced together: applied one after another, an earlier pattern could cut a
 * later match apart (an AWS key id inside a Bot key's body left the key's last
 * characters in the clear). Overlapping matches merge into one placeholder; a
 * merged run that starts with a match's group 1 (a Bot key prefix) keeps it.
 */
export function redactSecrets(text: string): string {
  if (!text) return text;
  const spans: Array<{ start: number; end: number; keep: number }> = [];
  for (const p of SECRET_PATTERNS) {
    const flags = p.flags.includes('g') ? p.flags : p.flags + 'g';
    for (const m of text.matchAll(new RegExp(p.source, flags))) {
      const start = m.index ?? 0;
      spans.push({ start, end: start + m[0].length, keep: typeof m[1] === 'string' ? m[1].length : 0 });
    }
  }
  spans.sort((a, b) => a.start - b.start || b.end - a.end);
  let out = '';
  let pos = 0;
  for (let i = 0; i < spans.length; ) {
    const run = { ...spans[i]! };
    for (i++; i < spans.length && spans[i]!.start < run.end; i++) run.end = Math.max(run.end, spans[i]!.end);
    out += text.slice(pos, run.start + run.keep) + REDACTED;
    pos = run.end;
  }
  return out + text.slice(pos);
}

/** Replace Bot URL key secrets only, keeping the 12-character prefix. */
export function redactBotKeys(text: string): string {
  return redactBotKeyValues(text, REDACTED);
}

/**
 * Redact values that follow sensitive CLI flags. Input is an argv-like array
 * (e.g., from process.argv); returns a new array with the value immediately
 * after any sensitive flag replaced. Matches the shared argv sanitizer semantics.
 *
 * Handles both forms:
 *   - Space-separated:  `--token VALUE`   → VALUE replaced with <REDACTED>
 *   - Equals-joined:    `--token=VALUE`   → whole arg replaced with `--token=<REDACTED>`
 * plus spelling variants, short clusters and value shapes (redactArgvTokens).
 */
export function redactArgv(argv: readonly string[]): string[] {
  return redactArgvTokens(argv);
}

/**
 * Redact content that is about to be written to disk: the SECRET_PATTERNS pass over the whole text
 * first (its `Bearer <token>` pattern spans two words), then the command-line pass of
 * {@link redactArgvTokens} over the words (a flag's value, a short cluster, `config set <credential
 * key>` and the value shapes), with the text's own whitespace kept, then SECRET_PATTERNS again.
 */
export function redactForDisk(text: string): string {
  if (!text) return text;
  // Words and the whitespace between them, alternating; only the words are redacted.
  const parts = redactSecrets(text).split(/(\s+)/);
  const at: number[] = [];
  for (let i = 0; i < parts.length; i += 2) if (parts[i] !== '') at.push(i);
  const words = redactArgvTokens(at.map((i) => parts[i]!), SENSITIVE_FLAGS, { setValue: 'one', setAfter: 'config' });
  at.forEach((i, k) => { parts[i] = words[k]!; });
  // A signup check link (`…/auth/challenge#<token>.<secret>`) opens the check: its fragment goes too.
  return maskChallengeLinks(redactSecrets(parts.join('')));
}
