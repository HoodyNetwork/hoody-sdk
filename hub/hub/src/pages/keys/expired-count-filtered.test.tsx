// Vitest: the count's "· N expired" part counts the whole realm, so a search shows the
// matched count alone.
import { describe, expect, it } from "vitest";
import { renderPage, screen } from "@app/testing";
import userEvent from "@testing-library/user-event";
import page from "./page";

// The count line's words: "N keys · M expired" on the whole list (the fixture holds an expired key), "N key(s)" alone.
const withExpired = /^\d+ keys? · \d+ expired$/;
const alone = /^\d+ keys?$/;

describe("keys: the expired count beside a search", () => {
  it("shows the expired part on the whole list only", async () => {
    // All realms: the web fixture's default realm (Personal) holds no expired key; old-build-bot works everywhere.
    await renderPage(page, { realm: "all" });
    expect(await screen.findByText(withExpired, {}, { timeout: 10000 })).toBeInTheDocument();
    await userEvent.type(screen.getAllByRole("searchbox")[0] as HTMLElement, "ci-deploy");
    expect((await screen.findAllByText(alone, {}, { timeout: 10000 })).length).toBeGreaterThan(0);
    expect(screen.queryByText(withExpired)).toBeNull();
  });
});
