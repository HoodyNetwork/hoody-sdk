/**
 * Hoody response-signature helpers.
 *
 * These utilities make `X-Hoody-Signature` easy to consume from SDK callers:
 * - extract a signature header from Response/Headers/plain objects
 * - parse and validate the header into typed fields
 * - cryptographically verify the Ed25519 signature against the canonical
 *   signed message (`<t>\n<m>\n<s>\n<path>\n<body>`) and the caller-provided
 *   public key
 *
 * Hoody API currently emits:
 *   t=<unix_ts>,kid=<key_id>,m=<method>,s=<status>,path=<url_path>,sig=<hex>
 *
 * Canonical signed message (matches the Hoody API response signer):
 *   `${t}\n${method}\n${statusCode}\n${path}\n${body}`
 *
 * Note:
 * - `m`/`s` are optional in the parser for forward/backward compatibility with
 *   older servers that omit them, but BOTH are required for `verifyHoodySignatureHeader`
 *   because they are part of the canonical signed payload.
 * - `sig` is expected to be a 64-byte ED25519 signature in hex (128 chars)
 */
export interface HoodySignatureHeader {
    /** Original header value as received from the server */
    raw: string;
    /** Unix timestamp (`t`) */
    timestamp: number;
    /** Signing key identifier (`kid`) */
    keyId: string;
    /** Signed request URL path (`path`) */
    path: string;
    /** Detached ED25519 signature hex (`sig`) */
    signatureHex: string;
    /** Optional signed HTTP method (`m`) */
    method?: string;
    /** Optional signed HTTP status code (`s`) */
    statusCode?: number;
    /** Lower-cased key/value map parsed from the header */
    fields: Record<string, string>;
}
export type HoodySignatureHeaderCarrier = Headers | Response | {
    headers?: Headers | Record<string, unknown> | undefined;
} | Record<string, unknown>;
/**
 * Extract `X-Hoody-Signature` from Response/Headers/plain header maps.
 */
export declare function getHoodySignatureHeader(source: HoodySignatureHeaderCarrier): string | undefined;
/**
 * Parse and validate a Hoody signature header value.
 *
 * @throws Error when required fields are missing or malformed.
 */
export declare function parseHoodySignatureHeader(rawHeader: string): HoodySignatureHeader;
/**
 * Extract + parse `X-Hoody-Signature` in one step.
 * Returns `undefined` when the header does not exist.
 */
export declare function parseHoodySignatureFrom(source: HoodySignatureHeaderCarrier): HoodySignatureHeader | undefined;
export interface VerifyHoodySignatureOptions {
    /**
     * Reject signatures whose `t` (timestamp, seconds) is older than this many
     * seconds from "now" (local clock). Default 300s (5 minutes). Pass
     * `Number.POSITIVE_INFINITY` to disable freshness enforcement (useful when
     * verifying archived responses). The verifier ALSO rejects timestamps too
     * far in the future by the same tolerance.
     */
    maxSkewSeconds?: number;
    /** Override the "now" used for freshness. Unix seconds. Default `Date.now()/1000`. */
    now?: number;
    /**
     * Optional allowlist of expected `kid` values. If provided, the verifier
     * rejects signatures whose `kid` is not in the set — useful for locking a
     * consumer to a specific pubkey rotation generation. Case-sensitive.
     */
    allowedKeyIds?: readonly string[] | ReadonlySet<string>;
}
export interface VerifyHoodySignatureInput {
    /** HTTP method of the ORIGINAL request (case-sensitive; will be compared to `header.method`). */
    method: string;
    /** HTTP status of the RESPONSE (integer 100-599). */
    statusCode: number;
    /** Full request URL path the server saw (including querystring). */
    path: string;
    /** Response body bytes, as the server sent them. Accept string (UTF-8) or raw bytes. */
    body: string | Uint8Array;
    /** Caller-provided 32-byte Ed25519 public key. */
    publicKey: Uint8Array;
}
/**
 * Cryptographically verify a parsed `X-Hoody-Signature` against the response
 * that carried it. Returns `true` on success, `false` on any failure (bad sig,
 * mismatched method/status/path, stale timestamp, wrong kid, malformed inputs).
 *
 * Throws only when the caller's own inputs are structurally invalid (wrong
 * pubkey length, non-integer status, etc.) — a server-sent bad signature
 * returns `false`, never throws.
 *
 * The canonical signed message is:
 *   `${header.timestamp}\n${header.method}\n${header.statusCode}\n${header.path}\n${bodyUtf8}`
 * where `header.method`/`statusCode`/`path` MUST equal the caller-provided
 * `input.method`/`statusCode`/`path` — the verifier rejects a mismatch to
 * prevent cross-method/path/status replay.
 */
export declare function verifyHoodySignatureHeader(header: HoodySignatureHeader, input: VerifyHoodySignatureInput, options?: VerifyHoodySignatureOptions): boolean;
/**
 * Convenience: extract the header from a Response/Headers/plain object,
 * parse it, and verify. Returns `false` if the header is absent or malformed.
 * Never throws for server-sent data — only for structurally-invalid caller input.
 */
export declare function verifyHoodySignatureFrom(source: HoodySignatureHeaderCarrier, input: VerifyHoodySignatureInput, options?: VerifyHoodySignatureOptions): boolean;
