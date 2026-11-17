// links.create (Home's first steps): /keys?new=1 opens the New key drawer once and drops the key from the
// address. The header's actions (AgentHint + a tab's action) wrap within the page header on a narrow phone.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { renderPage, screen, waitFor, within } from "@app/testing";
import { links } from "./links";
import page from "./page";
import strings from "./strings.en.json";

const search = (r: { router: { state: { location: { search: unknown } } } }) =>
  r.router.state.location.search as Record<string, string>;

describe("keys: create link and header", () => {
  it("links.create opens the New key drawer and leaves the address", async () => {
    const r = await renderPage(page, { path: links.create });
    const d = await screen.findByRole("dialog", {}, { timeout: 8000 });
    expect(within(d).getByRole("heading", { name: strings["nk.title"] })).toBeInTheDocument();
    await waitFor(() => expect(search(r)).not.toHaveProperty("new"));
  });

  it("the header's actions wrap within the page header", () => {
    const css = readFileSync(join(import.meta.dirname, "parts", "keys.module.css"), "utf8");
    const rule = /\.headActions\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(rule).toMatch(/flex-wrap:\s*wrap/);
    expect(rule).toMatch(/max-width:\s*100cqi/);
    const frame = readFileSync(join(import.meta.dirname, "parts", "Frame.tsx"), "utf8");
    expect(frame).toMatch(/className=\{s\.headActions\}[\s\S]*<AgentHint page="keys" facts=\{agentFacts\} \/>/);
  });
});
