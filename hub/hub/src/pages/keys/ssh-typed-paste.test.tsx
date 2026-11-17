// The SSH key box and pieces of a private key that carry no armour words (ssh-logic secretLike), and the box on the
// web: a key body pasted with no BEGIN line is refused and cleared; after a refusal only what starts as a public key
// line is taken, until the editor is opened again. The key text below is made up: it is no key.
import { describe, expect, it } from "vitest";
import { renderPage, screen, userEvent, waitFor } from "@app/testing";
import page from "./page";
import { secretLike, startsLikePublicKey } from "./ssh-logic";
import strings from "./strings.en.json";

const MARK = "FAKEnotAkey";
const line = (n: number): string => `${MARK}LINE${n}`.padEnd(70, "x");
const PUB = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFakeFixtureKeyOnly0000000000000000 ana@laptop";
const box = () => screen.getByLabelText(strings["ssh.field"]) as HTMLTextAreaElement;

describe("ssh-logic: what the key box must not keep", () => {
  it("knows the start of a public key line, typed or whole", () => {
    for (const ok of ["", "  ", "s", "ssh-", "ssh-ed2", "ecdsa-sha2-nistp", "ecdsa-sha2-nistp256 AAAA", ` ${PUB}`, "ssh-rsa AAAA"])
      expect(startsLikePublicKey(ok), ok).toBe(true);
    for (const no of ["-", "b3Bl", "hello", "sshx", "AAAAC3Nza"]) expect(startsLikePublicKey(no), no).toBe(false);
  });
  it("refuses the armour words anywhere, and a long base64 run that is not a public key line", () => {
    expect(secretLike(["-----BEGIN OPENSSH", "PRIVATE KEY-----"].join(" "), false)).toBe(true);
    expect(secretLike(`${PUB}\n-----END OPENSSH ${"PRIVATE"} KEY-----`, false)).toBe(true);
    expect(secretLike(line(1), false)).toBe(true);
    expect(secretLike(`-----\n${line(1)}`, false)).toBe(true);
    expect(secretLike(line(1).slice(0, 39), false)).toBe(false);
    expect(secretLike("hello world, this is not a key at all, just words", false)).toBe(false);
    expect(secretLike(PUB, false)).toBe(false);
    expect(secretLike("", false)).toBe(false);
  });
  it("strict: only what starts as a public key line passes", () => {
    for (const no of ["-", "-----", "hello", `${MARK}LAST==`, line(1).slice(0, 5)]) expect(secretLike(no, true), no).toBe(true);
    for (const ok of ["", "ssh-", PUB, PUB.slice(0, 20)]) expect(secretLike(ok, true), ok).toBe(false);
  });
});

describe("keys: pieces of a private key pasted into the SSH key box", () => {
  it("a body with no BEGIN line is refused; then only a public key line is taken, until the editor is opened again", async () => {
    await renderPage(page);
    await userEvent.click(await screen.findByRole("tab", { name: new RegExp(strings["tab.ssh"]) }));
    await userEvent.click(await screen.findByRole("button", { name: strings["ssh.replace"] }));
    await userEvent.click(box());
    // Before any refusal other text stays, for Save to refuse.
    await userEvent.paste("hello");
    expect(box()).toHaveValue("hello");
    await userEvent.clear(box());
    await userEvent.paste(`${line(1)}\n${line(2)}`);
    expect(await screen.findByText(strings["ssh.e.private"])).toBeInTheDocument();
    await waitFor(() => expect(box()).toHaveValue(""));
    expect(document.body.textContent ?? "").not.toContain(MARK);
    await waitFor(() => expect(box()).toHaveFocus());
    // Strict now: a short piece with no long run is refused too.
    await userEvent.paste(`${MARK}LAST==`);
    await waitFor(() => expect(box()).toHaveValue(""));
    expect(screen.getByText(strings["ssh.e.private"])).toBeInTheDocument();
    await waitFor(() => expect(box()).toHaveFocus());
    await userEvent.paste(PUB);
    expect(box()).toHaveValue(PUB);
    expect(screen.queryByText(strings["ssh.e.private"])).toBeNull();
    // Opened again, the box is as at first.
    await userEvent.click(screen.getByRole("button", { name: strings["ssh.cancel"] }));
    await userEvent.click(await screen.findByRole("button", { name: strings["ssh.replace"] }));
    await userEvent.click(box());
    await userEvent.paste("hello");
    expect(box()).toHaveValue("hello");
  }, 40000);
});
