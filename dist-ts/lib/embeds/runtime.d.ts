/**
 * Embed URL runtime: builds the URL of any Hoody kit UI view from the generated embeds table.
 *
 * Every rule here is data in the table (the same object the public construction catalog publishes): the
 * view path, which params a view accepts and how each is validated and serialized, the index bounds, the
 * alias class. This module only interprets it. It is browser-safe: no Node APIs.
 *
 * Refusals are never silent. A param the table marks forced, excluded, non-UI or unsupported is refused
 * with a code; an index outside the published bounds is refused rather than clamped; `local: true` is
 * refused because several kit UIs only work at the host root.
 */
import { ValidationError } from '../../generated/errors.js';
import { EMBEDS_CATALOG } from '../../generated/embeds.generated.js';
export type EmbedErrorCode = 'KIT_UNKNOWN' | 'KIT_NOT_BUILDABLE' | 'VIEW_UNKNOWN' | 'LOCAL_REFUSED' | 'INDEX_OUT_OF_RANGE' | 'INDEX_NOT_SUPPORTED' | 'PORT_INVALID' | 'TARGET_INVALID' | 'ALIAS_URL_MISSING' | 'ALIAS_MISMATCH' | 'ALIAS_VIEW_UNSUPPORTED' | 'ALIAS_TARGET_PATH_CONFLICT' | 'PARAM_UNKNOWN' | 'PARAM_FORCED' | 'PARAM_EXCLUDED' | 'PARAM_NON_UI' | 'PARAM_DEAD' | 'PARAM_NOT_ON_VIEW' | 'PARAM_NOT_TYPED' | 'QUERY_NOT_PASSTHROUGH' | 'DUPLICATE_KEY' | 'CONST_OVERRIDE' | 'REQUIRED_MISSING' | 'VALUE_INVALID' | 'PATH_INVALID' | 'HOST_LABEL_TOO_LONG';
/**
 * Thrown when an embed request cannot be turned into a URL. `code` names the rule that refused it; the message
 * starts with the same code, and `field` names the offending parameter when there is one.
 */
export declare class EmbedValidationError extends ValidationError {
    readonly code: EmbedErrorCode;
    constructor(code: EmbedErrorCode, message: string, field?: string);
}
type Scalar = string | number | boolean;
export type EmbedParamValue = Scalar | ReadonlyArray<string | number> | Record<string, unknown>;
export type EmbedQuery = Record<string, Scalar | ReadonlyArray<string>>;
/**
 * A computer as the API returns it, or hand-built. The server name is `server_name`, else a string `server` a
 * caller built by hand. `server_name` is the routing host (for a computer on a subserver, its PARENT server). The
 * server-details object (`{ name, country, … }`) of a `computers.list` item names the slice, which the proxy does
 * not serve, so its `name` is never a host: a target with no `server_name` and no string `server` is refused.
 */
export interface EmbedComputerTarget {
    id?: string;
    project_id?: string;
    server_name?: string | null;
    server?: string | {
        name?: string | null;
    } | null;
}
/** A ProxyAlias as the API returns it. The alias `url` is the origin; the API computes it. */
export interface EmbedAliasTarget {
    alias: string;
    program: string;
    index: number;
    url: string | null;
    target_path?: string | null;
}
export type EmbedTarget = EmbedComputerTarget | EmbedAliasTarget;
export interface EmbedBuildOptions {
    /** View name within the kit (`session`), or omitted for the kit's default view. */
    view?: string;
    /** Service index, 1 or more. Defaults to 1. */
    index?: number;
    /** Port, for the http and https user-content kits. */
    port?: number;
    /** Typed params (path params included), by param id. */
    params?: Record<string, EmbedParamValue | undefined>;
    /** Passthrough params by wire name, in the order they should appear; any key on a user-content view. */
    query?: EmbedQuery;
    /** Refused: see the module comment. */
    local?: boolean;
}
export interface EmbedBuildContext {
    /** The computers domain. When omitted it is derived from `baseUrl` (see deriveComputersDomain). */
    computersDomain?: string;
    /** The API base URL the computers domain is derived from. */
    baseUrl?: string;
    /**
     * The SDK's `getKitUrl`. When given, the host of a computer target comes from it, so a client's own
     * domain configuration applies. It returns a bare origin, `scheme://host[:port]` (http or https, a trailing / is
     * allowed); a user name or password, a path, a query or a fragment is refused (TARGET_INVALID).
     */
    getKitUrl?: (kit: string, computer: EmbedComputerTarget, opts: {
        serviceIndex?: number;
        port?: number;
    }) => string;
}
type CatalogT = typeof EMBEDS_CATALOG;
/** A deep copy of the construction catalog. */
export declare function getEmbedCatalog(): CatalogT;
/**
 * The computers domain for an API base URL: lib/domain-utils.ts computersDomainFor(), the one derivation the SDK
 * client, the CLI client and the kitAuth middleware share (its doc lists the ordered branches). An IP address
 * base URL gives the address itself, and buildEmbedUrl refuses it; pass `computersDomain` instead.
 */
export declare function deriveComputersDomain(baseUrl?: string): string;
/**
 * Build the URL of one kit UI view.
 *
 * @param kit    kit slug, e.g. `terminal`, `files`, `notifications`
 * @param target a computer (`id`, `project_id`, `server_name`) or a ProxyAlias
 * @param opts   view, index, typed params and passthrough query
 * @param ctx    computers domain, API base URL, or the SDK's getKitUrl
 */
export declare function buildEmbedUrl(kit: string, target: EmbedTarget, opts?: EmbedBuildOptions, ctx?: EmbedBuildContext): string;
/** The view ids of a kit, default first. */
export declare function listEmbedViews(kit: string): string[];
export {};
