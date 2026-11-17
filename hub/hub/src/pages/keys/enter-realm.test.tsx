// Enter in a key drawer's realm fields: Enter in a text field submits the
// drawer, so a realm id typed in "Add a realm by its id" was dropped by the send, and Enter in the realm search made the
// key. Now Enter in the id field adds that realm (the drawer stays open), and Enter in a search box never submits.
// Enter in the realm search ticks the one realm it shows;
// an id typed and not added blocks Save with a hint, never dropped; an Enter that confirms an input method's
// composition adds and sends nothing.
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, renderPage, screen, userEvent, waitFor, within } from "@app/testing";
import { setRealm } from "@core/ctx";
import { REALM_A, REALM_B, createBodies, editBodies, sent } from "./fixtures";
import { newForm } from "./logic";
import { KeyFields, type SetField } from "./parts/KeyFields";
import { enterSubmits } from "./parts/words";
import page from "./page";
import strings from "./strings.en.json";
import type { NewKeyForm } from "./types";

const ID = "0123456789abcdef01234567";
/** An id is pasted, as people do: one input event (typing 24 characters one by one re-renders the drawer per key,
 *  which under host load alone outlasts the test timeout). */
const pasteInto = async (el: HTMLElement, text: string) => {
  await userEvent.click(el);
  await userEvent.paste(text);
};

const pickRealms = async () => {
  await screen.findByText("ci-deploy");
  await userEvent.click(screen.getAllByRole("button", { name: strings["action.new"] })[0] as HTMLElement);
  await userEvent.type(await screen.findByLabelText(strings["nk.name"]), "ci");
  await userEvent.click(await screen.findByRole("radio", { name: new RegExp(strings["nk.pick"]) }));
  return screen.findByRole("group", { name: strings["nk.pickList"] });
};

describe("keys: Enter in the realm fields", () => {
  it("Enter in the id field adds that realm, ticked; the drawer stays open and nothing is made", async () => {
    createBodies.length = 0;
    sent.create = 0;
    await renderPage(page);
    act(() => setRealm("global"));
    // One realm ticked first: the drawer's own Enter would make the key for it alone, dropping the id typed.
    const list = await pickRealms();
    await userEvent.click(within(list).getByRole("checkbox", { name: /Acme client/ }));
    await pasteInto(screen.getByLabelText(strings["nk.add"]), ID);
    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(within(list).getAllByRole("checkbox", { checked: true })).toHaveLength(2));
    expect((screen.getByLabelText(strings["nk.add"]) as HTMLInputElement).value).toBe("");
    // The drawer's own Enter did not run behind it: no key is made, now or after its preliminary read.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 800));
    });
    expect(screen.getByLabelText(strings["nk.name"])).toBeInTheDocument();
    expect(sent.create).toBe(0);
    expect(createBodies).toHaveLength(0);
    // The press makes the key for it: the id typed is never dropped.
    await userEvent.click(screen.getByRole("button", { name: strings["nk.go"] }));
    await waitFor(() => expect(createBodies.length).toBe(1));
    expect((createBodies[0] as { realm_ids?: unknown }).realm_ids).toEqual([REALM_B, ID]);
  }, 30000);

  it("a bad id on Enter says so and sends nothing", async () => {
    sent.create = 0;
    await renderPage(page);
    act(() => setRealm("global"));
    await pickRealms();
    await userEvent.type(screen.getByLabelText(strings["nk.add"]), "not-an-id{Enter}");
    expect(await screen.findByText(strings["nk.addBad"])).toBeInTheDocument();
    expect(screen.getByLabelText(strings["nk.name"])).toBeInTheDocument();
    expect(sent.create).toBe(0);
  }, 30000);

  it("Enter in the empty (or blank) id field says nothing and makes nothing", async () => {
    createBodies.length = 0;
    sent.create = 0;
    await renderPage(page);
    act(() => setRealm("global"));
    // A realm is ticked, so the form is valid: the drawer's own Enter behind the field would make the key.
    const list = await pickRealms();
    await userEvent.click(within(list).getByRole("checkbox", { name: /Acme client/ }));
    const field = screen.getByLabelText(strings["nk.add"]);
    await userEvent.click(field);
    await userEvent.keyboard("{Enter}");
    // The handler runs inside the key press: an error it set would be on screen once the press resolves.
    expect(screen.queryByText(strings["nk.addBad"])).toBeNull();
    await userEvent.type(field, "   {Enter}");
    expect(screen.queryByText(strings["nk.addBad"])).toBeNull();
    // Neither Enter made the key, now or after the drawer's preliminary read.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 800));
    });
    expect(screen.getByLabelText(strings["nk.name"])).toBeInTheDocument();
    expect(sent.create).toBe(0);
    expect(createBodies).toHaveLength(0);
    // The form was valid all along: the press makes the key, for the realm ticked.
    await userEvent.click(screen.getByRole("button", { name: strings["nk.go"] }));
    await waitFor(() => expect(createBodies.length).toBe(1));
    expect((createBodies[0] as { realm_ids?: unknown }).realm_ids).toEqual([REALM_B]);
  }, 30000);

  it("Cmd+Enter in the id field still makes the key, as Ctrl/Cmd+Enter does anywhere in the drawer", async () => {
    createBodies.length = 0;
    await renderPage(page);
    act(() => setRealm("global"));
    const list = await pickRealms();
    await userEvent.click(within(list).getAllByRole("checkbox")[0] as HTMLElement);
    await userEvent.click(screen.getByLabelText(strings["nk.add"]));
    await userEvent.keyboard("{Meta>}{Enter}{/Meta}");
    await waitFor(() => expect(createBodies.length).toBe(1));
  }, 30000);

  it("Enter in a search box never submits; in a plain text field it still does, and Ctrl+Enter anywhere", () => {
    const submit = vi.fn();
    const on = enterSubmits(submit);
    const field = (type: string) => Object.assign(document.createElement("input"), { type });
    const press = (target: EventTarget, o: { ctrlKey?: boolean } = {}) =>
      on({ key: "Enter", metaKey: false, ctrlKey: !!o.ctrlKey, target, preventDefault: () => undefined });
    press(field("search"));
    expect(submit).not.toHaveBeenCalled();
    press(field("text"));
    expect(submit).toHaveBeenCalledTimes(1);
    press(field("search"), { ctrlKey: true });
    expect(submit).toHaveBeenCalledTimes(2);
    // An Enter that confirms an input method's composition is the input method's, never a send.
    on({ key: "Enter", metaKey: false, ctrlKey: false, target: field("text"), preventDefault: () => undefined, nativeEvent: { isComposing: true } });
    on({ key: "Enter", metaKey: false, ctrlKey: false, target: field("text"), preventDefault: () => undefined, keyCode: 229 });
    expect(submit).toHaveBeenCalledTimes(2);
  });

  it("New key: an id typed and not added blocks Make key with a hint; cleared, the key is made without it", async () => {
    createBodies.length = 0;
    sent.create = 0;
    await renderPage(page);
    act(() => setRealm("global"));
    const list = await pickRealms();
    await userEvent.click(within(list).getByRole("checkbox", { name: /Acme client/ }));
    const field = screen.getByLabelText(strings["nk.add"]);
    await pasteInto(field, ID);
    await userEvent.click(screen.getByRole("button", { name: strings["nk.go"] }));
    expect(await screen.findByText(strings["e.realmDraft.pending"])).toBeInTheDocument();
    // Cmd+Enter is a send too: the same hint, nothing made.
    await userEvent.click(screen.getByLabelText(strings["nk.name"]));
    await userEvent.keyboard("{Meta>}{Enter}{/Meta}");
    await act(async () => {
      await new Promise((r) => setTimeout(r, 800));
    });
    expect(screen.getByText(strings["e.realmDraft.pending"])).toBeInTheDocument();
    expect(sent.create).toBe(0);
    expect(createBodies).toHaveLength(0);
    // Clearing the id ends the hint; the key is then made for the realm ticked alone.
    await userEvent.clear(field);
    await waitFor(() => expect(screen.queryByText(strings["e.realmDraft.pending"])).toBeNull());
    await userEvent.click(screen.getByRole("button", { name: strings["nk.go"] }));
    await waitFor(() => expect(createBodies.length).toBe(1));
    expect((createBodies[0] as { realm_ids?: unknown }).realm_ids).toEqual([REALM_B]);
  }, 30000);

  it("Edit: an id typed and not added blocks Save with a hint, Ctrl+Enter and Cmd+Enter too; Enter adds it, Save sends it", async () => {
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
    const field = within(d).getByLabelText(strings["nk.add"]);
    await pasteInto(field, ID);
    const save = within(d).getByRole("button", { name: strings["ed.go"] });
    await userEvent.click(save);
    expect(await within(d).findByText(strings["e.realmDraft.pending"])).toBeInTheDocument();
    await userEvent.keyboard("{Control>}{Enter}{/Control}");
    await userEvent.keyboard("{Meta>}{Enter}{/Meta}");
    await act(async () => {
      await new Promise((r) => setTimeout(r, 800));
    });
    expect(editBodies).toHaveLength(0);
    expect(screen.getByRole("dialog", { name: /^Edit / })).toBeInTheDocument();
    // Enter in the id field adds it in Edit too, and sends nothing by itself.
    await userEvent.click(field);
    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect((field as HTMLInputElement).value).toBe(""));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 800));
    });
    expect(editBodies).toHaveLength(0);
    await userEvent.click(save);
    await waitFor(() => expect(editBodies).toHaveLength(1), { timeout: 8000 });
    expect((editBodies[0] as { realm_ids?: unknown }).realm_ids).toEqual([REALM_A, ID]);
  }, 30000);

  it("an Enter that confirms a composition adds nothing, keeps the text and makes nothing", async () => {
    createBodies.length = 0;
    sent.create = 0;
    await renderPage(page);
    act(() => setRealm("global"));
    const list = await pickRealms();
    await userEvent.click(within(list).getByRole("checkbox", { name: /Acme client/ }));
    const field = screen.getByLabelText(strings["nk.add"]) as HTMLInputElement;
    await pasteInto(field, ID);
    fireEvent.keyDown(field, { key: "Enter", isComposing: true });
    fireEvent.keyDown(field, { key: "Enter", keyCode: 229 });
    fireEvent.keyDown(screen.getByLabelText(strings["nk.name"]), { key: "Enter", isComposing: true });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 800));
    });
    expect(field.value).toBe(ID);
    expect(within(list).getAllByRole("checkbox", { checked: true })).toHaveLength(1);
    expect(screen.queryByText(strings["nk.addBad"])).toBeNull();
    expect(sent.create).toBe(0);
    expect(createBodies).toHaveLength(0);
  }, 30000);
});

// More than 7 realms: the panel shows its search box. The drawer's Enter is a spy around the real fields.
const MANY = Array.from({ length: 9 }, (_, i) => ({ id: String(i + 1).padStart(24, "a"), name: `Realm ${String.fromCharCode(65 + i)}` }));

function Fields({ submit }: { submit: () => void }) {
  const [form, setForm] = useState<NewKeyForm>({ ...newForm(undefined), worksIn: "pick", picked: [MANY[8]!.id] });
  const set: SetField = (k, v) =>
    setForm((f) => ({ ...f, [k]: typeof v === "function" ? (v as (c: unknown) => unknown)(f[k]) : v }));
  return (
    <div role="presentation" onKeyDown={enterSubmits(submit)}>
      <KeyFields form={form} set={set} errors={{}} cat={null} realms={MANY} realm="all" sending={false} />
      <output data-testid="picked">{form.picked.join(",")}</output>
    </div>
  );
}

describe("keys: Enter in the realm search (more than 7 realms)", () => {
  const picked = () => screen.getByTestId("picked").textContent?.split(",").filter(Boolean) ?? [];

  it("Enter ticks the one realm the search shows (by name or its full id); an id not listed ticks nothing; never sends", async () => {
    const submit = vi.fn();
    render(<Fields submit={submit} />);
    const search = screen.getByRole("searchbox", { name: strings["nk.findRealm"] });
    await userEvent.type(search, "Realm C{Enter}");
    await waitFor(() => expect(picked()).toEqual([MANY[8]!.id, MANY[2]!.id]));
    // Several rows shown (the first not ticked): none is guessed.
    await userEvent.clear(search);
    await userEvent.type(search, "Realm{Enter}");
    expect(picked()).toEqual([MANY[8]!.id, MANY[2]!.id]);
    // The search is a filter: a full id not listed shows nothing and ticks nothing (the id field adds it).
    await userEvent.clear(search);
    await pasteInto(search, ID.toUpperCase());
    await userEvent.keyboard("{Enter}");
    expect(picked()).toEqual([MANY[8]!.id, MANY[2]!.id]);
    // A listed realm's full id shows that one realm: Enter ticks it.
    await userEvent.clear(search);
    await pasteInto(search, MANY[4]!.id);
    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(picked()).toEqual([MANY[8]!.id, MANY[2]!.id, MANY[4]!.id]));
    expect(submit).not.toHaveBeenCalled();
  });

  it("Enter on a row or a composing Enter in the search sends nothing; Ctrl+Enter still sends", async () => {
    const submit = vi.fn();
    render(<Fields submit={submit} />);
    const search = screen.getByRole("searchbox", { name: strings["nk.findRealm"] });
    await userEvent.type(search, "Realm D");
    fireEvent.keyDown(search, { key: "Enter", isComposing: true });
    expect(picked()).toEqual([MANY[8]!.id]);
    const row = screen.getByRole("checkbox", { name: /Realm D/ });
    row.focus();
    await userEvent.keyboard("{Enter}");
    expect(submit).not.toHaveBeenCalled();
    await userEvent.click(search);
    await userEvent.keyboard("{Control>}{Enter}{/Control}");
    expect(submit).toHaveBeenCalledTimes(1);
  });
});
