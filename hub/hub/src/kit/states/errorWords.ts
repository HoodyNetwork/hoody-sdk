// The one code-to-words map for errors. A page names what failed ("Couldn't load
// SSH keys"); this map says why and what to do, from the facts core keeps (core/errors.ts). Pages never fork
// it: one page may override one code through `words` instead of restating a sentence from here.
//
// Lookup order: the outcome first (pending, stale, not_sent, cancelled carry the C9 words whatever the code
// says), then the code, then the status class, then the generic line. A pending outcome never gets words
// that say it failed. Words come from outcome, code and status only: core keeps no API message (it can echo what
// was sent), so a realm mismatch, which the API answers with the general 403 code, reads as the general 403 until
// the API sends a code of its own.
import { REALM_LIMIT_CODE, can, isStandalone, realmCapMore, realmCapShown, servedHubUrl, type ErrorInfo } from '@core';
import { makeT, type StringKey, type StringVars } from '../strings';
import stateStrings from './strings.en.json';

type StateKey = StringKey<typeof stateStrings>;
export type ErrorWordKey = Extract<StateKey, `err.${string}`>;

export interface ErrorWords {
  readonly key: ErrorWordKey;
  readonly vars?: StringVars;
  /** One link shown after the sentence (where the person can do it instead), with its words. */
  readonly link?: { readonly href: string; readonly label: StateKey };
}

export interface ErrorWordsOptions {
  /** The call went to a program's URL: a gateway answer there means the program is still starting. */
  readonly program?: boolean;
  /** A page's own sentence for one code (never for an outcome's C9 words). */
  readonly words?: Readonly<Record<string, ErrorWordKey>>;
}

const CODES: Readonly<Record<string, ErrorWordKey>> = {
  INVALID_TOKEN: 'err.signedOut',
  UNAUTHORIZED: 'err.signedOut',
  ACCOUNT_BANNED: 'err.banned',
  INSUFFICIENT_PERMISSIONS: 'err.forbidden',
  FORBIDDEN: 'err.forbidden',
  NOT_FOUND: 'err.notFound',
  CONFLICT: 'err.conflict',
  PRECONDITION_FAILED: 'err.conflict',
  VALIDATION_ERROR: 'err.invalid',
  BAD_REQUEST: 'err.invalid',
  UNSUPPORTED_MEDIA_TYPE: 'err.invalid',
  PAYLOAD_TOO_LARGE: 'err.tooLarge',
  INTERNAL_SERVER_ERROR: 'err.server',
  SERVICE_UNAVAILABLE: 'err.server',
  GATEWAY_TIMEOUT: 'err.slow',
  REQUEST_TIMEOUT: 'err.slow',
  TIMEOUT: 'err.slow',
  // Terminal program refusals: a folder the computer's user cannot enter, a shell that cannot run commands.
  CWD_PERMISSION_DENIED: 'err.folderRefused',
  SHELL_UNSUPPORTED: 'err.shellUnsupported',
  // A computer whose server ended or was reinstalled: nothing can run it again; only Delete is left.
  COMPUTER_EXPIRED: 'err.computerExpired',
  // A write to a computer still being set up (409), or held for review (403): wait, or nothing to do here.
  computer_finalizing: 'err.computerFinalizing',
  computer_quarantined: 'err.computerQuarantined',
};

// The Hub's own refusals (core/api.ts), sent nowhere.
const LOCAL: Readonly<Record<string, ErrorWordKey>> = {
  TOKEN_SESSION_REFUSED: 'err.tokenSession',
  FRAMED_ACTION_REFUSED: 'err.framed',
  // An agent read that needs one realm, asked under All realms (core/kit.ts admit).
  AGENT_REALM_REQUIRED: 'err.realmRequired',
  // The terminal demo (sample data) refuses every change before it is sent: it is the demo, not a failure.
  DEMO_READ_ONLY: 'err.demoReadOnly',
};

// The standalone Hub (one HTML file) sends no payment: shared.js refuses every money route unsent with STANDALONE_HANDOFF.
// The person pays in the served Hub, on the same page; the words link there. A billing settings switch that charges
// nothing (auto-renew, cancel) is refused the same way with its own code, and its words say "change this" instead of
// naming payments. A refusal before sending, so never pending.
const HANDOFFS: Readonly<Record<string, ErrorWordKey>> = {
  STANDALONE_HANDOFF: 'err.standaloneHandoff',
  STANDALONE_SETTINGS_HANDOFF: 'err.standaloneSettings',
};
function handoff(info: ErrorInfo, key: ErrorWordKey): ErrorWords {
  const href = servedHubUrl(info.page ? `/${info.page}` : '');
  return href ? { key, link: { href, label: 'handoff.open' } } : { key };
}

// The account's Realm limit refused a write that would have added a realm (nothing was changed). One sentence for every
// surface, with the way to more realms after it only while the limit is known and a higher plan exists
// (the realm list's last word on the limit) and this sign-in can open Billing; the one-file Hub links the served Hub's.
const BILLING = '/billing';
function realmLimit(): ErrorWords {
  const cap = realmCapShown();
  if (!can('account') || !realmCapMore(cap)) return { key: 'err.realmLimit' };
  const href = isStandalone() ? servedHubUrl(BILLING) : BILLING;
  return href ? { key: 'err.realmLimit', link: { href, label: 'realmLimit.upgrade' } } : { key: 'err.realmLimit' };
}

const GATEWAY = new Set(['BAD_GATEWAY']);
const RATE = new Set(['RATE_LIMITED', 'TOO_MANY_REQUESTS']);

// A leaf's words (perm.<leaf>.do, .right). core's ErrorInfo.perm is a routePerms.ts leaf only; errorWords.test.ts
// holds a do and a right line for every one of them.
const perm = makeT(stateStrings);
function tokenLacks(leaf: string): ErrorWords {
  return { key: 'err.tokenLacks', vars: { do: perm(`perm.${leaf}.do` as StateKey), right: perm(`perm.${leaf}.right` as StateKey) } };
}

function rate(info: ErrorInfo): ErrorWords {
  const ms = info.retryAfterMs;
  return ms !== null && ms > 0 ? { key: 'err.rateLimitedIn', vars: { seconds: Math.ceil(ms / 1000) } } : { key: 'err.rateLimited' };
}

function byStatus(info: ErrorInfo, program: boolean): ErrorWords {
  const st = info.status;
  if (st === null) return { key: 'err.noAnswer' };
  if (st === 401) return { key: 'err.signedOut' };
  if (st === 403) return { key: 'err.forbidden' };
  if (st === 404 || st === 410) return { key: 'err.notFound' };
  if (st === 409 || st === 412) return { key: 'err.conflict' };
  if (st === 413) return { key: 'err.tooLarge' };
  if (st === 429) return rate(info);
  if (st === 502) return { key: program ? 'err.starting' : 'err.server' };
  if (st === 504 || st === 408) return { key: 'err.slow' };
  if (st >= 500) return { key: 'err.server' };
  if (st >= 400) return { key: 'err.invalid' };
  return { key: 'err.generic' };
}

/** The sentence for one error. */
export function errorWords(info: ErrorInfo, opts: ErrorWordsOptions = {}): ErrorWords {
  // C9 first: these never read as a failure, whatever the code.
  if (info.outcome === 'pending') return { key: 'err.pending' };
  if (info.outcome === 'stale') return { key: 'err.stale' };
  if (info.outcome === 'cancelled') return { key: 'err.cancelled' };
  const code = info.code;
  // A shared link's missing permission, named (core: TOKEN_LACKS unsent, or a 403 token.ts named): what it can't do
  // and the right to ask for, never the general 403.
  if (info.perm && (code === 'TOKEN_LACKS' || code === 'INSUFFICIENT_PERMISSIONS') && (info.outcome === 'not_sent' || info.outcome === 'failed')) return tokenLacks(info.perm);
  // A payment or billing setting the standalone Hub hands off to the served Hub (refused unsent; the same words if it
  // ever comes as an answer).
  const handedOff = code && Object.hasOwn(HANDOFFS, code) ? HANDOFFS[code] : undefined;
  if (handedOff) return handoff(info, handedOff);
  // Refused in the browser: only the Hub's own refusals say more than "nothing was sent".
  if (info.outcome === 'not_sent') return { key: code && LOCAL[code] ? LOCAL[code] : 'err.notSent' };
  const own = code ? opts.words?.[code] : undefined;
  if (own) return { key: own };
  if (code === REALM_LIMIT_CODE) return realmLimit();
  if (code && RATE.has(code)) return rate(info);
  if (code && GATEWAY.has(code)) return { key: opts.program ? 'err.starting' : 'err.server' };
  if (code && CODES[code]) return { key: CODES[code] };
  return byStatus(info, !!opts.program);
}

/** Every key the map can answer (errorWords.test.ts: each has a sentence). */
export const ERROR_WORD_KEYS: readonly ErrorWordKey[] = [
  ...new Set<ErrorWordKey>([
    ...Object.values(CODES),
    ...Object.values(LOCAL),
    ...Object.values(HANDOFFS),
    'err.realmLimit',
    'err.pending',
    'err.stale',
    'err.cancelled',
    'err.notSent',
    'err.rateLimited',
    'err.rateLimitedIn',
    'err.starting',
    'err.server',
    'err.noAnswer',
    'err.generic',
    'err.tokenLacks',
  ]),
];
