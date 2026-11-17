// The sentences a failed or unknown request shows on this page. A code, an HTTP status and a few typed
// fields choose a sentence; the agent's own message is never read, so nothing it says (a key prefix, an
// internal host) can reach the screen. An unknown outcome on a write is "Not confirmed" (never "not saved"):
// the flow then reads back.
import { str, t, tk } from './logic';
import type { Outcome, Words } from './types';

/** The computer's name for text: an empty name reads "this computer". */
function pub(s: unknown): string {
  return str(s) ? s : t('name.computer');
}

const BY_CODE: Record<string, string> = {
  bad_request: 'err.reload',
  provider_field_immutable: 'err.reload',
  realm_scope_unsupported: 'err.reload',
  oauth_unsupported: 'err.reload',
  idempotency_key_reused: 'err.reload',
  invalid_realm: 'err.realm',
  realm_not_found: 'err.realm',
  admin_unauthorized: 'err.admin',
  forbidden: 'err.forbidden',
  job_not_found: 'err.jobGone',
  unknown_agent: 'cc.unavailable',
  provider_exists: 'err.nameTaken',
  model_prefix_taken: 'err.nameTaken',
  provider_builtin: 'err.builtin',
  provider_not_managed: 'err.builtin',
  oauth_in_progress: 'err.oauthBusy',
  definition_changed: 'err.defChanged',
  delegated_agent_unavailable: 'use.claude',
  provider_invalid: 'err.field',
  api_key_refused: 'err.keyRefused',
  auth_method_unsupported: 'err.noKey',
  credential_not_stored: 'err.connectFirst',
  store_failed: 'err.store',
};

export interface ErrorOpts {
  /** The provider's display name (never a raw id). */
  provider?: string;
  computer?: string;
  /** The failed call changed something. */
  write?: boolean;
  /** The failed call read a realm. */
  realmRead?: boolean;
}

export interface ErrorWords extends Words {
  field?: string;
  retryAfter?: number;
}

/** The refusal of a model the agent can't use, in words. */
function modelRefusal(e: Outcome, o: ErrorOpts, v: Record<string, string>): Words {
  const reason = e.details.reason;
  const named = !!o.provider;
  let key: string;
  if (reason === 'no_credentials') key = named ? 'use.needsKey' : 'use.needsKeyAny';
  else if (reason === 'unknown_model') key = 'use.gone';
  else if (reason === 'fusion') key = 'use.fusion';
  else if (reason === 'speech_model') key = 'use.speech';
  else key = 'use.unsupported';
  return { key, text: tk(key, v) };
}

export function errorText(e: Outcome, o: ErrorOpts = {}): ErrorWords {
  const v: Record<string, string | number> = {
    // A display name the catalogue already made public (core providers names Hoody AI itself).
    provider: str(o.provider) ? o.provider : t('name.provider'),
    computer: pub(o.computer),
  };
  let key: string;
  // READ_BACK_FIRST: an earlier send of this change is still unread, so it may have gone through (never "not sent").
  if (e.kind === 'not_sent' && e.code === 'READ_BACK_FIRST') key = 'err.notConfirmed';
  else if (e.kind === 'not_sent') key = 'err.notSent';
  else if (e.kind === 'pending') key = e.code === 'store_failed' ? 'err.store' : o.write ? 'err.notConfirmed' : 'err.load';
  else if (e.code === 'model_unavailable' || e.code === 'unsupported_setting') return modelRefusal(e, o, v as Record<string, string>);
  else if (e.code === 'not_found') key = o.realmRead ? 'err.realm' : 'err.providerGone';
  else if (BY_CODE[e.code]) key = BY_CODE[e.code] as string;
  else if (e.status === 413) key = 'err.tooLong';
  else if (e.status === 429) key = typeof e.retryAfter === 'number' && e.retryAfter > 0 ? 'err.rate' : 'err.rateSoon';
  else if (e.status === 403) key = 'err.forbidden';
  else key = o.write ? 'err.reload' : 'err.load';
  if (key === 'err.rate' && e.retryAfter !== null) v.n = v.count = Math.ceil(e.retryAfter);
  const r: ErrorWords = { key, text: tk(key, v) };
  if (key === 'err.field' && typeof e.details.field === 'string') r.field = e.details.field;
  if (typeof e.retryAfter === 'number') r.retryAfter = e.retryAfter;
  return r;
}
