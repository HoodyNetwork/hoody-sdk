/**
 * Smart parser for local target strings used by tunnel expose/pull.
 *
 * Accepts:
 *   8080            → { host: '127.0.0.1', port: 8080 }
 *   :8080           → { host: '127.0.0.1', port: 8080 }
 *   127.0.0.1:8080  → { host: '127.0.0.1', port: 8080 }
 *   localhost:3000   → { host: 'localhost', port: 3000 }
 *   example.com:443  → { host: 'example.com', port: 443 }
 *   [::1]:8080       → { host: '::1', port: 8080 }
 */

export interface LocalTarget {
  host: string;
  port: number;
}

// Every message below is a constant: none repeats any part of the target, which may hold a credential.

/** A target carrying userinfo, literal ('@') or percent-encoded ('%40'). */
const TARGET_USERINFO_REFUSAL =
  'Target must not contain userinfo (user@ or user:password@). Credentials in URLs are not supported. Give host:port only.';
const TARGET_FORMAT_REFUSAL =
  'Cannot parse target. A port is required. Examples: 8080, :8080, localhost:3000, 10.0.0.1:8080, [::1]:8080';
const INVALID_PORT = 'Invalid port. Must be 1-65535.';

/** Userinfo, literal or percent-encoded. */
const USERINFO_RE = /@|%40/i;
/** Whitespace or a control character inside the target (the ends are trimmed first). */
const SPACE_OR_CONTROL_RE = /[\s\p{Cc}]/u;

/**
 * Parse a local tunnel target: `<port>`, `:<port>`, `<host>:<port>` or `[<ipv6>]:<port>`. A target
 * with no host means `127.0.0.1`. Throws for an empty string, a target carrying `user@` (or `%40`),
 * a scheme, whitespace, an invalid port, or anything else that does not fit one of those forms. No
 * message repeats the input.
 */
export function parseLocalTarget(input: string): LocalTarget {
  const raw = input.trim();
  if (!raw) {
    throw new Error('Target is required. Examples: 8080, :8080, 127.0.0.1:8080, localhost:3000');
  }

  // Reject URL-style userinfo "user:pass@host:port", literal or percent-encoded
  // — the last-colon split below would otherwise silently absorb the
  // credentials into the host string and forward them downstream.
  if (USERINFO_RE.test(raw)) {
    throw new Error(TARGET_USERINFO_REFUSAL);
  }

  // Pure number: "8080"
  if (/^\d+$/.test(raw)) {
    const port = parseInt(raw, 10);
    validatePort(port);
    return { host: '127.0.0.1', port };
  }

  // Leading colon: ":8080" (digits only: ":8080junk" is refused, not read as 8080)
  if (raw.startsWith(':')) {
    const portStr = raw.slice(1);
    if (!/^\d+$/.test(portStr)) {
      throw new Error(INVALID_PORT);
    }
    const port = parseInt(portStr, 10);
    validatePort(port);
    return { host: '127.0.0.1', port };
  }

  // The forms below carry a host: no accepted host holds a scheme ("http://host:80"
  // is not a target here), whitespace or a control character.
  if (raw.includes('://') || SPACE_OR_CONTROL_RE.test(raw)) {
    throw new Error(TARGET_FORMAT_REFUSAL);
  }

  // IPv6 bracket notation: "[::1]:8080"
  const ipv6Match = raw.match(/^\[([^\]]+)\]:(\d+)$/);
  if (ipv6Match) {
    const host = ipv6Match[1]!;
    const port = parseInt(ipv6Match[2]!, 10);
    validatePort(port);
    return { host, port };
  }

  // host:port — split on LAST colon (handles IPv4 and domains)
  const lastColon = raw.lastIndexOf(':');
  if (lastColon > 0) {
    const host = raw.slice(0, lastColon);
    const portStr = raw.slice(lastColon + 1);
    if (/^\d+$/.test(portStr)) {
      const port = parseInt(portStr, 10);
      validatePort(port);
      return { host, port };
    }
  }

  // Bare hostname without port — not valid, port is required
  throw new Error(TARGET_FORMAT_REFUSAL);
}

function validatePort(port: number): void {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(INVALID_PORT);
  }
}

/**
 * Parse --port flag for tunnel commands.
 * Accepts: number, "random", "0", undefined/empty → all return 0 for auto-assign.
 */
export function parseComputerPort(input: string | undefined): number {
  if (input === undefined || input === '' || input === 'random' || input === 'auto') {
    return 0;
  }
  const port = parseInt(input, 10);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`Invalid computer port: ${input}. Use a number 0-65535 or "random".`);
  }
  return port;
}
