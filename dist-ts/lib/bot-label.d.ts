/**
 * The public Bot label rule, shared by every component:
 * plain ASCII a-z, 0-9 and single hyphens, 8–48 bytes, a letter first, a letter or
 * digit last, never two hyphens in a row. The input is checked as given and never
 * repaired: no lowercasing, trimming, Unicode or punycode normalization first.
 * Browser-safe. Maintained in lib/, not generated.
 *
 * A Bot host is `<label>.<zone>`, where the zone is one this module accepts: `hoody.bot`,
 * the Bot zone of a platform the caller names, or a zone the caller names explicitly. It
 * is an allow-list, not "the first label is the label": a client sends a Bot key to the
 * URL's host, so a lookalike host is refused instead of trusted by its shape.
 *
 * Platform zones come from botZoneFor(), a first-match chain with no map literal: production
 * first, then a zone written relative to the platform it is given. A platform with no Bot
 * zone gives none (a unit test checks the answers).
 *
 * The step rules below are the contract's lookahead-free form; the contract's
 * label-vectors.json is the oracle (a unit test runs every vector).
 */
/** The production Bot zone: production Bot URLs are `https://<label>.hoody.bot`. */
export declare const BOT_URL_ZONE = "hoody.bot";
/** True when `label` is a valid public Bot label. */
export declare function isValidBotLabel(label: unknown): label is string;
/**
 * True when `zone` passes the Bot zone grammar: lowercase ASCII, two or
 * more dot-separated labels of 1–63 bytes (a-z, 0-9 and inner hyphens), the last one
 * holding a letter and not `0x` plus hex digits (so never an IP address, `0x7f.0x1`
 * included), no trailing dot, at most 200 bytes.
 */
export declare function isValidBotZone(zone: unknown): zone is string;
/**
 * The Bot zone of a platform domain, or undefined when the platform has
 * none. Kept as a first-match chain, production first, with the second zone written
 * relative to the platform: never turn it into a map or a literal list.
 */
export declare function botZoneFor(platform: unknown): string | undefined;
/**
 * The zones accepted without an explicit zone: `hoody.bot` plus the Bot zone of
 * `platform`, each once. The default platform is the SDK's own, DEFAULT_PLATFORM_DOMAIN.
 * A platform with no Bot zone of its own accepts `hoody.bot` alone.
 */
export declare function botUrlZones(platform?: unknown): string[];
/**
 * The label of a Bot host (`<label>.<zone>`, optionally `:443`) when `host` is exactly
 * that for the given zone, else undefined: the edge's Host rule,
 * compared byte for byte. A zone that fails the grammar matches nothing.
 */
export declare function botLabelOfHost(host: string, zone: string): string | undefined;
/** Options for botLabelOfUrl. */
export interface BotLabelOfUrlOptions {
    /**
     * The platform domain whose Bot zone is accepted besides `hoody.bot` (for example the
     * domain of the account's API base URL). Default: the SDK's own platform domain. A
     * platform with no Bot zone adds nothing.
     */
    platform?: string;
    /**
     * One more Bot zone to accept (for example a test platform's). It adds to the list and
     * never replaces it; a zone that fails the grammar makes every URL fail.
     */
    zone?: string;
}
/**
 * The label of a public Bot URL as typed (`https://<label>.<zone>`, optionally with
 * `:443` and one trailing `/`, the zone one of botUrlZones(options.platform) or
 * `options.zone`), or undefined when the string is not one. Checked on the raw string:
 * an uppercase host is refused, not lowercased.
 */
export declare function botLabelOfUrl(url: string, options?: BotLabelOfUrlOptions): string | undefined;
