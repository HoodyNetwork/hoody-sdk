/**
 * `client.embeds`: the embed URL builder on a HoodyClient.
 *
 * Every URL comes from the generic runtime (`./runtime.ts`), which interprets the generated embeds table.
 * This module only binds it to a client:
 *  - the host of a container target comes from the client's own `getKitUrl`, so `embeds` and `getKitUrl`
 *    cannot disagree on the host format or the containers domain;
 *  - on a `withContainer()` client the target may be omitted and the scoped container is used; an
 *    unscoped client refuses a missing target;
 *  - one typed function per view (`client.embeds.files.editor(target, opts)`), plus the untyped
 *    `client.embeds.url(kit, target, opts)`.
 *
 * Browser-safe, like the runtime: no Node APIs, and no runtime import of the client class. The entry
 * points attach it with `patchEmbedsPrototype(HoodyClient)`.
 */
import type { HoodyClient } from '../hoody-client.js';
import {
  buildEmbedUrl,
  getEmbedCatalog,
  listEmbedViews,
  EmbedValidationError,
  type EmbedBuildOptions,
  type EmbedContainerTarget,
  type EmbedTarget,
} from './runtime.js';
import {
  makeEmbedWrappers,
  type EmbedsCatalog,
  type EmbedViewId,
  type EmbedWrapperOptions,
  type EmbedWrappers,
} from '../../generated/embeds.generated.js';

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
  getKitUrl(kit: string, container: EmbedContainerTarget, opts: { serviceIndex?: number; port?: number }): string;
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

/**
 * The container a `withContainer()` client is scoped to. The generated client keeps it only as the URL
 * template variables it gives every kit namespace (all set from the one container), so it is read from
 * there. Several different identities, or none, mean the client is not scoped to one container.
 */
function scopedContainer(host: EmbedsHost): EmbedContainerTarget | undefined {
  const templates = (host as { urlTemplates?: Record<string, Record<string, unknown> | undefined> }).urlTemplates;
  if (templates === undefined || templates === null) return undefined;
  let found: EmbedContainerTarget | undefined;
  for (const vars of Object.values(templates)) {
    if (vars === undefined || vars === null) continue;
    const id = vars.containerId;
    const projectId = vars.projectId;
    const server = vars.serverName ?? vars.server;
    if (typeof id !== 'string' || typeof projectId !== 'string' || typeof server !== 'string') continue;
    if (id === '' || projectId === '' || server === '') continue;
    if (found !== undefined && (found.id !== id || found.project_id !== projectId || found.server_name !== server)) return undefined;
    found = { id, project_id: projectId, server_name: server };
  }
  return found;
}

/** Build the `embeds` object for one client. */
export function createEmbeds(host: EmbedsHost): HoodyEmbeds {
  const ctx = {
    getKitUrl: (kit: string, container: EmbedContainerTarget, opts: { serviceIndex?: number; port?: number }) =>
      host.getKitUrl(kit, container, opts),
  };

  const resolveTarget = (target: EmbedTargetArg): EmbedTarget => {
    if (target !== undefined && target !== null) return target;
    const scoped = scopedContainer(host);
    if (scoped === undefined) {
      throw new EmbedValidationError(
        'TARGET_INVALID',
        'this client is not scoped to one container: pass a container or a ProxyAlias, or call withContainer() first',
        'target',
      );
    }
    return scoped;
  };

  const url = (kit: string, target?: EmbedTargetArg, opts: EmbedBuildOptions = {}): string =>
    buildEmbedUrl(kit, resolveTarget(target), opts, ctx);

  const build = (viewId: EmbedViewId, target: EmbedTargetArg, opts: EmbedWrapperOptions<EmbedViewId>): string => {
    const dot = viewId.indexOf('.');
    // The view comes from the wrapper that was called, never from the caller's options.
    return url(viewId.slice(0, dot), target, { ...(opts as EmbedBuildOptions), view: viewId.slice(dot + 1) });
  };

  return Object.assign(makeEmbedWrappers<EmbedTargetArg>(build), {
    url,
    catalog: (): EmbedsCatalog => getEmbedCatalog(),
    views: (kit: string): string[] => listEmbedViews(kit),
  });
}

const EMBEDS_BY_CLIENT = new WeakMap<object, HoodyEmbeds>();

/**
 * Define `embeds` on the HoodyClient prototype: a getter, built once per client instance. A getter
 * rather than a constructor field, because withContainer()/withRealm() promote instances by prototype
 * swap and no constructor runs for them. Calling it again redefines the same getter over the same
 * per-instance cache, so both entry points may call it.
 */
export function patchEmbedsPrototype(HoodyClientClass: { prototype: unknown }): void {
  const prototype = HoodyClientClass.prototype as Record<string | symbol, unknown>;
  Object.defineProperty(prototype, 'embeds', {
    configurable: true,
    enumerable: false,
    get(this: HoodyClient): HoodyEmbeds {
      let embeds = EMBEDS_BY_CLIENT.get(this);
      if (embeds === undefined) {
        embeds = createEmbeds(this as unknown as EmbedsHost);
        EMBEDS_BY_CLIENT.set(this, embeds);
      }
      return embeds;
    },
  });
}
