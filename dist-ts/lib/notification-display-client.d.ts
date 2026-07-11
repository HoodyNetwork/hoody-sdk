/**
 * Notification Display Client
 *
 * High-level composable client that wires the notification WebSocket stream
 * to a platform-appropriate notification presenter.
 *
 * Imports `createNotificationPresenter` from `./notification-presenter.js`.
 * During browser builds, esbuild swaps that import to the browser implementation
 * (see build.config.ts), so this single file works for both environments.
 *
 * Usage:
 *   const ws = await client.notifications.connectNotificationStream({
 *     displays: 'all'
 *   });
 *   const display = new NotificationDisplayClient(ws, {
 *     baseUrl: 'https://proj-ctr-n-1.server.containers.hoody.com'
 *   });
 *   await display.start();
 *   // → notifications now appear as OS/browser notifications
 *   display.stop();
 */
import type { INotificationsConnectNotificationStreamWebSocket } from '../generated/notifications/notifications_connect-notification-stream.websocket.js';
import type { NotificationServerMessage } from '../generated/notifications/notifications_connect-notification-stream.websocket.js';
import type { NotificationPresenter, NotificationPresenterConfig, ParsedNotification } from './notification-presenter.js';
export interface NotificationDisplayClientConfig extends NotificationPresenterConfig {
    /**
     * Custom presenter instance. If provided, the built-in platform presenter
     * is NOT used. This allows full composability — users can implement their
     * own presenter for Electron, React Native, terminal UI, etc.
     */
    presenter?: NotificationPresenter;
    /**
     * Filter function. Return false to suppress a notification.
     * Called after parsing but before display.
     */
    filter?: (notification: ParsedNotification) => boolean;
    /**
     * Minimum milliseconds between displayed notifications (default: 200).
     * Prevents notification spam during bursts or reconnection replays.
     * Set to 0 to disable throttling.
     */
    minInterval?: number;
    /**
     * Maximum number of pending notifications held in the internal queue
     * (default: 500). When the queue reaches this size, the OLDEST pending
     * notification is dropped to make room — prevents unbounded memory growth
     * when the presenter is slower than incoming notifications.
     */
    maxQueueLength?: number;
    /**
     * Called when a notification is dropped because the queue was full.
     * Useful for observability / metrics. Optional.
     */
    onDropped?: (dropped: ParsedNotification, queueLength: number) => void;
}
export declare class NotificationDisplayClient {
    private presenter;
    private unsubscribe;
    private queue;
    private processing;
    private stopped;
    private startPromise;
    private minInterval;
    private maxQueueLength;
    private config;
    private ws;
    constructor(ws: INotificationsConnectNotificationStreamWebSocket, config?: NotificationDisplayClientConfig);
    /**
     * Initialize the presenter and start listening to WebSocket notifications.
     *
     * Returns false if the presenter could not initialize:
     *   - Node/Bun: no notification tool found (notify-send, osascript, powershell, etc.)
     *   - Browser: permission denied or Notification API unavailable
     *
     * Safe to call concurrently — duplicate calls return the same promise.
     */
    start(): Promise<boolean>;
    private doStart;
    /**
     * Stop listening and clean up resources.
     */
    stop(): void;
    /**
     * Whether the client is actively listening and the presenter is ready.
     */
    get isActive(): boolean;
    /**
     * Manually show a single notification (for testing or manual triggering).
     */
    showManual(message: NotificationServerMessage): Promise<void>;
    private enqueue;
    private processQueue;
}
