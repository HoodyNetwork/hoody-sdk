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
export declare function patchCodeServiceExtensions(): void;
