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
// Types
// ---------------------------------------------------------------------------

export interface EmbedUrlOptions {
  /** Absolute path to the folder to open alongside the extension. Adds `?folder=...`. */
  folder?: string;
  /** Absolute path to a `.code-workspace` file. Adds `?workspace=...`. */
  workspace?: string;
  /** Display language (IETF tag, e.g. `en`, `fr`, `ja`). Adds `?locale=...`. */
  locale?: string;
  /** Empty-window flag — clears last-opened folder/workspace. Adds `?ew=true`. */
  emptyWindow?: boolean;
  /** Any additional query parameters to append. `undefined`/`null` values are skipped. */
  extra?: Record<string, string | number | boolean | undefined | null>;
}

// ---------------------------------------------------------------------------
// Module augmentation — code namespace
// ---------------------------------------------------------------------------

declare module '../generated/code/vscode.service.js' {
  interface VscodeService {
    /**
     * Build an iframeable URL for a VS Code extension in extension-only mode.
     *
     * @param extensionId - Extension identifier in `PUBLISHER.NAME` form
     *                      (e.g. `ms-python.python`, `rooveterinaryinc.roo-cline`).
     * @param options     - Optional folder/workspace/locale overrides and extras.
     * @returns Fully-qualified URL suitable for an `<iframe src>` (when the
     *          client has projectId/containerId/server template variables
     *          configured) or a path (baseURL mode — caller supplies origin).
     *
     * @example
     *   const url = client.code.embedUrl('rooveterinaryinc.roo-cline');
     *   // → https://{projectId}-{containerId}-code-0.{server}.containers.hoody.com/api/v1/code?extension=rooveterinaryinc.roo-cline
     */
    embedUrl(extensionId: string, options?: EmbedUrlOptions): string;
  }
}

// ---------------------------------------------------------------------------
// Prototype patch
// ---------------------------------------------------------------------------

function patchVscodeService(proto: any): void {
  if (proto[VSCODE_PATCH_MARKER]) return;
  proto[VSCODE_PATCH_MARKER] = true;

  proto.embedUrl = function (this: any, extensionId: string, options: EmbedUrlOptions = {}): string {
    if (!extensionId || typeof extensionId !== 'string') {
      throw new Error('embedUrl: extensionId is required (PUBLISHER.NAME)');
    }
    if (!/^[a-zA-Z0-9-]+\.[a-zA-Z0-9-]+$/.test(extensionId)) {
      throw new Error(`embedUrl: extensionId must be in PUBLISHER.NAME form (got: ${extensionId})`);
    }
    // `buildTemplateUrl` is protected on VscodeServiceBase; it returns the
    // fully-qualified kit URL when projectId/containerId/server template
    // variables are configured on the client, or just the path otherwise.
    const base: string = this.buildTemplateUrl('/api/v1/code', {});
    const params = new URLSearchParams();
    params.set('extension', extensionId);
    if (options.folder) params.set('folder', options.folder);
    if (options.workspace) params.set('workspace', options.workspace);
    if (options.locale) params.set('locale', options.locale);
    if (options.emptyWindow) params.set('ew', 'true');
    if (options.extra) {
      for (const [k, v] of Object.entries(options.extra)) {
        if (v === undefined || v === null) continue;
        params.set(k, String(v));
      }
    }
    return `${base}?${params.toString()}`;
  };
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export function patchCodeServiceExtensions(): void {
  patchVscodeService(VscodeService.prototype);
}

// Auto-run on import (idempotent via Symbol.for guard)
patchCodeServiceExtensions();
