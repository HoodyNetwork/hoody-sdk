// Every request the keys page may make, declared once. Nothing leaves the page except through a route
// declared here (core refuses anything else unsent).
//
// /auth/tokens is base-only and lists every key: in a realm the list is filtered on the page.
import { accountContainersRoute, computerRuntimeRoute, defineRoute, myIpRoute, TOKEN_MINT_CODES, tokenMintRoute, type Route } from "@core";
import type { RawList, RawTemplate, RawToken } from "./types";

/** Codes a mint refusal may keep (the codes the token routes really return); anything else arrives without one. */
export const MINT_CODES = TOKEN_MINT_CODES;

export const routes = {
  // reads
  list: defineRoute<{ data?: RawToken[]; truncated?: boolean }>({
    method: "GET",
    path: "/auth/tokens",
    scope: "base",
    baseOnly: true,
  }),
  templates: defineRoute<{ data?: RawTemplate[] }>({
    method: "GET",
    path: "/auth/tokens/templates",
    scope: "base",
    baseOnly: true,
  }),
  read: defineRoute<{ data?: RawToken }>({
    method: "GET",
    path: "/auth/tokens/:id",
    scope: "base",
    baseOnly: true,
  }),
  // core's one GET /computers/:id route (the runtime read's; keys sends it without ?runtime): same spec, one route object.
  computer: computerRuntimeRoute as Route<{
    data?: {
      id?: string;
      name?: string;
      ssh_hostname?: string;
      ssh_public_key?: string | null;
    };
  }>,
  myIp: myIpRoute,
  // A realm's computers, for the Share drawer: core's account-wide list with realm_id (the server filters on the
  // realm membership a share token is checked against).
  realmComputers: accountContainersRoute,
  // changes (never retried, never resent: a lost answer is read back)
  // core's one mint route (the boot token's 2FA mint sends through it too): same spec, one route object.
  create: tokenMintRoute as Route<{ data?: RawToken }, Record<string, unknown>>,
  copy: defineRoute<{ data?: RawToken }, Record<string, unknown>>({
    method: "POST",
    path: "/auth/tokens/:id/copy",
    scope: "base",
    baseOnly: true,
    body: ["alias", "expires_at"],
    secret: true,
    codes: MINT_CODES,
  }),
  setEnabled: defineRoute({
    method: "PUT",
    path: "/auth/tokens/:id",
    scope: "base",
    baseOnly: true,
    body: ["is_enabled"],
  }),
  // Edit a key: only the fields changed are sent (logic.ts editBody). Never the secret, never is_enabled (Pause).
  update: defineRoute<{ data?: RawToken }, Record<string, unknown>>({
    method: "PUT",
    path: "/auth/tokens/:id",
    scope: "base",
    baseOnly: true,
    body: [
      "alias",
      "realm_ids",
      "allow_no_realm",
      "permissions",
      "vault_access",
      "event_access",
      "expires_at",
      "ip_whitelist",
    ],
  }),
  remove: defineRoute({
    method: "DELETE",
    path: "/auth/tokens/:id",
    scope: "base",
    baseOnly: true,
  }),
  setSshKey: defineRoute<unknown, { ssh_public_key: string | null }>({
    method: "PUT",
    path: "/computers/:id",
    scope: "realm",
    body: ["ssh_public_key"],
  }),
} as const;

export type { RawList };
