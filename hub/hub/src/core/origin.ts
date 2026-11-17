// origin.ts: where this Hub's Hoody lives. The typed side of shared.js's "The API origin" seam.
//
// Contract:
//   - Two modes. Served (the Hub at /auth/home): the Hoody API is the origin that served the page; every address is
//     built as it always was, and nothing in this file can change that. Standalone (the Hub as one HTML file, opened
//     from any place): the file knows its Hoody (shared.js STANDALONE_ORIGIN); nobody types an address.
//   - The decision is shared.js's alone (hubApiRoot): it does every Hoody API send and the refresh, so it is the last
//     check before a bearer leaves. Core keeps naming the base host API_BASE ('/api/v1') and builds realm and agent
//     hosts from realmDomain() and proxyDomain(); in standalone mode those two read the chosen Hoody's record.
//   - The standalone origin is one this file lists (shared.js checkApiOrigin): STANDALONE_ORIGIN; while the file's
//     alternative differs from it, also that one and this machine over http. The page's link may choose among them
//     with its `hoody` query parameter (standaloneChoice: read once by shared.js from the raw query; any other value
//     is refused and the default used), never with a fragment, a message event or a cookie. One per page load; never
//     changed while a session is stored (shared.js rules).
//   - readHubConfig asks a candidate Hoody for its two domains before it is chosen: one GET without credentials. The
//     same answer carries `hub_file_min`, the oldest one-file Hub build that Hoody works with (standalone/build.ts).
//   - Payments are not sent by the standalone Hub (shared.js refuses them unsent, code STANDALONE_HANDOFF):
//     servedHubUrl() is the link to finish them in the served Hub.
//   - The served Hub offers the one-file Hub as a download only where the page says its Hoody has it (hubFileUrl).
import { hostEnv } from './host-env';
import { setProxyDomainSource } from './hosts';
import { shared, type StandaloneApi, type StandaloneApiSet, type StandaloneChoice } from './session';

export type { StandaloneApi, StandaloneApiSet, StandaloneChoice };

/** The storage key of the chosen Hoody (shared.js STANDALONE_API_KEY; a registry row on both sides). */
export const STANDALONE_API_KEY = 'hub.v3.standalone_api';
/** The served Hub's path on a Hoody API origin. */
const HUB_PAGE = '/auth/home';
const CONFIG_PATH = '/api/v1/hub/config';
const CONFIG_TIMEOUT_MS = 8000;
const HOST_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/;

/** True on the standalone Hub. False wherever shared.js is another implementation (fixtures, tests, the terminal). */
export function isStandalone(): boolean {
  try {
    return shared().hubStandalonePage?.() === true;
  } catch {
    return false;
  }
}

/** The standalone Hub's chosen Hoody, or null (served mode, or none chosen yet). */
export function standaloneApi(): StandaloneApi | null {
  if (!isStandalone()) return null;
  return shared().getStandaloneApi?.() ?? null;
}

// hosts.ts builds every computer address from proxyDomain(): on the standalone Hub that is the chosen Hoody's.
setProxyDomainSource(() => (isStandalone() ? standaloneApi()?.proxyDomain ?? '' : null));

/** '' in served mode (this page's own origin); the chosen origin in standalone mode; null while a standalone page has
 *  none it may send to (none chosen, or storage names another since). */
export function apiOrigin(): string | null {
  if (!isStandalone()) return '';
  const read = shared().hubApiOrigin;
  return read ? read() : null;
}

/** The canonical origin of an address this file lists, or '' when it is refused (shared.js checkApiOrigin). */
export function checkApiOrigin(raw: unknown): string {
  try {
    return shared().checkApiOrigin?.(raw) ?? '';
  } catch {
    return '';
  }
}

/** The Hoody this page's link chose (shared.js standaloneChoice), or null: served mode, or a shared.js without it. */
export function standaloneChoice(): StandaloneChoice | null {
  if (!isStandalone()) return null;
  try {
    const c = shared().standaloneChoice?.() ?? null;
    if (!c || typeof c.origin !== 'string' || checkApiOrigin(c.origin) !== c.origin) return null;
    return c.asked === 'default' || c.asked === 'alt' || c.asked === 'local' || c.asked === 'refused' ? c : null;
  } catch {
    return null;
  }
}

/** Names the standalone Hub's Hoody (shared.js setStandaloneApi): 'set', or why not. Served mode: 'not_standalone'. */
export function setStandaloneApi(cfg: StandaloneApi): StandaloneApiSet {
  const set = isStandalone() ? shared().setStandaloneApi : undefined;
  return set ? set({ origin: cfg.origin, realmApiDomain: cfg.realmApiDomain, proxyDomain: cfg.proxyDomain }) : 'not_standalone';
}

/** Removes the stored choice so the next load asks again; refused while a session is stored. The caller reloads. */
export function clearStandaloneApi(): 'cleared' | 'not_standalone' | 'signed_in' | 'storage' {
  const clear = isStandalone() ? shared().clearStandaloneApi : undefined;
  return clear ? clear() : 'not_standalone';
}

/**
 * The served Hub's address for a Hub route ('/billing'; '' for its start page): this origin's in served mode, the
 * chosen Hoody's in standalone mode ('' while none is chosen). The route is a Hub hash route only: anything that does
 * not start with one slash, or holds white space, is dropped.
 */
export function servedHubUrl(route = ''): string {
  const origin = isStandalone() ? standaloneApi()?.origin ?? '' : pageOrigin();
  if (!origin) return '';
  const hash = /^\/(?!\/)[^\s]*$/.test(route) ? '#' + route : '';
  return origin + HUB_PAGE + hash;
}

/**
 * The origin whose /auth/ pages belong to this Hub, for an address someone else will open (a share text, a QR code, a
 * sign-in link): this page's origin in served mode; the chosen Hoody's in standalone mode, where this page's own place
 * (another site, a file) has no Hoody pages; '' while none is chosen (link nothing then).
 */
export function hubSiteOrigin(): string {
  if (isStandalone()) return standaloneApi()?.origin ?? '';
  return pageOrigin();
}

/** The served Hub's origin, read through the host (web: this page's location; a terminal: the web Hub's address its
 *  mount carries, else none). Never a global read: a terminal has no window. */
function pageOrigin(): string {
  return hostEnv().pageAddress?.origin ?? '';
}

/** The name the one-file Hub is saved under. */
export const HUB_FILE_NAME = 'hoody-hub.html';
/** Where the served Hub's own Hoody answers the one-file Hub as a download. */
const HUB_FILE_PATH = '/auth/' + HUB_FILE_NAME;

/**
 * The address the one-file Hub downloads from, or null when there is none to offer: on the standalone Hub (it is that
 * file), and on a served page whose Hoody did not say it has the file. The API says so on the page it renders
 * (`<html data-hub-file="1">`: set only while its build's file exists), so a control drawn
 * from this never leads to a 404. Fixtures and tests carry no such attribute: null there.
 */
export function hubFileUrl(): string | null {
  // A terminal has no page of its own to say so (and cannot save a file): no offer, and no global read there.
  if (isStandalone() || hostEnv().browserPage !== true) return null;
  try {
    return document.documentElement.getAttribute('data-hub-file') === '1' ? HUB_FILE_PATH : null;
  } catch {
    return null;
  }
}

export type HubConfigRead =
  | {
      ok: true;
      realmApiDomain: string;
      proxyDomain: string;
      /** The oldest one-file Hub build this Hoody works with; null when the answer has no such field (an older Hoody). */
      fileMin: number | null;
    }
  | { ok: false; why: 'invalid' | 'network' | 'refused' | 'shape' };

const domainOf = (v: unknown): string => (typeof v === 'string' && v.length <= 253 && HOST_RE.test(v) ? v : '');
const isFloor = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 1;

/**
 * What a Hoody at `origin` names as its realm API domain and its computers' domain (GET /api/v1/hub/config, public).
 * Sent without credentials or a bearer, to an origin checkApiOrigin accepts and nothing else. A domain that is null
 * or malformed reads as none, and so does a missing file floor. A file floor that is there but is not a whole number
 * from 1 is 'shape': it is never read as no floor (sign-in would be offered to a file that Hoody may refuse).
 * 'network': no answer in time; 'refused': answered, not 2xx; 'shape': not this answer.
 */
export async function readHubConfig(origin: string, timeoutMs = CONFIG_TIMEOUT_MS): Promise<HubConfigRead> {
  const o = checkApiOrigin(origin);
  if (!o || o !== origin) return { ok: false, why: 'invalid' };
  const ctl = new AbortController();
  const timer = setTimeout(() => { ctl.abort(); }, timeoutMs);
  try {
    const res = await globalThis.fetch(o + CONFIG_PATH, { method: 'GET', credentials: 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer', signal: ctl.signal });
    if (!res.ok) return { ok: false, why: 'refused' };
    const body: unknown = await res.json().catch(() => null);
    const data = body && typeof body === 'object' ? (body as { data?: unknown }).data : null;
    if (!data || typeof data !== 'object' || Array.isArray(data)) return { ok: false, why: 'shape' };
    const d = data as { realm_api_domain?: unknown; proxy_domain?: unknown; hub_file_min?: unknown };
    // Both fields are always present in the real answer (null when that Hoody names none).
    if (!Object.hasOwn(d, 'realm_api_domain') || !Object.hasOwn(d, 'proxy_domain')) return { ok: false, why: 'shape' };
    const named = Object.hasOwn(d, 'hub_file_min');
    if (named && !isFloor(d.hub_file_min)) return { ok: false, why: 'shape' };
    return { ok: true, realmApiDomain: domainOf(d.realm_api_domain), proxyDomain: domainOf(d.proxy_domain), fileMin: named ? (d.hub_file_min as number) : null };
  } catch {
    return { ok: false, why: 'network' };
  } finally {
    clearTimeout(timer);
  }
}
