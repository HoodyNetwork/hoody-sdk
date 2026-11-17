// Keys > API keys opens on active keys: with no State in the address the list shows Active
// only, the chip says so, and the address carries it. A State in the address wins; a key opened by a link is never
// hidden by the default; clearing the chip shows every key and the default does not come back.
// Keys > the SSH tab is "SSH keys", like "API keys".
import { describe, expect, it } from "vitest";
import { renderPage, screen, waitFor } from "@app/testing";
import userEvent from "@testing-library/user-event";
import page from "./page";
import strings from "./strings.en.json";
import { keys } from "./fixtures";

const row = (name: string) => screen.queryByRole("row", { name: new RegExp(name) });
const listed = async (name: string) => waitFor(() => expect(row(name)).not.toBeNull(), { timeout: 10000 });

describe("keys: the State filter starts on Active", () => {
  it("shows active keys only, with the State chip set to Active", async () => {
    const view = await renderPage(page);
    await listed("ci-deploy");
    await waitFor(() => expect(row("laptop-cli")).toBeNull(), { timeout: 10000 });
    expect(row("old-build-bot")).toBeNull();
    expect(row("sdk-readonly")).not.toBeNull();
    expect(screen.getByRole("button", { name: `Clear ${strings["filter.state"]}` })).toBeInTheDocument();
    expect(view.router.state.location.search).toMatchObject({ state: "active" });
  });

  it("keeps a State the address names", async () => {
    await renderPage(page, { path: "/keys?state=paused" });
    await listed("laptop-cli");
    expect(row("ci-deploy")).toBeNull();
    expect(row("old-build-bot")).toBeNull();
  });

  it("keeps the page a link names: the default is not a filter change of the person's", async () => {
    const view = await renderPage(page, { path: "/keys?sort=-name&page=2", state: "long" });
    await waitFor(() => expect(view.router.state.location.search).toMatchObject({ state: "active" }), { timeout: 10000 });
    expect(view.router.state.location.search).toMatchObject({ page: "2", sort: "-name" });
  });

  it("a State the person picks still goes back to page 1", async () => {
    const view = await renderPage(page, { path: "/keys?state=active&page=2", state: "long" });
    await screen.findByRole("button", { name: `Clear ${strings["filter.state"]}` }, { timeout: 10000 });
    await userEvent.click(screen.getByRole("button", { name: `Clear ${strings["filter.state"]}` }));
    await waitFor(() => expect(view.router.state.location.search).not.toHaveProperty("state"), { timeout: 10000 });
    expect(view.router.state.location.search).not.toHaveProperty("page");
  });

  it("never hides a key opened by a link", async () => {
    const paused = keys.find((k) => k.alias === "laptop-cli")!;
    await renderPage(page, { path: `/keys?sel=${paused.prefix}.${paused.id.slice(-6)}` });
    await listed("laptop-cli");
    expect(screen.queryByRole("button", { name: `Clear ${strings["filter.state"]}` })).toBeNull();
  });

  it("clearing the chip shows every key, and the default stays off", async () => {
    await renderPage(page);
    await listed("ci-deploy");
    await userEvent.click(await screen.findByRole("button", { name: `Clear ${strings["filter.state"]}` }, { timeout: 10000 }));
    await listed("laptop-cli");
    await listed("old-build-bot");
    await new Promise((r) => setTimeout(r, 300));
    expect(row("laptop-cli")).not.toBeNull();
  });
});

describe("keys: tab names", () => {
  it('the SSH tab reads "SSH keys", plural like "API keys"', async () => {
    await renderPage(page);
    expect(await screen.findByRole("tab", { name: /^SSH keys$/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /^API keys/ })).toBeInTheDocument();
  });
});
