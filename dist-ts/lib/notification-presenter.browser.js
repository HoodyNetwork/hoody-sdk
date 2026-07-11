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
// ═══════════════════════════════════════════════════════════════════
// Pure Parser (same logic as Node version)
// ═══════════════════════════════════════════════════════════════════
export function parseNotificationData(message, baseUrl) {
    const raw = (message.data ?? {});
    // Build data object conditionally to satisfy exactOptionalPropertyTypes
    const data = {};
    if (typeof raw.appname === 'string')
        data.appname = raw.appname;
    if (typeof raw.summary === 'string')
        data.summary = raw.summary;
    if (typeof raw.body === 'string')
        data.body = raw.body;
    if (typeof raw.message === 'string')
        data.message = raw.message;
    if (typeof raw.icon_url === 'string')
        data.icon_url = raw.icon_url;
    if (typeof raw.has_icon === 'boolean')
        data.has_icon = raw.has_icon;
    if (typeof raw.id === 'number')
        data.id = raw.id;
    if (typeof raw.timestamp === 'number')
        data.timestamp = raw.timestamp;
    if (typeof raw.display_id === 'number')
        data.display_id = raw.display_id;
    if (raw.urgency === 'low' || raw.urgency === 'normal' || raw.urgency === 'critical') {
        data.urgency = raw.urgency;
    }
    if (typeof raw.category === 'string')
        data.category = raw.category;
    if (typeof raw.expire_time === 'number')
        data.expire_time = raw.expire_time;
    let iconUrl;
    if (data.has_icon && data.icon_url) {
        if (data.icon_url.startsWith('http://') || data.icon_url.startsWith('https://')) {
            iconUrl = data.icon_url;
        }
        else if (baseUrl) {
            iconUrl = `${baseUrl.replace(/\/$/, '')}/${data.icon_url.replace(/^\//, '')}`;
        }
    }
    return { raw: message, data, iconUrl, displayId: message.display };
}
// ═══════════════════════════════════════════════════════════════════
// Browser Implementation
// ═══════════════════════════════════════════════════════════════════
/**
 * Create a notification presenter for browser environments.
 *
 * Uses the Web Notification API. Handles permission requests gracefully.
 * If the Notification API is not available (e.g., React Native, SSR),
 * `initialize()` returns false and `show()` is a no-op.
 */
export function createNotificationPresenter(config) {
    let _ready = false;
    return {
        get ready() {
            return _ready;
        },
        async initialize() {
            // Guard: Notification API may not exist (React Native, SSR, non-secure context)
            if (typeof Notification === 'undefined') {
                console.warn('[hoody-sdk] Web Notification API not available in this environment');
                return (_ready = false);
            }
            // Already granted
            if (Notification.permission === 'granted') {
                return (_ready = true);
            }
            // Already denied — cannot re-ask (browser limitation)
            if (Notification.permission === 'denied') {
                console.warn('[hoody-sdk] Notification permission was denied by user');
                return (_ready = false);
            }
            // Ask for permission (permission is 'default')
            try {
                const result = await Notification.requestPermission();
                return (_ready = result === 'granted');
            }
            catch (error) {
                console.warn('[hoody-sdk] Failed to request notification permission:', error);
                return (_ready = false);
            }
        },
        async show(notification) {
            // Every failure path invokes `config.onError` (if
            // provided) before rethrowing. Pre-fix the browser presenter threw
            // directly, so standalone consumers of createNotificationPresenter()
            // who wired up onError never received any events (parity with the
            // Node-side presenter). NotificationDisplayClient already wraps
            // show() in its own try/catch, so the display-client path is unaffected.
            const reportError = (err) => {
                try {
                    config?.onError?.(notification, err);
                }
                catch { /* hook errors must not mask original */ }
            };
            if (!_ready) {
                const err = new Error('NotificationPresenter not initialized or permission denied');
                reportError(err);
                throw err;
            }
            const { data } = notification;
            const title = data.summary ?? data.appname ?? 'Hoody Notification';
            const options = {
                body: data.body ?? data.message ?? '',
                tag: `hoody-${notification.displayId}-${data.id ?? Date.now()}`,
                renotify: true,
            };
            // Icon: pass the resolved absolute URL directly — browser handles fetching
            if (config?.showIcons !== false && notification.iconUrl) {
                options.icon = notification.iconUrl;
            }
            // Map critical urgency → requireInteraction (notification stays until dismissed)
            if (data.urgency === 'critical') {
                options.requireInteraction = true;
            }
            try {
                new Notification(title, options);
            }
            catch (ne) {
                const err = ne instanceof Error ? ne : new Error(String(ne));
                reportError(err);
                throw err;
            }
            config?.onDisplayed?.(notification);
        },
        dispose() {
            // No resources to clean up in browser
        },
    };
}
