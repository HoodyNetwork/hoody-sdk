/**
 * endpoint-accept — normalized-origin acceptance for non-default LLM and
 * docs-tool endpoints.
 *
 * Stores accepted origins at ~/.hoody/chats/chat-accept.json so the user only
 * confirms a non-allowlisted origin once. Atomic write via fs.open(path,
 * 'wx', 0o600) + rename; parent dir prepared by prepareChatsDir.
 *
 * Built-in allowlist (no prompt needed, always accepted):
 *   - chatbot.hoody.com         (docs-chatbot service)
 *   - localhost / 127.0.0.1 / ::1 / RFC1918 (local/LAN endpoints)
 *
 * For any other origin, a caller must pass `--accept-endpoint <origin>`
 * or set `HOODY_CHAT_ACCEPT_ENDPOINT` env. In TTY mode, a prompt is
 * offered. In non-TTY, the request is refused.
 */
/**
 * Built-in origins that never require user acceptance. Stored as already-normalized
 * origins (scheme + lowercase host + non-default port).
 */
export declare const BUILTIN_ACCEPTED_ORIGINS: ReadonlySet<string>;
export interface AcceptFileEntry {
    acceptedAt: string;
    from: 'tty-prompt' | 'flag' | 'env';
}
export interface AcceptFile {
    origins: Record<string, AcceptFileEntry>;
}
/** Compute the path to the per-user accept file. */
export declare function acceptFilePath(): string;
/**
 * Read the accept file if it exists. Returns an empty record on:
 *   - file missing
 *   - malformed JSON
 *   - unexpected shape
 * (Never crashes chat over a corrupted preferences file.)
 */
export declare function readAcceptFile(): Promise<AcceptFile>;
export type AcceptanceStatus = {
    status: 'ok';
    origin: string;
    reason: 'builtin' | 'local' | 'file' | 'flag' | 'env' | 'prompt';
} | {
    status: 'needs-tty-prompt';
    origin: string;
} | {
    status: 'refused';
    origin: string;
    reason: string;
};
/**
 * Check whether a given raw URL is accepted.
 *
 *   1. Normalize to an origin. Invalid URL → refused.
 *   2. Local/RFC1918 → ok (no prompt).
 *   3. Built-in allowlist → ok.
 *   4. Accept file → ok.
 *   5. `flag` override (from `--accept-endpoint`) matches this origin → ok,
 *      and persist to the accept file.
 *   6. `env` override matches → ok, persist.
 *   7. In TTY: status 'needs-tty-prompt' (caller must prompt and re-invoke
 *      confirmAcceptance()).
 *   8. Non-TTY: refused with actionable message.
 */
export declare function checkAcceptance(rawUrl: string, opts?: {
    flagValue?: string | undefined;
    envValue?: string | undefined;
    isTty?: boolean | undefined;
    /**
     * Private-mode / session-only contract: SKIP reading ~/.hoody/chats/chat-accept.json
     * AND skip all recordAcceptance() writes for flag/env match paths. Built-in
     * allowlist + local/RFC1918 + flag/env still pass as 'ok' (in-memory only).
     */
    sessionOnly?: boolean | undefined;
}): Promise<AcceptanceStatus>;
/** Called after a TTY prompt resolves to "y" — persist and return ok. */
export declare function confirmAcceptance(origin: string): Promise<AcceptanceStatus>;
