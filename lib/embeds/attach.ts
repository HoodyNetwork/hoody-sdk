/**
 * `client.embeds`: the embed URL builder on a HoodyClient.
 *
 * Every URL comes from the generic runtime (`./runtime.ts`), which interprets the generated embeds table.
 * This module only binds it to a client:
 *  - the host of a computer target comes from the client's own `getKitUrl`, so `embeds` and `getKitUrl`
 *    cannot disagree on the host format or the computers domain;
 *  - on a `withComputer()` client the target may be omitted and the scoped computer is used; an
 *    unscoped client refuses a missing target;
 *  - one typed function per view (`client.embeds.files.editor(target, opts)`), plus the untyped
 *    `client.embeds.getUrl(kit, target, opts)`.
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
  type EmbedComputerTarget,
  type EmbedTarget,
} from './runtime.js';
import {
  makeEmbedWrappers,
  type EmbedsCatalog,
  type EmbedViewId,
  type EmbedWrapperOptions,
  type EmbedWrappers,
} from '../../generated/embeds.generated.js';

/** A computer or ProxyAlias; omitted (or null) on a `withComputer()` client. */
export type EmbedTargetArg = EmbedTarget | null | undefined | void;

/** The `client.embeds` object. */
export type HoodyEmbeds = EmbedWrappers<EmbedTargetArg> & {
  /**
   * Build the URL of any view by kit slug: `getUrl('files', computer, { view: 'editor', params: { path } })`.
   * The view defaults to the kit's default view.
   */
  getUrl(kit: string, target?: EmbedTargetArg, opts?: EmbedBuildOptions): string;
  /** A deep copy of the construction catalog. */
  getCatalog(): EmbedsCatalog;
  /** The view ids of a kit, default first. */
  listViews(kit: string): string[];
};

/** What `createEmbeds` needs from a client: `getKitUrl` and, for scoping, its URL template variables. */
export interface EmbedsHost {
  getKitUrl(kit: string, computer: EmbedComputerTarget, opts: { serviceIndex?: number; port?: number }): string;
}

declare module '../hoody-client.js' {
  interface HoodyClient {
    /**
     * Embed URLs for every Hoody kit UI view: `client.embeds.terminal.session(computer, { params })`.
     * On a `withComputer()` client the target may be omitted.
     */
    readonly embeds: HoodyEmbeds;
  }
}

/**
 * The computer a `withComputer()` client is scoped to. The generated client keeps it only as the URL
 * template variables it gives every kit namespace (all set from the one computer), so it is read from
 * there. Several different identities, or none, mean the client is not scoped to one computer.
 */
function scopedComputer(host: EmbedsHost): EmbedComputerTarget | undefined {
  const templates = (host as { urlTemplates?: Record<string, Record<string, unknown> | undefined> }).urlTemplates;
  if (templates === undefined || templates === null) return undefined;
  let found: EmbedComputerTarget | undefined;
  for (const vars of Object.values(templates)) {
    if (vars === undefined || vars === null) continue;
    const id = vars.computerId;
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
    getKitUrl: (kit: string, computer: EmbedComputerTarget, opts: { serviceIndex?: number; port?: number }) =>
      host.getKitUrl(kit, computer, opts),
  };

  const resolveTarget = (target: EmbedTargetArg): EmbedTarget => {
    if (target !== undefined && target !== null) return target;
    const scoped = scopedComputer(host);
    if (scoped === undefined) {
      throw new EmbedValidationError(
        'TARGET_INVALID',
        'this client is not scoped to one computer: pass a computer or a ProxyAlias, or call withComputer() first',
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
    getUrl: url,
    getCatalog: (): EmbedsCatalog => getEmbedCatalog(),
    listViews: (kit: string): string[] => listEmbedViews(kit),
  });
}

const EMBEDS_BY_CLIENT = new WeakMap<object, HoodyEmbeds>();

/**
 * Define `embeds` on the HoodyClient prototype: a getter, built once per client instance. A getter
 * rather than a constructor field, because withComputer()/withRealm() promote instances by prototype
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
