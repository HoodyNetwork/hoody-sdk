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
import type { NotificationServerMessage } from
  '../generated/notifications/notifications_connect-notification-stream.websocket.js';
import { spawn as cpSpawn, execFileSync } from 'node:child_process';
import { unlink } from 'node:fs';

export type { NotificationServerMessage };

// ═══════════════════════════════════════════════════════════════════
// Shared Types (consumed by both Node/Bun and Browser implementations)
// ═══════════════════════════════════════════════════════════════════

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
  spawn?: (cmd: string, args: string[]) => Promise<{ exitCode: number; stderr: string }>;
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

// ═══════════════════════════════════════════════════════════════════
// Pure Parser (shared by both implementations)
// ═══════════════════════════════════════════════════════════════════

/**
 * Parse a raw WebSocket notification message into a typed ParsedNotification.
 *
 * Performs runtime field extraction with type checks — does NOT blindly cast
 * `data: unknown` to NotificationData. Missing fields become `undefined`.
 */
export function parseNotificationData(
  message: NotificationServerMessage,
  baseUrl?: string,
): ParsedNotification {
  const raw = (message.data ?? {}) as Record<string, unknown>;

  // Build data object conditionally to satisfy exactOptionalPropertyTypes
  // (optional properties cannot be explicitly set to undefined)
  const data: NotificationData = {};
  if (typeof raw.appname === 'string') data.appname = raw.appname;
  if (typeof raw.summary === 'string') data.summary = raw.summary;
  if (typeof raw.body === 'string') data.body = raw.body;
  if (typeof raw.message === 'string') data.message = raw.message;
  if (typeof raw.icon_url === 'string') data.icon_url = raw.icon_url;
  if (typeof raw.has_icon === 'boolean') data.has_icon = raw.has_icon;
  if (typeof raw.id === 'number') data.id = raw.id;
  if (typeof raw.timestamp === 'number') data.timestamp = raw.timestamp;
  if (typeof raw.display_id === 'number') data.display_id = raw.display_id;
  if (raw.urgency === 'low' || raw.urgency === 'normal' || raw.urgency === 'critical') {
    data.urgency = raw.urgency;
  }
  if (typeof raw.category === 'string') data.category = raw.category;
  if (typeof raw.expire_time === 'number') data.expire_time = raw.expire_time;

  let iconUrl: string | undefined;
  if (data.has_icon && data.icon_url) {
    if (data.icon_url.startsWith('http://') || data.icon_url.startsWith('https://')) {
      iconUrl = data.icon_url;
    } else if (baseUrl) {
      iconUrl = `${baseUrl.replace(/\/$/, '')}/${data.icon_url.replace(/^\//, '')}`;
    }
  }

  return { raw: message, data, iconUrl, displayId: message.display };
}

// ═══════════════════════════════════════════════════════════════════
// Node/Bun Implementation
// ═══════════════════════════════════════════════════════════════════

type NotifyTool = 'notify-send' | 'osascript' | 'terminal-notifier' | 'powershell';

/**
 * Default spawn wrapper using node:child_process.
 * Works identically in Bun (full node:child_process compat).
 */
async function defaultSpawn(
  cmd: string,
  args: string[],
): Promise<{ exitCode: number; stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = cpSpawn(cmd, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    proc.on('error', reject);
    proc.on('close', (code) => resolve({ exitCode: code ?? 1, stderr }));
  });
}

/**
 * Synchronous binary lookup.
 * Uses Bun.which if available (faster, no subprocess), otherwise falls back
 * to `which` (Linux/macOS) or `where.exe` (Windows) via execFileSync.
 */
function whichSync(binary: string): string | null {
  // Fast path: Bun.which is a direct libc PATH lookup with zero subprocess overhead
  const g = globalThis as Record<string, unknown>;
  if (g.Bun && typeof (g.Bun as Record<string, unknown>).which === 'function') {
    return (g.Bun as { which: (b: string) => string | null }).which(binary);
  }
  // Fallback: which (Linux/macOS) or where.exe (Windows)
  try {
    const cmd = process.platform === 'win32' ? 'where.exe' : 'which';
    const result = execFileSync(cmd, [binary], { encoding: 'utf-8' }).trim();
    // `where.exe` may return multiple lines — take the first
    return result.split(/\r?\n/)[0] || null;
  } catch {
    return null;
  }
}

/**
 * Detect the best notification tool for the current platform.
 */
function detectTool(): { tool: NotifyTool; path: string } | null {
  const platform = typeof process !== 'undefined' ? process.platform : null;

  if (platform === 'linux') {
    const p = whichSync('notify-send');
    if (p) return { tool: 'notify-send', path: p };
    return null;
  }

  if (platform === 'darwin') {
    // Prefer terminal-notifier (richer: icons, sounds, subtitles)
    const tn = whichSync('terminal-notifier');
    if (tn) return { tool: 'terminal-notifier', path: tn };
    // Fallback: osascript is always present on macOS
    const os = whichSync('osascript');
    if (os) return { tool: 'osascript', path: os };
    return null;
  }

  if (platform === 'win32') {
    // powershell.exe ships with Windows 10+. Prefer pwsh (PowerShell 7+) if available.
    const pwsh = whichSync('pwsh.exe') ?? whichSync('pwsh');
    if (pwsh) return { tool: 'powershell', path: pwsh };
    const ps = whichSync('powershell.exe');
    if (ps) return { tool: 'powershell', path: ps };
    return null;
  }

  return null;
}

/**
 * Build OS-specific command-line arguments for the notification tool.
 */
function buildArgs(
  tool: NotifyTool,
  notification: ParsedNotification,
  showIcons: boolean,
): string[] {
  const { data } = notification;
  const summary = data.summary ?? data.appname ?? 'Hoody Notification';
  const body = data.body ?? data.message ?? '';
  const urgency = data.urgency ?? 'normal';

  switch (tool) {
    case 'notify-send': {
      const args: string[] = ['--urgency', urgency];
      if (data.appname) args.push('--app-name', data.appname);
      if (data.category) args.push('--category', data.category);
      // libnotify >= 0.7 accepts URLs directly — no temp file needed
      if (showIcons && notification.iconUrl) args.push('--icon', notification.iconUrl);
      if (data.expire_time) args.push('--expire-time', String(data.expire_time));
      args.push(summary);
      if (body) args.push(body);
      return args;
    }

    case 'terminal-notifier': {
      const args: string[] = ['-title', summary];
      if (body) args.push('-message', body);
      else args.push('-message', ' '); // terminal-notifier requires -message
      if (data.appname) args.push('-subtitle', data.appname);
      if (urgency === 'critical') args.push('-sound', 'default');
      // Honour showIcons on macOS too. terminal-notifier accepts
      // -contentImage for a custom icon; without this the option was silently
      // no-ops on macOS despite the config being exposed.
      if (showIcons && notification.iconUrl) args.push('-contentImage', notification.iconUrl);
      return args;
    }

    case 'osascript': {
      // AppleScript: escape backslash, double-quote, and handle newlines.
      // osascript has no user-facing icon flag; there's nothing
      // useful we can wire `showIcons` to here without falling back to
      // terminal-notifier. The option is intentionally a no-op on this
      // backend; callers that want icons on macOS should install
      // terminal-notifier (which does honour showIcons above).
      const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
      let script = `display notification "${esc(body)}" with title "${esc(summary)}"`;
      if (data.appname) script += ` subtitle "${esc(data.appname)}"`;
      if (urgency === 'critical') script += ` sound name "default"`;
      return ['-e', script];
    }

    case 'powershell': {
      // Windows 10+ WinRT toast notification via PowerShell.
      // powershell.exe ships with the OS — no user install needed.
      // Uses XML toast template with ToastGeneric binding.
      //
      // Two-stage escaping (avoid double-escaping):
      //   1. escXml: escape for XML content (&, <, >)
      //   2. escPs:  escape the entire XML string for PS single-quotes (' → '')
      const escXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const escPs = (s: string) => s.replace(/'/g, "''");

      // Step 1: build valid XML with XML-escaped content
      const xml =
        `<toast>` +
        `<visual><binding template="ToastGeneric">` +
        `<text>${escXml(summary)}</text>` +
        (body ? `<text>${escXml(body)}</text>` : '') +
        `</binding></visual>` +
        (urgency === 'critical' ? `<audio src="ms-winsoundevent:Notification.Default"/>` : '') +
        `</toast>`;

      // Step 2: wrap in PS single-quoted string (only escape single quotes)
      // The script loads WinRT types, parses the XML, and shows the toast.
      // AppUserModelID 'Hoody' works without registration (shows generic icon).
      const script = [
        `[void][Windows.UI.Notifications.ToastNotificationManager,Windows.UI.Notifications,ContentType=WindowsRuntime]`,
        `[void][Windows.Data.Xml.Dom.XmlDocument,Windows.Data.Xml.Dom.XmlDocument,ContentType=WindowsRuntime]`,
        `$xml=[Windows.Data.Xml.Dom.XmlDocument]::new()`,
        `$xml.LoadXml('${escPs(xml)}')`,
        `[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('Hoody').Show([Windows.UI.Notifications.ToastNotification]::new($xml))`,
      ].join(';');

      return ['-NoProfile', '-NonInteractive', '-Command', script];
    }

    default: {
      // Exhaustiveness check: if a new NotifyTool is added, TypeScript will error here
      const _exhaustive: never = tool;
      throw new Error(`Unknown notification tool: ${_exhaustive}`);
    }
  }
}

/**
 * Create a notification presenter for Node.js / Bun environments.
 *
 * Detects the available OS notification tool and spawns it for each notification.
 * The `spawn` function is injectable for testing.
 */
export function createNotificationPresenter(
  config?: NotificationPresenterConfig,
): NotificationPresenter {
  let _ready = false;
  let resolved: { tool: NotifyTool; path: string } | null = null;
  const spawnFn = config?.spawn ?? defaultSpawn;
  const tempIconPaths: string[] = [];

  return {
    get ready() {
      return _ready;
    },

    async initialize(): Promise<boolean> {
      resolved = detectTool();
      _ready = resolved !== null;

      if (!_ready) {
        const platform = typeof process !== 'undefined' ? process.platform : 'unknown';
        console.warn(
          `[hoody-sdk] No notification tool found for platform "${platform}". ` +
            `Linux: install libnotify (notify-send). ` +
            `macOS: osascript should be present by default. ` +
            `Windows: powershell.exe required (ships with Windows 10+).`,
        );
      }

      return _ready;
    },

    async show(notification: ParsedNotification): Promise<void> {
      // Every failure path invokes `config.onError` (if
      // provided) before rethrowing. Pre-fix the callback was documented in
      // NotificationPresenterConfig but never called — direct consumers of
      // createNotificationPresenter() silently lost every error. The rethrow
      // preserves existing behavior for callers that don't provide the hook.
      const reportError = (err: Error) => {
        try { config?.onError?.(notification, err); } catch { /* hook errors must not mask the real one */ }
      };
      if (!_ready || !resolved) {
        const err = new Error('NotificationPresenter not initialized or no tool available');
        reportError(err);
        throw err;
      }

      // Read showIcons per-call so dynamic config changes are
       // honoured (parity with browser presenter which reads per-show).
      const args = buildArgs(resolved.tool, notification, config?.showIcons ?? true);
      let exitCode: number;
      let stderr: string;
      try {
        ({ exitCode, stderr } = await spawnFn(resolved.path, args));
      } catch (spawnErr) {
        const err = spawnErr instanceof Error ? spawnErr : new Error(String(spawnErr));
        reportError(err);
        throw err;
      }

      if (exitCode !== 0) {
        const err = new Error(`${resolved.tool} exited with code ${exitCode}: ${stderr.trim()}`);
        reportError(err);
        throw err;
      }

      config?.onDisplayed?.(notification);
    },

    dispose() {
      // Clean up any temp icon files (future macOS terminal-notifier icon support)
      for (const p of tempIconPaths) {
        unlink(p, () => {}); // fire-and-forget
      }
      tempIconPaths.length = 0;
    },
  };
}
