import { type EmbedBuildOptions, type EmbedContainerTarget, type EmbedTarget } from './runtime.js';
import { type EmbedsCatalog, type EmbedWrappers } from '../../generated/embeds.generated.js';
/** A container or ProxyAlias; omitted (or null) on a `withContainer()` client. */
export type EmbedTargetArg = EmbedTarget | null | undefined | void;
/** The `client.embeds` object. */
export type HoodyEmbeds = EmbedWrappers<EmbedTargetArg> & {
    /**
     * Build the URL of any view by kit slug: `url('files', container, { view: 'editor', params: { path } })`.
     * The view defaults to the kit's default view.
     */
    url(kit: string, target?: EmbedTargetArg, opts?: EmbedBuildOptions): string;
    /** A deep copy of the construction catalog. */
    catalog(): EmbedsCatalog;
    /** The view ids of a kit, default first. */
    views(kit: string): string[];
};
/** What `createEmbeds` needs from a client: `getKitUrl` and, for scoping, its URL template variables. */
export interface EmbedsHost {
    getKitUrl(kit: string, container: EmbedContainerTarget, opts: {
        serviceIndex?: number;
        port?: number;
    }): string;
}
declare module '../hoody-client.js' {
    interface HoodyClient {
        /**
         * Embed URLs for every Hoody kit UI view: `client.embeds.terminal.session(container, { params })`.
         * On a `withContainer()` client the target may be omitted.
         */
        readonly embeds: HoodyEmbeds;
    }
}
/** Build the `embeds` object for one client. */
export declare function createEmbeds(host: EmbedsHost): HoodyEmbeds;
/**
 * Define `embeds` on the HoodyClient prototype: a getter, built once per client instance. A getter
 * rather than a constructor field, because withContainer()/withRealm() promote instances by prototype
 * swap and no constructor runs for them. Calling it again redefines the same getter over the same
 * per-instance cache, so both entry points may call it.
 */
export declare function patchEmbedsPrototype(HoodyClientClass: {
    prototype: unknown;
}): void;
