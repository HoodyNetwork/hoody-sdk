// The rules of a share's rights and limits.
import { describe, expect, it } from "vitest";
import { catalogue } from "./logic";
import { templates } from "./fixtures";
import {
  SHARE_BASE,
  SHARE_MAX_DAYS,
  SHARE_NEVER,
  SHARE_OFFER,
  SHARE_PRESET,
  SHARE_STARTS,
  availableRights,
  cantList,
  effectiveRights,
  neverReason,
  rightsDiff,
  shareBodyV3,
  shareConforms,
  shareFieldEditBody,
  shareLimitsProblems,
  startOf,
  toggleRight,
  type ShareLimits,
} from "./share-logic";
import type { Catalogue, RawToken, Tree } from "./types";

const NOW = Date.parse("2026-10-28T06:00:00.000Z");
const DAY = 86400000;
const R = "aaaaaaaaaaaaaaaaaaaaaaaa";
const ALIAS = "hoody share abcdefghijkl";
const CAT = catalogue(templates);
const LIMITS: ShareLimits = { days: 7, at: null, ips: "", who: "" };
const OFFERED = SHARE_OFFER.map((o) => o.right);

/** Every true leaf of a tree, as dotted paths. */
function leaves(tree: unknown, prefix = "", out: string[] = []): string[] {
  if (!tree || typeof tree !== "object") return out;
  for (const [k, v] of Object.entries(tree as Record<string, unknown>)) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (v === true) out.push(p);
    else if (v && typeof v === "object") leaves(v, p, out);
  }
  return out;
}
const without = (cat: Catalogue, ...drop: string[]): Catalogue => ({
  ...cat,
  rights: cat.rights.filter((r) => !drop.includes(r)),
});
/** A seeded generator, so a failing case can be replayed. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}
const body = (ticked: readonly string[], cat: Catalogue | null = CAT, limits = LIMITS) =>
  shareBodyV3(ALIAS, R, ticked, cat, limits, NOW);

/** A row the page would make today: base only, 7 days, every flag fixed. */
function row(over: Partial<RawToken> = {}, perms: Tree = { computers: { read: true }, projects: { read: true } }): RawToken {
  return {
    id: "t1",
    alias: `${ALIAS} Sam`,
    realm_ids: [R],
    allow_no_realm: false,
    vault_access: false,
    event_access: false,
    is_enabled: true,
    expires_at: new Date(NOW + 7 * DAY).toISOString(),
    ip_whitelist: ["*"],
    permissions: perms,
    ...over,
  };
}

describe("share rights", () => {
  it("the default body is this realm's computers and projects only, for 7 days, with every flag fixed (exact JSON)", () => {
    expect(JSON.stringify(body([]))).toBe(
      JSON.stringify({
        alias: ALIAS,
        permissions: { computers: { read: true }, projects: { read: true } },
        realm_ids: [R],
        allow_no_realm: false,
        vault_access: false,
        event_access: false,
        deny_reauthorization: true,
        expires_at: "2026-11-04T06:00:00.000Z",
      }),
    );
  });

  it("Start and stop is its preset (projects.read is in the base), See only is the base", () => {
    const today = leaves(SHARE_PRESET).sort();
    expect(leaves(body(SHARE_STARTS.act)?.permissions).sort()).toEqual(today);
    expect(leaves(body(SHARE_STARTS.see)?.permissions)).toEqual(["computers.read", "projects.read"]);
    expect(leaves(body(SHARE_STARTS.work)?.permissions).sort()).toEqual(
      [
        "computers.read",
        "projects.read",
        "computers.actions.start",
        "computers.actions.stop",
        "computers.actions.restart",
        "computers.actions.logs",
        "computers.update",
        "computers.actions.exec",
        "computers.features.snapshots",
      ].sort(),
    );
    expect(startOf(SHARE_STARTS.work)).toBe("work");
    expect(startOf(["computers.actions.logs"])).toBe("custom");
    expect(startOf([])).toBe("see");
    // A project right reads as itself, not dropped for its base need.
    expect(startOf(["projects.create"])).toBe("custom");
    expect(effectiveRights(["projects.create"], CAT)).toContain("projects.create");
  });

  it("200 random tick sets, NEVER paths and rights missing from the catalogue included: body ⊆ effective ⊆ (BASE ∪ OFFER) ∩ cat, flags fixed, one realm, end ≤ 365 days", () => {
    const pool = [...OFFERED, ...SHARE_NEVER.map((n) => n.right), "financial.wallet.transfer", "admin.users", "resources.vault", "nope.right", "computers"];
    const next = rng(1240);
    for (let i = 0; i < 200; i++) {
      const ticked = pool.filter(() => next() < 0.35);
      const drop = OFFERED.filter(() => next() < 0.2);
      const cat = next() < 0.1 ? null : without(CAT, ...drop);
      const days = ([1, 7, 30] as const)[Math.floor(next() * 3)] ?? 7;
      const at = next() < 0.3 ? NOW + 1000 + Math.floor(next() * (SHARE_MAX_DAYS * DAY - 1000)) : null;
      const b = body(ticked, cat, { ...LIMITS, days: at ? null : days, at });
      expect(b, `case ${i}`).not.toBeNull();
      const eff = effectiveRights(ticked, cat);
      const sent = leaves(b?.permissions);
      expect(sent.sort(), `case ${i}`).toEqual([...eff].sort());
      for (const r of eff) {
        expect([...SHARE_BASE, ...OFFERED], `case ${i} ${r}`).toContain(r);
        if (!SHARE_BASE.includes(r) && cat) expect(cat.rights, `case ${i} ${r}`).toContain(r);
        expect(neverReason(r), `case ${i} ${r}`).toBeNull();
      }
      expect(b).toMatchObject({ realm_ids: [R], allow_no_realm: false, vault_access: false, event_access: false, deny_reauthorization: true });
      const end = Date.parse(b?.expires_at ?? "");
      expect(end > NOW && end <= NOW + SHARE_MAX_DAYS * DAY, `case ${i}`).toBe(true);
      expect(Object.keys(b ?? {}).sort(), `case ${i}`).toEqual(
        ["alias", "permissions", "realm_ids", "allow_no_realm", "vault_access", "event_access", "deny_reauthorization", "expires_at"].sort(),
      );
    }
  });

  it("OFFER and NEVER never meet, every offered path is a server right, and every server right is base, offered or never", () => {
    for (const o of OFFERED) expect(neverReason(o), o).toBeNull();
    for (const n of SHARE_NEVER) expect(OFFERED.some((o) => o === n.right || o.startsWith(`${n.right}.`)), n.right).toBe(false);
    const full = leaves(templates.find((t) => t.name === "full_access")?.permissions);
    for (const o of [...SHARE_BASE, ...OFFERED]) expect(full, o).toContain(o);
    for (const o of SHARE_OFFER) for (const n of o.needs) expect([...SHARE_BASE, ...OFFERED], `${o.right} needs ${n}`).toContain(n);
    for (const p of full)
      expect(SHARE_BASE.includes(p) || OFFERED.includes(p) || neverReason(p) !== null, `${p} is placed nowhere`).toBe(true);
    expect(new Set(OFFERED).size).toBe(OFFERED.length);
  });

  it("a right dropped from the catalogue after ticking is absent from the effective set and the body", () => {
    const ticked = ["computers.actions.logs", "computers.delete"];
    expect(effectiveRights(ticked, CAT)).toContain("computers.actions.logs");
    const cat = without(CAT, "computers.actions.logs");
    expect(effectiveRights(ticked, cat)).not.toContain("computers.actions.logs");
    expect(leaves(body(ticked, cat)?.permissions)).not.toContain("computers.actions.logs");
    expect(leaves(body(ticked, cat)?.permissions)).toContain("computers.delete");
  });

  it("the catalogue drops computers.update while snapshots stays: snapshots is unavailable, neither is sent, and the effective set changed", () => {
    const ticked = toggleRight([], "computers.features.snapshots", true, CAT);
    expect([...ticked].sort()).toEqual(["computers.features.snapshots", "computers.update"].sort());
    const before = effectiveRights(ticked, CAT);
    const cat = without(CAT, "computers.update");
    expect(availableRights(cat)).not.toContain("computers.features.snapshots");
    expect(availableRights(cat)).not.toContain("computers.update");
    const after = effectiveRights(ticked, cat);
    expect(after).toEqual(["computers.read", "projects.read"]);
    expect(after).not.toEqual(before);
    const sent = leaves(body(ticked, cat)?.permissions);
    expect(sent).not.toContain("computers.features.snapshots");
    expect(sent).not.toContain("computers.update");
    // A prerequisite missing from the catalogue is never re-added by the closure, ticked or not.
    expect(effectiveRights(["computers.features.snapshots"], cat)).toEqual(["computers.read", "projects.read"]);
  });

  it("without a catalogue only the literal starting points are usable", () => {
    expect(effectiveRights(SHARE_STARTS.work, null)).toEqual(effectiveRights(SHARE_STARTS.work, CAT));
    expect(effectiveRights(["computers.delete", ...SHARE_STARTS.act], null)).toEqual(effectiveRights(SHARE_STARTS.act, CAT));
  });

  it("a details edit sends one field only: never expires_at null, never realm_ids, a flag or deny_reauthorization", () => {
    const r = row();
    const who = shareFieldEditBody("who", r, { who: "Alex" }, NOW);
    expect(who).toEqual({ alias: `${ALIAS} Alex` });
    expect(shareFieldEditBody("who", r, { who: "" }, NOW)).toEqual({ alias: ALIAS });
    const at = NOW + 30 * DAY + 1234;
    expect(shareFieldEditBody("ends", r, { at }, NOW)).toEqual({ expires_at: new Date(Math.floor(at / 1000) * 1000).toISOString() });
    expect(shareFieldEditBody("ips", r, { ips: "10.0.0.1, 10.0.0.0/24" }, NOW)).toEqual({ ip_whitelist: ["10.0.0.1", "10.0.0.0/24"] });
    expect(shareFieldEditBody("ips", row({ ip_whitelist: ["10.0.0.1"] }), { ips: "" }, NOW)).toEqual({ ip_whitelist: ["*"] });
    // Nothing to send, or a problem: no body at all.
    expect(shareFieldEditBody("ends", r, { at: null }, NOW)).toBeNull();
    expect(shareFieldEditBody("ends", r, { at: NOW - 1 }, NOW)).toBeNull();
    expect(shareFieldEditBody("ends", r, { at: NOW + SHARE_MAX_DAYS * DAY + 1000 }, NOW)).toBeNull();
    expect(shareFieldEditBody("ips", r, { ips: "10.0.0" }, NOW)).toBeNull();
    expect(shareFieldEditBody("ips", r, { ips: "," }, NOW)).toBeNull();
    expect(shareFieldEditBody("who", r, { who: "Sam" }, NOW)).toBeNull();
    expect(shareFieldEditBody("who", r, { who: "bad/name" }, NOW)).toBeNull();
    expect(shareFieldEditBody("who", row({ alias: "my key" }), { who: "x" }, NOW)).toBeNull();
    const next = rng(44);
    for (let i = 0; i < 100; i++) {
      const field = (["who", "ends", "ips"] as const)[Math.floor(next() * 3)] ?? "who";
      const b = shareFieldEditBody(field, r, { who: `n${i}`, at: NOW + Math.floor(next() * 400 * DAY) - DAY, ips: next() < 0.5 ? "" : "10.1.2.3" }, NOW);
      if (!b) continue;
      expect(Object.keys(b).length, `case ${i}`).toBe(1);
      for (const k of ["realm_ids", "allow_no_realm", "vault_access", "event_access", "deny_reauthorization", "permissions", "is_enabled"])
        expect(b, `case ${i}`).not.toHaveProperty(k);
      if ("expires_at" in b) expect(b.expires_at, `case ${i}`).not.toBeNull();
    }
  });

  it("shareConforms is false for every stored restriction this page doesn't make, and 365 days is one boundary for create, edit and conformance", () => {
    expect(shareConforms(row(), NOW)).toBe(true);
    expect(shareConforms(row({ is_enabled: false }), NOW)).toBe(true);
    const work = body(SHARE_STARTS.work)?.permissions as Tree;
    expect(shareConforms(row({}, work), NOW)).toBe(true);
    const bad: Array<[string, RawToken]> = [
      ["vault true", row({ vault_access: true })],
      ["event true", row({ event_access: true })],
      ["allow_no_realm true", row({ allow_no_realm: true })],
      ["allow_no_realm missing", row({ allow_no_realm: undefined })],
      ["vault missing", row({ vault_access: undefined })],
      ["two realms", row({ realm_ids: [R, "bbbbbbbbbbbbbbbbbbbbbbbb"] })],
      ["no realm", row({ realm_ids: [] })],
      ["bad realm", row({ realm_ids: ["global"] })],
      ["missing base", row({}, { computers: { actions: { start: true } } })],
      ["a NEVER right", row({}, { computers: { read: true }, projects: { read: true }, resources: { vault: true } })],
      ["a money right", row({}, { computers: { read: true }, projects: { read: true }, financial: { wallet: { transfer: true } } })],
      ["an unknown right", row({}, { computers: { read: true, shell: true }, projects: { read: true } })],
      ["unreadable permissions", row({}, { computers: { read: "yes" } } as unknown as Tree)],
      ["an unreadable value beside the base", row({}, { computers: { read: true, actions: "all" } } as unknown as Tree)],
      ["a number beside the base", row({}, { computers: { read: true }, projects: 1 } as unknown as Tree)],
      ["permissions missing", row({ permissions: undefined })],
      ["end past", row({ expires_at: new Date(NOW - 1000).toISOString() })],
      ["end missing", row({ expires_at: null })],
      ["end unreadable", row({ expires_at: "soon" })],
      ["end > 365 days", row({ expires_at: new Date(NOW + SHARE_MAX_DAYS * DAY + 1000).toISOString() })],
      ["closure broken", row({}, { computers: { read: true, features: { snapshots: true } }, projects: { read: true } })],
      ["projects.read missing (it can't be opened)", row({}, { computers: { read: true } })],
      ["not a share alias", row({ alias: "my key" })],
      ["odd address list", row({ ip_whitelist: [42] as unknown as string[] })],
    ];
    for (const [why, r] of bad) expect(shareConforms(r, NOW), why).toBe(false);
    const edge = NOW + SHARE_MAX_DAYS * DAY;
    expect(shareConforms(row({ expires_at: new Date(edge).toISOString() }), NOW)).toBe(true);
    expect(shareConforms(row({ expires_at: new Date(edge + 1000).toISOString() }), NOW)).toBe(false);
    expect(shareLimitsProblems({ ...LIMITS, days: null, at: edge }, NOW)).toEqual({});
    expect(shareLimitsProblems({ ...LIMITS, days: null, at: edge + 1000 }, NOW)).toEqual({ ends: "dateFar" });
    expect(shareFieldEditBody("ends", row(), { at: edge }, NOW)).toEqual({ expires_at: new Date(edge).toISOString() });
    expect(shareFieldEditBody("ends", row(), { at: edge + 1000 }, NOW)).toBeNull();
    expect(body([], CAT, { ...LIMITS, days: null, at: edge })?.expires_at).toBe(new Date(edge).toISOString());
    expect(body([], CAT, { ...LIMITS, days: null, at: edge + 1000 })).toBeNull();
  });

  it("limit problems: an end in the past or missing, a bad address list, a bad name", () => {
    expect(shareLimitsProblems({ ...LIMITS, days: null, at: null }, NOW)).toEqual({ ends: "date" });
    expect(shareLimitsProblems({ ...LIMITS, days: null, at: NOW }, NOW)).toEqual({ ends: "timePast" });
    expect(shareLimitsProblems({ ...LIMITS, ips: "1.2.3" }, NOW)).toEqual({ ips: "ips" });
    expect(shareLimitsProblems({ ...LIMITS, ips: " , " }, NOW)).toEqual({ ips: "ipsNone" });
    expect(shareLimitsProblems({ ...LIMITS, who: "a/b" }, NOW)).toEqual({ who: "who" });
    expect(shareLimitsProblems({ ...LIMITS, days: 9 as 7 }, NOW)).toEqual({ ends: "date" });
    expect(body([], CAT, { ...LIMITS, ips: "1.2.3" })).toBeNull();
    expect(body([], CAT, { ...LIMITS, ips: "10.0.0.1" })?.ip_whitelist).toEqual(["10.0.0.1"]);
  });

  it("prerequisite closure: ticking adds what a right needs, unticking a need drops what depends on it", () => {
    const on = (r: string) => effectiveRights(toggleRight([], r, true, CAT), CAT);
    expect(on("computers.features.snapshots")).toContain("computers.update");
    expect(on("computers.features.ai")).toContain("computers.update");
    expect(on("computers.features.hoody_kit")).toContain("computers.create");
    expect(on("projects.delete")).toContain("projects.read");
    // A base need is never added to the ticks; a catalogue without projects.read offers no project right.
    expect(toggleRight([], "projects.delete", true, CAT)).toEqual(["projects.delete"]);
    const noRead = without(CAT, "projects.read");
    for (const r of ["projects.create", "projects.update", "projects.delete"]) {
      expect(availableRights(noRead), r).not.toContain(r);
      expect(effectiveRights([r], noRead), r).toEqual(["computers.read", "projects.read"]);
    }
    expect(on("resources.ssh_keys")).toContain("computers.update");
    // The body builder closes too, whatever the ticks say.
    expect(leaves(body(["computers.features.kvm"])?.permissions)).toContain("computers.update");
    let t = ["computers.update", "computers.features.snapshots", "computers.features.networking", "computers.features.kvm", "resources.ssh_keys", "computers.features.ai", "computers.actions.logs"];
    t = toggleRight(t, "computers.update", false, CAT);
    expect(t).toEqual(["computers.actions.logs"]);
    // projects.read is base: unticking it changes nothing.
    expect(toggleRight(["projects.create", "projects.delete"], "projects.read", false, CAT)).toEqual(["projects.create", "projects.delete"]);
    // Base can't be unticked, an unavailable right can't be ticked.
    expect(toggleRight([], "computers.read", false, CAT)).toEqual([]);
    expect(toggleRight([], "computers.delete", true, without(CAT, "computers.delete"))).toEqual([]);
    expect(toggleRight([], "resources.vault", true, CAT)).toEqual([]);
  });

  it("cantList never claims what the effective set breaks", () => {
    const has = (ticked: readonly string[]) => cantList(effectiveRights(ticked, CAT));
    for (const r of ["computers.delete", "projects.delete"]) expect(has([r]), r).not.toContain("delete");
    for (const r of ["computers.actions.exec", "computers.actions.logs", "resources.proxy_aliases", "resources.ssh_keys", "computers.features.env_values"])
      expect(has([r]), r).not.toContain("secrets");
    for (const r of ["computers.create", "computers.features.ai", "computers.features.hoody_kit"]) expect(has([r]), r).not.toContain("money");
    expect(has(["computers.actions.start"])).not.toContain("act");
    // Every share sees projects, so there is no "can't see your projects" line.
    expect(has([])).toEqual(["act", "delete", "secrets", "money", "never", "keyEnds"]);
  });

  it("a base-only Review has no 'can't keep access' line, and always the fixed key-ends sentence", () => {
    const lines = cantList(["computers.read", "projects.read"]);
    expect(lines.some((l) => /keep|outlast/i.test(l))).toBe(false);
    expect(lines.at(-1)).toBe("keyEnds");
    expect(cantList(effectiveRights(OFFERED, CAT)).slice(-2)).toEqual(["never", "keyEnds"]);
  });

  it("rightsDiff reads in offer order: new in this share, and not in the new share", () => {
    const old = effectiveRights(["computers.actions.exec", "computers.actions.start"], CAT);
    const neu = effectiveRights(["computers.actions.logs", "computers.actions.start"], CAT);
    expect(rightsDiff(old, neu)).toEqual({ added: ["computers.actions.logs"], removed: ["computers.actions.exec"] });
    expect(rightsDiff(neu, neu)).toEqual({ added: [], removed: [] });
  });
});
