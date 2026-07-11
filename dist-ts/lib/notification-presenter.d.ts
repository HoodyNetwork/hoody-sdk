/**
 * Notification Presenter — Types, Parser & Node/Bun Implementation
 *
 * This is the default (non-browser) implementation. During browser builds,
 * esbuild swaps imports of this file to `notification-presenter.browser.ts`
 * (see build.config.ts), exactly like the http-client swap pattern.
 *
 * Uses `node:child_process` for subprocess spawning — works identically
 * on both Bun and Node.js 18+.
 *
 * Supported platforms:
 *   Linux   — notify-send (libnotify)
 *   macOS   — terminal-notifier (preferred) or osascript (fallback)
 *   Windows — powershell.exe WinRT toast (Windows 10+, ships with OS)
 */
import type { Notification as NotificationData } from '../generated/types.js';
import type { NotificationServerMessage } from '../generated/notifications/notifications_connect-notification-stream.websocket.js';
export type { NotificationServerMessage };
export interface ParsedNotification {
    /** Original raw WebSocket message */
    raw: NotificationServerMessage;
    /** Typed notification data (runtime-validated, not just cast) */
    data: NotificationData;
    /** Fully resolved absolute icon URL, or undefined */
    iconUrl: string | undefined;
    /** Display ID from the WebSocket message */
    displayId: string;
}
export interface NotificationPresenterConfig {
    /** Base URL of the notification service, for resolving relative icon_url */
    baseUrl?: string;
    /** Whether to include icons in notifications (default: true) */
    showIcons?: boolean;
    /** Called when a notification fails to display */
    onError?: (notification: ParsedNotification, error: Error) => void;
    /** Called after a notification is successfully displayed */
    onDisplayed?: (notification: ParsedNotification) => void;
    /**
     * Injectable spawn function for testing.
     * Defaults to node:child_process.spawn wrapper.
     */
    spawn?: (cmd: string, args: string[]) => Promise<{
        exitCode: number;
        stderr: string;
    }>;
}
export interface NotificationPresenter {
    /** Probe for available notification tool. Returns true if notifications can be shown. */
    initialize(): Promise<boolean>;
    /** Display a single notification */
    show(notification: ParsedNotification): Promise<void>;
    /** Clean up resources */
    dispose(): void;
    /** Whether the presenter is ready to show notifications */
    readonly ready: boolean;
}
/**
 * Parse a raw WebSocket notification message into a typed ParsedNotification.
 *
 * Performs runtime field extraction with type checks — does NOT blindly cast
 * `data: unknown` to NotificationData. Missing fields become `undefined`.
 */
export declare function parseNotificationData(message: NotificationServerMessage, baseUrl?: string): ParsedNotification;
/**
 * Create a notification presenter for Node.js / Bun environments.
 *
 * Detects the available OS notification tool and spawns it for each notification.
 * The `spawn` function is injectable for testing.
 */
export declare function createNotificationPresenter(config?: NotificationPresenterConfig): NotificationPresenter;
