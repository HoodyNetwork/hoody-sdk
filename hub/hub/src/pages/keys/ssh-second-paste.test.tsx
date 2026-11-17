// Keys > SSH key > Replace, on the web: a private key pasted by mistake never stays in the box, however often it is
// pasted, and the person stays in the field. (The terminal's editor kept a second paste on screen:
// ssh-second-paste.term.test.tsx.) The key text below is made up: it is no key.
import { describe, expect, it } from "vitest";
import { renderPage, screen, userEvent, waitFor } from "@app/testing";
import page from "./page";
import strings from "./strings.en.json";

const fakePrivate = (body: string): string =>
  ["-----BEGIN OPENSSH", "PRIVATE KEY-----", body, "-----END OPENSSH", "PRIVATE KEY-----"].join(" ");
const PUB = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFakeFixtureKeyOnly0000000000000000 ana@laptop";
const box = () => screen.getByLabelText(strings["ssh.field"]) as HTMLTextAreaElement;

describe("keys: a private key pasted into the SSH key box", () => {
  it("is refused and cleared on every paste, and the next paste lands in the same field", async () => {
    await renderPage(page);
    await userEvent.click(await screen.findByRole("tab", { name: new RegExp(strings["tab.ssh"]) }));
    await userEvent.click(await screen.findByRole("button", { name: strings["ssh.replace"] }));
    await userEvent.click(box());
    for (const body of ["FAKEFAKEnotAkeyAAAA1111", "FAKEFAKEnotAkeyBBBB2222", "FAKEFAKEnotAkeyAAAA1111"]) {
      // No click between pastes: each lands where the focus is.
      await userEvent.paste(fakePrivate(body));
      expect(await screen.findByText(strings["ssh.e.private"])).toBeInTheDocument();
      await waitFor(() => expect(box()).toHaveValue(""));
      expect(document.body.textContent ?? "").not.toContain(body);
      await waitFor(() => expect(box()).toHaveFocus());
    }
    await userEvent.paste(PUB);
    expect(box()).toHaveValue(PUB);
    expect(screen.queryByText(strings["ssh.e.private"])).toBeNull();
  }, 40000);
});
