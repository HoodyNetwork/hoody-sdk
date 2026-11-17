// shot-guard.ts: a stopped page is never written as a page shot (the shot would be the
// crash receipt drawn as PNGs). Before a page shot, the writer asks `stoppedFrame`; when the app exited or the screen
// holds the failed-mount line (src/term/entry.live.ts failureText), it writes `<name>.crash.txt` instead, removes any
// earlier `<name>.png`/`.txt` of that case, and the case fails. A screen holding a fixture secret of the page is never
// written either (secretShot / writeSecretRefusal: `<name>.secret.txt` with the reason only), and crash text is redacted.
import fs from 'node:fs';
import path from 'node:path';

/** The line a failed mount leaves (entry.live.ts failureText): "hoody hub: stopped…", "could not start", "closed, but…". */
export const STOPPED_LINE = /^hoody hub: (stopped|could not start|closed, but did not clean up)/m;

/** Why this frame is not a page, or null when it is one. */
export function stoppedFrame(text: string, exit: { code?: number | null; signal?: string | null } | null): string | null {
  const m = STOPPED_LINE.exec(text);
  if (m) {
    const line = text.slice(m.index).split('\n')[0]!.trim();
    return line;
  }
  if (exit) return `the app exited (${exit.signal ? `signal ${exit.signal}` : `code ${exit.code}`}) before the shot`;
  return null;
}

const SHOT_EXTS = ['.png', '.txt', '.cells.json', '.ansi', '.browser.txt', '.crash.txt', '.secret.txt'];
const clearShot = (dir: string, name: string): void => { for (const ext of SHOT_EXTS) fs.rmSync(path.join(dir, name + ext), { force: true }); };

/** Writes the crash text in place of the shot and removes the case's earlier shot files. Returns the crash file.
 *  `redact` (the secrets gate's redaction for the page) runs over everything written: a crash screen may show a secret. */
export function writeCrash(dir: string, name: string, text: string, why: string, redact: (t: string) => string = (t) => t): string {
  clearShot(dir, name);
  const file = path.join(dir, name + '.crash.txt');
  fs.writeFileSync(file, redact(`NOT A PAGE SHOT: ${why}\n\n${text}`));
  return file;
}

/** Why this screen may not be written as a shot (PNG or text) because it holds one of the page's fixture secrets
 *  (scripts/term/secrets.ts pageNeedles + hitOf, via golden-guard.ts secretToolsFor), or null. The value is never named. */
export function secretShot(screen: string, sec: { needles: readonly string[]; hitOf(n: string, hay: string): string | null }): string | null {
  for (const n of sec.needles) {
    const how = sec.hitOf(n, screen);
    if (how) return `the screen holds a fixture secret (${how} match; the value is never printed)`;
  }
  return null;
}

/** In place of a shot whose screen holds a secret: removes the case's earlier files and writes `<name>.secret.txt`
 *  with the reason only (no screen text). Returns that file. */
export function writeSecretRefusal(dir: string, name: string, why: string): string {
  clearShot(dir, name);
  const file = path.join(dir, name + '.secret.txt');
  fs.writeFileSync(file, `NOT WRITTEN: ${why}. Blank it in the page (SecretField / the reveal flow); run \`bun scripts/term/secrets.ts <page>\`.\n`);
  return file;
}
