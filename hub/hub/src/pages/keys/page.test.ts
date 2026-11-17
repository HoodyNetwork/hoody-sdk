// Vitest: the keys page's rules and its interaction in the fixture states.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { showToast } from "@kit";
import {
  act,
  fireEvent,
  render,
  renderHook,
  renderPage,
  screen,
  userEvent,
  waitFor,
  within,
} from "@app/testing";
import { capture, defineMutation, fixtureWorld, heldChanges } from "@core";
import { setTarget } from "@core/shell";
import { resetChanges } from "@core/changes";
import { bump, setIdentity, setRealm } from "@core/ctx";
import { useRealm } from "./data";
import { ledgerFor, resetLedgers } from "./share-logic";
import { appendIp, parseAllowlist, privateV4 } from "@core";
import { useMintFlow } from "./parts/mint-flow";
import {
  heldAttempts,
  holdAttempt,
  MAX_ATTEMPTS,
  resetAttempts,
  type AttemptHold,
} from "@core/attempts";
import {
  ATTEMPT_PREFIX,
  readChanges,
  setChangeStoreAdapter,
  writeChanges,
} from "@core/change-store";
import {
  isChangePending,
  settleOwn,
  useFreshComputer,
  useKeyReader,
  useRemoveKey,
  useSetEnabled,
  useSetSshKey,
  useSettleChange,
  useStopShare,
} from "./data";
import { routes } from "./routes";
import { forgetKept } from "./parts/SshTab";
import { DismissButton } from "./parts/Dismiss";
import { createElement } from "react";
import {
  catalogue,
  copyBody,
  errKey,
  groupState,
  handleOf,
  findByHandle,
  inRealmBody,
  newForm,
  normToken,
  sameScope,
  toBody,
  toggleGroup,
  view,
  worksIn,
} from "./logic";
import {
  blocked,
  dismissUnknown,
  freshAlias,
  isShareRow,
  nonce,
  shareBodyV3,
  settle,
  take,
  TOKEN_RE,
  unknownAliases,
} from "./share-logic";
import { applied, checkSshKey, keyPrint, sshKeyDisplay } from "./ssh-logic";
import {
  REALM_A,
  REALM_B,
  createBodies,
  keys as fixtureKeys,
  myIpGate,
  releaseShare,
  sent,
  slowGate,
  shares,
  templates,
} from "./fixtures";
import page from "./page";

// Another page's SSH change (as computers/data.ts sshKey sends it): the same lock, another sender, no body print.
const computersSsh = defineMutation<{ id: string; key: string | null }>(
  routes.setSshKey,
  {
    input: (v) => ({
      params: { id: v.id },
      body: { ssh_public_key: v.key ?? "" },
    }),
    lock: "computer.ssh_key",
    lockKey: (v) => ({ computer: v.id }),
    identity: (v) => ({ computer: v.id, key: "fixture-print" }),
    reads: [],
  },
);
// A sender whose identity looks like this page's (a body print): only core's sender record tells them apart.
const computersSshLookalike = defineMutation<{
  id: string;
  key: string | null;
}>(routes.setSshKey, {
  input: (v) => ({
    params: { id: v.id },
    body: { ssh_public_key: v.key ?? "" },
  }),
  lock: "computer.ssh_key",
  lockKey: (v) => ({ computer: v.id }),
  identity: (v) => ({
    computer: v.id,
    key: "fixture-print",
    body: "fixture-body",
  }),
  reads: [],
});
// Another page's delete of a key (any page sending the same route): another sender of the same lock.
const otherPageRemove = defineMutation<{ id: string }>(routes.remove, {
  input: (v) => ({ params: { id: v.id } }),
  page: "account",
});
import strings from "./strings.en.json";

/** The share's Create is on its Review step: Review first (it waits for the rights list). */
async function toReviewed() {
  const d = await screen.findByRole("dialog");
  const go = await within(d).findByRole("button", { name: strings["share.review"] });
  await waitFor(() => expect(go).toBeEnabled(), { timeout: 8000 });
  await userEvent.click(go);
  return within(d).findByRole("button", { name: strings["share.create"] });
}
import ipStrings from "@kit/forms/IpAllowlistField.strings.en.json";

/** A key is pasted, as people do: one input event (typing ~100 characters one by one re-renders the page per key,
 *  which under host load alone outlasts the test timeout). */
const pasteInto = async (el: HTMLElement, text: string) => {
  await userEvent.click(el);
  await userEvent.paste(text);
};

// Pages this Hub hides in a test (usePageLink answers null for them, as the shell does).
const hiddenPages = vi.hoisted(() => new Set<string>());
vi.mock("@shell/pageLinks", async (orig) => {
  const shell = await orig<
    Record<string, unknown> & { usePageLink: (id: string) => unknown }
  >();
  function usePageLinkUnlessHidden(id: string): unknown {
    const link = shell.usePageLink(id);
    return hiddenPages.has(id) ? null : link;
  }
  return { ...shell, usePageLink: usePageLinkUnlessHidden };
});
vi.mock("@kit", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  showToast: vi.fn(),
}));

const cat = catalogue(templates);
const NOW = Date.now();
const keys = fixtureKeys.map((r) => normToken(r, cat, NOW));
const byName = (n: string) => {
  const k = keys.find((x) => x.name === n);
  if (!k) throw new Error(`no fixture key ${n}`);
  return k;
};

describe("rights catalogue", () => {
  it("leaves out admin and key-making from Full", () => {
    expect(cat.rights).not.toContain("admin.users");
    expect(cat.rights).not.toContain("resources.create_tokens");
    expect(cat.rights).toContain("computers.actions.start");
    expect(cat.billing).toBe(true);
  });
  it("reads a key as full, a template, or some rights", () => {
    expect(byName("hoody-agent auto 7f3a").access?.full).toBe(true);
    expect(byName("sdk-readonly").access?.tmpl).toBe("read_only");
    expect(byName("ci-deploy").access?.full).toBe(false);
  });
  it("ticks a group as a whole", () => {
    const g = cat.rights.filter((p) => p.startsWith("projects."));
    expect(groupState(g, [])).toBe("none");
    expect(groupState(g, toggleGroup(g, [], true))).toBe("all");
    expect(groupState(g, g.slice(0, 1))).toBe("some");
  });
});

describe("list view", () => {
  it("narrows to a realm and keeps All realms keys read-only", () => {
    const v = view(keys, REALM_A);
    expect(v.rows.every((r) => worksIn(r.key, REALM_A))).toBe(true);
    expect(
      v.rows.find((r) => r.key.name === "hoody-agent auto 7f3a")?.editable,
    ).toBe(false);
    expect(v.rows.find((r) => r.key.name === "ci-deploy")?.editable).toBe(true);
    expect(v.rows.some((r) => r.key.name === "finance-export")).toBe(false);
  });
  it("counts expired keys", () => {
    expect(view(keys, "all").expired).toBe(1);
  });
  it("selects by a handle that never holds the whole id", () => {
    const k = byName("ci-deploy");
    expect(handleOf(k)).not.toContain(k.id);
    expect(findByHandle(keys, handleOf(k))?.id).toBe(k.id);
    expect(findByHandle(keys, "hdy_0000.000000")).toBeUndefined();
  });
});

describe("making a key", () => {
  it("sends Full as the whole catalogue minus the left-out rights", () => {
    const f = newForm("all");
    f.name = "ci";
    const r = toBody(f, cat, NOW);
    expect(r.errors).toBeUndefined();
    expect(r.body?.alias).toBe("ci");
  });
  it("refuses empty names, no rights and bad addresses before sending", () => {
    const f = newForm("all");
    expect(toBody(f, cat, NOW).errors).toMatchObject({ name: "required" });
    f.name = "ok";
    f.access = "choose";
    expect(toBody(f, cat, NOW).errors).toMatchObject({ rights: "none" });
    f.access = "full";
    f.ips = "999.1.1.1";
    expect(toBody(f, cat, NOW).errors).toMatchObject({ ips: "bad" });
  });
  it("binds a key made in a realm to exactly that realm", () => {
    const f = newForm(REALM_A);
    f.name = "ci";
    const r = toBody(f, cat, NOW);
    expect(r.body && inRealmBody(r.body, REALM_A)).toBe(true);
    expect(r.body && inRealmBody(r.body, REALM_B)).toBe(false);
    expect(r.body?.allow_no_realm).toBe(false);
  });
  it("copies with the same scope or says it changed", () => {
    const k = byName("ci-deploy");
    expect(sameScope(k, normToken(fixtureKeys[0], cat, NOW))).toBe(true);
    expect(sameScope(k, byName("sdk-readonly"))).toBe(false);
    expect(
      copyBody({ name: "", ends: "same", date: "" }, NOW).errors,
    ).toBeUndefined();
  });
  it("reads addresses and your own address safely", () => {
    expect(parseAllowlist("203.0.113.7, 198.51.100.0/24").entries).toEqual([
      "203.0.113.7",
      "198.51.100.0/24",
    ]);
    expect(appendIp("203.0.113.7", "203.0.113.7")).toBe("203.0.113.7");
    expect(privateV4("10.1.2.3")).toBe(true);
    expect(privateV4("203.0.113.7")).toBe(false);
  });
  it("words codes without leaking unknown ones", () => {
    expect(errKey("DUPLICATE_ALIAS", true)).toBe("DUPLICATE_ALIAS");
    expect(errKey("SOMETHING_ELSE", true)).not.toContain("SOMETHING");
  });
});

describe("ssh key", () => {
  const pub =
    "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFakeFixtureKeyOnly0000000000000000 ana@laptop";
  it("refuses a private key first and anything that is not a public key", () => {
    expect(checkSshKey(["-----BEGIN", "OPENSSH PRIVATE KEY-----\nAAAA"].join(" "))).toEqual({
      ok: false,
      code: "private",
    });
    expect(checkSshKey("")).toEqual({ ok: false, code: "empty" });
    expect(checkSshKey("hello world")).toEqual({ ok: false, code: "notkey" });
    expect(checkSshKey(pub)).toEqual({ ok: true, key: pub });
  });
  it("shows the comment first and the tail of the key, never the head", () => {
    const d = sshKeyDisplay(pub);
    expect(d?.name).toBe("ana@laptop");
    expect(d?.detail.startsWith("ssh-ed25519 …")).toBe(true);
    expect(sshKeyDisplay("ssh-ed25519 AAAA‮evil")?.name).toBeNull();
  });
  it("compares a read-back with what was sent", () => {
    expect(applied(pub, pub)).toBe(true);
    expect(applied("", null)).toBe(true);
    expect(applied(pub, null)).toBe(false);
    // A server that keeps the key without its comment (or with other spacing) still holds what was sent.
    const bare = pub.split(" ").slice(0, 2).join(" ");
    expect(applied(bare, pub)).toBe(true);
    expect(applied(`  ${bare}   other@host `, pub)).toBe(true);
    expect(applied(bare.replace("AAAAC3", "AAAAC4"), pub)).toBe(false);
    // The shared-lock print is computers/data.ts keyPrint: '' and null are 'none', spacing at the ends ignored.
    expect(keyPrint("")).toBe("none");
    expect(keyPrint(null)).toBe("none");
    expect(keyPrint(` ${pub} `)).toBe(keyPrint(pub));
  });
});

describe("shared access", () => {
  it("asks for the reviewed authority only", () => {
    const b = shareBodyV3(`hoody share ${nonce()}`, REALM_A, [], null, { days: 7, at: null, ips: "", who: "" }, NOW);
    expect(b?.allow_no_realm).toBe(false);
    expect(b?.realm_ids).toEqual([REALM_A]);
    expect(b?.vault_access).toBe(false);
    // A new share starts as See only: this realm's computers and projects (projects.read is a base right).
    expect(b?.permissions).toEqual({ computers: { read: true }, projects: { read: true } });
  });
  it("keeps no token-shaped id and takes the token apart", () => {
    const tok = `hdy_${"a1".repeat(12)}_${"0f".repeat(24)}`;
    expect(TOKEN_RE.test(tok)).toBe(true);
    expect(take({ data: { id: tok, token: tok } }).id).toBeNull();
    expect(take({ data: { id: "abc", token: tok } }).token).toBe(tok);
  });
  it("blocks a second create while one is unresolved, and settles only what a read can prove", () => {
    const led = [
      { alias: freshAlias([]), state: "unknown" as const, id: null },
    ];
    expect(blocked(led, false)).toBe(true);
    const was = led.map((x) => x.state);
    settle(led, was, [], true, NOW);
    expect(led[0]?.state).toBe("unknown");
    // A whole list without its alias proves nothing either: the create may still be in work.
    settle(led, was, [], false, NOW);
    expect(led[0]?.state).toBe("unknown");
    expect(blocked(led, false)).toBe(true);
    // Only the person's warned Dismiss ends it.
    dismissUnknown(led, unknownAliases(led));
    expect(led[0]?.state).toBe("none");
    expect(blocked(led, false)).toBe(false);
  });
  it("lists only live shares of the realm", () => {
    const rows = shares;
    expect(rows.filter((r) => isShareRow(r, REALM_A, NOW))).toHaveLength(2);
    expect(rows.filter((r) => isShareRow(r, REALM_B, NOW))).toHaveLength(0);
  });
});

/** A new world for core's attempt holds: storage and this tab's copy (a fresh browser, no tab holding anything). */
function forgetUnresolved(): void {
  const kept = readChanges();
  if (kept) writeChanges(kept.filter((r) => !r.id.startsWith(ATTEMPT_PREFIX)));
  resetAttempts();
}

/** Storage that cannot be read (a blocked or broken store): core keeps a hold in this tab only. */
function unreadableStore(): void {
  setChangeStoreAdapter({
    read: () => {
      throw new Error("blocked");
    },
    write: () => false,
  });
}

/** A browser's cross-tab lock (navigator.locks), first come first served. happy-dom has none, and core refuses
 *  every hold without one (NOT_DURABLE): each test gets one, and "no locks" is a test of its own. */
function fifoLocks(): void {
  let tail: Promise<unknown> = Promise.resolve();
  Object.defineProperty(globalThis.navigator, "locks", {
    configurable: true,
    value: {
      request: (_name: string, cb: () => unknown) => {
        const r = tail.then(cb);
        tail = r.then(
          () => undefined,
          () => undefined,
        );
        return r;
      },
    },
  });
}

/** Holds core's next store-locked step (navigator.locks, armed once) until the returned function runs. */
function holdNextStoreLock(): () => void {
  let open: () => void = () => {};
  const gate = new Promise<void>((r) => (open = r));
  let armed = true;
  Object.defineProperty(globalThis.navigator, "locks", {
    configurable: true,
    value: {
      request: (_name: string, cb: () => unknown) => {
        if (!armed) return Promise.resolve().then(cb);
        armed = false;
        return gate.then(cb);
      },
    },
  });
  return () => open();
}

describe("keys page", () => {
  beforeEach(() => {
    forgetUnresolved();
    resetChanges();
    resetLedgers();
    fifoLocks();
    slowGate.reset();
  });
  afterEach(() => {
    Reflect.deleteProperty(globalThis.navigator, "locks");
    // A held answer never outlives its test, even a failed one.
    slowGate.reset();
  });
  it("lists the keys", async () => {
    await renderPage(page);
    expect(
      await screen.findByRole("row", { name: /ci-deploy/ }, { timeout: 5000 }),
    ).toBeInTheDocument();
  });
  it("shows the empty state with the first-key action", async () => {
    await renderPage(page, { state: "empty" });
    expect(
      await screen.findByText(strings["st.empty.title"], undefined, {
        timeout: 5000,
      }),
    ).toBeInTheDocument();
  });
  it("shows a failed list with a retry", async () => {
    await renderPage(page, { state: "error" });
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });
  it("shows the key once, then wipes it when the drawer closes", async () => {
    await renderPage(page);
    await screen.findByText("ci-deploy");
    await userEvent.click(
      screen.getAllByRole("button", {
        name: strings["action.new"],
      })[0] as HTMLElement,
    );
    await userEvent.type(
      await screen.findByLabelText(strings["nk.name"]),
      "ci",
    );
    await userEvent.click(
      screen.getByRole("button", { name: strings["nk.go"] }),
    );
    expect(await screen.findByText(strings["sh.warn"])).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("f3f3f3f3");
    await userEvent.keyboard("{Escape}");
    expect(await screen.findByText(strings["sh.closeAsk"])).toBeInTheDocument();
    expect(screen.getByText(strings["sh.warn"])).toBeInTheDocument();
    await userEvent.click(
      within(screen.getByRole("alert")).getByRole("button", {
        name: strings["sh.closeNow"],
      }),
    );
    await waitFor(() =>
      expect(screen.queryByText(strings["sh.warn"])).toBeNull(),
    );
    expect(document.body.textContent).not.toContain("f3f3f3f3");
  });
  it("says plainly when it cannot confirm a key was made, and never resends", async () => {
    await renderPage(page, { state: "pendingOps" });
    await screen.findByText("ci-deploy");
    await userEvent.click(
      screen.getAllByRole("button", {
        name: strings["action.new"],
      })[0] as HTMLElement,
    );
    await userEvent.type(
      await screen.findByLabelText(strings["nk.name"]),
      "ci",
    );
    await userEvent.click(
      screen.getByRole("button", { name: strings["nk.go"] }),
    );
    expect(await screen.findByText(strings["pd.title"])).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: strings["action.checkAgain"] }),
    ).toBeInTheDocument();
  });
  it("C9: a held create offers the warned Dismiss even while a namesake is listed", async () => {
    sent.appeared = 0;
    forgetUnresolved();
    await renderPage(page, { state: "pendingAppeared" });
    await screen.findByText("ci-deploy");
    await userEvent.click(
      screen.getAllByRole("button", {
        name: strings["action.new"],
      })[0] as HTMLElement,
    );
    await userEvent.type(
      await screen.findByLabelText(strings["nk.name"]),
      "ci",
    );
    await userEvent.click(
      screen.getByRole("button", { name: strings["nk.go"] }),
    );
    expect(await screen.findByText(strings["pd.appeared"])).toBeInTheDocument();
    expect(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: strings["dismiss.act"],
      }),
    ).toBeInTheDocument();
    forgetUnresolved();
  }, 40000);
  it("a named copy lost the same way gets the same next steps", async () => {
    sent.appeared = 0;
    await renderPage(page, { state: "pendingAppeared" });
    await openRow(/ci-deploy/);
    await userEvent.click(await screen.findByRole("button", { name: strings["act.copy"] }));
    const drawer = await screen.findByRole("dialog");
    await userEvent.type(within(drawer).getByLabelText(strings["nk.name"]), "ci");
    await userEvent.click(within(drawer).getByRole("button", { name: strings["cp.go"] }));
    expect(await within(drawer).findByText(strings["pd.next"])).toBeInTheDocument();
    await userEvent.click(within(drawer).getByRole("button", { name: strings["action.checkAgain"] }));
    expect(await within(drawer).findByText(strings["pd.stepYours"])).toBeInTheDocument();
    // Settled, the copy drawer's Close is the primary too, and it closes the drawer.
    expect(within(drawer).queryByRole("button", { name: strings["action.checkAgain"] })).toBeNull();
    // The drawer's x is also named Close: the footer's is the one primary.
    const closes = within(drawer).getAllByRole("button", { name: strings["pd.close"] });
    const primary = closes.filter((b) => b.getAttribute("data-variant") === "primary");
    expect(primary).toHaveLength(1);
    const close = primary[0] as HTMLElement;
    await userEvent.click(close);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    forgetUnresolved();
  }, 40000);
  it("keys that appeared after a lost create come with the next step, and a proving read says what is left to do", async () => {
    sent.appeared = 0;
    await renderPage(page, { state: "pendingAppeared" });
    await screen.findByText("ci-deploy");
    await userEvent.click(
      screen.getAllByRole("button", { name: strings["action.new"] })[0] as HTMLElement,
    );
    await userEvent.type(await screen.findByLabelText(strings["nk.name"]), "ci");
    await userEvent.click(screen.getByRole("button", { name: strings["nk.go"] }));
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText(strings["pd.appeared"])).toBeInTheDocument();
    // Not proved yet: the namesake may be another client's.
    expect(within(dialog).getByText(strings["pd.next"])).toBeInTheDocument();
    expect(within(dialog).queryByText(strings["pd.stepYours"])).toBeNull();
    await userEvent.click(within(dialog).getByRole("button", { name: strings["action.checkAgain"] }));
    // A whole read shows the new key of this name: proved, so Dismiss and Check again leave, and the line says
    // what is left: its secret is gone, so delete it and make a new key.
    expect(await within(dialog).findByText(strings["pd.stepYours"])).toBeInTheDocument();
    expect(within(dialog).queryByText(strings["pd.next"])).toBeNull();
    expect(within(dialog).queryByRole("button", { name: strings["dismiss.act"] })).toBeNull();
    // The new key is a named list row with its name, prefix and made date (all three, as a
    // table row would show).
    const listed = within(dialog).getByRole("list", { name: strings["pd.table"] });
    const row = within(listed).getByRole("listitem");
    expect(row).toHaveTextContent("ci");
    expect(row).toHaveTextContent(strings["prefixShort"].replace("{{prefix}}", "hdy_3f9a"));
    // The prefix is a mono fact of the row, and so is the day it was made.
    const fact = (label: string) => within(row).getByText(label, { selector: "dt" }).nextElementSibling as HTMLElement;
    expect(fact(strings["insp.prefix"]).className).toMatch(/mono/);
    expect(fact(strings["insp.created"])).toHaveTextContent(/^\w{3} \d{1,2}, \d{4}$/);
    // The two cases are alternatives, not numbered steps: one fact per case (the case, then what to do), in the
    // section that names what to do now.
    expect(within(dialog).queryByRole("list", { name: strings["pd.ifYours"] })).toBeNull();
    const cases = within(dialog).getByRole("region", { name: strings["pd.stepsLabel"] }).querySelector("dl") as HTMLElement;
    expect(cases).not.toBeNull();
    const terms = Array.from(cases.querySelectorAll("dt"), (n) => n.textContent);
    const values = Array.from(cases.querySelectorAll("dd"), (n) => n.textContent);
    expect(terms).toEqual([strings["pd.ifYours"], strings["pd.ifNotYours"]]);
    expect(values).toEqual([strings["pd.stepYours"], strings["pd.stepNotYours"]]);
    expect(within(dialog).getByText(strings["pd.settled"])).toBeInTheDocument();
    // Why a key that is yours is replaced: its secret can't be shown again (the banner's line, in every state).
    expect(within(dialog).getByText(strings["pd.body"])).toBeInTheDocument();
    expect(strings["pd.body"]).toMatch(/secret can.t be shown again/);
    // One banner for the unknown outcome; what is said under it sits in the two named sections, never a loose paragraph.
    expect(dialog.querySelectorAll("[data-outcome]")).toHaveLength(1);
    expect(within(dialog).getByRole("region", { name: strings["pd.found"] })).toContainElement(listed);
    // Close is the primary (nothing is left to check), and it closes the drawer.
    expect(within(dialog).queryByRole("button", { name: strings["action.checkAgain"] })).toBeNull();
    // The drawer's x is also named Close: the footer's is the one primary.
    const closes = within(dialog).getAllByRole("button", { name: strings["pd.close"] });
    const primary = closes.filter((b) => b.getAttribute("data-variant") === "primary");
    expect(primary).toHaveLength(1);
    const close = primary[0] as HTMLElement;
    await userEvent.click(close);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    forgetUnresolved();
  }, 40000);
  it("the header offers Use with your agent", async () => {
    await renderPage(page);
    expect(
      await screen.findByRole("button", { name: "Use with your agent" }),
    ).toBeTruthy();
  });
  it("two sends in the same tick put one create on the wire", async () => {
    sent.create = 0;
    await renderPage(page);
    const { result } = renderHook(() => useMintFlow(null, () => {}));
    const input = {
      kind: "create" as const,
      body: { alias: "ci" },
      alias: "ci",
    };
    await act(async () => {
      await Promise.all([
        result.current.start(input),
        result.current.start(input),
      ]);
    });
    expect(sent.create).toBe(1);
  });
  it("keeps the SSH key buttons locked while a change is unconfirmed", async () => {
    await renderPage(page, { state: "pendingOps" });
    await userEvent.click(
      await screen.findByRole("tab", { name: new RegExp(strings["tab.ssh"]) }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: strings["ssh.replace"] }),
    );
    await pasteInto(screen.getByLabelText(strings["ssh.field"]), "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFakeFixtureKeyOnly0000000000000000 a@b");
    await userEvent.click(
      screen.getByRole("button", { name: strings["ssh.saveReplace"] }),
    );
    await screen.findByText(strings["ssh.pendingTitle"]);
    await userEvent.click(
      screen.getByRole("button", { name: strings["ssh.cancel"] }),
    );
    expect(
      screen.getByRole("button", { name: strings["ssh.replace"] }),
    ).toBeDisabled();
    // The danger group's Remove waits too.
    expect(
      screen.getByRole("button", { name: strings["ssh.remove"] }),
    ).toBeDisabled();
  });

  const startNewKey = async () => {
    await screen.findByText("ci-deploy");
    await userEvent.click(
      screen.getAllByRole("button", {
        name: strings["action.new"],
      })[0] as HTMLElement,
    );
    await userEvent.type(
      await screen.findByLabelText(strings["nk.name"]),
      "ci",
    );
  };
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  it("a drawer closed during the preliminary read sends no create", async () => {
    sent.create = 0;
    const view = await renderPage(page, { state: "slowRead" });
    await startNewKey();
    // The preliminary read waits for the test, not a 400 ms timer a loaded run can outlast.
    slowGate.hold();
    void userEvent.click(
      screen.getByRole("button", { name: strings["nk.go"] }),
    );
    await waitFor(() => expect(slowGate.arrived).toBe(1));
    view.unmount();
    act(() => slowGate.release());
    // The flow's step after the read has run (no elapsed time): unmounted, it hands back to the page's
    // onChanged, a list read (the gate's second arrival); a create would have been sent before it.
    await waitFor(() => expect(slowGate.arrived).toBe(2));
    expect(sent.create).toBe(0);
  });
  it("a pause left unconfirmed brings its banner into view (Pause sits at the inspector's foot, the banner at its top)", async () => {
    const seen: string[] = [];
    const spy = vi
      .spyOn(Element.prototype, "scrollIntoView")
      .mockImplementation(function (this: Element) {
        seen.push(this.textContent ?? "");
      });
    try {
      await renderPage(page, { state: "pendingOps" });
      await openRow(/ci-deploy/);
      const before = seen.length;
      await userEvent.click(
        await screen.findByRole("button", { name: strings["act.pause"] }),
      );
      await waitFor(() =>
        expect(
          seen.slice(before).some((x) => x.includes(strings["insp.unknownTitle"])),
        ).toBe(true),
      );
    } finally {
      spy.mockRestore();
    }
  });
  it("opening a key that was already unconfirmed does not scroll: only a change on the open key does", async () => {
    const seen: string[] = [];
    const spy = vi
      .spyOn(Element.prototype, "scrollIntoView")
      .mockImplementation(function (this: Element) {
        seen.push(this.textContent ?? "");
      });
    try {
      await renderPage(page, { state: "pendingOps" });
      await openRow(/ci-deploy/);
      await userEvent.click(
        await screen.findByRole("button", { name: strings["act.pause"] }),
      );
      await waitFor(() =>
        expect(seen.some((x) => x.includes(strings["insp.unknownTitle"]))).toBe(true),
      );
      await openRow(/sdk-readonly/);
      await screen.findByRole("heading", { name: "sdk-readonly" });
      const before = seen.length;
      await openRow(/ci-deploy/);
      await screen.findByRole("heading", { name: "ci-deploy" });
      expect(await screen.findByText(strings["insp.unknownTitle"])).toBeInTheDocument();
      await sleep(200);
      expect(seen.slice(before).some((x) => x.includes(strings["insp.unknownTitle"]))).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });
  it("a failed read-back leaves a pause unconfirmed, whatever the cache holds", async () => {
    await renderPage(page, { state: "readFails" });
    await openRow(/ci-deploy/);
    await userEvent.click(
      await screen.findByRole("button", { name: strings["act.pause"] }),
    );
    const check = await within(
      await screen.findByRole("row", { name: /ci-deploy/ }),
    ).findByRole("button", { name: "Check again" });
    await userEvent.click(check);
    await sleep(300);
    expect(
      screen.getAllByText(strings["state.unknown"]).length,
    ).toBeGreaterThan(0);
  });
  it("a share that finishes after the drawer is gone is lost, not made", async () => {
    const view = await renderPage(page, {
      state: "slowShare",
      path: "/keys/shared",
    });
    await userEvent.click(
      (
        await screen.findAllByRole("button", { name: strings["action.share"] })
      )[0] as HTMLElement,
    );
    // The share's answer waits until the drawer is gone (not a 300 ms timer).
    slowGate.hold();
    await userEvent.click(
      await toReviewed(),
    );
    await waitFor(() => expect(slowGate.arrived).toBe(1));
    view.unmount();
    act(() => slowGate.release());
    await waitFor(() => expect(ledgerFor(capture().account, REALM_A).map((e) => e.state)).toContain("lost"));
    const states = ledgerFor(capture().account, REALM_A).map((e) => e.state);
    expect(states).not.toContain("made");
  });
  it("two deletes of a key made without its secret send one request", async () => {
    sent.remove = 0;
    await renderPage(page, { state: "noSecret" });
    const { result } = renderHook(() => useMintFlow(null, () => {}));
    await act(async () => {
      await result.current.start({
        kind: "create",
        body: { alias: "ci" },
        alias: "ci",
      });
    });
    await waitFor(() => expect(result.current.phase.kind).toBe("nosecret"));
    await act(async () => {
      await Promise.all([
        result.current.deleteMade(),
        result.current.deleteMade(),
      ]);
    });
    expect(sent.remove).toBe(1);
  });
  it("a send whose outcome is unknown stays unresolved when its drawer is closed and reopened", async () => {
    sent.create = 0;
    await renderPage(page, { state: "pendingCreate" });
    const input = {
      kind: "create" as const,
      body: { alias: "ci" },
      alias: "ci",
    };
    const first = renderHook(() => useMintFlow(null, () => {}));
    await act(async () => {
      await first.result.current.start(input);
    });
    await waitFor(() =>
      expect(first.result.current.phase.kind).toBe("pending"),
    );
    first.unmount();
    const again = renderHook(() => useMintFlow(null, () => {}));
    expect(again.result.current.phase.kind).toBe("pending");
    await act(async () => {
      await again.result.current.start(input);
    });
    expect(sent.create).toBe(1);
  });
  it("a read-back is a read sent after recovery began, not one already in flight", async () => {
    await renderPage(page, { state: "staleFirst" });
    const { result } = renderHook(() => useKeyReader());
    let rows = -1;
    await act(async () => {
      rows = (await result.current())?.rows.length ?? -1;
    });
    expect(rows).toBe(12);
  });
  /** Opens a row's inspector. The table is rebuilt when the list or the held changes refresh, so a row found a
   *  moment ago can be a detached one: the click is made again on the live row until the row is the open one. */
  const openRow = async (name: RegExp) => {
    await waitFor(
      async () => {
        const row = screen.getByRole("row", { name });
        if (row.getAttribute("aria-selected") !== "true")
          await userEvent.click(row);
        expect(screen.getByRole("row", { name })).toHaveAttribute(
          "aria-selected",
          "true",
        );
      },
      { timeout: 10000, interval: 300 },
    );
  };
  const pauseFirstKey = async () => {
    await openRow(/ci-deploy/);
    await userEvent.click(
      await screen.findByRole("button", { name: strings["act.pause"] }),
    );
  };
  /** Presses the row's Check again and waits until it is gone. The row is rebuilt when the list or the held
   *  changes refresh, so a button found a moment ago can be a detached one: the press is made again on the live one. */
  const clickCheckAgain = async () => {
    // The change is shown first (a press sends only after core's admission checks, so the row can lag the click).
    await within(screen.getByRole("row", { name: /ci-deploy/ })).findByRole("button", { name: "Check again" }, { timeout: 10000 });
    await waitFor(
      async () => {
        const btn = within(
          screen.getByRole("row", { name: /ci-deploy/ }),
        ).queryByRole("button", { name: "Check again" });
        if (btn) await userEvent.click(btn);
        expect(
          within(screen.getByRole("row", { name: /ci-deploy/ })).queryByRole(
            "button",
            { name: "Check again" },
          ),
        ).toBeNull();
      },
      { timeout: 30000, interval: 500 },
    );
  };
  it("after Check again proves the pause, the key can be changed again", async () => {
    sent.setEnabled = 0;
    sent.remove = 0;
    await renderPage(page, { state: "pauseLands" });
    await pauseFirstKey();
    await clickCheckAgain();
    await userEvent.click(
      await screen.findByRole("button", { name: strings["act.resume"] }),
    );
    await waitFor(() => expect(sent.setEnabled).toBe(2));
  }, 40000);
  it("a read-back that fails once is asked again, so Check again settles the pause", async () => {
    sent.failList = 0;
    sent.setEnabled = 0;
    sent.remove = 0;
    await renderPage(page, { state: "listFailsNext" });
    await pauseFirstKey();
    await within(
      await screen.findByRole("row", { name: /ci-deploy/ }),
    ).findByRole("button", { name: "Check again" });
    sent.failList = 1;
    await clickCheckAgain();
    expect(sent.failList).toBe(0);
  }, 40000);
  it("a cut list read does not prove a key is deleted", async () => {
    sent.remove = 0;
    await renderPage(page, { state: "pauseCut" });
    await openRow(/ci-deploy/);
    await userEvent.click(
      await screen.findByRole("button", { name: strings["act.delete"] }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: strings["del.go"] }),
    );
    const dlg = await screen.findByRole("alertdialog");
    await userEvent.click(
      await within(dlg).findByRole("button", { name: /Check/ }),
    );
    await sleep(400);
    expect(screen.queryByText(/is deleted/)).toBeNull();
    // The dialog still holds the unconfirmed delete.
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  });
  it("a delete of a key made without its secret that may have gone through offers only a read-back", async () => {
    sent.remove = 0;
    await renderPage(page, { state: "deleteUnknown" });
    const { result } = renderHook(() => useMintFlow(null, () => {}));
    await act(async () => {
      await result.current.start({
        kind: "create",
        body: { alias: "ci" },
        alias: "ci",
      });
    });
    await waitFor(() => expect(result.current.phase.kind).toBe("nosecret"));
    await act(async () => {
      await result.current.deleteMade();
    });
    const p = result.current.phase;
    expect(p.kind === "nosecret" && p.unsure).toBe(true);
    expect(result.current.banner?.kind).toBe("pending");
    await act(async () => {
      await result.current.deleteMade();
    });
    expect(sent.remove).toBe(1);
  });
  it("a confirmed stop marks the lost share gone, so Create is not held for it", async () => {
    const share = shares[0] as { id: string };
    const ledger = ledgerFor(capture().account, REALM_A);
    ledger.push({ alias: "hoody share lost", state: "lost", id: share.id });
    await renderPage(page, { state: "shared", path: "/keys/shared" });
    // The table is rebuilt as the list settles, so the press is made again on the live button until the dialog is up.
    await waitFor(
      async () => {
        const go = () =>
          screen.queryByRole("button", { name: strings["share.stopGo"] });
        const btn = screen.queryAllByRole("button", {
          name: strings["share.stopAgain"],
        })[0];
        if (btn && !go()) await userEvent.click(btn);
        expect(go()).toBeInTheDocument();
      },
      { timeout: 10000, interval: 300 },
    );
    await userEvent.click(
      screen.getByRole("button", { name: strings["share.stopGo"] }),
    );
    await waitFor(() => expect(ledger[0]?.state).toBe("gone"));
    // The toast names the realm the share was of.
    expect(vi.mocked(showToast).mock.calls.map((c) => String(c[0].title))).toContain(
      strings["share.stopped"].replace("{{realm}}", "Personal"),
    );
  });
  it("a saved SSH key after the computer on screen changed is reported for the computer it was saved on", async () => {
    await renderPage(page, { state: "slowSsh" });
    await userEvent.click(
      await screen.findByRole("tab", { name: new RegExp(strings["tab.ssh"]) }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: strings["ssh.replace"] }),
    );
    await pasteInto(screen.getByLabelText(strings["ssh.field"]), "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFakeFixtureKeyOnly0000000000000000 a@b");
    await userEvent.click(
      screen.getByRole("button", { name: strings["ssh.saveReplace"] }),
    );
    act(() => setTarget(null));
    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "SSH key saved on atlas." }),
      ),
    );
  });
  it("an unresolved share of this account shows on Shared, whatever the ledger key", async () => {
    ledgerFor(capture().account, REALM_A).push({
      alias: "hoody share x",
      state: "unknown",
      id: null,
    });
    await renderPage(page, { state: "shared", path: "/keys/shared" });
    expect(
      await screen.findByText(strings["share.cantCheck"]),
    ).toBeInTheDocument();
  });
  it("Show all realms ends when the shell's realm or account switches", async () => {
    await renderPage(page);
    act(() => setRealm(REALM_A));
    const { result } = renderHook(() => useRealm());
    act(() => result.current.showAll());
    expect(result.current.realm).toBe("all");
    act(() => {
      bump("switch");
    });
    expect(result.current.realm).not.toBe("all");
  });
  it("a New key drawer closes when the shell's realm changes", async () => {
    await renderPage(page);
    act(() => setRealm(REALM_A));
    await startNewKey();
    expect(screen.getByLabelText(strings["nk.name"])).toBeInTheDocument();
    act(() => setRealm(REALM_B));
    await waitFor(() =>
      expect(screen.queryByLabelText(strings["nk.name"])).toBeNull(),
    );
  });
  it("realms are ticked in the list, unticking one removes it, and the key is made for the ticked ones", async () => {
    createBodies.length = 0;
    await renderPage(page);
    act(() => setRealm("global"));
    await startNewKey();
    await userEvent.click(
      await screen.findByRole("radio", {
        name: new RegExp(strings["nk.pick"]),
      }),
    );
    const list = await screen.findByRole("group", { name: strings["nk.pickList"] });
    const acme = within(list).getByRole("checkbox", { name: /Acme client/ });
    const personal = within(list).getByRole("checkbox", { name: /Personal/ });
    await userEvent.click(acme);
    await userEvent.click(personal);
    expect(acme).toBeChecked();
    await userEvent.click(personal);
    expect(personal).not.toBeChecked();
    await userEvent.click(screen.getByRole("button", { name: strings["nk.go"] }));
    await waitFor(() => expect(createBodies.length).toBe(1));
    expect((createBodies[0] as { realm_ids?: unknown }).realm_ids).toEqual([REALM_B]);
  });
  it("a key shows when it was last used and links the keys it made, and each links back to its maker", async () => {
    await renderPage(page, { state: "lineage" });
    act(() => setRealm(REALM_A));
    await openRow(/ci-deploy/);
    expect(await screen.findByText(/198\.51\.100\.1/)).toBeInTheDocument();
    await userEvent.click(
      await screen.findByRole("button", { name: "ci-child" }),
    );
    expect(
      await screen.findByRole("heading", { name: "ci-child" }),
    ).toBeInTheDocument();
    expect(screen.getByText(strings["insp.neverUsed"])).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "ci-deploy" }),
    ).toBeInTheDocument();
  }, 40000);
  it("a key of the realm shown links that realm's Computers, Programs and Shares", async () => {
    await renderPage(page);
    act(() => setRealm(REALM_A));
    await openRow(/ci-deploy/);
    const where = await screen.findByRole("link", {
      name: strings["insp.whereComputers"],
    });
    expect(where).toHaveAttribute(
      "href",
      expect.stringMatching(/\/computers$/),
    );
    expect(
      screen.getByRole("link", { name: strings["insp.wherePrograms"] }),
    ).toHaveAttribute("href", expect.stringMatching(/\/programs$/));
    expect(
      screen.getByRole("link", { name: strings["insp.whereShares"] }),
    ).toHaveAttribute("href", expect.stringMatching(/\/keys\/shared$/));
  });
  it("a key of another realm shows no links, only the hint to switch in the realm picker, and switches nothing", async () => {
    await renderPage(page);
    act(() => setRealm(REALM_B));
    await userEvent.click(
      await screen.findByRole("button", { name: strings["band.showAll"] }),
    );
    await openRow(/ci-deploy/);
    expect(
      await screen.findByText(strings["insp.whereSwitch"]),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: strings["insp.whereComputers"] }),
    ).toBeNull();
    expect(
      screen.queryByRole("link", { name: strings["insp.wherePrograms"] }),
    ).toBeNull();
    expect(capture().realm).toBe(REALM_B);
  });
  it("a page this Hub hides gets no link in the inspector; the others keep theirs", async () => {
    hiddenPages.add("programs");
    try {
      await renderPage(page);
      act(() => setRealm(REALM_A));
      await openRow(/ci-deploy/);
      expect(
        await screen.findByRole("link", {
          name: strings["insp.whereComputers"],
        }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("link", { name: strings["insp.wherePrograms"] }),
      ).toBeNull();
      expect(
        screen.queryByRole("button", { name: strings["insp.wherePrograms"] }),
      ).toBeNull();
    } finally {
      hiddenPages.clear();
    }
  });
  it("with all realms shown, the inspector names no one realm's pages", async () => {
    await renderPage(page);
    act(() => setRealm("all"));
    await openRow(/ci-deploy/);
    expect(
      await screen.findByRole("heading", { name: "ci-deploy" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(strings["insp.where"])).toBeNull();
    expect(
      screen.queryByRole("link", { name: strings["insp.whereComputers"] }),
    ).toBeNull();
  });
  it("Start from opens empty, finds a set by typing, ticks its rights and empties again", async () => {
    await renderPage(page);
    act(() => setRealm(REALM_A));
    await startNewKey();
    await userEvent.click(
      await screen.findByRole("radio", {
        name: new RegExp(strings["nk.choose"]),
      }),
    );
    const from = await screen.findByRole("combobox", {
      name: strings["nk.from"],
    });
    expect(from).toHaveValue("");
    expect(from).toHaveAttribute("placeholder", strings["nk.fromPh"]);
    await userEvent.type(from, "dev");
    await userEvent.click(
      await screen.findByRole("option", { name: strings["tmpl.dev_team"] }),
    );
    // The set's rights are ticked (the live count is no longer zero).
    const count = strings["nk.rightsCount"].split("{{count}}")[1] ?? "";
    await waitFor(() =>
      expect(
        screen
          .getAllByRole("status")
          .map((e) => e.textContent ?? "")
          .find((x) => x.includes(count.split("{{of}}")[0] ?? "")),
      ).toMatch(/^[1-9]/),
    );
    expect(
      await screen.findByRole("combobox", { name: strings["nk.from"] }),
    ).toHaveValue("");
  });
  it("a key of two realms is not copied from one of them", async () => {
    // laptop-cli is paused: the list opens on State: Active, so it is listed under State: Paused.
    await renderPage(page, { path: "/keys?state=paused" });
    act(() => setRealm(REALM_A));
    await openRow(/laptop-cli/);
    expect(
      await screen.findByRole("button", { name: strings["act.copy"] }),
    ).toBeDisabled();
    expect(screen.getByText(strings["copy.notHere"])).toBeInTheDocument();
  });
  it("a copy is refused at send when the realm shown now no longer fits the key", async () => {
    await renderPage(page);
    await openRow(/ci-deploy/);
    await userEvent.click(
      await screen.findByRole("button", { name: strings["act.copy"] }),
    );
    const drawer = await screen.findByRole("dialog");
    act(() => setRealm(REALM_B));
    await userEvent.click(
      within(drawer).getByRole("button", { name: strings["cp.go"] }),
    );
    expect(
      await screen.findByText(strings["out.refused.NOT_HERE"]),
    ).toBeInTheDocument();
    expect(screen.queryByText(strings["sh.warn"])).toBeNull();
  });
  it("a drawer reopened after an unconfirmed stop keeps Check again and offers no second Stop", async () => {
    const share = shares[0] as { id: string };
    ledgerFor(capture().account, REALM_A).push({
      alias: "hoody share lost",
      state: "lost",
      id: share.id,
    });
    await renderPage(page, {
      state: "sharedStopPending",
      path: "/keys/shared",
    });
    act(() => setRealm(REALM_A));
    await openShare();
    let drawer = await screen.findByRole("dialog");
    await userEvent.click(
      await within(drawer).findByRole("button", {
        name: strings["share.stopIt"],
      }),
    );
    await within(drawer).findByRole("button", {
      name: strings["action.checkAgain"],
    });
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await openShare();
    drawer = await screen.findByRole("dialog");
    expect(
      await within(drawer).findByRole("button", {
        name: strings["action.checkAgain"],
      }),
    ).toBeInTheDocument();
    expect(
      within(drawer).queryByRole("button", { name: strings["share.stopIt"] }),
    ).toBeNull();
  });
  it("a lost share stopped from the drawer names its realm in the toast", async () => {
    const share = shares[0] as { id: string };
    ledgerFor(capture().account, REALM_A).push({
      alias: "hoody share lost",
      state: "lost",
      id: share.id,
    });
    await renderPage(page, { state: "shared", path: "/keys/shared" });
    act(() => setRealm(REALM_A));
    await openShare();
    const drawer = await screen.findByRole("dialog");
    vi.mocked(showToast).mockClear();
    await userEvent.click(
      await within(drawer).findByRole("button", { name: strings["share.stopIt"] }),
    );
    await waitFor(() =>
      expect(vi.mocked(showToast).mock.calls.map((c) => String(c[0].title))).toContain(
        strings["share.stopped"].replace("{{realm}}", "Personal"),
      ),
    );
  });
  it("n opens New key, and does nothing while a drawer is open", async () => {
    await renderPage(page);
    await screen.findByText("ci-deploy");
    await userEvent.keyboard("n");
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await openRow(/ci-deploy/);
    await userEvent.click(
      await screen.findByRole("button", { name: strings["act.copy"] }),
    );
    await screen.findByRole("dialog");
    await userEvent.keyboard("n");
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(screen.getByRole("dialog")).toHaveAccessibleName(
      new RegExp(strings["cp.title"].replace("{{name}}", "ci-deploy")),
    );
  });
  it("c copies the shown key, and does nothing when a dialog over it has the keyboard", async () => {
    const write = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: write },
      configurable: true,
    });
    await renderPage(page);
    await screen.findByText("ci-deploy");
    await userEvent.click(
      screen.getAllByRole("button", {
        name: strings["action.new"],
      })[0] as HTMLElement,
    );
    await userEvent.type(
      await screen.findByLabelText(strings["nk.name"]),
      "ci",
    );
    await userEvent.click(
      screen.getByRole("button", { name: strings["nk.go"] }),
    );
    await screen.findByText(strings["sh.warn"]);
    await userEvent.keyboard("c");
    await waitFor(() => expect(write).toHaveBeenCalledTimes(1));
    // A key pressed anywhere else (a dialog over the page, the page behind) is not this panel's key.
    const over = document.createElement("div");
    over.setAttribute("role", "dialog");
    const b = document.createElement("button");
    over.append(b);
    document.body.append(over);
    try {
      fireEvent.keyDown(b, { key: "c" });
      fireEvent.keyDown(document.body, { key: "c" });
      await new Promise((r) => setTimeout(r, 50));
      expect(write).toHaveBeenCalledTimes(1);
    } finally {
      over.remove();
    }
  });
  const openSsh = async () => {
    await userEvent.click(
      await screen.findByRole("tab", { name: new RegExp(strings["tab.ssh"]) }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: strings["ssh.replace"] }),
    );
    await pasteInto(screen.getByLabelText(strings["ssh.field"]), "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFakeFixtureKeyOnly0000000000000000 a@b");
    await userEvent.click(
      screen.getByRole("button", { name: strings["ssh.saveReplace"] }),
    );
  };
  it("an unconfirmed SSH change names the computer it was sent for, with no computer on screen", async () => {
    await renderPage(page, { state: "slowSshPending" });
    await openSsh();
    act(() => setTarget(null));
    expect(
      await screen.findByText(strings["ssh.pendingTitle"]),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/atlas/, { selector: "[data-outcome] *" }),
    ).toBeInTheDocument();
  });
  it("an unconfirmed SSH change stays unconfirmed over a realm switch", async () => {
    await renderPage(page, { state: "pendingOps" });
    await openSsh();
    await screen.findByText(strings["ssh.pendingTitle"]);
    act(() => {
      bump("switch");
    });
    expect(screen.getByText(strings["ssh.pendingTitle"])).toBeInTheDocument();
  });
  it("text typed for one computer is dropped when another is on screen", async () => {
    await renderPage(page);
    await userEvent.click(
      await screen.findByRole("tab", { name: new RegExp(strings["tab.ssh"]) }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: strings["ssh.replace"] }),
    );
    await userEvent.type(screen.getByLabelText(strings["ssh.field"]), "ssh-ed");
    act(() =>
      setTarget({
        project: { id: "p1" },
        container: { id: "c0a7150000000000000000b2" },
      }),
    );
    await waitFor(() =>
      expect(screen.queryByLabelText(strings["ssh.field"])).toBeNull(),
    );
  });
  it("a rejected SSH key text is cleared, with its error kept", async () => {
    await renderPage(page);
    await userEvent.click(
      await screen.findByRole("tab", { name: new RegExp(strings["tab.ssh"]) }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: strings["ssh.replace"] }),
    );
    // Pasted, as a key is in practice: the box refuses a private key the moment it lands, before any Save,
    // so the secret is never left on screen.
    await userEvent.click(screen.getByLabelText(strings["ssh.field"]));
    await userEvent.paste(["-----BEGIN", "OPENSSH PRIVATE KEY-----"].join(" "));
    expect(
      await screen.findByText(strings["ssh.e.private"]),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(strings["ssh.field"])).toHaveValue("");
  });
  it("a delete that may have gone through keeps Check again on its row after the dialog is closed, and no second Delete is offered", async () => {
    // No pause sent in this test: an earlier test's count would list ci-deploy paused, outside the Active list it opens on.
    sent.setEnabled = 0;
    sent.remove = 0;
    await renderPage(page, { state: "deleteLands" });
    await openRow(/ci-deploy/);
    await userEvent.click(
      await screen.findByRole("button", { name: strings["act.delete"] }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: strings["del.go"] }),
    );
    const dlg = await screen.findByRole("alertdialog");
    await within(dlg).findByRole("button", { name: /Check/ });
    await userEvent.click(
      within(dlg).getByRole("button", { name: (n, el) => /^(Cancel|Close|Keep)/.test(n) && !el.hasAttribute("data-dialog-close") }),
    );
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    const row = await screen.findByRole("row", { name: /ci-deploy/ });
    expect(
      within(row).queryByRole("button", { name: strings["act.delete"] }),
    ).toBeNull();
    await userEvent.click(
      await within(row).findByRole("button", { name: "Check again" }),
    );
    // The read shows the key gone: that proves the delete.
    await waitFor(() =>
      expect(screen.queryByRole("row", { name: /ci-deploy/ })).toBeNull(),
    );
    expect(sent.remove).toBe(1);
  });
  it("a held pause stays on screen when the tab is opened again: the key now listed paused is not hidden by the default Active", async () => {
    sent.setEnabled = 0;
    sent.remove = 0;
    const first = await renderPage(page, { state: "pauseLands" });
    await pauseFirstKey();
    await within(screen.getByRole("row", { name: /ci-deploy/ })).findByRole("button", { name: "Check again" }, { timeout: 10000 });
    first.unmount();
    // Opened again with no State and no key in the address: the list opens on Active, and the server lists ci-deploy paused.
    const again = await renderPage(page, { state: "pauseLands" });
    await screen.findByRole("button", { name: `Clear ${strings["filter.state"]}` }, { timeout: 10000 });
    expect(again.router.state.location.search).toMatchObject({ state: "active" });
    const row = await screen.findByRole("row", { name: /ci-deploy/ }, { timeout: 10000 });
    await within(row).findByRole("button", { name: "Check again" }, { timeout: 10000 });
  });
  it("an unconfirmed pause settled elsewhere leaves no Check again on its row", async () => {
    await renderPage(page, { state: "pauseOnce" });
    await pauseFirstKey();
    const row = await screen.findByRole("row", { name: /ci-deploy/ });
    await within(row).findByRole("button", { name: "Check again" });
    const id = (
      fixtureKeys.find((k) => k.alias === "ci-deploy") as { id: string }
    ).id;
    await act(async () => {
      const settle = useSettleChange();
      await settle.setEnabled(
        { id, on: false },
        await settle.holdOf.setEnabled({ id, on: false }),
      );
    });
    await waitFor(() =>
      expect(
        within(screen.getByRole("row", { name: /ci-deploy/ })).queryByRole(
          "button",
          { name: "Check again" },
        ),
      ).toBeNull(),
    );
  });
  it("an SSH change another page sent, still held by core, shows as unconfirmed with Check again", async () => {
    await renderPage(page, { state: "pendingOps" });
    await openSsh();
    await screen.findByText(strings["ssh.pendingTitle"]);
    await userEvent.click(
      screen.getByRole("tab", { name: new RegExp(strings["tab.keys"]) }),
    );
    await screen.findByText("ci-deploy");
    act(() => forgetKept());
    await userEvent.click(
      screen.getByRole("tab", { name: new RegExp(strings["tab.ssh"]) }),
    );
    expect(
      await screen.findByText(strings["ssh.pendingTitle"]),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: strings["action.checkAgain"] }),
    ).toBeInTheDocument();
  });
  it("a Check while the first request is still out settles nothing, so a second create is never offered", async () => {
    sent.create = 0;
    await renderPage(page, { state: "slowPendingCreate" });
    const input = {
      kind: "create" as const,
      body: { alias: "ci" },
      alias: "ci",
    };
    const first = renderHook(() => useMintFlow(null, () => {}));
    let sending: Promise<unknown> = Promise.resolve();
    // The first create stays out until the test lets it go (not a 700 ms timer).
    slowGate.hold();
    await act(async () => {
      sending = first.result.current.start(input);
    });
    await waitFor(() => expect(slowGate.arrived).toBe(1));
    first.unmount();
    const again = renderHook(() => useMintFlow(null, () => {}));
    expect(again.result.current.phase.kind).toBe("pending");
    await act(async () => {
      await again.result.current.check();
    });
    // The first request is still out: a window opened now still finds the send unresolved.
    const third = renderHook(() => useMintFlow(null, () => {}));
    expect(third.result.current.phase.kind).toBe("pending");
    await act(async () => {
      await third.result.current.start(input);
    });
    expect(sent.create).toBe(1);
    act(() => slowGate.release());
    await act(async () => {
      await sending;
    });
  });
  it("a share that may have been made after the window closed is not announced as made", async () => {
    vi.mocked(showToast).mockClear();
    const view = await renderPage(page, {
      state: "slowSharePending",
      path: "/keys/shared",
    });
    await userEvent.click(
      (
        await screen.findAllByRole("button", { name: strings["action.share"] })
      )[0] as HTMLElement,
    );
    // The share's answer waits until the window is gone (not a 500 ms timer).
    slowGate.hold();
    await userEvent.click(
      await toReviewed(),
    );
    await waitFor(() => expect(slowGate.arrived).toBe(1));
    view.unmount();
    act(() => slowGate.release());
    const titles = () => vi.mocked(showToast).mock.calls.map((c) => c[0].title);
    await waitFor(() => expect(titles()).toContain(strings["share.latePending"]));
    expect(titles()).not.toContain(strings["share.lateMade"]);
  });
  it("an unconfirmed SSH change is still there after another tab and back", async () => {
    await renderPage(page, { state: "pendingOps" });
    await openSsh();
    await screen.findByText(strings["ssh.pendingTitle"]);
    await userEvent.click(
      screen.getByRole("tab", { name: new RegExp(strings["tab.keys"]) }),
    );
    await screen.findByText("ci-deploy");
    await userEvent.click(
      screen.getByRole("tab", { name: new RegExp(strings["tab.ssh"]) }),
    );
    expect(
      await screen.findByText(strings["ssh.pendingTitle"]),
    ).toBeInTheDocument();
  });
  const openShare = async () =>
    userEvent.click(
      (
        await screen.findAllByRole("button", { name: strings["action.share"] })
      )[0] as HTMLElement,
    );
  it("a drawer reopened with a lost share offers Stop inside it, and an unconfirmed stop offers Check again", async () => {
    const share = shares[0] as { id: string };
    ledgerFor(capture().account, REALM_A).push({
      alias: "hoody share lost",
      state: "lost",
      id: share.id,
    });
    await renderPage(page, {
      state: "sharedStopPending",
      path: "/keys/shared",
    });
    act(() => setRealm(REALM_A));
    await openShare();
    const drawer = await screen.findByRole("dialog");
    await userEvent.click(
      await within(drawer).findByRole("button", {
        name: strings["share.stopIt"],
      }),
    );
    expect(
      await within(drawer).findByRole("button", {
        name: strings["action.checkAgain"],
      }),
    ).toBeInTheDocument();
  });
  it("a drawer reopened with an unresolved share offers Check again inside it", async () => {
    ledgerFor(capture().account, REALM_A).push({
      alias: "hoody share x",
      state: "unknown",
      id: null,
    });
    await renderPage(page, { state: "shared", path: "/keys/shared" });
    act(() => setRealm(REALM_A));
    await openShare();
    const drawer = await screen.findByRole("dialog");
    expect(
      await within(drawer).findByRole("button", {
        name: strings["action.checkAgain"],
      }),
    ).toBeInTheDocument();
  });
  it("a lost share with no id is matched by its alias and never called gone", () => {
    const led = [{ alias: "hoody share a", state: "lost" as const, id: null }];
    const was = led.map((x) => x.state);
    settle(led, was, [], false, NOW);
    expect(led[0]?.state).toBe("lost");
    const row = { ...shares[0], alias: "hoody share a" } as never;
    settle(
      led,
      led.map((x) => x.state),
      [row],
      false,
      NOW,
    );
    expect(led[0]?.id).toBe((row as { id: string }).id);
  });
  it("two overlapping read-backs both read the network, never the cache", async () => {
    await renderPage(page, { state: "slowLater" });
    await screen.findByText("ci-deploy");
    const { result } = renderHook(() => useKeyReader());
    let rows: (number | undefined)[] = [];
    // The first read stays out until the second press (not a 300 ms timer), so they overlap.
    slowGate.hold();
    let first: ReturnType<typeof result.current> | undefined;
    let second: ReturnType<typeof result.current> | undefined;
    await act(async () => {
      first = result.current();
    });
    await waitFor(() => expect(slowGate.arrived).toBe(1));
    await act(async () => {
      second = result.current();
    });
    // The second press, while the first read is out, joins that flight (data.ts freshList: one flight per query):
    // still one network read, and neither answer is the cache's 7.
    expect(slowGate.arrived).toBe(1);
    act(() => slowGate.release());
    await act(async () => {
      const [a, b] = await Promise.all([first, second]);
      rows = [a?.rows.length, b?.rows.length];
    });
    expect(rows).toEqual([12, 12]);
    // Both answers are in, so a second flight would have reached the fixture by now (the count before
    // release alone could pass by luck): still one read.
    expect(slowGate.arrived).toBe(1);
  });
  it("a bump wipes the SSH key text and the open editor", async () => {
    await renderPage(page);
    await userEvent.click(
      await screen.findByRole("tab", { name: new RegExp(strings["tab.ssh"]) }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: strings["ssh.replace"] }),
    );
    await userEvent.type(screen.getByLabelText(strings["ssh.field"]), "ssh-ed");
    act(() => {
      bump("account");
    });
    // The computer is read again after the switch; once it is back, no editor and no typed text remain.
    await screen.findByRole("link", { name: "atlas" });
    expect(screen.queryByLabelText(strings["ssh.field"])).toBeNull();
  });
  it("deleting a key made without its secret shows busy while it is out", async () => {
    await renderPage(page, { state: "slowDelete" });
    const { result } = renderHook(() => useMintFlow(null, () => {}));
    await act(async () => {
      await result.current.start({
        kind: "create",
        body: { alias: "ci" },
        alias: "ci",
      });
    });
    await waitFor(() => expect(result.current.phase.kind).toBe("nosecret"));
    let done!: Promise<void>;
    act(() => {
      done = result.current.deleteMade();
    });
    const p = result.current.phase;
    expect(p.kind === "nosecret" && p.reading).toBe(true);
    await act(async () => {
      await done;
    });
  });
  it("a saved SSH key on a computer no longer on screen has that computer read again", async () => {
    await renderPage(page, { state: "slowSsh" });
    await openSsh();
    act(() => setTarget(null));
    const reads = sent.computer;
    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "SSH key saved on atlas." }),
      ),
    );
    await waitFor(() => expect(sent.computer).toBeGreaterThan(reads));
  });
  it("a whole list that does not show the new key frees nothing; only a warned Dismiss gives the form back", async () => {
    sent.create = 0;
    await renderPage(page, { state: "pendingCreate" });
    const input = {
      kind: "create" as const,
      body: { alias: "ci" },
      alias: "ci",
    };
    const first = renderHook(() => useMintFlow(null, () => {}));
    await act(async () => {
      await first.result.current.start(input);
    });
    expect(first.result.current.phase.kind).toBe("pending");
    expect(sent.create).toBe(1);
    // The list is whole and holds no key named "ci": that is no proof (the create may still be in work).
    await act(async () => {
      await first.result.current.check();
    });
    expect(first.result.current.phase.kind).toBe("pending");
    first.unmount();
    const again = renderHook(() => useMintFlow(null, () => {}));
    expect(again.result.current.phase.kind).toBe("pending");
    await act(async () => {
      await again.result.current.start({
        ...input,
        body: { alias: "ci2" },
        alias: "ci2",
      });
    });
    expect(sent.create).toBe(1);
    // The person dismisses it: the form comes back and a new send goes out.
    act(() => again.result.current.dismiss(again.result.current.phase));
    await waitFor(() => {
      expect(heldAttempts().filter((h) => h.by === "keys")).toHaveLength(0);
      expect(again.result.current.phase.kind).toBe("form");
    });
    await act(async () => {
      await again.result.current.start({
        ...input,
        body: { alias: "ci2" },
        alias: "ci2",
      });
    });
    expect(sent.create).toBe(2);
  });
  it("a key made after its drawer closed says so", async () => {
    vi.mocked(showToast).mockClear();
    sent.create = 0;
    await renderPage(page, { state: "gatedShare" });
    const flow = renderHook(() => useMintFlow(null, () => {}));
    let sending: Promise<unknown> = Promise.resolve();
    await act(async () => {
      sending = flow.result.current.start({
        kind: "create",
        body: { alias: "ci" },
        alias: "ci",
      });
    });
    // The drawer closes once the create is out and before its answer: a fixed wait could close it before the send
    // (nothing made is right then) or after the answer (the key is shown, no notice).
    await waitFor(() => expect(sent.create).toBe(1));
    flow.unmount();
    await act(async () => {
      releaseShare();
      await sending;
    });
    const titles = vi.mocked(showToast).mock.calls.map((c) => c[0].title);
    expect(titles).toContain(strings["mint.lateMade"]);
  });
  it("an unconfirmed pause offers a warned Dismiss that frees it", async () => {
    sent.setEnabled = 0;
    await renderPage(page, { state: "pauseOnce" });
    await pauseFirstKey();
    const row = await screen.findByRole("row", { name: /ci-deploy/ });
    await within(row).findByRole("button", { name: "Check again" });
    await userEvent.click(
      within(row).getByRole("button", { name: strings["dismiss.act"] }),
    );
    const ask = await screen.findByRole("alertdialog");
    expect(within(ask).getByText(strings["dismiss.body"])).toBeInTheDocument();
    await userEvent.click(
      within(ask).getByRole("button", { name: strings["dismiss.go"] }),
    );
    await waitFor(() =>
      expect(
        within(screen.getByRole("row", { name: /ci-deploy/ })).queryByRole(
          "button",
          { name: "Check again" },
        ),
      ).toBeNull(),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: strings["act.pause"] }),
    );
    await waitFor(() => expect(sent.setEnabled).toBe(2));
  }, 40000);
  it("a share the list does not show yet stays unresolved; only a warned Dismiss gives Create back", async () => {
    await renderPage(page, { state: "pendingOps", path: "/keys/shared" });
    act(() => setRealm(REALM_A));
    await openShare();
    await userEvent.click(
      await toReviewed(),
    );
    // The drawer's own Check again (the Shared tab behind it shows the unresolved share too).
    await userEvent.click(
      await within(await screen.findByRole("dialog")).findByRole("button", {
        name: strings["action.checkAgain"],
      }),
    );
    expect(
      await screen.findByText(strings["share.notYet"]),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: strings["share.create"] }),
    ).toBeNull();
    // The drawer's own Dismiss (a toast's close button is also named Dismiss).
    await userEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: strings["dismiss.act"],
      }),
    );
    const ask = await screen.findByRole("alertdialog");
    await userEvent.click(
      within(ask).getByRole("button", { name: strings["dismiss.go"] }),
    );
    expect(
      await screen.findByRole("button", { name: strings["share.create"] }),
    ).toBeInTheDocument();
  }, 40000);
  it("C9: an unresolved share is held in core, so after a reload Create stays off until a warned Dismiss", async () => {
    forgetUnresolved();
    await renderPage(page, { state: "pendingOps", path: "/keys/shared" });
    act(() => setRealm(REALM_A));
    await openShare();
    await userEvent.click(
      await toReviewed(),
    );
    await within(await screen.findByRole("dialog")).findByRole("button", {
      name: strings["action.checkAgain"],
    });
    expect(
      heldAttempts(`keys.share.${REALM_A}`).filter((h) => h.by === "keys"),
    ).toHaveLength(1);
    // A reload: the page's ledgers and core's memory are gone; the stored hold is not.
    resetLedgers();
    resetAttempts();
    const led = ledgerFor(capture().account, REALM_A);
    expect(led.map((e) => e.state)).toEqual(["unknown"]);
    expect(blocked(led, false)).toBe(true);
    dismissUnknown(led, unknownAliases(led));
    await waitFor(() =>
      expect(heldAttempts(`keys.share.${REALM_A}`)).toHaveLength(0),
    );
    resetLedgers();
    expect(blocked(ledgerFor(capture().account, REALM_A), false)).toBe(false);
  }, 40000);
  it("C9: Dismiss of an unconfirmed SSH change is off while its Check is out, so a late Check never meets a newer save", async () => {
    sent.setSsh = 0;
    await renderPage(page, { state: "sshSlowCheck" });
    await userEvent.click(
      await screen.findByRole("tab", { name: new RegExp(strings["tab.ssh"]) }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: strings["ssh.replace"] }),
    );
    await pasteInto(screen.getByLabelText(strings["ssh.field"]), "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFakeFixtureKeyOnly0000000000000000 a@b");
    await userEvent.click(
      screen.getByRole("button", { name: strings["ssh.saveReplace"] }),
    );
    await screen.findByText(strings["ssh.pendingTitle"]);
    const dismiss = () =>
      screen.getByRole("button", { name: strings["dismiss.act"] });
    expect(dismiss()).toBeEnabled();
    await userEvent.click(
      screen.getByRole("button", { name: strings["action.checkAgain"] }),
    );
    await waitFor(() => expect(dismiss()).toBeDisabled());
    // The read shows another key: nothing is proved, and Dismiss comes back.
    await waitFor(() => expect(dismiss()).toBeEnabled(), { timeout: 8000 });
    expect(screen.getByText(strings["ssh.pendingTitle"])).toBeInTheDocument();
    expect(sent.setSsh).toBe(1);
  }, 40000);
  it("Check again proves an SSH key the computer holds without the comment that was sent", async () => {
    vi.mocked(showToast).mockClear();
    await renderPage(page, { state: "pendingOps" });
    await openSsh();
    await screen.findByText(strings["ssh.pendingTitle"]);
    await userEvent.click(
      screen.getByRole("button", { name: strings["action.checkAgain"] }),
    );
    await waitFor(() =>
      expect(screen.queryByText(strings["ssh.pendingTitle"])).toBeNull(),
    );
    const titles = vi.mocked(showToast).mock.calls.map((c) => c[0].title);
    expect(titles).toContain(strings["ssh.checkedHolds"]);
  }, 40000);
  it("an SSH change core holds for this page is freed only by a read that shows the key sent, or Dismiss", async () => {
    vi.mocked(showToast).mockClear();
    await renderPage(page, { state: "sshNonePending" });
    await userEvent.click(
      await screen.findByRole("tab", { name: new RegExp(strings["tab.ssh"]) }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: strings["ssh.set"] }),
    );
    await pasteInto(screen.getByLabelText(strings["ssh.field"]), "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFakeFixtureKeyOnly0000000000000000 a@b");
    await userEvent.click(
      screen.getByRole("button", { name: strings["ssh.save"] }),
    );
    await screen.findByText(strings["ssh.pendingTitle"]);
    // What another page (Computers) would show: the change only as core holds it.
    await userEvent.click(
      screen.getByRole("tab", { name: new RegExp(strings["tab.keys"]) }),
    );
    await screen.findByText("ci-deploy");
    act(() => forgetKept());
    await userEvent.click(
      screen.getByRole("tab", { name: new RegExp(strings["tab.ssh"]) }),
    );
    await screen.findByText(strings["ssh.pendingTitle"]);
    await userEvent.click(
      screen.getByRole("button", { name: strings["action.checkAgain"] }),
    );
    // The computer still holds no key: nothing is proved and the change stays held. It is this page's own (only
    // its banner was forgotten), so its warned Dismiss is offered too.
    expect(
      await screen.findByText(
        strings["ssh.heldNotYet"].replaceAll("{{name}}", "atlas"),
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(strings["ssh.pendingTitle"])).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: strings["dismiss.act"] }),
    ).toBeInTheDocument();
    const titles = vi
      .mocked(showToast)
      .mock.calls.map((c) => String(c[0].title));
    expect(titles.some((x) => x.includes("holds the change"))).toBe(false);
  }, 40000);
  it("an SSH change whose computer no longer exists is settled by Check again, saying so", async () => {
    sent.setSsh = 0;
    vi.mocked(showToast).mockClear();
    await renderPage(page, { state: "sshGone" });
    await openSsh();
    await screen.findByText(strings["ssh.pendingTitle"]);
    await userEvent.click(
      await screen.findByRole("button", { name: strings["action.checkAgain"] }),
    );
    await waitFor(() =>
      expect(screen.queryByText(strings["ssh.pendingTitle"])).toBeNull(),
    );
    const titles = vi
      .mocked(showToast)
      .mock.calls.map((c) => String(c[0].title));
    expect(titles.some((x) => x.includes("no longer exists"))).toBe(true);
  }, 40000);
  it("a read sent before a share became unknown cannot settle it", async () => {
    const ledger = ledgerFor(capture().account, REALM_A);
    ledger.push({ alias: "hoody share one", state: "unknown", id: null });
    const { queryClient } = await renderPage(page, { state: "slowLaterShares", path: "/keys/shared" });
    act(() => setRealm(REALM_A));
    const check = await screen.findByRole("button", { name: strings["action.checkAgain"] });
    await waitFor(() => expect(queryClient.isFetching()).toBe(0));
    // The read stays out until the second share is unknown (not a 300 ms timer).
    slowGate.hold();
    const n = slowGate.arrived;
    await userEvent.click(check);
    await waitFor(() => expect(slowGate.arrived).toBe(n + 1));
    // While the read is out, another share goes unknown.
    ledger.push({ alias: "hoody share two", state: "unknown", id: null });
    act(() => slowGate.release());
    // The read lists both: it settles the share it was sent for (found: lost, with its id), and the
    // one that went unknown after it was sent stays unknown although its row is listed too.
    await waitFor(() => expect(ledger[0]?.state).toBe("lost"));
    expect(ledger[0]?.id).toBe(shares[0]?.id);
    expect(ledger[1]?.state).toBe("unknown");
  });
  it("C9: an unnamed copy is never freed by a read, even by a new key with its source's scope; only Dismiss ends it", async () => {
    sent.twin = 0;
    forgetUnresolved();
    await renderPage(page, { state: "copyUnnamedPending" });
    await screen.findByText("ci-deploy");
    const source = normToken(fixtureKeys[0], null, Date.now());
    const op = "copy:" + source.id;
    const flow = renderHook(() => useMintFlow(null, () => {}, op));
    await act(async () => {
      await flow.result.current.start({
        kind: "copy",
        body: {},
        source,
        alias: null,
      });
    });
    expect(flow.result.current.phase.kind).toBe("pending");
    await act(async () => {
      await flow.result.current.check();
    });
    // Only another client's key appeared: nothing is proved, a window opened now still finds it unresolved.
    expect(
      renderHook(() => useMintFlow(null, () => {}, op)).result.current.phase
        .kind,
    ).toBe("pending");
    sent.twin = 1;
    await act(async () => {
      await flow.result.current.check();
    });
    const p = flow.result.current.phase;
    const found = p.kind === "pending" ? p.candidates : [];
    // Shown as one that may be it, never proof: another client's copy of the same key looks the same.
    expect(found.map((k) => k.scope)).toEqual([source.scope]);
    expect(
      renderHook(() => useMintFlow(null, () => {}, op)).result.current.phase
        .kind,
    ).toBe("pending");
    act(() => flow.result.current.dismiss(flow.result.current.phase));
    await waitFor(() =>
      expect(
        renderHook(() => useMintFlow(null, () => {}, op)).result.current.phase
          .kind,
      ).toBe("form"),
    );
  });
  it("C9: an unnamed copy that set its own Ends still lists the key with its source's other scope", async () => {
    sent.twin = 0;
    forgetUnresolved();
    await renderPage(page, { state: "copyUnnamedNewEnds" });
    await screen.findByText("ci-deploy");
    const source = normToken(fixtureKeys[0], null, Date.now());
    const op = "copy:" + source.id;
    const flow = renderHook(() => useMintFlow(null, () => {}, op));
    await act(async () => {
      await flow.result.current.start({
        kind: "copy",
        body: {},
        source,
        alias: null,
      });
    });
    sent.twin = 1;
    await act(async () => {
      await flow.result.current.check();
    });
    const p = flow.result.current.phase;
    expect(
      p.kind === "pending" ? p.candidates.map((k) => k.prefix) : [],
    ).toEqual(["hdy_9c03"]);
    // Still a candidate, never proof.
    expect(
      renderHook(() => useMintFlow(null, () => {}, op)).result.current.phase
        .kind,
    ).toBe("pending");
    act(() => flow.result.current.dismiss(flow.result.current.phase));
  });
  it("an SSH hold checked from another realm names the computer in its toast", async () => {
    vi.mocked(showToast).mockClear();
    await renderPage(page, { state: "sshNonePending" });
    act(() => setRealm(REALM_A));
    await userEvent.click(
      await screen.findByRole("tab", { name: new RegExp(strings["tab.ssh"]) }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: strings["ssh.set"] }),
    );
    await pasteInto(screen.getByLabelText(strings["ssh.field"]), "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFakeFixtureKeyOnly0000000000000000 a@b");
    await userEvent.click(
      screen.getByRole("button", { name: strings["ssh.save"] }),
    );
    await screen.findByText(strings["ssh.pendingTitle"]);
    act(() => setRealm(REALM_B));
    const want = strings["ssh.otherRealm"].replace("{{name}}", "atlas");
    // The tab re-reads after the switch: press the live Check again until the toast says where to check it.
    await waitFor(
      async () => {
        const titles = vi.mocked(showToast).mock.calls.map((c) => String(c[0].title));
        if (!titles.includes(want))
          await userEvent.click(
            screen.getAllByRole("button", { name: strings["action.checkAgain"] })[0] as HTMLElement,
          );
        expect(vi.mocked(showToast).mock.calls.map((c) => String(c[0].title))).toContain(want);
      },
      { timeout: 10000, interval: 300 },
    );
    expect(heldChanges("computer.ssh_key").length).toBe(1);
    act(() => setRealm(REALM_A));
  }, 40000);
  it("C9: an SSH hold dismissed from another realm stays held and says where to dismiss it", async () => {
    vi.mocked(showToast).mockClear();
    await renderPage(page, { state: "sshNonePending" });
    act(() => setRealm(REALM_A));
    await userEvent.click(
      await screen.findByRole("tab", { name: new RegExp(strings["tab.ssh"]) }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: strings["ssh.set"] }),
    );
    await pasteInto(screen.getByLabelText(strings["ssh.field"]), "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFakeFixtureKeyOnly0000000000000000 a@b");
    await userEvent.click(
      screen.getByRole("button", { name: strings["ssh.save"] }),
    );
    await screen.findByText(strings["ssh.pendingTitle"]);
    expect(heldChanges("computer.ssh_key").length).toBe(1);
    act(() => setRealm(REALM_B));
    // The tab re-reads after the switch: press the live button until its warning opens.
    await waitFor(
      async () => {
        if (!screen.queryByRole("alertdialog"))
          await userEvent.click(
            screen.getAllByRole("button", {
              name: strings["dismiss.act"],
            })[0] as HTMLElement,
          );
        expect(screen.getByRole("alertdialog")).toBeInTheDocument();
      },
      { timeout: 10000, interval: 300 },
    );
    const ask = screen.getByRole("alertdialog");
    await userEvent.click(
      within(ask).getByRole("button", { name: strings["dismiss.go"] }),
    );
    await waitFor(() =>
      expect(
        vi.mocked(showToast).mock.calls.map((c) => String(c[0].title)),
      ).toContain(strings["ssh.otherRealmDismiss"].replace("{{name}}", "atlas")),
    );
    expect(heldChanges("computer.ssh_key").length).toBe(1);
    expect(screen.getByText(strings["ssh.pendingTitle"])).toBeInTheDocument();
    act(() => setRealm(REALM_A));
  }, 40000);
  it("C9: a hold Computers sends after this page's failed save shows as held, not as the old failure", async () => {
    sent.setSsh = 0;
    await renderPage(page, { state: "sshFailsThenHeld" });
    await userEvent.click(
      await screen.findByRole("tab", { name: new RegExp(strings["tab.ssh"]) }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: strings["ssh.set"] }),
    );
    await pasteInto(screen.getByLabelText(strings["ssh.field"]), "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFakeFixtureKeyOnly0000000000000000 a@b");
    await userEvent.click(
      screen.getByRole("button", { name: strings["ssh.save"] }),
    );
    const failed = strings["ssh.failed"].replace("{{name}}", "atlas");
    expect(await screen.findByText(failed)).toBeInTheDocument();
    const id =
      (fixtureWorld.computers as readonly { name: string; id: string }[]).find(
        (x) => x.name === "atlas",
      )?.id ?? "";
    await act(async () => {
      await computersSsh.run({
        id,
        key: "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOtherPage a@b",
      });
    });
    expect(heldChanges("computer.ssh_key").length).toBe(1);
    expect(
      await screen.findByText(
        strings["ssh.heldElsewhere"].replace("{{name}}", "atlas"),
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(failed)).toBeNull();
  }, 40000);
  for (const state of ["namesakeCutBefore", "namesakeFailBefore"] as const)
    it(`C9C-3 (${state}): without a whole list from before the send, an old namesake does not free a named create`, async () => {
      sent.twin = 0;
      sent.create = 0;
      forgetUnresolved();
      await renderPage(page, { state });
      const flow = renderHook(() => useMintFlow(null, () => {}));
      await act(async () => {
        await flow.result.current.start({
          kind: "create",
          body: { alias: "ci" },
          alias: "ci",
        });
      });
      expect(flow.result.current.phase.kind).toBe("pending");
      await act(async () => {
        await flow.result.current.check();
      });
      expect(
        renderHook(() => useMintFlow(null, () => {})).result.current.phase.kind,
      ).toBe("pending");
      // Without a whole list from before, even a namesake made after the cut list's newest key proves nothing (it
      // may be another client's, made in the gap): only Dismiss ends it.
      sent.twin = 1;
      await act(async () => {
        await flow.result.current.check();
      });
      expect(
        renderHook(() => useMintFlow(null, () => {})).result.current.phase.kind,
      ).toBe("pending");
      act(() => flow.result.current.dismiss(flow.result.current.phase));
    }, 40000);
  it("C9: after a cut list, a namesake made after its newest key is shown but never frees a named create; only Dismiss does", async () => {
    sent.twin = 0;
    sent.create = 0;
    forgetUnresolved();
    await renderPage(page, { state: "namesakeCutBefore" });
    const flow = renderHook(() => useMintFlow(null, () => {}));
    await act(async () => {
      await flow.result.current.start({
        kind: "create",
        body: { alias: "ci" },
        alias: "ci",
      });
    });
    sent.twin = 2;
    await act(async () => {
      await flow.result.current.check();
    });
    const p = flow.result.current.phase;
    expect(p.kind).toBe("pending");
    // The namesake stays a candidate on screen.
    expect(p.kind === "pending" && p.candidates.length).toBe(1);
    expect(
      renderHook(() => useMintFlow(null, () => {})).result.current.phase.kind,
    ).toBe("pending");
    act(() => flow.result.current.dismiss(flow.result.current.phase));
    await waitFor(() =>
      expect(
        renderHook(() => useMintFlow(null, () => {})).result.current.phase.kind,
      ).toBe("form"),
    );
  }, 40000);
  it("C9: an unknown create is held in core, so a reload or another tab sees it and sends nothing again; only Dismiss frees it", async () => {
    sent.twin = 0;
    sent.create = 0;
    forgetUnresolved();
    await renderPage(page, { state: "namesakeFailBefore" });
    const flow = renderHook(() => useMintFlow(null, () => {}));
    await act(async () => {
      await flow.result.current.start({
        kind: "create",
        body: { alias: "ci" },
        alias: "ci",
      });
    });
    expect(sent.create).toBe(1);
    // Core lists the hold for every tab of the account; its stored record carries no secret.
    expect(heldAttempts().filter((h) => h.by === "keys")).toHaveLength(1);
    // A reload: this tab's memory is gone, the stored hold is not.
    resetAttempts();
    const again = renderHook(() => useMintFlow(null, () => {}));
    expect(again.result.current.phase.kind).toBe("pending");
    await act(async () => {
      await again.result.current.start({
        kind: "create",
        body: { alias: "ci" },
        alias: "ci",
      });
    });
    expect(sent.create).toBe(1);
    act(() => again.result.current.dismiss(again.result.current.phase));
    await waitFor(() =>
      expect(heldAttempts().filter((h) => h.by === "keys")).toHaveLength(0),
    );
    expect(
      renderHook(() => useMintFlow(null, () => {})).result.current.phase.kind,
    ).toBe("form");
  }, 40000);
  const atlasId = () =>
    (fixtureWorld.computers as readonly { name: string; id: string }[]).find(
      (x) => x.name === "atlas",
    )?.id ?? "";
  const FIXTURE_KEY =
    "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFakeFixtureKeyOnly0000000000000000 ana@laptop";
  const OTHER_KEY =
    "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFakeFixtureKeyOnly1111111111111111 b@c";
  const openSshTab = async () =>
    userEvent.click(
      await screen.findByRole("tab", { name: new RegExp(strings["tab.ssh"]) }),
    );
  const replaceSshWith = async (key: string) => {
    await userEvent.click(
      await screen.findByRole("button", { name: strings["ssh.replace"] }),
    );
    await pasteInto(screen.getByLabelText(strings["ssh.field"]), key);
    await userEvent.click(
      screen.getByRole("button", { name: strings["ssh.saveReplace"] }),
    );
  };
  it("Check on an older SSH send never frees a newer send's hold on the same computer", async () => {
    vi.mocked(showToast).mockClear();
    await renderPage(page, { state: "slowSshPending" });
    await openSshTab();
    // This tab sends the key the computer already shows: its outcome is unknown.
    await replaceSshWith(FIXTURE_KEY);
    await screen.findByText(strings["ssh.pendingTitle"], undefined, {
      timeout: 5000,
    });
    const first = heldChanges("computer.ssh_key")[0]?.hold;
    expect(first).toBeTruthy();
    // Another tab: its warned Dismiss frees that send, then it sends another key, whose outcome is unknown too.
    const settle = renderHook(() => useSettleChange()).result.current;
    const set = renderHook(() => useSetSshKey()).result.current;
    await act(async () => {
      await settle.ssh({ computer: atlasId(), key: FIXTURE_KEY }, first);
    });
    await act(async () => {
      await set({ computer: atlasId(), key: OTHER_KEY });
    });
    const second = heldChanges("computer.ssh_key")[0]?.hold;
    expect(second).toBeTruthy();
    expect(second).not.toBe(first);
    // This tab's Check: the computer shows the key the older send carried, which proves nothing of the newer one.
    await userEvent.click(
      await screen.findByRole("button", { name: strings["action.checkAgain"] }),
    );
    expect(
      await screen.findByText(
        strings["ssh.heldNotYet"].replaceAll("{{name}}", "atlas"),
        undefined,
        { timeout: 5000 },
      ),
    ).toBeInTheDocument();
    expect(heldChanges("computer.ssh_key").map((h) => h.hold)).toEqual([
      second,
    ]);
    const titles = vi
      .mocked(showToast)
      .mock.calls.map((c) => String(c[0].title));
    expect(
      titles.includes(
        strings["ssh.checkedHolds"].replaceAll("{{name}}", "atlas"),
      ),
    ).toBe(false);
  }, 40000);
  it("Dismiss of an older SSH send never frees a newer send's hold on the same computer", async () => {
    await renderPage(page, { state: "slowSshPending" });
    await openSshTab();
    await replaceSshWith(FIXTURE_KEY);
    await screen.findByText(strings["ssh.pendingTitle"], undefined, {
      timeout: 5000,
    });
    const first = heldChanges("computer.ssh_key")[0]?.hold;
    const settle = renderHook(() => useSettleChange()).result.current;
    const set = renderHook(() => useSetSshKey()).result.current;
    // The old banner's Dismiss is pressed, and before its warning is confirmed another tab frees the send and
    // sends another key.
    await userEvent.click(
      screen.getByRole("button", { name: strings["dismiss.act"] }),
    );
    const ask = await screen.findByRole("alertdialog");
    await act(async () => {
      await settle.ssh({ computer: atlasId(), key: FIXTURE_KEY }, first);
    });
    await act(async () => {
      await set({ computer: atlasId(), key: OTHER_KEY });
    });
    const second = heldChanges("computer.ssh_key")[0]?.hold;
    expect(second).not.toBe(first);
    const go = within(ask).queryByRole("button", {
      name: strings["dismiss.go"],
    });
    if (go) await userEvent.click(go);
    await new Promise((r) => setTimeout(r, 300));
    expect(heldChanges("computer.ssh_key").map((h) => h.hold)).toEqual([
      second,
    ]);
  }, 40000);
  it("a late SSH save answer after an account switch says nothing and puts nothing back", async () => {
    vi.mocked(showToast).mockClear();
    await renderPage(page, { state: "slowSsh" });
    await openSshTab();
    await replaceSshWith(OTHER_KEY);
    act(() => {
      bump("account");
    });
    await new Promise((r) => setTimeout(r, 900));
    const titles = vi
      .mocked(showToast)
      .mock.calls.map((c) => String(c[0].title));
    expect(titles.filter((x) => x.includes("atlas"))).toEqual([]);
  }, 40000);
  it("a late unknown SSH answer after an account switch shows no banner for the previous account", async () => {
    await renderPage(page, { state: "slowSshPending" });
    await openSshTab();
    await replaceSshWith(OTHER_KEY);
    // A real switch to another account: a bump that keeps the identity is the same account, whose
    // held change core rightly shows again once its answer lands, so the earlier pass leaned on timing.
    act(() => {
      setIdentity({ id: "someone-else", banned: false });
      bump("account");
    });
    await new Promise((r) => setTimeout(r, 900));
    expect(
      screen.queryByText(
        strings["ssh.pending"].replaceAll("{{name}}", "atlas"),
      ),
    ).toBeNull();
    expect(
      screen.queryByText(strings["ssh.failed"].replaceAll("{{name}}", "atlas")),
    ).toBeNull();
  }, 40000);
  it("with the Computers page hidden, the SSH tab names the computer as plain text with no link", async () => {
    hiddenPages.add("computers");
    try {
      await renderPage(page);
      await openSshTab();
      expect(await screen.findByText("atlas")).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "atlas" })).toBeNull();
      expect(
        screen.queryByRole("link", { name: strings["ssh.noComputer.action"] }),
      ).toBeNull();
    } finally {
      hiddenPages.clear();
    }
  }, 40000);
  it("with the Computers page hidden, another page's SSH hold shows no Computers link", async () => {
    hiddenPages.add("computers");
    try {
      await renderPage(page, { state: "pendingOps" });
      await act(async () => {
        await computersSsh.run({ id: atlasId(), key: OTHER_KEY });
      });
      await openSshTab();
      const lead = strings["ssh.heldElsewhere"].split("{{name}}")[0] ?? "";
      expect(
        await screen.findByText((t) => t.startsWith(lead)),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("link", { name: strings["ssh.openComputers"] }),
      ).toBeNull();
    } finally {
      hiddenPages.clear();
    }
  }, 40000);
  it("the new key's realm picker shows a realm's name and short handle, never its full id", async () => {
    await renderPage(page);
    act(() => setRealm("global"));
    await startNewKey();
    await userEvent.click(
      await screen.findByRole("radio", {
        name: new RegExp(strings["nk.pick"]),
      }),
    );
    const list = await screen.findByRole("group", { name: strings["nk.pickList"] });
    // The label shows above the list and is what names it.
    const named = document.getElementById(list.getAttribute("aria-labelledby") ?? "");
    expect(named).toHaveTextContent(strings["nk.pickList"]);
    expect(named).toBeVisible();
    expect(within(list).getByRole("checkbox", { name: /Acme client/ })).toBeInTheDocument();
    expect(list.textContent ?? "").not.toMatch(/[0-9a-f]{24}/);
  });
  // Every warned Dismiss (and Check) acts on the send it showed. Another tab's replacement send lands while the
  // warning is open, and the confirm runs in the same act, before React draws again: the stale control's handler
  // runs, as a browser click racing a store update does.
  const ciId = () =>
    (fixtureKeys.find((k) => k.alias === "ci-deploy") as { id: string }).id;
  const confirmDismissIn = async (scope: HTMLElement) => {
    await userEvent.click(
      within(scope).getByRole("button", { name: strings["dismiss.act"] }),
    );
    const ask = await screen.findByRole("alertdialog");
    return within(ask).getByRole("button", { name: strings["dismiss.go"] });
  };
  it("a pause's warned Dismiss never frees a newer pause another tab sent while the warning was open", async () => {
    sent.setEnabled = 0;
    sent.failList = 0;
    // The list shows ci-deploy paused once a pause went out (and gone once a delete did: none here).
    sent.remove = 0;
    await renderPage(page, { state: "listFailsNext" });
    act(() => setRealm("all"));
    await pauseFirstKey();
    const row = await screen.findByRole("row", { name: /ci-deploy/ });
    await within(row).findByRole("button", { name: "Check again" });
    const settle = useSettleChange();
    const v = { id: ciId(), on: false };
    const first = await settle.holdOf.setEnabled(v);
    expect(first).toBeTruthy();
    const go = await confirmDismissIn(row);
    let second: string | undefined;
    await act(async () => {
      await settle.setEnabled(v, first);
      await useSetEnabled()(v);
      second = await settle.holdOf.setEnabled(v);
      fireEvent.click(go);
    });
    await new Promise((r) => setTimeout(r, 300));
    expect(second).toBeTruthy();
    expect(second).not.toBe(first);
    expect(await settle.holdOf.setEnabled(v)).toBe(second);
  }, 40000);
  it("a row's Check pressed for a pause never frees a newer pause another tab sent before it", async () => {
    sent.setEnabled = 0;
    sent.failList = 0;
    // The list shows ci-deploy paused once a pause went out (and gone once a delete did: none here).
    sent.remove = 0;
    await renderPage(page, { state: "listFailsNext" });
    act(() => setRealm("all"));
    await pauseFirstKey();
    const row = await screen.findByRole("row", { name: /ci-deploy/ });
    const check = await within(row).findByRole("button", {
      name: "Check again",
    });
    const settle = useSettleChange();
    const v = { id: ciId(), on: false };
    const first = await settle.holdOf.setEnabled(v);
    let second: string | undefined;
    // The list read back shows ci-deploy paused: proof of a pause, but the row's Check examined the earlier one.
    await act(async () => {
      await settle.setEnabled(v, first);
      await useSetEnabled()(v);
      second = await settle.holdOf.setEnabled(v);
      fireEvent.click(check);
    });
    await new Promise((r) => setTimeout(r, 800));
    expect(second).toBeTruthy();
    expect(second).not.toBe(first);
    expect(await settle.holdOf.setEnabled(v)).toBe(second);
  }, 40000);
  it("a delete's warned Dismiss never frees a newer delete another tab sent while the warning was open", async () => {
    sent.remove = 0;
    await renderPage(page, { state: "pendingOps" });
    act(() => setRealm("all"));
    const id = ciId();
    const settle = useSettleChange();
    await act(async () => {
      await useRemoveKey()({ id });
    });
    const row = await screen.findByRole("row", { name: /ci-deploy/ });
    await within(row).findByRole("button", { name: "Check again" });
    const first = await settle.holdOf.remove({ id });
    const go = await confirmDismissIn(row);
    let second: string | undefined;
    await act(async () => {
      await settle.remove({ id }, first);
      await useRemoveKey()({ id });
      second = await settle.holdOf.remove({ id });
      fireEvent.click(go);
    });
    await new Promise((r) => setTimeout(r, 300));
    expect(second).toBeTruthy();
    expect(second).not.toBe(first);
    expect(await settle.holdOf.remove({ id })).toBe(second);
  }, 40000);
  it("a resume's warned Dismiss never frees a pause of that key another tab sent while the warning was open", async () => {
    // laptop-cli is paused: the list opens on State: Active, so it is listed under State: Paused.
    await renderPage(page, { state: "pendingOps", path: "/keys?state=paused" });
    act(() => setRealm(REALM_A));
    await openRow(/laptop-cli/);
    await userEvent.click(
      await screen.findByRole("button", { name: strings["act.resume"] }),
    );
    const row = await screen.findByRole("row", { name: /laptop-cli/ });
    await within(row).findByRole("button", { name: "Check again" });
    const id = (
      fixtureKeys.find((k) => k.alias === "laptop-cli") as {
        id: string;
      }
    ).id;
    const settle = useSettleChange();
    expect(await settle.holdOf.setEnabled({ id, on: true })).toBeTruthy();
    // The warning is opened for the resume; then another tab pauses the key (its outcome unknown too).
    const go = await confirmDismissIn(row);
    await act(async () => {
      await useSetEnabled()({ id, on: false });
    });
    const pause = await settle.holdOf.setEnabled({ id, on: false });
    expect(pause).toBeTruthy();
    await new Promise((r) => setTimeout(r, 300));
    // Still open (an unkeyed warning): its confirm runs; closed (keyed to the resume's hold): nothing runs.
    if (document.body.contains(go)) await userEvent.click(go);
    await new Promise((r) => setTimeout(r, 300));
    expect(await settle.holdOf.setEnabled({ id, on: false })).toBe(pause);
  }, 40000);
  it("a share stop's warned Dismiss never frees a newer stop another tab sent while the warning was open", async () => {
    await renderPage(page, {
      state: "sharedStopPending",
      path: "/keys/shared",
    });
    act(() => setRealm(REALM_A));
    const id = (shares[0] as { id: string }).id;
    const settle = useSettleChange();
    await act(async () => {
      await useStopShare()({ id });
    });
    const dismissBtn = await screen.findByRole(
      "button",
      { name: strings["dismiss.act"] },
      { timeout: 5000 },
    );
    const first = await settle.holdOf.remove({ id });
    expect(first).toBeTruthy();
    await userEvent.click(dismissBtn);
    const ask = await screen.findByRole("alertdialog");
    const go = within(ask).getByRole("button", { name: strings["dismiss.go"] });
    let second: string | undefined;
    await act(async () => {
      await settle.remove({ id }, first);
      await useStopShare()({ id });
      second = await settle.holdOf.remove({ id });
      fireEvent.click(go);
    });
    await new Promise((r) => setTimeout(r, 300));
    expect(second).not.toBe(first);
    expect(await settle.holdOf.remove({ id })).toBe(second);
  }, 40000);
  it("the Shared tab's warned Dismiss of unresolved shares ends only those it showed, never one that became unresolved meanwhile", async () => {
    const led = ledgerFor(capture().account, REALM_A);
    led.push({ alias: "hoody share shown0000", state: "unknown", id: null });
    await renderPage(page, { state: "pendingOps", path: "/keys/shared" });
    act(() => setRealm(REALM_A));
    await screen.findByText(strings["share.cantCheck"], undefined, {
      timeout: 5000,
    });
    await userEvent.click(
      screen.getByRole("button", { name: strings["dismiss.act"] }),
    );
    const ask = await screen.findByRole("alertdialog");
    const go = within(ask).getByRole("button", { name: strings["dismiss.go"] });
    act(() => {
      ledgerFor(capture().account, REALM_A).push({
        alias: "hoody share later0000",
        state: "unknown",
        id: null,
      });
      fireEvent.click(go);
    });
    const now = ledgerFor(capture().account, REALM_A);
    expect(now.find((x) => x.alias === "hoody share shown0000")?.state).toBe(
      "none",
    );
    expect(now.find((x) => x.alias === "hoody share later0000")?.state).toBe(
      "unknown",
    );
  }, 40000);
  it("the share drawer's warned Dismiss of an unresolved share ends only the one it showed", async () => {
    const led = ledgerFor(capture().account, REALM_A);
    led.push({ alias: "hoody share shown0001", state: "unknown", id: null });
    await renderPage(page, { state: "pendingOps", path: "/keys/shared" });
    act(() => setRealm(REALM_A));
    await openShare();
    const drawer = await screen.findByRole("dialog");
    await within(drawer).findByRole("button", {
      name: strings["action.checkAgain"],
    });
    const go = await confirmDismissIn(drawer);
    act(() => {
      ledgerFor(capture().account, REALM_A).push({
        alias: "hoody share later0001",
        state: "unknown",
        id: null,
      });
      fireEvent.click(go);
    });
    const now = ledgerFor(capture().account, REALM_A);
    expect(now.find((x) => x.alias === "hoody share shown0001")?.state).toBe(
      "none",
    );
    expect(now.find((x) => x.alias === "hoody share later0001")?.state).toBe(
      "unknown",
    );
  }, 40000);
  it("the share drawer's warned Dismiss of a lost share's stop never frees a newer stop sent while it was open", async () => {
    const share = shares[0] as { id: string };
    ledgerFor(capture().account, REALM_A).push({
      alias: "hoody share lost",
      state: "lost",
      id: share.id,
    });
    await renderPage(page, {
      state: "sharedStopPending",
      path: "/keys/shared",
    });
    act(() => setRealm(REALM_A));
    await openShare();
    const drawer = await screen.findByRole("dialog");
    await userEvent.click(
      await within(drawer).findByRole("button", {
        name: strings["share.stopIt"],
      }),
    );
    await within(drawer).findByRole("button", {
      name: strings["action.checkAgain"],
    });
    const settle = useSettleChange();
    const first = await settle.holdOf.remove({ id: share.id });
    expect(first).toBeTruthy();
    const go = await confirmDismissIn(drawer);
    let second: string | undefined;
    await act(async () => {
      await settle.remove({ id: share.id }, first);
      await useStopShare()({ id: share.id });
      second = await settle.holdOf.remove({ id: share.id });
      fireEvent.click(go);
    });
    await new Promise((r) => setTimeout(r, 300));
    expect(second).not.toBe(first);
    expect(await settle.holdOf.remove({ id: share.id })).toBe(second);
  }, 40000);
  it("a create's warned Dismiss never frees a newer create another tab sent after this one was freed", async () => {
    sent.twin = 0;
    sent.create = 0;
    forgetUnresolved();
    await renderPage(page, { state: "namesakeFailBefore" });
    const a = renderHook(() => useMintFlow(null, () => {}));
    await act(async () => {
      await a.result.current.start({
        kind: "create",
        body: { alias: "ci" },
        alias: "ci",
      });
    });
    // What tab A's warning was opened for.
    const shown = a.result.current.phase;
    expect(shown.kind).toBe("pending");
    const mine = () =>
      heldAttempts()
        .filter((h) => h.by === "keys")
        .map((h) => h.id);
    const [first] = mine();
    // Tab B dismisses that create and sends another one, whose outcome is unknown too.
    const b = renderHook(() => useMintFlow(null, () => {}));
    act(() => {
      b.result.current.dismiss(b.result.current.phase);
    });
    await waitFor(() => expect(b.result.current.phase.kind).toBe("form"));
    await act(async () => {
      await b.result.current.start({
        kind: "create",
        body: { alias: "ci2" },
        alias: "ci2",
      });
    });
    const [second] = mine();
    expect(second).toBeTruthy();
    expect(second).not.toBe(first);
    // Tab A now shows the later create; its warning was opened for the earlier one.
    await waitFor(() =>
      expect(
        (a.result.current.phase as { hold?: string }).hold ??
          a.result.current.phase.kind,
      ).not.toBe("form"),
    );
    expect(a.result.current.phase.kind).toBe("pending");
    vi.mocked(showToast).mockClear();
    act(() => {
      a.result.current.dismiss(shown);
    });
    // Core lets a hold go asynchronously: give it the time a Dismiss takes.
    await new Promise((r) => setTimeout(r, 300));
    expect(mine()).toEqual([second]);
    // A create may have no name yet; the toast says it is the key being made.
    expect(toastTitles()).toContain(strings["mint.notSettled"]);
  }, 40000);
  it("the warned Dismiss of a key's delete (made without its secret) never frees a newer delete of it", async () => {
    forgetUnresolved();
    await renderPage(page, { state: "deleteUnknown" });
    const a = renderHook(() => useMintFlow(null, () => {}));
    await act(async () => {
      await a.result.current.start({
        kind: "create",
        body: { alias: "ci-deploy" },
        alias: "ci-deploy",
      });
    });
    expect(a.result.current.phase.kind).toBe("nosecret");
    await act(async () => {
      await a.result.current.deleteMade();
    });
    const shown = a.result.current.phase;
    expect((shown as { unsure?: boolean }).unsure).toBe(true);
    const id = (shown as { key: { id: string } }).key.id;
    const settle = useSettleChange();
    const first = await settle.holdOf.remove({ id });
    expect(first).toBeTruthy();
    await act(async () => {
      await settle.remove({ id }, first);
      await useRemoveKey()({ id });
    });
    const second = await settle.holdOf.remove({ id });
    expect(second).toBeTruthy();
    expect(second).not.toBe(first);
    await act(async () => {
      await a.result.current.dismissMade(shown);
    });
    expect(await settle.holdOf.remove({ id })).toBe(second);
  }, 40000);
  it("an SSH save refused under a hold another tab just took shows that hold, and its Dismiss frees it", async () => {
    await renderPage(page, { state: "sshNonePending" });
    await openSshTab();
    await userEvent.click(
      await screen.findByRole("button", { name: strings["ssh.set"] }),
    );
    await userEvent.type(
      screen.getByLabelText(strings["ssh.field"]),
      OTHER_KEY,
    );
    const save = screen.getByRole("button", { name: strings["ssh.save"] });
    await act(async () => {
      await useSetSshKey()({ computer: atlasId(), key: OTHER_KEY });
      fireEvent.click(save);
    });
    await screen.findByText(strings["ssh.pendingTitle"]);
    await new Promise((r) => setTimeout(r, 300));
    expect(heldChanges("computer.ssh_key")).toHaveLength(1);
    await waitFor(
      async () => {
        if (!screen.queryByRole("alertdialog"))
          await userEvent.click(
            screen.getAllByRole("button", {
              name: strings["dismiss.act"],
            })[0] as HTMLElement,
          );
        expect(screen.getByRole("alertdialog")).toBeInTheDocument();
      },
      { timeout: 5000, interval: 300 },
    );
    await userEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: strings["dismiss.go"],
      }),
    );
    await waitFor(() =>
      expect(heldChanges("computer.ssh_key")).toHaveLength(0),
    );
  }, 40000);
  // A stale control pressed while another tab's send of the same change is held: core refuses it (READ_BACK_FIRST)
  // and nothing goes out. The view then shows that held send with its hold, so its Check reads and its warned
  // Dismiss frees exactly it.
  const toastTitles = () =>
    vi.mocked(showToast).mock.calls.map((c) => String(c[0].title));
  const deleteMadeUnderHeld = async (
    settle: ReturnType<typeof useSettleChange>,
  ) => {
    forgetUnresolved();
    sent.remove = 0;
    await renderPage(page, { state: "deleteUnknown" });
    const a = renderHook(() => useMintFlow(null, () => {}));
    await act(async () => {
      await a.result.current.start({
        kind: "create",
        body: { alias: "ci-deploy" },
        alias: "ci-deploy",
      });
    });
    expect(a.result.current.phase.kind).toBe("nosecret");
    const id = (a.result.current.phase as { key: { id: string } }).key.id;
    // Tab B deletes the key; its outcome is unknown, so core holds it.
    await act(async () => {
      await useRemoveKey()({ id });
    });
    const held = await settle.holdOf.remove({ id });
    expect(held).toBeTruthy();
    expect(sent.remove).toBe(1);
    // Tab A's Delete, pressed from its stale view: refused, nothing sent.
    await act(async () => {
      await a.result.current.deleteMade();
    });
    expect(sent.remove).toBe(1);
    const shown = a.result.current.phase as { unsure?: boolean; hold?: string };
    expect(shown.unsure).toBe(true);
    expect(shown.hold).toBe(held);
    return { a, id };
  };
  it("a delete (made without its secret) refused under another tab's held delete shows it, and Check reads and frees exactly it", async () => {
    const settle = useSettleChange();
    const { a, id } = await deleteMadeUnderHeld(settle);
    // The list no longer shows the key: Check's fresh read proves that delete.
    vi.mocked(showToast).mockClear();
    await act(async () => {
      await a.result.current.checkMade();
    });
    expect(toastTitles()).not.toContain(strings["op.notSettledOf"].replace("{{name}}", "ci-deploy"));
    expect(a.result.current.phase.kind).toBe("form");
    expect(await settle.holdOf.remove({ id })).toBeUndefined();
    expect(sent.remove).toBe(1);
  }, 40000);
  it("a delete (made without its secret) refused under another tab's held delete is freed by its warned Dismiss", async () => {
    const settle = useSettleChange();
    const { a, id } = await deleteMadeUnderHeld(settle);
    const shown = a.result.current.phase;
    vi.mocked(showToast).mockClear();
    await act(async () => {
      await a.result.current.dismissMade(shown);
    });
    expect(toastTitles()).not.toContain(strings["op.notSettledOf"].replace("{{name}}", "ci-deploy"));
    expect(await settle.holdOf.remove({ id })).toBeUndefined();
    expect(sent.remove).toBe(1);
  }, 40000);
  // A toast with no place on screen names what it is about (the key, the computer, the share's realm).
  it("a warned Dismiss of a delete whose hold moved names the key in its toast", async () => {
    const settle = useSettleChange();
    const { a, id } = await deleteMadeUnderHeld(settle);
    const shown = a.result.current.phase;
    // Tab B's held delete is freed and sent again: the warning's send is no longer the one held.
    await act(async () => {
      await settle.remove({ id }, await settle.holdOf.remove({ id }));
      await useRemoveKey()({ id });
    });
    vi.mocked(showToast).mockClear();
    await act(async () => {
      await a.result.current.dismissMade(shown);
    });
    expect(toastTitles()).toContain(strings["op.notSettledOf"].replace("{{name}}", "ci-deploy"));
  }, 40000);
  it("a key's Delete pressed under another page's held delete names the key in its toast", async () => {
    await renderPage(page, { state: "pendingOps" });
    act(() => setRealm(REALM_A));
    const id = ciId();
    await openRow(/ci-deploy/);
    await userEvent.click(
      await screen.findByRole("button", { name: strings["act.delete"] }),
    );
    const go = await screen.findByRole("button", { name: strings["del.go"] });
    await act(async () => {
      await otherPageRemove.run({ id });
    });
    vi.mocked(showToast).mockClear();
    await userEvent.click(go);
    await waitFor(() =>
      expect(toastTitles()).toContain(strings["op.heldElsewhereOf"].replace("{{name}}", "ci-deploy")),
    );
  }, 40000);
  it("a share's Stop pressed under another page's held stop names the share's realm in its toast", async () => {
    await renderPage(page, { state: "sharedStopPending", path: "/keys/shared" });
    act(() => setRealm(REALM_A));
    const share = shares[0] as { id: string };
    await waitFor(
      async () => {
        if (!screen.queryByRole("alertdialog"))
          await userEvent.click(
            screen.getAllByRole("button", { name: strings["share.stop"] })[0] as HTMLElement,
          );
        expect(screen.getByRole("alertdialog")).toBeInTheDocument();
      },
      { timeout: 10000, interval: 300 },
    );
    const ask = screen.getByRole("alertdialog");
    await act(async () => {
      await otherPageRemove.run({ id: share.id });
    });
    vi.mocked(showToast).mockClear();
    await userEvent.click(within(ask).getByRole("button", { name: strings["share.stopGo"] }));
    await waitFor(() =>
      expect(toastTitles()).toContain(strings["share.heldElsewhere"].replace("{{realm}}", "Personal")),
    );
  }, 40000);
  it("a lost share's Stop refused under another tab's held stop shows it; Check reads, and the warned Dismiss frees exactly it", async () => {
    sent.remove = 0;
    const share = shares[0] as { id: string };
    ledgerFor(capture().account, REALM_A).push({
      alias: "hoody share lost",
      state: "lost",
      id: share.id,
    });
    await renderPage(page, {
      state: "sharedStopPending",
      path: "/keys/shared",
    });
    act(() => setRealm(REALM_A));
    await openShare();
    const drawer = await screen.findByRole("dialog");
    const stopIt = await within(drawer).findByRole("button", {
      name: strings["share.stopIt"],
    });
    const settle = useSettleChange();
    // Tab B stops the share (outcome unknown, held); tab A's drawer still offers Stop it, and it is pressed.
    await act(async () => {
      await useStopShare()({ id: share.id });
      fireEvent.click(stopIt);
    });
    const held = await settle.holdOf.remove({ id: share.id });
    expect(held).toBeTruthy();
    const check = await within(drawer).findByRole("button", {
      name: strings["action.checkAgain"],
    });
    await new Promise((r) => setTimeout(r, 300));
    expect(sent.remove).toBe(1);
    // The share is still live: the read proves nothing, and says so (never "nothing was cleared").
    await userEvent.click(check);
    expect(
      await within(drawer).findByText(strings["share.stopNotYet"]),
    ).toBeInTheDocument();
    expect(await settle.holdOf.remove({ id: share.id })).toBe(held);
    await userEvent.click(await confirmDismissIn(drawer));
    await waitFor(async () =>
      expect(await settle.holdOf.remove({ id: share.id })).toBeUndefined(),
    );
    expect(within(drawer).queryByText(strings["op.notSettled"])).toBeNull();
    expect(sent.remove).toBe(1);
  }, 40000);
  it("a key's Delete refused under another tab's held delete shows it; the dialog's Check reads it, and nothing is sent twice", async () => {
    sent.remove = 0;
    await renderPage(page, { state: "pendingOps" });
    act(() => setRealm(REALM_A));
    const id = ciId();
    await openRow(/ci-deploy/);
    await userEvent.click(
      await screen.findByRole("button", { name: strings["act.delete"] }),
    );
    const go = await screen.findByRole("button", { name: strings["del.go"] });
    const settle = useSettleChange();
    // Tab B deletes the key while this dialog is open (outcome unknown, held); then this dialog's Delete is pressed.
    await act(async () => {
      await useRemoveKey()({ id });
    });
    const held = await settle.holdOf.remove({ id });
    expect(held).toBeTruthy();
    await userEvent.click(go);
    const ask = await screen.findByRole("alertdialog");
    const check = await within(ask).findByRole("button", { name: /Check/ });
    expect(sent.remove).toBe(1);
    // The list still shows the key: the read proves nothing and says so (never "nothing was cleared").
    vi.mocked(showToast).mockClear();
    await userEvent.click(check);
    // Said in the dialog, never as a toast.
    expect(await within(ask).findByText(/is still in the list/)).toBeInTheDocument();
    expect(within(ask).queryByText(strings["op.notSettledOf"].replace("{{name}}", "ci-deploy"))).toBeNull();
    expect(toastTitles()).toEqual([]);
    expect(await settle.holdOf.remove({ id })).toBe(held);
    expect(sent.remove).toBe(1);
  }, 40000);
  it("a stale hold given to settleChange.setEnabled or .remove frees nothing and leaves the newer hold held", async () => {
    sent.setEnabled = 0;
    sent.remove = 0;
    await renderPage(page, { state: "pendingOps" });
    act(() => setRealm("all"));
    const settle = useSettleChange();
    const v = { id: ciId(), on: false };
    await act(async () => {
      await useSetEnabled()(v);
    });
    const oldPause = await settle.holdOf.setEnabled(v);
    expect(oldPause).toBeTruthy();
    expect(await settle.setEnabled(v, oldPause)).not.toBe("notSettled");
    await act(async () => {
      await useSetEnabled()(v);
    });
    const newPause = await settle.holdOf.setEnabled(v);
    expect(newPause).toBeTruthy();
    expect(newPause).not.toBe(oldPause);
    expect(await settle.setEnabled(v, oldPause)).toBe("notSettled");
    expect(await settle.holdOf.setEnabled(v)).toBe(newPause);
    const k = { id: v.id };
    await act(async () => {
      await useRemoveKey()(k);
    });
    const oldDel = await settle.holdOf.remove(k);
    expect(oldDel).toBeTruthy();
    expect(await settle.remove(k, oldDel)).not.toBe("notSettled");
    await act(async () => {
      await useRemoveKey()(k);
    });
    const newDel = await settle.holdOf.remove(k);
    expect(newDel).toBeTruthy();
    expect(newDel).not.toBe(oldDel);
    expect(await settle.remove(k, oldDel)).toBe("notSettled");
    expect(await settle.holdOf.remove(k)).toBe(newDel);
  }, 40000);
  it("an SSH change this page sends is recorded as sent from Keys", async () => {
    await renderPage(page, { state: "sshNonePending" });
    act(() => setRealm(REALM_A));
    await userEvent.click(
      await screen.findByRole("tab", { name: new RegExp(strings["tab.ssh"]) }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: strings["ssh.set"] }),
    );
    await pasteInto(screen.getByLabelText(strings["ssh.field"]), "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFakeFixtureKeyOnly0000000000000000 a@b");
    await userEvent.click(
      screen.getByRole("button", { name: strings["ssh.save"] }),
    );
    await screen.findByText(strings["ssh.pendingTitle"]);
    const held = heldChanges("computer.ssh_key");
    expect(held).toHaveLength(1);
    expect(held[0]?.from?.page).toBe("keys");
  }, 40000);
  it("settling an SSH change Computers holds frees nothing and says so, so it is never shown as released", async () => {
    await renderPage(page, { state: "pendingOps" });
    const id =
      (fixtureWorld.computers as readonly { name: string; id: string }[]).find(
        (x) => x.name === "atlas",
      )?.id ?? "";
    await act(async () => {
      await computersSsh.run({
        id,
        key: "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOtherPage a@b",
      });
    });
    expect(heldChanges("computer.ssh_key")).toHaveLength(1);
    const settle = renderHook(() => useSettleChange()).result.current;
    let freed: unknown;
    await act(async () => {
      const v = {
        computer: id,
        key: "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOtherPage a@b",
      };
      freed = await settle.ssh(v, await settle.holdOf.ssh(v));
    });
    // Computers' test sender names no page: no link.
    expect(freed).toEqual({ from: null });
    expect(heldChanges("computer.ssh_key")).toHaveLength(1);
  }, 40000);
  it("a save pressed under Computers' SSH hold sends nothing and reads as that page's held change, never as not sent", async () => {
    sent.setSsh = 0;
    await renderPage(page, { state: "pendingOps" });
    const id =
      (fixtureWorld.computers as readonly { name: string; id: string }[]).find(
        (x) => x.name === "atlas",
      )?.id ?? "";
    await act(async () => {
      await computersSsh.run({
        id,
        key: "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOtherPage a@b",
      });
    });
    const set = renderHook(() => useSetSshKey()).result.current;
    let r: { outcome: string; code?: string } | undefined;
    await act(async () => {
      r = await set({
        computer: id,
        key: "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFakeFixtureKeyOnly0000000000000000 a@b",
      });
    });
    expect(r).toEqual({
      outcome: "pending",
      code: "HELD_BY_OTHER",
      from: null,
    });
    expect(heldChanges("computer.ssh_key")).toHaveLength(1);
  }, 40000);
  it("a delete another page holds is not freed by this page's settle, which says so", async () => {
    await renderPage(page, { state: "pendingOps" });
    const id = keys[0]?.id ?? "";
    await act(async () => {
      await otherPageRemove.run({ id });
    });
    expect(await isChangePending("remove", { id })).toBe(true);
    const settle = renderHook(() => useSettleChange()).result.current;
    let freed: unknown;
    await act(async () => {
      freed = await settle.remove({ id }, await settle.holdOf.remove({ id }));
    });
    expect(freed).toEqual({ from: { page: "account", path: "/account" } });
    expect(await isChangePending("remove", { id })).toBe(true);
  }, 40000);
  it("a delete another page holds shows on its row read-only, with that page's link and no Check again or Dismiss", async () => {
    await renderPage(page, { state: "pendingOps" });
    act(() => setRealm(REALM_A));
    const k = keys.find((x) => x.name === "ci-deploy");
    await screen.findByRole("row", { name: /ci-deploy/ });
    await act(async () => {
      await otherPageRemove.run({ id: k?.id ?? "" });
    });
    const row = await screen.findByRole("row", {
      name: new RegExp(strings["state.heldElsewhere"]),
    });
    expect(
      within(row).getByRole("link", { name: strings["op.openSender"] }),
    ).toHaveAttribute("href", expect.stringMatching(/\/account$/));
    expect(
      within(row).queryByRole("button", { name: strings["state.checkAgain"] }),
    ).toBeNull();
    expect(
      within(row).queryByRole("button", { name: strings["dismiss.act"] }),
    ).toBeNull();
    // The inspector says the same, with no Check again or Dismiss either.
    await openRow(/ci-deploy/);
    const insp = await screen.findByRole("region", { name: "Details" });
    expect(
      await within(insp).findByText(strings["op.heldElsewhere"]),
    ).toBeInTheDocument();
    expect(
      within(insp).queryByRole("button", {
        name: strings["action.checkAgain"],
      }),
    ).toBeNull();
    expect(
      within(insp).queryByRole("button", { name: strings["dismiss.act"] }),
    ).toBeNull();
  }, 40000);
  it("a stop another page holds shows on the share's row read-only, with no Stop, Check again or Dismiss", async () => {
    await renderPage(page, {
      state: "sharedStopPending",
      path: "/keys/shared",
    });
    act(() => setRealm(REALM_A));
    const share = shares[0] as { id: string };
    await act(async () => {
      await otherPageRemove.run({ id: share.id });
    });
    const link = await screen.findByRole("link", {
      name: strings["op.openSender"],
    });
    const row = (link.closest('[role="row"]') ??
      link.closest("tr")) as HTMLElement;
    expect(
      within(row).getByText(strings["op.heldElsewhere"]),
    ).toBeInTheDocument();
    expect(
      within(row).queryByRole("button", { name: strings["share.stopAgain"] }),
    ).toBeNull();
    expect(
      within(row).queryByRole("button", { name: strings["dismiss.act"] }),
    ).toBeNull();
  }, 40000);
  it("a hold another page takes while this page settles is not reported as freed", async () => {
    let asked = 0;
    let settled = 0;
    const other = {
      outcome: "not_sent" as const,
      code: "HELD_BY_OTHER" as const,
      heldFrom: { page: "account", path: "/account" },
    };
    // The first look finds nothing; by the second, another page holds the change.
    const freed = await settleOwn(
      {
        heldByOther: () => Promise.resolve(asked++ === 0 ? undefined : other),
        settle: () => {
          settled++;
          return Promise.resolve(true);
        },
        holdOf: () => Promise.resolve(undefined),
      },
      { id: "k" },
      "h1",
    );
    expect(settled).toBe(1);
    expect(freed).toEqual({ from: { page: "account", path: "/account" } });
  });
  it("a delete refused under another page's hold closes the dialog and shows the row read-only, never Check again", async () => {
    sent.remove = 0;
    await renderPage(page, { state: "pendingOps" });
    act(() => setRealm(REALM_A));
    const k = keys.find((x) => x.name === "ci-deploy");
    await openRow(/ci-deploy/);
    await userEvent.click(
      await screen.findByRole("button", { name: strings["act.delete"] }),
    );
    const go = await screen.findByRole("button", { name: strings["del.go"] });
    // Another page sends the same delete while the dialog is open: this page's press is refused under its hold.
    await act(async () => {
      await otherPageRemove.run({ id: k?.id ?? "" });
    });
    const before = sent.remove;
    await userEvent.click(go);
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(sent.remove).toBe(before);
    const row = await screen.findByRole("row", {
      name: new RegExp(strings["state.heldElsewhere"]),
    });
    expect(
      within(row).getByRole("link", { name: strings["op.openSender"] }),
    ).toHaveAttribute("href", expect.stringMatching(/\/account$/));
    expect(
      within(row).queryByRole("button", { name: strings["state.checkAgain"] }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: /Check/ })).toBeNull();
  }, 40000);
  it("a realm switch while this page settles is never reported as freed or as held elsewhere", async () => {
    setRealm(REALM_A);
    try {
      // The realm switches during the first look: nothing is settled.
      let settled = 0;
      const early = await settleOwn(
        {
          heldByOther: () => {
            setRealm(REALM_B);
            return Promise.resolve(undefined);
          },
          settle: () => {
            settled++;
            return Promise.resolve(true);
          },
          holdOf: () => Promise.resolve(undefined),
        },
        { id: "k" },
        "h1",
      );
      expect(early).toBe("notSettled");
      expect(settled).toBe(0);
      // The realm switches during the settle: the second look reads another realm and proves nothing.
      setRealm(REALM_A);
      const late = await settleOwn(
        {
          heldByOther: () => Promise.resolve(undefined),
          settle: () => {
            setRealm(REALM_B);
            return Promise.resolve(true);
          },
          holdOf: () => Promise.resolve(undefined),
        },
        { id: "k" },
        "h1",
      );
      expect(late).toBe("notSettled");
    } finally {
      setRealm(REALM_A);
    }
  });
  it("a realm round trip while this page settles (A, then B, then A again) is never reported as freed", async () => {
    setRealm(REALM_A);
    try {
      let asked = 0;
      let lastAsked = false;
      const out = await settleOwn(
        {
          heldByOther: () => {
            // The last look runs back in A: by the realm alone it would read as A's own answer.
            if (asked++ > 0) {
              setRealm(REALM_A);
              lastAsked = true;
            }
            return Promise.resolve(undefined);
          },
          settle: () => {
            setRealm(REALM_B);
            bump("switch");
            return Promise.resolve(true);
          },
          holdOf: () => Promise.resolve(undefined),
        },
        { id: "k" },
        "h1",
      );
      expect(out).toBe("notSettled");
      // Answered as soon as the settle returned into another context: no second look is taken.
      expect(lastAsked).toBe(false);
      // A switch away and back again inside the settle alone is caught by the generation.
      const back = await settleOwn(
        {
          heldByOther: () => Promise.resolve(undefined),
          settle: () => {
            setRealm(REALM_B);
            bump("switch");
            setRealm(REALM_A);
            bump("switch");
            return Promise.resolve(true);
          },
          holdOf: () => Promise.resolve(undefined),
        },
        { id: "k" },
        "h1",
      );
      expect(back).toBe("notSettled");
    } finally {
      setRealm(REALM_A);
    }
  });
  it("a proof frees only the send held before its read; a send still held afterwards is never announced as freed", async () => {
    setRealm(REALM_A);
    const calls: unknown[][] = [];
    // Core keeps a newer send of the same change (another incarnation the read never saw): settle frees nothing.
    const out = await settleOwn(
      {
        heldByOther: () => Promise.resolve(undefined),
        settle: (...a: unknown[]) => {
          calls.push(a);
          return Promise.resolve(false);
        },
        holdOf: () => Promise.resolve("h2"),
      },
      { id: "k" },
      "h1",
    );
    expect(calls).toEqual([[{ id: "k" }, "h1"]]);
    expect(out).toBe("notSettled");
    // Nothing held when the read began, and a send of this page held now: nothing is freed, nothing announced.
    calls.length = 0;
    const late = await settleOwn(
      {
        heldByOther: () => Promise.resolve(undefined),
        settle: (...a: unknown[]) => {
          calls.push(a);
          return Promise.resolve(true);
        },
        holdOf: () => Promise.resolve("h3"),
      },
      { id: "k" },
      undefined,
    );
    expect(calls).toEqual([]);
    expect(late).toBe("notSettled");
  });
  it("C9EB-1: when storage can't keep a create's hold, nothing is sent and the form says so", async () => {
    sent.create = 0;
    await renderPage(page, { state: "pendingCreate" });
    unreadableStore();
    try {
      const flow = renderHook(() => useMintFlow(null, () => {}));
      let out: unknown;
      await act(async () => {
        out = await flow.result.current.start({
          kind: "create",
          body: { alias: "ci" },
          alias: "ci",
        });
      });
      expect(out).toEqual({ code: "NO_STORAGE" });
      expect(sent.create).toBe(0);
      expect(flow.result.current.phase.kind).toBe("form");
      expect(heldAttempts().filter((h) => h.by === "keys")).toHaveLength(0);
    } finally {
      setChangeStoreAdapter(null);
    }
  }, 40000);
  it("C9EB-4: at core's hold cap, a create is refused as another hold's, never shown as this one, and nothing is sent", async () => {
    sent.create = 0;
    await renderPage(page, { state: "pendingCreate" });
    const others: AttemptHold[] = [];
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      const got = await holdAttempt(`other.lock${i}`, { by: "other" });
      if (got.ok) others.push(got.hold);
    }
    expect(others).toHaveLength(MAX_ATTEMPTS);
    try {
      const flow = renderHook(() => useMintFlow(null, () => {}));
      let out: unknown;
      await act(async () => {
        out = await flow.result.current.start({
          kind: "create",
          body: { alias: "ci" },
          alias: "ci",
        });
      });
      expect(out).toEqual({ code: "HELD_OTHER" });
      expect(sent.create).toBe(0);
      expect(flow.result.current.phase.kind).toBe("form");
    } finally {
      for (const h of others) h.release();
    }
  }, 40000);
  it("at core's hold cap, a share is refused as not sent, never as a storage problem, and nothing is sent", async () => {
    sent.create = 0;
    await renderPage(page, { state: "pendingCreate", path: "/keys/shared" });
    act(() => setRealm(REALM_A));
    await openShare();
    const create = await toReviewed();
    const others: AttemptHold[] = [];
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      const got = await holdAttempt(`other.lock${i}`, { by: "other" });
      if (got.ok) others.push(got.hold);
    }
    expect(others).toHaveLength(MAX_ATTEMPTS);
    try {
      await userEvent.click(create);
      const dlg = await screen.findByRole("dialog");
      expect(
        await within(dlg).findByText(strings["share.notSent"]),
      ).toBeInTheDocument();
      expect(within(dlg).queryByText(strings["share.noStorage"])).toBeNull();
      expect(sent.create).toBe(0);
    } finally {
      for (const h of others) h.release();
    }
  }, 40000);
  it("in a browser without the cross-tab lock, a create or a share is refused as storage, and nothing is sent", async () => {
    sent.create = 0;
    await renderPage(page, { state: "pendingCreate", path: "/keys/shared" });
    act(() => setRealm(REALM_A));
    Reflect.deleteProperty(globalThis.navigator, "locks");
    const flow = renderHook(() => useMintFlow(null, () => {}));
    let out: unknown;
    await act(async () => {
      out = await flow.result.current.start({
        kind: "create",
        body: { alias: "ci" },
        alias: "ci",
      });
    });
    expect(out).toEqual({ code: "NO_STORAGE" });
    expect(flow.result.current.phase.kind).toBe("form");
    await openShare();
    await userEvent.click(
      await toReviewed(),
    );
    expect(
      await within(await screen.findByRole("dialog")).findByText(
        strings["share.noStorage"],
      ),
    ).toBeInTheDocument();
    expect(sent.create).toBe(0);
    expect(heldAttempts()).toHaveLength(0);
  }, 40000);
  it("C9EB-2: when storage can't keep a share's hold, nothing is sent and the drawer says so", async () => {
    sent.create = 0;
    await renderPage(page, { state: "pendingCreate", path: "/keys/shared" });
    act(() => setRealm(REALM_A));
    await openShare();
    const create = await toReviewed();
    unreadableStore();
    try {
      await userEvent.click(create);
      expect(
        await within(await screen.findByRole("dialog")).findByText(
          strings["share.noStorage"],
        ),
      ).toBeInTheDocument();
      expect(sent.create).toBe(0);
      expect(heldAttempts(`keys.share.${REALM_A}`)).toHaveLength(0);
    } finally {
      setChangeStoreAdapter(null);
    }
  }, 40000);
  it("C9EB-3: a share whose account or realm changes while its hold is taken sends nothing and lets the hold go", async () => {
    sent.create = 0;
    await renderPage(page, { state: "pendingCreate", path: "/keys/shared" });
    act(() => setRealm(REALM_A));
    await openShare();
    const create = await toReviewed();
    const release = holdNextStoreLock();
    try {
      await userEvent.click(create);
      act(() => {
        bump("switch");
      });
      await act(async () => {
        release();
        await new Promise((r) => setTimeout(r, 100));
      });
      expect(sent.create).toBe(0);
      expect(heldAttempts(`keys.share.${REALM_A}`)).toHaveLength(0);
    } finally {
      release();
      Reflect.deleteProperty(globalThis.navigator, "locks");
    }
  }, 40000);
  it("C9: a pause read back unchanged stays unconfirmed, with Check again and Dismiss, never failed", async () => {
    vi.mocked(showToast).mockClear();
    await renderPage(page, { state: "pendingOps" });
    await pauseFirstKey();
    const row = await screen.findByRole("row", { name: /ci-deploy/ });
    await userEvent.click(
      await within(row).findByRole("button", { name: "Check again" }),
    );
    // What the read found is on the row: a warn that it may still go through, its full words read out;
    // no toast.
    const notYet = strings["op.notYet"].replace("{{name}}", "ci-deploy");
    await waitFor(() =>
      expect(
        within(screen.getByRole("row", { name: /ci-deploy/ })).getByText(strings["said.notYet"]),
      ).toBeInTheDocument(),
    );
    expect(
      within(screen.getByRole("row", { name: /ci-deploy/ })).getByRole("status"),
    ).toHaveTextContent(notYet);
    expect(vi.mocked(showToast).mock.calls.map((c) => String(c[0].title))).not.toContain(notYet);
    const live = screen.getByRole("row", { name: /ci-deploy/ });
    expect(
      within(live).getByRole("button", { name: "Check again" }),
    ).toBeInTheDocument();
    expect(
      within(live).getByRole("button", { name: strings["dismiss.act"] }),
    ).toBeInTheDocument();
    const titles = vi
      .mocked(showToast)
      .mock.calls.map((c) => String(c[0].title));
    expect(titles.some((x) => /did not change/.test(x))).toBe(false);
  }, 40000);
  it("C9: a delete read back with the key still listed stays unconfirmed, never 'nothing was deleted'", async () => {
    vi.mocked(showToast).mockClear();
    await renderPage(page, { state: "pendingOps" });
    await openRow(/ci-deploy/);
    await userEvent.click(
      await screen.findByRole("button", { name: strings["act.delete"] }),
    );
    let ask = await screen.findByRole("alertdialog");
    await userEvent.click(
      within(ask).getByRole("button", { name: strings["del.go"] }),
    );
    ask = await screen.findByRole("alertdialog");
    await userEvent.click(
      await within(ask).findByRole("button", {
        name: strings["action.checkAgain"],
      }),
    );
    // What the read found shows in the dialog, and on the row once it is closed; no toast.
    const notYet = strings["del.notYet"].replace("{{name}}", "ci-deploy");
    expect(await within(ask).findByText(notYet)).toBeInTheDocument();
    expect(vi.mocked(showToast).mock.calls.map((c) => String(c[0].title))).not.toContain(notYet);
    expect(screen.queryByText(/nothing was deleted/)).toBeNull();
    await userEvent.keyboard("{Escape}");
    const row = await screen.findByRole("row", { name: /ci-deploy/ });
    await within(row).findByRole("button", { name: "Check again" });
    expect(within(row).getByText(strings["said.notYet"])).toBeInTheDocument();
  }, 40000);
  it("C9: a stop read back with the share still live stays unconfirmed, never failed", async () => {
    vi.mocked(showToast).mockClear();
    await renderPage(page, {
      state: "sharedStopPending",
      path: "/keys/shared",
    });
    act(() => setRealm(REALM_A));
    await waitFor(
      async () => {
        if (!screen.queryByRole("alertdialog"))
          await userEvent.click(
            screen.getAllByRole("button", {
              name: strings["share.stop"],
            })[0] as HTMLElement,
          );
        expect(screen.getByRole("alertdialog")).toBeInTheDocument();
      },
      { timeout: 10000, interval: 300 },
    );
    let ask = screen.getByRole("alertdialog");
    await userEvent.click(
      within(ask).getByRole("button", { name: strings["share.stopGo"] }),
    );
    ask = await screen.findByRole("alertdialog");
    await userEvent.click(
      await within(ask).findByRole("button", {
        name: strings["action.checkAgain"],
      }),
    );
    // What the read found shows in the dialog; no toast.
    expect(await within(ask).findByText(strings["share.stopNotYet"])).toBeInTheDocument();
    expect(vi.mocked(showToast).mock.calls.map((c) => String(c[0].title))).not.toContain(strings["share.stopNotYet"]);
    expect(screen.queryByText(strings["share.stopFailed"])).toBeNull();
  }, 40000);
  it("C9: a computer read answered after a realm switch proves nothing, not even a 404", async () => {
    await renderPage(page, { state: "sshGone" });
    sent.setSsh = 1;
    const id =
      (fixtureWorld.computers as readonly { name: string; id: string }[]).find(
        (x) => x.name === "atlas",
      )?.id ?? "";
    const fresh = renderHook(() => useFreshComputer());
    let res: { gone?: boolean; error: boolean } = { error: false };
    await act(async () => {
      const p = fresh.result.current(id);
      setRealm(REALM_B);
      res = await p;
    });
    expect(res.error).toBe(true);
    expect(res.gone).toBeUndefined();
  });
  it("C9: an SSH change Computers sent is shown with a way to Computers, and Keys neither checks nor dismisses it", async () => {
    await renderPage(page, { state: "sshNonePending" });
    await userEvent.click(
      await screen.findByRole("tab", { name: new RegExp(strings["tab.ssh"]) }),
    );
    await screen.findByText(strings["ssh.set"]);
    const id =
      (fixtureWorld.computers as readonly { name: string; id: string }[]).find(
        (x) => x.name === "atlas",
      )?.id ?? "";
    await act(async () => {
      await computersSsh.run({
        id,
        key: "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOtherPage a@b",
      });
    });
    expect(heldChanges("computer.ssh_key").length).toBe(1);
    expect(
      await screen.findByText(
        strings["ssh.heldElsewhere"].replace("{{name}}", "atlas"),
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: strings["action.checkAgain"] }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: strings["dismiss.act"] }),
    ).toBeNull();
    expect(
      screen.getByRole("link", { name: strings["ssh.openComputers"] }),
    ).toHaveAttribute(
      "href",
      expect.stringContaining(
        `sel=${encodeURIComponent(`atlas.${id.slice(-4)}`)}`,
      ),
    );
    // A full id never enters a URL.
    expect(
      screen
        .getByRole("link", { name: strings["ssh.openComputers"] })
        .getAttribute("href"),
    ).not.toContain(id);
    expect(heldChanges("computer.ssh_key").length).toBe(1);
  }, 40000);
  it("C9: another sender's SSH hold is read-only even when its identity looks like this page's", async () => {
    await renderPage(page, { state: "sshNonePending" });
    await userEvent.click(
      await screen.findByRole("tab", { name: new RegExp(strings["tab.ssh"]) }),
    );
    await screen.findByText(strings["ssh.set"]);
    const id =
      (fixtureWorld.computers as readonly { name: string; id: string }[]).find(
        (x) => x.name === "atlas",
      )?.id ?? "";
    await act(async () => {
      await computersSshLookalike.run({
        id,
        key: "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOtherPage a@b",
      });
    });
    expect(heldChanges("computer.ssh_key").length).toBe(1);
    expect(
      await screen.findByText(
        strings["ssh.heldElsewhere"].replace("{{name}}", "atlas"),
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: strings["action.checkAgain"] }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: strings["dismiss.act"] }),
    ).toBeNull();
  }, 40000);
  it("C9: Add my IP keeps an address typed while the read was out", async () => {
    await renderPage(page, { state: "slowMyIp" });
    await screen.findByText("ci-deploy");
    await userEvent.click(
      screen.getAllByRole("button", {
        name: strings["action.new"],
      })[0] as HTMLElement,
    );
    await userEvent.click(
      await screen.findByRole("button", { name: ipStrings["ipf.add"] }),
    );
    await userEvent.type(
      screen.getByLabelText(strings["nk.ips"]),
      "198.51.100.1",
    );
    await screen.findByText(ipStrings["ipf.added"]);
    const v = (screen.getByLabelText(strings["nk.ips"]) as HTMLInputElement)
      .value;
    expect(v).toContain("198.51.100.1");
    expect(v).toContain("203.0.113.7");
  }, 40000);
  // These cases: the read is held (state heldMyIp) until the test releases it, so each case lands it exactly where
  // it says, whatever the host's load.
  const openHeldMyIp = async () => {
    myIpGate.reset();
    await renderPage(page, { state: "heldMyIp" });
    await screen.findByText("ci-deploy");
    await userEvent.click(
      screen.getAllByRole("button", {
        name: strings["action.new"],
      })[0] as HTMLElement,
    );
    await userEvent.click(
      await screen.findByRole("button", { name: ipStrings["ipf.add"] }),
    );
    return screen.getByLabelText(strings["nk.ips"]) as HTMLInputElement;
  };
  const landMyIp = async (note: string) => {
    await act(async () => {
      myIpGate.release();
    });
    await screen.findByText(note);
  };
  it("C9: Add my IP landing in the middle of typing an address leaves the rest of that address whole", async () => {
    const field = await openHeldMyIp();
    await userEvent.type(field, "198.51.100");
    expect(field.value).toBe("198.51.100");
    await landMyIp(ipStrings["ipf.added"]);
    expect(document.activeElement).toBe(field);
    await userEvent.keyboard(".1");
    expect(field.value).toBe("203.0.113.7, 198.51.100.1");
  }, 40000);
  it("C9: Add my IP adds nothing when the address was typed while the read was out", async () => {
    const field = await openHeldMyIp();
    await userEvent.type(field, "198.51.100.1, 203.0.113.7");
    await landMyIp(ipStrings["ipf.have"]);
    expect(field.value).toBe("198.51.100.1, 203.0.113.7");
  }, 40000);
  it("C9: Add my IP landing after the person left the list adds to the end of what they typed meanwhile", async () => {
    const field = await openHeldMyIp();
    await userEvent.type(field, "198.51.100.1");
    await userEvent.tab();
    expect(document.activeElement).not.toBe(field);
    await landMyIp(ipStrings["ipf.added"]);
    expect(field.value).toBe("198.51.100.1, 203.0.113.7");
  }, 40000);
  it("C9: Add my IP landing in an empty list the person is about to type in keeps their first address apart", async () => {
    const field = await openHeldMyIp();
    await userEvent.click(field);
    await landMyIp(ipStrings["ipf.added"]);
    await userEvent.keyboard("198.51.100.1");
    expect(field.value).toBe("203.0.113.7, 198.51.100.1");
    expect(parseAllowlist(field.value).entries).toEqual(["203.0.113.7", "198.51.100.1"]);
  }, 40000);
  it("C9: an unconfirmed pause can be dismissed from the key's own panel (a narrow screen shows no list)", async () => {
    sent.setEnabled = 0;
    await renderPage(page, { state: "pauseOnce" });
    await pauseFirstKey();
    await within(
      await screen.findByRole("row", { name: /ci-deploy/ }),
    ).findByRole("button", { name: "Check again" });
    const outside = screen
      .getAllByRole("button", { name: strings["dismiss.act"] })
      .find((b) => !b.closest("tr"));
    expect(outside).toBeDefined();
    await userEvent.click(outside as HTMLElement);
    const ask = await screen.findByRole("alertdialog");
    await userEvent.click(
      within(ask).getByRole("button", { name: strings["dismiss.go"] }),
    );
    await waitFor(() =>
      expect(
        within(screen.getByRole("row", { name: /ci-deploy/ })).queryByRole(
          "button",
          { name: "Check again" },
        ),
      ).toBeNull(),
    );
  }, 40000);
  it("C9: a delete of a key made without its secret that may have gone through offers a warned Dismiss", async () => {
    forgetUnresolved();
    await renderPage(page, { state: "deleteUnknown" });
    await startNewKey();
    await userEvent.click(
      screen.getByRole("button", { name: strings["nk.go"] }),
    );
    const drawer = await screen.findByRole("dialog");
    await userEvent.click(
      await within(drawer).findByRole("button", { name: strings["ns.action"] }),
    );
    await within(drawer).findByRole("button", {
      name: strings["action.checkAgain"],
    });
    expect(
      within(drawer).getByRole("button", { name: strings["dismiss.act"] }),
    ).toBeInTheDocument();
  }, 40000);
  it("a Check of a delete made without its secret that finds the key still listed says so in the drawer, never as a toast", async () => {
    forgetUnresolved();
    sent.remove = 0;
    vi.mocked(showToast).mockClear();
    await renderPage(page, { state: "deleteUnknownListed" });
    await startNewKey();
    await userEvent.click(screen.getByRole("button", { name: strings["nk.go"] }));
    const drawer = await screen.findByRole("dialog");
    await userEvent.click(await within(drawer).findByRole("button", { name: strings["ns.action"] }));
    await userEvent.click(await within(drawer).findByRole("button", { name: strings["action.checkAgain"] }));
    const notYet = strings["del.notYet"].replace("{{name}}", "ci-made");
    expect(await within(drawer).findByText(notYet)).toBeInTheDocument();
    expect(vi.mocked(showToast).mock.calls.map((c) => String(c[0].title))).not.toContain(notYet);
    // Still unconfirmed: Check again and the warned Dismiss stay, and nothing was sent twice.
    expect(within(drawer).getByRole("button", { name: strings["action.checkAgain"] })).toBeInTheDocument();
    expect(within(drawer).getByRole("button", { name: strings["dismiss.act"] })).toBeInTheDocument();
    expect(sent.remove).toBe(1);
  }, 40000);
  it("the same in the Copy drawer", async () => {
    forgetUnresolved();
    sent.remove = 0;
    vi.mocked(showToast).mockClear();
    await renderPage(page, { state: "deleteUnknownListed" });
    await openRow(/ci-deploy/);
    await userEvent.click(await screen.findByRole("button", { name: strings["act.copy"] }));
    const drawer = await screen.findByRole("dialog");
    await userEvent.type(within(drawer).getByLabelText(strings["nk.name"]), "ci");
    await userEvent.click(within(drawer).getByRole("button", { name: strings["cp.go"] }));
    await userEvent.click(await within(drawer).findByRole("button", { name: strings["ns.action"] }));
    await userEvent.click(await within(drawer).findByRole("button", { name: strings["action.checkAgain"] }));
    const notYet = strings["del.notYet"].replace("{{name}}", "ci-made");
    expect(await within(drawer).findByText(notYet)).toBeInTheDocument();
    expect(vi.mocked(showToast).mock.calls.map((c) => String(c[0].title))).not.toContain(notYet);
    expect(sent.remove).toBe(1);
  }, 40000);
  it.each([
    ["a cut list without the key", "deleteUnknownCut", "op.cutList"],
    ["a failed read", "deleteUnknownReadFails", "op.readFailed"],
  ] as const)("a Check of a delete made without its secret that reads %s says so on the banner", async (_n, state, key) => {
    forgetUnresolved();
    sent.remove = 0;
    vi.mocked(showToast).mockClear();
    await renderPage(page, { state });
    const { result } = renderHook(() => useMintFlow(null, () => {}));
    await act(async () => {
      await result.current.start({ kind: "create", body: { alias: "ci" }, alias: "ci" });
    });
    await waitFor(() => expect(result.current.phase.kind).toBe("nosecret"));
    await act(async () => {
      await result.current.deleteMade();
    });
    await act(async () => {
      await result.current.checkMade();
    });
    const p = result.current.phase;
    expect(p.kind === "nosecret" && p.unsure && !p.reading).toBe(true);
    expect(result.current.banner).toMatchObject({ kind: "pending", said: strings[key].replace("{{name}}", "ci-made") });
    expect(toastTitles()).toEqual([]);
    expect(sent.remove).toBe(1);
  }, 40000);
  it("a delete's Check that reads a cut list without the key says so in the dialog and on the row", async () => {
    sent.remove = 0;
    vi.mocked(showToast).mockClear();
    await renderPage(page, { state: "pauseCut" });
    await openRow(/ci-deploy/);
    await userEvent.click(await screen.findByRole("button", { name: strings["act.delete"] }));
    await userEvent.click(await screen.findByRole("button", { name: strings["del.go"] }));
    const dlg = await screen.findByRole("alertdialog");
    await userEvent.click(await within(dlg).findByRole("button", { name: /Check/ }));
    const cut = strings["op.cutList"].replace("{{name}}", "ci-deploy");
    expect(await within(dlg).findByText(cut)).toBeInTheDocument();
    expect(toastTitles()).toEqual([]);
    expect(sent.remove).toBe(1);
  }, 40000);
  it("a row's Check that reads a cut list without the key says so (a warn toast: the row has left the view)", async () => {
    sent.setEnabled = 0;
    sent.cutList = 0;
    vi.mocked(showToast).mockClear();
    await renderPage(page, { state: "pauseCutNext" });
    await pauseFirstKey();
    const check = await within(await screen.findByRole("row", { name: /ci-deploy/ })).findByRole("button", { name: "Check again" });
    sent.cutList = 1;
    await userEvent.click(check);
    // The cut read is the list shown, without the key: its row leaves the view, so a warn toast says it.
    const cut = strings["op.cutList"].replace("{{name}}", "ci-deploy");
    await waitFor(() => expect(vi.mocked(showToast)).toHaveBeenCalledWith({ title: cut, tone: "warn" }));
    expect(sent.setEnabled).toBe(1);
  }, 40000);
  it("a stop's Check that reads a cut list without the share says so in the dialog", async () => {
    sent.remove = 0;
    vi.mocked(showToast).mockClear();
    await renderPage(page, { state: "sharedStopCut", path: "/keys/shared" });
    act(() => setRealm(REALM_A));
    await waitFor(
      async () => {
        if (!screen.queryByRole("alertdialog"))
          await userEvent.click(screen.getAllByRole("button", { name: strings["share.stop"] })[0] as HTMLElement);
        expect(screen.getByRole("alertdialog")).toBeInTheDocument();
      },
      { timeout: 10000, interval: 300 },
    );
    let ask = screen.getByRole("alertdialog");
    await userEvent.click(within(ask).getByRole("button", { name: strings["share.stopGo"] }));
    ask = await screen.findByRole("alertdialog");
    await userEvent.click(await within(ask).findByRole("button", { name: strings["action.checkAgain"] }));
    expect(await within(ask).findByText(strings["share.stopCut"])).toBeInTheDocument();
    expect(toastTitles()).toEqual([]);
    expect(sent.remove).toBe(1);
  }, 40000);
  it("what a row's last Check said stays on it when another tab's held change rebuilds the held rows", async () => {
    vi.mocked(showToast).mockClear();
    await renderPage(page, { state: "pendingOps" });
    await pauseFirstKey();
    const row = () => screen.getByRole("row", { name: /ci-deploy/ });
    await userEvent.click(await within(await screen.findByRole("row", { name: /ci-deploy/ })).findByRole("button", { name: "Check again" }));
    await waitFor(() => expect(within(row()).getByText(strings["said.notYet"])).toBeInTheDocument());
    // Another tab pauses another key; its answer is lost, so the rows are synced from core again.
    const other = fixtureKeys.find((k) => k.alias !== "ci-deploy") as { id: string; alias: string };
    await act(async () => {
      await useSetEnabled()({ id: other.id, on: false });
    });
    await waitFor(() =>
      expect(
        within(screen.getByRole("row", { name: new RegExp(other.alias) })).getByRole("button", { name: "Check again" }),
      ).toBeInTheDocument(),
    );
    expect(within(row()).getByText(strings["said.notYet"])).toBeInTheDocument();
    expect(within(row()).getByRole("status")).toHaveTextContent(strings["op.notYet"].replace("{{name}}", "ci-deploy"));
  }, 40000);
  it("allowlist: Add my IP and the list accept spaces and new lines between addresses", () => {
    expect(parseAllowlist("203.0.113.7 198.51.100.0/24").entries).toEqual([
      "203.0.113.7",
      "198.51.100.0/24",
    ]);
    expect(
      parseAllowlist("203.0.113.7\n198.51.100.1,192.0.2.5").entries,
    ).toEqual(["203.0.113.7", "198.51.100.1", "192.0.2.5"]);
    expect(appendIp("203.0.113.7\n198.51.100.1", "192.0.2.5")).toBe(
      "203.0.113.7, 198.51.100.1, 192.0.2.5",
    );
    expect(appendIp("203.0.113.7 198.51.100.1", "198.51.100.1")).toBe(
      "203.0.113.7 198.51.100.1",
    );
  });
});

describe("warned Dismiss", () => {
  it("confirming a warning runs what was shown when it opened, never what is shown at the confirm", async () => {
    const calls: string[] = [];
    const button = (shown: string) =>
      createElement(DismissButton, { onDismiss: () => calls.push(shown) });
    const view = render(button("the send shown"));
    await userEvent.click(
      screen.getByRole("button", { name: strings["dismiss.act"] }),
    );
    const ask = await screen.findByRole("alertdialog");
    // A later send replaces what the control shows while its warning is open (an unkeyed control).
    view.rerender(button("a later send"));
    await userEvent.click(
      within(ask).getByRole("button", { name: strings["dismiss.go"] }),
    );
    expect(calls).toEqual(["the send shown"]);
  });
  it("a warning keyed to its send closes when another send replaces it, and runs nothing", async () => {
    const calls: string[] = [];
    const button = (hold: string) =>
      createElement(DismissButton, {
        key: hold,
        onDismiss: () => calls.push(hold),
      });
    const view = render(button("hold-1"));
    await userEvent.click(
      screen.getByRole("button", { name: strings["dismiss.act"] }),
    );
    await screen.findByRole("alertdialog");
    view.rerender(button("hold-2"));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(calls).toEqual([]);
  });
});
describe("refusal words", () => {
  it("a refusal with no reason of its own and a sign-in code ask both name the key", async () => {
    const { outcomeText } = await import("./parts/words");
    const { makeT } = await import("@kit");
    const t = makeT(strings);
    expect(outcomeText(t, { outcome: "stale" }, "ci-deploy", false)).toBe(
      strings["out.refused.other"].replace("{{what}}", "ci-deploy"),
    );
    expect(outcomeText(t, { outcome: "not_sent", code: "SOMETHING_NEW" }, "ci-deploy", false)).toBe(
      strings["out.refused.other"].replace("{{what}}", "ci-deploy"),
    );
    expect(outcomeText(t, { outcome: "failed", code: "OTP_REQUIRED" }, "ci-deploy", false)).toBe(
      strings["out.err.OTP_REQUIRED"].replace("{{what}}", "ci-deploy"),
    );
  });
});
