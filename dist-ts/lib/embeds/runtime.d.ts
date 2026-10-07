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
export declare class EmbedValidationError extends ValidationError {
    readonly code: EmbedErrorCode;
    constructor(code: EmbedErrorCode, message: string, field?: string);
}
type Scalar = string | number | boolean;
export type EmbedParamValue = Scalar | ReadonlyArray<string | number> | Record<string, unknown>;
export type EmbedQuery = Record<string, Scalar | ReadonlyArray<string>>;
/**
 * A container as hoody-api returns it, or hand-built. The server name is `server_name`, else `server`: a string
 * when hand-built, the server-details object (`{ name, country, … }`) in a `containers.list` item.
 */
export interface EmbedContainerTarget {
    id?: string;
    project_id?: string;
    server_name?: string | null;
    server?: string | {
        name?: string | null;
    } | null;
}
/** A ProxyAlias as hoody-api returns it. The alias `url` is the origin; hoody-api computes it. */
export interface EmbedAliasTarget {
    alias: string;
    program: string;
    index: number;
    url: string | null;
    target_path?: string | null;
}
export type EmbedTarget = EmbedContainerTarget | EmbedAliasTarget;
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
    /** The containers domain. When omitted it is derived from `baseUrl` (see deriveContainersDomain). */
    containersDomain?: string;
    /** The API base URL the containers domain is derived from. */
    baseUrl?: string;
    /**
     * The SDK's `getKitUrl`. When given, the host of a container target comes from it, so a client's own
     * domain configuration applies. It returns a bare origin, `scheme://host[:port]` (http or https, a trailing / is
     * allowed); a user name or password, a path, a query or a fragment is refused (TARGET_INVALID).
     */
    getKitUrl?: (kit: string, container: EmbedContainerTarget, opts: {
        serviceIndex?: number;
        port?: number;
    }) => string;
}
type CatalogT = typeof EMBEDS_CATALOG;
/** A deep copy of the construction catalog. */
export declare function getEmbedCatalog(): CatalogT;
/**
 * The containers domain for an API base URL, by the same ordered branches as the SDK client: IPv4, IPv6,
 * `localhost` and `*.localhost` hosts are kept; `containers.*` is kept; a 24-hex realm label before `.api.`
 * is replaced; `api.` becomes `containers.`; the first `.api.` becomes `.containers.`; otherwise
 * `containers.` is prepended. No or an unparseable base URL gives `containers.hoody.com`.
 */
export declare function deriveContainersDomain(baseUrl?: string): string;
/**
 * Build the URL of one kit UI view.
 *
 * @param kit    kit slug, e.g. `terminal`, `files`, `notifications`
 * @param target a container (`id`, `project_id`, `server_name`) or a ProxyAlias
 * @param opts   view, index, typed params and passthrough query
 * @param ctx    containers domain, API base URL, or the SDK's getKitUrl
 */
export declare function buildEmbedUrl(kit: string, target: EmbedTarget, opts?: EmbedBuildOptions, ctx?: EmbedBuildContext): string;
/** The view ids of a kit, default first. */
export declare function listEmbedViews(kit: string): string[];
export {};
