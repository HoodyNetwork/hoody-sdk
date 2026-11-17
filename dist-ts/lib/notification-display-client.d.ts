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
 *     baseUrl: 'https://proj-ctr-n-1.server.computers.hoody.com'
 *   });
 *   await display.start();
 *   // → notifications now appear as OS/browser notifications
 *   display.stop();
 */
import type { INotificationsConnectWebSocket } from '../generated/notifications/notifications_connect-notification-stream.websocket.js';
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
/**
 * Shows a computer's notifications on this machine: it listens on a notification stream and hands each message to
 * a presenter (the operating system's or the browser's notifications by default), one at a time.
 *
 * Nothing is shown until `start()` resolves true. Pending notifications wait in a bounded queue: when it is full
 * the oldest is dropped (`onDropped`), and `minInterval` spaces out what is shown. `stop()` stops listening,
 * empties the queue and disposes the presenter; it does not close the stream.
 */
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
    /**
     * `ws` is an open notification stream (`connectNotificationStream()`). `config` sets the presenter (or the
     * built-in one's settings), a `filter`, the spacing between notifications and the queue size; a `maxQueueLength`
     * below 1 is read as 1.
     */
    constructor(ws: INotificationsConnectWebSocket, config?: NotificationDisplayClientConfig);
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
     * Whether the client is running: started, not stopped, and the presenter is ready.
     */
    isRunning(): boolean;
    /**
     * Show a single notification now (for testing or manual triggering).
     */
    show(message: NotificationServerMessage): Promise<void>;
    private enqueue;
    private processQueue;
}
