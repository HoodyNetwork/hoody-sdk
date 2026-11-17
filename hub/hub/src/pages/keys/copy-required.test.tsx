// Vitest: the Copy drawer says what stops Make copy. A name with a character the API refuses used to stop the press with
// nothing said (the form's own check found it, the Name field showed no error). A key that has ended cannot be copied
// with "Same as the key it copies" (the API refuses a past end and asks for a new one): the footer says so before the
// press, and choosing another end clears it.
import { describe, expect, it } from "vitest";
import userEvent from "@testing-library/user-event";
import { renderPage, screen, waitFor, within } from "@app/testing";
import page from "./page";
import strings from "./strings.en.json";

const select = async (name: RegExp) => {
  await waitFor(
    async () => {
      const row = screen.getByRole("row", { name });
      if (row.getAttribute("aria-selected") !== "true") await userEvent.click(row);
      expect(screen.getByRole("row", { name })).toHaveAttribute("aria-selected", "true");
    },
    { timeout: 10000, interval: 300 },
  );
  await userEvent.click(await screen.findByRole("button", { name: strings["act.copy"] }));
  return screen.findByRole("dialog");
};
const reason = (d: HTMLElement) => d.querySelector("[data-drawer-reason]")?.textContent ?? null;
const off = (el: HTMLElement) => el.hasAttribute("disabled") || el.getAttribute("aria-disabled") === "true";

describe("keys: Copy drawer names what stops the copy", () => {
  it("a refused character in the name shows at the Name field, and typing again clears it", async () => {
    await renderPage(page);
    const d = await select(/ci-deploy/);
    const name = within(d).getByRole("textbox", { name: strings["nk.name"] });
    await userEvent.type(name, "Bob's key");
    await userEvent.click(within(d).getByRole("button", { name: strings["cp.go"] }));
    expect(await within(d).findByText(strings["e.name.chars"])).toBeInTheDocument();
    // Still the form: nothing was sent, the button is still Make copy.
    expect(within(d).getByRole("button", { name: strings["cp.go"] })).toBeInTheDocument();
    await userEvent.clear(name);
    await waitFor(() => expect(within(d).queryByText(strings["e.name.chars"])).toBeNull());
  }, 30000);

  it("a key that has ended: 'Same as the key it copies' is refused in words, another end frees Make copy", async () => {
    // All realms: the expired fixture key works everywhere, so it can be copied only where no realm is picked.
    await renderPage(page, { realm: "all" });
    await userEvent.click(await screen.findByRole("button", { name: `Clear ${strings["filter.state"]}` }, { timeout: 10000 }));
    const d = await select(/old-build-bot/);
    expect(reason(d)).toBe(strings["cp.endsEnded"]);
    expect(off(within(d).getByRole("button", { name: strings["cp.go"] }))).toBe(true);
    await userEvent.click(within(d).getByRole("radio", { name: strings["nk.endsNever"] }));
    await waitFor(() => expect(reason(d)).toBeNull());
    expect(off(within(d).getByRole("button", { name: strings["cp.go"] }))).toBe(false);
  }, 30000);

  it("a key that has not ended keeps Make copy on with no reason line", async () => {
    await renderPage(page);
    const d = await select(/ci-deploy/);
    expect(reason(d)).toBeNull();
    expect(off(within(d).getByRole("button", { name: strings["cp.go"] }))).toBe(false);
  }, 30000);
});
