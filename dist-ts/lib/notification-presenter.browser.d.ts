/**
 * Notification Presenter — Browser Implementation
 *
 * Uses the Web Notification API (new Notification()) with graceful
 * permission handling.
 *
 * During browser builds, esbuild swaps imports of `notification-presenter.js`
 * to this file (see build.config.ts). This file MUST NOT import any
 * Node/Bun-specific modules.
 *
 * Exports the same `createNotificationPresenter` function name as the
 * Node/Bun implementation for transparent substitution.
 */
export interface ParsedNotification {
    raw: {
        type: 'notification';
        display: string;
        data: unknown;
    };
    data: {
        appname?: string;
        summary?: string;
        body?: string;
        message?: string;
        icon_url?: string;
        has_icon?: boolean;
        id?: number;
        timestamp?: number;
        display_id?: number;
        urgency?: 'low' | 'normal' | 'critical';
        category?: string;
        expire_time?: number;
    };
    iconUrl: string | undefined;
    displayId: string;
}
export interface NotificationPresenterConfig {
    baseUrl?: string;
    showIcons?: boolean;
    onError?: (notification: ParsedNotification, error: Error) => void;
    onDisplayed?: (notification: ParsedNotification) => void;
    spawn?: (cmd: string, args: string[]) => Promise<{
        exitCode: number;
        stderr: string;
    }>;
}
export interface NotificationPresenter {
    initialize(): Promise<boolean>;
    show(notification: ParsedNotification): Promise<void>;
    dispose(): void;
    readonly ready: boolean;
}
export type NotificationServerMessage = {
    type: 'notification';
    display: string;
    data: unknown;
};
export declare function parseNotificationData(message: NotificationServerMessage, baseUrl?: string): ParsedNotification;
/**
 * Create a notification presenter for browser environments.
 *
 * Uses the Web Notification API. Handles permission requests gracefully.
 * If the Notification API is not available (e.g., React Native, SSR),
 * `initialize()` returns false and `show()` is a no-op.
 */
export declare function createNotificationPresenter(config?: NotificationPresenterConfig): NotificationPresenter;
