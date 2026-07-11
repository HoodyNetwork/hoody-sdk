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
export declare function parseLocalTarget(input: string): LocalTarget;
/**
 * Parse --port flag for tunnel commands.
 * Accepts: number, "random", "0", undefined/empty → all return 0 for auto-assign.
 */
export declare function parseContainerPort(input: string | undefined): number;
