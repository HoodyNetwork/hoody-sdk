// A new browser with options: the start and the reads around it, through core's Board requests
// (core/run-open/kitRoutes.ts, index 'browser': browser-N, 1-7500).
//
// Contract, in plain words:
//   - browserUp(computer, n) reads browser-N's DevTools address with start=false (a read: it never starts anything):
//     'up' when it answers, 'down' when the kit says no browser runs there (404), null when the read failed.
//   - startBrowser(computer, n, query) sends the start once (browserOptions.ts startQuery builds the query). The kit's
//     start is create-or-get: on a browser already running it changes nothing and the options are not applied, so the
//     form reads browserUp first and offers a number with none running. Result: 'started'; {pending} when the
//     answer does not say (a timeout, a lost answer; never resent here: read it back with browserUp); {error, code?,
//     cause} when it was refused (code: the kit's, from core's kept list) or never sent; cause is core's rejection as
//     it came (the route is secret, so core kept only its safe facts: status, code, trace id, route), for the
//     outcome's Details.
//   - readDevtools(computer, n): the address to give a DevTools client, 'down' (404), 'none' (it answered without
//     one: Firefox has none), or null (the read failed). It is the cdp-N base address (https://…-cdp-N/), as the kit advises for
//     connectOverCDP; the WebSocket address (not stable across restarts) is not offered. The address grants access to
//     the browser: the dialog never shows it, not even in part (Open DevTools and Copy address only), and it goes in
//     no notice or log.
import { boardSend, outcomeOf } from '@core';
import type { BoardComputer } from '../computers';
import { boardTarget } from '../termSessions';

export type StartResult =
  | 'started'
  | { readonly pending: true }
  | { readonly error: 'failed' | 'not_sent' | 'stale'; readonly code?: string; readonly cause: unknown };

const codeOf = (e: unknown): string | undefined => {
  const c = e && typeof e === 'object' ? (e as { code?: unknown }) : null;
  return typeof c?.code === 'string' ? c.code : undefined;
};
const notRunning = (e: unknown): boolean => {
  const c = e && typeof e === 'object' ? (e as { code?: unknown; status?: unknown }) : null;
  return c?.status === 404 || c?.code === 'NOT_FOUND';
};

interface DevtoolsAnswer { webSocketDebuggerUrl?: unknown; devtoolsHttpUrl?: unknown }

function devtools(computer: BoardComputer, n: number, signal?: AbortSignal): Promise<DevtoolsAnswer> {
  return boardSend<DevtoolsAnswer>({ kit: 'browser', index: n }, 'GET', '/api/v1/browser/devtools-url', { target: boardTarget(computer), query: { start: false }, ...(signal ? { signal } : {}) });
}

export async function browserUp(computer: BoardComputer, n: number, signal?: AbortSignal): Promise<'up' | 'down' | null> {
  try {
    await devtools(computer, n, signal);
    return 'up';
  } catch (e) {
    return notRunning(e) ? 'down' : null;
  }
}

export async function startBrowser(computer: BoardComputer, n: number, query: Readonly<Record<string, string | boolean>>): Promise<StartResult> {
  try {
    await boardSend({ kit: 'browser', index: n }, 'GET', '/api/v1/browser/start', { target: boardTarget(computer), query });
    return 'started';
  } catch (e) {
    const kind = outcomeOf(e, true);
    if (kind === 'pending') return { pending: true };
    const code = codeOf(e);
    return { error: kind, ...(code ? { code } : {}), cause: e };
  }
}

/** The cdp-N base of a DevTools address the kit gave (http or https, its origin), else null. */
export function cdpBase(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw) return null;
  try {
    const u = new URL(raw);
    const scheme = u.protocol === 'wss:' || u.protocol === 'https:' ? 'https:' : u.protocol === 'ws:' || u.protocol === 'http:' ? 'http:' : null;
    return scheme && u.host ? scheme + '//' + u.host + '/' : null;
  } catch {
    return null;
  }
}

export async function readDevtools(computer: BoardComputer, n: number, signal?: AbortSignal): Promise<string | 'down' | 'none' | null> {
  try {
    const a = await devtools(computer, n, signal);
    return cdpBase(a?.devtoolsHttpUrl) ?? cdpBase(a?.webSocketDebuggerUrl) ?? 'none';
  } catch (e) {
    return notRunning(e) ? 'down' : null;
  }
}
