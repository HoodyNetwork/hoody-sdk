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

export function parseLocalTarget(input: string): LocalTarget {
  const raw = input.trim();
  if (!raw) {
    throw new Error('Target is required. Examples: 8080, :8080, 127.0.0.1:8080, localhost:3000');
  }

  // Reject URL-style userinfo "user:pass@host:port" — the last-colon split
  // below would otherwise silently absorb the credentials into the host
  // string and forward them downstream.
  if (raw.includes('@')) {
    throw new Error(
      `Target must not contain userinfo. Credentials in URLs are not supported. Got: "${raw}"`,
    );
  }

  // Pure number: "8080"
  if (/^\d+$/.test(raw)) {
    const port = parseInt(raw, 10);
    validatePort(port);
    return { host: '127.0.0.1', port };
  }

  // Leading colon: ":8080"
  if (raw.startsWith(':')) {
    const port = parseInt(raw.slice(1), 10);
    validatePort(port);
    return { host: '127.0.0.1', port };
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
  throw new Error(
    `Cannot parse target "${raw}". A port is required. Examples: 8080, localhost:3000, 10.0.0.1:8080`
  );
}

function validatePort(port: number): void {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid port: ${port}. Must be 1-65535.`);
  }
}

/**
 * Parse --port flag for tunnel commands.
 * Accepts: number, "random", "0", undefined/empty → all return 0 for auto-assign.
 */
export function parseContainerPort(input: string | undefined): number {
  if (input === undefined || input === '' || input === 'random' || input === 'auto') {
    return 0;
  }
  const port = parseInt(input, 10);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`Invalid container port: ${input}. Use a number 0-65535 or "random".`);
  }
  return port;
}
