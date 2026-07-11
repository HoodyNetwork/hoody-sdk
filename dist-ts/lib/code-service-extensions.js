/**
 * Code service extensions — prototype patches for VscodeService.
 *
 * Adds `embedUrl(extensionId, options?)` — a pure URL builder that produces
 * an iframeable URL for a VS Code extension in extension-only mode. Ideal for
 * embedding a single extension (e.g. `rooveterinaryinc.roo-cline`) as a
 * standalone web app inside an iframe.
 *
 * Uses the same declare-module + prototype-patch pattern as
 * lib/files-service-extensions.ts.
 */
import { VscodeService } from '../generated/code/vscode.service.js';
// ---------------------------------------------------------------------------
// Idempotency guard (Symbol.for survives HMR / duplicate imports)
// ---------------------------------------------------------------------------
const VSCODE_PATCH_MARKER = Symbol.for('hoody.sdk.code.vscode.service.extensions');
// ---------------------------------------------------------------------------
// Prototype patch
// ---------------------------------------------------------------------------
function patchVscodeService(proto) {
    if (proto[VSCODE_PATCH_MARKER])
        return;
    proto[VSCODE_PATCH_MARKER] = true;
    proto.embedUrl = function (extensionId, options = {}) {
        if (!extensionId || typeof extensionId !== 'string') {
            throw new Error('embedUrl: extensionId is required (PUBLISHER.NAME)');
        }
        if (!/^[a-zA-Z0-9-]+\.[a-zA-Z0-9-]+$/.test(extensionId)) {
            throw new Error(`embedUrl: extensionId must be in PUBLISHER.NAME form (got: ${extensionId})`);
        }
        // `buildTemplateUrl` is protected on VscodeServiceBase; it returns the
        // fully-qualified kit URL when projectId/containerId/server template
        // variables are configured on the client, or just the path otherwise.
        const base = this.buildTemplateUrl('/api/v1/code', {});
        const params = new URLSearchParams();
        params.set('extension', extensionId);
        if (options.folder)
            params.set('folder', options.folder);
        if (options.workspace)
            params.set('workspace', options.workspace);
        if (options.locale)
            params.set('locale', options.locale);
        if (options.emptyWindow)
            params.set('ew', 'true');
        if (options.extra) {
            for (const [k, v] of Object.entries(options.extra)) {
                if (v === undefined || v === null)
                    continue;
                params.set(k, String(v));
            }
        }
        return `${base}?${params.toString()}`;
    };
}
// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------
export function patchCodeServiceExtensions() {
    patchVscodeService(VscodeService.prototype);
}
// Auto-run on import (idempotent via Symbol.for guard)
patchCodeServiceExtensions();
