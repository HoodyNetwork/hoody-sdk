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

import type { INotificationsConnectNotificationStreamWebSocket } from
  '../generated/notifications/notifications_connect-notification-stream.websocket.js';
import type { NotificationServerMessage } from
  '../generated/notifications/notifications_connect-notification-stream.websocket.js';
import {
  parseNotificationData,
  createNotificationPresenter,
} from './notification-presenter.js';
import type {
  NotificationPresenter,
  NotificationPresenterConfig,
  ParsedNotification,
} from './notification-presenter.js';

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

export class NotificationDisplayClient {
  private presenter: NotificationPresenter;
  private unsubscribe: (() => void) | null = null;
  private queue: ParsedNotification[] = [];
  private processing = false;
  private stopped = false;
  private startPromise: Promise<boolean> | null = null;
  private minInterval: number;
  private maxQueueLength: number;
  private config: NotificationDisplayClientConfig;
  private ws: INotificationsConnectNotificationStreamWebSocket;

  constructor(
    ws: INotificationsConnectNotificationStreamWebSocket,
    config?: NotificationDisplayClientConfig,
  ) {
    this.ws = ws;
    this.config = config ?? {};
    this.presenter = config?.presenter ?? createNotificationPresenter(config);
    this.minInterval = config?.minInterval ?? 200;
    this.maxQueueLength = Math.max(1, config?.maxQueueLength ?? 500);
  }

  /**
   * Initialize the presenter and start listening to WebSocket notifications.
   *
   * Returns false if the presenter could not initialize:
   *   - Node/Bun: no notification tool found (notify-send, osascript, powershell, etc.)
   *   - Browser: permission denied or Notification API unavailable
   *
   * Safe to call concurrently — duplicate calls return the same promise.
   */
  async start(): Promise<boolean> {
    // Guard: if already started, return current state
    if (this.unsubscribe) return this.presenter.ready;

    // Guard: if start() is already in-flight (concurrent call), return same promise
    if (this.startPromise) return this.startPromise;

    this.startPromise = this.doStart();
    try {
      return await this.startPromise;
    } finally {
      this.startPromise = null;
    }
  }

  private async doStart(): Promise<boolean> {
    const ok = await this.presenter.initialize();
    if (!ok) return false;

    this.stopped = false;
    this.unsubscribe = this.ws.onNotification((msg: NotificationServerMessage) => {
      const parsed = parseNotificationData(msg, this.config.baseUrl);

      // Apply user filter
      if (this.config.filter && !this.config.filter(parsed)) return;

      this.enqueue(parsed);
    });

    return true;
  }

  /**
   * Stop listening and clean up resources.
   */
  stop(): void {
    this.stopped = true;
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.queue = [];
    this.presenter.dispose();
  }

  /**
   * Whether the client is actively listening and the presenter is ready.
   */
  get isActive(): boolean {
    return this.unsubscribe !== null && this.presenter.ready;
  }

  /**
   * Manually show a single notification (for testing or manual triggering).
   */
  async showManual(message: NotificationServerMessage): Promise<void> {
    const parsed = parseNotificationData(message, this.config.baseUrl);
    await this.presenter.show(parsed);
  }

  // ─── Internal queue ────────────────────────────────────────────

  private enqueue(notification: ParsedNotification): void {
    if (this.queue.length >= this.maxQueueLength) {
      // Drop oldest to make room — prevents unbounded memory growth when
      // the presenter is slower than incoming notifications.
      const dropped = this.queue.shift();
      if (dropped && this.config.onDropped) {
        try { this.config.onDropped(dropped, this.queue.length); } catch { /* ignore */ }
      }
    }
    this.queue.push(notification);
    if (!this.processing) this.processQueue();
  }

  private async processQueue(): Promise<void> {
    this.processing = true;

    while (this.queue.length > 0 && !this.stopped) {
      const next = this.queue.shift()!;

      try {
        await this.presenter.show(next);
      } catch {
        // Swallow: the presenter owns onError dispatch.
        // Dispatching onError here AND in the presenter
        // double-fires the callback per failure (duplicate logs/metrics,
        // double retry/alert side effects).
      }

      // Throttle: wait between notifications to prevent spam
      if (this.queue.length > 0 && this.minInterval > 0 && !this.stopped) {
        await new Promise((r) => setTimeout(r, this.minInterval));
      }
    }

    this.processing = false;

    // Re-check: a notification may have been enqueued between the while-condition
    // check (finding empty queue) and this line. Without this, that notification
    // would be stuck until the next one arrives.
    if (this.queue.length > 0 && !this.stopped) {
      this.processQueue();
    }
  }
}
