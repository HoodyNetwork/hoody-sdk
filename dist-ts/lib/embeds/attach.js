import { buildEmbedUrl, getEmbedCatalog, listEmbedViews, EmbedValidationError, } from './runtime.js';
import { makeEmbedWrappers, } from '../../generated/embeds.generated.js';
/**
 * The computer a `withComputer()` client is scoped to. The generated client keeps it only as the URL
 * template variables it gives every kit namespace (all set from the one computer), so it is read from
 * there. Several different identities, or none, mean the client is not scoped to one computer.
 */
function scopedComputer(host) {
    const templates = host.urlTemplates;
    if (templates === undefined || templates === null)
        return undefined;
    let found;
    for (const vars of Object.values(templates)) {
        if (vars === undefined || vars === null)
            continue;
        const id = vars.computerId;
        const projectId = vars.projectId;
        const server = vars.serverName ?? vars.server;
        if (typeof id !== 'string' || typeof projectId !== 'string' || typeof server !== 'string')
            continue;
        if (id === '' || projectId === '' || server === '')
            continue;
        if (found !== undefined && (found.id !== id || found.project_id !== projectId || found.server_name !== server))
            return undefined;
        found = { id, project_id: projectId, server_name: server };
    }
    return found;
}
/** Build the `embeds` object for one client. */
export function createEmbeds(host) {
    const ctx = {
        getKitUrl: (kit, computer, opts) => host.getKitUrl(kit, computer, opts),
    };
    const resolveTarget = (target) => {
        if (target !== undefined && target !== null)
            return target;
        const scoped = scopedComputer(host);
        if (scoped === undefined) {
            throw new EmbedValidationError('TARGET_INVALID', 'this client is not scoped to one computer: pass a computer or a ProxyAlias, or call withComputer() first', 'target');
        }
        return scoped;
    };
    const url = (kit, target, opts = {}) => buildEmbedUrl(kit, resolveTarget(target), opts, ctx);
    const build = (viewId, target, opts) => {
        const dot = viewId.indexOf('.');
        // The view comes from the wrapper that was called, never from the caller's options.
        return url(viewId.slice(0, dot), target, { ...opts, view: viewId.slice(dot + 1) });
    };
    return Object.assign(makeEmbedWrappers(build), {
        getUrl: url,
        getCatalog: () => getEmbedCatalog(),
        listViews: (kit) => listEmbedViews(kit),
    });
}
const EMBEDS_BY_CLIENT = new WeakMap();
/**
 * Define `embeds` on the HoodyClient prototype: a getter, built once per client instance. A getter
 * rather than a constructor field, because withComputer()/withRealm() promote instances by prototype
 * swap and no constructor runs for them. Calling it again redefines the same getter over the same
 * per-instance cache, so both entry points may call it.
 */
export function patchEmbedsPrototype(HoodyClientClass) {
    const prototype = HoodyClientClass.prototype;
    Object.defineProperty(prototype, 'embeds', {
        configurable: true,
        enumerable: false,
        get() {
            let embeds = EMBEDS_BY_CLIENT.get(this);
            if (embeds === undefined) {
                embeds = createEmbeds(this);
                EMBEDS_BY_CLIENT.set(this, embeds);
            }
            return embeds;
        },
    });
}
