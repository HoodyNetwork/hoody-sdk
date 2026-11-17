// Every share must open. The API's token sign-in page refuses a
// key without computers.read and projects.read ("This shared access doesn't include computers"), and the Hub's own
// session check (core/token.ts minimumHeld) ends such a session as invalid. A share made here must hold both, for every
// starting point, with or without the catalogue; and a listed share that can't open says so.
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { monorepoPath } from "@core/test/monorepo";
import { capsOf, minimumHeld } from "@core/token";
import { SHARE_BASE, SHARE_OFFER, SHARE_STARTS, shareBodyV3, shareRows } from "./share-logic";
import type { Catalogue, RawToken, Tree } from "./types";

const NOW = Date.parse("2026-11-10T06:00:00.000Z");
const R = "aaaaaaaaaaaaaaaaaaaaaaaa";
const LIMITS = { days: 7 as const, at: null, ips: "", who: "" };
const FULL: Catalogue = {
  rights: ["computers.read", "projects.read", ...SHARE_OFFER.map((o) => o.right)],
  full: null,
  billing: false,
  templates: [],
};
const opens = (perms: Tree | undefined) => minimumHeld(capsOf({ perms: perms ?? {}, eventAccess: false, vaultAccess: false }));

// The API's sign-in page, the one api.hoody.* serves, read from the monorepo (a copy beside this Hub can lag a rename).
// Outside the monorepo the two tests that read it are skipped; inside it a missing file is a failure.
const SIGNIN_AT = monorepoPath(process.env.HOODY_TOKEN_LOGIN_JS, "hoody-api", "public", "auth", "token-login.js");
const SIGNIN = SIGNIN_AT ?? "";

describe("every share opens at sign-in", () => {
  for (const cat of [FULL, null] as const)
    for (const [k, ticked] of Object.entries(SHARE_STARTS))
      it(`start ${k} (${cat ? "catalogue" : "no catalogue"}) holds the sign-in minimum`, () => {
        const b = shareBodyV3("hoody share abcdefghijkl", R, ticked, cat, LIMITS, NOW);
        expect(b).not.toBeNull();
        expect(opens(b?.permissions)).toBe(true);
      });

  it.skipIf(SIGNIN_AT === null)("the sign-in page's source is present (a missing file is a failure, not a skip)", () => expect(existsSync(SIGNIN)).toBe(true));

  it.skipIf(SIGNIN_AT === null)("every leaf the sign-in page requires is in the share base", () => {
    const src = existsSync(SIGNIN) ? readFileSync(SIGNIN, "utf8") : "";
    const m = /var MIN_LEAVES = \[([^\]]*)\];/.exec(src);
    const leaves = (m?.[1] ?? "").split(",").map((s) => s.trim().replace(/^'|'$/g, "")).filter(Boolean);
    expect(leaves.length).toBeGreaterThan(0);
    for (const l of leaves) expect(SHARE_BASE, l).toContain(l);
  });

  it("a listed share that can't open says so; one that can, doesn't", () => {
    const row = (perms: Tree, id: string): RawToken =>
      ({
        id,
        alias: `hoody share ${id.padEnd(12, "x").slice(0, 12)}`,
        permissions: perms,
        realm_ids: [R],
        allow_no_realm: false,
        vault_access: false,
        event_access: false,
        is_enabled: true,
        created_at: "2026-11-09T06:00:00.000Z",
        expires_at: "2026-11-12T06:00:00.000Z",
      }) as unknown as RawToken;
    const rows = shareRows(
      [row({ computers: { read: true } } as Tree, "old"), row({ computers: { read: true }, projects: { read: true } } as Tree, "new")],
      R,
      [],
      NOW,
    );
    expect(Object.fromEntries(rows.map((r) => [r.id, r.opens]))).toEqual({ old: false, new: true });
  });
});
