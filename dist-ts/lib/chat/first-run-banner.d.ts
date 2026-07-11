/**
 * first-run-banner — one-time "storage defaults" hint shown before the
 * FIRST interactive REPL prompt ever. Gated by a zero-byte marker file.
 *
 * Shown ONLY when:
 *   - process.stdout is a TTY (interactive session)
 *   - ~/.hoody/chats/.seen-privacy-banner does NOT exist
 *
 * After display, the marker file is created so the banner never shows
 * again for this user. The marker is a UX gate, NOT a privacy guarantee
 * — privacy is enforced by `--private` / `HOODY_CHAT_PRIVATE=1` / `/private`.
 */
export declare function hasSeenBanner(): boolean;
export interface ShowBannerOptions {
    /** Writable stream to emit to (defaults to process.stdout). */
    out?: NodeJS.WritableStream;
    /** Force-show even if marker exists (unit-test use). */
    force?: boolean;
    /** Caller's interactivity verdict (stdin && stdout TTY). When false, the
     *  banner is suppressed AND the marker is NOT written — stops a piped
     *  invocation from claiming the first-run slot. Defaults to out.isTTY for
     *  back-compat. */
    isInteractive?: boolean;
}
/**
 * Show the banner if we haven't before. After showing, write the marker.
 * Safe to call unconditionally — the gate is internal.
 */
export declare function showBannerIfNeeded(opts?: ShowBannerOptions): Promise<boolean>;
/** Unit-test helper: returns banner text without side-effects. */
export declare function getBannerText(): string;
