/**
 * Screenshot save — capture + save to container filesystem in one call.
 *
 * Architecture:
 *   This module extends HoodyClient with four convenience methods:
 *
 *   - `saveScreenshot(options)` — generic: specify source + options
 *   - `saveDisplayScreenshot(path?, options?)` — capture display + save
 *   - `saveBrowserScreenshot(path?, options?)` — capture browser + save
 *   - `saveTerminalScreenshot(path?, options?)` — capture terminal + save
 *
 *   All methods require a container-scoped client (via `withContainer()`).
 *   They compose: capture API call → decode → validate → putFile → chmod.
 *
 *   Data flow:
 *     Display:  captureScreenshot({base64:true}) → Buffer.from(base64)
 *     Browser:  takeScreenshot({format})                → Buffer.from(base64)
 *     Terminal: captureTerminalScreenshot({save:false})  → Buffer.from(arrayBuffer)
 *
 *   Path validation (17 checks):
 *     typeof, mutual exclusivity, raw length, NFKC, '..' pre/post normalize,
 *     absolute, null, control, invisible, URL-reserved, dangerous, trailing dots,
 *     component length, empty basename, recheck after extension, recheck total.
 *
 */
export type ScreenshotSource = 'display' | 'browser' | 'terminal';
export type ScreenshotFormat = 'png' | 'jpeg';
export interface SaveScreenshotOptions {
    /** Which kit to capture from */
    source: ScreenshotSource;
    /** Full file path (mutually exclusive with dir) */
    path?: string;
    /** Directory only — filename auto-generated (mutually exclusive with path) */
    dir?: string;
    /** Image format. Display always produces png. Default: 'png'. */
    format?: ScreenshotFormat;
    /** Display-specific capture options */
    displayOptions?: DisplayScreenshotCaptureOptions;
    /** Browser-specific capture options */
    browserOptions?: BrowserScreenshotCaptureOptions;
    /** Terminal-specific capture options */
    terminalOptions?: TerminalScreenshotCaptureOptions;
}
export interface DisplayScreenshotCaptureOptions {
    displayId?: number;
}
export interface BrowserScreenshotCaptureOptions {
    browser_id?: string;
    url?: string;
    tabId?: number;
    fullPage?: boolean;
    quality?: number;
}
export interface TerminalScreenshotCaptureOptions {
    terminal_id?: string;
    foreground?: string;
    background?: string;
    fontsize?: number;
}
export interface SaveScreenshotResult {
    /** Final absolute path where the screenshot was saved */
    path: string;
    /** File size in bytes */
    size: number;
    /** ISO 8601 timestamp of capture */
    timestamp: string;
    /** Which source the screenshot came from */
    source: ScreenshotSource;
    /** Actual image format written */
    format: ScreenshotFormat;
}
export type ScreenshotSaveErrorCode = 'CAPTURE_FAILED' | 'WRITE_FAILED' | 'UNSUPPORTED_ENV' | 'INVALID_PATH' | 'FORMAT_MISMATCH' | 'INVALID_IMAGE_DATA' | 'PAYLOAD_TOO_LARGE';
export declare class ScreenshotSaveError extends Error {
    readonly code: ScreenshotSaveErrorCode;
    readonly source: ScreenshotSource | undefined;
    readonly path: string | undefined;
    readonly cause: Error | undefined;
    constructor(code: ScreenshotSaveErrorCode, message: string, details?: {
        source?: ScreenshotSource;
        path?: string;
        cause?: Error;
    });
}
declare module './hoody-client.js' {
    interface HoodyClient {
        /**
         * Capture a screenshot and save it to the container filesystem.
         *
         * Requires a container-scoped client (call `withContainer()` first).
         */
        saveScreenshot(options: SaveScreenshotOptions): Promise<SaveScreenshotResult>;
        /**
         * Capture a display screenshot and save it to the container filesystem.
         *
         * @param path - File path or filename. If omitted, auto-generates in /hoody/storage/hoody-sdk/screenshots/.
         *               Bare filenames (e.g. "foo.png") are placed in the default directory.
         */
        saveDisplayScreenshot(path?: string, options?: Omit<SaveScreenshotOptions, 'source' | 'path'>): Promise<SaveScreenshotResult>;
        /**
         * Capture a browser screenshot and save it to the container filesystem.
         *
         * @param path - File path or filename. If omitted, auto-generates in /hoody/storage/hoody-sdk/screenshots/.
         */
        saveBrowserScreenshot(path?: string, options?: Omit<SaveScreenshotOptions, 'source' | 'path'>): Promise<SaveScreenshotResult>;
        /**
         * Capture a terminal screenshot and save it to the container filesystem.
         *
         * @param path - File path or filename. If omitted, auto-generates in /hoody/storage/hoody-sdk/screenshots/.
         */
        saveTerminalScreenshot(path?: string, options?: Omit<SaveScreenshotOptions, 'source' | 'path'>): Promise<SaveScreenshotResult>;
    }
}
export declare function patchScreenshotSavePrototype(HoodyClientClass: {
    prototype: unknown;
}): void;
