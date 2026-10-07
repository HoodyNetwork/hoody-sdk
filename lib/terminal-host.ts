/**
 * Terminal host labels that stay legal DNS names.
 *
 * A terminal is addressed by the index in its host label,
 * `<projectId>-<containerId>-terminal-<N>`: the containers proxy takes
 * `terminal_id` from that index and overwrites whatever the query carries, so
 * the index is the only way to pick a session. With two 24-character ids the
 * label is 59 characters plus the digits of N, and a DNS label holds 63: every
 * id from 10000 up (all ephemeral sessions are 40000-65535) made a 64-character
 * label that no resolver accepts.
 *
 * The proxy also answers to the short alias `t` for the terminal kit
 * (`<projectId>-<containerId>-t-<N>`, 57 characters at five digits), with the
 * same index handling. These helpers keep the familiar `terminal-<N>` label
 * whenever it fits and switch to `t-<N>` only when it does not.
 *
 * Browser-safe: no Node imports.
 */

/** Longest DNS label (RFC 1035 §2.3.4). */
export const MAX_DNS_LABEL_LENGTH = 63;

const TERMINAL_SEGMENT = 'terminal';
/** The containers proxy's short alias for the terminal kit. */
const TERMINAL_SHORT_SEGMENT = 't';

/**
 * Host label of terminal `index` in a container: `…-terminal-<index>` when
 * that is a legal DNS label, `…-t-<index>` otherwise.
 */
export function terminalHostLabel(projectId: string, containerId: string, index: number | string): string {
  const long = `${projectId}-${containerId}-${TERMINAL_SEGMENT}-${index}`;
  if (long.length <= MAX_DNS_LABEL_LENGTH) return long;
  return `${projectId}-${containerId}-${TERMINAL_SHORT_SEGMENT}-${index}`;
}

/**
 * The same rule for a URL (or bare host) that is already built: when its first
 * host label ends in `-terminal-<digits>` and is too long for DNS, that suffix
 * becomes `-t-<digits>`. Anything else is returned unchanged, so it is safe to
 * run over every kit URL.
 */
export function fitTerminalHost(url: string): string {
  const match = /^([a-z][a-z0-9+.-]*:\/\/)?([^./?#:]+)(.*)$/i.exec(url);
  if (!match) return url;
  const [, scheme = '', label = '', rest = ''] = match;
  if (label.length <= MAX_DNS_LABEL_LENGTH) return url;
  const short = label.replace(/-terminal-(\d+)$/, `-${TERMINAL_SHORT_SEGMENT}-$1`);
  return short === label ? url : `${scheme}${short}${rest}`;
}
