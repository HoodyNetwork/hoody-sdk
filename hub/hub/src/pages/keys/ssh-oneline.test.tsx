// The SSH key box takes ONE public key line. A .pub line with the body of a private key pasted under it (no BEGIN
// line) started like a public key, so it stayed on screen and Save sent the whole text. Now a further line is judged
// like the first (refused and cleared when it may be key material), and Save sends nothing but one public key line.
// The key text below is made up: it is no key.
import { describe, expect, it } from "vitest";
import { renderPage, screen, userEvent, waitFor } from "@app/testing";
import page from "./page";
import { sent, sshSetBodies } from "./fixtures";
import { checkSshKey, secretLike, startsLikePublicKey } from "./ssh-logic";
import strings from "./strings.en.json";

const MARK = "FAKEnotAkey";
const line = (n: number): string => `${MARK}LINE${n}`.padEnd(70, "x");
const LAST = `${MARK}LAST==`;
const PUB = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFakeFixtureKeyOnly0000000000000000 ana@laptop";
const PUB2 = "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABFakeFixtureKeyOnly1111111111111111 ana@desk";
// The exact shape: the .pub line, then the private key's body with no armour lines.
const SHAPE = [PUB, line(1), line(2), line(3), LAST].join("\n");
const box = () => screen.getByLabelText(strings["ssh.field"]) as HTMLTextAreaElement;

describe("ssh-logic: one public key is one line", () => {
  it("takes one line, with blank lines and spaces around it", () => {
    for (const ok of [PUB, `${PUB}\n`, `${PUB}\r\n`, `${PUB}\r\n\r\n\n`, `\n\n  ${PUB}  \n\n`, `${PUB}\t`, PUB.split(" ").slice(0, 2).join(" "), PUB2, `${PUB} two words`])
      expect(checkSshKey(ok), JSON.stringify(ok)).toEqual({ ok: true, key: ok.trim() });
  });
  it("refuses a private key body under a public key line as a private key, LF or CRLF or any other line end", () => {
    for (const sep of ["\n", "\r\n", "\r", "\u2028", "\u2029", "\u0085", "\v", "\f"]) {
      const text = SHAPE.split("\n").join(sep);
      expect(checkSshKey(text), JSON.stringify(sep)).toEqual({ ok: false, code: "private" });
      expect(secretLike(text, false), JSON.stringify(sep)).toBe(true);
    }
    expect(checkSshKey(`${PUB}\n\n${line(1)}`)).toEqual({ ok: false, code: "private" });
    expect(secretLike(`${PUB}\n\n${line(1)}`, false)).toBe(true);
    expect(secretLike(`\n${PUB}\n${line(1)}`, false)).toBe(true);
  });
  it("refuses two public keys and a note under the key: not one key, nothing to clear at once", () => {
    for (const no of [`${PUB}\n${PUB2}`, `${PUB}\r\n${PUB2}\r\n`, `${PUB}\nhello`, `${PUB}\n${LAST}`]) {
      expect(checkSshKey(no), JSON.stringify(no)).toEqual({ ok: false, code: "notkey" });
      expect(secretLike(no, false), JSON.stringify(no)).toBe(false);
    }
    // Once the box has refused a private key, a further line that is no public key line is refused too.
    expect(secretLike(`${PUB}\nhello`, true)).toBe(true);
    expect(secretLike(`${PUB}\n${LAST}`, true)).toBe(true);
    expect(secretLike(`${PUB}\n${PUB2}`, true)).toBe(false);
    expect(secretLike(`${PUB}\n\n`, true)).toBe(false);
  });
  it("a body after a public key type must be a public key's", () => {
    for (const ok of ["ssh-ed25519 ", "ssh-ed25519 A", "ssh-ed25519 AAA", "ssh-rsa\tAAAAB3", "ecdsa-sha2-nistp256 AAAAE2"]) expect(startsLikePublicKey(ok), ok).toBe(true);
    for (const no of ["ssh-ed25519 b", "ssh-ed25519 b3Blbn", "ssh-rsa MIIE", "ecdsa-sha2-nistp521 AAAB"]) expect(startsLikePublicKey(no), no).toBe(false);
    expect(secretLike(`ssh-ed25519 ${line(1)}`, false)).toBe(true);
    expect(secretLike("ssh-ed25519 b3Bl", false)).toBe(false);
    expect(secretLike("ssh-ed25519 b3Bl", true)).toBe(true);
    expect(checkSshKey(`ssh-ed25519 ${line(1)}`)).toEqual({ ok: false, code: "notkey" });
  });
  // Only a run of 64+ key body characters in the comment is a private key line (OpenSSH 70, PEM 64): real comments with
  // a shorter run are still taken; a private body joined onto the line (a one-line paste) is still refused.
  it("takes real comments that hold a shorter run of key body characters", () => {
    const NC = PUB.split(" ").slice(0, 2).join(" ");
    for (const comment of ["SHA256:47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU ana", "ana@laptop 9f86d081884c7d659a2feaa0c55ad015a3bf4f1b", "/Users/johnappleseed/Documents/Keys/Production", "MyCompanyProductionDeploymentKeyForGithubActions", "averyveryverylongusernamewithoutanydotsatall1234@example.com"]) {
      const ok = `${NC} ${comment}`;
      expect(checkSshKey(ok), ok).toEqual({ ok: true, key: ok });
    }
    const BODY = ["b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAtzc2gtZW", line(2), LAST];
    for (const joined of [[PUB, ...BODY].join(""), [NC, ...BODY].join(""), [PUB, ...BODY].join(" "), [NC, ...BODY].join(" "), `${PUB} ${line(1)}`, `${NC} ana@laptop ${"A".repeat(64)}`])
      expect(checkSshKey(joined), joined).toEqual({ ok: false, code: "private" });
  });
  // A PEM private key body glued with no separator onto a real (unpadded) ed25519 public body passed KEY_RE: the key
  // body is now read as the wire blob of its type, and a long leftover is a private key. Real keys of each type: ok.
  it("refuses a private key body glued onto a real public key body; real keys of each type are taken", () => {
    const ED = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIIeWgk0NqcsBos3j2bM4U3Xpses/AuBLHQuHNq5lveFW me@laptop";
    const REAL = [ED, "ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYAAAAIbmlzdHAyNTYAAABBBLaZi7nyQbIT+Ao8/IWTidikRezWT/bEsVZzpsJxTWVZzIwdPEgNDWQAo4z0hWpOJ0052X5TER8SWx0yrgclOiU= me@laptop", "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABgQC9tdBoEaNbAG4iU3Zi4Tmzx0Zfi1YbVHkoabx84gCGXAPJ+F7uKiA7DgncgmHfwN3sdLzjDAonnnUeMTU8jz1cL/Y+52W0leTQeXflXfcUVZQyZA6gyA8FD3Iq7z8N2TLWGrFMtf8TGguHjdjaSdcUBDQkHt7vybuKBXm5bb0nQOPlz43QILKn6LU2ppyHowjt/LkcNTYLhzX0m1xLiklKADRtRan1aXzeuFmV1OzZx/OpJmKzMLQhRoLVf877BIekPjXkw8umiuRsQxpNw6WdY0yr25RGu76UMaXWT+e8YPwW2kwQQeA/GGGIsJ2ZJGvIKUWdzEK85d0F+ib1odvlaW2NCW8icJJFhugYlIlGHgTEIk9fJ9rB7nRRdyvc/h2jrq4o1qZ9oNy9sfQoTA5Kh0am0NkbUrgFCZN1rXJeJzGJ+pkhU4aM2eIBPKorR3wC0+NnyRoF00Mp8ivVJ1LTVr11xbFrS4xXGgnHsQdjUH8iga5lHyMb9Za7L1LTjh8= me@laptop"];
    for (const ok of REAL) expect(checkSshKey(ok), ok).toEqual({ ok: true, key: ok });
    const pemDirect = `${ED.split(" ").slice(0, 2).join(" ")}MIIEowIBAAKCAQEA${"FakePemBodyNotAKey".repeat(4)}`;
    expect(checkSshKey(pemDirect), pemDirect).toEqual({ ok: false, code: "private" });
    // A glued text of any length is read: 1 mod 4 (no whole-text decode) and cut short by 1-3 characters.
    for (const cut of ["x", "xy", "xyz"]) expect(checkSshKey(pemDirect + cut), cut).toEqual({ ok: false, code: "private" });
    // A glued body that breaks base64: its last 3 characters cut (1 mod 4), or a stray "=" left by a cut.
    for (const glued of [pemDirect.slice(0, -3), `${pemDirect}AB=`]) expect(checkSshKey(glued), glued).toEqual({ ok: false, code: "private" });
    const edBody = ED.split(" ").slice(0, 2).join(" ");
    for (const short of [`${edBody}AAAAA`, `${edBody}A=`]) expect(checkSshKey(short), short).toEqual({ ok: false, code: "notkey" });
    expect(checkSshKey(`${ED.split(" ").slice(0, 2).join(" ")}AAAA`)).toEqual({ ok: false, code: "notkey" });
  });
  // The space before the comment is ONE character: a run of spaces both before and inside the comment made the check
  // try every split (50,000 spaces and a second line froze the page for seconds).
  it("answers a long run of spaces before a second line at once", () => {
    const text = `${PUB.split(" ").slice(0, 2).join(" ")}${" ".repeat(50_000)}x\nmore`;
    const t0 = performance.now();
    expect(checkSshKey(text)).toEqual({ ok: false, code: "notkey" });
    expect(secretLike(text, true)).toBe(true);
    expect(performance.now() - t0).toBeLessThan(500);
  });
});

describe("keys: a public key line with a private key body under it, in the SSH key box", () => {
  it("is refused and cleared at once; two keys are refused on Save; one line with blank lines after it is saved", async () => {
    // sshMakeUse: the computer holds no key, and every save that reaches the server is counted and recorded.
    sshSetBodies.length = 0;
    await renderPage(page, { state: "sshMakeUse" });
    await userEvent.click(await screen.findByRole("tab", { name: new RegExp(strings["tab.ssh"]) }));
    await userEvent.click(await screen.findByRole("button", { name: strings["ssh.set"] }));
    const before = sent.setSsh;
    await userEvent.click(box());
    await userEvent.paste(SHAPE);
    expect(await screen.findByText(strings["ssh.e.private"])).toBeInTheDocument();
    await waitFor(() => expect(box()).toHaveValue(""));
    expect(document.body.textContent ?? "").not.toContain(MARK);
    await waitFor(() => expect(box()).toHaveFocus());
    // Two public keys stay for Save to refuse: nothing is sent and the box is emptied.
    await userEvent.paste(`${PUB}\n${PUB2}`);
    expect(box()).toHaveValue(`${PUB}\n${PUB2}`);
    await userEvent.click(screen.getByRole("button", { name: strings["ssh.save"] }));
    expect(await screen.findByText(strings["ssh.e.notkey"])).toBeInTheDocument();
    await waitFor(() => expect(box()).toHaveValue(""));
    expect(sent.setSsh).toBe(before);
    // One line, CRLF and blank lines after it: saved.
    await userEvent.click(box());
    await userEvent.paste(`${PUB}\r\n\r\n`);
    await userEvent.click(screen.getByRole("button", { name: strings["ssh.save"] }));
    await waitFor(() => expect(sent.setSsh).toBe(before + 1));
    expect(sshSetBodies).toEqual([PUB]);
  }, 40000);
});
