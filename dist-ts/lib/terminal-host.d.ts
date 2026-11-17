/**
 * Terminal host labels that stay legal DNS names.
 *
 * A terminal is addressed by the index in its host label,
 * `<projectId>-<computerId>-terminal-<N>`: the computers proxy takes
 * `terminal_id` from that index and overwrites whatever the query carries, so
 * the index is the only way to pick a session. With two 24-character ids the
 * label is 59 characters plus the digits of N, and a DNS label holds 63: an
 * id from 10000 up makes a 64-character label that no resolver accepts.
 *
 * The terminal kit now starts sessions only in 1-9999 (ephemeral ones in
 * 5001-7999), so every current id fits `terminal-<N>`. Kits from before that
 * change gave ephemeral sessions ids in 40000-65535. For those, these helpers
 * still switch to the proxy's short alias `t` (`<projectId>-<computerId>-t-<N>`,
 * 57 characters at five digits) so the host stays a legal DNS name; a proxy
 * that enforces the 1-9999 bound refuses such an index under either label
 * (404 SERVICE_INDEX_OUT_OF_RANGE).
 *
 * Browser-safe: no Node imports.
 */
/** Longest DNS label (RFC 1035 §2.3.4). */
export declare const MAX_DNS_LABEL_LENGTH = 63;
/**
 * Host label of terminal `index` in a computer: `…-terminal-<index>` when
 * that is a legal DNS label, `…-t-<index>` otherwise.
 */
export declare function terminalHostLabel(projectId: string, computerId: string, index: number | string): string;
/**
 * The same rule for a URL (or bare host) that is already built: when its first
 * host label ends in `-terminal-<digits>` and is too long for DNS, that suffix
 * becomes `-t-<digits>`. Anything else is returned unchanged, so it is safe to
 * run over every kit URL.
 */
export declare function fitTerminalHost(url: string): string;
