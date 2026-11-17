// The terminal Hub's live entry (the ship build's root: no fixture module may be reachable from here). A host (the
// `hoody` CLI, an in-computer program) mounts the Hub with mountTerminalHub({client, io, ...}) (host-types.ts, SEAM v1).
// One mount = the lifecycle of app/lifecycle.ts on the host's io: host env, session, live core boot on the CLI's client
// (which holds the credentials: the Hub never sees one), mount, and on any end the full dispose. It resolves with the
// receipt once the terminal is restored (q / Ctrl-C, the abort signal, the session ending, a crash, a failed boot, a
// strict-global trap): `ok` false and a non-zero `exitCode` say the mount failed, `problems` say why (sanitised), and
// the crash text is written to the host's cells after the terminal was restored, where the user reads it. It rejects
// only when it could not start at all (another mount open: TERM_SESSION_ACTIVE; no styles: TERM_STYLES_REQUIRED).
import './env/preinstall';
import { queryClient } from '@core';
import type { PageManifest } from '@kit/page';
import { discoverPages, visiblePages } from '../app/pages';
import { liveBoot } from './app/boot.live';
import { liveWiringOf, withStoreNotice } from './app/live-wiring';
import { hostServicesOf, streamsOf } from './app/host-io';
import { startTermHub, type TermBoot, type TermHubEnd } from './app/lifecycle';
import type { TermStyles } from './app/styles';
import { trapLabel } from './app/diagnostic';
import type { HubRoute, HubTermOptions, Receipt } from './host-types';

export type { HoodyClient, HubRoute, HubTermContext, HubTermOptions, Receipt } from './host-types';
export { SEAM_VERSION } from './host-types';
// For the host (the `hoody hub` command): the Hub's places, the client over the CLI's own HttpClient and the start
// realm's rule, so the CLI builds none of them itself.
export { cliStartRealm, openCliHub, readHubPlaces, type CliHttp, type CliHubOpen, type CliHubPlaces, type CliStart, type CliStartRealmInput } from './app/cli-http';
export { resolveStartRealm, type StartRealm, type StartRealmInput } from './app/start-realm';

export interface MountExtras {
  /** The pages to serve; default: the Hub's visible pages. */
  pages?: readonly PageManifest[];
  /** Strict globals (a DOM global read anywhere throws and is recorded). The live entry turns them on unless told
   *  false; the fixture entry only when asked (its tests share one process with others). */
  strictGlobals?: boolean;
  /** The class-style tables (app/styles.ts). REQUIRED: the ship bundle passes its generated tables, runners theirs. */
  styles: TermStyles;
  /** Development only (scripts/term/dev.ts through the fixture entry): each problem also keeps its sanitised message as
   *  `detail` (DevProblem). The live entry refuses it (TERM_DETAIL_DEV_ONLY): a host's receipt never carries a message. */
  diagnosticDetail?: boolean;
}

/** A receipt problem of a development mount (MountExtras.diagnosticDetail): plus the sanitised message. */
export type DevProblem = Receipt['problems'][number] & { detail?: string };

/** A route as the address it opens: its path plus its query, when it has one (the web's pathname + search). */
export function routeHref(route: HubRoute): string {
  return route.path + (route.search && Object.keys(route.search).length ? '?' + new URLSearchParams(route.search).toString() : '');
}

/** The pages a mount serves when its host names none. */
function servedPages(): readonly PageManifest[] {
  return visiblePages(discoverPages().pages, { preview: true, only: '*', fixtures: false });
}

/** The route of a page this build serves (a receipt's `lastView.page`, for the host's "where you left off"); null for
 *  any other id, so a page a newer build dropped opens Home. */
export function pageRoute(id: string): HubRoute | null {
  const page = servedPages().find((p) => p.id === id);
  return page ? { page: page.id, path: page.path } : null;
}

/** The mount every entry shares: the given boot, on the host's io, as a receipt. */
export async function mountWith(o: HubTermOptions & MountExtras, boot: (route: HubRoute, pages: readonly PageManifest[]) => TermBoot): Promise<Receipt> {
  const pages = o.pages ?? servedPages();
  const route: HubRoute = o.route ?? { page: 'home', path: pages.find((p) => p.id === 'home')?.path ?? '/' };
  const streams = streamsOf(o.io);
  try {
    const size = o.io.size();
    const hub = await startTermHub({
      pages,
      path: routeHref(route),
      boot: boot(route, pages),
      queryClient,
      host: { ...hostServicesOf(o.io), ...(o.webOrigin ? { webOrigin: o.webOrigin } : {}) },
      stdin: streams.stdin,
      stdout: streams.stdout,
      width: size.cols,
      height: size.rows,
      colourTier: o.io.colourTier,
      process: false,
      ...(o.strictGlobals ? { strictGlobals: true } : {}),
      ...(o.diagnosticDetail ? { diagnosticDetail: true } : {}),
      ...(o.signal ? { signal: o.signal } : {}),
      ...(o.io.onFrame ? { onFrame: o.io.onFrame } : {}),
      styles: o.styles,
    });
    const end: TermHubEnd = await hub.closed;
    const exitCode = end.ok ? 0 : end.exit.code !== 0 ? end.exit.code : 1;
    // The terminal is restored: the user reads why it failed in their shell (codes only, no message, no path).
    if (!end.ok) o.io.cells.write(failureText(end) + '\r\n');
    return {
      lastView: receiptView(end.lastView, pages),
      actions: [],
      ok: end.ok,
      exitCode,
      reason: end.reason,
      // Records without detail: nothing that left the mount carries a message.
      problems: end.problems.map((d) => ({ kind: d.kind, code: d.code, name: d.name, ...(d.where ? { where: [...d.where] } : {}), ...(d.page ? { page: d.page } : {}), ...(d.what ? { what: d.what } : {}), ...(o.diagnosticDetail && d.detail ? { detail: d.detail } : {}) } as DevProblem)),
    };
  } finally {
    streams.off();
  }
}

/** The one line a failed mount leaves in the user's terminal: what ended it, in words, with its code when it names one
 *  (UNHANDLED names nothing, so the person reads the words alone; the receipt still carries it). */
export function failureText(end: TermHubEnd): string {
  const first = end.problems[0];
  if (end.exit.reason === 'boot-failed' && end.reason === 'suspended') return 'hoody hub: this account is suspended';
  const why = end.exit.reason === 'boot-failed' ? 'could not start'
    : end.traps.length > 0 ? `stopped: ${trapLabel(end.traps[0]!)} is not available in the terminal`
      : end.exit.reason === 'crash' ? 'stopped after an error'
        : 'closed, but did not clean up fully';
  return 'hoody hub: ' + why + (first && first.code !== 'UNHANDLED' ? ` (${first.code})` : '') + (end.problems.length > 1 ? ` and ${end.problems.length - 1} more in the receipt` : '');
}

/** Every live mount is wired (app/live-wiring.ts): each request is admitted by the send policy (app/live-wire.ts), and a
 *  change leaves only under its own durable record, so an unknown answer stays pending across a restart. */
export function mountTerminalHub(o: HubTermOptions & MountExtras): Promise<Receipt> {
  if (o.diagnosticDetail) return Promise.reject(new Error('TERM_DETAIL_DEV_ONLY: diagnosticDetail is for development mounts (the fixture entry), never a host mount'));
  // The sample account's client (its registered mark) belongs to the demo mount: here it would start as a real session.
  if ((o.client as unknown as Record<symbol, unknown> | null)?.[Symbol.for('hoody.term.demoClient')] === true) return Promise.reject(new Error('TERM_DEMO_CLIENT_LIVE: the demo client mounts through the demo entry only'));
  return mountWith({ ...o, strictGlobals: o.strictGlobals !== false }, (route) => withStoreNotice(liveBoot(o.client, o.context, () => routeHref(route), liveWiringOf(o)), o.store?.notice));
}

/**
 * Where the mount ended, as the host may see it: values from the Hub's own vocabulary only.
 * `page` is a served page's id (else 'home'); `screen` is that page's manifest path, never the address shown (its
 * segments can be ids); `params` is empty: search text is never exported (a host that needs a field asks for it as a
 * decision, with its allowlist).
 */
export function receiptView(v: TermHubEnd['lastView'], pages: readonly PageManifest[]): Receipt['lastView'] {
  const page = pages.find((p) => p.id === v.page) ?? pages.find((p) => p.id === 'home');
  return { page: page?.id ?? 'home', screen: page?.path ?? '/', params: {} };
}

