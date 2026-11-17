// The shown-once panel opens with one Verdict (copy it now, the one marked phrase) that also holds where the key works
// and when it ends, in view without a press; how to use the key is one Why fold; Done is the drawer's primary, and it
// closes through the same guard as Esc (the key is asked about first).
// eslint-disable-next-line no-restricted-imports -- a router for a part rendered without its page (its Why and Link read the location), not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { describe, expect, it, vi } from "vitest";
import { act, render, renderPage, screen, userEvent, waitFor, within } from "@app/testing";
import { capture, holdSecret } from "@core";
import { boot } from "@core/test/env";
import page from "./page";
import { ShownPanel } from "./parts/MintPanels";
import strings from "./strings.en.json";

const DATE = "\\w{3} \\d{1,2}, \\d{4}";
const endsDated = new RegExp(`^${strings["endsUtc"].replace("{{date}}", DATE)}$`);

/** The value beside a fact label (Facts: a dt, then its dd). */
const factValue = (scope: HTMLElement, label: string) =>
  within(scope).getByText(label, { selector: "dt" }).nextElementSibling?.textContent ?? "";

/** The shown panel alone, for a key that never ends (no fixture makes one). */
const mountShown = async (ends: string | null) => {
  boot();
  const ctx = capture();
  const held = holdSecret("hdy_" + "f3".repeat(26), ctx);
  if (!held) throw new Error("no held secret");
  const Root = () => <ShownPanel held={held} ctx={ctx} where="Personal" ends={ends} />;
  const router = createRouter({ routeTree: createRootRoute({ component: Root }), history: createMemoryHistory({ initialEntries: ["/"] }) });
  await act(async () => {
    render(<RouterProvider router={router} />);
    await router.load();
  });
};

const openShown = async () => {
  await renderPage(page);
  await screen.findByText("ci-deploy");
  await userEvent.click(screen.getAllByRole("button", { name: strings["action.new"] })[0] as HTMLElement);
  await userEvent.type(await screen.findByLabelText(strings["nk.name"]), "ci");
  await userEvent.click(screen.getByRole("button", { name: strings["nk.go"] }));
  await screen.findByText(strings["sh.warn"]);
  return screen.getByRole("dialog");
};

describe("keys: shown-once panel", () => {
  it("one calm Verdict says to copy it now (no coloured phrase); no subtitle under the title", async () => {
    const d = await openShown();
    const plate = within(d).getByRole("group", { name: strings["sh.verdict"] });
    expect(plate).toHaveTextContent(strings["sh.warn"]);
    expect(plate.querySelectorAll("[data-verdict-mark]")).toHaveLength(0);
    expect(within(d).queryByRole("note")).toBeNull();
  }, 30000);

  it("one Copy for the key, and it is the drawer's one accent button (the footer's close steps back)", async () => {
    const d = await openShown();
    const copies = within(d).getAllByRole("button", { name: strings["action.copyKey"] });
    expect(copies).toHaveLength(1);
    expect(copies[0]).toHaveAttribute("data-variant", "primary");
    const accents = [...d.querySelectorAll('button[data-variant="primary"]')];
    expect(accents).toEqual([copies[0]]);
    expect(within(d).getByRole("button", { name: strings["sh.close"] })).not.toHaveAttribute("data-variant", "primary");
  }, 30000);

  it("where it works and when it ends are facts on the Verdict plate, in view without a press", async () => {
    const d = await openShown();
    const plate = within(d).getByRole("group", { name: strings["sh.verdict"] });
    // The plate's name is not the drawer title's words again.
    expect(strings["sh.title"].toLowerCase()).not.toContain(strings["sh.verdict"].toLowerCase());
    expect(within(d).queryByRole("button", { name: strings["sh.about"] })).toBeNull();
    expect(factValue(plate, strings["sh.works"])).not.toBe("");
    // The made key ends in 90 days (fixtures): its date, in UTC.
    expect(factValue(plate, strings["sh.ends"])).toMatch(endsDated);
  }, 30000);

  it("a key with no end date says so", async () => {
    await mountShown(null);
    const plate = screen.getByRole("group", { name: strings["sh.verdict"] });
    expect(factValue(plate, strings["sh.ends"])).toBe(strings["sh.endsNever"]);
    expect(factValue(plate, strings["sh.works"])).toBe("Personal");
  });

  it("how to use the key is one closed Why that ends with the page's answer", async () => {
    const d = await openShown();
    const fold = within(d).getByRole("button", { name: strings["sh.guide"] });
    expect(fold).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(fold);
    expect(within(d).getByText(strings["sh.guideA"])).toBeInTheDocument();
    expect(within(d).getByRole("link", { name: strings["faq.whatIsKey.q"] })).toBeInTheDocument();
  }, 30000);

  it("the one Copy puts the key on the clipboard without Show, and `c` in the panel presses it", async () => {
    const write = vi.fn(async (_: string) => undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText: write }, configurable: true });
    const d = await openShown();
    await userEvent.click(within(d).getByRole("button", { name: strings["action.copyKey"] }));
    await waitFor(() => expect(write).toHaveBeenCalledTimes(1));
    expect(write.mock.calls[0]![0]).toMatch(/^hdy_/);
    expect(d.textContent).not.toContain(write.mock.calls[0]![0]);
    // the shortcut, once the button reads "Copy key" again
    await waitFor(() => within(d).getByRole("button", { name: strings["action.copyKey"] }), { timeout: 5000 });
    const plate = within(d).getByRole("group", { name: strings["sh.verdict"] });
    plate.setAttribute("tabindex", "-1");
    plate.focus();
    await userEvent.keyboard("c");
    await waitFor(() => expect(write).toHaveBeenCalledTimes(2));
  }, 30000);

  it("Done steps back for the one Copy (secondary) and asks first, as Esc does", async () => {
    const d = await openShown();
    const done = within(d).getByRole("button", { name: strings["sh.close"] });
    expect(done).toHaveAttribute("data-variant", "secondary");
    await userEvent.click(done);
    expect(await screen.findByText(strings["sh.closeAsk"])).toBeInTheDocument();
    await userEvent.click(within(screen.getByRole("alert")).getByRole("button", { name: strings["sh.closeNow"] }));
    await waitFor(() => expect(screen.queryByText(strings["sh.warn"])).toBeNull());
  }, 30000);

  it("the copy drawer's shown foot is the same: Done is secondary beside the one Copy, no Cancel, and it asks first", async () => {
    await renderPage(page);
    await waitFor(async () => {
      const row = screen.getByRole("row", { name: /ci-deploy/ });
      if (row.getAttribute("aria-selected") !== "true") await userEvent.click(row);
      expect(screen.getByRole("row", { name: /ci-deploy/ })).toHaveAttribute("aria-selected", "true");
    });
    await userEvent.click(await screen.findByRole("button", { name: strings["act.copy"] }));
    const d = await screen.findByRole("dialog");
    await userEvent.click(within(d).getByRole("button", { name: strings["cp.go"] }));
    await within(d).findByText(strings["sh.warn"]);
    const done = within(d).getByRole("button", { name: strings["sh.close"] });
    expect(done).toHaveAttribute("data-variant", "secondary");
    expect(within(d).queryByRole("button", { name: /^Cancel$/ })).toBeNull();
    await userEvent.click(done);
    expect(await screen.findByText(strings["sh.closeAsk"])).toBeInTheDocument();
    await userEvent.click(within(screen.getByRole("alert")).getByRole("button", { name: strings["sh.closeNow"] }));
    await waitFor(() => expect(screen.queryByText(strings["sh.warn"])).toBeNull());
  }, 30000);
});
