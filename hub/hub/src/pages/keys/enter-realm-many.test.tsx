// The realm list in the key drawers with more than 7 realms (its search box shows), in the page (k-enter-realm-d,
// The search is a filter. Enter there ticks only the one realm it shows (several or
// none shown: nothing); a full id not listed ticks nothing (only "Add a realm by its id" adds one, and its text left
// pending blocks Save). On rows the kit's keys stay: Space ticks, Enter never sends. No Enter there ever sends.
import { describe, expect, it, vi } from "vitest";
import { act, renderPage, screen, userEvent, waitFor, within } from "@app/testing";
import { setRealm } from "@core/ctx";
import { REALM_A, REALM_B, createBodies, editBodies, sent } from "./fixtures";
import page from "./page";
import strings from "./strings.en.json";
import type * as Data from "./data";

type DataModule = typeof Data;

const EXTRA = Array.from({ length: 8 }, (_, i) => ({
  id: String(i + 1).padStart(24, "e"),
  name: `Extra ${String.fromCharCode(65 + i)}`,
}));
vi.mock("./data", async (orig) => {
  const m = await orig<DataModule>();
  return {
    ...m,
    useRealms: () => {
      const r = m.useRealms();
      return r && [...r, ...EXTRA];
    },
  };
});

const ID = "0123456789abcdef01234567";
/** An id is pasted, as people do: one input event (typing 24 characters one by one re-renders the drawer per key,
 *  which under host load alone outlasts the test timeout). */
const pasteInto = async (el: HTMLElement, text: string) => {
  await userEvent.click(el);
  await userEvent.paste(text);
};
const HINT = strings["e.realmDraft.pending"];
const settle = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 800));
  });

const openNew = async () => {
  createBodies.length = 0;
  sent.create = 0;
  await renderPage(page);
  act(() => setRealm("global"));
  await screen.findByText("ci-deploy");
  await userEvent.click(screen.getAllByRole("button", { name: strings["action.new"] })[0] as HTMLElement);
  await userEvent.type(await screen.findByLabelText(strings["nk.name"]), "ci");
  await userEvent.click(await screen.findByRole("radio", { name: new RegExp(strings["nk.pick"]) }));
  const list = await screen.findByRole("group", { name: strings["nk.pickList"] });
  await userEvent.click(within(list).getByRole("checkbox", { name: /Acme client/ }));
  return { list, search: screen.getByRole("searchbox", { name: strings["nk.findRealm"] }) };
};
const ticked = (list: HTMLElement) => within(list).queryAllByRole("checkbox", { checked: true });
const realmIds = () => (createBodies[0] as { realm_ids?: unknown }).realm_ids;

describe("keys: the realm search in the drawers (more than 7 realms)", () => {
  it("New: Enter with several realms shown ticks none; Enter on a row ticks nothing; neither sends", async () => {
    const { list, search } = await openNew();
    await userEvent.type(search, "Extra{Enter}");
    await settle();
    // Acme client (ticked) is filtered out; no Extra realm was guessed.
    expect(ticked(list)).toHaveLength(0);
    expect(sent.create).toBe(0);
    await userEvent.keyboard("{ArrowDown}");
    const row = document.activeElement as HTMLElement;
    expect(row.getAttribute("role")).toBe("checkbox");
    await userEvent.keyboard("{Enter}");
    await settle();
    expect(row).toHaveAttribute("aria-checked", "false");
    expect(screen.getByLabelText(strings["nk.name"])).toBeInTheDocument();
    expect(sent.create).toBe(0);
    await userEvent.click(screen.getByRole("button", { name: strings["nk.go"] }));
    await waitFor(() => expect(createBodies.length).toBe(1));
    expect(realmIds()).toEqual([REALM_B]);
  }, 30000);

  it("New: a full id not listed, typed in the search with Enter, ticks nothing, sends nothing and blocks nothing", async () => {
    const { list, search } = await openNew();
    const before = ticked(list).length;
    await pasteInto(search, ID);
    await userEvent.keyboard("{Enter}");
    await settle();
    expect(ticked(list)).toHaveLength(before);
    expect(sent.create).toBe(0);
    expect(screen.queryByText(HINT)).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: strings["nk.go"] }));
    await waitFor(() => expect(createBodies.length).toBe(1));
    await settle();
    expect(createBodies).toHaveLength(1);
    expect(realmIds()).toEqual([REALM_B]);
  }, 30000);

  it("New: a listed realm's full id shows that one realm: Enter ticks it; Cmd+Enter then makes one key", async () => {
    const { list, search } = await openNew();
    await pasteInto(search, EXTRA[5]!.id);
    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(ticked(list)).toHaveLength(1));
    await settle();
    expect(sent.create).toBe(0);
    await userEvent.keyboard("{Meta>}{Enter}{/Meta}");
    await waitFor(() => expect(createBodies.length).toBe(1));
    await settle();
    expect(createBodies).toHaveLength(1);
    expect(realmIds()).toEqual([REALM_B, EXTRA[5]!.id]);
  }, 30000);

  it("Edit: Enter with one realm shown ticks it; an id left in the id field blocks Save; cleared, Save sends once", async () => {
    editBodies.length = 0;
    await renderPage(page);
    await waitFor(
      async () => {
        const row = screen.getByRole("row", { name: /ci-deploy/ });
        if (row.getAttribute("aria-selected") !== "true") await userEvent.click(row);
        expect(screen.getByRole("row", { name: /ci-deploy/ })).toHaveAttribute("aria-selected", "true");
      },
      { timeout: 10000, interval: 300 },
    );
    await userEvent.click(await screen.findByRole("button", { name: strings["act.edit"] }));
    const d = await screen.findByRole("dialog", { name: /^Edit / });
    const search = within(d).getByRole("searchbox", { name: strings["nk.findRealm"] });
    await userEvent.type(search, "Extra C{Enter}");
    await settle();
    expect(editBodies).toHaveLength(0);
    expect(screen.getByRole("dialog", { name: /^Edit / })).toBeInTheDocument();
    const field = within(d).getByLabelText(strings["nk.add"]);
    await pasteInto(field, ID);
    const save = within(d).getByRole("button", { name: strings["ed.go"] });
    await userEvent.click(save);
    expect(await within(d).findByText(HINT)).toBeInTheDocument();
    await settle();
    expect(editBodies).toHaveLength(0);
    await userEvent.clear(field);
    await userEvent.click(save);
    await waitFor(() => expect(editBodies).toHaveLength(1), { timeout: 8000 });
    await settle();
    expect(editBodies).toHaveLength(1);
    expect((editBodies[0] as { realm_ids?: unknown }).realm_ids).toEqual([REALM_A, EXTRA[2]!.id]);
  }, 30000);
});
