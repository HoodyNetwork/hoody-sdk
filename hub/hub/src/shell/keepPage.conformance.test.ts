// A page kept loaded while hidden keeps its state but its effects stop, so it must not use what
// wipes or guards on a route change through effects, or reads the router itself (shell/pageHost.tsx useKeepPage).
// usePendingToast is allowed: hiding runs its cleanup as leaving does (the toast shows while the person is away), and
// the same place shown again closes the toast it opened once it shows the outcome inline or the outcome settled; a place
// drawn without its outcome line says so (`inline` false) and the toast stays (kit/forms/Outcome.tsx, Outcome.keep.test.tsx).
// Every page whose files call useKeepPage is checked here, as text: the shell never imports a page module.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const PAGES = path.resolve(__dirname, '../pages');
const NOT_FOR_KEPT = ['SecretInput', 'SecretField', 'OtpField', 'SshKeyHelp', 'type="password"', "type: 'password'", 'useWipeOn', 'useDataView', 'useDrawerParam'];
// The kit's done flash (useDoneFlash: FormFooter, OutcomeSlot, SettingRow, SettingGroup rows) is safe on a kept page: a
// show runs its effect again for the same outcome and shows only the time left (kit/forms/doneflash.keep.test.tsx).
// One exception: the Board's browser form wipes its proxy password itself when the kept Board
// hides (an effect cleanup), proven by pages/board/parts/BrowserForm.test.tsx "a kept Board hidden and shown again".
const KEPT_EXCEPTIONS: Record<string, readonly string[]> = { 'board/parts/BrowserForm.tsx': ['SecretInput'] };

// The kit's QR button wipes a shown secret on a route change (useWipeOn): a kept page may show only a QR that is not
// one (`secret={false}`, a link meant to be shared).
const SECRET_QR = /<QrButton\b(?![^>]*\bsecret=\{false\})/;

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) return sources(p);
    return /\.tsx?$/.test(name) && !/\.(test|spec)\.tsx?$/.test(name) ? [p] : [];
  });
}

/** What a page's files use of what a kept page must not use, as `file: name`; nothing when no file calls useKeepPage. */
function problems(files: readonly { f: string; src: string }[]): string[] {
  if (!files.some(({ src }) => /\buseKeepPage\(/.test(src))) return [];
  return files.flatMap(({ f, src }) => [
    ...NOT_FOR_KEPT.filter((n) => src.includes(n) && !KEPT_EXCEPTIONS[f.split(path.sep).join('/')]?.includes(n)).map((n) => `${f}: ${n}`),
    ...(SECRET_QR.test(src) ? [`${f}: QrButton`] : []),
  ]);
}

describe('pages kept loaded use nothing that needs their effects on a route change', () => {
  it.each(readdirSync(PAGES).filter((d) => statSync(path.join(PAGES, d)).isDirectory()))('%s', (dir) => {
    const files = sources(path.join(PAGES, dir)).map((f) => ({ f: path.relative(PAGES, f), src: readFileSync(f, 'utf8') }));
    expect(problems(files)).toEqual([]);
  });

  it('the check finds a use in any file of a page that keeps itself, and passes a page that does not keep', () => {
    const view = { f: 'x/view.tsx', src: 'useKeepPage(on);' };
    const form = { f: 'x/parts/Form.tsx', src: '<SecretInput label="Token" /> <TextField type="password" />' };
    expect(problems([view, form])).toEqual(['x/parts/Form.tsx: SecretInput', 'x/parts/Form.tsx: type="password"']);
    expect(problems([form])).toEqual([]);
    // A QR of a secret (the default) is not for a kept page; one of a link meant to be shared is.
    expect(problems([view, { f: 'x/parts/Share.tsx', src: '<QrButton url={u} name="Box" />' }])).toEqual(['x/parts/Share.tsx: QrButton']);
    expect(problems([view, { f: 'x/parts/Share.tsx', src: '<QrButton url={u} name="Box" secret />' }])).toEqual(['x/parts/Share.tsx: QrButton']);
    expect(problems([view, { f: 'x/parts/Share.tsx', src: '<QrButton url={u} name="Box" secret={false} size="sm" />' }])).toEqual([]);
  });
});
