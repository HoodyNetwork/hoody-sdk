// registry.ts: a copy of shared.js AUTH_STORAGE_REGISTRY for fixture mode (hub:dev, page tests), where shared.js is
// not loaded. The live page always asks shared.js itself; registry.test.ts keeps this copy equal to it row for row
// (any intended difference is named there with its reason).
import type { StorageEntry } from './session';

export const STORAGE_REGISTRY: readonly StorageEntry[] = Object.freeze([
  { area: 'local', key: 'access_token', purge: true },
  { area: 'local', key: 'access_token_expires_at', purge: true },
  { area: 'local', key: 'refresh_token', purge: true },
  { area: 'local', key: 'refresh_token_expires_at', purge: true },
  { area: 'local', key: 'auth_intent_token', purge: true },
  { area: 'local', key: 'two_factor_token', purge: true },
  { area: 'local', key: 'hub_token_session_v1', purge: true },
  { area: 'local', key: 'hub_auth_rev', purge: false },
  { area: 'local', key: 'auth_return_to', purge: false },
  { area: 'local', key: 'auth_self_pkce_verifier', purge: false },
  { area: 'session', key: 'auth_flow_nonce', purge: false },
  { area: 'local', prefix: 'hub_boot_token:', purge: true },
  { area: 'local', prefix: 'hub_boot_token_epoch:', purge: false, advance: true },
  { area: 'local', key: 'hub_boot_token_probe', purge: false },
  { area: 'local', key: 'hub_boot_token_ttl_days', purge: false },
  { area: 'local', prefix: 'hub_agent_url:', purge: true },
  { area: 'local', key: 'hub_workspaces_url', purge: true },
  { area: 'local', prefix: 'hub_workspaces_url:', purge: true },
  { area: 'local', prefix: 'hub_notif:', purge: true },
  { area: 'local', prefix: 'hub_notify_seen:', purge: true },
  { area: 'local', prefix: 'hub_notify_shown:', purge: true },
  { area: 'local', prefix: 'hub_notify:', purge: false },
  { area: 'local', key: 'hub_first_run_seen', purge: true },
  { area: 'local', prefix: 'hub_next_idx_', purge: true },
  { area: 'local', prefix: 'hub_active_container:', purge: true },
  { area: 'local', prefix: 'hub_agent_index:', purge: true },
  { area: 'local', key: 'hub_realm_v1', purge: true },
  { area: 'local', prefix: 'hub_active_computer:', purge: true },
  // Held changes that survive a reload (core/change-store.ts): per-account digests, keys and
  // sending stamps, never variables or secrets; they leave with the account.
  { area: 'local', key: 'hub.v3.changes', purge: false, forget: true },
  // Scripts' unsettled asks (pages/scripts writer): per-account ids, idempotency keys and phases, never prompt,
  // reply or script text; kept like hub.v3.changes (C9: no purge drops an ask whose outcome is unknown; only the
  // writer drops its own asks, and Forget this browser the whole key).
  { area: 'local', key: 'hub.v3.script-asks', purge: false, forget: true },
  // The Hub passcode (core/applock.ts): one verifier + try count per account, removed only by Remove and Forget this
  // browser; Lock now's storage fallback stamp, removed by Forget.
  { area: 'local', prefix: 'hub_lock:', purge: false },
  { area: 'local', prefix: 'hub_lock_now:', purge: false, forget: true },
  { area: 'local', key: 'hub_theme_v1', purge: false },
  { area: 'local', key: 'hub_hl_v1', purge: false },
  { area: 'local', key: 'hub_perf_v1', purge: false },
  { area: 'local', key: 'hub_realm_colors', purge: false },
  { area: 'local', key: 'hub_prog_opts_v1', purge: true },
  { area: 'local', key: 'hub_bots_open_row', purge: true },
  { area: 'local', key: 'hub_bots_hide_tasks', purge: true },
  // Bots voice (pages/bots/voice/pending.ts): spoken messages whose fate is not known, per account and computer, identities
  // only ({realm, bot, conn, utt, at}, no audio or text), at most 32 and 24 h; gone at sign-out.
  { area: 'local', key: 'hub_voice_pending_v1', purge: true },
  { area: 'local', key: 'hub_scripts_v1', purge: true },
  { area: 'local', key: 'hub_logs_v1', purge: true },
  { area: 'session', key: 'hub_logs_v1', purge: true },
  // Logs' visitor countries (core/ipgeo.ts): looked-up public addresses and their country, per account, at most 256 entries; gone at sign-out.
  { area: 'session', key: 'hub_ip_geo_v1', purge: true },
  // AI chats let go while their turn ran (core/chat-attention.ts): {computer, realm, sid, at, last} identities only, per
  // account, at most 20 and 24 h; this tab only, gone at sign-out.
  { area: 'session', key: 'hub_ai_attn_v1', purge: true },
  { area: 'local', key: 'hub_apps_recent_v2', purge: true },
  { area: 'local', key: 'hub_apps_recent_v1', purge: true },
  { area: 'local', key: 'hub_notes_v1', purge: true },
  // AI page UI state and its endpoint plan hold, per account; purged at sign-out.
  { area: 'local', key: 'hub_ai_v1', purge: true },
  // New chat's remembered choice (agent, approvals, runs with), per account; purged at sign-out.
  { area: 'local', key: 'hub_ai_new_v1', purge: true },
  // The model picker's favourites, recent picks and remembered filters (kit/pickers/useModelPrefs), per account; purged at sign-out.
  { area: 'local', key: 'hub_models_v1', purge: true },
  // The AI tab's journal (ask/journal): request evidence, migrated Ask evidence, session leases and chat records. Kept at
  // sign-out (a request may be in flight at the agent); removed only by Forget this browser. Equal to shared.js.
  { area: 'local', key: 'hub_ai_req_v1', purge: false, forget: true },
  { area: 'local', key: 'hub_ai_mig_v1', purge: false, forget: true },
  { area: 'local', key: 'hub_ai_lease_v1', purge: false, forget: true },
  { area: 'local', key: 'hub_ai_journal_v1', purge: false, forget: true },
  { area: 'local', key: 'hub_qcmd_v1', purge: true },
  { area: 'local', key: 'hub_home_v1', purge: true },
  // Home web widgets: per account and realm (addresses may carry ids that grant access); purged at sign-out.
  { area: 'local', key: 'hub_homew_v1', purge: true },
  // Board: Boards per account and realm (layout and tile refs, never a secret); kept at sign-out
  // on purpose, read only for the signed-in account's own entries.
  { area: 'local', key: 'hub_boards_v1', purge: false },
  // Board: Closed Boards (closed Boards kept to restore), per account and realm like hub_boards_v1; kept at sign-out.
  { area: 'local', key: 'hub_boards_closed_v1', purge: false },
  // Open with: the remembered program per file type, per account and computer (never a file name); purged at sign-out.
  { area: 'local', key: 'hub_openwith_v1', purge: true },
  // Files Transfers: the routes (project, server) of the computers something moves on, per account (core
  // holds store the same addressing), newest 50; purged at sign-out.
  { area: 'local', key: 'hub_files_routes_v1', purge: true },
  { area: 'local', key: 'hub_sched_ui_v1', purge: true },
  { area: 'local', key: 'hub_ask_v1', purge: true },
  { area: 'local', prefix: 'hub.v3.table.', purge: true },
  { area: 'local', prefix: 'hub.v3.pane.', purge: true },
  { area: 'local', key: 'hub.v3.shell', purge: false },
  { area: 'local', key: 'hub.v3.ask', purge: false },
  // The open chat's Details panel: which tab was last shown (a tab name only, never chat content). Equal to shared.js.
  { area: 'local', key: 'hub.v3.ai.details.tab', purge: false },
  // "Use with your agent": hidden pages and the last picked kind of agent (names only). Equal to shared.js.
  { area: 'local', prefix: 'hub.v3.agentHint.', purge: false },
  { area: 'session', prefix: 'hub_agent_index:', purge: true },
  { area: 'session', key: 'hub_buy_resume', purge: true },
  // The browser-settings band was hidden for this tab session by the account that is leaving.
  { area: 'session', key: 'hub_prefs_band_hidden', purge: true },
  // A model chooser's trip to the AI page and back (core/handoff.ts): per account and computer, 30 minutes, never a secret.
  { area: 'session', key: 'hub_model_handoff_v1', purge: true },
  { area: 'local', key: 'hub_boot_mode', purge: false },
  { area: 'local', prefix: 'hub_tour_v1:', purge: false },
  { area: 'local', key: 'hub_guide_v1', purge: false },
  { area: 'local', key: 'hub_dock_v1', purge: false },
  { area: 'local', key: 'hub_money_upgrade', purge: false },
  { area: 'local', key: 'hub_money_pending', purge: false },
  { area: 'local', key: 'hub_market_pending', purge: false },
  { area: 'local', key: 'hub.v3.topup_pending', purge: false },
  // Unresolved rents (commerce.ts, keyed by attempt and user): kept at sign-out like the top-up.
  { area: 'local', key: 'hub.v3.rent_pending', purge: false },
  { area: 'local', key: 'hub_buy_intent', purge: false },
  { area: 'session', key: 'hub_buy_intent', purge: false },
  { area: 'session', key: 'hub_topup_return', purge: false },
  { area: 'session', key: 'hub_market_resume', purge: false },
  { area: 'session', key: 'hoody_signup_invite', purge: false },
  { area: 'session', key: 'hoody_hub_invite_prefill', purge: false },
  // The referral code from a `?ref=` link (7 days): a pre-sign-up intent, kept like the coupon.
  // Forget this browser also removes it (the person asked this browser to forget): purge stays false.
  { area: 'local', key: 'hoody_ref_v1', purge: false, forget: true },
  // The referral revision (hoody_ref_rev_v1): a fence for a signup answer in flight, never a credential or a
  // user value. It survives every purge (a purge that removed it would unfence a pending answer).
  { area: 'local', key: 'hoody_ref_rev_v1', purge: false },
  // The standalone Hub's chosen Hoody API (origin and its two domains, no credential): it names the Hoody the stored
  // credentials belong to, so no sign-out removes it; Forget this browser does. Equal to shared.js.
  { area: 'local', key: 'hub.v3.standalone_api', purge: false, forget: true },
] as StorageEntry[]);

/** The registry entry for one key in one area, or null (shared.js authStorageEntry). */
export function registryEntry(area: 'local' | 'session', k: string): StorageEntry | null {
  for (const e of STORAGE_REGISTRY) {
    if (e.area !== area) continue;
    if (e.key !== undefined ? k === e.key : typeof k === 'string' && k.indexOf(e.prefix as string) === 0) return e;
  }
  return null;
}
