// Share a realm, what they can do: a new share is See only; starting points tick
// rights in product areas with tags; the Review states exactly the rights Create sends; a 400 reads the catalogue
// again and sends nothing until a new Review.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { renderPage, screen, waitFor, within } from "@app/testing";
import dtStrings from "@kit/forms/DateTimeField.strings.en.json";
import { REALM_A, catalogueFixture, createBodies } from "./fixtures";
import { links } from "./links";
import page from "./page";
import { shareBodyV3 } from "./share-logic";
import strings from "./strings.en.json";

type S = keyof typeof strings;
const w = (k: string) => strings[k as S];
const EXEC = "computers.actions.exec";

const open = async (state = "shared") => {
  await renderPage(page, { state, realm: "all", path: links.shareRealm(REALM_A) });
  return screen.findByRole("dialog", {}, { timeout: 8000 });
};
const box = (d: HTMLElement, path: string) => within(d).findByRole("checkbox", { name: w(`share.r.${path}`) });
const review = async (d: HTMLElement) => {
  const go = await within(d).findByRole("button", { name: strings["share.review"] });
  await waitFor(() => expect(go).toBeEnabled(), { timeout: 8000 });
  await userEvent.click(go);
  await within(d).findByText(strings["share.rvCan"]);
};
const canList = (d: HTMLElement) => {
  const sec = within(d).getByText(strings["share.rvCan"]).closest("section") as HTMLElement;
  return within(sec)
    .getAllByRole("listitem")
    .map((li) => li.firstElementChild?.textContent ?? "");
};
const leaves = (tree: unknown, prefix = ""): string[] =>
  Object.entries(tree as Record<string, unknown>).flatMap(([k, v]) =>
    v === true ? [prefix + k] : v && typeof v === "object" ? leaves(v, `${prefix}${k}.`) : [],
  );

describe("share rights: the drawer", () => {
  beforeEach(() => {
    createBodies.length = 0;
    catalogueFixture.reset();
  });

  it("a new share is See only, and the Review says so and nothing more", async () => {
    const d = await open();
    expect(await within(d).findByRole("radio", { name: strings["share.start.see"] })).toBeChecked();
    expect(await box(d, "computers.read")).toBeChecked();
    expect(await box(d, "computers.read")).toBeDisabled();
    expect(await box(d, EXEC)).not.toBeChecked();
    await review(d);
    expect(canList(d)).toEqual([w("share.r.computers.read"), w("share.r.projects.read")]);
    // Only the base projects.read carries a tag: its one warning, nothing else.
    expect(within(d).getByText(strings["share.warnTitle"])).toBeInTheDocument();
    expect(within(d).getAllByText(strings["share.warn.account"])).toHaveLength(1);
    for (const k of ["money", "undo", "secrets", "outlast"] as const) expect(within(d).queryByText(strings[`share.warn.${k}`])).toBeNull();
  });

  it("Run commands shows its tags in the count and the Review, with the warning", async () => {
    const d = await open();
    await userEvent.click(await box(d, EXEC));
    expect(within(d).getByRole("radio", { name: strings["share.start.custom"] })).toBeChecked();
    const count = within(d).getByText(new RegExp(`^${w("share.rights_other").replace("{{count}}", "3")}`));
    expect(count.textContent).toContain(w("share.tagN.secrets_one").replace("{{count}}", "1"));
    expect(count.textContent).toContain(w("share.tagN.outlast_one").replace("{{count}}", "1"));
    await review(d);
    const row = within(d).getByText(w(`share.r.${EXEC}`), { selector: "li > span" }).closest("li") as HTMLElement;
    expect(within(row).getByText(strings["share.tag.secrets"])).toBeInTheDocument();
    expect(within(row).getByText(strings["share.tag.outlast"])).toBeInTheDocument();
    expect(within(d).getByText(strings["share.warnTitle"])).toBeInTheDocument();
    expect(within(d).getByText(strings["share.warn.secrets"])).toBeInTheDocument();
    expect(within(d).getByText(strings["share.warn.outlast"])).toBeInTheDocument();
  });

  it("Create sends exactly the rights the Review listed, as shareBodyV3 builds them", async () => {
    const d = await open();
    await userEvent.click(await within(d).findByRole("radio", { name: strings["share.start.work"] }));
    await review(d);
    const shown = canList(d);
    await userEvent.click(within(d).getByRole("button", { name: strings["share.create"] }));
    await waitFor(() => expect(createBodies.length).toBe(1), { timeout: 8000 });
    const b = createBodies[0] as Record<string, unknown>;
    const sent = leaves(b.permissions);
    expect(sent.map((p) => w(`share.r.${p}`)).sort()).toEqual([...shown].sort());
    const end = Date.parse(String(b.expires_at));
    const want = shareBodyV3(String(b.alias), REALM_A, sent.filter((p) => p !== "computers.read"), null, {
      days: 7,
      at: null,
      ips: "",
      who: "",
    }, end - 7 * 86400000);
    expect(JSON.stringify(b)).toBe(JSON.stringify(want));
  });

  it("a refused create (400) reads the rights again, drops the right the server left out and sends nothing more until a new Review", async () => {
    catalogueFixture.dropAfterRefusal = [EXEC];
    const d = await open("shareRejected");
    await userEvent.click(await box(d, EXEC));
    await review(d);
    const readsBefore = catalogueFixture.reads;
    await userEvent.click(within(d).getByRole("button", { name: strings["share.create"] }));
    expect(await within(d).findByText(strings["share.rejected"], {}, { timeout: 8000 })).toBeInTheDocument();
    await waitFor(() => expect(catalogueFixture.reads).toBeGreaterThan(readsBefore));
    // Back on Choose, without the right the server no longer knows.
    await waitFor(() => expect(within(d).queryByRole("checkbox", { name: w(`share.r.${EXEC}`) })).toBeNull());
    expect(within(d).queryByRole("button", { name: strings["share.create"] })).toBeNull();
    expect(createBodies.length).toBe(0);
    await review(d);
    expect(canList(d)).toEqual([w("share.r.computers.read"), w("share.r.projects.read")]);
    await userEvent.click(within(d).getByRole("button", { name: strings["share.create"] }));
    await waitFor(() => expect(createBodies.length).toBe(1), { timeout: 8000 });
    expect(leaves((createBodies[0] as Record<string, unknown>).permissions)).toEqual(["computers.read", "projects.read"]);
  });

  it("a refused create (400) goes back to Choose even when the rights read again are the same", async () => {
    const d = await open("shareRejected");
    await review(d);
    await userEvent.click(within(d).getByRole("button", { name: strings["share.create"] }));
    expect(await within(d).findByText(strings["share.rejected"], {}, { timeout: 8000 })).toBeInTheDocument();
    expect(within(d).queryByRole("button", { name: strings["share.create"] })).toBeNull();
    expect(within(d).getByRole("button", { name: strings["share.review"] })).toBeInTheDocument();
    expect(createBodies.length).toBe(0);
  });

  it("without the catalogue the starting points still work, and Custom can't go to Review", async () => {
    const d = await open("noCatalogue");
    expect(await within(d).findByText(strings["share.catFailed"], {}, { timeout: 8000 })).toBeInTheDocument();
    expect(within(d).queryByRole("checkbox", { name: w(`share.r.${EXEC}`) })).toBeNull();
    await userEvent.click(within(d).getByRole("radio", { name: strings["share.start.custom"] }));
    expect(within(d).getByRole("button", { name: strings["share.review"] })).toBeDisabled();
    expect(within(d).getByText(strings["share.whyCustom"])).toBeInTheDocument();
    await userEvent.click(within(d).getByRole("radio", { name: strings["share.start.act"] }));
    await review(d);
    await userEvent.click(within(d).getByRole("button", { name: strings["share.create"] }));
    await waitFor(() => expect(createBodies.length).toBe(1), { timeout: 8000 });
    expect(leaves((createBodies[0] as Record<string, unknown>).permissions).sort()).toEqual(
      ["computers.actions.restart", "computers.actions.start", "computers.actions.stop", "computers.read", "projects.read"],
    );
  });

  it("a catalogue with no rights in it counts as none: the starting points still work", async () => {
    const d = await open("emptyCatalogue");
    expect(await within(d).findByText(strings["share.catFailed"], {}, { timeout: 8000 })).toBeInTheDocument();
    const act = within(d).getByRole("radio", { name: strings["share.start.act"] });
    expect(act).toBeEnabled();
    await userEvent.click(act);
    await review(d);
    expect(canList(d)).toHaveLength(5);
  });

  it("a picked end is read in this browser's zone and sent as that instant in UTC", async () => {
    const d = await open();
    await userEvent.click(await within(d).findByRole("radio", { name: strings["share.endsPick"] }));
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    expect(within(d).getByText(w("share.endsZone").replace("{{zone}}", zone))).toBeInTheDocument();
    const day = new Date(Date.now() + 3 * 86400000);
    const ymd = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
    await userEvent.type(within(d).getByLabelText(dtStrings["dt.date"]), ymd);
    await userEvent.type(within(d).getByLabelText(dtStrings["dt.time"]), "09:30");
    await review(d);
    await userEvent.click(within(d).getByRole("button", { name: strings["share.create"] }));
    await waitFor(() => expect(createBodies.length).toBe(1), { timeout: 8000 });
    const want = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 9, 30).toISOString();
    expect((createBodies[0] as Record<string, unknown>).expires_at).toBe(want);
  });
});

describe("share rights: phone width", () => {
  const real = window.matchMedia;
  beforeEach(() => {
    createBodies.length = 0;
    window.matchMedia = ((q: string) => ({
      matches: q === "(max-width: 719px)",
      media: q,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  });
  afterEach(() => {
    window.matchMedia = real;
    vi.restoreAllMocks();
  });

  it("areas fold with their counts showing, and an area opens when a starting point ticks a right in it", async () => {
    const d = await open();
    const area = await within(d).findByRole("button", { name: new RegExp(`^${strings["share.area.computers"]}`) });
    expect(area).toHaveAttribute("aria-expanded", "false");
    expect(within(d).queryByRole("checkbox", { name: w("share.r.computers.actions.start") })).toBeNull();
    await userEvent.click(within(d).getByRole("radio", { name: strings["share.start.act"] }));
    await waitFor(() => expect(area).toHaveAttribute("aria-expanded", "true"));
    expect(await box(d, "computers.actions.start")).toBeChecked();
    const inside = within(d).getByRole("button", { name: new RegExp(`^${strings["share.area.inside"]}`) });
    expect(inside).toHaveAttribute("aria-expanded", "false");
  });
});
