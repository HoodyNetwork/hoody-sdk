// Edit a key: the form opens as the key is; only the groups changed are sent,
// each whole; a fresh read proves an edit only when every field sent reads as sent.
import { ALLOWLIST_MAX } from "@core";
import { describe, expect, it } from "vitest";
import { REALM_A, REALM_B, keys, templates } from "./fixtures";
import {
  canEdit,
  catalogue,
  editBody,
  editChanges,
  editForm,
  editProven,
  guardedEdit,
  normToken,
} from "./logic";
import { shareLimitsProblems } from "./share-logic";
import strings from "./strings.en.json";
import type { NewKeyForm, RawToken } from "./types";

const NOW = Date.UTC(2026, 9, 24, 12);
const DAY = 86400000;
const cat = catalogue(templates);
const key = (i: number) => normToken(keys[i] as RawToken, cat, NOW);
const ci = key(0); // ci-deploy: REALM_A, dev rights, ends in 70 days, one address
const sdk = key(3); // sdk-readonly: all realms, read-only rights
const plain = normToken({ ...(keys[0] as RawToken), id: "f".repeat(24), alias: "plain", realm_ids: [], allow_no_realm: true, permissions: { ...templates[0]?.permissions, resources: { ...(templates[0]?.permissions?.resources as Record<string, boolean>), create_tokens: false } }, expires_at: null, ip_whitelist: [] }, cat, NOW);
const edit = (before: NewKeyForm, over: Partial<NewKeyForm>) => editBody(before, { ...before, ...over }, cat, NOW);

describe("edit: who may be edited", () => {
  it("shares and the agent's own keys get no Edit", () => {
    expect(canEdit(ci)).toBe(true);
    expect(canEdit(key(1))).toBe(false); // hoody-agent auto
    expect(canEdit(key(2))).toBe(false); // hoody-agent realm
    expect(canEdit({ name: "hoody share abcdefghijkl Alex", managed: "" })).toBe(false);
  });
});

describe("edit: the form opens as the key is", () => {
  it("realms, rights, end date and addresses are prefilled", () => {
    const f = editForm(ci, cat);
    expect(f.name).toBe("ci-deploy");
    expect(f.worksIn).toBe("pick");
    expect(f.picked).toEqual([REALM_A]);
    expect(f.access).toBe("choose");
    expect([...f.rights].sort()).toEqual(
      ["computers.read", "computers.update", "computers.actions.start", "computers.actions.stop", "computers.actions.restart", "computers.actions.exec", "computers.actions.logs", "projects.read", "resources.events"].sort(),
    );
    expect(f.ends).toBe("date");
    expect(f.date).toBe((keys[0] as RawToken).expires_at?.slice(0, 10));
    expect(f.ips).toBe("203.0.113.7/32");
  });

  it("a key with Full's rights (events on, vault off) opens as Full; all realms as all; no end as Never", () => {
    const f = editForm(plain, cat);
    expect(f.access).toBe("full");
    expect(f.worksIn).toBe("all");
    expect(f.ends).toBe("never");
    expect(f.ips).toBe("");
  });

  it("untouched, nothing changed and nothing is sent", () => {
    for (const k of [ci, sdk, plain]) {
      const f = editForm(k, cat);
      const r = editBody(f, { ...f }, cat, NOW);
      expect(r.groups).toEqual([]);
      expect(r.body).toEqual({});
    }
  });
});

describe("edit: only what changed is sent, each group whole", () => {
  it("a new name sends {alias} alone, and asks for no 2FA code", () => {
    const r = edit(editForm(ci, cat), { name: " ci-deploy-2 " });
    expect(r.body).toEqual({ alias: "ci-deploy-2" });
    expect(guardedEdit(r.groups)).toBe(false);
  });

  it("a realm added sends the whole list, never all realms", () => {
    const r = edit(editForm(ci, cat), { picked: [REALM_A, REALM_B] });
    expect(r.body).toEqual({ realm_ids: [REALM_A, REALM_B], allow_no_realm: false });
    expect(guardedEdit(r.groups)).toBe(true);
    // A realm-limited key cannot be made an all-realms key (the server refuses: an empty list is every realm).
    expect(edit(editForm(ci, cat), { worksIn: "all" }).errors).toEqual({ realms: "widen" });
    expect(edit(editForm(ci, cat), { picked: [] }).errors).toEqual({ realms: "none" });
    // All realms to some narrows: allowed.
    expect(edit(editForm(sdk, cat), { worksIn: "pick", picked: [REALM_B] }).body).toEqual({ realm_ids: [REALM_B], allow_no_realm: false });
  });

  it("Never sends null; a date sends that day; 90 days from now", () => {
    expect(edit(editForm(ci, cat), { ends: "never" }).body).toEqual({ expires_at: null });
    expect(edit(editForm(plain, cat), { ends: "date", date: "2027-01-15" }).body).toEqual({ expires_at: "2027-01-15T00:00:00.000Z" });
    expect(edit(editForm(plain, cat), { ends: "90d" }).body).toEqual({ expires_at: new Date(NOW + 90 * DAY).toISOString() });
    expect(edit(editForm(plain, cat), { ends: "date", date: "2020-01-01" }).errors).toEqual({ date: "past" });
    // Whole seconds, so the read-back can compare the end exactly.
    const f = editForm(plain, cat);
    expect(editBody(f, { ...f, ends: "1y" }, cat, NOW + 1789).body).toEqual({ expires_at: new Date(NOW + 1000 + 365 * DAY).toISOString() });
  });

  it("an expired end date left as it is is neither checked nor sent", () => {
    const old = normToken({ ...(keys[5] as RawToken) }, cat, NOW + 400 * DAY);
    const f = editForm(old, cat);
    expect(f.ends).toBe("date");
    expect(edit(f, { name: "old-build-bot-2" }).body).toEqual({ alias: "old-build-bot-2" });
  });

  it("addresses are sent whole; emptied, the key works from anywhere ('*'); the same list re-typed is no change", () => {
    expect(edit(editForm(ci, cat), { ips: "203.0.113.7/32, 198.51.100.0/24" }).body).toEqual({ ip_whitelist: ["203.0.113.7/32", "198.51.100.0/24"] });
    expect(edit(editForm(ci, cat), { ips: "" }).body).toEqual({ ip_whitelist: ["*"] });
    expect(edit(editForm(ci, cat), { ips: " 203.0.113.7/32 , " }).groups).toEqual([]);
    expect(edit(editForm(ci, cat), { ips: "10.0.0.999" }).errors).toEqual({ ips: "bad" });
    // More valid addresses than the Hub takes is "many", in its own words; a wrong entry among them is still "bad".
    const many = (n: number) => Array.from({ length: n }, (_, i) => `203.0.113.${i + 1}`).join(", ");
    expect(edit(editForm(ci, cat), { ips: many(ALLOWLIST_MAX) }).errors).toBeUndefined();
    expect(edit(editForm(ci, cat), { ips: many(ALLOWLIST_MAX + 1) }).errors).toEqual({ ips: "many" });
    expect(edit(editForm(ci, cat), { ips: `${many(ALLOWLIST_MAX + 1)}, 10.0.0.999` }).errors).toEqual({ ips: "bad" });
    expect(shareLimitsProblems({ days: 7, at: null, ips: many(ALLOWLIST_MAX + 1), who: "" }, NOW).ips).toBe("ipsMany");
    expect(shareLimitsProblems({ days: 7, at: null, ips: "10.0.0.999", who: "" }, NOW).ips).toBe("ips");
    expect(strings["e.ips.many"]).toContain(String(ALLOWLIST_MAX));
    expect(strings["share.ipsMany"]).toContain(String(ALLOWLIST_MAX));
  });

  it("rights send the tree with vault and events together; Full sends Full's tree (no template, no admin)", () => {
    const r = edit(editForm(ci, cat), { rights: ["computers.read", "resources.vault"] });
    expect(r.body).toEqual({
      permissions: { computers: { read: true }, resources: { vault: true } },
      vault_access: true,
      event_access: false,
    });
    const full = edit(editForm(ci, cat), { access: "full" }).body;
    expect(full?.permission_template).toBeUndefined();
    expect(full?.vault_access).toBe(false);
    expect(full?.event_access).toBe(true);
    expect((full?.permissions as { admin?: unknown }).admin).toBeUndefined();
    expect((full?.permissions?.resources as Record<string, boolean>).create_tokens).toBe(false);
    expect((full?.permissions?.resources as Record<string, boolean>).vault).toBe(false);
    expect((full?.permissions?.computers as Record<string, unknown>).create).toBe(true);
    // Delegation alone changes the access group: the tree goes with create_tokens.
    const del = edit(editForm(plain, cat), { delegate: true }).body;
    expect((del?.permissions?.resources as Record<string, boolean>).create_tokens).toBe(true);
    expect(edit(editForm(ci, cat), { rights: [] }).errors).toEqual({ rights: "none" });
  });

  it("without the catalogue, rights cannot be changed (and an untouched form still sends nothing)", () => {
    const f = editForm(ci, null);
    expect(f.access).toBe("full");
    expect(editBody(f, { ...f, delegate: !f.delegate }, null, NOW).errors).toEqual({ rights: "unavailable" });
    expect(editBody(f, { ...f, name: "x" }, null, NOW).body).toEqual({ alias: "x" });
  });

  it("two groups changed send both, nothing else", () => {
    const f = editForm(ci, cat);
    expect(editChanges(f, { ...f, name: "n", ends: "never" }, cat)).toEqual(["name", "ends"]);
    expect(edit(f, { name: "n", ends: "never" }).body).toEqual({ alias: "n", expires_at: null });
  });
});

describe("edit: a fresh read proves only what was sent", () => {
  const row = (over: Partial<RawToken>): RawToken => ({ ...(keys[0] as RawToken), ...over });
  it("every field sent must read as sent", () => {
    expect(editProven({ alias: "n" }, row({ alias: "n" }))).toBe(true);
    expect(editProven({ alias: "n" }, row({}))).toBe(false);
    expect(editProven({ realm_ids: [REALM_B, REALM_A], allow_no_realm: false }, row({ realm_ids: [REALM_A, REALM_B] }))).toBe(true);
    expect(editProven({ realm_ids: [REALM_B], allow_no_realm: false }, row({}))).toBe(false);
    expect(editProven({ expires_at: null }, row({ expires_at: null }))).toBe(true);
    expect(editProven({ expires_at: null }, row({}))).toBe(false);
    const at = new Date(NOW + 5 * DAY).toISOString();
    expect(editProven({ expires_at: at }, row({ expires_at: new Date(NOW + 5 * DAY + 400).toISOString() }))).toBe(false);
    expect(editProven({ expires_at: at }, row({ expires_at: at }))).toBe(true);
    expect(editProven({ expires_at: at }, row({ expires_at: new Date(NOW + 6 * DAY).toISOString() }))).toBe(false);
    expect(editProven({ ip_whitelist: ["*"] }, row({ ip_whitelist: [] }))).toBe(true);
    expect(editProven({ ip_whitelist: ["*"] }, row({}))).toBe(false);
    const perms = { computers: { read: true }, resources: { vault: true } };
    expect(editProven({ permissions: perms, vault_access: true, event_access: false }, row({ permissions: { computers: { read: true, update: false }, resources: { vault: true } }, vault_access: true, event_access: false }))).toBe(true);
    expect(editProven({ permissions: perms, vault_access: true, event_access: false }, row({ permissions: perms, vault_access: false, event_access: false }))).toBe(false);
    expect(editProven({ permissions: perms }, row({}))).toBe(false);
    expect(editProven({ alias: "n" }, null)).toBe(false);
  });

  it("the end date only exactly; a bare address as its /32; a list holding * as anywhere; an empty or missing body proves nothing", () => {
    const sec = (iso: string) => editProven({ expires_at: "2027-01-01T00:00:00.000Z" }, row({ expires_at: iso }));
    expect(sec("2027-01-01T00:00:00.000Z")).toBe(true);
    expect(sec("2027-01-01T00:00:00Z")).toBe(true);
    expect(sec("2027-01-01T00:00:00.400Z")).toBe(false);
    expect(sec("2026-12-31T23:59:59.600Z")).toBe(false);
    // An unchanged end on another day, or another minute, never proves the new one.
    expect(sec("2026-12-31T23:59:30.000Z")).toBe(false);
    expect(sec("2026-12-31T23:59:59.000Z")).toBe(false);
    expect(editProven({ expires_at: "2027-01-01T12:01:15.000Z" }, row({ expires_at: "2027-01-01T12:00:30.000Z" }))).toBe(false);
    // The server keeps a bare IPv4 address as its /32 range.
    expect(editProven({ ip_whitelist: ["203.0.113.7"] }, row({ ip_whitelist: ["203.0.113.7/32"] }))).toBe(true);
    expect(editProven({ ip_whitelist: ["203.0.113.7/32", "198.51.100.0/24"] }, row({ ip_whitelist: ["198.51.100.0/24", "203.0.113.7"] }))).toBe(true);
    expect(editProven({ ip_whitelist: ["203.0.113.7"] }, row({ ip_whitelist: ["203.0.113.8/32"] }))).toBe(false);
    // The server lets every address in when the list holds "*", whatever else it lists.
    expect(editProven({ ip_whitelist: ["203.0.113.7"] }, row({ ip_whitelist: ["*", "203.0.113.7/32"] }))).toBe(false);
    expect(editProven({ ip_whitelist: ["*"] }, row({ ip_whitelist: ["*", "203.0.113.7/32"] }))).toBe(true);
    expect(editProven({}, row({}))).toBe(false);
    expect(editProven(null, row({}))).toBe(false);
  });
});
